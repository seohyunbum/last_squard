/* 스쿼드: 병력 수 -> 진형 좌표 · 사격 · 손실. 렌더와 무관한 순수 로직. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  /**
   * 한 줄에 몇 명이 서는가 — 병력이 늘수록 진형이 넓어진다.
   * 넓은 부대는 화력이 세지만 그만큼 피하기 어려워진다 (밸런스의 핵심).
   */
  function perRowFor(count) {
    const cfg = LW.config.squad;
    const wide = cfg.basePerRow + Math.floor(Math.sqrt(Math.max(0, count)));
    return LW.util.clamp(wide, cfg.basePerRow, cfg.maxPerRow);
  }

  /**
   * 병력 수에 맞는 진형 오프셋(플레이어 중심 기준)을 채운다.
   * 핫패스에서 매 프레임 호출되므로 배열을 새로 만들지 않고 재사용한다.
   */
  function fillFormation(out, count) {
    const cfg = LW.config.squad;
    const drawn = Math.min(count, cfg.maxDrawn);
    const perRow = perRowFor(count);
    let i = 0;
    let row = 0;
    while (i < drawn) {
      const remain = drawn - i;
      const inRow = Math.min(perRow, remain);
      const rowWidth = (inRow - 1) * cfg.spacingX;
      for (let c = 0; c < inRow; c++) {
        let slot = out[i];
        if (!slot) slot = out[i] = { x: 0, y: 0, i: 0 };
        slot.x = -rowWidth / 2 + c * cfg.spacingX;
        slot.y = -row * cfg.spacingY;
        slot.i = i; // 달리기 애니메이션 위상용
        i++;
      }
      row++;
    }
    out.length = drawn;
    return out;
  }

  function makeSquad(count, mods) {
    const cfg = LW.config.squad;
    return {
      count: Math.max(1, Math.floor(count)),
      x: 0,
      targetX: 0,
      fireTimer: 0,
      formation: [],
      mods: mods,
      buffTimer: 0, // 총 픽업 남은 시간
      buffStacks: 0,
      /** 이번 볼리의 총 피해량 (병력 수 x 1명당 화력) */
      volleyDamage() {
        return this.count * cfg.damagePerUnit * this.mods.damageMult;
      },
      /** 총알 개수는 상한이 있고, 피해량은 총알에 균등 분배된다. */
      volleyBullets() {
        return LW.util.clamp(Math.ceil(this.count / 4), 1, cfg.maxBulletsPerVolley);
      },
      /** 총 픽업으로 더해지는 연사 배율 */
      fireBonus() {
        if (this.buffTimer <= 0) return 0;
        return this.buffStacks * LW.config.weapon.fireBonusPerStack;
      },
      interval() {
        return cfg.fireInterval / (this.mods.fireMult + this.fireBonus());
      },
      /** 총을 먹었다 — 시간 갱신 + 중첩 (상한까지) */
      pickUpWeapon() {
        const w = LW.config.weapon;
        this.buffStacks = Math.min(w.maxStacks, this.buffStacks + 1);
        this.buffTimer = w.duration;
        return this.buffStacks;
      },
      tickBuff(dt) {
        if (this.buffTimer <= 0) return false;
        this.buffTimer -= dt;
        if (this.buffTimer <= 0) {
          this.buffTimer = 0;
          this.buffStacks = 0;
          return true; // 이번 프레임에 끝났다
        }
        return false;
      },
      add(n) {
        this.count = LW.util.clamp(this.count + n, 0, cfg.maxCount);
      },
      lose(n) {
        this.count = Math.max(0, this.count - Math.max(1, Math.floor(n)));
      },
      alive() {
        return this.count > 0;
      },
      /** 진형 가로 반폭 — 충돌 판정에 쓴다. */
      halfWidth() {
        const inRow = Math.min(perRowFor(this.count), Math.max(1, this.count));
        return ((inRow - 1) * LW.config.squad.spacingX) / 2 + LW.config.squad.unitRadius;
      },
      /** 진형 세로 깊이 */
      depth() {
        const drawn = Math.min(this.count, LW.config.squad.maxDrawn);
        const rows = Math.max(1, Math.ceil(drawn / perRowFor(this.count)));
        return (rows - 1) * LW.config.squad.spacingY + LW.config.squad.unitRadius * 2;
      },
    };
  }

  LW.squad = { makeSquad, fillFormation, perRowFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
