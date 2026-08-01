'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, simulate, simulateUntil } = require('./helper');
const { makeAutopilot } = require('./autopilot');

const LW = loadGame();
const pilot = makeAutopilot(LW);

function newRun(stage, levels) {
  return LW.run.create(stage, LW.upgrades.resolve(levels || {}));
}

test('전투가 시작되면 부대가 전진한다', () => {
  const run = newRun(1);
  simulate(LW, run, 1.5);
  assert.ok(run.dist > 5, '전진하지 않는다');
  assert.equal(run.phase, 'run');
});

/** 첫 게이트를 지정한 쪽으로 통과시키고, 통과 직후 상태를 돌려준다. */
function passFirstGate(side) {
  const run = newRun(1);
  const gate = run.plan.events.find((e) => e.type === 'gate');
  const before = run.squad.count;
  const passed = simulateUntil(LW, run, (r) => r.gates.some((g) => g.used), 12, (r, input) => {
    input.targetX = side === 0 ? -2.5 : 2.5;
  });
  assert.ok(passed, '게이트를 통과하지 못했다');
  return { run, gate, before, used: run.gates.find((g) => g.used) };
}

test('왼쪽 문을 고르면 왼쪽 연산이 적용된다', () => {
  const { run, gate, before, used } = passFirstGate(0);
  assert.equal(used.chosen, 0);
  assert.equal(run.squad.count, LW.gates.apply(before, gate.doors[0]));
});

test('오른쪽 문을 고르면 오른쪽 연산이 적용된다', () => {
  const { run, gate, before, used } = passFirstGate(1);
  assert.equal(used.chosen, 1);
  assert.equal(run.squad.count, LW.gates.apply(before, gate.doors[1]));
});

test('사격이 적을 부수고 부품이 쌓인다', () => {
  const run = newRun(1, { damage: 10, start: 6 });
  simulate(LW, run, 14, (r, input) => {
    // 가장 가까운 적을 따라가며 사격
    let best = null;
    for (const e of r.enemies) if (e.active && (!best || e.y < best.y)) best = e;
    input.targetX = best ? best.x : r.squad.x;
  });
  assert.ok(run.kills > 0, '적을 하나도 못 잡았다');
  assert.ok(run.parts > 0, '부품이 안 쌓였다');
});

test('적에게 닿으면 병력을 잃는다', () => {
  const run = newRun(2);
  // 정면에 안 죽는 적을 세워 접촉 규칙만 검증한다 (운에 맡기지 않는다)
  const enemy = LW.run.spawnEnemy(run, 'grunt', run.squad.x, run.dist + 3);
  enemy.hp = enemy.maxHp = 1e9;
  const before = run.squad.count;
  let hurt = 0;
  const input = { targetX: run.squad.x };
  for (let i = 0; i < 60 * 3; i++) {
    input.targetX = enemy.active ? enemy.x : run.squad.x;
    for (const ev of LW.run.update(run, 1 / 60, input)) if (ev.type === 'hurt') hurt += ev.amount;
    if (!enemy.active) break;
  }
  assert.ok(hurt > 0, '적과 부딪혔는데 피해가 없다');
  assert.ok(run.squad.count < before, '병력이 줄지 않았다');
  assert.equal(enemy.active, false, '부딪힌 적은 사라져야 한다');
});

test('병력이 0 이 되면 패배로 끝난다', () => {
  const run = newRun(1);
  run.squad.count = 1;
  simulate(LW, run, 40, (r, input) => {
    let best = null;
    for (const e of r.enemies) if (e.active && (!best || e.y < best.y)) best = e;
    input.targetX = best ? best.x : r.squad.x;
    r.squad.count = Math.min(r.squad.count, 1); // 계속 1명 유지 -> 첫 접촉에 전멸
  });
  assert.equal(run.phase, 'lost');
  const result = LW.run.result(run);
  assert.equal(result.win, false);
  assert.equal(result.stars, 0);
  assert.ok(result.coins > 0, '패배해도 약간의 부품은 준다');
});

test('코스 끝까지 가면 보스 단계로 넘어가고 전진이 멈춘다', () => {
  const run = newRun(1);
  const reached = simulateUntil(LW, run, (r) => r.phase === 'boss', 90, pilot.smart);
  assert.ok(reached, '보스까지 못 갔다: ' + run.phase);
  assert.ok(run.boss, '보스가 없다');
  assert.ok(run.dist <= run.plan.bossY - LW.config.boss.standoff + 0.01, '보스 단계에서도 계속 전진한다');
  const before = run.dist;
  simulate(LW, run, 0.5, pilot.smart);
  assert.equal(run.dist, before, '보스전에서는 제자리에서 싸운다');
});

test('보스를 부수면 승리하고 별·보상이 계산된다', () => {
  const run = newRun(1, { loot: 3 });
  simulate(LW, run, 200, pilot.smart);
  assert.equal(run.phase, 'won', '게이트를 잘 고르면 1구역은 이겨야 한다');
  const result = LW.run.result(run);
  assert.equal(result.win, true);
  assert.ok(result.stars >= 1 && result.stars <= 3);
  assert.ok(result.coins > run.plan.rewardBase);
  assert.ok(result.peak >= result.startCount);
});

test('게이트를 무시하고 가운데로만 달리면 1구역도 힘들다 (선택이 실력이다)', () => {
  const smart = LW.run.create(3, LW.upgrades.resolve({ start: 4, damage: 4, fire: 4 }));
  const dumb = LW.run.create(3, LW.upgrades.resolve({ start: 4, damage: 4, fire: 4 }));
  simulate(LW, smart, 200, pilot.smart);
  simulate(LW, dumb, 200, pilot.dumb);
  assert.equal(smart.phase, 'won');
  assert.ok(dumb.squad.count < smart.squad.count, '아무렇게나 해도 결과가 같으면 게임이 아니다');
});

test('진행도는 0..1 을 벗어나지 않는다', () => {
  const run = newRun(3);
  for (let i = 0; i < 600; i++) {
    LW.run.update(run, 1 / 60, { targetX: 0 });
    const p = LW.run.progress(run);
    assert.ok(p >= 0 && p <= 1, '진행도 이상: ' + p);
  }
});

test('부대는 도로 밖으로 나가지 못한다', () => {
  const run = newRun(1);
  simulate(LW, run, 6, (r, input) => {
    input.targetX = 999;
  });
  assert.ok(run.squad.x <= LW.config.world.roadHalfWidth, '도로를 벗어났다');
  simulate(LW, run, 6, (r, input) => {
    input.targetX = -999;
  });
  assert.ok(run.squad.x >= -LW.config.world.roadHalfWidth);
});

test('풀 상한을 넘겨도 오브젝트가 무한히 늘지 않는다', () => {
  const run = newRun(9, { damage: 20, start: 20, fire: 15 });
  simulate(LW, run, 45);
  assert.equal(run.bullets.length, LW.config.pools.bullets);
  assert.equal(run.enemies.length, LW.config.pools.enemies);
  assert.equal(run.particles.length, LW.config.pools.particles);
  assert.ok(run.gates.length < 40);
});
