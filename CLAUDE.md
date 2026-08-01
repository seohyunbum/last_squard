# Claude 작업 라우팅

`AGENTS.md`를 먼저 전체 읽고 모든 규칙을 따른다.

## 시작 전 하드 체크

1. `git remote get-url origin` 실행.
2. 원격 경로가 `seohyunbum/last_squard`인지 확인.
3. 다르면 **아무 파일도 수정하지 말고 즉시 중단**한다.

특히 `seohyunbum/YUNU_GAME`의 `claude/last-war-game-copy-7dqved`는 이관 원본으로 동결된 예전 작업 위치다. 모바일 Claude에서 해당 작업을 재개하지 말고, `seohyunbum/last_squard` 저장소를 선택해 새 작업을 시작한다.

소스 정본은 `main`, 공개 실행본은 `gh-pages`다. 배포 완료 판정은 `gh-pages/source-commit.txt`가 `main` HEAD와 일치하는지로 한다.