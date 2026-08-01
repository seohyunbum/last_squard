/* 미니건 병사 — 길에서 구해 합류시키는 아군. 병력 수와 별개로 자기 화력을 쏜다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadGame, simulate, simulateUntil } = require('./helper');

const LW = loadGame();

function newRun(chapter, levels) {
  const mods = LW.upgrades.resolve(
    Object.assign({ start: 0, damage: 0, fire: 0, speed: 0, loot: 0 }, levels)
  );
  return LW.run.create(chapter || 1, mods);
}

/** 부대 정면에 미니건 병사를 세운다. */
function withPickupAhead(run, offsetX) {
  run.gunnerPickups.length = 0;
  run.gunnerPickups.push({
    x: run.squad.x + (offsetX || 0),
    y: run.dist + 8,
    taken: false,
    bob: 0,
    wave: 0,
  });
  return run.gunnerPickups[0];
}

test('지나가면 미니건 병사가 합류한다', () => {
  const run = newRun(1);
  const pickup = withPickupAhead(run, 0);
  assert.equal(run.squad.gunners, 0);
  const joined = simulateUntil(LW, run, (r) => r.squad.gunners > 0, 6, (r, input) => {
    input.targetX = pickup.x;
  });
  assert.ok(joined, '지나갔는데 합류하지 않았다');
  assert.equal(run.squad.gunners, 1);
  assert.equal(pickup.taken, true);
});

test('옆으로 비켜 가면 합류하지 않는다', () => {
  const run = newRun(1);
  withPickupAhead(run, 3.4);
  simulate(LW, run, 3, (r, input) => {
    input.targetX = -3.4;
  });
  assert.equal(run.squad.gunners, 0, '비켰는데 합류했다');
});

test('상한(3명)까지만 늘고, 꽉 차면 부품으로 바뀐다', () => {
  const squad = LW.squad.makeSquad(10, LW.upgrades.resolve({ start: 0, damage: 0, fire: 0, speed: 0, loot: 0 }));
  const max = LW.config.gunner.max;
  for (let i = 1; i <= max; i++) assert.equal(squad.addGunner(), i);
  assert.equal(squad.addGunner(), 0, '상한을 넘어 합류했다');
  assert.equal(squad.gunners, max);

  // 꽉 찬 상태로 픽업을 지나가면 부품을 준다
  const run = newRun(1);
  run.squad.gunners = max;
  const parts = run.parts;
  const pickup = withPickupAhead(run, 0);
  simulateUntil(LW, run, (r) => r.gunnerPickups[0].taken, 6, (r, input) => {
    input.targetX = pickup.x;
  });
  assert.equal(run.squad.gunners, max);
  assert.ok(run.parts > parts, '꽉 찼는데 아무것도 주지 않았다');
});

test('게이트 연산은 미니건 병사를 건드리지 않는다', () => {
  for (const door of [{ op: 'div', value: 2 }, { op: 'mul', value: 0 }, { op: 'sub', value: 5 }]) {
    const run = newRun(1);
    run.squad.gunners = 2;
    run.squad.count = 20;
    run.gates.length = 0;
    run.gates.push({ y: run.dist + 6, doors: [door, door], used: false, flash: 0 });
    simulate(LW, run, 2.5, (r, input) => {
      input.targetX = -2;
    });
    assert.equal(run.squad.gunners, 2, LW.gates.label(door) + ' 문이 미니건 병사를 없앴다');
  }
});

test('미니건은 병력 수와 무관하게 쏜다 (한 명만 남아도)', () => {
  const run = newRun(1);
  run.squad.count = 1;
  run.squad.gunners = 3;
  run.eventIndex = run.plan.events.length; // 코스 이벤트 없이 사격만 본다
  for (const b of run.bullets) b.active = false;
  simulate(LW, run, 0.4, (r, input) => {
    input.targetX = 0;
  });
  const flying = run.bullets.filter((b) => b.active);
  assert.ok(flying.length >= 4, '미니건이 거의 쏘지 않았다: ' + flying.length + '발');
  // 미니건 총알은 부대 볼리보다 한 발 피해가 크다
  assert.ok(
    flying.some((b) => b.dmg >= LW.config.gunner.damage - 0.01),
    '미니건 총알 피해가 반영되지 않았다'
  );
});

test('미니건 병사가 있으면 대장 로봇이 더 빨리 죽는다', () => {
  function killTime(gunners) {
    const run = newRun(3); // 1구역 3챕터 = 대장 로봇
    run.eventIndex = run.plan.events.length;
    run.dist = run.plan.bossY - LW.config.boss.standoff - 0.1;
    run.squad.count = 40;
    run.squad.gunners = gunners;
    const input = { targetX: 0 };
    for (let i = 0; i < 60 * 120; i++) {
      LW.run.update(run, 1 / 60, input);
      if (run.boss && run.boss.dead) return run.time;
      if (run.phase === 'lost') return Infinity;
    }
    return Infinity;
  }
  const alone = killTime(0);
  const withGunners = killTime(3);
  assert.ok(Number.isFinite(alone) && Number.isFinite(withGunners), '보스를 못 잡았다');
  assert.ok(withGunners < alone * 0.75, '미니건 3명이 있는데 별 차이가 없다: ' + alone.toFixed(1) + 's -> ' + withGunners.toFixed(1) + 's');
});

test('미니건 병사는 진형 바깥 좌우로 번갈아 선다', () => {
  const squad = LW.squad.makeSquad(30, LW.upgrades.resolve({ start: 0, damage: 0, fire: 0, speed: 0, loot: 0 }));
  const hw = squad.halfWidth();
  const offsets = [0, 1, 2].map((i) => squad.gunnerOffset(i));
  assert.ok(offsets[0] < 0 && offsets[1] > 0, '좌우로 번갈아 서지 않는다: ' + offsets);
  for (const o of offsets) {
    assert.ok(Math.abs(o) > hw, '진형 안에 겹쳐 선다: ' + o.toFixed(2) + ' vs 반폭 ' + hw.toFixed(2));
    assert.ok(Math.abs(o) <= LW.config.world.roadHalfWidth, '도로를 벗어나 선다: ' + o.toFixed(2));
  }
});

test('부대가 도로 끝까지 가도 미니건 병사는 도로 안에 남는다', () => {
  const squad = LW.squad.makeSquad(60, LW.upgrades.resolve({ start: 0, damage: 0, fire: 0, speed: 0, loot: 0 }));
  squad.gunners = LW.config.gunner.max;
  const half = LW.config.world.roadHalfWidth;
  for (const x of [-half + squad.halfWidth(), 0, half - squad.halfWidth()]) {
    squad.x = x;
    for (let i = 0; i < squad.gunners; i++) {
      const gx = squad.gunnerX(i);
      assert.ok(Math.abs(gx) <= half, '부대 x=' + x.toFixed(1) + ' 에서 미니건이 도로를 벗어났다: ' + gx.toFixed(2));
    }
  }
});

test('모든 챕터에 미니건 병사가 배치된다 (보스 챕터는 둘)', () => {
  for (let ch = 1; ch <= LW.config.chapterCount; ch++) {
    const plan = LW.stage.build(ch, 10);
    const gunners = plan.events.filter((e) => e.type === 'gunner');
    assert.ok(gunners.length >= 1, ch + '챕터에 미니건 병사가 없다');
    assert.ok(gunners.length <= 2, ch + '챕터에 미니건 병사가 너무 많다: ' + gunners.length);
    for (const g of gunners) {
      assert.ok(Math.abs(g.x) <= LW.config.world.roadHalfWidth, '미니건 병사가 도로를 벗어났다');
      assert.ok(g.y > 0 && g.y <= plan.bossY, '미니건 병사가 코스 밖에 있다');
    }
  }
});

test('버티기 모드에도 미니건 병사가 나온다', () => {
  const plan = LW.survival.build({ startCount: 10 });
  plan.extend(600, 0);
  const gunners = plan.events.filter((e) => e.type === 'gunner');
  assert.ok(gunners.length >= 3, '버티기에 미니건 병사가 너무 드물다: ' + gunners.length);
  for (const g of gunners) {
    assert.ok(Math.abs(g.x) <= LW.config.world.roadHalfWidth, '미니건 병사가 도로를 벗어났다');
  }
});
