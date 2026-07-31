/* 구역 구성 생성 — 시드 고정이라 같은 구역은 항상 같은 코스가 나온다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const GATE_GAP = 44; // 게이트 간 거리
  const FIRST_GATE = 26;

  /**
   * @returns {{stage:number, name:string, theme:object, length:number, bossY:number,
   *            events:Array, enemyHpMult:number}}
   */
  function build(stage, startCount) {
    const cfg = LW.config;
    const rng = LW.util.makeRng(stage * 9176 + 31);
    const theme = cfg.stageTheme(stage);
    const length = Math.round(cfg.scaling.length(stage));
    const hpMult = cfg.scaling.enemyHp(stage);
    const countMult = cfg.scaling.enemyCount(stage);
    const bossY = length;
    const events = [];

    // 게이트 값 스케일을 잡기 위한 "예상 병력" 추적치. 실제 플레이와 정확히 같을 필요는 없다.
    let expected = Math.max(4, startCount);

    for (let y = FIRST_GATE; y < bossY - 30; y += GATE_GAP) {
      const pair = LW.gates.makePair(rng, expected, stage);
      events.push({ type: 'gate', y: y, doors: pair });
      // 아이가 좋은 문을 고른다고 가정하고 예상치를 갱신
      const best = Math.max(LW.gates.apply(expected, pair[0]), LW.gates.apply(expected, pair[1]));
      expected = Math.max(3, best);

      // 첫 블록은 몸풀기 — 게이트를 두 번 지나 병력을 불린 뒤부터 적이 나온다.
      const waves = y === FIRST_GATE ? 0 : rng.int(2, 3);
      for (let w = 0; w < waves; w++) {
        const wy = y + 12 + w * 11 + rng.range(-1.5, 1.5);
        if (wy > bossY - 8) break;
        events.push(makeWave(rng, wy, theme.kinds, expected, countMult, stage));
        expected = Math.max(3, expected - 1);
      }

      // 가끔 바리케이드(부수거나 피해야 함)와 부품 뭉치
      if (rng.chance(0.45) && stage >= 2) {
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
    }

    // 보스 직전 마지막 선택 — 여기서 문 하나가 승패를 가른다.
    events.push({ type: 'gate', y: bossY - 22, doors: LW.gates.makePair(rng, expected, stage) });

    events.sort((a, b) => a.y - b.y);

    return {
      stage: stage,
      name: cfg.stageName(stage),
      theme: theme,
      length: length,
      bossY: bossY,
      events: events,
      enemyHpMult: hpMult,
      bossHp: Math.round(cfg.boss.hp * cfg.scaling.bossHp(stage)),
      rewardBase: Math.round(cfg.scaling.reward(stage)),
    };
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

  LW.stage = { build, GATE_GAP, FIRST_GATE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
