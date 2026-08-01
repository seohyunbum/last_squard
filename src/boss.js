/* 최종 보스 패턴 — 구역 대장과 달리 여러 패턴을 번갈아 쓴다.
 *
 * 체력이 줄면 쓸 수 있는 패턴이 늘어난다(단계). 패턴은 정해진 순서로 돌아가므로
 * 아이가 "다음은 이거" 를 배울 수 있다. 시작할 때 이름을 알려 주고, 사이에 숨을 돌린다.
 *
 *   소환  — 부하를 한 줄로 뽑는다. 정리해야 한다.
 *   부채꼴 — 도로를 덮는 볼트 부채. 반드시 한 칸이 비어 있다. 그 구멍으로 들어가라.
 *   돌진  — 부대 쪽으로 달려든다. 옆으로 피해라.
 *   난사  — 볼트를 좌우로 훑는다. 훑는 방향 앞으로 달려라.
 *
 * 규칙만 다룬다 — 그리기는 render 가 boss.pattern 을 읽어서 한다.
 */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});
  const U = LW.util;

  /** 남은 체력 비율에 맞는 단계(0부터). 낮을수록 험해진다. */
  function phaseOf(boss) {
    const phases = LW.config.finalBoss.phases;
    const ratio = boss.hp / Math.max(1, boss.maxHp);
    let idx = 0;
    for (let i = 0; i < phases.length; i++) if (ratio <= phases[i].upTo) idx = i;
    return idx;
  }

  /** 이번 단계에서 쓸 수 있는 패턴 이름 목록 */
  function poolAt(boss) {
    return LW.config.finalBoss.phases[phaseOf(boss)].use;
  }

  function label(id) {
    return LW.config.finalBoss.labels[id] || id;
  }

  /** 다음 패턴으로 넘어간다 — 단계마다 그 단계의 목록을 처음부터 차례로 돈다.
   *  (순번을 단계 사이에 이어 쓰면 어떤 패턴은 한 번도 안 나온다.) */
  function nextPattern(boss) {
    const phase = phaseOf(boss);
    if (phase !== boss.phaseSeen) {
      boss.phaseSeen = phase;
      boss.patternTurn = -1; // 새 단계는 목록의 처음부터
    }
    const pool = poolAt(boss);
    boss.patternTurn = (boss.patternTurn + 1) % pool.length;
    const id = pool[boss.patternTurn];
    const cfg = LW.config.finalBoss;
    boss.pattern = id;
    boss.patternLabel = label(id);
    boss.patternTime = 0;
    boss.patternStep = 0;
    boss.stepTimer = 0;
    // 부채꼴 구멍은 매번 다른 자리 — 같은 데 서 있으면 안 되게
    boss.gapLane = (boss.gapLane + 3) % cfg.fan.bolts;
    boss.sweepDir = boss.sweepDir === 1 ? -1 : 1;
    boss.chargeState = 'windup';
    boss.duration = cfg.durations[id];
    return id;
  }

  /** 보스 상태에 패턴용 필드를 붙인다 (run.js 가 보스를 만들 때 호출). */
  function attach(boss) {
    boss.final = true;
    boss.pattern = 'rest';
    boss.patternLabel = '';
    boss.patternTurn = -1;
    boss.phaseSeen = -1;
    boss.patternTime = 0;
    boss.patternStep = 0;
    boss.stepTimer = 0;
    boss.gapLane = 0;
    boss.sweepDir = 1;
    boss.chargeState = 'windup';
    boss.duration = LW.config.finalBoss.introRest;
    boss.homeY = boss.y;
    return boss;
  }

  /**
   * 최종 보스 한 프레임. run.js 가 넘겨주는 api 로만 세계를 건드린다
   * (스폰·피해 같은 건 run.js 소관이라 그쪽 함수를 받아 쓴다).
   * @param api {{spawnEnemy, spawnBolt, hurtSquad, emit, pressureContact}}
   */
  function update(run, boss, dt, api) {
    const cfg = LW.config.finalBoss;
    const squad = run.squad;
    boss.patternTime += dt;
    boss.stepTimer -= dt;

    if (boss.pattern === 'rest') {
      // 숨 돌리는 동안 천천히 부대 쪽으로 정렬한다
      boss.x = U.damp(boss.x, squad.x, 1.2, dt);
      boss.y = U.damp(boss.y, boss.homeY, 1.4, dt);
      if (boss.patternTime >= boss.duration) {
        const id = nextPattern(boss);
        api.emit(run, 'bossPattern', { pattern: id, label: boss.patternLabel });
      }
      return;
    }

    switch (boss.pattern) {
      case 'summon':
        runSummon(run, boss, dt, api, cfg);
        break;
      case 'fan':
        runFan(run, boss, dt, api, cfg);
        break;
      case 'charge':
        runCharge(run, boss, dt, api, cfg);
        break;
      case 'sweep':
        runSweep(run, boss, dt, api, cfg);
        break;
      default:
        break;
    }

    if (boss.patternTime >= boss.duration) {
      boss.pattern = 'rest';
      boss.patternLabel = '';
      boss.patternTime = 0;
      // 험한 단계에서는 숨 돌리는 시간이 짧아진다
      boss.duration = cfg.rest[phaseOf(boss)] || cfg.rest[cfg.rest.length - 1];
    }
  }

  /* ---------- 패턴들 ---------- */

  /** 소환 — 부하를 한 줄씩 뽑는다. */
  function runSummon(run, boss, dt, api, cfg) {
    boss.x = U.damp(boss.x, run.squad.x, 0.8, dt);
    if (boss.stepTimer > 0 || boss.patternStep >= cfg.summon.rows) return;
    boss.stepTimer = cfg.summon.interval;
    boss.patternStep++;
    const kinds = run.plan.theme.kinds;
    const n = cfg.summon.perRow;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const x = -cfg.summon.span / 2 + t * cfg.summon.span;
      api.spawnEnemy(run, kinds[(i + boss.patternStep) % kinds.length], x, boss.y - 1.2 - i * 0.2);
    }
    api.emit(run, 'bossSpawn');
  }

  /** 부채꼴 — 도로를 덮는 볼트. 한 칸은 반드시 비운다. */
  function runFan(run, boss, dt, api, cfg) {
    if (boss.stepTimer > 0 || boss.patternStep >= cfg.fan.shots) return;
    boss.stepTimer = cfg.fan.interval;
    boss.patternStep++;
    const n = cfg.fan.bolts;
    const half = LW.config.world.roadHalfWidth;
    for (let i = 0; i < n; i++) {
      if (i === boss.gapLane) continue; // 살 구멍
      const t = n > 1 ? i / (n - 1) : 0.5;
      const tx = -half + t * half * 2;
      api.spawnBolt(run, boss.x, boss.y - boss.radius, tx, run.dist);
    }
    api.emit(run, 'bossFire');
  }

  /** 돌진 — 부대 쪽으로 달려들고 물러난다. */
  function runCharge(run, boss, dt, api, cfg) {
    const squad = run.squad;
    if (boss.chargeState === 'windup') {
      // 겨냥하며 뒤로 살짝 물러난다 (아이가 준비할 시간)
      boss.x = U.damp(boss.x, squad.x, 2.4, dt);
      boss.y += cfg.charge.windupBack * dt;
      boss.flash = 0.1;
      if (boss.patternTime >= cfg.charge.windup) boss.chargeState = 'rush';
      return;
    }
    if (boss.chargeState === 'rush') {
      boss.y -= cfg.charge.speed * dt;
      if (boss.y <= run.dist + boss.radius + 0.4) {
        // 맞았다 — 크게 잃는다. 피하면 아무 일도 없다.
        if (Math.abs(boss.x - squad.x) <= boss.radius + squad.halfWidth()) {
          api.hurtSquad(
            run,
            Math.round(cfg.charge.contactCost * api.pressureContact(run)),
            boss.x,
            boss.y
          );
          run.shake = Math.max(run.shake, 0.7);
        }
        boss.chargeState = 'back';
      }
      return;
    }
    // 물러나기
    boss.y = U.damp(boss.y, boss.homeY, 2.2, dt);
    if (boss.homeY - boss.y < 0.6) boss.patternTime = boss.duration; // 제자리면 패턴 끝
  }

  /** 난사 — 볼트를 좌우로 훑는다. */
  function runSweep(run, boss, dt, api, cfg) {
    if (boss.stepTimer > 0 || boss.patternStep >= cfg.sweep.bolts) return;
    boss.stepTimer = cfg.sweep.interval;
    const half = LW.config.world.roadHalfWidth;
    const t = boss.patternStep / Math.max(1, cfg.sweep.bolts - 1);
    const from = boss.sweepDir === 1 ? -half : half;
    const tx = from + boss.sweepDir * t * half * 2;
    api.spawnBolt(run, boss.x, boss.y - boss.radius, tx, run.dist);
    boss.patternStep++;
    if (boss.patternStep % 3 === 0) api.emit(run, 'bossFire');
  }

  LW.boss = { attach, update, phaseOf, poolAt, nextPattern, label };
})(typeof globalThis !== 'undefined' ? globalThis : this);
