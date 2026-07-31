# AGENTS.md — 라스트 스쿼드 작업지침

> AI 에이전트(Claude Code·Codex)가 이 저장소에서 작업할 때 매번 읽는 규약.
> 게임이 무엇인지·어떻게 노는지는 `README.md`.

## 0. 이 프로젝트는

- 아이와 함께 만드는 **라스트워 스타일 레인 러너**. 브라우저에서 바로 돈다.
- **빌드 없음 · 의존성 없음.** 순수 HTML + CSS + 클래식 스크립트(`<script src>`).
  `index.html` 을 더블클릭하면(=`file://`) 그대로 실행돼야 한다. 그래서 ES 모듈을 쓰지 않는다.
- 한 번에 작은 변경 · 30분 안에 움직이는 결과 · 재미있어진 순간마다 커밋.

## 1. 제1원칙

**새 기능 코드를 `src/main.js` 에 넣지 않는다.**

- 게임 규칙·데이터 → `src/run.js`, `src/squad.js`, `src/gates.js`, `src/stage.js`
- 숫자(밸런스) → `src/config.js` **한 곳에만**. 다른 파일에 상수를 흘리지 않는다.
- 그리기 → `src/render.js` (상태를 절대 바꾸지 않는다 — 읽기만). 원근 투영 파라미터는 `config.camera`
- 화면 연출(떠오르는 숫자 등) → `src/fx.js` (뷰 전용. 게임 규칙을 넣지 않는다)
- 화면·버튼 → `src/ui.js` (게임 규칙을 넣지 않는다. 콜백으로만 알린다)
- `main.js` 는 **지휘자**: 캔버스 부팅·입력·루프·화면 전환 배선만.

의존 방향: `main.js → (ui, render, run) → (squad, gates, stage) → (config, util)`.
아래 계층이 위를 참조하면 안 된다. 모든 모듈은 `globalThis.LW` 에 자기 것만 붙인다.

## 2. 전투 로직은 브라우저를 몰라야 한다

`run.js` 는 `document`·`canvas`·`window` 를 참조하지 않는다. 그래서 Node 에서 그대로 돌려
테스트하고 자동 플레이로 밸런스를 잰다(`tests/`, `scripts/balance-check.js`).
새 규칙을 넣을 때도 이 경계를 지킨다 — 렌더링이 필요하면 상태 필드를 늘리고 `render.js` 가 읽게 한다.

## 3. 성능 예산 (핫패스 규칙)

- `update*` 안에서 새 객체·배열·클로저를 만들지 않는다. 풀(`run.bullets`/`enemies`/`particles`)과
  스크래치 필드를 재사용한다. 진형 좌표도 `squad.formation` 배열을 재사용한다.
- 모든 스폰은 풀 상한을 지킨다. 상한 정본은 `config.pools`. 풀이 비면 스폰을 건너뛴다(늘리지 않는다).
- 화면에 그리는 병력은 `config.squad.maxDrawn` 까지. 그 이상은 숫자 배지로 표시한다.

## 4. 밸런스 규율

- 숫자를 바꿨으면 `npm run balance` 와 `npm run balance 4`, `npm run balance 9` 를 보고
  **"잘 고르면 이긴다 / 막 달리면 진다"** 가 유지되는지 확인한다.
- 병력이 커질수록 압박도 커져야 한다(`config.pressure`). 이게 없으면 후반이 산책이 된다.
- 세이브 구조를 바꾸면 `save.SAVE_VERSION` 을 올리고 `normalize()` 로 옛 세이브를 살린다.

## 5. 연령 가드레일 (하드 룰)

- 상대는 **눈·표정·신체 부위가 없는 고철 로봇**만. 사람·동물 상대, 유혈, 실총 명칭 금지.
- 문자열도 아이가 읽는다는 전제로 쓴다(한국어, 짧고 분명하게).

## 6. 커밋 전

```bash
npm run verify       # 단위 테스트 + 밸런스 점검
npm run verify:full  # 위 + 실제 브라우저 smoke (커밋 전 권장)
```
