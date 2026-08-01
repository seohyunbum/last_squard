/* 게이트: 라스트워식 병력 연산 문(+, ×, -, ÷). 문 하나만 통과한다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const OPS = ['add', 'mul', 'sub', 'div'];

  function apply(count, gate) {
    const max = LW.config.squad.maxCount;
    let next = count;
    switch (gate.op) {
      case 'add':
        next = count + gate.value;
        break;
      case 'mul':
        next = Math.floor(count * gate.value);
        break;
      case 'sub':
        next = count - gate.value;
        break;
      case 'div':
        next = Math.floor(count / gate.value);
        break;
      default:
        next = count;
    }
    return LW.util.clamp(next, 0, max);
  }

  function label(gate) {
    switch (gate.op) {
      case 'add':
        return '+' + gate.value;
      case 'mul':
        return '×' + gate.value;
      case 'sub':
        return '−' + gate.value;
      case 'div':
        return '÷' + gate.value;
      default:
        return '?';
    }
  }

  /** 실제로 이득인가 — 겉모습(fake)과 무관하게 숫자로만 판단한다. */
  function isBuff(gate) {
    if (gate.op === 'add') return gate.value > 0;
    if (gate.op === 'mul') return gate.value > 1;
    return false;
  }

  /** 겉모습만 이득처럼 보이는 문(페이크)인가 — 색은 초록인데 결과는 손해다. */
  function looksBuff(gate) {
    return gate.fake === true || isBuff(gate);
  }

  /**
   * 둘 다 초록(진짜 이득)인 한 쌍. 아무 쪽이나 이득이지만 한쪽이 더 크게 이득이라
   * 색이 아니라 숫자를 비교해야 한다 — ×2 와 +N 은 병력 수에 따라 유불리가 뒤집힌다.
   */
  function makeBothGood(rng, expected, stage) {
    const mul = { op: 'mul', value: rng.chance(0.15 + stage * 0.02) ? 3 : 2 };
    const grow = apply(expected, mul) - expected; // 곱하기로 늘어나는 양
    const gap = Math.max(3, Math.round(expected * 0.3)); // 결과가 확실히 벌어지게
    // 절반은 더하기가 유리하고 절반은 곱하기가 유리하다 — 매번 새로 읽어야 한다.
    const value = rng.chance(0.5)
      ? grow + gap
      : Math.max(3, Math.min(grow - gap, Math.round(grow * 0.7)));
    const pair = [mul, { op: 'add', value: value }];
    return rng.chance(0.5) ? pair : [pair[1], pair[0]];
  }

  /**
   * 현재 예상 병력에 맞춰 문 두 개를 만든다.
   * 기본은 이득 하나 + 손해 하나, 때때로 둘 다 초록(더 큰 쪽 고르기)이다.
   * expected 가 커지면 더하기 값도 같이 커져서 후반에도 의미가 있다.
   */
  /** 이득 문 후보들 — 예상 병력에 맞춰 값이 커진다. */
  function buffPool(rng, expected, stage) {
    const scale = Math.max(4, Math.round(expected * 0.45));
    return [
      { op: 'add', value: rng.int(Math.max(3, Math.round(scale * 0.5)), Math.max(6, scale)) },
      { op: 'add', value: rng.int(Math.max(5, scale), Math.max(9, Math.round(scale * 1.6))) },
      { op: 'mul', value: 2 },
      { op: 'mul', value: rng.chance(0.25 + stage * 0.02) ? 3 : 2 },
    ];
  }

  /** 손해 문 후보들 */
  function nerfPool(rng, expected) {
    const scale = Math.max(4, Math.round(expected * 0.45));
    return [
      { op: 'sub', value: rng.int(Math.max(3, Math.round(scale * 0.4)), Math.max(7, scale)) },
      { op: 'div', value: 2 },
      { op: 'div', value: rng.chance(0.3) ? 3 : 2 },
    ];
  }

  /**
   * 버티기 모드의 문 하나. 짝이 없으니 "들어갈까 피할까" 를 고른다 —
   * 그래서 손해 문도 마음껏 섞을 수 있다(피하면 되니까). 색이 거짓인 페이크는 후반부터.
   *
   * 값은 작게 고정한다. 버티기는 병력 상한이 있어 커질 여지가 없고,
   * 작은 수라야 아이가 다가오는 문을 읽고 판단할 수 있다.
   */
  function makeSolo(rng, tier) {
    if (rng.chance(0.5)) {
      if (rng.chance(0.14)) return { op: 'mul', value: 2 };
      return { op: 'add', value: rng.int(3, 9) };
    }
    const nerf = rng.chance(0.5)
      ? { op: 'sub', value: rng.int(4, 10) }
      : { op: 'div', value: 2 };
    if (tier >= 3 && rng.chance(0.22)) {
      return rng.chance(0.35)
        ? { op: 'mul', value: 0, fake: true } // 초록으로 보이는 ×0 — 들어가면 전멸
        : { op: nerf.op, value: nerf.value, fake: true };
    }
    return nerf;
  }

  function makePair(rng, expected, stage, opts) {
    if (opts && opts.allowBothGood) {
      const pair = makeBothGood(rng, expected, stage);
      // 두 문의 결과가 같으면 선택이 무의미하다 — 그럴 때만 보통 쌍으로 되돌린다.
      if (apply(expected, pair[0]) !== apply(expected, pair[1])) return pair;
    }
    const buffs = buffPool(rng, expected, stage);
    const nerfs = nerfPool(rng, expected);
    const buff = rng.pick(buffs);
    let nerf = rng.pick(nerfs);

    // 페이크 문: 초록으로 보이지만 실제로는 손해다. 색만 거짓이고 문에 적힌
    // 연산(×0, −7, ÷2)은 정직하다 — "색이 아니라 숫자를 읽어라" 를 가르치는 장치.
    if (opts && opts.allowFake && stage >= 3 && rng.chance(0.6)) {
      nerf = rng.chance(0.5)
        ? { op: 'mul', value: 0, fake: true } // ×0 — 통과하면 전멸
        : { op: nerf.op, value: nerf.value, fake: true };
    }
    // 좌우 배치는 무작위 — 아이가 매번 읽고 판단해야 한다.
    return rng.chance(0.5) ? [buff, nerf] : [nerf, buff];
  }

  LW.gates = { OPS, apply, label, isBuff, looksBuff, makePair, makeBothGood, makeSolo };
})(typeof globalThis !== 'undefined' ? globalThis : this);
