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
    for (const barrel of run.barrels) {
      if (barrel.broken || barrel.passed) continue;
      const d = barrel.y - run.dist;
      if (d < 0 || d > 9) continue;
      if (best === null || d < best.d) best = { d: d, x: barrel.x };
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

    // 위협이 없으면 미니건 병사를 주우러 간다 — 화력이 확 오른다
    if (squad.gunners < LW.config.gunner.max) {
      let pick = null;
      for (const p of run.gunnerPickups) {
        if (p.taken) continue;
        const ahead = p.y - run.dist;
        if (ahead < 0.5 || ahead > 20) continue;
        if (!pick || p.y < pick.y) pick = p;
      }
      if (pick) {
        input.targetX = clampRoad(pick.x);
        return;
      }
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

  /** 버티기 모드 정책 — 즉사 드럼통을 1순위로 피하고, 이득 문에만 들어간다. */
  function survivor(run, input) {
    const squad = run.squad;
    const cfgBar = LW.config.barrel;

    // 1순위: 깔리면 즉사 — 다가오는 드럼통 앞에서는 무조건 비킨다
    let danger = null;
    for (const barrel of run.barrels) {
      if (barrel.broken || barrel.passed) continue;
      const ahead = barrel.y - run.dist;
      if (ahead < 0 || ahead > 10) continue;
      if (Math.abs(barrel.x - squad.x) > cfgBar.radius + squad.halfWidth() + 0.7) continue;
      if (!danger || ahead < danger.ahead) danger = { ahead: ahead, x: barrel.x };
    }
    if (danger) {
      // 드럼통은 오른쪽에만 있으니 왼쪽으로 확실히 뺀다 (진형 폭만큼 더)
      input.targetX = clampRoad(danger.x - (cfgBar.radius + squad.halfWidth() + 0.5));
      return;
    }

    // 2순위: 문 하나가 다가온다 — 숫자를 보고 들어갈지 피할지 고른다
    let gate = null;
    for (const g of run.gates) {
      if (g.used) continue;
      const ahead = g.y - run.dist;
      if (ahead > 0 && ahead < 16 && (!gate || g.y < gate.y)) gate = g;
    }
    if (gate) {
      const door = gate.doors[0];
      if (LW.gates.apply(squad.count, door) > squad.count) {
        input.targetX = gate.x; // 이득이면 들어간다
      } else {
        // 손해면 문 밖으로 비킨다. 왼쪽 벽에 붙은 문은 왼쪽으로 못 빠지니
        // 갈 수 있는 쪽을 고른다 — 안 그러면 문 안에 갇혀 그대로 먹는다.
        const lim = half - squad.halfWidth();
        const leftEsc = gate.x - gate.w / 2 - 0.35;
        const rightEsc = gate.x + gate.w / 2 + 0.35;
        input.targetX = leftEsc >= -lim ? leftEsc : Math.min(rightEsc, lim);
      }
      return;
    }

    // 미니건 병사가 근처에 있으면 주우러 간다 (버티기에서는 화력이 곧 생존이다)
    if (squad.gunners < LW.config.gunner.max) {
      for (const p of run.gunnerPickups) {
        if (p.taken) continue;
        const ahead = p.y - run.dist;
        if (ahead > 1 && ahead < 16) {
          input.targetX = clampRoad(p.x);
          return;
        }
      }
    }

    // 그 외: 멀리 있는 드럼통을 미리 쏴 둔다 — 총을 먹어야 오래 버틴다
    let target = null;
    for (const barrel of run.barrels) {
      if (barrel.broken || barrel.passed) continue;
      const ahead = barrel.y - run.dist;
      if (ahead < 11 || ahead > 24) continue;
      if (!target || ahead < target.ahead) target = { ahead: ahead, x: barrel.x };
    }
    input.targetX = target ? clampRoad(target.x) : -1.5;
  }

  return { smart, dumb, gatesOnly, survivor };
}

module.exports = { makeAutopilot };
