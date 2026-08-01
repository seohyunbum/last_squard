/* 실제 브라우저에서 게임이 돌아가는지 확인 — 콘솔 에러 0, 전투 진행, 승리 화면까지. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 5199;
const OUT_DIR = process.env.SMOKE_OUT || path.join(__dirname, '..', '.smoke');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

  /** 거리를 건너뛰면 코스의 모든 웨이브가 한꺼번에 스폰된다 — 보스전만 보려고 치운다. */
  async function isolateBossFight(page, count) {
    await page.evaluate((n) => {
      const run = window.LW.debug.state().run;
      for (const e of run.enemies) e.active = false;
      for (const b of run.bolts) b.active = false;
      window.LW.debug.boost(n);
    }, count);
  }


async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'ignore',
  });
  await wait(600);

  // 설치된 브라우저 경로가 playwright 기본값과 다를 수 있다 (CHROME_PATH 로 덮어쓸 수 있음)
  const launchOpts = {};
  const candidates = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  for (const bin of candidates) {
    if (fs.existsSync(bin)) {
      launchOpts.executablePath = bin;
      break;
    }
  }
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  const checks = [];
  function check(name, ok, extra) {
    checks.push({ name, ok: !!ok, extra: extra || '' });
    console.log((ok ? '  ok  ' : ' FAIL ') + name + (extra ? ' — ' + extra : ''));
  }

  try {
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' });
    await wait(400);

    check('기지 화면이 보인다', await page.isVisible('#screen-home'));
    check('제목이 렌더된다', (await page.textContent('.title')).includes('라스트 스쿼드'));

    // 전투 시작
    await page.click('#btn-play');
    await wait(1200);
    check('전투 HUD 로 전환된다', await page.isVisible('#hud'));
    check('기지 화면이 닫힌다', !(await page.isVisible('#screen-home')));

    const progress1 = await page.$eval('#hud-progress-fill', (el) => parseFloat(el.style.width));
    await wait(1200);
    const progress2 = await page.$eval('#hud-progress-fill', (el) => parseFloat(el.style.width));
    check('진행도가 올라간다', progress2 > progress1, progress1 + '% -> ' + progress2 + '%');

    // 어떤 렌더러로 그리고 있나 (3D 가 가능하면 3D, 아니면 2D 폴백)
    const gfxMode = await page.evaluate(() => window.LW.debug.state().gfx);
    check('렌더러가 붙었다', gfxMode === '3d' || gfxMode === '2d', gfxMode);

    if (gfxMode === '3d') {
      // WebGL 캔버스는 픽셀을 바로 읽을 수 없다 — 무엇을 몇 개 그렸는지로 확인한다
      const p3 = await page.evaluate(() => window.LW.render3d.probe());
      check('3D: 부대가 장면에 들어간다', p3.unitBody.count > 0, p3.unitBody.count + '명');
      check('3D: 병사 머리도 함께 그린다', p3.unitHead.count === p3.unitBody.count);
      check('3D: 게이트가 3D 로 만들어진다', p3.gate.used > 0, p3.gate.used + '개');
      // 실제로 화면에 색이 찍혔는지 (스크린샷 픽셀로 확인)
      const shot = await page.screenshot({ clip: { x: 0, y: 300, width: 200, height: 200 } });
      check('3D: 화면이 비어 있지 않다', shot.length > 2000, shot.length + 'B PNG');
    } else {
      const painted = await page.evaluate(() => {
        const c = document.getElementById('stage');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        return seen.size;
      });
      check('2D: 캔버스에 장면이 그려진다', painted > 6, painted + '가지 색');
    }

    // 좌우 이동
    await page.keyboard.down('ArrowLeft');
    await wait(400);
    await page.keyboard.up('ArrowLeft');
    const movedLeft = await page.evaluate(() => window.LW.debug.state().run.squad.x);
    check('← 키로 부대가 왼쪽으로 간다', movedLeft < -0.2, 'x=' + movedLeft.toFixed(2));

    // 게이트를 최소 하나는 통과했는지 (코스 구성 확인)
    const gateInfo = await page.evaluate(async () => {
      const run = window.LW.debug.state().run;
      return { gates: run.gates.length, count: run.squad.count, hasBoss: run.plan.hasBoss, name: run.plan.name };
    });
    check('게이트가 코스에 등장한다', gateInfo.gates >= 1, gateInfo.gates + '개');
    check('1챕터는 대장 로봇이 없다', gateInfo.hasBoss === false, gateInfo.name);

    await page.screenshot({ path: path.join(OUT_DIR, '01-battle.png') });

    // 미니건 병사 — 길에서 기다리다 지나가면 합류한다
    const gunnerInfo = await page.evaluate(async () => {
      const LW = window.LW;
      const run = LW.debug.state().run;
      const waiting = run.plan.events.filter((e) => e.type === 'gunner');
      // 눈앞으로 한 명 불러 세운다
      run.gunnerPickups.length = 0;
      run.gunnerPickups.push({ x: run.squad.x, y: run.dist + 7, taken: false, bob: 0, wave: 0 });
      return { onCourse: waiting.length, before: run.squad.gunners };
    });
    check('코스에 미니건 병사가 배치된다', gunnerInfo.onCourse >= 1, gunnerInfo.onCourse + '명');
    await wait(300);
    await page.screenshot({ path: path.join(OUT_DIR, '11-gunner-wait.png') });
    // 소프트웨어 렌더링에서는 프레임이 느려 게임 시간도 느리게 흐른다 — 조건으로 기다린다
    let gunnerJoined = true;
    try {
      await page.waitForFunction(() => window.LW.debug.state().run.squad.gunners >= 1, null, { timeout: 20000 });
    } catch (err) {
      gunnerJoined = false;
    }
    const joined = await page.evaluate(() => {
      const run = window.LW.debug.state().run;
      return { gunners: run.squad.gunners, chip: !document.getElementById('hud-gunner').classList.contains('hidden') };
    });
    check('지나가면 미니건 병사가 합류한다', gunnerJoined && joined.gunners >= 1, joined.gunners + '명');
    check('HUD 에 미니건 칩이 뜬다', joined.chip);
    await page.screenshot({ path: path.join(OUT_DIR, '12-gunner-joined.png') });

    // 1챕터: 코스 끝까지 버티면 돌파 (보스 없음)
    // (3D 소프트웨어 렌더링에서는 프레임이 느리므로 결과는 waitForSelector 로 기다린다)
    await page.evaluate(() => {
      const run = window.LW.debug.state().run;
      window.LW.debug.boost(60);
      run.dist = run.plan.bossY - 2;
    });
    let ch1Result = true;
    try {
      await page.waitForSelector('#screen-result', { state: 'visible', timeout: 6000 });
    } catch (err) {
      ch1Result = false;
    }
    check('1챕터는 코스 끝까지 가면 돌파된다', ch1Result);
    check('챕터 돌파 문구가 나온다', (await page.textContent('#result-title')).includes('챕터 돌파'));
    const bestAfterCh1 = await page.evaluate(() => window.LW.debug.state().save.bestChapter);
    check('다음 챕터가 해금된다', bestAfterCh1 >= 2, 'bestChapter=' + bestAfterCh1);

    // 3챕터: 대장 로봇 -> 승리 -> 결과 화면
    await page.evaluate(() => window.LW.debug.start(3));
    await wait(600);
    const ch3 = await page.evaluate(() => window.LW.debug.state().run.plan);
    check('3챕터에는 대장 로봇이 있다', ch3.hasBoss === true, ch3.name);
    await page.evaluate(() => {
      window.LW.debug.boost(150);
      window.LW.debug.skipToBoss();
    });
    await wait(900);
    await isolateBossFight(page, 150);
    check('보스 체력바가 뜬다', await page.isVisible('#boss-bar'));
    await page.screenshot({ path: path.join(OUT_DIR, '02-boss.png') });

    await page.evaluate(() => window.LW.debug.finishBoss());
    let resultShown = true;
    try {
      await page.waitForSelector('#screen-result', { state: 'visible', timeout: 6000 });
    } catch (err) {
      resultShown = false;
    }
    check('결과 화면이 뜬다', resultShown);
    const resultTitle = await page.textContent('#result-title');
    check('대장 격파로 처리된다', resultTitle.includes('격파'), resultTitle);
    check('별이 표시된다', (await page.textContent('#result-stars')).length >= 3);
    await page.screenshot({ path: path.join(OUT_DIR, '03-result.png') });

    const best = await page.evaluate(() => window.LW.debug.state().save.bestChapter);
    check('보스 챕터도 다음을 해금한다', best >= 4, 'bestChapter=' + best);

    // 업그레이드 화면
    await page.click('#btn-result-home');
    await page.click('#btn-upgrade');
    await wait(200);
    const rows = await page.$$eval('.upgrade-row', (els) => els.length);
    check('강화 항목이 모두 나온다', rows === 5, rows + '개');
    await page.screenshot({ path: path.join(OUT_DIR, '04-upgrade.png') });

    // 챕터 선택 — 11구역 × 3챕터 = 33
    await page.click('[data-back]');
    await page.click('#btn-stages');
    await wait(200);
    const zones = await page.$$eval('.zone-row', (els) => els.length);
    const chapterCards = await page.$$eval('.chapter-card', (els) => els.length);
    check('구역이 11개 나온다', zones === 11, zones + '개');
    check('챕터가 33개 나온다', chapterCards === 33, chapterCards + '개');
    const finalLocked = await page.$eval('.final-card', (el) => el.className + '|' + el.textContent);
    check('최종 결전이 잠겨 있다', finalLocked.includes('locked'), finalLocked.split('|')[1].trim());
    await page.screenshot({ path: path.join(OUT_DIR, '07-chapters.png') });

    /* ---------- 버티기 모드 ---------- */
    await page.click('#screen-stages [data-back]');
    await page.click('#btn-survival');
    await wait(1500);
    check('버티기 모드로 들어간다', await page.isVisible('#hud'));
    const sv = await page.evaluate(() => {
      const run = window.LW.debug.state().run;
      const gates = run.plan.events.filter((e) => e.type === 'gate');
      const barrels = run.plan.events.filter((e) => e.type === 'barrel');
      return {
        endless: run.endless,
        boss: !!run.boss,
        gatesLeft: gates.length > 0 && gates.every((g) => g.solo && g.x + g.w / 2 <= 0),
        barrelsRight: barrels.length > 0 && barrels.every((b) => b.x > 0 && b.lethal),
        onRoad: run.gates.length,
      };
    });
    check('버티기는 끝없는 코스다', sv.endless && !sv.boss);
    check('게이트가 왼쪽에만 나온다', sv.gatesLeft);
    check('드럼통이 오른쪽에만, 즉사로 나온다', sv.barrelsRight);
    check('버티기 게이트가 화면에 뜬다', sv.onRoad >= 1, sv.onRoad + '개');
    const svTime = await page.textContent('#hud-stage-name');
    check('HUD 에 버틴 시간이 나온다', svTime.includes('버팀'), svTime);
    await page.screenshot({ path: path.join(OUT_DIR, '05-survival.png') });

    // 즉사 확인: 드럼통 앞으로 들어간다
    await page.evaluate(() => {
      const run = window.LW.debug.state().run;
      run.barrels.length = 0;
      run.barrels.push({
        x: run.squad.x, y: run.dist + 3, hits: 9999, maxHits: 9999,
        broken: false, passed: false, flash: 0, bob: 0, lethal: true,
      });
    });
    let svResult = true;
    try {
      await page.waitForSelector('#screen-result', { state: 'visible', timeout: 8000 });
    } catch (err) {
      svResult = false;
    }
    check('드럼통에 깔리면 즉시 끝난다', svResult);
    const svTitle = await page.textContent('#result-title');
    check('버티기 결과 화면이 뜬다', svTitle.includes('버티기'), svTitle);
    const svBest = await page.evaluate(() => window.LW.debug.state().save);
    check('버티기 기록이 저장된다', svBest.bestTime > 0, svBest.bestTime.toFixed(1) + '초');
    check('버티기가 챕터를 해금하지 않는다', svBest.bestChapter === best, 'bestChapter=' + svBest.bestChapter);
    await page.screenshot({ path: path.join(OUT_DIR, '06-survival-result.png') });

    /* ---------- 최종 결전 · 엔딩 ---------- */
    await page.evaluate(() => window.LW.debug.unlockAll());
    await page.click('#btn-stages');
    await wait(200);
    const finalReady = await page.$eval('.final-card', (el) => !el.className.includes('locked'));
    check('33챕터를 다 깨면 최종 결전이 열린다', finalReady);
    await page.screenshot({ path: path.join(OUT_DIR, '08-final-unlocked.png') });

    await page.click('.final-card');
    await wait(700);
    const finalPlan = await page.evaluate(() => window.LW.debug.state().run.plan);
    check('최종 결전이 시작된다', finalPlan.isFinal === true, finalPlan.name);
    check('최종 보스가 33챕터보다 단단하다', finalPlan.bossHp > 6000, 'hp=' + finalPlan.bossHp);

    await page.evaluate(() => {
      window.LW.debug.boost(400);
      window.LW.debug.skipToBoss();
    });
    await wait(800);
    await isolateBossFight(page, 400);
    await page.screenshot({ path: path.join(OUT_DIR, '09-final-boss.png') });
    check('최종 보스전으로 넘어간다', await page.isVisible('#boss-bar'));
    await page.evaluate(() => window.LW.debug.finishBoss());
    let finalResult = true;
    try {
      await page.waitForSelector('#screen-result', { state: 'visible', timeout: 8000 });
    } catch (err) {
      finalResult = false;
    }
    check('최종 결전 결과 화면이 뜬다', finalResult);
    const finalTitle = await page.textContent('#result-title');
    check('격파 문구가 나온다', finalTitle.includes('격파'), finalTitle);
    const finalSave = await page.evaluate(() => window.LW.debug.state().save);
    check('최종 클리어가 저장된다', finalSave.finalCleared === true);

    await page.click('#btn-result-main');
    let endingShown = true;
    try {
      await page.waitForSelector('#screen-ending', { state: 'visible', timeout: 5000 });
    } catch (err) {
      endingShown = false;
    }
    check('엔딩이 나온다', endingShown);
    check(
      '엔딩 문구가 보인다',
      endingShown && (await page.textContent('#screen-ending')).includes('부대는 집으로')
    );
    await page.screenshot({ path: path.join(OUT_DIR, '10-ending.png') });
    await page.click('#btn-ending-home');
    await wait(300);
    check('엔딩에서 기지로 돌아온다', await page.isVisible('#screen-home'));

    check('콘솔 에러가 없다', errors.length === 0, errors.join(' | '));

    /* ---------- 2D 폴백: three.js 를 못 받는 기기에서도 게임이 돌아야 한다 ---------- */
    const page2 = await browser.newPage({ viewport: { width: 480, height: 900 } });
    const errors2 = [];
    page2.on('pageerror', (err) => errors2.push('pageerror: ' + err.message));
    await page2.route('**/three.min.js', (r) => r.abort());
    await page2.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' });
    await page2.click('#btn-play');
    await wait(1500);
    const fb = await page2.evaluate(() => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      let colors = 0;
      if (ctx) {
        const d = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        colors = seen.size;
      }
      return { gfx: window.LW.debug.state().gfx, colors: colors, dist: window.LW.debug.state().run.dist };
    });
    check('3D 를 못 쓰면 2D 로 되돌아간다', fb.gfx === '2d', fb.gfx);
    check('2D 폴백도 장면을 그린다', fb.colors > 6, fb.colors + '가지 색');
    check('2D 폴백에서도 전투가 진행된다', fb.dist > 1, 'dist=' + fb.dist.toFixed(1));
    check('2D 폴백에 스크립트 에러가 없다', errors2.length === 0, errors2.join(' | '));
    await page2.screenshot({ path: path.join(OUT_DIR, '13-2d-fallback.png') });
    await page2.close();
  } finally {
    await browser.close();
    server.kill();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' 통과 · 스크린샷: ' + OUT_DIR);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
