/* 홈 화면에 설치되는 앱(PWA) — 배포본에 매니페스트 · 아이콘 · 서비스 워커가 실려 나가는지.
 *
 * 설치 여부는 브라우저가 판정하므로 여기서는 "판정에 필요한 것이 빠짐없이,
 * 하위 경로에서도 깨지지 않는 모양으로" 나갔는지만 본다. 실제 설치 · 오프라인 동작은
 * scripts/browser-smoke.js 에서 진짜 브라우저로 확인한다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'pages');

// 배포본을 실제로 한 번 조립해 놓고 검사한다 — 소스만 보면 build-pages.js 가 빠뜨려도 모른다.
test.before(() => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pages.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { SOURCE_COMMIT: 'abcdef123456' }),
    stdio: 'ignore',
  });
});

const read = (rel) => fs.readFileSync(path.join(OUT, rel), 'utf8');

test('배포본에 앱 파일이 다 실린다', () => {
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png',
    'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon-180.png']) {
    assert.ok(fs.existsSync(path.join(OUT, f)), f + ' 가 배포본에 없다');
  }
});

test('매니페스트 — 설치 판정에 필요한 값이 있다', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, '라스트 스쿼드');
  assert.ok(['standalone', 'fullscreen'].includes(m.display), 'display 가 앱 모드가 아니다');
  assert.equal(m.orientation, 'portrait', '게임은 세로 화면이다');

  // 하위 경로(/last_squard/)로 서브하므로 루트 절대 경로면 안 된다.
  for (const [key, v] of Object.entries({ start_url: m.start_url, scope: m.scope })) {
    assert.ok(!v.startsWith('/'), key + ' 가 루트 절대 경로다 — 하위 경로 배포에서 깨진다');
  }

  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), '192·512 아이콘이 있어야 설치된다');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), '마스커블 아이콘이 없으면 안드로이드에서 잘린다');

  for (const icon of m.icons) {
    assert.ok(!icon.src.startsWith('/'), icon.src + ' 가 루트 절대 경로다');
    assert.ok(fs.existsSync(path.join(OUT, icon.src)), icon.src + ' 파일이 없다');
  }
});

test('index.html — 앱 태그와 서비스 워커 등록이 들어간다', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest"/, '매니페스트 링크가 없다');
  assert.match(html, /apple-mobile-web-app-capable/, '아이폰은 이 태그가 있어야 앱처럼 뜬다');
  assert.match(html, /rel="apple-touch-icon"/, '아이폰 홈 화면 아이콘이 없다');
  assert.match(html, /viewport-fit=cover/, '노치 대응(viewport-fit)이 빠졌다');
  assert.match(html, /serviceWorker\.register\('sw\.js'\)/, '서비스 워커를 등록하지 않는다');

  // file:// 로 연 단일 파일에서 등록을 시도하면 콘솔 오류가 난다.
  assert.match(html, /location\.protocol\.startsWith\('http'\)/, 'file:// 방어가 없다');

  // 하위 경로 배포에서 404 가 나지 않게.
  const rootAbsolute = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g);
  assert.equal(rootAbsolute, null, '루트 절대 경로가 남았다: ' + rootAbsolute);
});

test('서비스 워커 — 배포마다 캐시 이름이 달라진다', () => {
  const sw = read('sw.js');
  assert.match(sw, /^const VERSION = 'abcdef123456';$/m,
    "VERSION 이 배포 커밋으로 안 바뀌었다 (주석의 같은 낱말만 바뀌었을 수 있다)");
  assert.ok(!/const VERSION = '__BUILD_ID__'/.test(sw), '자리표시자가 그대로 나갔다');
});

test('기지 화면에 설치 버튼과 안내가 실린다', () => {
  const html = read('index.html');
  assert.match(html, /id="btn-install"/, '설치 버튼이 없다');
  assert.match(html, /id="screen-install"/, '설치 안내 화면이 없다');
  // 실제로 여기서 막히는 사람이 가장 많다 — 안내에서 빼면 안 된다.
  assert.match(html, /카카오톡/, '인앱 브라우저 주의가 안내에 없다');
  assert.match(html, /LW\.install\.setup\(\)/, '설치 버튼을 켜는 호출이 없다');
});

test('단일 파일(USB용)에는 앱 태그가 붙지 않는다', () => {
  // 외부 파일을 못 읽는 file:// 용이라, 매니페스트를 붙이면 깨진 참조만 남는다.
  const single = fs.readFileSync(path.join(ROOT, 'dist', 'last-squad.html'), 'utf8');
  assert.ok(!single.includes('rel="manifest"'), '단일 파일에 매니페스트 링크가 붙었다');
  assert.ok(!single.includes('serviceWorker.register'), '단일 파일에 서비스 워커 등록이 붙었다');
});
