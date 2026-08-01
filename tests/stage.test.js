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

test('33챕터 모두에 게이트와 적이 들어 있다', () => {
  assert.equal(LW.config.chapterCount, 33, '챕터 수가 33이 아니다');
  for (let ch = 1; ch <= LW.config.chapterCount; ch++) {
    const plan = LW.stage.build(ch, 10);
    const gates = plan.events.filter((e) => e.type === 'gate');
    const waves = plan.events.filter((e) => e.type === 'wave');
    assert.ok(gates.length >= 3, ch + '챕터 게이트가 너무 적다: ' + gates.length);
    assert.ok(waves.length >= 2, ch + '챕터 적 웨이브가 너무 적다: ' + waves.length);
    assert.ok(plan.bossY === plan.length);
    for (const e of plan.events) {
      assert.ok(e.y > 0 && e.y <= plan.bossY, ch + '챕터 이벤트가 코스 밖에 있다');
    }
  }
});

test('한 구역은 3챕터 — 3챕터에만 대장 로봇이 있다', () => {
  for (let zone = 1; zone <= LW.config.zoneCount; zone++) {
    for (let part = 1; part <= LW.config.chapters.perZone; part++) {
      const ch = LW.config.chapterOf(zone, part);
      const plan = LW.stage.build(ch, 10);
      assert.equal(plan.zone, zone, ch + '챕터의 구역이 틀렸다');
      assert.equal(plan.part, part, ch + '챕터의 순번이 틀렸다');
      if (part === 3) {
        assert.equal(plan.hasBoss, true, zone + '구역 3챕터에 대장이 없다');
        assert.ok(plan.bossHp > 0);
      } else {
        assert.equal(plan.hasBoss, false, zone + '구역 ' + part + '챕터에 대장이 있다');
      }
    }
  }
  // 구역이 오를수록 대장도 단단해진다
  const first = LW.stage.build(LW.config.chapterOf(1, 3), 10);
  const last = LW.stage.build(LW.config.chapterOf(11, 3), 10);
  assert.ok(last.bossHp > first.bossHp * 3, '후반 대장이 충분히 단단하지 않다');
});

test('보스 챕터가 앞 챕터보다 길다 (구역의 마무리)', () => {
  for (let zone = 1; zone <= LW.config.zoneCount; zone++) {
    const c1 = LW.stage.build(LW.config.chapterOf(zone, 1), 10);
    const c3 = LW.stage.build(LW.config.chapterOf(zone, 3), 10);
    assert.ok(c3.length > c1.length, zone + '구역 3챕터가 1챕터보다 짧다');
  }
});

test('최종 결전은 33챕터보다 어렵고 챕터 목록 밖이다', () => {
  const last = LW.stage.build(33, 10);
  const fin = LW.stage.buildFinal(10);
  assert.equal(fin.isFinal, true);
  assert.equal(fin.hasBoss, true);
  assert.ok(fin.bossHp > last.bossHp, '최종 보스가 33챕터 대장보다 약하다');
  assert.ok(fin.length > last.length, '최종 결전 코스가 더 짧다');
  assert.ok(fin.rewardBase > last.rewardBase * 2, '최종 결전 보상이 너무 적다');
  assert.ok(fin.chapter > LW.config.chapterCount, '최종 결전이 챕터 번호를 차지한다');
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

test('챕터가 오르면 적 체력·보상이 함께 오른다 (구역 안에서도)', () => {
  const c1 = LW.stage.build(1, 10);
  const c2 = LW.stage.build(2, 10);
  const c19 = LW.stage.build(19, 10);
  assert.ok(c2.enemyHpMult > c1.enemyHpMult, '같은 구역 안에서 난이도가 그대로다');
  assert.ok(c19.enemyHpMult > c2.enemyHpMult);
  assert.ok(c19.rewardBase > c1.rewardBase);
});

test('챕터 번호 계산이 서로 맞는다 (구역·순번 왕복)', () => {
  const cfg = LW.config;
  for (let ch = 1; ch <= cfg.chapterCount; ch++) {
    assert.equal(cfg.chapterOf(cfg.zoneOf(ch), cfg.partOf(ch)), ch, ch + '챕터 왕복이 깨졌다');
  }
  assert.equal(cfg.zoneOf(1), 1);
  assert.equal(cfg.partOf(3), 3);
  assert.equal(cfg.chapterOf(11, 3), 33, '마지막 챕터가 33이 아니다');
});

test('챕터 번호가 33을 넘어도 코스는 만들어진다 (방어적으로)', () => {
  const plan = LW.stage.build(40, 40);
  assert.ok(plan.events.length > 5);
  assert.ok(plan.theme.kinds.length > 0);
});
