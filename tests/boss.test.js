/* 최종 보스 패턴 — 소환·부채꼴·돌진·난사를 번갈아 쓴다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helper');
const { makeAutopilot } = require('./autopilot');

const LW = loadGame();
const pilot = makeAutopilot(LW);
const DT = 1 / 60;

/** 최종 결전을 보스 앞에서 시작한다 (코스는 건너뛴다). */
function atFinalBoss(troops, levels) {
  const lv = levels == null ? 9 : levels;
  const mods = LW.upgrades.resolve({ start: lv, damage: lv, fire: lv, speed: lv, loot: lv });
  const run = LW.run.create(LW.config.chapterCount, mods, { final: true });
  run.eventIndex = run.plan.events.length;
  run.dist = run.plan.bossY - LW.config.boss.standoff - 0.1;
  LW.run.update(run, DT, { targetX: 0 });
  run.squad.count = troops || 400;
  for (const e of run.enemies) e.active = false;
  for (const b of run.bolts) b.active = false;
  return run;
}

/** 보스 체력과 병력을 고정한 채 원하는 패턴이 시작될 때까지 돌린다.
 *  (고정하지 않으면 보스가 먼저 죽어서 패턴을 볼 수 없다.) */
function advanceUntilPattern(run, id, ratio, maxSeconds) {
  const boss = run.boss;
  const input = { targetX: 0 };
  const troops = run.squad.count;
  const steps = ((maxSeconds || 60) / DT) | 0;
  for (let i = 0; i < steps; i++) {
    boss.hp = boss.maxHp * ratio;
    boss.dead = false;
    run.phase = 'boss';
    run.squad.count = troops;
    LW.run.update(run, DT, input);
    if (boss.pattern === id) return true;
  }
  return false;
}

/** 체력·병력을 고정한 채 한 프레임 (패턴 진행만 보고 싶을 때) */
function pinnedStep(run, ratio, input) {
  const boss = run.boss;
  boss.hp = boss.maxHp * ratio;
  boss.dead = false;
  if (run.phase !== 'lost') run.phase = 'boss';
  return LW.run.update(run, DT, input);
}

test('최종 보스만 패턴을 쓴다 (구역 대장은 그대로)', () => {
  const final = atFinalBoss(200);
  assert.equal(final.boss.final, true, '최종 보스에 패턴이 안 붙었다');
  assert.ok(final.boss.pattern, '패턴 상태가 없다');

  const mods = LW.upgrades.resolve({ start: 5, damage: 5, fire: 5, speed: 5, loot: 5 });
  const zone = LW.run.create(3, mods); // 1구역 3챕터 = 구역 대장
  zone.eventIndex = zone.plan.events.length;
  zone.dist = zone.plan.bossY - LW.config.boss.standoff - 0.1;
  LW.run.update(zone, DT, { targetX: 0 });
  assert.ok(zone.boss, '구역 대장이 없다');
  assert.ok(!zone.boss.final, '구역 대장에 최종 패턴이 붙었다');
});

test('최종 보스는 덩치와 체력이 구역 대장보다 크다', () => {
  const fin = LW.stage.buildFinal(10);
  const last = LW.stage.build(33, 10);
  assert.ok(fin.bossHp > last.bossHp * 3, '최종 보스가 충분히 단단하지 않다');
  assert.ok(LW.config.finalStage.bossRadiusMult > 1);
});

test('체력이 줄면 쓸 수 있는 패턴이 늘어난다', () => {
  const run = atFinalBoss(300);
  const boss = run.boss;
  const pools = [];
  for (const ratio of [1, 0.5, 0.2]) {
    boss.hp = boss.maxHp * ratio;
    pools.push(LW.boss.poolAt(boss).slice());
  }
  assert.ok(pools[1].length > pools[0].length, '중간 단계에서 패턴이 늘지 않았다');
  assert.ok(pools[2].length > pools[1].length, '마지막 단계에서 패턴이 늘지 않았다');
  assert.ok(!pools[0].includes('sweep'), '첫 단계부터 난사가 나온다');
  assert.ok(pools[2].includes('sweep'), '마지막 단계에도 난사가 없다');
});

test('네 패턴이 모두 나오고 같은 단계에서는 순서대로 돈다', () => {
  const run = atFinalBoss(400);
  const boss = run.boss;
  // 단계를 마지막(모든 패턴)으로 고정하고, 죽지 않게 체력을 계속 채운다
  const seen = [];
  const input = { targetX: 0 };
  for (let i = 0; i < 60 * 60; i++) {
    boss.hp = boss.maxHp * 0.2; // 3단계 유지
    run.squad.count = 400; // 전멸로 끝나지 않게
    for (const e of LW.run.update(run, DT, input)) {
      if (e.type === 'bossPattern') seen.push(e.pattern);
    }
  }
  const pool = LW.config.finalBoss.phases[2].use;
  for (const id of ['summon', 'fan', 'charge', 'sweep']) {
    assert.ok(seen.includes(id), id + ' 패턴이 한 번도 안 나왔다: ' + seen.join(','));
  }
  // 순서: 목록을 차례로 돈다
  const first = seen.slice(0, pool.length);
  const start = pool.indexOf(first[0]);
  for (let i = 0; i < first.length; i++) {
    assert.equal(first[i], pool[(start + i) % pool.length], '패턴 순서가 목록과 다르다: ' + seen.join(','));
  }
});

test('패턴 사이에는 숨 돌리는 시간이 있다', () => {
  const run = atFinalBoss(400);
  const boss = run.boss;
  let sawRest = false;
  const input = { targetX: 0 };
  for (let i = 0; i < 60 * 20; i++) {
    boss.hp = boss.maxHp * 0.9;
    run.squad.count = 400;
    LW.run.update(run, DT, input);
    if (boss.pattern === 'rest') sawRest = true;
  }
  assert.ok(sawRest, '패턴이 쉬지 않고 이어진다');
});

test('부채꼴 사격에는 반드시 살 구멍이 하나 있다', () => {
  const run = atFinalBoss(400);
  assert.ok(advanceUntilPattern(run, 'fan', 1, 40), '부채꼴 패턴에 도달하지 못했다');
  const input = { targetX: 0 };
  for (const b of run.bolts) b.active = false;
  // 한 번의 발사를 받아낸다
  for (let i = 0; i < 20; i++) {
    pinnedStep(run, 1, input);
    if (run.bolts.filter((b) => b.active).length > 0) break;
  }
  const bolts = run.bolts.filter((b) => b.active);
  assert.equal(bolts.length, LW.config.finalBoss.fan.bolts - 1, '구멍이 없다 (전부 채웠다)');
  assert.ok(bolts.length >= 4, '부채꼴이 너무 얇다: ' + bolts.length);
});

test('돌진은 겨냥 -> 달려듦 -> 물러남 순서로 진행되고, 피하면 안 맞는다', () => {
  const run = atFinalBoss(400);
  const boss = run.boss;
  assert.ok(advanceUntilPattern(run, 'charge', 0.2, 60), '돌진 패턴에 도달하지 못했다');
  assert.equal(boss.chargeState, 'windup', '겨냥 없이 바로 달려든다');

  const states = new Set();
  const input = { targetX: 0 };
  const before = run.squad.count;
  for (let i = 0; i < 60 * 8; i++) {
    // 보스 반대쪽으로 확실히 피한다
    input.targetX = boss.x > 0 ? -3.4 : 3.4;
    run.squad.count = before;
    pinnedStep(run, 0.2, input);
    states.add(boss.chargeState);
    if (boss.pattern !== 'charge') break;
  }
  assert.ok(states.has('rush'), '달려들지 않았다: ' + [...states].join(','));
  assert.equal(run.squad.count, before, '피했는데 병력을 잃었다');
});

test('돌진에 맞으면 병력을 크게 잃는다', () => {
  const run = atFinalBoss(400);
  const boss = run.boss;
  assert.ok(advanceUntilPattern(run, 'charge', 0.2, 60), '돌진 패턴에 도달하지 못했다');
  const before = run.squad.count;
  let hurt = 0;
  const input = { targetX: 0 };
  for (let i = 0; i < 60 * 8; i++) {
    input.targetX = boss.x; // 일부러 맞는다
    for (const e of pinnedStep(run, 0.2, input)) {
      if (e.type === 'hurt') hurt += e.amount;
    }
    if (boss.chargeState === 'back') break;
  }
  assert.ok(hurt >= LW.config.finalBoss.charge.contactCost, '돌진에 맞았는데 피해가 없다: ' + hurt);
  void before;
});

test('난사는 볼트가 좌우로 훑고 지나간다', () => {
  const run = atFinalBoss(400);
  const boss = run.boss;
  assert.ok(advanceUntilPattern(run, 'sweep', 0.15, 90), '난사 패턴에 도달하지 못했다');
  const input = { targetX: 0 };
  const xs = [];
  for (let i = 0; i < 60 * 4 && boss.pattern === 'sweep'; i++) {
    const before = run.bolts.filter((b) => b.active).length;
    pinnedStep(run, 0.15, input);
    const now = run.bolts.filter((b) => b.active);
    if (now.length > before) xs.push(now[now.length - 1].vx);
  }
  assert.ok(xs.length >= 4, '난사가 거의 쏘지 않았다: ' + xs.length);
  // 한쪽에서 다른 쪽으로 훑으므로 좌우 속도의 방향이 뒤집힌다
  assert.notEqual(Math.sign(xs[0]), Math.sign(xs[xs.length - 1]), '훑지 않고 한 곳만 쏜다');
});

test('최종 보스전은 패턴을 여러 번 보여줄 만큼 길다 (강화가 충분하면 이긴다)', () => {
  const lv = 9;
  const mods = LW.upgrades.resolve({ start: lv, damage: lv, fire: lv, speed: lv, loot: lv });
  const run = LW.run.create(LW.config.chapterCount, mods, { final: true });
  const input = { targetX: 0 };
  let bossStart = 0;
  const counts = {};
  for (let i = 0; i < 60 * 400; i++) {
    pilot.smart(run, input);
    const boss = run.boss;
    if (boss && boss.pattern === 'charge' && boss.chargeState !== 'back') {
      input.targetX = boss.x > 0 ? -3.2 : 3.2;
    }
    for (const e of LW.run.update(run, DT, input)) {
      if (e.type === 'bossStart') bossStart = run.time;
      if (e.type === 'bossPattern') counts[e.pattern] = (counts[e.pattern] || 0) + 1;
    }
    if (run.phase === 'won' || run.phase === 'lost') break;
  }
  assert.equal(run.phase, 'won', '강화 9 로도 최종 보스를 못 이긴다');
  const fight = run.time - bossStart;
  assert.ok(fight > 25, '보스전이 너무 짧아 패턴을 볼 수 없다: ' + fight.toFixed(0) + '초');
  assert.ok(fight < 150, '보스전이 너무 길다: ' + fight.toFixed(0) + '초');
  for (const id of ['summon', 'fan', 'charge', 'sweep']) {
    assert.ok((counts[id] || 0) >= 2, id + ' 패턴이 두 번도 안 나왔다: ' + JSON.stringify(counts));
  }
});
