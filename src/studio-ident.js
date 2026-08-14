// Approved cross-game SEO studio ident. Native DOM/CSS; review GIF SHA-256:
// d8940b1f5ebe301157f3cb21872a7693a64d14d9b2c640e2995e6200481689ff
const SEO_IDENT_DURATION_MS = 4430;

function shouldPlaySeoIdent(search, automated) {
  const mode = new URLSearchParams(search).get("seoIdent");
  if (mode === "off") return false;
  if (mode === "force") return true;
  return !automated;
}

function mountSeoStudioIdent(doc = document) {
  if (doc.getElementById("seo-studio-ident")) return null;
  const freezeRaw = new URLSearchParams(location.search).get("seoIdentT");
  const freezeSeconds = freezeRaw === null ? Number.NaN : Number(freezeRaw);
  const frozenForQa = Number.isFinite(freezeSeconds) && freezeSeconds >= 0;
  const style = doc.createElement("style");
  style.id = "seo-studio-ident-style";
  style.textContent = `
    #seo-studio-ident{position:fixed;inset:0;z-index:2147483647;background:#000;color:#f8f8f6;
      display:grid;place-items:center;overflow:hidden;isolation:isolate;cursor:pointer;
      font-family:Bahnschrift,"Arial Narrow","Segoe UI",sans-serif;-webkit-tap-highlight-color:transparent}
    #seo-studio-ident *{box-sizing:border-box}
    .seo-ident__trace{position:absolute;left:50%;top:50%;width:min(710px,72vw);height:1px;background:#fff;
      transform:translate(-50%,-50%) scaleX(0);opacity:0;transform-origin:center;animation:seo-trace 4.43s linear both}
    .seo-ident__mark{position:relative;width:min(760px,82vw);height:240px;display:flex;align-items:center;
      justify-content:space-between;padding:0 min(44px,5vw);animation:seo-mark-tail 4.43s linear both}
    .seo-ident__letter{width:30%;text-align:center;font-size:clamp(84px,13.4vw,172px);font-weight:300;
      line-height:1;letter-spacing:.01em;opacity:0;filter:blur(8px);will-change:transform,opacity,filter}
    .seo-ident__letter--s{animation:seo-letter-s 4.43s linear both}
    .seo-ident__letter--e{animation:seo-letter-e 4.43s linear both}
    .seo-ident__letter--o{animation:seo-letter-o 4.43s linear both}
    .seo-ident__orbit{position:absolute;left:calc(85% - 110px);top:10px;width:220px;height:220px;
      overflow:visible;transform:rotate(-92deg);opacity:0;animation:seo-orbit-fade 4.43s linear both}
    .seo-ident__orbit circle{fill:none;stroke:#fff;stroke-width:1.2;stroke-linecap:round;
      stroke-dasharray:628;stroke-dashoffset:628;animation:seo-orbit-draw 4.43s linear both}
    .seo-ident__sweep{position:absolute;inset:30px 8%;background:linear-gradient(104deg,transparent 44%,
      rgba(255,255,255,.24) 50%,transparent 56%);transform:translateX(-135%);mix-blend-mode:screen;
      animation:seo-sweep 4.43s linear both;pointer-events:none}
    .seo-ident__hint{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);white-space:nowrap;
      font:500 13px/1.4 "Segoe UI",sans-serif;letter-spacing:.08em;color:#fff;opacity:0;
      animation:seo-hint 4.43s linear both}
    @keyframes seo-trace{0%,7.67%{opacity:0;transform:translate(-50%,-50%) scaleX(0)}
      13.32%{opacity:.41}24.38%{opacity:.28;transform:translate(-50%,-50%) scaleX(1)}37.92%{opacity:0}
      75.39%{opacity:.47;transform:translate(-50%,-50%) scaleX(1)}90.29%,100%{opacity:0;transform:translate(-50%,-50%) scaleX(0)}}
    @keyframes seo-letter-s{0%,13.09%{opacity:0;filter:blur(8px);transform:translate(-56px,-13px)}
      27.09%,78.56%{opacity:1;filter:blur(0);transform:none}92.10%,100%{opacity:0;transform:translateY(-7px)}}
    @keyframes seo-letter-e{0%,17.16%{opacity:0;filter:blur(8px);transform:translateY(13px)}
      31.15%,78.56%{opacity:1;filter:blur(0);transform:none}92.10%,100%{opacity:0;transform:translateY(-7px)}}
    @keyframes seo-letter-o{0%,21.22%{opacity:0;filter:blur(8px);transform:translate(56px,-13px)}
      35.21%,78.56%{opacity:1;filter:blur(0);transform:none}92.10%,100%{opacity:0;transform:translateY(-7px)}}
    @keyframes seo-orbit-draw{0%,19.86%{stroke-dashoffset:628}38.83%,100%{stroke-dashoffset:3}}
    @keyframes seo-orbit-fade{0%,19.86%{opacity:0}30%{opacity:.75}39.28%{opacity:.55}49.66%,100%{opacity:0}}
    @keyframes seo-sweep{0%,46.27%{opacity:0;transform:translateX(-135%)}49%{opacity:1}
      58.69%{opacity:0;transform:translateX(135%)}100%{opacity:0}}
    @keyframes seo-hint{0%,24.83%{opacity:0}35%{opacity:.42}73.36%{opacity:.42}83.52%,100%{opacity:0}}
    @keyframes seo-mark-tail{0%,87.58%{opacity:1}98.42%,100%{opacity:0}}
    .seo-ident--frozen .seo-ident__trace,.seo-ident--frozen .seo-ident__mark,.seo-ident--frozen .seo-ident__letter,
    .seo-ident--frozen .seo-ident__orbit,.seo-ident--frozen .seo-ident__orbit circle,.seo-ident--frozen .seo-ident__sweep,.seo-ident--frozen .seo-ident__hint{animation-delay:var(--seo-ident-delay)!important;animation-play-state:paused!important}
    @media(prefers-reduced-motion:reduce){.seo-ident__letter{filter:none!important;transform:none!important}
      .seo-ident__trace,.seo-ident__orbit,.seo-ident__sweep{display:none}}
  `;
  const overlay = doc.createElement("div");
  overlay.id = "seo-studio-ident";
  if (frozenForQa) {
    overlay.classList.add("seo-ident--frozen");
    overlay.style.setProperty("--seo-ident-delay", `${-freezeSeconds}s`);
  }
  overlay.setAttribute("role", "img");
  overlay.setAttribute("aria-label", "SEO 스튜디오 로고");
  overlay.innerHTML = `<div class="seo-ident__trace" aria-hidden="true"></div>
    <div class="seo-ident__mark" aria-hidden="true">
      <span class="seo-ident__letter seo-ident__letter--s">S</span>
      <span class="seo-ident__letter seo-ident__letter--e">E</span>
      <span class="seo-ident__letter seo-ident__letter--o">O</span>
      <svg class="seo-ident__orbit" viewBox="0 0 220 220"><circle cx="110" cy="110" r="100" /></svg>
      <span class="seo-ident__sweep"></span>
    </div><span class="seo-ident__hint">아무 키나 눌러 건너뛰기</span>`;
  doc.head.appendChild(style);
  doc.body.prepend(overlay);
  let timer = 0;
  const finish = (event) => {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    clearTimeout(timer);
    window.removeEventListener("keydown", finish, true);
    overlay.removeEventListener("pointerdown", finish, true);
    overlay.removeEventListener("touchstart", finish, true);
    overlay.remove();
    style.remove();
  };
  window.addEventListener("keydown", finish, true);
  overlay.addEventListener("pointerdown", finish, true);
  overlay.addEventListener("touchstart", finish, { capture: true, passive: false });
  if (!frozenForQa) timer = window.setTimeout(finish, SEO_IDENT_DURATION_MS);
  return () => finish();
}

if (typeof document !== "undefined" && shouldPlaySeoIdent(location.search, navigator.webdriver)) {
  mountSeoStudioIdent();
}
