/* 전투 시뮬레이션 — 캔버스·DOM 을 모르는 순수 상태 기계. 렌더러가 이 상태를 읽어 그린다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});
  const U = LW.util;

  function pool(size, make) {
    const arr = new Array(size);
    for (let i = 0; i < size; i++) arr[i] = make();
    return arr;
  }

  function takeFrom(arr) {
    for (let i = 0; i < arr.length; i++) if (!arr[i].active) return arr[i];
    return null; // 풀 소진 — 상한이 곧 성능 예산이다
  }

  /**
   * @param chapter 챕터 번호 1..33
   * @param opts {{endless?:boolean, final?:boolean}}
   *        endless: 버티기 모드(끝없는 코스, 보스 없음) · final: 최종 결전
   */
  function create(chapter, mods, opts) {
    const cfg = LW.config;
    const endless = !!(opts && opts.endless);
    const isFinal = !endless && !!(opts && opts.final);
    const plan = endless
      ? LW.survival.build(mods)
      : isFinal
        ? LW.stage.buildFinal(mods.startCount)
        : LW.stage.build(chapter, mods.startCount);
    const run = {
      plan: plan,
      endless: endless,
      mods: mods,
      squad: LW.squad.makeSquad(mods.startCount, mods),
      dist: 0,
      phase: 'run', // run | boss | won | lost
      time: 0,
      eventIndex: 0,
      kills: 0,
      parts: 0, // 전투 중 주운 부품
      shake: 0,
      startCount: mods.startCount,
      peak: mods.startCount, // 이번 전투에서 가장 많았던 병력 (별 계산 기준)
      bullets: pool(cfg.pools.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, dmg: 0 })),
      bolts: pool(cfg.pools.bolts, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0 })),
      enemies: pool(cfg.pools.enemies, () => ({
        active: false, kind: 'grunt', x: 0, y: 0, hp: 0, maxHp: 1,
        speed: 0, radius: 0.3, cost: 1, bounty: 1, fireTimer: 0, flash: 0, wobble: 0,
      })),
      particles: pool(cfg.pools.particles, () => ({
        active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 1,
      })),
      coins: [],
      barricades: [],
      barrels: [],
      guns: [], // 드럼통에서 떨어진 총 픽업
      gunnerPickups: [], // 길에서 기다리는 미니건 병사 (지나가면 합류)
      gates: [],
      boss: null,
      out: [], // 이번 프레임에 벌어진 일 (사운드·HUD 용)
    };
    return run;
  }

  function emit(run, type, data) {
    if (run.out.length < 24) run.out.push(data ? Object.assign({ type: type }, data) : { type: type });
  }

  function spawnParticles(run, x, y, count, color, power) {
    for (let i = 0; i < count; i++) {
      const p = takeFrom(run.particles);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.4 + Math.random() * 0.8);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.maxLife = 0.28 + Math.random() * 0.3;
      p.color = color;
      p.size = 0.06 + Math.random() * 0.07;
    }
  }

  /** 현재 부대 규모가 만드는 추가 압박(적 체력 배수). */
  function pressureHp(run) {
    const p = LW.config.pressure;
    return 1 + Math.min(p.maxEnemyHpBonus, run.squad.count * p.enemyHpPerUnit);
  }

  /** 부대가 클수록 한 번 부딪힐 때 잃는 병력도 커진다 (수가 늘어도 긴장이 유지되게). */
  function pressureContact(run) {
    const p = LW.config.pressure;
    return 1 + Math.min(p.maxContactBonus, run.squad.count * p.contactPerUnit);
  }

  function spawnEnemy(run, kind, x, y, hpMult) {
    const def = LW.config.enemyKinds[kind];
    const e = takeFrom(run.enemies);
    if (!e) return null;
    e.active = true;
    e.kind = kind;
    e.x = U.clamp(x, -LW.config.world.roadHalfWidth + 0.4, LW.config.world.roadHalfWidth - 0.4);
    e.y = y;
    const mult = Number.isFinite(hpMult) ? hpMult : run.plan.enemyHpMult;
    e.maxHp = e.hp = Math.max(1, Math.round(def.hp * mult * pressureHp(run)));
    e.speed = def.speed;
    e.radius = def.radius;
    e.cost = Math.max(1, Math.round(def.cost * pressureContact(run)));
    e.bounty = def.bounty;
    e.fireTimer = def.fireInterval ? def.fireInterval * 0.6 : 0;
    e.flash = 0;
    e.wobble = Math.random() * Math.PI * 2;
    return e;
  }

  /** 카메라 앞쪽으로 들어온 이벤트를 실제 오브젝트로 만든다. */
  function spawnAhead(run) {
    const limit = run.dist + LW.config.world.cameraFront + 6;
    // 버티기 모드는 코스가 끝이 없다 — 필요한 만큼만 앞을 만들어 둔다.
    if (run.plan.extend) run.plan.extend(limit + 80, run.eventIndex);
    const events = run.plan.events;
    while (run.eventIndex < events.length && events[run.eventIndex].y <= limit) {
      const ev = events[run.eventIndex++];
      if (ev.type === 'gate') {
        // solo 게이트(버티기 모드)는 문 하나다 — x·w 로 들어갈 자리를 정한다.
        run.gates.push({
          y: ev.y, doors: ev.doors, used: false, flash: 0,
          solo: !!ev.solo, x: ev.x || 0, w: ev.w || 0,
        });
      } else if (ev.type === 'wave') {
        // 부대가 커진 만큼 적도 겹쳐서 몰려온다 (스폰 시점의 병력 기준)
        const p = LW.config.pressure;
        const extra = Math.min(p.maxExtraWaves, Math.floor(run.squad.count / p.extraWavePer));
        for (const entry of ev.entries) {
          spawnEnemy(run, entry.kind, entry.x, entry.y, ev.hpMult);
          for (let k = 1; k <= extra; k++) {
            const side = k % 2 === 0 ? 1 : -1;
            spawnEnemy(run, entry.kind, entry.x + side * (0.7 + k * 0.35), entry.y + k * 1.9, ev.hpMult);
          }
        }
      } else if (ev.type === 'barricade') {
        run.barricades.push({
          x: ev.x, y: ev.y, hp: ev.hp, maxHp: ev.hp, broken: false, flash: 0,
        });
      } else if (ev.type === 'barrel') {
        run.barrels.push({
          x: ev.x, y: ev.y, hits: ev.hits, maxHits: ev.hits, broken: false, passed: false,
          flash: 0, bob: Math.random() * 6, lethal: !!ev.lethal,
        });
      } else if (ev.type === 'coin') {
        run.coins.push({ x: ev.x, y: ev.y, taken: false, bob: Math.random() * 6 });
      } else if (ev.type === 'gunner') {
        run.gunnerPickups.push({ x: ev.x, y: ev.y, taken: false, bob: Math.random() * 6, wave: 0 });
      }
    }
  }

  function fire(run, dt) {
    const squad = run.squad;
    squad.fireTimer -= dt;
    if (squad.fireTimer > 0) return;
    squad.fireTimer += squad.interval();
    const n = squad.volleyBullets();
    const dmg = squad.volleyDamage() / n;
    // 총알은 진형 폭에 고르게 퍼진다 — 부대가 넓어지면 사격 범위도 넓어진다.
    const spread = squad.halfWidth();
    const step = n > 1 ? (spread * 2) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const b = takeFrom(run.bullets);
      if (!b) break;
      b.active = true;
      b.x = squad.x - spread + i * step;
      b.y = run.dist + 0.25;
      b.vx = 0;
      b.dmg = dmg;
    }
    emit(run, 'shoot');
  }

  /** 미니건 병사 사격 — 병력 수와 무관하게 자기 화력을 빠르게 쏟는다. */
  function fireGunners(run, dt) {
    const squad = run.squad;
    if (squad.gunners <= 0) return;
    const cfg = LW.config.gunner;
    squad.gunnerTimer -= dt;
    if (squad.gunnerTimer > 0) return;
    squad.gunnerTimer += cfg.fireInterval;
    const dmg = squad.gunnerDamage();
    const boss = run.boss && !run.boss.dead ? run.boss : null;
    for (let i = 0; i < squad.gunners; i++) {
      const b = takeFrom(run.bullets);
      if (!b) break;
      const bx = squad.gunnerX(i);
      const by = run.dist + 0.3;
      b.active = true;
      b.x = bx;
      b.y = by;
      b.dmg = dmg;
      // 미니건 병사는 진형 바깥에 선다 — 곧게만 쏘면 가운데 있는 대장을 스쳐 지나간다.
      // 대장이 있으면 비스듬히 조준한다.
      if (boss) {
        const dy = Math.max(1, boss.y - by);
        b.vx = ((boss.x - bx) / dy) * LW.config.squad.bulletSpeed;
      } else {
        b.vx = 0;
      }
    }
    emit(run, 'minigun');
  }

  function updateGunnerPickups(run, dt) {
    const squad = run.squad;
    const hw = squad.halfWidth() + LW.config.gunner.pickupRadius;
    for (const p of run.gunnerPickups) {
      if (p.taken) continue;
      p.bob += dt * 3.2;
      p.wave += dt * 6;
      if (p.y <= run.dist + 0.5 && p.y > run.dist - 3 && Math.abs(p.x - squad.x) <= hw) {
        p.taken = true;
        const total = squad.addGunner();
        spawnParticles(run, p.x, p.y, 14, '#9ff0ff', 3.2);
        // 이미 꽉 찼으면 부품으로 바꿔 준다 — 지나쳤다는 허탈함을 남기지 않는다
        if (total === 0) run.parts += 6;
        emit(run, 'gunner', { total: total });
      }
    }
  }

  function killEnemy(run, e) {
    e.active = false;
    run.kills++;
    run.parts += e.bounty;
    spawnParticles(run, e.x, e.y, 7, '#ffce6a', 3.2);
    emit(run, 'kill');
  }

  function damageBoss(run, amount) {
    const boss = run.boss;
    boss.hp -= amount;
    boss.flash = 0.12;
    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.dead = true;
      run.shake = Math.max(run.shake, 0.7);
      spawnParticles(run, boss.x, boss.y, 40, '#ff9a4a', 6);
      run.phase = 'won';
      emit(run, 'win');
    }
  }

  function updateBullets(run, dt) {
    const speed = LW.config.squad.bulletSpeed;
    const br = LW.config.squad.bulletRadius;
    const maxY = run.dist + LW.config.world.cameraFront + 8;
    for (const b of run.bullets) {
      if (!b.active) continue;
      b.y += speed * dt;
      if (b.vx) b.x += b.vx * dt; // 미니건처럼 비스듬히 조준한 총알
      if (b.y > maxY) {
        b.active = false;
        continue;
      }
      // 적
      let hit = false;
      for (const e of run.enemies) {
        if (!e.active) continue;
        if (U.hitCircle(b.x, b.y, br, e.x, e.y, e.radius)) {
          e.hp -= b.dmg;
          e.flash = 0.08;
          spawnParticles(run, b.x, b.y, 2, '#fff2c0', 1.6);
          if (e.hp <= 0) killEnemy(run, e);
          hit = true;
          break;
        }
      }
      if (hit) {
        b.active = false;
        continue;
      }
      // 바리케이드
      for (const bar of run.barricades) {
        if (bar.broken) continue;
        const cfgB = LW.config.barricade;
        if (Math.abs(b.x - bar.x) <= cfgB.halfWidth && Math.abs(b.y - bar.y) <= cfgB.thickness) {
          bar.hp -= b.dmg;
          bar.flash = 0.08;
          spawnParticles(run, b.x, b.y, 2, '#9fb3cd', 1.6);
          if (bar.hp <= 0) {
            bar.broken = true;
            spawnParticles(run, bar.x, bar.y, 14, '#c8d4e6', 3.4);
            emit(run, 'break');
          }
          hit = true;
          break;
        }
      }
      if (hit) {
        b.active = false;
        continue;
      }
      // 드럼통 — 터지면 위의 총이 노면에 떨어진다
      for (const barrel of run.barrels) {
        if (barrel.broken) continue;
        const cfgBar = LW.config.barrel;
        if (U.hitCircle(b.x, b.y, br, barrel.x, barrel.y, cfgBar.radius)) {
          // 화력과 무관하게 한 발에 한 번 — 드럼통에 적힌 수만큼 맞혀야 터진다.
          barrel.hits -= 1;
          barrel.flash = 0.12;
          spawnParticles(run, b.x, b.y, 2, '#ffd08a', 1.6);
          if (barrel.hits <= 0) breakBarrel(run, barrel);
          hit = true;
          break;
        }
      }
      if (hit) {
        b.active = false;
        continue;
      }
      // 보스
      const boss = run.boss;
      if (boss && !boss.dead && U.hitCircle(b.x, b.y, br, boss.x, boss.y, boss.radius)) {
        b.active = false;
        damageBoss(run, b.dmg);
        spawnParticles(run, b.x, b.y, 3, '#ffd9a0', 2.2);
      }
    }
  }

  function breakBarrel(run, barrel) {
    barrel.broken = true;
    spawnParticles(run, barrel.x, barrel.y, 16, '#ffb45e', 4);
    // 위에 얹혀 있던 총이 떨어진다 — 지나가면서 주우면 연사가 빨라진다
    run.guns.push({ x: barrel.x, y: barrel.y, taken: false, bob: Math.random() * 6, fresh: 0 });
    emit(run, 'barrel');
  }

  function updateBarrels(run, prevDist, dt) {
    const cfgBar = LW.config.barrel;
    const squad = run.squad;
    for (const barrel of run.barrels) {
      barrel.flash = Math.max(0, barrel.flash - dt);
      barrel.bob += dt * 2.4;
      if (barrel.broken || barrel.passed) continue;
      if (prevDist < barrel.y && run.dist >= barrel.y) {
        barrel.passed = true;
        // 안 터뜨리고 박으면 병력을 잃는다 (총도 놓친다)
        if (Math.abs(squad.x - barrel.x) <= cfgBar.radius + squad.halfWidth()) {
          barrel.broken = true;
          spawnParticles(run, barrel.x, barrel.y, 18, '#c8d4e6', 4.2);
          if (barrel.lethal) {
            // 버티기 모드: 깔리면 병력이 남아 있어도 끝난다.
            run.squad.count = 0;
            run.shake = Math.max(run.shake, 0.6);
            run.phase = 'lost';
            emit(run, 'crush');
            emit(run, 'lose');
            continue;
          }
          hurtSquad(run, cfgBar.crushCost, barrel.x, barrel.y);
        }
      }
    }
  }

  function updateGuns(run, dt) {
    const squad = run.squad;
    const hw = squad.halfWidth() + LW.config.weapon.pickupRadius;
    for (const gun of run.guns) {
      if (gun.taken) continue;
      gun.bob += dt * 4.5;
      gun.fresh += dt;
      if (gun.y <= run.dist + 0.5 && gun.y > run.dist - 3 && Math.abs(gun.x - squad.x) <= hw) {
        gun.taken = true;
        const stacks = squad.pickUpWeapon();
        spawnParticles(run, gun.x, gun.y, 12, '#ffe27a', 3.4);
        emit(run, 'weapon', { stacks: stacks });
      }
    }
  }

  function hurtSquad(run, n, x, y) {
    run.squad.lose(n);
    run.shake = Math.max(run.shake, 0.28);
    spawnParticles(run, x, y, 8, '#7fd0ff', 3);
    emit(run, 'hurt', { amount: n });
    if (!run.squad.alive() && run.phase !== 'won') {
      run.phase = 'lost';
      emit(run, 'lose');
    }
  }

  function spawnBolt(run, x, y, tx, ty) {
    const b = takeFrom(run.bolts);
    if (!b) return;
    const dx = tx - x;
    const dy = ty - y;
    const len = Math.hypot(dx, dy) || 1;
    const sp = LW.config.enemyBolt.speed;
    b.active = true;
    b.x = x;
    b.y = y;
    b.vx = (dx / len) * sp;
    b.vy = (dy / len) * sp;
  }

  function updateEnemies(run, dt) {
    const squad = run.squad;
    const front = run.dist;
    const hw = squad.halfWidth();
    for (const e of run.enemies) {
      if (!e.active) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.wobble += dt * 6;
      e.y -= e.speed * dt;

      if (e.fireTimer > 0) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = LW.config.enemyKinds[e.kind].fireInterval;
          spawnBolt(run, e.x, e.y, squad.x, front);
        }
      }

      // 스쿼드 선두 라인 접촉
      if (e.y <= front + e.radius && Math.abs(e.x - squad.x) <= hw + e.radius) {
        hurtSquad(run, e.cost, e.x, e.y);
        e.active = false;
        continue;
      }
      if (e.y < front - 8) e.active = false; // 옆으로 흘려보냄
    }
  }

  function updateBolts(run, dt) {
    const squad = run.squad;
    const hw = squad.halfWidth();
    const r = LW.config.enemyBolt.radius;
    for (const b of run.bolts) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < run.dist - 3 || Math.abs(b.x) > LW.config.world.roadHalfWidth + 2) {
        b.active = false;
        continue;
      }
      if (b.y <= run.dist + 0.3 && Math.abs(b.x - squad.x) <= hw + r) {
        b.active = false;
        hurtSquad(run, Math.round(LW.config.enemyBolt.cost * pressureContact(run)), b.x, b.y);
      }
    }
  }

  function updateGates(run, prevDist) {
    const squad = run.squad;
    for (const gate of run.gates) {
      gate.flash = Math.max(0, gate.flash - 0.02);
      if (gate.used) continue;
      if (prevDist < gate.y && run.dist >= gate.y) {
        let door;
        if (gate.solo) {
          // 문이 하나뿐 — 부대 중심이 문 안에 있어야 적용된다. 진형 폭으로 판정하면
          // 병력이 많을 때 스치기만 해도 함정 문에 빨려들어 불공평하다.
          if (Math.abs(squad.x - gate.x) > gate.w / 2) {
            gate.used = true;
            gate.chosen = -1;
            continue;
          }
          door = gate.doors[0];
        } else {
          door = squad.x < 0 ? gate.doors[0] : gate.doors[1];
        }
        const before = squad.count;
        squad.count = LW.gates.apply(squad.count, door);
        // 버티기 모드에는 전용 상한이 있다 — 진형이 도로를 막으면 즉사를 피할 수 없다.
        if (run.endless) squad.count = Math.min(squad.count, LW.config.survival.maxCount);
        gate.used = true;
        gate.flash = 1;
        gate.chosen = gate.solo ? 0 : squad.x < 0 ? 0 : 1;
        const delta = squad.count - before;
        spawnParticles(run, squad.x, gate.y, 12, delta >= 0 ? '#7dffa8' : '#ff8b96', 3.4);
        emit(run, 'gate', { delta: delta, buff: delta >= 0, count: squad.count });
        if (!squad.alive()) {
          run.phase = 'lost';
          emit(run, 'lose');
        }
      }
    }
  }

  function updateCoins(run) {
    const squad = run.squad;
    const hw = squad.halfWidth() + 0.4;
    for (const c of run.coins) {
      if (c.taken) continue;
      if (c.y <= run.dist + 0.4 && c.y > run.dist - 2 && Math.abs(c.x - squad.x) <= hw) {
        c.taken = true;
        run.parts += 2;
        emit(run, 'coin');
      }
    }
  }

  function updateBarricades(run, prevDist, dt) {
    const cfgB = LW.config.barricade;
    const squad = run.squad;
    for (const bar of run.barricades) {
      bar.flash = Math.max(0, bar.flash - dt);
      if (bar.broken || bar.passed) continue;
      if (prevDist < bar.y && run.dist >= bar.y) {
        bar.passed = true;
        if (Math.abs(squad.x - bar.x) <= cfgB.halfWidth + squad.halfWidth()) {
          hurtSquad(run, cfgB.crushCost, bar.x, bar.y);
          bar.broken = true;
          spawnParticles(run, bar.x, bar.y, 12, '#c8d4e6', 3);
        }
      }
    }
  }

  /** boss.js 가 세계를 건드릴 때 쓰는 통로 — 스폰·피해는 여기 소관이다. */
  const BOSS_API = {
    spawnEnemy: spawnEnemy,
    spawnBolt: function (run, x, y, tx, ty) {
      spawnBolt(run, x, y, tx, ty);
    },
    hurtSquad: function (run, n, x, y) {
      hurtSquad(run, n, x, y);
    },
    emit: emit,
    pressureContact: pressureContact,
  };

  function updateBoss(run, dt) {
    const cfgBoss = LW.config.boss;
    const boss = run.boss;
    if (!boss || boss.dead) return;
    boss.flash = Math.max(0, boss.flash - dt);
    boss.bob += dt * 2.2;

    // 최종 보스는 패턴 상태 기계가 움직인다
    if (boss.final) {
      LW.boss.update(run, boss, dt, BOSS_API);
      return;
    }

    // 플레이어 쪽으로 천천히 접근 + 좌우 추적
    boss.y -= cfgBoss.speed * dt;
    boss.x = U.damp(boss.x, run.squad.x, 0.9, dt);

    boss.spawnTimer -= dt;
    if (boss.spawnTimer <= 0) {
      boss.spawnTimer = cfgBoss.spawnInterval;
      const kinds = run.plan.theme.kinds;
      for (let i = 0; i < 3; i++) {
        spawnEnemy(run, kinds[i % kinds.length], boss.x + (i - 1) * 1.5, boss.y - 1.2);
      }
      emit(run, 'bossSpawn');
    }

    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      boss.fireTimer = cfgBoss.fireInterval;
      for (let i = -1; i <= 1; i++) {
        spawnBolt(run, boss.x, boss.y - boss.radius, run.squad.x + i * 2.2, run.dist);
      }
    }

    if (boss.y <= run.dist + boss.radius + 0.6) {
      hurtSquad(run, Math.round(cfgBoss.contactCost * pressureContact(run)), boss.x, boss.y);
      boss.y += 4; // 밀려남 — 즉사가 아니라 압박
      run.shake = Math.max(run.shake, 0.5);
    }
  }

  /** 뒤로 흘러간 오브젝트는 버린다 — 배열이 무한히 길어지지 않게. */
  function cleanupPassed(run) {
    const behind = run.dist - 14;
    for (let i = run.gates.length - 1; i >= 0; i--) if (run.gates[i].y < behind) run.gates.splice(i, 1);
    for (let i = run.coins.length - 1; i >= 0; i--) if (run.coins[i].y < behind) run.coins.splice(i, 1);
    for (let i = run.barricades.length - 1; i >= 0; i--) if (run.barricades[i].y < behind) run.barricades.splice(i, 1);
    for (let i = run.barrels.length - 1; i >= 0; i--) if (run.barrels[i].y < behind) run.barrels.splice(i, 1);
    for (let i = run.guns.length - 1; i >= 0; i--) if (run.guns[i].y < behind) run.guns.splice(i, 1);
    for (let i = run.gunnerPickups.length - 1; i >= 0; i--) {
      if (run.gunnerPickups[i].y < behind) run.gunnerPickups.splice(i, 1);
    }
  }

  function updateParticles(run, dt) {
    for (const p of run.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }

  /** 한 프레임에 허용하는 최대 시간. 이보다 크면 장애물을 뚫고 지나간다. */
  const MAX_STEP = 1 / 20;

  /**
   * 한 프레임 진행.
   *
   * `dt` 와 `input` 은 바깥(브라우저 이벤트·rAF)에서 온다. 탭이 백그라운드로 갔다 오거나
   * 포인터 이벤트가 좌표를 안 줄 때 NaN·무한대가 섞여 들어올 수 있으므로 입구에서 정화한다.
   * 한 프레임에 너무 큰 dt 가 들어오면 충돌 판정을 건너뛰며 지나가 버리므로 상한도 둔다.
   *
   * @param input {{targetX:number}}
   */
  function update(run, dt, input) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, MAX_STEP)) : 0;
    run.out.length = 0;
    if (run.phase === 'won' || run.phase === 'lost') {
      updateParticles(run, dt);
      run.shake = Math.max(0, run.shake - dt * 2);
      return run.out;
    }

    run.time += dt;
    run.shake = Math.max(0, run.shake - dt * 2);

    const cfg = LW.config;
    const squad = run.squad;
    const limit = cfg.world.roadHalfWidth - squad.halfWidth();
    const wanted = input && Number.isFinite(input.targetX) ? input.targetX : squad.x;
    squad.targetX = U.clamp(wanted, -limit, limit);
    squad.x = U.damp(squad.x, squad.targetX, cfg.squad.moveSpeed * squad.mods.speedMult, dt);

    const prevDist = run.dist;
    if (run.phase === 'run') {
      run.dist += cfg.squad.advanceSpeed * dt;
      // 대장 로봇이 없는 챕터(1·2챕터)는 코스 끝까지 버티면 돌파다.
      if (run.plan.hasBoss === false) {
        if (run.dist >= run.plan.bossY) {
          run.dist = run.plan.bossY;
          run.phase = 'won';
          emit(run, 'win');
        }
      } else if (run.dist >= run.plan.bossY - cfg.boss.standoff) {
        run.dist = run.plan.bossY - cfg.boss.standoff;
        run.phase = 'boss';
        // 큰 부대를 데려오면 보스도 그만큼 단단해진다 — 체력바가 늘 의미 있게.
        const p = LW.config.pressure;
        const bossHp = Math.round(
          run.plan.bossHp * (1 + Math.min(p.maxBossHpBonus, squad.count * p.bossHpPerUnit))
        );
        run.boss = {
          x: 0,
          y: run.plan.bossY,
          hp: bossHp,
          maxHp: bossHp,
          radius: cfg.boss.radius * (run.plan.isFinal ? cfg.finalStage.bossRadiusMult : 1),
          spawnTimer: 1.6,
          fireTimer: 2.2,
          flash: 0,
          bob: 0,
          dead: false,
          final: false,
        };
        // 최종 보스는 패턴을 번갈아 쓴다 (src/boss.js)
        if (run.plan.isFinal) LW.boss.attach(run.boss);
        emit(run, 'bossStart');
      }
    }

    spawnAhead(run);
    fire(run, dt);
    fireGunners(run, dt);
    updateBullets(run, dt);
    updateEnemies(run, dt);
    updateBolts(run, dt);
    updateGates(run, prevDist);
    updateCoins(run);
    updateBarricades(run, prevDist, dt);
    updateBarrels(run, prevDist, dt);
    updateGuns(run, dt);
    updateGunnerPickups(run, dt);
    if (squad.tickBuff(dt)) emit(run, 'weaponEnd');
    updateBoss(run, dt);
    updateParticles(run, dt);
    cleanupPassed(run);
    if (squad.count > run.peak) run.peak = squad.count;

    return run.out;
  }

  /** 진행도 0..1 — HUD 게이지용. */
  function progress(run) {
    if (run.endless) {
      const per = LW.config.survival.tierEvery;
      return U.clamp((run.dist % per) / per, 0, 1);
    }
    if (run.phase === 'boss' || run.phase === 'won') {
      if (!run.boss) return 1;
      return 1; // 보스 단계는 보스 체력바가 진행도 역할을 한다
    }
    return U.clamp(run.dist / Math.max(1, run.plan.bossY - LW.config.boss.standoff), 0, 1);
  }

  /** 결과 집계 — 세이브에 넘길 값. */
  function result(run) {
    if (run.endless) return survivalResult(run);
    const win = run.phase === 'won';
    const survived = run.squad.count;
    // 별은 "얼마나 안 잃고 끝냈나" — 시작 인원이 아니라 최대 인원 대비로 본다.
    const ratio = survived / Math.max(1, run.peak);
    let stars = 0;
    if (win) {
      stars = 1;
      const th = LW.config.starThresholds;
      if (ratio >= th.two) stars = 2;
      if (ratio >= th.three) stars = 3;
    }
    const base = win ? run.plan.rewardBase : Math.round(run.plan.rewardBase * 0.3);
    const coins = Math.round((base + run.parts + (win ? survived * 0.4 : 0)) * run.mods.lootMult);
    return {
      win: win,
      chapter: run.plan.chapter,
      zone: run.plan.zone,
      part: run.plan.part,
      isFinal: !!run.plan.isFinal,
      stage: run.plan.stage,
      stars: stars,
      survived: survived,
      startCount: run.startCount,
      peak: run.peak,
      kills: run.kills,
      coins: coins,
    };
  }

  /** 버티기 결과 — 이기는 게 없으니 버틴 시간이 점수다. */
  function survivalResult(run) {
    const sv = LW.config.survival;
    const seconds = run.time;
    const tier = LW.survival.tierAt(run.dist);
    let stars = 1;
    if (seconds >= sv.starSeconds[0]) stars = 2;
    if (seconds >= sv.starSeconds[1]) stars = 3;
    const coins = Math.round((run.parts + tier * sv.rewardPerTier + seconds * 0.25) * run.mods.lootMult);
    return {
      win: false,
      endless: true,
      stage: 0,
      stars: stars,
      seconds: seconds,
      tier: tier,
      survived: run.squad.count,
      startCount: run.startCount,
      peak: run.peak,
      kills: run.kills,
      coins: coins,
    };
  }

  LW.run = { create, update, progress, result, spawnEnemy };
})(typeof globalThis !== 'undefined' ? globalThis : this);
