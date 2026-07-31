/* DOM 화면·HUD. 게임 로직은 여기 두지 않는다 (콜백으로만 알린다). */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  function $(id) {
    return document.getElementById(id);
  }

  function create(handlers) {
    const el = {
      hud: $('hud'),
      stageName: $('hud-stage-name'),
      progress: $('hud-progress-fill'),
      coin: $('hud-coin'),
      squad: $('hud-squad'),
      squadCount: $('hud-squad-count'),
      tip: $('hud-tip'),
      bossBar: $('boss-bar'),
      bossFill: $('boss-fill'),
      home: $('screen-home'),
      homeCoin: $('home-coin'),
      homeBest: $('home-best'),
      homeStart: $('home-start'),
      playStage: $('btn-play-stage'),
      upgrade: $('screen-upgrade'),
      upgradeCoin: $('upgrade-coin'),
      upgradeList: $('upgrade-list'),
      stages: $('screen-stages'),
      stageList: $('stage-list'),
      result: $('screen-result'),
      resultTitle: $('result-title'),
      resultStars: $('result-stars'),
      resultLines: $('result-lines'),
      resultMain: $('btn-result-main'),
      resultRetry: $('btn-result-retry'),
      resultHome: $('btn-result-home'),
    };

    const screens = [el.home, el.upgrade, el.stages, el.result];
    let lastCount = -1;
    let lastBossRatio = -1;

    function hideAll() {
      for (const s of screens) s.classList.add('hidden');
    }

    function show(screen) {
      hideAll();
      el.hud.classList.add('hidden');
      screen.classList.remove('hidden');
    }

    function showHud() {
      hideAll();
      el.hud.classList.remove('hidden');
    }

    function showHome(save) {
      const mods = LW.upgrades.resolve(save.levels);
      el.homeCoin.textContent = save.coins;
      el.homeBest.textContent = save.bestStage;
      el.homeStart.textContent = mods.startCount;
      el.playStage.textContent = LW.config.stageName(save.bestStage).split(' ')[0];
      show(el.home);
    }

    function showUpgrade(save) {
      el.upgradeCoin.textContent = save.coins;
      el.upgradeList.innerHTML = '';
      for (const def of LW.upgrades.defs) {
        const level = save.levels[def.id] | 0;
        const cost = LW.upgrades.costOf(def.id, level);
        const maxed = level >= def.maxLevel;

        const row = document.createElement('div');
        row.className = 'upgrade-row';

        const icon = document.createElement('div');
        icon.className = 'upgrade-icon';
        icon.textContent = def.icon;

        const body = document.createElement('div');
        body.className = 'upgrade-body';
        const name = document.createElement('div');
        name.className = 'upgrade-name';
        name.textContent = def.name;
        const desc = document.createElement('div');
        desc.className = 'upgrade-desc';
        desc.textContent = def.desc;
        const lv = document.createElement('div');
        lv.className = 'upgrade-level';
        lv.textContent = 'Lv.' + level + ' · 현재 ' + def.display(level);
        body.append(name, desc, lv);

        const buy = document.createElement('button');
        buy.className = 'upgrade-buy';
        if (maxed) {
          buy.textContent = 'MAX';
          buy.disabled = true;
        } else {
          buy.innerHTML = '🔩 ' + cost;
          buy.disabled = save.coins < cost;
          buy.addEventListener('click', () => handlers.onBuy(def.id));
        }

        row.append(icon, body, buy);
        el.upgradeList.appendChild(row);
      }
      show(el.upgrade);
    }

    function starText(n) {
      return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
    }

    function showStages(save) {
      el.stageList.innerHTML = '';
      const top = Math.max(save.bestStage, LW.config.stageCount);
      for (let stage = 1; stage <= top; stage++) {
        const card = document.createElement('button');
        const locked = stage > save.bestStage;
        const stars = save.stars[stage] || 0;
        card.className = 'stage-card' + (locked ? ' locked' : '') + (stars > 0 ? ' cleared' : '');
        card.disabled = locked;
        const name = LW.config.stageName(stage).split(' · ');
        card.innerHTML =
          '<div class="sc-no">' + (locked ? '🔒' : stage) + '</div>' +
          '<div class="sc-name">' + (name[1] || '전선') + '</div>' +
          '<div class="sc-stars">' + (locked ? '' : starText(stars)) + '</div>';
        if (!locked) card.addEventListener('click', () => handlers.onPlay(stage));
        el.stageList.appendChild(card);
      }
      show(el.stages);
    }

    function showResult(result, save) {
      el.resultTitle.textContent = result.win ? '구역 돌파!' : '병력 전멸…';
      el.resultStars.textContent = result.win ? starText(result.stars) : '☆☆☆';
      el.resultLines.innerHTML = '';
      const lines = [
        ['생존 병력', '👥 ' + result.survived],
        ['최대 병력', '📈 ' + (result.peak || result.startCount)],
        ['처치한 로봇', '🤖 ' + result.kills],
        ['획득 부품', '🔩 ' + result.coins],
      ];
      for (const [k, v] of lines) {
        const row = document.createElement('div');
        row.className = 'rl';
        row.innerHTML = '<span>' + k + '</span><b>' + v + '</b>';
        el.resultLines.appendChild(row);
      }
      const nextStage = result.stage + 1;
      el.resultMain.textContent = result.win
        ? '다음 구역 (' + nextStage + ')'
        : '🔧 병력 강화';
      el.resultMain.onclick = result.win
        ? () => handlers.onPlay(nextStage)
        : () => handlers.onUpgrade();
      el.resultRetry.onclick = () => handlers.onPlay(result.stage);
      el.resultHome.onclick = () => handlers.onHome();
      show(el.result);
    }

    function setTip(text) {
      el.tip.textContent = text;
    }

    /** 매 프레임 호출 — DOM 은 값이 바뀔 때만 만진다. */
    function updateHud(run) {
      const count = run.squad.count;
      if (count !== lastCount) {
        el.squadCount.textContent = LW.util.formatCount(count);
        el.squad.classList.remove('pump', 'hurt');
        // 리플로우 강제 → 애니메이션 재시작
        void el.squad.offsetWidth;
        if (lastCount >= 0) el.squad.classList.add(count > lastCount ? 'pump' : 'hurt');
        lastCount = count;
      }
      el.progress.style.width = (LW.run.progress(run) * 100).toFixed(1) + '%';
      el.coin.textContent = run.parts;

      const boss = run.boss;
      if (boss && !boss.dead) {
        el.bossBar.classList.remove('hidden');
        const ratio = boss.hp / boss.maxHp;
        if (Math.abs(ratio - lastBossRatio) > 0.002) {
          el.bossFill.style.width = (ratio * 100).toFixed(1) + '%';
          lastBossRatio = ratio;
        }
      } else {
        el.bossBar.classList.add('hidden');
        lastBossRatio = -1;
      }
    }

    function beginRun(run) {
      lastCount = -1;
      lastBossRatio = -1;
      el.stageName.textContent = run.plan.name;
      el.bossBar.classList.add('hidden');
      setTip('드래그 · ← → 로 이동 · 좋은 문을 골라라');
      showHud();
      updateHud(run);
    }

    // 정적 버튼 배선
    $('btn-play').addEventListener('click', () => handlers.onPlayLatest());
    $('btn-upgrade').addEventListener('click', () => handlers.onUpgrade());
    $('btn-stages').addEventListener('click', () => handlers.onStages());
    for (const back of document.querySelectorAll('[data-back]')) {
      back.addEventListener('click', () => handlers.onHome());
    }

    return { showHome, showUpgrade, showStages, showResult, showHud, updateHud, beginRun, setTip };
  }

  LW.ui = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
