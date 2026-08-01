/* 적대적 테스트 — 규칙을 깨려고 일부러 못된 입력을 던지고, 불변식이 버티는지 본다.
 *
 * 앞의 테스트들은 "정상적으로 플레이하면 되는가" 를 본다. 여기서는 반대로 본다 —
 * 입력에 NaN·무한대를 넣고, 매 프레임 좌우로 진동시키고, dt 를 비정상으로 주고,
 * 저장값을 망가뜨리고, 병력 0 과 상한 경계를 두드린다.
 *
 * 기준은 셋이다.
 *   1. 숫자가 망가지지 않는다 (NaN·무한대·음수 병력 없음)
 *   2. 부대가 도로 밖으로 나가지 않는다
 *   3. 판이 반드시 끝난다 (무한 진행 없음)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGame, memoryStorage } = require(path.join(__dirname, 'helper'));
const { makeAutopilot } = require(path.join(__dirname, 'autopilot'));

const LW = loadGame();
const pilot = makeAutopilot(LW);
const DT = 1 / 60;
const MAX_STEPS = 240 * 60;

function newRun(stage, levels) {
  return LW.run.create(stage, LW.upgrades.resolve(levels || {}));
}

/** 한 판을 끝까지 돌리며 매 프레임 불변식을 확인한다. */
function playChecked(run, policy, opts) {
  const input = { targetX: 0 };
  const half = LW.config.world.roadHalfWidth;
  const max = (opts && opts.maxSteps) || MAX_STEPS;
  const dtOf = (opts && opts.dt) || (() => DT);
  let prevDist = -Infinity;
  let steps = 0;

  for (; steps < max; steps++) {
    policy(run, input, steps);
    LW.run.update(run, dtOf(steps), input);

    const c = run.squad.count;
    assert.ok(Number.isFinite(c), `병력이 유한하지 않다: ${c} (step ${steps})`);
    assert.ok(c >= 0, `병력이 음수다: ${c} (step ${steps})`);
    assert.ok(c <= LW.config.squad.maxCount, `병력이 상한을 넘었다: ${c}`);
    assert.ok(Number.isFinite(run.squad.x), `부대 x 가 유한하지 않다: ${run.squad.x}`);
    assert.ok(
      Math.abs(run.squad.x) <= half + 0.001,
      `부대가 도로 밖으로 나갔다: x=${run.squad.x} (한계 ${half})`,
    );
    assert.ok(Number.isFinite(run.dist), `진행도가 유한하지 않다: ${run.dist}`);
    assert.ok(run.dist >= prevDist - 0.001, `진행도가 뒤로 갔다: ${prevDist} → ${run.dist}`);
    prevDist = run.dist;

    if (run.phase === 'won' || run.phase === 'lost') break;
  }
  return { steps, phase: run.phase, ended: run.phase === 'won' || run.phase === 'lost' };
}

// ─── 못된 입력 ──────────────────────────────────────────────────────────────

test('입력에 NaN 을 넣어도 부대가 망가지지 않는다', () => {
  const run = newRun(1);
  const out = playChecked(run, (r, input) => {
    input.targetX = NaN;
  });
  assert.equal(out.ended, true, '판이 끝나지 않았다');
});

test('입력에 무한대를 넣어도 도로 밖으로 나가지 않는다', () => {
  for (const value of [Infinity, -Infinity, 1e9, -1e9]) {
    const run = newRun(1);
    playChecked(run, (r, input) => {
      input.targetX = value;
    });
  }
});

test('매 프레임 좌우로 진동시켜도 버틴다', () => {
  const run = newRun(3);
  const half = LW.config.world.roadHalfWidth;
  playChecked(run, (r, input, step) => {
    input.targetX = step % 2 === 0 ? half * 3 : -half * 3;
  });
});

test('입력 필드를 아예 지워도 죽지 않는다', () => {
  const run = newRun(2);
  const input = {};
  for (let i = 0; i < 60 * 30; i++) {
    LW.run.update(run, DT, input);
    assert.ok(Number.isFinite(run.squad.count));
    if (run.phase === 'won' || run.phase === 'lost') break;
  }
});

test('dt 가 0 이면 상태가 흐르지 않는다', () => {
  const run = newRun(1);
  const before = { dist: run.dist, count: run.squad.count };
  for (let i = 0; i < 100; i++) LW.run.update(run, 0, { targetX: 0 });
  assert.equal(run.dist, before.dist, 'dt=0 인데 진행했다');
  assert.equal(run.squad.count, before.count);
});

test('dt 가 비정상적으로 커도 숫자가 깨지지 않는다', () => {
  const run = newRun(2);
  playChecked(run, (r, input) => {
    input.targetX = 0;
  }, { dt: (i) => (i % 10 === 0 ? 1.5 : DT), maxSteps: 60 * 240 });
});

test('dt 에 NaN 을 넣어도 숫자가 오염되지 않는다', () => {
  const run = newRun(1);
  for (let i = 0; i < 200; i++) LW.run.update(run, NaN, { targetX: 0 });
  assert.ok(Number.isFinite(run.squad.count), `병력이 오염됐다: ${run.squad.count}`);
  assert.ok(Number.isFinite(run.dist), `진행도가 오염됐다: ${run.dist}`);
});

// ─── 경계 ───────────────────────────────────────────────────────────────────

test('병력이 0 이 되면 패배로 끝난다 — 음수로 내려가지 않는다', () => {
  const run = newRun(1);
  run.squad.add(-9999);
  assert.equal(run.squad.count, 0);
  for (let i = 0; i < 600; i++) {
    LW.run.update(run, DT, { targetX: 0 });
    assert.ok(run.squad.count >= 0);
    if (run.phase === 'lost' || run.phase === 'won') break;
  }
  assert.equal(run.phase, 'lost', '병력 0 인데 패배로 끝나지 않았다');
});

test('병력 상한을 넘겨 더해도 상한에서 멈춘다', () => {
  const run = newRun(1);
  run.squad.add(999999);
  assert.equal(run.squad.count, LW.config.squad.maxCount);
  run.squad.add(999999);
  assert.equal(run.squad.count, LW.config.squad.maxCount, '상한을 두 번 넘겼다');
});

test('가장 나쁜 문만 골라도 판은 끝난다 (무한 진행 없음)', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const run = newRun(stage);
    const out = playChecked(run, pilot.worst || pilot.dumb);
    assert.equal(out.ended, true, `${stage}구역: 끝나지 않았다`);
  }
});

test('아무 문도 안 고르고 가운데만 달려도 판은 끝난다', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const run = newRun(stage);
    const out = playChecked(run, pilot.dumb);
    assert.equal(out.ended, true, `${stage}구역: 끝나지 않았다`);
  }
});

test('무한 전선(10구역 초과)도 코스가 만들어지고 끝난다', () => {
  for (const stage of [11, 15, 25, 50]) {
    const run = newRun(stage);
    const out = playChecked(run, pilot.smart);
    assert.equal(out.ended, true, `${stage}구역: 끝나지 않았다`);
  }
});

// ─── 저장값 ─────────────────────────────────────────────────────────────────

test('저장값이 망가져 있어도 기지가 열린다', () => {
  const broken = [
    '{"bestStage":"열두","parts":null}',
    '{"bestStage":-999,"parts":-999,"levels":{"start":"많이"}}',
    '{"levels":{"start":9999,"없는항목":5}}',
    'not json at all',
    '[]',
    'null',
  ];
  for (const raw of broken) {
    const storage = memoryStorage({ [LW.save.KEY]: raw });
    const state = LW.save.makeRepository(storage).load();
    assert.ok(state && typeof state === 'object', `깨진 저장값에서 상태를 못 만들었다: ${raw}`);
    assert.ok(Number.isFinite(state.coins) && state.coins >= 0, `부품이 이상하다: ${state.coins}`);
    assert.ok(Number.isFinite(state.bestStage) && state.bestStage >= 1, `최고 구역이 이상하다: ${state.bestStage}`);
    const resolved = LW.upgrades.resolve(state.levels || {});
    assert.ok(Number.isFinite(resolved.startCount) && resolved.startCount > 0, '시작 병력이 이상하다');
  }
});
