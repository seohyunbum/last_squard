/* 테스트용 로더 — 브라우저 없이 게임 로직 모듈만 globalThis 에 올린다. */
'use strict';
const path = require('path');

const LOGIC_FILES = ['util', 'config', 'upgrades', 'save', 'squad', 'gates', 'stage', 'survival', 'boss', 'run'];

function loadGame() {
  delete globalThis.LW;
  for (const name of LOGIC_FILES) {
    const file = path.join(__dirname, '..', 'src', name + '.js');
    delete require.cache[require.resolve(file)];
    require(file);
  }
  return globalThis.LW;
}

/** localStorage 대역 */
function memoryStorage(initial) {
  const map = Object.assign({}, initial);
  return {
    map,
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
  };
}

/** 전투를 seconds 초 동안 고정 스텝으로 돌린다. onStep 으로 입력을 조작한다. */
function simulate(LW, run, seconds, onStep) {
  const dt = 1 / 60;
  const input = { targetX: run.squad.x };
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    if (onStep) onStep(run, input, i * dt);
    LW.run.update(run, dt, input);
    if (run.phase === 'won' || run.phase === 'lost') break;
  }
  return run;
}

/** 조건이 참이 되는 즉시 멈춘다 (그 뒤 손실이 섞이지 않게). */
function simulateUntil(LW, run, predicate, maxSeconds, onStep) {
  const dt = 1 / 60;
  const input = { targetX: run.squad.x };
  const steps = Math.round(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    if (onStep) onStep(run, input, i * dt);
    LW.run.update(run, dt, input);
    if (predicate(run)) return true;
    if (run.phase === 'won' || run.phase === 'lost') return false;
  }
  return false;
}

module.exports = { loadGame, memoryStorage, simulate, simulateUntil, LOGIC_FILES };
