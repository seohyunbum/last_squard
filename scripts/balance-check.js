/* 자동 플레이로 난이도를 점검한다 — "잘 고르면 이기고, 아무렇게나 하면 진다" 가 목표.
 * 실행: node scripts/balance-check.js [강화레벨]
 */
'use strict';
const path = require('path');
const { loadGame } = require(path.join(__dirname, '..', 'tests', 'helper'));
const { makeAutopilot } = require(path.join(__dirname, '..', 'tests', 'autopilot'));

const LW = loadGame();
const pilot = makeAutopilot(LW);
const smartInput = pilot.smart;
const dumbInput = pilot.dumb;
const DT = 1 / 60;
const MAX_SECONDS = 240;

function play(stage, levels, policy) {
  const run = LW.run.create(stage, LW.upgrades.resolve(levels));
  const input = { targetX: 0 };
  let peak = run.squad.count;
  for (let t = 0; t < MAX_SECONDS / DT; t++) {
    policy(run, input);
    LW.run.update(run, DT, input);
    peak = Math.max(peak, run.squad.count);
    if (run.phase === 'won' || run.phase === 'lost') break;
  }
  const result = LW.run.result(run);
  return { result, peak, seconds: run.time };
}

function pad(s, n) {
  s = String(s);
  return s + ' '.repeat(Math.max(0, n - s.length));
}

const levelArg = Number(process.argv[2] || 0);
const levels = { start: levelArg, damage: levelArg, fire: levelArg, speed: levelArg, loot: levelArg };
console.log('강화 레벨 ' + levelArg + ' 기준 (시작 병력 ' + LW.upgrades.resolve(levels).startCount + '명)\n');
console.log(pad('구역', 6) + pad('잘 고르면', 34) + '가운데만 달리면');

let smartWins = 0;
let dumbWins = 0;
for (let stage = 1; stage <= LW.config.stageCount; stage++) {
  const smart = play(stage, levels, smartInput);
  const dumb = play(stage, levels, dumbInput);
  if (smart.result.win) smartWins++;
  if (dumb.result.win) dumbWins++;
  const smartText =
    (smart.result.win ? '승리 ★' + smart.result.stars : '패배  ') +
    ' 최대 ' + pad(smart.peak, 4) + ' 생존 ' + pad(smart.result.survived, 4) +
    ' 🔩' + pad(smart.result.coins, 5);
  const dumbText = (dumb.result.win ? '승리 ★' + dumb.result.stars : '패배') + ' (최대 ' + dumb.peak + ')';
  console.log(pad(stage + '구역', 6) + pad(smartText, 34) + dumbText);
}

console.log('\n잘 고른 플레이: ' + smartWins + '/' + LW.config.stageCount + ' 승');
console.log('막 달린 플레이: ' + dumbWins + '/' + LW.config.stageCount + ' 승');

// 게이트 요령을 익히면 초반은 이겨야 하고, 아무렇게나 하면 전부 이기면 안 된다.
const ok = smartWins >= 3 && dumbWins < LW.config.stageCount;
if (!ok) {
  console.error('\n밸런스 경고: 난이도 곡선을 조정해야 한다.');
  process.exit(1);
}
