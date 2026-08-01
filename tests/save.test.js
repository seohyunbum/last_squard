'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, memoryStorage } = require('./helper');

const LW = loadGame();

test('새 세이브는 1챕터·부품 0 으로 시작한다', () => {
  const data = LW.save.fresh();
  assert.equal(data.coins, 0);
  assert.equal(data.bestChapter, 1);
  assert.equal(data.finalCleared, false);
  assert.equal(data.levels.damage, 0);
  assert.equal(data.version, LW.save.SAVE_VERSION);
});

test('저장 -> 불러오기 왕복에서 값이 보존된다', () => {
  const storage = memoryStorage();
  const repo = LW.save.makeRepository(storage);
  const data = LW.save.fresh();
  data.coins = 1234;
  data.bestChapter = 12;
  data.levels.damage = 3;
  data.stars[2] = 3;
  data.finalCleared = true;
  repo.save(data);

  const again = LW.save.makeRepository(storage).load();
  assert.equal(again.coins, 1234);
  assert.equal(again.bestChapter, 12);
  assert.equal(again.levels.damage, 3);
  assert.equal(again.stars[2], 3);
  assert.equal(again.finalCleared, true);
});

test('깨진 세이브·잡값도 게임을 멈추지 않는다', () => {
  const broken = LW.save.makeRepository(memoryStorage({ 'last-squad.save': '{not json' })).load();
  assert.equal(broken.coins, 0);

  const weird = LW.save.normalize({
    version: LW.save.SAVE_VERSION, coins: -50, bestChapter: 0,
    levels: { damage: 999, nope: 3 }, stars: { 3: 9, 99: 2 },
  });
  assert.equal(weird.coins, 0);
  assert.equal(weird.bestChapter, 1);
  assert.equal(weird.stars[99], undefined, '없는 챕터에 별이 붙었다');
  assert.equal(weird.levels.damage, LW.upgrades.byId.damage.maxLevel, '레벨은 최대치로 잘린다');
  assert.equal(weird.stars[3], 3, '별은 3개를 넘지 않는다');
  assert.equal(weird.levels.nope, undefined);
});

test('승리 결과는 다음 챕터를 해금하고 별을 갱신한다', () => {
  const data = LW.save.fresh();
  LW.save.applyResult(data, { win: true, chapter: 1, stars: 2, coins: 100 });
  assert.equal(data.bestChapter, 2);
  assert.equal(data.stars[1], 2);
  assert.equal(data.coins, 100);

  LW.save.applyResult(data, { win: true, chapter: 1, stars: 1, coins: 10 });
  assert.equal(data.stars[1], 2, '별은 내려가지 않는다');
  assert.equal(data.bestChapter, 2);

  // 마지막 챕터를 깨도 번호를 넘어가지 않는다
  LW.save.applyResult(data, { win: true, chapter: LW.config.chapterCount, stars: 3, coins: 0 });
  assert.equal(data.bestChapter, LW.config.chapterCount);
});

test('패배해도 부품은 챙기지만 해금은 안 된다', () => {
  const data = LW.save.fresh();
  LW.save.applyResult(data, { win: false, chapter: 1, stars: 0, coins: 12 });
  assert.equal(data.coins, 12);
  assert.equal(data.bestChapter, 1);
});

test('33챕터를 다 깨야 최종 결전이 열린다', () => {
  const data = LW.save.fresh();
  for (let ch = 1; ch < LW.config.chapterCount; ch++) {
    LW.save.applyResult(data, { win: true, chapter: ch, stars: 1, coins: 0 });
  }
  assert.equal(LW.save.clearedCount(data), LW.config.chapterCount - 1);
  assert.equal(LW.save.allChaptersCleared(data), false, '한 챕터가 남았는데 열렸다');

  LW.save.applyResult(data, { win: true, chapter: LW.config.chapterCount, stars: 1, coins: 0 });
  assert.equal(LW.save.allChaptersCleared(data), true, '33챕터를 다 깼는데 안 열린다');
});

test('최종 결전 클리어는 챕터 목록을 건드리지 않고 표식만 남긴다', () => {
  const data = LW.save.fresh();
  LW.save.applyResult(data, { win: true, isFinal: true, chapter: 34, stars: 3, coins: 500 });
  assert.equal(data.finalCleared, true);
  assert.equal(data.coins, 500);
  assert.deepEqual(data.stars, {}, '최종 결전이 챕터 별을 줬다');
  assert.equal(data.bestChapter, 1, '최종 결전이 챕터를 해금했다');
});

test('예전(구역 단위) 세이브를 챕터로 옮겨도 진행도를 잃지 않는다', () => {
  const old = JSON.stringify({ version: 1, coins: 500, bestStage: 4, stars: { 1: 3, 2: 2, 3: 1 }, levels: { start: 2 } });
  const data = LW.save.makeRepository(memoryStorage({ 'last-squad.save': old })).load();
  assert.equal(data.coins, 500, '부품을 잃었다');
  assert.equal(data.levels.start, 2, '강화 레벨을 잃었다');
  assert.equal(data.bestChapter, 10, '4구역 = 10챕터로 이어지지 않았다');
  // 깼던 구역의 3챕터가 모두 인정된다
  assert.equal(data.stars[1], 3);
  assert.equal(data.stars[3], 3);
  assert.equal(data.stars[6], 2);
  assert.equal(data.stars[9], 1);
  assert.equal(LW.save.clearedCount(data), 9);
});

test('업그레이드 비용은 레벨마다 오르고 MAX 에서 무한이 된다', () => {
  const c0 = LW.upgrades.costOf('damage', 0);
  const c5 = LW.upgrades.costOf('damage', 5);
  assert.ok(c5 > c0);
  assert.equal(LW.upgrades.costOf('damage', LW.upgrades.byId.damage.maxLevel), Infinity);
});
