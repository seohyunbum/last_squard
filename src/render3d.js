/* 진짜 3D 렌더러 (WebGL/Three.js) — run 상태를 읽어 3D 장면으로 그린다.
 *
 * 2D 렌더러(render.js)와 같은 두 함수(makeCamera·draw)만 내보내므로 main.js 는 어느 쪽이든
 * 똑같이 부른다. WebGL 이 없거나 THREE 가 없으면 init() 이 false 를 돌려주고, 그때는
 * 2D 렌더러가 그대로 쓰인다 (구형 기기·파일 제한 환경에서도 게임은 돈다).
 *
 * 좌표 변환: 게임의 (x, y) -> 3D 의 (x, 높이, -y). 앞으로 갈수록 -z 다.
 * 상태는 절대 바꾸지 않는다 — 읽기만 한다.
 */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  let T = null; // THREE
  let renderer = null;
  let scene = null;
  let cam3 = null;
  let ready = false;

  const groups = {};
  const pools = {};
  let lights = null;
  let road = null;
  let sky = null;
  let skyline = null;
  let boss = null;
  let themeKey = '';

  let dummy = null; // 인스턴스 행렬 계산용 Object3D
  // 느린 기기 자동 대응 — 프레임이 계속 느리면 그림자를 끄고 해상도를 낮춘다
  const perf = { frames: 0, slow: 0, last: 0, downgraded: false };
  const textCache = new Map();

  /* ---------- 준비 ---------- */

  function init(canvas) {
    T = global.THREE;
    if (!T) return false;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      return false;
    }
    if (!renderer || !renderer.getContext()) return false;

    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.NoToneMapping; // 팔레트를 그대로 살린다 (필름 톤매핑은 색을 창백하게 만든다)
    if (T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;

    dummy = new T.Object3D();
    scene = new T.Scene();
    cam3 = new T.PerspectiveCamera(54, 1, 0.4, 900);

    buildWorld();
    ready = true;
    return true;
  }

  function usable() {
    return ready;
  }

  /* ---------- 정적인 세계 (한 번만 만든다) ---------- */

  function buildWorld() {
    const cfg = LW.config;
    const half = cfg.world.roadHalfWidth;

    // 빛: 반구광(하늘/땅 반사) + 태양(그림자) + 약한 채움광
    lights = {
      hemi: new T.HemisphereLight(0x9fc0ff, 0x2a2318, 0.26),
      sun: new T.DirectionalLight(0xfff0cf, 1.05),
      fill: new T.DirectionalLight(0x6f92ff, 0.18),
    };
    lights.sun.position.set(-16, 34, 22);
    lights.sun.castShadow = true;
    lights.sun.shadow.mapSize.set(1024, 1024);
    const sc = lights.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -22;
    sc.near = 1;
    sc.far = 90;
    lights.sun.shadow.bias = -0.0012;
    lights.fill.position.set(12, 10, -14);
    scene.add(lights.hemi, lights.sun, lights.sun.target, lights.fill);

    // 하늘 (안쪽 면에 그라데이션을 입힌 큰 구)
    sky = new T.Mesh(
      new T.SphereGeometry(600, 24, 16),
      new T.MeshBasicMaterial({ side: T.BackSide, depthWrite: false })
    );
    sky.material.map = gradientTexture('#1b2740', '#4a5b7d');
    scene.add(sky);

    // 길 밖 지면
    const ground = new T.Mesh(
      new T.PlaneGeometry(500, 1600),
      new T.MeshStandardMaterial({ color: 0x4d4130, roughness: 1 })
    );
    groups.ground = ground;
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    scene.add(ground);

    // 도로 (긴 판 + 반복 텍스처)
    const roadTex = roadTexture();
    road = new T.Mesh(
      new T.PlaneGeometry(half * 2, 1600),
      new T.MeshStandardMaterial({ map: roadTex, color: 0xffffff, roughness: 0.8, metalness: 0.08 })
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);

    // 도로 경계 발광선 — 원근감과 "게임 같은" 선명함을 준다
    for (const side of [-1, 1]) {
      const edge = new T.Mesh(
        new T.BoxGeometry(0.12, 0.06, 1600),
        new T.MeshBasicMaterial({ color: 0xdfe9ff })
      );
      edge.position.set(side * half, 0.03, 0);
      scene.add(edge);
      groups['edge' + side] = edge;
    }

    // 원경 도시 실루엣 (인스턴스 박스)
    const sky2 = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshStandardMaterial({ color: 0x2a3450, roughness: 1 }),
      120
    );
    const rng = LW.util.makeRng(31337);
    for (let i = 0; i < 120; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      dummy.position.set(side * rng.range(12, 90), rng.range(4, 26) / 2, -rng.range(40, 620));
      dummy.scale.set(rng.range(4, 14), dummy.position.y * 2, rng.range(4, 14));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      sky2.setMatrixAt(i, dummy.matrix);
    }
    skyline = sky2;
    scene.add(skyline);

    // 길가 소품 (드럼·기둥) — 전진감 보조
    const props = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.95 }),
      90
    );
    for (let i = 0; i < 90; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const h = rng.range(0.8, 3.4);
      dummy.position.set(side * rng.range(half + 1.2, half + 9), h / 2, -rng.range(4, 400));
      dummy.scale.set(rng.range(0.6, 2), h, rng.range(0.6, 2));
      dummy.updateMatrix();
      props.setMatrixAt(i, dummy.matrix);
    }
    props.castShadow = true;
    props.receiveShadow = true;
    groups.props = props;
    scene.add(props);

    /* ---- 인스턴스 풀 ---- */
    const unitMat = new T.MeshStandardMaterial({ color: 0x2f6ed0, roughness: 0.7, metalness: 0 });
    const headMat = new T.MeshStandardMaterial({ color: 0xf5b820, roughness: 0.6, metalness: 0 });
    pools.unitBody = instanced(T.CapsuleGeometry ? new T.CapsuleGeometry(0.17, 0.4, 4, 8) : new T.BoxGeometry(0.34, 0.6, 0.24), unitMat, 60, true);
    pools.unitHead = instanced(new T.SphereGeometry(0.15, 10, 8), headMat, 60, false);

    const gunMat = new T.MeshStandardMaterial({ color: 0x2f62b8, roughness: 0.5, metalness: 0.25 });
    const gunHeadMat = new T.MeshStandardMaterial({ color: 0xdfe7f2, roughness: 0.35, metalness: 0.5 });
    const barrelMat = new T.MeshStandardMaterial({ color: 0x151b26, roughness: 0.4, metalness: 0.7 });
    pools.gunnerBody = instanced(T.CapsuleGeometry ? new T.CapsuleGeometry(0.22, 0.5, 4, 10) : new T.BoxGeometry(0.44, 0.7, 0.3), gunMat, 6, true);
    pools.gunnerHead = instanced(new T.SphereGeometry(0.2, 12, 10), gunHeadMat, 6, false);
    pools.gunnerGun = instanced(new T.BoxGeometry(0.16, 0.16, 0.7), barrelMat, 6, false);

    pools.enemy = instanced(
      new T.BoxGeometry(0.6, 0.9, 0.5),
      new T.MeshStandardMaterial({ roughness: 0.6, metalness: 0.35 }),
      LW.config.pools.enemies,
      true,
      true
    );
    pools.enemyEye = instanced(
      new T.BoxGeometry(0.34, 0.08, 0.06),
      new T.MeshBasicMaterial({ color: 0xff5a5a }),
      LW.config.pools.enemies,
      false
    );

    pools.bullet = instanced(
      new T.SphereGeometry(0.11, 8, 6),
      new T.MeshBasicMaterial({ color: 0xfff3c0 }),
      LW.config.pools.bullets,
      false
    );
    pools.bolt = instanced(
      new T.SphereGeometry(0.2, 8, 6),
      new T.MeshBasicMaterial({ color: 0xc07bff }),
      LW.config.pools.bolts,
      false
    );
    pools.particle = instanced(
      new T.BoxGeometry(0.12, 0.12, 0.12),
      new T.MeshBasicMaterial({}),
      LW.config.pools.particles,
      false,
      true
    );
    pools.barrelBody = instanced(
      new T.CylinderGeometry(0.62, 0.62, 1.4, 14),
      new T.MeshStandardMaterial({ color: 0xd8613a, roughness: 0.6, metalness: 0.2 }),
      24,
      true
    );
    pools.coin = instanced(
      new T.CylinderGeometry(0.22, 0.22, 0.07, 12),
      new T.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.3, metalness: 0.9 }),
      40,
      false
    );
    pools.barricade = instanced(
      new T.BoxGeometry(2.3, 1.05, 0.5),
      new T.MeshStandardMaterial({ color: 0x9fb3cd, roughness: 0.7, metalness: 0.2 }),
      12,
      true
    );

    // 글로우(가짜 블룸) · 글자 스프라이트 풀
    pools.glow = spritePool(radialTexture('#ffe9a8'), 40, true);
    pools.redGlow = spritePool(radialTexture('#ff6a5c'), 8, true);
    pools.beam = meshPool(
      () =>
        new T.Mesh(
          new T.CylinderGeometry(0.5, 0.9, 3.6, 10, 1, true),
          new T.MeshBasicMaterial({ color: 0x7bf0ff, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false })
        ),
      10
    );
    pools.label = spritePool(null, 30, false); // 게이트·드럼통 숫자 등
    pools.gate = meshPool(() => {
      const g = new T.Group();
      const wall = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0.42, side: T.DoubleSide, depthWrite: false })
      );
      const frame = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({}));
      g.add(wall, frame);
      g.userData.wall = wall;
      g.userData.frame = frame;
      return g;
    }, 8);
    pools.gunOnRoad = meshPool(
      () =>
        new T.Mesh(
          new T.BoxGeometry(0.5, 0.16, 0.2),
          new T.MeshStandardMaterial({ color: 0x2b3446, roughness: 0.4, metalness: 0.6 })
        ),
      12
    );

    // 보스
    const bossMat = new T.MeshStandardMaterial({ color: 0x5b6577, roughness: 0.45, metalness: 0.6 });
    boss = new T.Group();
    const bossBody = new T.Mesh(new T.BoxGeometry(2.6, 3, 2.2), bossMat);
    bossBody.castShadow = true;
    const bossHead = new T.Mesh(new T.BoxGeometry(1.7, 1.1, 1.5), bossMat);
    bossHead.position.y = 2;
    bossHead.castShadow = true;
    // 눈: 어두운 바이저 안에서 붉게 타오른다
    const visor = new T.Mesh(
      new T.BoxGeometry(1.5, 0.5, 0.14),
      new T.MeshStandardMaterial({ color: 0x141a24, roughness: 0.3, metalness: 0.7 })
    );
    visor.position.set(0, 2, -0.78);
    const bossEye = new T.Mesh(
      new T.BoxGeometry(1.15, 0.2, 0.16),
      new T.MeshBasicMaterial({ color: 0xff4a5c })
    );
    bossEye.position.set(0, 2, -0.86);
    const bossArmL = new T.Mesh(new T.BoxGeometry(0.7, 2.1, 0.7), bossMat);
    bossArmL.position.set(-1.7, 0.6, 0);
    const bossArmR = bossArmL.clone();
    bossArmR.position.x = 1.7;
    boss.add(bossBody, bossHead, visor, bossEye, bossArmL, bossArmR);
    // 최종 보스 표식 — 어깨의 붉은 발광 띠 (평소 보스는 숨긴다)
    const crest = new T.Mesh(
      new T.BoxGeometry(2.9, 0.22, 2.4),
      new T.MeshBasicMaterial({ color: 0xff3b52 })
    );
    crest.position.y = 1.35;
    crest.visible = false;
    boss.add(crest);
    boss.userData = { body: bossBody, head: bossHead, eye: bossEye, mat: bossMat, crest: crest };
    boss.visible = false;
    scene.add(boss);
  }

  function instanced(geo, mat, count, shadow, perColor) {
    const m = new T.InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    m.castShadow = !!shadow;
    m.receiveShadow = false;
    if (perColor) m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
    m.count = 0;
    scene.add(m);
    return m;
  }

  function meshPool(make, size) {
    const arr = [];
    for (let i = 0; i < size; i++) {
      const m = make();
      m.visible = false;
      scene.add(m);
      arr.push(m);
    }
    arr.used = 0;
    return arr;
  }

  function spritePool(map, size, additive) {
    const arr = [];
    for (let i = 0; i < size; i++) {
      const mat = new T.SpriteMaterial({
        map: map,
        transparent: true,
        depthWrite: false,
        depthTest: !additive,
      });
      if (additive) mat.blending = T.AdditiveBlending;
      const s = new T.Sprite(mat);
      s.visible = false;
      scene.add(s);
      arr.push(s);
    }
    arr.used = 0;
    return arr;
  }

  /* ---------- 텍스처 ---------- */

  function canvas2d(w, h) {
    const c = global.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function gradientTexture(top, bottom) {
    const c = canvas2d(4, 256);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.55, bottom);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new T.CanvasTexture(c);
    if (T.sRGBEncoding !== undefined) tex.encoding = T.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function roadTexture(base) {
    const c = canvas2d(256, 256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = base || '#3a4050';
    ctx.fillRect(0, 0, 256, 256);
    // 거친 아스팔트 알갱이
    for (let i = 0; i < 2600; i++) {
      const v = 40 + Math.random() * 40;
      ctx.fillStyle = 'rgba(' + v + ',' + (v + 4) + ',' + (v + 14) + ',0.5)';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // 가운데 점선 두 줄
    ctx.fillStyle = 'rgba(255,225,150,0.85)';
    for (const x of [88, 168]) ctx.fillRect(x, 20, 6, 96);
    const tex = new T.CanvasTexture(c);
    if (T.sRGBEncoding !== undefined) tex.encoding = T.sRGBEncoding;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(1, 200);
    tex.anisotropy = 4;
    return tex;
  }

  function radialTexture(color) {
    const c = canvas2d(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color);
    g.addColorStop(0.4, 'rgba(255,200,120,0.5)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(c);
    if (T.sRGBEncoding !== undefined) tex.encoding = T.sRGBEncoding;
    return tex;
  }

  /** 글자 텍스처 (문자열마다 한 번만 만들고 재사용) */
  function textTexture(text, color, sub) {
    const key = text + '|' + color + '|' + (sub || '');
    let tex = textCache.get(key);
    if (tex) return tex;
    const c = canvas2d(256, 128);
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, 128, sub ? 50 : 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, sub ? 50 : 64);
    if (sub) {
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeText(sub, 128, 104);
      ctx.fillStyle = '#eaf6ff';
      ctx.fillText(sub, 128, 104);
    }
    tex = new T.CanvasTexture(c);
    if (T.sRGBEncoding !== undefined) tex.encoding = T.sRGBEncoding;
    textCache.set(key, tex);
    return tex;
  }

  /* ---------- 매 프레임 ---------- */

  function makeCamera(canvas) {
    // 2D 렌더러와 같은 자리를 차지하는 호환용 객체 (main.js 가 그대로 넘긴다)
    return { canvas: canvas, w: 0, h: 0 };
  }

  function resize(canvas) {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (renderer.domElement.width !== canvas.width || cam3.aspect !== w / h) {
      renderer.setSize(w, h, false);
      cam3.aspect = w / Math.max(1, h);
      cam3.updateProjectionMatrix();
    }
  }

  function applyTheme(run) {
    const theme = run.plan.theme;
    const key = theme.name || theme.road;
    if (key === themeKey) return;
    themeKey = key;
    sky.material.map = gradientTexture(theme.sky ? theme.sky[0] : '#16202f', theme.sky ? theme.sky[1] : '#41536f');
    sky.material.needsUpdate = true;
    scene.fog = new T.Fog(new T.Color(theme.far || theme.sky[1]), 40, 190);
    // 도로 텍스처를 구역 색으로 다시 굽는다 (색을 곱하면 어두워지거나 날아간다)
    road.material.map = roadTexture(theme.road);
    road.material.needsUpdate = true;
    skyline.material.color = new T.Color(theme.far || '#2a3450');
    groups.props.material.color = new T.Color(theme.side);
    groups.ground.material.color = new T.Color(theme.side).multiplyScalar(0.75);
  }

  function beginPools() {
    for (const key of ['glow', 'redGlow', 'beam', 'label', 'gate', 'gunOnRoad']) {
      const pool = pools[key];
      for (let i = 0; i < pool.used; i++) pool[i].visible = false;
      pool.used = 0;
    }
    for (const key of ['unitBody', 'unitHead', 'gunnerBody', 'gunnerHead', 'gunnerGun', 'enemy', 'enemyEye', 'bullet', 'bolt', 'particle', 'barrelBody', 'coin', 'barricade']) {
      pools[key].count = 0;
    }
  }

  function takeMesh(pool) {
    if (pool.used >= pool.length) return null;
    const m = pool[pool.used++];
    m.visible = true;
    return m;
  }

  function pushInstance(mesh, x, y, z, sx, sy, sz, rotY, color) {
    const i = mesh.count;
    if (i >= mesh.instanceMatrix.count) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY || 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (color && mesh.instanceColor) mesh.setColorAt(i, color);
    mesh.count = i + 1;
  }

  const tmpColor = { r: 1, g: 1, b: 1 };
  function colorOf(hex) {
    if (!colorOf.cache) colorOf.cache = new Map();
    let c = colorOf.cache.get(hex);
    if (!c) {
      c = new T.Color(hex);
      colorOf.cache.set(hex, c);
    }
    return c;
  }

  function draw(ctx, cam, run) {
    if (!ready) return;
    const canvas = cam.canvas || renderer.domElement;
    resize(canvas);
    applyTheme(run);

    const cfg = LW.config;
    const squad = run.squad;
    const camCfg = cfg.camera;
    const shake = run.shake > 0 ? run.shake : 0;

    // 카메라: 부대 뒤 어깨 시점
    // 부대가 화면 아래 1/3 에 오도록 뒤로 빼고 살짝 위에서 내려다본다.
    // 진형이 깊어지면(병력이 많으면) 그만큼 더 물러나야 잘리지 않는다.
    const depth = squad.depth();
    const back = 10.5 + depth * 1.6;
    cam3.position.set(
      squad.x * 0.3 + (Math.random() - 0.5) * shake * 0.5,
      4.4 + depth * 0.35 + (Math.random() - 0.5) * shake * 0.4,
      -(run.dist - back)
    );
    cam3.lookAt(squad.x * 0.4, 1.9, -(run.dist + 14));

    // 태양 그림자 카메라를 부대 근처로 따라오게 (그림자 해상도를 아끼려고)
    lights.sun.position.set(squad.x - 16, 34, -(run.dist) + 22);
    lights.sun.target.position.set(squad.x, 0, -(run.dist + 6));
    lights.sun.target.updateMatrixWorld();

    // 도로·지면·하늘을 부대와 함께 옮긴다 (무한히 긴 판을 쓰지 않도록)
    road.position.z = -run.dist;
    road.material.map.offset.y = (run.dist / 8) % 1;
    for (const side of [-1, 1]) groups['edge' + side].position.z = -run.dist;
    groups.props.position.z = -Math.floor(run.dist / 400) * 400;
    skyline.position.z = -run.dist;
    sky.position.set(0, 0, -run.dist);

    watchPerf();
    beginPools();
    drawSquad(run);
    drawEnemies(run);
    drawObjects(run);
    drawBullets(run);
    drawParticles(run);
    drawBoss(run);
    drawPopups(run);
    flushInstances();

    renderer.render(scene, cam3);
  }

  /** 프레임이 계속 느리면 무거운 옵션을 한 번만 끈다 (아이 폰에서도 돌아가게). */
  function watchPerf() {
    const now = (global.performance && global.performance.now ? global.performance.now() : Date.now());
    if (perf.last) {
      const ms = now - perf.last;
      perf.frames++;
      if (ms > 34) perf.slow++;
      if (perf.frames === 90) {
        if (!perf.downgraded && perf.slow > 55) {
          perf.downgraded = true;
          renderer.shadowMap.enabled = false;
          renderer.setPixelRatio(1);
          lights.sun.castShadow = false;
        }
        perf.frames = 0;
        perf.slow = 0;
      }
    }
    perf.last = now;
  }

  function flushInstances() {
    for (const key in pools) {
      const p = pools[key];
      if (p && p.isInstancedMesh) {
        p.instanceMatrix.needsUpdate = true;
        if (p.instanceColor) p.instanceColor.needsUpdate = true;
      }
    }
  }

  function drawSquad(run) {
    const squad = run.squad;
    const formation = LW.squad.fillFormation(squad.formation, squad.count);
    const t = run.time;
    for (let i = 0; i < formation.length; i++) {
      const f = formation[i];
      const bounce = Math.abs(Math.sin(t * 12 + i * 0.8)) * 0.07;
      const x = squad.x + f.x;
      const z = -(run.dist + f.y);
      pushInstance(pools.unitBody, x, 0.42 + bounce, z, 1, 1, 1, 0);
      pushInstance(pools.unitHead, x, 0.82 + bounce, z, 1, 1, 1, 0);
    }

    // 미니건 병사
    for (let i = 0; i < squad.gunners; i++) {
      const x = squad.gunnerX(i);
      const z = -run.dist;
      const bounce = Math.abs(Math.sin(t * 10 + i * 1.3)) * 0.06;
      pushInstance(pools.gunnerBody, x, 0.52 + bounce, z, 1, 1, 1, 0);
      pushInstance(pools.gunnerHead, x, 1.02 + bounce, z, 1, 1, 1, 0);
      pushInstance(pools.gunnerGun, x + 0.24, 0.7 + bounce, z - 0.4, 1, 1, 1, 0);
      // 총구 화염
      if (squad.gunnerTimer > LW.config.gunner.fireInterval - 0.07) {
        const g = takeMesh(pools.glow);
        if (g) {
          g.position.set(x + 0.24, 0.72 + bounce, z - 0.9);
          g.scale.setScalar(0.5 + Math.random() * 0.2);
          g.material.opacity = 0.8;
        }
      }
    }

    // 부대 볼리 화염
    if (squad.fireTimer > squad.interval() - 0.06) {
      const g = takeMesh(pools.glow);
      if (g) {
        g.position.set(squad.x, 0.72, -(run.dist + 0.5));
        g.scale.setScalar(0.8 + Math.random() * 0.3);
        g.material.opacity = squad.buffTimer > 0 ? 0.95 : 0.7;
      }
    }
  }

  function drawEnemies(run) {
    for (const e of run.enemies) {
      if (!e.active) continue;
      const def = LW.config.enemyKinds[e.kind];
      const h = e.kind === 'brute' ? 1.45 : 0.95;
      const w = e.radius / 0.3;
      const z = -e.y;
      const wob = Math.sin(e.wobble) * 0.05;
      pushInstance(
        pools.enemy,
        e.x + wob,
        h / 2,
        z,
        w,
        h / 0.9,
        w,
        0,
        colorOf(e.flash > 0 ? '#ffffff' : def.color)
      );
      pushInstance(pools.enemyEye, e.x + wob, h * 0.78, z - e.radius * 0.9, w, 1, 1, 0);
    }
  }

  function drawObjects(run) {
    const cfg = LW.config;

    // 게이트
    for (const gate of run.gates) {
      const ahead = gate.y - run.dist;
      if (ahead < -3 || ahead > 95) continue;
      const doors = gate.solo ? 1 : 2;
      for (let side = 0; side < doors; side++) {
        const door = gate.doors[side];
        if (!door) continue;
        const g = takeMesh(pools.gate);
        if (!g) break;
        const half = cfg.world.roadHalfWidth;
        const x0 = gate.solo ? gate.x - gate.w / 2 : side === 0 ? -half : 0;
        const x1 = gate.solo ? gate.x + gate.w / 2 : side === 0 ? 0 : half;
        const w = x1 - x0;
        const cx = (x0 + x1) / 2;
        const buff = LW.gates.looksBuff(door);
        const color = colorOf(buff ? '#2fd97e' : '#ff5d72');
        const h = cfg.heights.gate;
        g.position.set(cx, 0, -gate.y);
        const wall = g.userData.wall;
        wall.scale.set(w * 0.96, h, 1);
        wall.position.set(0, h / 2, 0);
        wall.material.color = color;
        wall.material.opacity = gate.used ? 0.12 : 0.4;
        const frame = g.userData.frame;
        frame.scale.set(w * 0.96, 0.16, 0.16);
        frame.position.set(0, h, 0);
        frame.material.color = color;

        // 연산 라벨
        const label = takeMesh(pools.label);
        if (label) {
          label.material.map = textTexture(LW.gates.label(door), '#ffffff');
          label.material.needsUpdate = true;
          label.position.set(cx, h * 0.55, -gate.y + 0.1);
          label.scale.set(2.6, 1.3, 1);
          label.material.opacity = gate.used ? 0.3 : 1;
        }
      }
    }

    // 바리케이드
    for (const bar of run.barricades) {
      if (bar.broken) continue;
      pushInstance(pools.barricade, bar.x, 0.52, -bar.y, 1, 1, 1, 0);
    }

    // 드럼통 + 남은 타격 수
    for (const b of run.barrels) {
      if (b.broken) continue;
      pushInstance(pools.barrelBody, b.x, 0.7, -b.y, 1, 1, 1, 0);
      const label = takeMesh(pools.label);
      if (label) {
        label.material.map = textTexture(String(Math.max(0, b.hits)), b.flash > 0 ? '#fff2c0' : '#ffffff');
        label.material.needsUpdate = true;
        label.position.set(b.x, 0.8, -b.y + 0.95); // 앞(카메라 쪽)은 +z 다
        label.scale.set(1.35, 0.68, 1);
        label.material.opacity = 1;
      }
      // 위에 얹힌 총
      const gun = takeMesh(pools.gunOnRoad);
      if (gun) {
        gun.position.set(b.x, 1.55 + Math.sin(b.bob) * 0.06, -b.y);
        gun.rotation.set(0, 0.5, 0);
      }
    }

    // 노면에 떨어진 총
    for (const gun of run.guns) {
      if (gun.taken) continue;
      const m = takeMesh(pools.gunOnRoad);
      if (m) {
        m.position.set(gun.x, 0.3 + Math.sin(gun.bob) * 0.08, -gun.y);
        m.rotation.set(0, gun.bob * 0.4, 0.2);
      }
      const beam = takeMesh(pools.beam);
      if (beam) {
        beam.position.set(gun.x, 1.8, -gun.y);
        beam.material.color = colorOf('#ffe27a');
      }
      const g = takeMesh(pools.glow);
      if (g) {
        g.position.set(gun.x, 0.4, -gun.y);
        g.scale.setScalar(1.2);
        g.material.opacity = 0.7;
      }
    }

    // 미니건 병사 (길에서 기다림)
    for (const p of run.gunnerPickups) {
      if (p.taken) continue;
      const z = -p.y;
      pushInstance(pools.gunnerBody, p.x, 0.52, z, 1, 1, 1, 0);
      pushInstance(pools.gunnerHead, p.x, 1.02, z, 1, 1, 1, 0);
      pushInstance(pools.gunnerGun, p.x + 0.3, 0.9, z, 1, 1, 1, Math.PI / 2);
      const beam = takeMesh(pools.beam);
      if (beam) {
        beam.position.set(p.x, 1.9, z);
        beam.material.color = colorOf('#7bf0ff');
      }
      const label = takeMesh(pools.label);
      if (label) {
        label.material.map = textTexture('미니건', '#c9f6ff');
        label.material.needsUpdate = true;
        label.position.set(p.x, 1.85, z + 0.5);
        label.scale.set(1.9, 0.95, 1);
        label.material.opacity = 1;
      }
    }

    // 부품
    for (const c of run.coins) {
      if (c.taken) continue;
      pushInstance(pools.coin, c.x, 0.45 + Math.sin(c.bob) * 0.08, -c.y, 1, 1, 1, c.bob);
    }
  }

  function drawBullets(run) {
    for (const b of run.bullets) {
      if (!b.active) continue;
      pushInstance(pools.bullet, b.x, 0.68, -b.y, 0.55, 0.55, 3.2, 0);
    }
    for (const b of run.bolts) {
      if (!b.active) continue;
      pushInstance(pools.bolt, b.x, 0.7, -b.y, 1, 1, 1, 0);
    }
  }

  function drawParticles(run) {
    for (const p of run.particles) {
      if (!p.active) continue;
      const life = p.life / p.maxLife;
      const s = p.size * 6 * life;
      pushInstance(pools.particle, p.x, 0.5 + (1 - life) * 0.6, -p.y, s, s, s, 0, colorOf(p.color));
    }
  }

  function drawBoss(run) {
    const b = run.boss;
    if (!b || b.dead) {
      boss.visible = false;
      return;
    }
    boss.visible = true;
    boss.userData.crest.visible = !!b.final;
    const scale = b.radius / 1.6;
    boss.scale.setScalar(scale);
    boss.position.set(b.x, 0.1 + Math.sin(b.bob) * 0.08, -b.y);
    boss.userData.mat.color = colorOf(b.flash > 0 ? '#e8eef8' : '#5b6577');
    // 돌진 준비 중이면 눈이 밝게 타오른다
    const charging = b.final && b.pattern === 'charge';
    boss.userData.eye.material.color = colorOf(charging ? '#fff06a' : '#ff4a5c');
    const eyeGlow = takeMesh(pools.redGlow);
    if (eyeGlow) {
      eyeGlow.position.set(b.x, 2 * scale, -b.y - 0.95 * scale);
      eyeGlow.scale.setScalar(0.75 * scale);
      eyeGlow.material.opacity = charging ? 0.95 : 0.5;
    }
    if (charging) {
      const g = takeMesh(pools.glow);
      if (g) {
        g.position.set(b.x, 2.2 * scale, -b.y - 1);
        g.scale.setScalar(3.4);
        g.material.opacity = 0.8;
      }
    }
  }

  function drawPopups(run) {
    for (const p of LW.fx.popups) {
      if (!p.active) continue;
      const label = takeMesh(pools.label);
      if (!label) break;
      label.material.map = textTexture(p.text, p.color, p.sub);
      label.material.needsUpdate = true;
      const life = p.life / p.maxLife;
      label.position.set(p.x, 1.5 + (1 - life) * 1.8, -p.y);
      const s = 0.62 * p.size;
      label.scale.set(s * 2.2, s, 1);
      label.material.opacity = Math.min(1, life * 1.6);
    }
  }

  /** 디버그용 — 인스턴스 수와 재질 색을 들여다본다 (테스트에서만 쓴다). */
  function probe() {
    const out = {};
    for (const key in pools) {
      const p = pools[key];
      if (!p) continue;
      if (p.isInstancedMesh) {
        out[key] = {
          count: p.count,
          color: '#' + p.material.color.getHexString(),
          visible: p.visible,
        };
      } else if (p.length !== undefined) {
        out[key] = { used: p.used, of: p.length };
      }
    }
    return out;
  }

  LW.render3d = { init, usable, makeCamera, draw, probe };
})(typeof globalThis !== 'undefined' ? globalThis : this);
