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
      bossName: document.querySelector('#boss-bar .boss-name'),
      buff: $('hud-buff'),
      gunner: $('hud-gunner'),
      gunnerCount: $('hud-gunner-count'),
      buffMult: $('hud-buff-mult'),
      buffTime: $('hud-buff-time'),
      bossFill: $('boss-fill'),
      home: $('screen-home'),
      homeCoin: $('home-coin'),
      homeBest: $('home-best'),
      homeStart: $('home-start'),
      homeBestTime: $('home-best-time'),
      playStage: $('btn-play-stage'),
      upgrade: $('screen-upgrade'),
      upgradeCoin: $('upgrade-coin'),
      upgradeList: $('upgrade-list'),
      stages: $('screen-stages'),
      stageList: $('stage-list'),
      chapterProgress: $('chapter-progress'),
      ending: $('screen-ending'),
      endingLines: $('ending-lines'),
      result: $('screen-result'),
      resultTitle: $('result-title'),
      resultStars: $('result-stars'),
      resultLines: $('result-lines'),
      resultMain: $('btn-result-main'),
      resultRetry: $('btn-result-retry'),
      resultHome: $('btn-result-home'),
    };

    const screens = [el.home, el.upgrade, el.stages, el.result, el.ending];
    let lastCount = -1;
    let lastBossRatio = -1;
    let lastSeconds = -1;

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

    /** 다음에 도전할 챕터 — 아직 못 깬 가장 앞 챕터. */
    function nextChapter(save) {
      for (let ch = 1; ch <= LW.config.chapterCount; ch++) {
        if (!(save.stars[ch] >= 1)) return Math.min(ch, save.bestChapter);
      }
      return LW.config.chapterCount;
    }

    function showHome(save) {
      const mods = LW.upgrades.resolve(save.levels);
      const cleared = LW.save.clearedCount(save);
      el.homeCoin.textContent = save.coins;
      el.homeBest.textContent = cleared + '/' + LW.config.chapterCount + (save.finalCleared ? ' 👑' : '');
      el.homeStart.textContent = mods.startCount;
      el.homeBestTime.textContent = LW.util.formatTime(save.bestTime || 0);
      const ch = nextChapter(save);
      el.playStage.textContent = LW.config.zoneOf(ch) + '-' + LW.config.partOf(ch);
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
      const cfg = LW.config;
      const per = cfg.chapters.perZone;
      el.stageList.innerHTML = '';
      el.chapterProgress.textContent =
        LW.save.clearedCount(save) + ' / ' + cfg.chapterCount + ' 챕터';

      for (let zone = 1; zone <= cfg.zoneCount; zone++) {
        const row = document.createElement('div');
        const zoneLocked = cfg.chapterOf(zone, 1) > save.bestChapter;
        row.className = 'zone-row' + (zoneLocked ? ' locked' : '');

        const label = document.createElement('div');
        label.className = 'zone-label';
        const place = cfg.stageName(zone).split(' · ')[1] || '전선';
        label.innerHTML =
          '<div class="zl-no">' + zone + '구역</div><div class="zl-name">' + place + '</div>';

        const btns = document.createElement('div');
        btns.className = 'chapter-btns';
        for (let part = 1; part <= per; part++) {
          const ch = cfg.chapterOf(zone, part);
          const locked = ch > save.bestChapter;
          const stars = save.stars[ch] || 0;
          const card = document.createElement('button');
          card.className =
            'chapter-card' +
            (locked ? ' locked' : '') +
            (stars > 0 ? ' cleared' : '') +
            (cfg.hasBossAt(ch) ? ' boss' : '');
          card.disabled = locked;
          card.innerHTML =
            '<div class="cc-no">' + (locked ? '🔒' : cfg.hasBossAt(ch) ? '👹' : part) + '</div>' +
            '<div class="cc-stars">' + (locked ? '' : starText(stars)) + '</div>';
          if (!locked) card.addEventListener('click', () => handlers.onPlay(ch));
          btns.appendChild(card);
        }

        row.append(label, btns);
        el.stageList.appendChild(row);
      }

      // 최종 결전 — 33챕터를 모두 깨야 열린다
      const ready = LW.save.allChaptersCleared(save);
      const finalBtn = document.createElement('button');
      finalBtn.className = 'final-card' + (ready ? '' : ' locked');
      finalBtn.disabled = !ready;
      finalBtn.innerHTML = ready
        ? '👑 최종 결전 · 고철 군단 심부' +
          '<span class="fc-sub">' + (save.finalCleared ? '클리어! 다시 도전할 수 있다' : '마지막 대장 로봇이 기다린다') + '</span>'
        : '🔒 최종 결전' +
          '<span class="fc-sub">33챕터를 모두 깨면 열린다 (' +
          LW.save.clearedCount(save) + '/' + LW.config.chapterCount + ')</span>';
      if (ready) finalBtn.addEventListener('click', () => handlers.onFinal());
      el.stageList.appendChild(finalBtn);

      show(el.stages);
    }

    function showEnding(save) {
      el.endingLines.innerHTML = '';
      const lines = [
        ['깬 챕터', '🏁 ' + LW.save.clearedCount(save) + ' / ' + LW.config.chapterCount],
        ['모은 별', '⭐ ' + Object.keys(save.stars).reduce((n, k) => n + (save.stars[k] | 0), 0) + ' / ' + LW.config.chapterCount * 3],
        ['버티기 기록', '⏱️ ' + LW.util.formatTime(save.bestTime || 0)],
      ];
      for (const [k, v] of lines) {
        const row = document.createElement('div');
        row.className = 'rl';
        row.innerHTML = '<span>' + k + '</span><b>' + v + '</b>';
        el.endingLines.appendChild(row);
      }
      show(el.ending);
    }

    function showResult(result, save) {
      const endless = !!result.endless;
      el.resultTitle.textContent = endless
        ? '버티기 종료'
        : result.win
          ? result.isFinal
            ? '고철 군단 격파!'
            : LW.config.hasBossAt(result.chapter)
              ? '대장 로봇 격파!'
              : '챕터 돌파!'
          : '병력 전멸…';
      el.resultStars.textContent = endless || result.win ? starText(result.stars) : '☆☆☆';
      el.resultLines.innerHTML = '';
      const lines = endless
        ? [
            ['버틴 시간', '⏱️ ' + LW.util.formatTime(result.seconds)],
            ['최고 기록', '🏆 ' + LW.util.formatTime(save.bestTime || 0)],
            ['도달 단계', '🔥 ' + result.tier + '단계'],
            ['최대 병력', '📈 ' + (result.peak || result.startCount)],
            ['처치한 로봇', '🤖 ' + result.kills],
            ['획득 부품', '🔩 ' + result.coins],
          ]
        : [
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
      if (endless) {
        el.resultMain.textContent = '🛡️ 다시 버티기';
        el.resultMain.onclick = () => handlers.onSurvival();
        el.resultRetry.textContent = '🔧 병력 강화';
        el.resultRetry.onclick = () => handlers.onUpgrade();
      } else if (result.isFinal) {
        el.resultMain.textContent = result.win ? '🎖️ 엔딩 보기' : '🔧 병력 강화';
        el.resultMain.onclick = result.win ? () => handlers.onEnding() : () => handlers.onUpgrade();
        el.resultRetry.textContent = '🔄 다시 도전';
        el.resultRetry.onclick = () => handlers.onFinal();
      } else {
        const cfg = LW.config;
        const ch = result.chapter;
        const last = ch >= cfg.chapterCount;
        const readyForFinal = last && LW.save.allChaptersCleared(save);
        if (!result.win) {
          el.resultMain.textContent = '🔧 병력 강화';
          el.resultMain.onclick = () => handlers.onUpgrade();
        } else if (readyForFinal) {
          el.resultMain.textContent = '👑 최종 결전으로!';
          el.resultMain.onclick = () => handlers.onFinal();
        } else if (last) {
          el.resultMain.textContent = '🗺️ 챕터 선택';
          el.resultMain.onclick = () => handlers.onStages();
        } else {
          const next = ch + 1;
          el.resultMain.textContent =
            '다음 챕터 (' + cfg.zoneOf(next) + '-' + cfg.partOf(next) + ')';
          el.resultMain.onclick = () => handlers.onPlay(next);
        }
        el.resultRetry.textContent = '🔄 다시 도전';
        el.resultRetry.onclick = () => handlers.onPlay(ch);
      }
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

      // 버티기 모드는 "구역 이름" 자리에 버틴 시간을 초 단위로 갱신한다
      if (run.endless) {
        const sec = Math.floor(run.time);
        if (sec !== lastSeconds) {
          lastSeconds = sec;
          el.stageName.textContent = '🛡️ ' + LW.util.formatTime(sec) + ' 버팀';
        }
      }

      // 총 픽업 버프
      const squad = run.squad;
      if (squad.buffTimer > 0) {
        el.buff.classList.remove('hidden');
        el.buffMult.textContent = '×' + (squad.mods.fireMult + squad.fireBonus()).toFixed(2);
        el.buffTime.textContent = squad.buffTimer.toFixed(1);
      } else {
        el.buff.classList.add('hidden');
      }

      // 미니건 병사
      if (squad.gunners > 0) {
        el.gunner.classList.remove('hidden');
        el.gunnerCount.textContent = squad.gunners;
      } else {
        el.gunner.classList.add('hidden');
      }

      const boss = run.boss;
      if (boss && !boss.dead) {
        el.bossBar.classList.remove('hidden');
        // 최종 보스는 지금 쓰는 패턴을 이름으로 보여준다
        if (boss.final && el.bossName) {
          const label = boss.patternLabel ? ' · ' + boss.patternLabel : '';
          const text = '최종 대장 로봇' + label;
          if (el.bossName.textContent !== text) el.bossName.textContent = text;
        }
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
      lastSeconds = -1;
      el.stageName.textContent = run.plan.name;
      el.bossBar.classList.add('hidden');
      el.gunner.classList.add('hidden');
      setTip(
        run.endless
          ? '왼쪽 문으로 병력을 불려라 · 오른쪽 드럼통에 깔리면 끝'
          : run.plan.hasBoss
            ? '좋은 문을 골라 병력을 불려라 · 끝에 대장 로봇이 있다'
            : '좋은 문을 골라라 · 코스 끝까지 버티면 돌파다'
      );
      // 보스 이름은 챕터마다 다르다 (최종 결전은 특별하게)
      if (el.bossName) {
        el.bossName.textContent = run.plan.isFinal ? '최종 대장 로봇' : '고철 대장 로봇';
      }
      showHud();
      updateHud(run);
    }

    // 정적 버튼 배선
    $('btn-play').addEventListener('click', () => handlers.onPlayLatest());
    $('btn-upgrade').addEventListener('click', () => handlers.onUpgrade());
    $('btn-stages').addEventListener('click', () => handlers.onStages());
    $('btn-survival').addEventListener('click', () => handlers.onSurvival());
    $('btn-ending-home').addEventListener('click', () => handlers.onHome());
    for (const back of document.querySelectorAll('[data-back]')) {
      back.addEventListener('click', () => handlers.onHome());
    }

    return {
      showHome, showUpgrade, showStages, showResult, showEnding, showHud,
      updateHud, beginRun, setTip, nextChapter,
    };
  }

  LW.ui = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
