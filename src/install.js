/* 홈 화면에 앱으로 추가하기 — 기지 화면의 설치 버튼.
 *
 * 브라우저 메뉴를 찾아 들어가는 걸 아이도 부모도 못 찾기 쉬워서, 게임 안에 버튼을 둔다.
 * 안드로이드 크롬은 설치 창을 바로 띄울 수 있고(beforeinstallprompt), 아이폰 사파리는
 * 그런 API 가 없어 손으로 하는 순서를 그림처럼 알려 준다.
 *
 * 기기 판별(UA 문자열)은 하지 않는다 — 브라우저마다 제각각이라 틀리기 쉽다. 대신
 * "설치 창을 띄울 수 있으면 띄우고, 없으면 안내"로 갈린다. 어느 쪽이든 길이 남는다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  function $(id) {
    return document.getElementById(id);
  }

  /** 이미 홈 화면 앱으로 실행 중인가 (그렇다면 설치 버튼을 보일 이유가 없다) */
  function running() {
    const standalone = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches;
    const fullscreen = global.matchMedia && global.matchMedia('(display-mode: fullscreen)').matches;
    return Boolean(standalone || fullscreen || global.navigator.standalone);
  }

  function setup() {
    const btn = $('btn-install');
    const guide = $('screen-install');
    if (!btn || !guide) return;

    // file:// 로 연 단일 파일은 설치 대상이 아니다. 버튼을 숨겨 둔다.
    if (!global.location.protocol.startsWith('http')) return;
    if (running()) return;

    let prompt = null; // 크롬이 넘겨주는 설치 창 (있으면 바로 띄운다)
    global.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // 브라우저가 알아서 띄우는 배너를 막고, 버튼을 눌렀을 때 띄운다
      prompt = e;
    });

    global.addEventListener('appinstalled', () => {
      prompt = null;
      btn.classList.add('hidden');
      guide.classList.add('hidden');
    });

    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
      if (prompt) {
        prompt.prompt();
        const choice = await prompt.userChoice.catch(() => null);
        prompt = null; // 설치 창은 한 번만 쓸 수 있다
        if (choice && choice.outcome === 'accepted') return;
      }
      guide.classList.remove('hidden'); // 설치 창이 없거나 거절했으면 손으로 하는 순서를 보여 준다
    });

    $('btn-install-close').addEventListener('click', () => guide.classList.add('hidden'));
  }

  LW.install = { setup, running };
})(window);
