/* localStorage 세이브. storage 를 주입받아 테스트 가능하게 둔다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const KEY = 'last-squad.save';
  const SAVE_VERSION = 2;

  function fresh() {
    return {
      version: SAVE_VERSION,
      coins: 0,
      bestChapter: 1, // 해금된 최고 챕터 (1..33)
      bestTime: 0, // 버티기 모드 최고 기록(초)
      levels: { start: 0, damage: 0, fire: 0, speed: 0, loot: 0 },
      stars: {}, // chapter -> 1..3
      finalCleared: false, // 최종 결전을 깼는가
      endingSeen: false, // 엔딩을 봤는가 (두 번째부터는 건너뛸 수 있게)
    };
  }

  /** 33챕터를 모두 깼는가 — 최종 결전 해금 조건. */
  function allChaptersCleared(data) {
    for (let ch = 1; ch <= LW.config.chapterCount; ch++) {
      if (!(data.stars[ch] >= 1)) return false;
    }
    return true;
  }

  /** 별을 받은 챕터 수 (홈 화면 표시용) */
  function clearedCount(data) {
    let n = 0;
    for (let ch = 1; ch <= LW.config.chapterCount; ch++) if (data.stars[ch] >= 1) n++;
    return n;
  }

  /** v1(구역 단위) 세이브를 챕터 단위로 옮긴다 — 진행도를 잃지 않게 넉넉히 환산한다. */
  function migrateFromZones(out, raw) {
    const per = LW.config.chapters.perZone;
    if (Number.isFinite(raw.bestStage)) {
      const zone = Math.max(1, Math.floor(raw.bestStage));
      out.bestChapter = LW.util.clamp((zone - 1) * per + 1, 1, LW.config.chapterCount);
    }
    if (raw.stars && typeof raw.stars === 'object') {
      for (const k of Object.keys(raw.stars)) {
        const zone = Math.floor(Number(k));
        const stars = LW.util.clamp(Math.floor(Number(raw.stars[k])), 1, 3);
        if (!(zone >= 1) || !(stars >= 1)) continue;
        // 깼던 구역의 3챕터를 모두 그 별로 인정한다
        for (let part = 1; part <= per; part++) {
          const ch = (zone - 1) * per + part;
          if (ch <= LW.config.chapterCount) out.stars[ch] = stars;
        }
      }
    }
  }

  /** 어떤 잡값이 와도 항상 정상 세이브를 돌려준다. */
  function normalize(raw) {
    const base = fresh();
    if (!raw || typeof raw !== 'object') return base;
    const out = base;
    if (Number.isFinite(raw.coins)) out.coins = Math.max(0, Math.floor(raw.coins));
    if (Number.isFinite(raw.bestTime)) out.bestTime = Math.max(0, raw.bestTime);
    if (raw.levels && typeof raw.levels === 'object') {
      for (const def of LW.upgrades.defs) {
        const v = raw.levels[def.id];
        if (Number.isFinite(v)) out.levels[def.id] = LW.util.clamp(Math.floor(v), 0, def.maxLevel);
      }
    }

    if (Number(raw.version) < SAVE_VERSION || raw.bestChapter === undefined) {
      migrateFromZones(out, raw); // 구역 단위(v1) 세이브
    } else {
      if (Number.isFinite(raw.bestChapter)) {
        out.bestChapter = LW.util.clamp(Math.floor(raw.bestChapter), 1, LW.config.chapterCount);
      }
      if (raw.stars && typeof raw.stars === 'object') {
        for (const k of Object.keys(raw.stars)) {
          const ch = Math.floor(Number(k));
          const stars = Math.floor(Number(raw.stars[k]));
          if (ch >= 1 && ch <= LW.config.chapterCount && stars >= 1) {
            out.stars[ch] = LW.util.clamp(stars, 1, 3);
          }
        }
      }
      out.finalCleared = !!raw.finalCleared;
      out.endingSeen = !!raw.endingSeen;
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
    // 버티기는 구역 해금·별과 무관하다 — 기록만 남긴다.
    if (result.endless) {
      if (result.seconds > data.bestTime) data.bestTime = result.seconds;
      return data;
    }
    if (!result.win) return data;

    if (result.isFinal) {
      // 최종 결전 — 챕터 목록에 넣지 않고 클리어 표식만 남긴다
      data.finalCleared = true;
      return data;
    }

    const ch = result.chapter;
    const prev = data.stars[ch] || 0;
    if (result.stars > prev) data.stars[ch] = result.stars;
    if (ch + 1 > data.bestChapter) {
      data.bestChapter = Math.min(LW.config.chapterCount, ch + 1);
    }
    return data;
  }

  LW.save = {
    KEY, SAVE_VERSION, fresh, normalize, makeRepository, applyResult,
    allChaptersCleared, clearedCount,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
