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

    // 캔버스가 실제로 뭔가 그렸는지 (단색이 아닌지)
    const painted = await page.evaluate(() => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return seen.size;
    });
    check('캔버스에 장면이 그려진다', painted > 6, painted + '가지 색');

    // 원근 시점 확인: 위쪽은 하늘, 아래쪽은 도로 — 색이 뚜렷히 달라야 한다
    const layers = await page.evaluate(() => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const at = (fy) => {
        const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height * fy), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      return { sky: at(0.08), road: at(0.92) };
    });
    const diff = Math.abs(layers.sky[0] - layers.road[0]) + Math.abs(layers.sky[1] - layers.road[1]) + Math.abs(layers.sky[2] - layers.road[2]);
    check('하늘과 도로가 원근으로 나뉜다', diff > 24, 'sky=' + layers.sky + ' road=' + layers.road);

    // 좌우 이동
    await page.keyboard.down('ArrowLeft');
    await wait(400);
    await page.keyboard.up('ArrowLeft');
    const movedLeft = await page.evaluate(() => window.LW.debug.state().run.squad.x);
    check('← 키로 부대가 왼쪽으로 간다', movedLeft < -0.2, 'x=' + movedLeft.toFixed(2));

    // 게이트를 최소 하나는 통과했는지 (코스 구성 확인)
    const gateInfo = await page.evaluate(async () => {
      const run = window.LW.debug.state().run;
      return { gates: run.gates.length, count: run.squad.count };
    });
    check('게이트가 코스에 등장한다', gateInfo.gates >= 1, gateInfo.gates + '개');

    await page.screenshot({ path: path.join(OUT_DIR, '01-battle.png') });

    // 보스 단계 -> 승리 -> 결과 화면 (게이트를 잘 골라 병력을 불린 상태를 가정)
    await page.evaluate(() => {
      window.LW.debug.boost(120);
      window.LW.debug.skipToBoss();
    });
    await wait(900);
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
    check('승리로 처리된다', resultTitle.includes('돌파'), resultTitle);
    check('별이 표시된다', (await page.textContent('#result-stars')).length >= 3);
    await page.screenshot({ path: path.join(OUT_DIR, '03-result.png') });

    // 세이브 확인: 다음 구역 해금
    const best = await page.evaluate(() => window.LW.debug.state().save.bestStage);
    check('다음 구역이 해금된다', best >= 2, 'bestStage=' + best);

    // 업그레이드 화면
    await page.click('#btn-result-home');
    await page.click('#btn-upgrade');
    await wait(200);
    const rows = await page.$$eval('.upgrade-row', (els) => els.length);
    check('강화 항목이 모두 나온다', rows === 5, rows + '개');
    await page.screenshot({ path: path.join(OUT_DIR, '04-upgrade.png') });

    // 구역 선택
    await page.click('[data-back]');
    await page.click('#btn-stages');
    await wait(200);
    const cards = await page.$$eval('.stage-card', (els) => els.length);
    check('구역 목록이 나온다', cards >= 10, cards + '개');
    check('콘솔 에러가 없다', errors.length === 0, errors.join(' | '));
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
