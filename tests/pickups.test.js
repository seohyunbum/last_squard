'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, simulate, simulateUntil } = require('./helper');

const LW = loadGame();

function newRun(stage, levels) {
  return LW.run.create(stage, LW.upgrades.resolve(levels || {}));
}

/** 드럼통을 정면에 세운 전투를 만든다. hits 를 크게 주면 다 부수기 전에 도달한다. */
function runWithBarrel(offsetX, hits) {
  const run = newRun(1, { damage: 8 });
  run.barrels.length = 0;
  run.barrels.push({
    x: run.squad.x + (offsetX || 0),
    y: run.dist + 12,
    hits: hits || LW.config.barrel.hits,
    maxHits: hits || LW.config.barrel.hits,
    broken: false,
    passed: false,
    flash: 0,
    bob: 0,
  });
  return run;
}

test('모든 구역에 드럼통이 배치된다', () => {
  for (let stage = 1; stage <= LW.config.stageCount; stage++) {
    const barrels = LW.stage.build(stage, 10).events.filter((e) => e.type === 'barrel');
    assert.ok(barrels.length >= 3, stage + '구역 드럼통이 너무 적다');
    for (const b of barrels) {
      assert.ok(Math.abs(b.x) <= LW.config.world.roadHalfWidth, '드럼통이 도로를 벗어났다');
      assert.ok(b.hits > 0);
    }
  }
});

test('드럼통을 쏘면 터지고 총이 떨어진다', () => {
  const run = runWithBarrel(0);
  const barrel = run.barrels[0];
  const popped = simulateUntil(LW, run, (r) => r.barrels[0].broken, 6, (r, input) => {
    input.targetX = barrel.x;
  });
  assert.ok(popped, '드럼통이 터지지 않았다');
  assert.equal(run.guns.length, 1, '총이 떨어지지 않았다');
  assert.ok(Math.abs(run.guns[0].x - barrel.x) < 0.01, '총은 드럼통 자리에 떨어진다');
});

test('떨어진 총을 주우면 연사가 빨라진다', () => {
  const run = runWithBarrel(0);
  const before = run.squad.interval();
  const got = simulateUntil(LW, run, (r) => r.squad.buffStacks > 0, 8, (r, input) => {
    input.targetX = r.guns.length ? r.guns[0].x : run.barrels[0].x;
  });
  assert.ok(got, '총을 줍지 못했다');
  assert.equal(run.squad.buffStacks, 1);
  assert.ok(run.squad.interval() < before, '연사 간격이 짧아지지 않았다');
  assert.ok(run.squad.buffTimer > 0);
});

test('총을 겹쳐 먹으면 상한까지만 빨라진다', () => {
  const run = newRun(1);
  const squad = run.squad;
  for (let i = 0; i < 10; i++) squad.pickUpWeapon();
  assert.equal(squad.buffStacks, LW.config.weapon.maxStacks, '중첩 상한이 없으면 무한 연사가 된다');
  const capped = squad.interval();
  squad.pickUpWeapon();
  assert.equal(squad.interval(), capped);
});

test('버프는 시간이 지나면 풀린다', () => {
  const run = newRun(1);
  const squad = run.squad;
  const base = squad.interval();
  squad.pickUpWeapon();
  assert.ok(squad.interval() < base);
  const ended = squad.tickBuff(LW.config.weapon.duration + 0.1);
  assert.equal(ended, true, '만료 시점을 알려야 HUD·소리를 끌 수 있다');
  assert.equal(squad.buffStacks, 0);
  assert.equal(squad.interval(), base);
});

/** 드럼통을 지날 때까지 돌리고, 그동안 입은 피해 총량을 돌려준다.
 *  (게이트를 지나며 병력이 다시 늘 수 있으므로 최종 인원 비교는 쓸 수 없다) */
function hurtWhilePassingBarrel(run, targetX) {
  const barrel = run.barrels[0];
  let hurt = 0;
  const input = { targetX: targetX };
  for (let i = 0; i < 60 * 6; i++) {
    for (const ev of LW.run.update(run, 1 / 60, input)) if (ev.type === 'hurt') hurt += ev.amount;
    if (barrel.passed || barrel.broken) break;
  }
  return hurt;
}

test('드럼통에 적힌 수만큼 맞혀야 터진다 (화력과 무관하게 한 발 = 한 번)', () => {
  for (const hits of [2, 3, 5]) {
    for (const damage of [0, 8]) {
      const run = newRun(1, { damage: damage });
      run.barrels.length = 0;
      run.barrels.push({
        x: run.squad.x, y: run.dist + 12, hits: hits, maxHits: hits,
        broken: false, passed: false, flash: 0, bob: 0,
      });
      const barrel = run.barrels[0];
      let fired = 0;
      // 마지막 한 발을 남길 때까지 쏘면 아직 멀쩡해야 한다
      simulateUntil(LW, run, () => barrel.hits <= 1, 6, (r, input) => {
        input.targetX = barrel.x;
      });
      assert.equal(barrel.broken, false, hits + '번짜리가 ' + (hits - 1) + '번에 터졌다');
      assert.equal(run.guns.length, 0, '아직 총이 떨어지면 안 된다');
      simulateUntil(LW, run, () => barrel.broken, 3, (r, input) => {
        input.targetX = barrel.x;
      });
      assert.equal(barrel.broken, true, hits + '번짜리가 다 맞혀도 안 터졌다 (화력 ' + damage + ')');
      assert.equal(run.guns.length, 1, '터졌는데 총이 안 떨어졌다');
      void fired;
    }
  }
});

test('구역이 오르면 드럼통에 적힌 수가 커진다 (상한까지)', () => {
  const atZone = (zone) =>
    LW.stage.build(LW.config.chapterOf(zone, 1), 10).events.filter((e) => e.type === 'barrel')[0].hits;
  assert.equal(atZone(1), LW.config.barrel.hits, '1구역은 기본 타격 수여야 한다');
  assert.ok(atZone(5) > atZone(1), '후반 드럼통이 더 단단해지지 않는다');
  assert.ok(atZone(11) <= LW.config.barrel.maxHits, '상한을 넘겼다');
  // 같은 구역 안 3챕터는 같은 타격 수 — 구역이 바뀔 때만 오른다
  const z3 = [1, 2, 3].map((part) =>
    LW.stage.build(LW.config.chapterOf(3, part), 10).events.filter((e) => e.type === 'barrel')[0].hits
  );
  assert.equal(new Set(z3).size, 1, '같은 구역 안에서 타격 수가 달라진다: ' + z3);
});

test('드럼통을 안 터뜨리고 박으면 병력을 잃는다', () => {
  const run = runWithBarrel(0, 9999); // 도달 전에 다 맞힐 수 없게
  const hurt = hurtWhilePassingBarrel(run, run.barrels[0].x);
  assert.equal(hurt, LW.config.barrel.crushCost, '박았는데 아무 일도 없다');
  assert.equal(run.guns.length, 0, '박아서 부순 드럼통은 총을 주지 않는다');
});

test('옆으로 비켜 지나가면 드럼통은 그냥 남는다', () => {
  const run = runWithBarrel(3.2, 9999);
  const hurt = hurtWhilePassingBarrel(run, -3.5);
  assert.equal(hurt, 0, '피했는데 피해를 입었다');
});

/* ---------------- 페이크 게이트 ---------------- */

test('×0 은 이득 문이 아니다 (색만 초록이다)', () => {
  const fake = { op: 'mul', value: 0, fake: true };
  assert.equal(LW.gates.isBuff(fake), false, '숫자로 보면 손해다');
  assert.equal(LW.gates.looksBuff(fake), true, '겉모습은 이득처럼 보여야 페이크다');
  assert.equal(LW.gates.apply(500, fake), 0);
  assert.equal(LW.gates.label(fake), '×0');
});

test('페이크는 색만 거짓이고 문에 적힌 연산은 정직하다', () => {
  const fake = { op: 'div', value: 3, fake: true };
  assert.equal(LW.gates.label(fake), '÷3', '적힌 연산이 거짓이면 읽어도 알 수 없다');
  assert.equal(LW.gates.apply(30, fake), 10, '적힌 대로 계산되어야 공정하다');
});

test('페이크는 3구역부터, 구역당 최대 하나', () => {
  for (let stage = 1; stage <= 12; stage++) {
    const gates = LW.stage.build(stage, 20).events.filter((e) => e.type === 'gate');
    const fakes = gates.filter((g) => g.doors.some((door) => door.fake));
    if (stage < 3) assert.equal(fakes.length, 0, stage + '구역엔 페이크가 없어야 한다');
    assert.ok(fakes.length <= 1, stage + '구역 페이크가 너무 많다');
    // 첫 게이트는 항상 정직해야 한다 (배우기 전에 당하면 안 된다)
    assert.ok(!gates[0].doors.some((door) => door.fake), '첫 게이트가 페이크다');
  }
});

test('어느 게이트에도 살 길이 있다 (이득 문이 최소 하나)', () => {
  for (let stage = 1; stage <= 12; stage++) {
    for (const gate of LW.stage.build(stage, 20).events.filter((e) => e.type === 'gate')) {
      const buffs = gate.doors.filter((door) => LW.gates.isBuff(door));
      assert.ok(buffs.length >= 1, stage + '구역에 살 길이 없는 게이트가 있다');
      // 페이크는 반드시 손해 쪽에만 붙는다 — 둘 다 초록이면 둘 다 진짜다.
      if (buffs.length === 2) assert.ok(!gate.doors.some((d) => d.fake), stage + '구역: 둘 다 초록인데 페이크가 있다');
    }
  }
});

test('둘 다 초록인 게이트가 실제로 코스에 나온다 (구역당 최대 2개)', () => {
  for (let stage = 1; stage <= 12; stage++) {
    const gates = LW.stage.build(stage, 20).events.filter((e) => e.type === 'gate');
    const bothGood = gates.filter((g) => g.doors.every((d) => LW.gates.isBuff(d)));
    assert.ok(bothGood.length <= 2, stage + '구역에 둘 다 초록인 게이트가 ' + bothGood.length + '개나 있다');
  }
  // 여러 구역을 합쳐 보면 반드시 등장한다
  let total = 0;
  for (let stage = 1; stage <= 12; stage++) {
    total += LW.stage
      .build(stage, 20)
      .events.filter((e) => e.type === 'gate' && e.doors.every((d) => LW.gates.isBuff(d))).length;
  }
  assert.ok(total >= 6, '둘 다 초록인 게이트가 너무 드물다: ' + total);
});

test('×0 을 통과하면 전멸한다 (진짜로 위험하다)', () => {
  const run = newRun(1);
  run.gates.length = 0;
  run.gates.push({ y: run.dist + 6, doors: [{ op: 'mul', value: 0, fake: true }, { op: 'mul', value: 2 }], used: false, flash: 0 });
  simulate(LW, run, 4, (r, input) => {
    input.targetX = -2.5; // 왼쪽 = ×0
  });
  assert.equal(run.squad.count, 0);
  assert.equal(run.phase, 'lost');
});

test('자동 플레이는 페이크에 속지 않는다 (숫자로 판단하니까)', () => {
  const { makeAutopilot } = require('./autopilot');
  const pilot = makeAutopilot(LW);
  const run = newRun(5);
  run.gates.length = 0;
  run.gates.push({ y: run.dist + 8, doors: [{ op: 'mul', value: 0, fake: true }, { op: 'add', value: 5 }], used: false, flash: 0 });
  simulateUntil(LW, run, (r) => r.gates[0].used, 5, pilot.smart);
  assert.ok(run.squad.count > 0, '페이크 문으로 들어갔다');
});
