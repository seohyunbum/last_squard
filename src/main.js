/* 지휘자: 캔버스 부팅 · 입력 · 루프 · 화면 전환 배선. 게임 규칙은 game 모듈에 있다. */
(function (global) {
  'use strict';
  const LW = global.LW;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const camera = LW.render.makeCamera(canvas);
  const repo = LW.save.makeRepository(safeStorage());
  let save = repo.load();

  let run = null;
  let mode = 'home'; // home | play | over
  let overTimer = 0;
  const input = { targetX: 0 };
  let dragging = false;
  let dragOriginX = 0;
  let dragOriginTarget = 0;
  const keys = { left: false, right: false };

  /** localStorage 가 막혀 있으면(공유 링크·시크릿 모드) 메모리에만 저장한다. */
  function safeStorage() {
    try {
      const s = global.localStorage;
      s.setItem('__probe__', '1');
      s.removeItem('__probe__');
      return s;
    } catch (err) {
      return memoryStorage();
    }
  }

  function memoryStorage() {
    const map = {};
    return {
      getItem: (k) => (k in map ? map[k] : null),
      setItem: (k, v) => {
        map[k] = String(v);
      },
      removeItem: (k) => {
        delete map[k];
      },
    };
  }

  function resize() {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }

  const ui = LW.ui.create({
    onPlayLatest: () => startRun(save.bestStage),
    onPlay: (stage) => startRun(stage),
    onUpgrade: () => ui.showUpgrade(save),
    onStages: () => ui.showStages(save),
    onHome: () => goHome(),
    onBuy: (id) => buy(id),
  });

  function goHome() {
    mode = 'home';
    run = null;
    ui.showHome(save);
  }

  function buy(id) {
    const level = save.levels[id] | 0;
    const cost = LW.upgrades.costOf(id, level);
    if (!Number.isFinite(cost) || save.coins < cost) return;
    save.coins -= cost;
    save.levels[id] = level + 1;
    repo.save(save);
    ui.showUpgrade(save);
  }

  function startRun(stage) {
    LW.audio.unlock();
    const mods = LW.upgrades.resolve(save.levels);
    run = LW.run.create(Math.max(1, stage), mods);
    LW.fx.reset();
    input.targetX = 0;
    mode = 'play';
    ui.beginRun(run);
  }

  function finishRun() {
    const result = LW.run.result(run);
    save = LW.save.applyResult(save, result);
    repo.save(save);
    ui.showResult(result, save);
    mode = 'result';
  }

  /* ---------------- 입력 ---------------- */

  function pointerToWorldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width; // 0..1
    const half = LW.config.world.roadHalfWidth;
    return (rel - 0.5) * 2 * half * 1.05;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'play') return;
    dragging = true;
    dragOriginX = e.clientX;
    dragOriginTarget = run ? run.squad.x : 0;
    canvas.setPointerCapture(e.pointerId);
    LW.audio.unlock();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || mode !== 'play') return;
    // 상대 드래그: 손가락이 병력을 미는 느낌
    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - dragOriginX) / rect.width) * LW.config.world.roadHalfWidth * 2.6;
    input.targetX = dragOriginTarget + dx;
  });

  function endDrag() {
    dragging = false;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', endDrag);

  // 클릭(탭) 만으로도 그 지점으로 이동하고 싶은 경우
  canvas.addEventListener('click', (e) => {
    if (mode !== 'play' || dragging) return;
    input.targetX = pointerToWorldX(e.clientX);
  });

  global.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === 'm' || e.key === 'M') LW.audio.setEnabled(!LW.audio.isEnabled());
    if (e.key === 'Escape' && mode === 'play') goHome();
    if (e.key === ' ' && mode === 'home') {
      e.preventDefault();
      startRun(save.bestStage);
    }
  });

  global.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  global.addEventListener('resize', resize);

  /* ---------------- 루프 ---------------- */

  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;

    if (canvas.width !== Math.floor(canvas.clientWidth * Math.min(global.devicePixelRatio || 1, 2))) resize();

    if (run) {
      if (mode === 'play') {
        if (keys.left) input.targetX -= dt * 9;
        if (keys.right) input.targetX += dt * 9;
        const events = LW.run.update(run, dt, input);
        if (events.length) {
          LW.audio.play(events, now);
          LW.fx.handle(events, run);
        }
        LW.fx.update(dt);
        ui.updateHud(run);
        if (run.phase === 'won' || run.phase === 'lost') {
          mode = 'over';
          overTimer = run.phase === 'won' ? 0.9 : 1.2;
        }
      } else if (mode === 'over') {
        LW.fx.handle(LW.run.update(run, dt, input), run); // 파티클·연출 잔상만 진행
        LW.fx.update(dt);
        overTimer -= dt;
        if (overTimer <= 0) finishRun();
      }
      LW.render.draw(ctx, camera, run);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    global.requestAnimationFrame(frame);
  }

  /* 자동 테스트(브라우저 smoke)·디버그용 최소 손잡이. 게임 규칙은 여기서 만지지 않는다. */
  LW.debug = {
    state: () => ({ mode: mode, run: run, save: save }),
    start: (stage) => startRun(stage),
    skipToBoss: () => {
      if (run) run.dist = run.plan.bossY - LW.config.boss.standoff - 0.1;
    },
    finishBoss: () => {
      if (run && run.boss) run.boss.hp = 0.01;
    },
    boost: (n) => {
      if (run) run.squad.count = n;
    },
    resetSave: () => {
      repo.clear();
      save = repo.load();
      goHome();
    },
  };

  resize();
  goHome();
  global.requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : this);
