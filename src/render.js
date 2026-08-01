/* 원근(의사 3D) 렌더러 — 부대 뒤 어깨 시점으로 도로가 지평선까지 뻗는다.
 * run 상태를 읽어 그리기만 한다 (상태를 절대 바꾸지 않는다).
 *
 * 투영: 카메라는 부대 선두 뒤 back 만큼, 높이 height 에 있다.
 *   d(깊이)   = wy - camY
 *   s(축척)   = focal / d
 *   화면x     = 화면중앙 + wx * s
 *   화면y     = 지평선 + (camZ - 물체높이) * s
 * 깊이가 클수록 작고 지평선에 가깝게 그려진다.
 */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  /* ---------- 배경 소품 (한 번만 만들어 재사용) ---------- */

  const bgRng = LW.util.makeRng(20260731);
  const PROPS = [];
  for (let i = 0; i < 60; i++) {
    PROPS.push({
      side: i % 2 === 0 ? -1 : 1,
      off: bgRng.range(0.9, 7),
      y: bgRng.range(0, 200),
      w: bgRng.range(0.5, 2.2),
      h: bgRng.range(0.6, 4.5),
      tint: bgRng.range(-0.18, 0.16),
    });
  }
  const SKYLINE = [];
  for (let i = 0; i < 34; i++) {
    SKYLINE.push({ x: bgRng.range(-1, 1), w: bgRng.range(0.02, 0.09), h: bgRng.range(0.1, 0.62) });
  }

  /* 미니건 병사 슬롯 — 핫패스에서 새 객체를 만들지 않도록 재사용한다. */
  const GUNNER_SLOTS = [];
  function gunnerSlot(i, worldX) {
    let slot = GUNNER_SLOTS[i];
    if (!slot) slot = GUNNER_SLOTS[i] = { x: 0, i: 0 };
    slot.x = worldX; // 월드 절대 좌표 (도로 안으로 이미 잘려 있다)
    slot.i = i;
    return slot;
  }

  /* ---------- 카메라 ---------- */

  function makeCamera(canvas) {
    return {
      canvas: canvas,
      w: 0,
      h: 0,
      focal: 1,
      horizon: 0,
      camY: 0,
      camZ: 0,
      shakeX: 0,
      shakeY: 0,
      // 정렬용 그리기 목록 (매 프레임 재사용 — 핫패스 할당 금지)
      list: [],
      count: 0,
    };
  }

  function updateCamera(cam, run) {
    const cfg = LW.config.camera;
    const w = cam.canvas.width;
    const h = cam.canvas.height;
    cam.w = w;
    cam.h = h;
    cam.focal = cfg.focalRatio * Math.min(w, h * 0.62);
    cam.horizon = h * cfg.horizonRatio;
    cam.camY = run.dist - cfg.back;
    cam.camZ = cfg.height;
    if (run.shake > 0) {
      const s = run.shake * 10;
      cam.shakeX = (Math.random() - 0.5) * s;
      cam.shakeY = (Math.random() - 0.5) * s;
    } else {
      cam.shakeX = cam.shakeY = 0;
    }
  }

  function depthOf(cam, wy) {
    return wy - cam.camY;
  }

  function scaleAt(cam, d) {
    return cam.focal / d;
  }

  function px(cam, wx, s) {
    return cam.w / 2 + wx * s + cam.shakeX;
  }

  /** 높이 z(월드) 지점의 화면 y. z=0 이 노면. */
  function py(cam, s, z) {
    return cam.horizon + (cam.camZ - z) * s + cam.shakeY;
  }

  /* ---------- 그리기 도우미 ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** 거리에 따라 배경색으로 흐려진다 (원경 안개) */
  function fogAlpha(d) {
    return LW.util.clamp((d - 26) / 90, 0, 0.72);
  }

  function groundShadow(ctx, x, y, s, radius) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * s, radius * s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- 하늘·지면 ---------- */

  function drawSky(ctx, cam, run) {
    const theme = run.plan.theme;
    const sky = theme.sky || ['#16202f', '#41536f'];
    const grad = ctx.createLinearGradient(0, 0, 0, cam.horizon + 4);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(1, sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cam.w, cam.horizon + 6);

    // 해/달 무리
    ctx.fillStyle = 'rgba(255,240,200,0.16)';
    ctx.beginPath();
    ctx.arc(cam.w * 0.68, cam.horizon * 0.42, cam.horizon * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // 원경 실루엣 (부대 전진에 따라 아주 천천히 흐른다)
    const drift = (run.dist * 0.06) % 2;
    ctx.fillStyle = theme.far || shade(sky[0], -0.25);
    for (const b of SKYLINE) {
      let nx = b.x - drift;
      if (nx < -1) nx += 2;
      const bx = (nx * 0.5 + 0.5) * cam.w;
      const bw = b.w * cam.w;
      const bh = b.h * cam.horizon;
      ctx.fillRect(bx - bw / 2, cam.horizon - bh, bw, bh + 2);
    }
    // 지평선 안개
    const haze = ctx.createLinearGradient(0, cam.horizon - cam.h * 0.09, 0, cam.horizon + 2);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, 'rgba(255,255,255,0.16)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, cam.horizon - cam.h * 0.09, cam.w, cam.h * 0.09 + 2);
  }

  function drawGround(ctx, cam, run) {
    const cfg = LW.config;
    const theme = run.plan.theme;
    const near = cfg.camera.near;
    const far = cfg.camera.far;
    const half = cfg.world.roadHalfWidth;

    // 길 밖 지면
    const sideGrad = ctx.createLinearGradient(0, cam.horizon, 0, cam.h);
    sideGrad.addColorStop(0, shade(theme.side, 0.12));
    sideGrad.addColorStop(1, shade(theme.side, -0.22));
    ctx.fillStyle = sideGrad;
    ctx.fillRect(0, cam.horizon, cam.w, cam.h - cam.horizon);

    const sFar = scaleAt(cam, far);
    const sNear = scaleAt(cam, near);
    const yFar = py(cam, sFar, 0);
    const yNear = py(cam, sNear, 0);

    // 도로 (원근 사다리꼴 — 직선은 원근에서도 직선이라 네 점이면 정확하다)
    const roadGrad = ctx.createLinearGradient(0, yFar, 0, yNear);
    roadGrad.addColorStop(0, shade(theme.road, 0.1));
    roadGrad.addColorStop(1, shade(theme.road, -0.12));
    ctx.fillStyle = roadGrad;
    ctx.beginPath();
    ctx.moveTo(px(cam, -half, sFar), yFar);
    ctx.lineTo(px(cam, half, sFar), yFar);
    ctx.lineTo(px(cam, half, sNear), yNear);
    ctx.lineTo(px(cam, -half, sNear), yNear);
    ctx.closePath();
    ctx.fill();

    // 노면 가로 무늬 — 전진감의 핵심
    const step = 4;
    const startY = Math.floor((cam.camY + near) / step) * step;
    for (let wy = startY; wy < cam.camY + cfg.camera.drawDistance; wy += step) {
      const d = depthOf(cam, wy);
      if (d < near) continue;
      const s = scaleAt(cam, d);
      const y = py(cam, s, 0);
      const th = Math.max(1, s * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.16 * (1 - fogAlpha(d))).toFixed(3) + ')';
      ctx.fillRect(px(cam, -half, s), y, half * 2 * s, th);
    }

    // 차선 점선
    ctx.lineCap = 'butt';
    for (const lane of [-half / 3, half / 3]) {
      for (let wy = startY; wy < cam.camY + cfg.camera.drawDistance; wy += 6) {
        const d0 = depthOf(cam, wy);
        const d1 = depthOf(cam, wy + 3);
        if (d1 < near) continue;
        const s0 = scaleAt(cam, Math.max(near, d0));
        const s1 = scaleAt(cam, d1);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.24 * (1 - fogAlpha(d1))).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1, s1 * 0.09);
        ctx.beginPath();
        ctx.moveTo(px(cam, lane, s0), py(cam, s0, 0));
        ctx.lineTo(px(cam, lane, s1), py(cam, s1, 0));
        ctx.stroke();
      }
    }

    // 도로 경계선
    for (const edge of [-half, half]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1.5, sNear * 0.05);
      ctx.beginPath();
      ctx.moveTo(px(cam, edge, sFar), yFar);
      ctx.lineTo(px(cam, edge, sNear), yNear);
      ctx.stroke();
    }

    // 길가 소품 (기둥·잔해) — 200 월드 단위 주기로 반복
    for (const prop of PROPS) {
      const wy = prop.y + Math.ceil((cam.camY - prop.y) / 200) * 200;
      const d = depthOf(cam, wy);
      if (d < near || d > cfg.camera.drawDistance) continue;
      const s = scaleAt(cam, d);
      const x = px(cam, prop.side * (half + prop.off), s);
      const yb = py(cam, s, 0);
      const yt = py(cam, s, prop.h);
      const w = prop.w * s;
      ctx.fillStyle = shade(theme.side, prop.tint);
      ctx.fillRect(x - w / 2, yt, w, yb - yt);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x - w / 2, yt, w * 0.3, yb - yt);
      const fog = fogAlpha(d);
      if (fog > 0.02) {
        ctx.fillStyle = 'rgba(' + (theme.sky ? '160,180,200,' : '160,180,200,') + fog.toFixed(3) + ')';
        ctx.fillRect(x - w / 2, yt, w, yb - yt);
      }
    }
  }

  /* ---------- 오브젝트 (깊이 정렬 후 원경 -> 근경) ---------- */

  function reset(cam) {
    cam.count = 0;
  }

  function add(cam, kind, ref, d) {
    let slot = cam.list[cam.count];
    if (!slot) slot = cam.list[cam.count] = { kind: '', ref: null, d: 0 };
    slot.kind = kind;
    slot.ref = ref;
    slot.d = d;
    cam.count++;
  }

  function byDepth(a, b) {
    return b.d - a.d; // 먼 것부터
  }

  function collect(cam, run) {
    const near = LW.config.camera.near;
    reset(cam);

    // 부대가 이미 지난 문(=카메라에 너무 가까운 문)은 화면을 덮으므로 그리지 않는다
    const gateNear = LW.config.camera.back * 0.85;
    for (const gate of run.gates) {
      const d = depthOf(cam, gate.y);
      if (d > gateNear && d < 90) add(cam, 'gate', gate, d);
    }
    for (const bar of run.barricades) {
      if (bar.broken) continue;
      const d = depthOf(cam, bar.y);
      if (d > near && d < 90) add(cam, 'barricade', bar, d);
    }
    for (const c of run.coins) {
      if (c.taken) continue;
      const d = depthOf(cam, c.y);
      if (d > near && d < 60) add(cam, 'coin', c, d);
    }
    for (const barrel of run.barrels) {
      if (barrel.broken) continue;
      const d = depthOf(cam, barrel.y);
      if (d > near && d < 90) add(cam, 'barrel', barrel, d);
    }
    for (const gun of run.guns) {
      if (gun.taken) continue;
      const d = depthOf(cam, gun.y);
      if (d > near && d < 60) add(cam, 'gun', gun, d);
    }
    for (const e of run.enemies) {
      if (!e.active) continue;
      const d = depthOf(cam, e.y);
      if (d > near && d < 90) add(cam, 'enemy', e, d);
    }
    if (run.boss && !run.boss.dead) {
      const d = depthOf(cam, run.boss.y);
      if (d > near) add(cam, 'boss', run.boss, d);
    }
    for (const b of run.bullets) {
      if (!b.active) continue;
      const d = depthOf(cam, b.y);
      if (d > near && d < 90) add(cam, 'bullet', b, d);
    }
    for (const b of run.bolts) {
      if (!b.active) continue;
      const d = depthOf(cam, b.y);
      if (d > near) add(cam, 'bolt', b, d);
    }
    for (const p of run.particles) {
      if (!p.active) continue;
      const d = depthOf(cam, p.y);
      if (d > near) add(cam, 'particle', p, d);
    }
    // 부대: 줄마다 깊이가 다르다 (뒷줄이 카메라에 가까워 크게 보인다)
    const squad = run.squad;
    const formation = LW.squad.fillFormation(squad.formation, squad.count);
    for (let i = 0; i < formation.length; i++) {
      const f = formation[i];
      const d = depthOf(cam, run.dist + f.y);
      if (d > near) add(cam, 'unit', f, d);
    }

    // 미니건 병사 — 진형 바깥 좌우 (선두 줄과 같은 깊이)
    for (let i = 0; i < squad.gunners; i++) {
      const d = depthOf(cam, run.dist);
      if (d > near) add(cam, 'gunner', gunnerSlot(i, squad.gunnerX(i)), d);
    }

    for (const p of run.gunnerPickups) {
      if (p.taken) continue;
      const d = depthOf(cam, p.y);
      if (d > near && d < 90) add(cam, 'gunnerPickup', p, d);
    }

    // 활성 슬롯만 정렬 대상이 되도록 나머지는 뒤로 밀어 둔다
    for (let i = cam.count; i < cam.list.length; i++) cam.list[i].d = -Infinity;
    cam.list.sort(byDepth);
  }

  function drawUnit(ctx, cam, run, f, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    // 달리는 반동 — 병사마다 위상을 어긋나게 해서 부대가 살아 움직인다
    const phase = run.time * 12 + (f.i || 0) * 0.8;
    const stride = Math.sin(phase);
    const x = px(cam, run.squad.x + f.x, s);
    const yb = py(cam, s, 0) - Math.abs(stride) * s * 0.035;
    const hgt = cfg.heights.unit;
    const body = 0.34 * s;
    const yTop = py(cam, s, hgt) - Math.abs(stride) * s * 0.035;

    groundShadow(ctx, x, py(cam, s, 0), s, 0.22);

    // 다리 (교차 스텝)
    ctx.fillStyle = '#26456f';
    const legH = (yb - yTop) * 0.34;
    const legW = body * 0.28;
    ctx.fillRect(x - body * 0.34 + stride * legW * 0.5, yb - legH, legW, legH);
    ctx.fillRect(x + body * 0.06 - stride * legW * 0.5, yb - legH, legW, legH);
    // 몸통
    ctx.fillStyle = '#3f7ddc';
    roundRect(ctx, x - body / 2, yTop + (yb - yTop) * 0.28, body, (yb - yTop) * 0.44, body * 0.28);
    ctx.fill();
    // 배낭 하이라이트
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, x - body / 2, yTop + (yb - yTop) * 0.28, body * 0.34, (yb - yTop) * 0.44, body * 0.28);
    ctx.fill();
    // 총 (앞으로 뻗은 형태)
    ctx.fillStyle = '#1b2432';
    ctx.fillRect(x + body * 0.16, yTop + (yb - yTop) * 0.22, body * 0.22, (yb - yTop) * 0.3);
    // 헬멧
    ctx.fillStyle = '#ffcf4a';
    ctx.beginPath();
    ctx.arc(x, yTop + (yb - yTop) * 0.16, body * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // 선두 줄 총구 화염
    const squad = run.squad;
    if (f.y === 0 && squad.fireTimer > squad.interval() - 0.06) {
      const hot = squad.buffTimer > 0;
      ctx.fillStyle = hot ? 'rgba(255,196,90,0.98)' : 'rgba(255,232,150,0.95)';
      ctx.beginPath();
      ctx.arc(x + body * 0.27, yTop + (yb - yTop) * 0.14, body * (hot ? 0.42 : 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemy(ctx, cam, run, e, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    const x = px(cam, e.x, s);
    const yb = py(cam, s, 0);
    const hgt = e.kind === 'brute' ? cfg.heights.brute : cfg.heights.enemy;
    const yt = py(cam, s, hgt);
    const H = yb - yt;
    const W = e.radius * 2 * s;
    const def = cfg.enemyKinds[e.kind];
    const sway = Math.sin(e.wobble) * W * 0.08;
    const color = e.flash > 0 ? '#ffffff' : def.color;

    groundShadow(ctx, x, yb, s, e.radius * 0.9);

    // 다리(궤도)
    ctx.fillStyle = shade(def.color, -0.4);
    ctx.fillRect(x - W * 0.42, yb - H * 0.3, W * 0.3, H * 0.3);
    ctx.fillRect(x + W * 0.12, yb - H * 0.3, W * 0.3, H * 0.3);

    // 몸통 (도로와 분리되게 외곽선)
    ctx.fillStyle = color;
    roundRect(ctx, x - W / 2 + sway, yt + H * 0.1, W, H * 0.62, W * 0.22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,22,0.55)';
    ctx.lineWidth = Math.max(1, W * 0.06);
    ctx.stroke();
    // 금속 하이라이트
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x - W / 2 + sway, yt + H * 0.1, W * 0.32, H * 0.62, W * 0.22);
    ctx.fill();

    if (e.kind === 'brute') {
      ctx.fillStyle = shade(def.color, 0.2);
      roundRect(ctx, x - W * 0.66 + sway, yt + H * 0.16, W * 0.2, H * 0.4, W * 0.08);
      ctx.fill();
      roundRect(ctx, x + W * 0.46 + sway, yt + H * 0.16, W * 0.2, H * 0.4, W * 0.08);
      ctx.fill();
    }
    if (e.kind === 'shooter') {
      ctx.strokeStyle = '#ffb0f0';
      ctx.lineWidth = Math.max(1, W * 0.08);
      ctx.beginPath();
      ctx.moveTo(x + sway, yt + H * 0.1);
      ctx.lineTo(x + sway, yt - H * 0.22);
      ctx.stroke();
      ctx.fillStyle = '#ffb0f0';
      ctx.beginPath();
      ctx.arc(x + sway, yt - H * 0.24, W * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // 센서 바 (얼굴 없는 기계)
    ctx.fillStyle = '#ff5f6d';
    ctx.fillRect(x - W * 0.26 + sway, yt + H * 0.26, W * 0.52, Math.max(1.5, H * 0.1));

    // 체력
    if (e.hp < e.maxHp && d < 40) {
      const bw = W * 1.15;
      const bh = Math.max(2, s * 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - bw / 2, yt - bh * 2.4, bw, bh);
      ctx.fillStyle = '#ff7a5c';
      ctx.fillRect(x - bw / 2, yt - bh * 2.4, (bw * e.hp) / e.maxHp, bh);
    }

    const fog = fogAlpha(d);
    if (fog > 0.02) {
      ctx.fillStyle = 'rgba(150,170,195,' + fog.toFixed(3) + ')';
      roundRect(ctx, x - W / 2 + sway, yt, W, H, W * 0.2);
      ctx.fill();
    }
  }

  function drawBoss(ctx, cam, run, boss, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    const x = px(cam, boss.x, s);
    const yb = py(cam, s, 0);
    const yt = py(cam, s, cfg.heights.boss);
    const H = yb - yt;
    const W = boss.radius * 2 * s;
    const bob = Math.sin(boss.bob) * H * 0.02;

    groundShadow(ctx, x, yb, s, boss.radius * 1.05);

    // 다리
    ctx.fillStyle = '#333a4a';
    ctx.fillRect(x - W * 0.42, yb - H * 0.26, W * 0.32, H * 0.26);
    ctx.fillRect(x + W * 0.1, yb - H * 0.26, W * 0.32, H * 0.26);

    // 어깨 포드
    ctx.fillStyle = '#454d60';
    roundRect(ctx, x - W * 0.78, yt + H * 0.18 + bob, W * 0.26, H * 0.4, W * 0.08);
    ctx.fill();
    roundRect(ctx, x + W * 0.52, yt + H * 0.18 + bob, W * 0.26, H * 0.4, W * 0.08);
    ctx.fill();

    // 몸통
    ctx.fillStyle = boss.flash > 0 ? '#ffffff' : '#5b6479';
    roundRect(ctx, x - W / 2, yt + H * 0.12 + bob, W, H * 0.62, W * 0.16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, x - W / 2, yt + H * 0.12 + bob, W * 0.3, H * 0.62, W * 0.16);
    ctx.fill();

    // 머리·센서
    ctx.fillStyle = '#454d60';
    roundRect(ctx, x - W * 0.24, yt + bob, W * 0.48, H * 0.16, W * 0.06);
    ctx.fill();
    ctx.fillStyle = '#ffb43d';
    ctx.fillRect(x - W * 0.16, yt + H * 0.06 + bob, W * 0.32, H * 0.05);
    ctx.fillStyle = '#ff4a5c';
    ctx.fillRect(x - W * 0.34, yt + H * 0.36 + bob, W * 0.68, H * 0.06);
  }

  function drawGate(ctx, cam, run, gate, d) {
    const cfg = LW.config;
    const half = cfg.world.roadHalfWidth;
    const s = scaleAt(cam, d);
    const yb = py(cam, s, 0);
    const yt = py(cam, s, cfg.heights.gate);
    const H = yb - yt;

    // solo 게이트(버티기 모드)는 문이 하나 — 도로 왼쪽에 폭 w 로 떠 있다.
    const sides = gate.solo ? 1 : 2;
    for (let side = 0; side < sides; side++) {
      const door = gate.doors[side];
      const wx0 = gate.solo ? gate.x - gate.w / 2 : side === 0 ? -half : 0;
      const wx1 = gate.solo ? gate.x + gate.w / 2 : side === 0 ? 0 : half;
      const x0 = px(cam, wx0, s);
      const x1 = px(cam, wx1, s);
      const w = x1 - x0;
      const buff = LW.gates.looksBuff(door); // 페이크는 초록으로 보인다
      const used = gate.used;
      const picked = used && gate.chosen === side;

      ctx.globalAlpha = used ? (picked ? 0.3 : 0.12) : 0.9;

      // 문(반투명 에너지 벽)
      const g = ctx.createLinearGradient(0, yt, 0, yb);
      g.addColorStop(0, buff ? 'rgba(70,235,140,0.18)' : 'rgba(240,80,100,0.18)');
      g.addColorStop(1, buff ? 'rgba(50,210,120,0.72)' : 'rgba(225,60,85,0.72)');
      ctx.fillStyle = g;
      ctx.fillRect(x0 + w * 0.03, yt, w * 0.94, H);

      // 기둥·상단 바
      ctx.fillStyle = buff ? '#2fd97e' : '#ff5d72';
      const post = Math.max(2, w * 0.04);
      ctx.fillRect(x0 + w * 0.03, yt, post, H);
      ctx.fillRect(x1 - w * 0.03 - post, yt, post, H);
      ctx.fillRect(x0 + w * 0.03, yt, w * 0.94, Math.max(2, H * 0.06));

      // 큰 숫자 (광고에서 보던 그 라벨)
      const fs = Math.max(12, w * 0.42);
      ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = x0 + w / 2;
      const cy = yt + H * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(LW.gates.label(door), cx, cy + Math.max(1, fs * 0.05));
      ctx.fillStyle = '#ffffff';
      ctx.fillText(LW.gates.label(door), cx, cy);

      ctx.globalAlpha = 1;
    }
  }

  function drawBarricade(ctx, cam, run, bar, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    const hw = cfg.barricade.halfWidth;
    const x0 = px(cam, bar.x - hw, s);
    const x1 = px(cam, bar.x + hw, s);
    const yb = py(cam, s, 0);
    const yt = py(cam, s, cfg.heights.barricade);
    const w = x1 - x0;
    const H = yb - yt;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x0, yb, w, Math.max(1, s * 0.06));

    ctx.fillStyle = bar.flash > 0 ? '#ffffff' : '#7b879d';
    ctx.fillRect(x0, yt, w, H);
    // 경고 사선
    ctx.fillStyle = 'rgba(255,196,60,0.9)';
    const stripes = 5;
    for (let i = 0; i < stripes; i++) {
      if (i % 2) continue;
      ctx.fillRect(x0 + (w / stripes) * i, yt + H * 0.32, w / stripes, H * 0.28);
    }
    // 체력
    const bh = Math.max(2, s * 0.05);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0, yt - bh * 2, w, bh);
    ctx.fillStyle = '#ffd05e';
    ctx.fillRect(x0, yt - bh * 2, (w * Math.max(0, bar.hp)) / bar.maxHp, bh);
  }

  /** 드럼통 — 원통 몸체 + 띠, 위에 총이 얹혀 있다 */
  function drawBarrel(ctx, cam, run, barrel, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    const x = px(cam, barrel.x, s);
    const yb = py(cam, s, 0);
    const yt = py(cam, s, cfg.barrel.height);
    const w = cfg.barrel.radius * 2 * s;
    const H = yb - yt;

    groundShadow(ctx, x, yb, s, cfg.barrel.radius * 0.95);

    // 몸통
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    const base = barrel.flash > 0 ? '#ffffff' : '#d8613a';
    g.addColorStop(0, shade(base, -0.3));
    g.addColorStop(0.35, base);
    g.addColorStop(1, shade(base, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, yt, w, H);
    // 위/아래 타원 (원통 느낌)
    ctx.fillStyle = shade(base, 0.18);
    ctx.beginPath();
    ctx.ellipse(x, yt, w / 2, w * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // 띠 두 줄
    ctx.fillStyle = 'rgba(20,24,32,0.45)';
    ctx.fillRect(x - w / 2, yt + H * 0.3, w, Math.max(1, H * 0.08));
    ctx.fillRect(x - w / 2, yt + H * 0.62, w, Math.max(1, H * 0.08));
    // 남은 타격 횟수 — 이만큼 맞히면 터진다. 맞을 때마다 줄어든다.
    const left = Math.max(0, barrel.hits);
    const nfs = Math.max(9, w * 0.62);
    ctx.font = '900 ' + nfs + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ny = yt + H * 0.47;
    ctx.fillStyle = 'rgba(20,12,8,0.65)';
    ctx.fillText(String(left), x, ny + Math.max(1, nfs * 0.08));
    ctx.fillStyle = barrel.flash > 0 ? '#fff2c0' : '#ffffff';
    ctx.fillText(String(left), x, ny);

    // 위에 얹힌 총 (쏴서 터뜨리면 떨어진다)
    drawGunIcon(ctx, cam, barrel.x, cfg.barrel.gunZ + Math.sin(barrel.bob) * 0.06, s, 1);
  }

  /** 미니건 병사 — 진형 바깥에 붙어 함께 달린다. 일반 병사보다 크고 총이 굵다. */
  function drawGunner(ctx, cam, run, g, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    const squad = run.squad;
    const phase = run.time * 10 + g.i * 1.3;
    const stride = Math.sin(phase);
    const x = px(cam, g.x, s);
    const yb = py(cam, s, 0) - Math.abs(stride) * s * 0.03;
    const yTop = py(cam, s, cfg.heights.gunner) - Math.abs(stride) * s * 0.03;
    const body = 0.44 * s; // 일반 병사(0.34)보다 크다
    const H = yb - yTop;

    groundShadow(ctx, x, py(cam, s, 0), s, 0.28);

    // 다리
    ctx.fillStyle = '#1f3550';
    const legH = H * 0.32;
    const legW = body * 0.3;
    ctx.fillRect(x - body * 0.36 + stride * legW * 0.4, yb - legH, legW, legH);
    ctx.fillRect(x + body * 0.06 - stride * legW * 0.4, yb - legH, legW, legH);
    // 몸통 (아군 파랑이지만 더 진하다 — 중장 느낌)
    ctx.fillStyle = '#2f62b8';
    roundRect(ctx, x - body / 2, yTop + H * 0.26, body, H * 0.46, body * 0.26);
    ctx.fill();
    // 탄띠
    ctx.fillStyle = '#ffcf4a';
    ctx.fillRect(x - body * 0.5, yTop + H * 0.42, body, Math.max(1, H * 0.06));

    // 미니건: 굵은 통 + 회전하는 총구
    const gx = x + body * 0.2;
    const gy = yTop + H * 0.3;
    const gl = H * 0.4;
    ctx.fillStyle = '#151b26';
    roundRect(ctx, gx, gy, body * 0.34, gl, body * 0.1);
    ctx.fill();
    // 총열 다발 (회전 표현 — 밝은 줄이 돈다)
    const spin = (run.time * 14 + g.i) % 1;
    ctx.fillStyle = '#5a6b84';
    for (let k = 0; k < 3; k++) {
      const t = (spin + k / 3) % 1;
      const bw = body * 0.07;
      ctx.fillRect(gx + body * 0.05 + t * body * 0.22, gy + gl * 0.1, bw, gl * 0.8);
    }
    // 헬멧 (미니건 병사는 은색 — 한눈에 구분된다)
    ctx.fillStyle = '#dfe7f2';
    ctx.beginPath();
    ctx.arc(x, yTop + H * 0.14, body * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8fa3bd';
    ctx.fillRect(x - body * 0.34, yTop + H * 0.13, body * 0.68, Math.max(1, H * 0.04));

    // 총구 화염 — 미니건은 거의 끊기지 않는다
    if (squad.gunnerTimer > LW.config.gunner.fireInterval - 0.07) {
      const fx = gx + body * 0.17;
      const fy = gy - H * 0.04;
      const r = body * (0.3 + Math.random() * 0.16);
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
      grad.addColorStop(0, 'rgba(255,255,220,0.95)');
      grad.addColorStop(0.5, 'rgba(255,190,90,0.7)');
      grad.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 길에서 기다리는 미니건 병사 — 지나가면 합류한다. */
  function drawGunnerPickup(ctx, cam, run, p, d) {
    const cfg = LW.config;
    const s = scaleAt(cam, d);
    const x = px(cam, p.x, s);
    const yb = py(cam, s, cfg.gunner.standZ);
    const yTop = py(cam, s, cfg.gunner.standZ + cfg.heights.gunner);
    const H = yb - yTop;
    const body = 0.44 * s;

    // 빛기둥 (아군 표시 — 청록색)
    const beamTop = py(cam, s, 3.4);
    const beam = ctx.createLinearGradient(0, beamTop, 0, yb);
    beam.addColorStop(0, 'rgba(120,240,255,0)');
    beam.addColorStop(1, 'rgba(120,240,255,0.3)');
    ctx.fillStyle = beam;
    ctx.fillRect(x - body * 0.7, beamTop, body * 1.4, yb - beamTop);

    groundShadow(ctx, x, yb, s, 0.3);

    // 손을 흔든다 (합류를 기다리는 아군)
    const wave = Math.sin(p.wave) * 0.5;
    ctx.fillStyle = '#2f62b8';
    roundRect(ctx, x - body / 2, yTop + H * 0.26, body, H * 0.5, body * 0.26);
    ctx.fill();
    ctx.fillStyle = '#3f7ddc';
    ctx.save();
    ctx.translate(x + body * 0.42, yTop + H * 0.32);
    ctx.rotate(-0.5 + wave);
    ctx.fillRect(0, -body * 0.1, body * 0.42, body * 0.2);
    ctx.restore();
    // 미니건을 세워 들고 있다
    ctx.fillStyle = '#151b26';
    roundRect(ctx, x - body * 0.62, yTop + H * 0.2, body * 0.3, H * 0.55, body * 0.08);
    ctx.fill();
    // 헬멧
    ctx.fillStyle = '#dfe7f2';
    ctx.beginPath();
    ctx.arc(x, yTop + H * 0.14, body * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // 머리 위 표시
    const fs = Math.max(9, body * 0.52);
    ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ty = yTop - fs * 0.7 + Math.sin(p.bob) * s * 0.06;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('미니건', x, ty + Math.max(1, fs * 0.08));
    ctx.fillStyle = '#c9f6ff';
    ctx.fillText('미니건', x, ty);
  }

  /** 총 픽업 아이콘 — 노면에 떨어져 반짝이는 상태 */
  function drawGun(ctx, cam, run, gun, d) {
    const s = scaleAt(cam, d);
    const z = LW.config.heights.gun + Math.sin(gun.bob) * 0.1;
    // 빛기둥
    const x = px(cam, gun.x, s);
    const yb = py(cam, s, 0);
    const grad = ctx.createLinearGradient(0, py(cam, s, z + 1.2), 0, yb);
    grad.addColorStop(0, 'rgba(255,226,122,0)');
    grad.addColorStop(1, 'rgba(255,226,122,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 0.28 * s, py(cam, s, z + 1.2), 0.56 * s, yb - py(cam, s, z + 1.2));
    drawGunIcon(ctx, cam, gun.x, z, s, 1.15);
  }

  /** 총 모양 (토이 블래스터 실루엣) */
  function drawGunIcon(ctx, cam, wx, z, s, boost) {
    const x = px(cam, wx, s);
    const y = py(cam, s, z);
    const u = 0.24 * s * (boost || 1);

    // 후광
    ctx.fillStyle = 'rgba(255,226,122,0.28)';
    ctx.beginPath();
    ctx.arc(x, y, u * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2d3648';
    roundRect(ctx, x - u * 1.5, y - u * 0.5, u * 2.6, u, u * 0.3); // 총열
    ctx.fill();
    roundRect(ctx, x - u * 0.2, y - u * 0.2, u * 0.9, u * 1.5, u * 0.25); // 손잡이
    ctx.fill();
    ctx.fillStyle = '#ffcf4a';
    roundRect(ctx, x - u * 1.5, y - u * 0.5, u * 0.9, u, u * 0.3); // 포인트 색
    ctx.fill();
    ctx.fillStyle = '#7fe0ff';
    roundRect(ctx, x - u * 0.5, y - u * 1.15, u * 1.1, u * 0.6, u * 0.2); // 탄창(파랑)
    ctx.fill();
  }

  function drawCoin(ctx, cam, run, c, d) {
    const s = scaleAt(cam, d);
    const x = px(cam, c.x, s);
    const bob = Math.sin(run.time * 5 + c.bob) * 0.1;
    const y = py(cam, s, LW.config.heights.coin + bob);
    const r = 0.17 * s;
    ctx.fillStyle = '#ffd45e';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,80,10,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBullet(ctx, cam, run, b, d) {
    const s = scaleAt(cam, d);
    const x = px(cam, b.x, s);
    const y = py(cam, s, 0.55);
    const len = Math.max(2, s * 0.34);
    const w = Math.max(1.2, s * 0.09);
    ctx.fillStyle = '#fff0b0';
    roundRect(ctx, x - w / 2, y - len, w, len, w * 0.5);
    ctx.fill();
  }

  function drawBolt(ctx, cam, run, b, d) {
    const s = scaleAt(cam, d);
    const x = px(cam, b.x, s);
    const y = py(cam, s, 0.5);
    const r = Math.max(1.5, LW.config.enemyBolt.radius * s);
    ctx.fillStyle = 'rgba(255,150,90,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8b5c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticle(ctx, cam, run, p, d) {
    const s = scaleAt(cam, d);
    const a = p.life / p.maxLife;
    const size = p.size * s * (0.5 + a);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(px(cam, p.x, s) - size / 2, py(cam, s, 0.55) - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  /* ---------- 떠오르는 숫자 (fx) ---------- */

  function drawPopups(ctx, cam, run) {
    if (!LW.fx) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of LW.fx.popups) {
      if (!p.active) continue;
      const d = depthOf(cam, p.y);
      if (d < LW.config.camera.near) continue;
      const s = scaleAt(cam, d);
      const x = px(cam, p.x, s);
      // 화면 아래 HUD(병력 수·버프 칩)와 겹치지 않게 위로 올려 잡는다
      const y = Math.min(py(cam, s, 1.5), cam.h * 0.74) - p.rise;
      const t = p.life / p.maxLife;
      const fs = Math.max(14, cam.w * 0.075 * p.size * (1.25 - t * 0.25));
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      ctx.lineWidth = Math.max(3, fs * 0.16);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
      if (p.sub) {
        const sfs = fs * 0.42;
        ctx.font = '800 ' + sfs + 'px system-ui, sans-serif';
        ctx.lineWidth = Math.max(2, sfs * 0.18);
        ctx.strokeText(p.sub, x, y + fs * 0.72);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.sub, x, y + fs * 0.72);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 화면 하단 비네트 (부대가 도로에 붙어 보이게) ---------- */

  function drawVignette(ctx, cam) {
    const g = ctx.createLinearGradient(0, cam.h * 0.82, 0, cam.h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, cam.h * 0.82, cam.w, cam.h * 0.18);
  }

  function draw(ctx, cam, run) {
    updateCamera(cam, run);
    drawSky(ctx, cam, run);
    drawGround(ctx, cam, run);

    collect(cam, run);
    for (let i = 0; i < cam.count; i++) {
      const item = cam.list[i];
      switch (item.kind) {
        case 'gate':
          drawGate(ctx, cam, run, item.ref, item.d);
          break;
        case 'barricade':
          drawBarricade(ctx, cam, run, item.ref, item.d);
          break;
        case 'coin':
          drawCoin(ctx, cam, run, item.ref, item.d);
          break;
        case 'barrel':
          drawBarrel(ctx, cam, run, item.ref, item.d);
          break;
        case 'gun':
          drawGun(ctx, cam, run, item.ref, item.d);
          break;
        case 'enemy':
          drawEnemy(ctx, cam, run, item.ref, item.d);
          break;
        case 'boss':
          drawBoss(ctx, cam, run, item.ref, item.d);
          break;
        case 'unit':
          drawUnit(ctx, cam, run, item.ref, item.d);
          break;
        case 'gunner':
          drawGunner(ctx, cam, run, item.ref, item.d);
          break;
        case 'gunnerPickup':
          drawGunnerPickup(ctx, cam, run, item.ref, item.d);
          break;
        case 'bullet':
          drawBullet(ctx, cam, run, item.ref, item.d);
          break;
        case 'bolt':
          drawBolt(ctx, cam, run, item.ref, item.d);
          break;
        case 'particle':
          drawParticle(ctx, cam, run, item.ref, item.d);
          break;
        default:
          break;
      }
    }

    // 그린 것보다 병력이 많으면 발밑에 숫자 배지
    const squad = run.squad;
    if (squad.count > LW.config.squad.maxDrawn) {
      const s = scaleAt(cam, LW.config.camera.back);
      const x = px(cam, squad.x, s);
      const y = py(cam, s, 0) + Math.max(14, s * 0.24);
      const fs = Math.max(13, cam.w * 0.04);
      ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, fs * 0.2);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText('+' + (squad.count - LW.config.squad.maxDrawn), x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('+' + (squad.count - LW.config.squad.maxDrawn), x, y);
    }

    drawVignette(ctx, cam);
    drawPopups(ctx, cam, run);
  }

  LW.render = { makeCamera, draw, shade };
})(typeof globalThis !== 'undefined' ? globalThis : this);
