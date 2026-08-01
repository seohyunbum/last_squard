/* 버티기 모드의 끝없는 코스 — 부대는 제자리에서 버티고 좌우에서 계속 밀려온다.
 *
 *   왼쪽 절반: 게이트가 하나씩 무작위로 내려온다. 들어갈지 피할지 고른다.
 *   오른쪽 절반: 드럼통이 굴러온다. 쏴서 터뜨리면 총, 깔리면 즉사.
 *
 * 코스를 미리 다 만들지 않고 필요한 만큼 이어 붙인다(extend) — 끝이 없기 때문이다.
 */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  /** 거리 → 난이도 단계 (1부터). 구역 스케일링을 그대로 재활용한다. */
  function tierAt(y) {
    const cfg = LW.config.survival;
    return LW.util.clamp(1 + Math.floor(y / cfg.tierEvery), 1, cfg.maxTier);
  }

  function build(mods) {
    const cfg = LW.config;
    const sv = cfg.survival;
    const rng = LW.util.makeRng(90210);
    const half = cfg.world.roadHalfWidth;

    const plan = {
      stage: 0, // 구역 개념이 없다 — 해금·별 계산에서 제외되는 표식
      endless: true,
      name: '버티기 · 무한 전선',
      theme: cfg.stageTheme(1),
      length: Infinity,
      bossY: Infinity, // 보스가 없다. 끝은 죽을 때다
      events: [],
      enemyHpMult: cfg.scaling.enemyHp(1),
      bossHp: 0,
      rewardBase: 0,
      // 다음에 만들 이벤트의 y 위치
      cursor: {
        gate: sv.firstGate, barrel: sv.firstBarrel, wave: sv.firstWave,
        coin: sv.coinGap[0], gunner: sv.gunnerGap[0],
      },
      expected: Math.max(4, mods.startCount),
    };

    /** 왼쪽 절반 안의 문 중심 x — 도로를 벗어나지 않게 잡는다. */
    function gateX() {
      const w = sv.gateWidth;
      return rng.range(-half + w / 2 + sv.laneMargin, -w / 2 - 0.1);
    }

    /** 오른쪽 차선의 드럼통 x — 왼쪽으로 피할 여유를 남긴다 */
    function barrelX() {
      return rng.range(sv.barrelLaneMin, half - sv.laneMargin);
    }

    /** untilY 까지 코스를 이어 붙인다. fromIndex 이후(아직 안 쓴 구간)만 정렬한다. */
    plan.extend = function extend(untilY, fromIndex) {
      const c = plan.cursor;
      const out = plan.events;

      while (c.gate <= untilY) {
        const tier = tierAt(c.gate);
        out.push({
          type: 'gate',
          y: c.gate,
          solo: true,
          x: gateX(),
          w: sv.gateWidth,
          doors: [LW.gates.makeSolo(rng, tier)],
        });
        c.gate += rng.range(sv.gateGap[0], sv.gateGap[1]);
      }

      while (c.barrel <= untilY) {
        const tier = tierAt(c.barrel);
        out.push({
          type: 'barrel',
          y: c.barrel,
          x: barrelX(),
          hits: Math.min(LW.config.barrel.maxHits, LW.config.barrel.hits + Math.floor((tier - 1) / 2)),
          lethal: true, // 깔리면 즉시 끝 — 버티기 모드의 유일한 즉사 요소
        });
        c.barrel += rng.range(sv.barrelGap[0], sv.barrelGap[1]);
      }

      while (c.wave <= untilY) {
        const tier = tierAt(c.wave);
        const kinds = LW.config.stageTheme(tier).kinds;
        const n = LW.util.clamp(Math.round(rng.int(2, 4) * LW.config.scaling.enemyCount(tier)), 2, 9);
        const entries = [];
        for (let i = 0; i < n; i++) {
          entries.push({
            kind: rng.pick(kinds),
            x: rng.range(-half + 0.6, half - 0.6),
            y: c.wave + rng.range(-2.5, 2.5),
          });
        }
        out.push({ type: 'wave', y: c.wave, entries: entries, hpMult: LW.config.scaling.enemyHp(tier) });
        // 단계가 오르면 웨이브 간격이 좁아진다 — 안 그러면 강해진 뒤로는 산책이 된다
        const tighten = Math.max(0.45, 1 - sv.waveGapTighten * (tier - 1));
        c.wave += rng.range(sv.waveGap[0], sv.waveGap[1]) * tighten;
      }

      while (c.gunner <= untilY) {
        // 미니건 병사는 도로 어디서나 기다린다 — 드럼통 차선에 있으면 위험을 무릅쓰게 된다
        out.push({ type: 'gunner', y: c.gunner, x: rng.range(-half + 0.8, half - 0.8) });
        c.gunner += rng.range(sv.gunnerGap[0], sv.gunnerGap[1]);
      }

      while (c.coin <= untilY) {
        const cx = rng.range(-half + 0.6, half - 0.6);
        for (let i = 0; i < 4; i++) out.push({ type: 'coin', y: c.coin + i * 1.5, x: cx });
        c.coin += rng.range(sv.coinGap[0], sv.coinGap[1]);
      }

      // 이미 소비한 앞부분은 그대로 두고 남은 꼬리만 y 순으로 정렬한다.
      const tail = out.splice(Math.max(0, fromIndex | 0));
      tail.sort((a, b) => a.y - b.y);
      for (const ev of tail) out.push(ev);
    };

    plan.extend(sv.firstWave + 40, 0);
    return plan;
  }

  LW.survival = { build, tierAt };
})(typeof globalThis !== 'undefined' ? globalThis : this);
