/* localStorage 세이브. storage 를 주입받아 테스트 가능하게 둔다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const KEY = 'last-squad.save';
  const SAVE_VERSION = 1;

  function fresh() {
    return {
      version: SAVE_VERSION,
      coins: 0,
      bestStage: 1, // 해금된 최고 구역
      levels: { start: 0, damage: 0, fire: 0, speed: 0, loot: 0 },
      stars: {}, // stage -> 0..3
    };
  }

  /** 어떤 잡값이 와도 항상 정상 세이브를 돌려준다. */
  function normalize(raw) {
    const base = fresh();
    if (!raw || typeof raw !== 'object') return base;
    const out = base;
    if (Number.isFinite(raw.coins)) out.coins = Math.max(0, Math.floor(raw.coins));
    if (Number.isFinite(raw.bestStage)) out.bestStage = Math.max(1, Math.floor(raw.bestStage));
    if (raw.levels && typeof raw.levels === 'object') {
      for (const def of LW.upgrades.defs) {
        const v = raw.levels[def.id];
        if (Number.isFinite(v)) out.levels[def.id] = LW.util.clamp(Math.floor(v), 0, def.maxLevel);
      }
    }
    if (raw.stars && typeof raw.stars === 'object') {
      for (const k of Object.keys(raw.stars)) {
        const stage = Math.floor(Number(k));
        const stars = Math.floor(Number(raw.stars[k]));
        if (stage >= 1 && stars >= 1) out.stars[stage] = LW.util.clamp(stars, 1, 3);
      }
    }
    return out;
  }

  function makeRepository(storage) {
    return {
      load() {
        try {
          const text = storage.getItem(KEY);
          return normalize(text ? JSON.parse(text) : null);
        } catch (err) {
          return fresh();
        }
      },
      save(data) {
        try {
          storage.setItem(KEY, JSON.stringify(normalize(data)));
          return true;
        } catch (err) {
          return false;
        }
      },
      clear() {
        try {
          storage.removeItem(KEY);
        } catch (err) {
          /* 저장 불가 환경(시크릿 모드 등)은 조용히 무시 */
        }
      },
    };
  }

  /** 결과를 세이브에 반영 — 얻은 부품·별·해금 구역. */
  function applyResult(data, result) {
    data.coins += result.coins;
    if (result.win) {
      const prev = data.stars[result.stage] || 0;
      if (result.stars > prev) data.stars[result.stage] = result.stars;
      if (result.stage + 1 > data.bestStage) data.bestStage = result.stage + 1;
    }
    return data;
  }

  LW.save = { KEY, SAVE_VERSION, fresh, normalize, makeRepository, applyResult };
})(typeof globalThis !== 'undefined' ? globalThis : this);
