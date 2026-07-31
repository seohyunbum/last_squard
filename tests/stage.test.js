'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helper');

const LW = loadGame();

test('같은 구역은 항상 같은 코스가 나온다 (시드 고정)', () => {
  const a = LW.stage.build(3, 10);
  const b = LW.stage.build(3, 10);
  assert.equal(a.events.length, b.events.length);
  assert.deepEqual(a.events.map((e) => e.type + ':' + e.y.toFixed(3)), b.events.map((e) => e.type + ':' + e.y.toFixed(3)));
});

test('구역마다 코스가 다르다', () => {
  const a = LW.stage.build(1, 10);
  const b = LW.stage.build(2, 10);
  assert.notEqual(
    a.events.map((e) => e.type).join(),
    b.events.map((e) => e.type).join()
  );
});

test('이벤트는 거리순으로 정렬되어 있다', () => {
  const plan = LW.stage.build(5, 20);
  for (let i = 1; i < plan.events.length; i++) {
    assert.ok(plan.events[i].y >= plan.events[i - 1].y, i + '번째 이벤트가 뒤로 갔다');
  }
});

test('모든 구역에 게이트·적·보스가 들어 있다', () => {
  for (let stage = 1; stage <= LW.config.stageCount; stage++) {
    const plan = LW.stage.build(stage, 10);
    const gates = plan.events.filter((e) => e.type === 'gate');
    const waves = plan.events.filter((e) => e.type === 'wave');
    assert.ok(gates.length >= 3, stage + '구역 게이트가 너무 적다');
    assert.ok(waves.length >= 3, stage + '구역 적 웨이브가 너무 적다');
    assert.ok(plan.bossHp > 0);
    assert.ok(plan.bossY === plan.length);
    for (const e of plan.events) {
      assert.ok(e.y > 0 && e.y <= plan.bossY, '이벤트가 코스 밖에 있다');
    }
  }
});

test('적은 도로 안에서만 나온다', () => {
  const half = LW.config.world.roadHalfWidth;
  for (let stage = 1; stage <= LW.config.stageCount; stage++) {
    for (const ev of LW.stage.build(stage, 10).events) {
      if (ev.type !== 'wave') continue;
      for (const entry of ev.entries) {
        assert.ok(Math.abs(entry.x) <= half, stage + '구역 적이 도로를 벗어났다');
      }
    }
  }
});

test('구역이 오르면 길이·적 체력·보스 체력이 함께 오른다', () => {
  const s1 = LW.stage.build(1, 10);
  const s7 = LW.stage.build(7, 10);
  assert.ok(s7.length > s1.length);
  assert.ok(s7.enemyHpMult > s1.enemyHpMult);
  assert.ok(s7.bossHp > s1.bossHp);
  assert.ok(s7.rewardBase > s1.rewardBase);
});

test('10구역을 넘어도 (무한 전선) 코스가 만들어진다', () => {
  const plan = LW.stage.build(14, 40);
  assert.ok(plan.events.length > 5);
  assert.ok(plan.name.includes('14'));
  assert.ok(plan.theme.kinds.length > 0);
});
