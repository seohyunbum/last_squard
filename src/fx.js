/* 화면 효과(뷰 전용) — 광고에서 보던 "큰 숫자가 뻥 뜨는" 연출.
 * 게임 규칙과 무관하다. run.update 가 뱉은 이벤트를 받아 떠오르는 텍스트로 바꾼다.
 */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const MAX_POPUPS = 24;
  const popups = [];
  for (let i = 0; i < MAX_POPUPS; i++) {
    popups.push({ active: false, x: 0, y: 0, rise: 0, life: 0, maxLife: 1, text: '', sub: '', color: '#fff', size: 1 });
  }

  function take() {
    for (const p of popups) if (!p.active) return p;
    return popups[0]; // 가장 오래된 것을 덮어쓴다
  }

  function push(x, y, text, sub, color, size, life) {
    const p = take();
    p.active = true;
    p.x = x;
    p.y = y;
    p.rise = 0;
    p.life = p.maxLife = life || 1.1;
    p.text = text;
    p.sub = sub || '';
    p.color = color;
    p.size = size || 1;
    return p;
  }

  /** 이번 프레임 이벤트 -> 연출 */
  function handle(events, run) {
    for (const ev of events) {
      if (ev.type === 'gate') {
        const buff = ev.delta >= 0;
        push(
          run.squad.x,
          run.dist + 1.2,
          (buff ? '+' : '') + ev.delta,
          '👥 ' + LW.util.formatCount(ev.count),
          buff ? '#7dffa8' : '#ff8b96',
          buff ? 1.35 : 1.1,
          1.25
        );
      } else if (ev.type === 'hurt' && ev.amount >= 3) {
        push(run.squad.x, run.dist + 0.8, '-' + ev.amount, '', '#ff8b96', 0.95, 0.8);
      } else if (ev.type === 'weapon') {
        push(run.squad.x, run.dist + 1.4, '연사 UP!', '×' + ev.stacks, '#ffe27a', 1.2, 1.1);
      } else if (ev.type === 'bossStart') {
        push(0, run.dist + 9, '대장 로봇!', '', '#ffd0d6', 1.5, 1.6);
      } else if (ev.type === 'win') {
        push(0, run.dist + 6, '돌파!', '', '#ffe27a', 1.9, 2);
      } else if (ev.type === 'lose') {
        push(run.squad.x, run.dist + 1, '전멸…', '', '#ff9aa4', 1.6, 2);
      }
    }
  }

  function update(dt) {
    for (const p of popups) {
      if (!p.active) continue;
      p.life -= dt;
      p.rise += dt * 52; // 화면 위로 떠오른다 (픽셀)
      if (p.life <= 0) p.active = false;
    }
  }

  function reset() {
    for (const p of popups) p.active = false;
  }

  LW.fx = { popups, handle, update, reset, push };
})(typeof globalThis !== 'undefined' ? globalThis : this);
