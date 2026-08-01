/* 챕터 코스 생성 — 시드 고정이라 같은 챕터는 항상 같은 코스가 나온다.
 *
 * 챕터 번호는 1..33 (한 구역에 3챕터). 1·2챕터는 코스를 끝까지 버티면 돌파,
 * 3챕터는 그 구역의 대장 로봇을 잡아야 돌파다. 33챕터를 모두 깨면 최종 결전이 열린다.
 */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const GATE_GAP = 44; // 게이트 간 거리
  const FIRST_GATE = 26;

  /**
   * @param chapter 전체 챕터 번호 1..33
   * @returns {{chapter:number, zone:number, part:number, stage:number, name:string, theme:object,
   *            length:number, bossY:number, hasBoss:boolean, events:Array, enemyHpMult:number}}
   */
  function build(chapter, startCount, opts) {
    const cfg = LW.config;
    const isFinal = !!(opts && opts.final);
    const zone = cfg.zoneOf(chapter);
    const part = cfg.partOf(chapter);
    // 구역 안에서도 챕터마다 조금씩 어려워진다 (1, 1.33, 1.67, 2, ...)
    const diff = isFinal ? cfg.zoneCount + 1 : cfg.difficultyOf(chapter);
    const rng = LW.util.makeRng(chapter * 9176 + part * 577 + 31);
    const theme = isFinal ? cfg.finalStage : cfg.stageTheme(zone);
    const hasBoss = isFinal || cfg.hasBossAt(chapter);
    const lengthMult = isFinal
      ? cfg.finalStage.lengthMult
      : cfg.chapters.lengthMult[part - 1];
    const length = Math.round(cfg.scaling.length(diff) * lengthMult);
    const hpMult = cfg.scaling.enemyHp(diff);
    const countMult = cfg.scaling.enemyCount(diff);
    const bossY = length;
    const events = [];
    const stage = diff; // 게이트·드럼통 스케일에 쓰는 난이도 값

    // 게이트 값 스케일을 잡기 위한 "예상 병력" 추적치. 실제 플레이와 정확히 같을 필요는 없다.
    let expected = Math.max(4, startCount);

    // 미니건 병사는 챕터당 1명 (보스 챕터·최종은 2명 — 정면 싸움에 힘이 된다)
    let gunnersLeft = isFinal ? 2 : hasBoss ? 2 : 1;

    let fakeLeft = zone >= 3 || isFinal ? 1 : 0; // 페이크 문은 챕터당 최대 1개
    let bothGoodLeft = zone >= 2 || isFinal ? 2 : 1; // 둘 다 초록인 문은 챕터당 최대 2개

    for (let y = FIRST_GATE; y < bossY - 30; y += GATE_GAP) {
      const allowFake = fakeLeft > 0 && y > FIRST_GATE;
      const pair = LW.gates.makePair(rng, expected, stage, {
        allowFake: allowFake,
        // 페이크와 겹치지 않게 — 한 게이트는 하나의 교훈만 준다.
        allowBothGood: !allowFake && bothGoodLeft > 0 && rng.chance(0.35),
      });
      if (pair.some((door) => door.fake)) fakeLeft--;
      if (pair.every((door) => LW.gates.isBuff(door))) bothGoodLeft--;
      events.push({ type: 'gate', y: y, doors: pair });
      // 아이가 좋은 문을 고른다고 가정하고 예상치를 갱신
      const best = Math.max(LW.gates.apply(expected, pair[0]), LW.gates.apply(expected, pair[1]));
      expected = Math.max(3, best);

      // 아주 첫 챕터의 첫 블록만 몸풀기 — 그 뒤로는 처음부터 적이 나온다.
      const waves = y === FIRST_GATE && chapter === 1 ? 0 : rng.int(2, 3);
      for (let w = 0; w < waves; w++) {
        const wy = y + 12 + w * 11 + rng.range(-1.5, 1.5);
        if (wy > bossY - 8) break;
        events.push(makeWave(rng, wy, theme.kinds, expected, countMult, stage));
        expected = Math.max(3, expected - 1);
      }

      // 드럼통 — 쏴서 터뜨리면 위의 총을 얻는다. 게이트 구간마다 반드시 나온다.
      const barrelCount = rng.int(2, 3);
      const bx = rng.range(-2.8, 2.8);
      for (let i = 0; i < barrelCount; i++) {
        const by = y + 10 + i * rng.range(5, 9) + rng.range(-1.5, 1.5);
        if (by > bossY - 6) break;
        events.push({
          type: 'barrel',
          y: by,
          x: LW.util.clamp(bx + i * rng.range(-2.2, 2.2), -3.4, 3.4),
          hits: Math.min(cfg.barrel.maxHits, cfg.barrel.hits + Math.floor((zone - 1) / 2)),
        });
      }

      // 가끔 바리케이드(부수거나 피해야 함)와 부품 뭉치
      if (rng.chance(0.45) && diff >= 2) {
        events.push({
          type: 'barricade',
          y: y + 30 + rng.range(-2, 2),
          x: rng.range(-2.4, 2.4),
          hp: Math.round(cfg.barricade.hp * hpMult),
        });
      }
      if (rng.chance(0.7)) {
        const cx = rng.range(-3.2, 3.2);
        const cy = y + 6 + rng.range(0, 6);
        for (let i = 0; i < 4; i++) events.push({ type: 'coin', y: cy + i * 1.5, x: cx });
      }

      // 미니건 병사 — 길에 서서 기다린다. 지나가면 합류해 함께 쏜다.
      if (gunnersLeft > 0 && rng.chance(0.55)) {
        gunnersLeft--;
        events.push({
          type: 'gunner',
          y: y + 20 + rng.range(-3, 3),
          x: rng.range(-3.2, 3.2),
        });
      }
    }

    // 보스(또는 코스 끝) 직전 마지막 선택 — 여기서 문 하나가 승패를 가른다.
    events.push({
      type: 'gate',
      y: bossY - 22,
      doors: LW.gates.makePair(rng, expected, stage, { allowFake: fakeLeft > 0 }),
    });

    events.sort((a, b) => a.y - b.y);

    return {
      chapter: isFinal ? cfg.chapterCount + 1 : chapter,
      zone: zone,
      part: part,
      stage: zone, // 예전 이름 (구역) — 세이브·UI 호환용
      isFinal: isFinal,
      hasBoss: hasBoss,
      name: isFinal ? cfg.finalStage.name : cfg.chapterName(chapter),
      theme: theme,
      length: length,
      bossY: bossY,
      events: events,
      enemyHpMult: hpMult,
      // 대장 로봇은 "그 구역의 대장" 이라 구역 기준으로 단단해진다 (챕터 소수값이 아니라)
      bossHp: Math.round(
        cfg.boss.hp * cfg.scaling.bossHp(zone) * (isFinal ? cfg.finalStage.bossHpMult : 1)
      ),
      rewardBase: Math.round(cfg.scaling.reward(diff) * (isFinal ? 3 : 1)),
    };
  }

  /** 최종 결전 코스 — 33챕터를 모두 깬 뒤 열린다. */
  function buildFinal(startCount) {
    return build(LW.config.chapterCount, startCount, { final: true });
  }

  function makeWave(rng, y, kinds, expected, countMult, stage) {
    const n = LW.util.clamp(Math.round(rng.int(2, 4) * countMult), 2, 9);
    const entries = [];
    for (let i = 0; i < n; i++) {
      const kind = rng.pick(kinds);
      entries.push({
        kind: kind,
        x: rng.range(-LW.config.world.roadHalfWidth + 0.6, LW.config.world.roadHalfWidth - 0.6),
        y: y + rng.range(-2.5, 2.5),
      });
    }
    return { type: 'wave', y: y, entries: entries };
  }

  LW.stage = { build, buildFinal, GATE_GAP, FIRST_GATE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
