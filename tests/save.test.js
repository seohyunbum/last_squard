'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, memoryStorage } = require('./helper');

const LW = loadGame();

test('새 세이브는 1구역·부품 0 으로 시작한다', () => {
  const data = LW.save.fresh();
  assert.equal(data.coins, 0);
  assert.equal(data.bestStage, 1);
  assert.equal(data.levels.damage, 0);
  assert.equal(data.version, LW.save.SAVE_VERSION);
});

test('저장 -> 불러오기 왕복에서 값이 보존된다', () => {
  const storage = memoryStorage();
  const repo = LW.save.makeRepository(storage);
  const data = LW.save.fresh();
  data.coins = 1234;
  data.bestStage = 5;
  data.levels.damage = 3;
  data.stars[2] = 3;
  repo.save(data);

  const again = LW.save.makeRepository(storage).load();
  assert.equal(again.coins, 1234);
  assert.equal(again.bestStage, 5);
  assert.equal(again.levels.damage, 3);
  assert.equal(again.stars[2], 3);
});

test('깨진 세이브·잡값도 게임을 멈추지 않는다', () => {
  const broken = LW.save.makeRepository(memoryStorage({ 'last-squad.save': '{not json' })).load();
  assert.equal(broken.coins, 0);

  const weird = LW.save.normalize({ coins: -50, bestStage: 0, levels: { damage: 999, nope: 3 }, stars: { 3: 9 } });
  assert.equal(weird.coins, 0);
  assert.equal(weird.bestStage, 1);
  assert.equal(weird.levels.damage, LW.upgrades.byId.damage.maxLevel, '레벨은 최대치로 잘린다');
  assert.equal(weird.stars[3], 3, '별은 3개를 넘지 않는다');
  assert.equal(weird.levels.nope, undefined);
});

test('승리 결과는 다음 구역을 해금하고 별을 갱신한다', () => {
  const data = LW.save.fresh();
  LW.save.applyResult(data, { win: true, stage: 1, stars: 2, coins: 100 });
  assert.equal(data.bestStage, 2);
  assert.equal(data.stars[1], 2);
  assert.equal(data.coins, 100);

  LW.save.applyResult(data, { win: true, stage: 1, stars: 1, coins: 10 });
  assert.equal(data.stars[1], 2, '별은 내려가지 않는다');
  assert.equal(data.bestStage, 2);
});

test('패배해도 부품은 챙기지만 해금은 안 된다', () => {
  const data = LW.save.fresh();
  LW.save.applyResult(data, { win: false, stage: 1, stars: 0, coins: 12 });
  assert.equal(data.coins, 12);
  assert.equal(data.bestStage, 1);
});

test('업그레이드 비용은 레벨마다 오르고 MAX 에서 무한이 된다', () => {
  const c0 = LW.upgrades.costOf('damage', 0);
  const c5 = LW.upgrades.costOf('damage', 5);
  assert.ok(c5 > c0);
  assert.equal(LW.upgrades.costOf('damage', LW.upgrades.byId.damage.maxLevel), Infinity);
});
