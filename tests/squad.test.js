'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helper');

const LW = loadGame();
const mods = LW.upgrades.resolve({});

test('진형은 병력 수만큼 자리를 만들고 상한에서 멈춘다', () => {
  const out = [];
  LW.squad.fillFormation(out, 5);
  assert.equal(out.length, 5);
  LW.squad.fillFormation(out, 23);
  assert.equal(out.length, 23);
  LW.squad.fillFormation(out, 5000);
  assert.equal(out.length, LW.config.squad.maxDrawn, '그리는 인원에 상한이 있어야 성능이 유지된다');
});

test('진형은 각 줄이 중앙 정렬이고 앞줄이 y=0 이다', () => {
  const out = LW.squad.fillFormation([], 9);
  const sum = out.reduce((acc, s) => acc + s.x, 0);
  assert.ok(Math.abs(sum) < 1e-9, '줄마다 중앙 정렬이 아니다');
  assert.ok(out.every((s) => s.y <= 0));
  assert.ok(out.some((s) => s.y === 0), '앞줄이 없다');
});

test('병력이 늘면 진형이 넓어진다 (넓어진 만큼 피하기 어려워진다)', () => {
  const small = LW.squad.perRowFor(10);
  const mid = LW.squad.perRowFor(100);
  const huge = LW.squad.perRowFor(900);
  assert.ok(small < mid && mid <= huge);
  assert.equal(huge, LW.config.squad.maxPerRow, '진형 폭에 상한이 없으면 도로를 넘는다');
  const widest = ((LW.config.squad.maxPerRow - 1) * LW.config.squad.spacingX) / 2;
  assert.ok(widest < LW.config.world.roadHalfWidth, '가장 넓은 진형도 도로 안에 들어와야 한다');
});

test('진형 배열을 재사용해도 이전 프레임 잔여물이 남지 않는다', () => {
  const out = [];
  LW.squad.fillFormation(out, 30);
  LW.squad.fillFormation(out, 4);
  assert.equal(out.length, 4);
});

test('화력은 병력 수에 비례하고, 총알 수는 상한을 지킨다', () => {
  const small = LW.squad.makeSquad(10, mods);
  const big = LW.squad.makeSquad(200, mods);
  assert.ok(big.volleyDamage() > small.volleyDamage() * 19);
  assert.ok(big.volleyBullets() <= LW.config.squad.maxBulletsPerVolley);
  assert.ok(small.volleyBullets() >= 1);
});

test('업그레이드가 화력·연사에 실제로 반영된다', () => {
  const base = LW.squad.makeSquad(20, LW.upgrades.resolve({}));
  const buffed = LW.squad.makeSquad(20, LW.upgrades.resolve({ damage: 5, fire: 5 }));
  assert.ok(buffed.volleyDamage() > base.volleyDamage());
  assert.ok(buffed.interval() < base.interval());
});

test('병력 손실은 0 에서 멈추고 alive() 가 꺼진다', () => {
  const squad = LW.squad.makeSquad(3, mods);
  squad.lose(10);
  assert.equal(squad.count, 0);
  assert.equal(squad.alive(), false);
});

test('진형이 커지면 판정 폭도 커진다 (넓은 부대는 더 잘 맞는다)', () => {
  const thin = LW.squad.makeSquad(2, mods);
  const wide = LW.squad.makeSquad(40, mods);
  assert.ok(wide.halfWidth() > thin.halfWidth());
  assert.ok(wide.depth() > thin.depth());
});
