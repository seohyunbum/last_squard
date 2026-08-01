/* 버티기 모드 — 부대는 제자리, 왼쪽에서 게이트 · 오른쪽에서 즉사 드럼통. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadGame, simulate } = require('./helper');

const LW = loadGame();

function newSurvival(levels) {
  const mods = LW.upgrades.resolve(Object.assign({ start: 0, damage: 0, fire: 0, speed: 0, loot: 0 }, levels));
  return LW.run.create(1, mods, { endless: true });
}

test('버티기는 끝이 없다 (보스도, 코스 끝도 없다)', () => {
  const run = newSurvival();
  assert.equal(run.endless, true);
  assert.equal(run.plan.bossY, Infinity);
  assert.equal(run.plan.stage, 0, '구역 해금에 섞이면 안 된다');
  simulate(LW, run, 12, (r, input) => {
    input.targetX = -2.2;
  });
  assert.equal(run.boss, null, '버티기에 보스가 나왔다');
  assert.notEqual(run.phase, 'won', '버티기에는 승리가 없다');
});

test('코스가 필요한 만큼 계속 이어진다', () => {
  const run = newSurvival();
  const before = run.plan.events.length;
  simulate(LW, run, 20, (r, input) => {
    input.targetX = -2.2;
  });
  assert.ok(run.plan.events.length > before, '앞쪽 코스가 더 만들어지지 않았다');
  assert.ok(
    run.plan.events.every((e, i, a) => i === 0 || a[i - 1].y <= e.y),
    '이어 붙인 뒤 y 순서가 깨졌다'
  );
});

test('게이트는 왼쪽에만, 드럼통은 오른쪽에만 나온다', () => {
  const plan = LW.survival.build({ startCount: 10 });
  plan.extend(1200, 0);
  const gates = plan.events.filter((e) => e.type === 'gate');
  const barrels = plan.events.filter((e) => e.type === 'barrel');
  assert.ok(gates.length > 20 && barrels.length > 40, '표본이 너무 적다');
  for (const g of gates) {
    assert.equal(g.solo, true, '버티기 게이트는 문이 하나여야 한다');
    assert.equal(g.doors.length, 1);
    assert.ok(g.x + g.w / 2 <= 0, '게이트가 오른쪽으로 넘어왔다: ' + g.x);
    assert.ok(g.x - g.w / 2 >= -LW.config.world.roadHalfWidth, '게이트가 도로를 벗어났다');
  }
  for (const b of barrels) {
    assert.ok(b.x >= LW.config.survival.barrelLaneMin, '드럼통이 왼쪽으로 넘어왔다: ' + b.x);
    assert.ok(b.x <= LW.config.world.roadHalfWidth, '드럼통이 도로를 벗어났다');
    assert.equal(b.lethal, true, '버티기 드럼통은 즉사여야 한다');
  }
});

test('드럼통에 깔리면 병력이 남아 있어도 즉시 끝난다', () => {
  const run = newSurvival({ damage: 0 });
  run.barrels.length = 0;
  run.barrels.push({
    x: run.squad.x, y: run.dist + 4, hits: 9999, maxHits: 9999,
    broken: false, passed: false, flash: 0, bob: 0, lethal: true,
  });
  const before = run.squad.count;
  assert.ok(before > 5, '깔리기 전에 병력이 충분해야 검증이 의미 있다');
  simulate(LW, run, 3, (r, input) => {
    input.targetX = r.barrels[0] ? r.barrels[0].x : 0;
  });
  assert.equal(run.phase, 'lost', '깔렸는데 살아 있다');
  assert.equal(run.squad.count, 0, '즉사인데 병력이 남았다');
});

test('구역 모드 드럼통은 즉사가 아니다 (병력만 잃는다)', () => {
  const plan = LW.stage.build(3, 10);
  assert.ok(
    plan.events.filter((e) => e.type === 'barrel').every((b) => !b.lethal),
    '구역 모드에 즉사 드럼통이 섞였다'
  );
});

test('문 하나를 비켜 지나가면 아무 일도 없다', () => {
  const run = newSurvival();
  run.gates.length = 0;
  run.gates.push({
    y: run.dist + 6, doors: [{ op: 'div', value: 2 }], used: false, flash: 0,
    solo: true, x: -3, w: LW.config.survival.gateWidth,
  });
  const before = run.squad.count;
  simulate(LW, run, 2.5, (r, input) => {
    input.targetX = 3.2; // 문 반대쪽으로 비킨다
  });
  assert.equal(run.gates[0].used, true, '문을 지나치지 못했다');
  assert.equal(run.squad.count, before, '비켰는데 병력이 변했다');
});

test('문 안으로 들어가면 적힌 연산이 적용된다', () => {
  const run = newSurvival();
  run.gates.length = 0;
  run.gates.push({
    y: run.dist + 6, doors: [{ op: 'add', value: 7 }], used: false, flash: 0,
    solo: true, x: -2.5, w: LW.config.survival.gateWidth,
  });
  const before = run.squad.count;
  simulate(LW, run, 2.5, (r, input) => {
    input.targetX = -2.5;
  });
  assert.equal(run.squad.count, before + 7, '문에 들어갔는데 병력이 안 늘었다');
});

test('버티기 병력 상한 — 진형이 도로를 막을 만큼 커지지 않는다', () => {
  const sv = LW.config.survival;
  const run = newSurvival();
  run.squad.count = sv.maxCount;
  run.gates.length = 0;
  run.gates.push({
    y: run.dist + 6, doors: [{ op: 'mul', value: 3 }], used: false, flash: 0,
    solo: true, x: -2.5, w: sv.gateWidth,
  });
  simulate(LW, run, 2.5, (r, input) => {
    input.targetX = -2.5;
  });
  assert.equal(run.squad.count, sv.maxCount, '상한을 넘겼다');

  // 상한 병력으로도 드럼통 차선을 피할 수 있어야 한다 (즉사를 피할 길이 있어야 공정하다)
  run.squad.count = sv.maxCount;
  const hw = run.squad.halfWidth();
  const limit = LW.config.world.roadHalfWidth - hw;
  const need = sv.barrelLaneMin - LW.config.barrel.radius - hw;
  assert.ok(-limit < need, '상한 병력이면 드럼통을 피할 수 없다 (진형 폭 ' + hw.toFixed(2) + ')');
});

test('버티기 결과는 구역 해금·별에 섞이지 않고 기록만 남는다', () => {
  const save = LW.save.fresh();
  save.bestStage = 3;
  const result = { win: false, endless: true, stage: 0, stars: 3, seconds: 82.5, tier: 4, coins: 100 };
  LW.save.applyResult(save, result);
  assert.equal(save.bestStage, 3, '버티기가 구역을 해금했다');
  assert.deepEqual(save.stars, {}, '버티기가 구역 별을 줬다');
  assert.equal(save.bestTime, 82.5, '버티기 기록이 저장되지 않았다');
  LW.save.applyResult(save, Object.assign({}, result, { seconds: 40 }));
  assert.equal(save.bestTime, 82.5, '더 짧은 기록으로 최고 기록이 덮였다');
});

test('버티기 진행 게이지는 다음 단계까지의 진행도다', () => {
  const run = newSurvival();
  run.dist = LW.config.survival.tierEvery * 1.5;
  assert.ok(Math.abs(LW.run.progress(run) - 0.5) < 0.01);
  assert.equal(LW.survival.tierAt(0), 1);
  assert.ok(LW.survival.tierAt(LW.config.survival.tierEvery * 3) > 1);
  assert.equal(LW.survival.tierAt(1e9), LW.config.survival.maxTier, '단계 상한이 없다');
});
