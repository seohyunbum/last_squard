/* 공용 수학·난수 유틸. 어떤 모듈보다 먼저 로드된다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  /**
   * 범위로 자른다. **숫자가 아니면 `lo` 로 떨어뜨린다.**
   *
   * 그냥 비교만 하면 NaN 이 그대로 통과한다 — `NaN < lo` 도 `NaN > hi` 도 false 이기 때문이다.
   * 이 함수는 병력 수·부대 위치·총알 수를 모두 지나가므로, 여기가 뚫리면 NaN 하나가
   * 게임 전체를 오염시킨다(실측: 입력에 NaN 을 넣으면 부대 x 가 NaN 이 되어 사라졌다).
   */
  function clamp(v, lo, hi) {
    if (!Number.isFinite(v)) return lo;
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** cur 을 target 으로 초당 speed 비율만큼 부드럽게 당긴다 (프레임 독립). */
  function damp(cur, target, speed, dt) {
    return lerp(cur, target, 1 - Math.exp(-speed * dt));
  }

  /** 결정론적 난수 — 스테이지 생성은 같은 시드면 항상 같은 구성이 나와야 한다. */
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    const rng = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (lo, hi) => lo + rng() * (hi - lo);
    rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    return rng;
  }

  /** 1200 -> "1.2천" (병력 수가 커져도 HUD 가 안 깨지게) */
  function formatCount(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (Math.floor(n / 100) / 10).toFixed(1) + '천';
    return Math.floor(n / 1000) + '천';
  }

  /** 원-원 충돌 (제곱 비교로 sqrt 회피 — 핫패스에서 호출된다) */
  function hitCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const r = ar + br;
    return dx * dx + dy * dy <= r * r;
  }

  LW.util = { clamp, lerp, damp, makeRng, formatCount, hitCircle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
