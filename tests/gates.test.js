'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helper');

const LW = loadGame();

test('게이트 연산이 병력 수를 정확히 바꾼다', () => {
  assert.equal(LW.gates.apply(10, { op: 'add', value: 7 }), 17);
  assert.equal(LW.gates.apply(10, { op: 'mul', value: 3 }), 30);
  assert.equal(LW.gates.apply(10, { op: 'sub', value: 4 }), 6);
  assert.equal(LW.gates.apply(11, { op: 'div', value: 2 }), 5); // 내림
});

test('병력은 0 밑으로 내려가지 않고 상한을 넘지 않는다', () => {
  assert.equal(LW.gates.apply(3, { op: 'sub', value: 99 }), 0);
  assert.equal(LW.gates.apply(1, { op: 'div', value: 5 }), 0);
  const max = LW.config.squad.maxCount;
  assert.equal(LW.gates.apply(max, { op: 'mul', value: 3 }), max);
});

test('라벨은 아이가 읽을 수 있는 기호로 나온다', () => {
  assert.equal(LW.gates.label({ op: 'add', value: 12 }), '+12');
  assert.equal(LW.gates.label({ op: 'mul', value: 2 }), '×2');
  assert.equal(LW.gates.label({ op: 'sub', value: 5 }), '−5');
  assert.equal(LW.gates.label({ op: 'div', value: 2 }), '÷2');
});

test('문 한 쌍은 항상 이득 하나 + 손해 하나 (고민할 가치가 있게)', () => {
  for (let seed = 1; seed < 60; seed++) {
    const rng = LW.util.makeRng(seed);
    const pair = LW.gates.makePair(rng, 20 + seed, 1 + (seed % 9));
    const buffs = pair.filter((d) => LW.gates.isBuff(d)).length;
    assert.equal(buffs, 1, 'seed ' + seed + ' 에서 이득 문이 1개가 아니다');
    const outcomes = pair.map((d) => LW.gates.apply(30, d));
    assert.ok(outcomes[0] !== outcomes[1], '두 문의 결과가 같으면 선택이 무의미하다');
  }
});

test('더하기 게이트 값은 후반 병력 규모에 맞춰 커진다', () => {
  const small = [];
  const big = [];
  for (let seed = 1; seed < 40; seed++) {
    small.push(...LW.gates.makePair(LW.util.makeRng(seed), 10, 1).filter((d) => d.op === 'add').map((d) => d.value));
    big.push(...LW.gates.makePair(LW.util.makeRng(seed), 300, 9).filter((d) => d.op === 'add').map((d) => d.value));
  }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  assert.ok(avg(big) > avg(small) * 3, '후반 더하기 값이 초반과 비슷하면 의미가 없다');
});
