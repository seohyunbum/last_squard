/* WebAudio 로 만드는 아주 작은 효과음 — 오디오 파일 없음. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  let ctx = null;
  let master = null;
  let enabled = true;
  let lastShot = 0;
  let lastMinigun = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    return ctx;
  }

  function blip(freq, dur, type, gain) {
    if (!enabled) return;
    const ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain == null ? 0.5 : gain, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  }

  function sweep(from, to, dur, type) {
    if (!enabled) return;
    const ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(from, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), ac.currentTime + dur);
    g.gain.value = 0.4;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  }

  /** run.update 가 뱉은 이벤트 목록을 소리로 바꾼다. */
  function play(events, now) {
    for (const ev of events) {
      switch (ev.type) {
        case 'shoot':
          if (now - lastShot > 70) {
            lastShot = now;
            blip(760, 0.05, 'square', 0.16);
          }
          break;
        case 'kill':
          blip(180, 0.08, 'triangle', 0.3);
          break;
        case 'coin':
          blip(1180, 0.07, 'sine', 0.3);
          break;
        case 'gate':
          if (ev.buff) sweep(420, 900, 0.22, 'triangle');
          else sweep(420, 140, 0.28, 'sawtooth');
          break;
        case 'hurt':
          blip(120, 0.12, 'sawtooth', 0.35);
          break;
        case 'break':
          blip(90, 0.16, 'square', 0.3);
          break;
        case 'barrel':
          blip(140, 0.14, 'sawtooth', 0.32);
          break;
        case 'gunner':
          // 아군 합류 — 짧게 올라가는 두 음
          sweep(420, 1050, 0.26, 'triangle');
          break;
        case 'minigun':
          // 매 발 소리를 내면 시끄럽다 — 간격을 두고 아주 작게 깔아 준다
          if (now - lastMinigun > 110) {
            lastMinigun = now;
            blip(150 + Math.random() * 50, 0.04, 'square', 0.05);
          }
          break;
        case 'weapon':
          sweep(700, 1500, 0.22, 'square');
          break;
        case 'bossPattern':
          sweep(300, 620, 0.2, 'square');
          break;
        case 'bossFire':
          blip(200, 0.07, 'sawtooth', 0.16);
          break;
        case 'bossStart':
          sweep(120, 320, 0.6, 'sawtooth');
          break;
        case 'win':
          blip(660, 0.12, 'square', 0.4);
          setTimeout(() => blip(880, 0.16, 'square', 0.4), 130);
          setTimeout(() => blip(1180, 0.22, 'square', 0.4), 280);
          break;
        case 'lose':
          sweep(400, 90, 0.7, 'sawtooth');
          break;
        default:
          break;
      }
    }
  }

  LW.audio = {
    play: play,
    unlock: ensure,
    setEnabled(v) {
      enabled = !!v;
    },
    isEnabled() {
      return enabled;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
