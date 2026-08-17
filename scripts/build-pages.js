/**
 * GitHub Pages 배포본을 `dist/pages/` 에 조립한다.
 *
 * 이 게임은 빌드가 필요 없는 정적 게임이라 배포도 단순하다 — `build-single.js` 가 만든
 * **한 파일**을 `index.html` 로 놓으면 끝이다. 외부 참조가 하나도 없으므로 하위 경로
 * (`/last_squard/`) 로 서브해도 자산이 깨지지 않는다.
 *
 * 남기는 것:
 *   - `index.html`      — 단일 파일 게임
 *   - `.nojekyll`       — Jekyll 이 `_` 로 시작하는 파일을 지우지 않게
 *   - `source-commit.txt` — 지금 서비스 중인 소스 커밋. 배포본과 소스를 대조하는 유일한 단서다
 *   - `manifest.webmanifest` · `sw.js` · `icons/` — 홈 화면에 앱으로 설치되게 (`web/` 에서 복사)
 *
 * 앱(PWA) 조각은 `index.html` 이 아니라 여기서 끼워 넣는다. `build-single.js` 가 만드는
 * 단일 파일은 USB 로 옮겨 `file://` 로 여는 용도라 외부 참조가 하나도 없어야 하는데,
 * 매니페스트와 아이콘은 별도 파일일 수밖에 없기 때문이다. 설치는 https 로 서브할 때만
 * 의미가 있으니 Pages 배포본에만 붙는 게 맞다.
 *
 * 사용: node scripts/build-pages.js
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SINGLE = path.join(ROOT, "dist", "last-squad.html");
const OUT = path.join(ROOT, "dist", "pages");
const WEB = path.join(ROOT, "web");

/** 설치형 앱으로 인식되게 하는 <head> 조각. 경로는 모두 상대 경로여야 한다 (하위 경로 배포). */
const PWA_HEAD = [
  '<link rel="manifest" href="manifest.webmanifest" />',
  '<meta name="theme-color" content="#060a12" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  // 아이폰은 매니페스트의 display 를 안 본다. 아래 셋이 있어야 앱처럼 전체 화면으로 뜬다.
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="라스트 스쿼드" />',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png" />',
].join("\n");

const PWA_BODY = [
  "<script>",
  "/* 한 번 연 뒤에는 인터넷 없이도 열리게 한다. file:// 로 열면 등록하지 않는다. */",
  "if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {",
  "  window.addEventListener('load', function () {",
  "    navigator.serviceWorker.register('sw.js').catch(function () {});",
  "  });",
  "}",
  "</script>",
].join("\n");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function main() {
  console.log("[1/3] 단일 파일 빌드");
  execFileSync(process.execPath, [path.join(__dirname, "build-single.js")], {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (!fs.existsSync(SINGLE)) {
    throw new Error(`단일 파일이 없다: ${SINGLE}`);
  }
  const html = fs.readFileSync(SINGLE, "utf8");

  // 하위 경로로 서브해도 깨지지 않는지 확인한다 — 루트 절대 경로가 남아 있으면 404 가 난다.
  const rootAbsolute = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g);
  if (rootAbsolute) {
    throw new Error(
      `루트 절대 경로가 남아 있다 (${rootAbsolute.length}개): ${rootAbsolute.slice(0, 3).join(", ")}\n` +
        "→ Pages 하위 경로에서 자산을 못 찾는다. build-single.js 가 인라인하지 못한 것이 있다.",
    );
  }

  const commit =
    process.env.SOURCE_COMMIT ??
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

  console.log("[2/3] dist/pages 조립");
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 앱 조각을 끼워 넣는다. 위의 루트 절대 경로 검사를 통과한 뒤라야 한다.
  if (!html.includes("</head>")) throw new Error("</head> 를 못 찾아 앱 태그를 못 넣는다");
  let page = html.replace("</head>", `${PWA_HEAD}\n</head>`);
  if (!page.includes("</body>")) throw new Error("</body> 를 못 찾아 서비스 워커를 못 붙인다");
  page = page.replace("</body>", `${PWA_BODY}\n</body>`);

  fs.writeFileSync(path.join(OUT, "index.html"), page, "utf8");
  fs.writeFileSync(path.join(OUT, ".nojekyll"), "", "utf8");
  fs.writeFileSync(path.join(OUT, "source-commit.txt"), `${commit}\n`, "utf8");

  // web/ 의 매니페스트 · 아이콘 · 서비스 워커를 그대로 옮기고, 워커에만 배포 커밋을 박는다.
  copyDir(WEB, OUT);
  const swPath = path.join(OUT, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");
  // 주석에도 같은 낱말이 나오므로 따옴표째로 찾는다 — 코드 줄만 바꿔야 한다.
  if (!sw.includes("'__BUILD_ID__'")) throw new Error("sw.js 에 '__BUILD_ID__' 자리가 없다");
  fs.writeFileSync(swPath, sw.replace("'__BUILD_ID__'", `'${commit.slice(0, 12)}'`), "utf8");

  console.log("[3/3] 완료");
  console.log(`   ${OUT} (${Math.round(page.length / 1024)}KB, 외부 참조 0)`);
  console.log("   앱 설치용: manifest.webmanifest · sw.js · icons/ 4개");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
