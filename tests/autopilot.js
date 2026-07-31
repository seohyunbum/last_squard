/* 자동 플레이 정책 — 테스트와 밸런스 점검이 같은 조작 모델을 공유한다. */
'use strict';

function makeAutopilot(LW) {
  const half = LW.config.world.roadHalfWidth;

  function clampRoad(x) {
    const lim = half - 1;
    return Math.max(-lim, Math.min(lim, x));
  }

  function nearestThreat(run) {
    let best = null;
    for (const e of run.enemies) {
      if (!e.active) continue;
      const d = e.y - run.dist;
      if (d < 0 || d > 9) continue;
      if (Math.abs(e.x - run.squad.x) > 2.6) continue;
      if (best === null || d < best.d) best = { d: d, x: e.x };
    }
    for (const bar of run.barricades) {
      if (bar.broken || bar.passed) continue;
      const d = bar.y - run.dist;
      if (d < 0 || d > 10) continue;
      if (best === null || d < best.d) best = { d: d, x: bar.x };
    }
    return best ? best.x : null;
  }

  function nearestBolt(run) {
    let best = null;
    for (const b of run.bolts) {
      if (!b.active) continue;
      const d = b.y - run.dist;
      if (d < 0 || d > 6) continue;
      if (Math.abs(b.x - run.squad.x) > 1.6) continue;
      if (best === null || d < best.d) best = { d: d, x: b.x };
    }
    return best ? clampRoad(best.x + (best.x > run.squad.x ? -2.4 : 2.4)) : null;
  }

  /** 좋은 문을 고르고 적을 피하는 플레이 — 아이가 몇 판 하면 도달하는 수준. */
  function smart(run, input) {
    const squad = run.squad;

    let gate = null;
    for (const g of run.gates) {
      if (g.used) continue;
      const ahead = g.y - run.dist;
      if (ahead > 0 && ahead < 14 && (!gate || g.y < gate.y)) gate = g;
    }
    if (gate) {
      const left = LW.gates.apply(squad.count, gate.doors[0]);
      const right = LW.gates.apply(squad.count, gate.doors[1]);
      input.targetX = left >= right ? -half * 0.5 : half * 0.5;
      return;
    }

    if (run.boss && !run.boss.dead) {
      const dodge = nearestBolt(run);
      input.targetX = dodge !== null ? dodge : run.boss.x;
      return;
    }

    const threat = nearestThreat(run);
    if (threat !== null) {
      const dir = threat > squad.x ? -1 : 1;
      input.targetX = clampRoad(squad.x + dir * 2.2);
      return;
    }
    input.targetX = squad.x * 0.9;
  }

  /** 아무 생각 없이 가운데로만 달리는 플레이 — 이쪽은 져야 정상. */
  function dumb(run, input) {
    input.targetX = 0;
  }

  /** 게이트만 잘 고르고 회피는 안 하는 플레이 */
  function gatesOnly(run, input) {
    let gate = null;
    for (const g of run.gates) {
      if (g.used) continue;
      const ahead = g.y - run.dist;
      if (ahead > 0 && ahead < 14 && (!gate || g.y < gate.y)) gate = g;
    }
    if (!gate) {
      input.targetX = run.boss && !run.boss.dead ? run.boss.x : 0;
      return;
    }
    const left = LW.gates.apply(run.squad.count, gate.doors[0]);
    const right = LW.gates.apply(run.squad.count, gate.doors[1]);
    input.targetX = left >= right ? -half * 0.5 : half * 0.5;
  }

  return { smart, dumb, gatesOnly };
}

module.exports = { makeAutopilot };
