/**
 * GitHub Pages 배포본을 `dist/pages/` 에 조립한다.
 *
 * 이 게임은 빌드가 필요 없는 정적 게임이라 배포도 단순하다 — `build-single.js` 가 만든
 * **한 파일**을 `index.html` 로 놓으면 끝이다. 외부 참조가 하나도 없으므로 하위 경로
 * (`/last_squard/`) 로 서브해도 자산이 깨지지 않는다.
 *
 * 남기는 것 셋:
 *   - `index.html`      — 단일 파일 게임
 *   - `.nojekyll`       — Jekyll 이 `_` 로 시작하는 파일을 지우지 않게
 *   - `source-commit.txt` — 지금 서비스 중인 소스 커밋. 배포본과 소스를 대조하는 유일한 단서다
 *
 * 사용: node scripts/build-pages.js
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SINGLE = path.join(ROOT, "dist", "last-squad.html");
const OUT = path.join(ROOT, "dist", "pages");

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

  console.log("[2/3] dist/pages 조립");
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.html"), html, "utf8");
  fs.writeFileSync(path.join(OUT, ".nojekyll"), "", "utf8");

  const commit =
    process.env.SOURCE_COMMIT ??
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(OUT, "source-commit.txt"), `${commit}\n`, "utf8");

  console.log("[3/3] 완료");
  console.log(`   ${OUT} (${Math.round(html.length / 1024)}KB, 외부 참조 0)`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
