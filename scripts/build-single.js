/* index.html + CSS + 모든 스크립트를 한 파일로 묶는다 — 링크 하나로 공유하거나
 * USB 로 옮겨서 바로 열 수 있게. 출력: dist/last-squad.html
 *
 * 실행: node scripts/build-single.js [출력경로]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const FRAGMENT = args.includes('--fragment'); // 문서 껍데기 없이 본문만 (공유 페이지용)
const OUT = args.find((a) => !a.startsWith('--')) ||
  path.join(ROOT, 'dist', FRAGMENT ? 'last-squad-fragment.html' : 'last-squad.html');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let html = read('index.html');

// <link rel="stylesheet" href="src/style.css"> -> <style>...</style>
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (_m, href) => {
  return '<style>\n' + read(href).trim() + '\n</style>';
});

// <script src="src/x.js"></script> -> <script>...</script> (로드 순서 유지)
let inlined = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_m, src) => {
  inlined++;
  return '<script>\n' + read(src).trim() + '\n</script>';
});

if (!inlined) {
  console.error('스크립트를 하나도 못 찾았다 — index.html 구조가 바뀐 듯하다.');
  process.exit(1);
}

// 외부 요청이 남아 있으면 링크로 공유했을 때 깨진다 (CSP 차단)
const leftovers = html.match(/(?:src|href)="(?!data:|#)([^"]+)"/g) || [];
if (leftovers.length) {
  console.error('외부 참조가 남았다: ' + leftovers.join(', '));
  process.exit(1);
}

if (FRAGMENT) {
  // <title> 은 남기고 doctype/html/head/body 는 벗긴다 (호스팅 쪽 골격에 그대로 들어간다)
  const title = (html.match(/<title>[^<]*<\/title>/) || [''])[0];
  const body = html.replace(/[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
  const head = html
    .replace(/[\s\S]*?<head[^>]*>/, '')
    .replace(/<\/head>[\s\S]*$/, '')
    .replace(/<meta[^>]*>/g, '')
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<link[^>]*>/g, '');
  html = title + '\n' + head.trim() + '\n' + body.trim() + '\n';
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('한 파일로 묶었다: ' + path.relative(ROOT, OUT) + ' (' + kb + 'KB, 스크립트 ' + inlined + '개)');
