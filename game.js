/* 러그돌 로봇 블록 제거 퍼즐 – 월드 1 프로토타입 (Phaser 3 + Matter.js) */
'use strict';
const W = 720, H = 1280, FLOOR_Y = 1180;
const FONT = "'Gothic A1','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const C = {
  white: '#F7F4F1', shade: '#D9CFCB', edge: '#BFB2AD', band: '#F7C3C9', bandShade: '#E39FA8',
  screen: '#0B0F14', eye: 0xFFB224, eyeGlow: 0xFFD27A, link: 0xFFC861, ear: '#FBA0AE', earIn: '#FFE4E6',
  sockEmpty: '#FBF3EE', juice: 0xFF8A1F, juiceShade: 0xE0650F, ring: '#72C25E', ringShade: '#4E9A45',
  mint: '#6FD6C0', sky: '#8FD3FF', ride: '#FF9EC7', accent: '#FFD95A', bright: '#FFE6B0'
};
const S = 1.25; // 로봇 크기 배율
const SAVE_KEY = 'ragdollRobotProto_v1';
const HINTS_PER_STAGE = 2;   // 힌트: 별/탭 비용 없음, 스테이지당 2회
const ORDER_PENALTY = 1;     // 순서 틀림: 블록은 안 빠지고 탭 +1
const REPLAY_MAX_PRE = 3.6, REPLAY_POST = 0.8, REPLAY_SPEED = 0.45; // 마지막 탭 직전 ~ 착지/실패 0.8초 후(최대 4.4초)를 0.45배속

/* ---------------- 사운드 (WebAudio 블립) ---------------- */
const Sfx = {
  ctx: null,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f0, f1, dur, type = 'sine', vol = 0.15, delay = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, lp = 900) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const b = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = lp; s.buffer = b; g.gain.value = vol; s.connect(f).connect(g).connect(this.ctx.destination); s.start(t);
  },
  tap() { this.tone(880, 1320, 0.07, 'square', 0.06); },
  pop() { this.tone(600, 200, 0.12, 'triangle', 0.15); },
  thud() { this.tone(160, 60, 0.15, 'sine', 0.25); this.noise(0.08, 0.12, 400); },
  boom() { this.noise(0.6, 0.5, 700); this.tone(120, 40, 0.5, 'sine', 0.35); },
  scream() { this.tone(900, 1700, 0.25, 'sawtooth', 0.05); this.tone(1700, 1100, 0.2, 'sawtooth', 0.04, 0.25); },
  clear() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.12, i * 0.1)); },
  star(i) { this.tone(880 + i * 220, 1320 + i * 220, 0.12, 'square', 0.06); },
  fail() { this.tone(500, 120, 0.7, 'sawtooth', 0.08); this.tone(260, 70, 0.6, 'sine', 0.12, 0.2); },
  gulp() { [0, 0.12, 0.24].forEach((d, i) => this.tone(300 - i * 60, 120 - i * 20, 0.1, 'sine', 0.12, d)); },
  slosh() { this.noise(0.18, 0.12, 1800); }
};

/* ---------------- 저장 ---------------- */
const Save = {
  load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { stars: {} }; } catch (e) { return { stars: {} }; } },
  setStars(id, n) { const s = this.load(); s.stars[id] = Math.max(s.stars[id] || 0, n); try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { } },
};

/* ---------------- 스테이지 (월드 1, 1~5) ---------------- */
// t3: 별 3개 기준 탭 수, t2: 별 2개 기준 탭 수, limit: 탭 한도
const STAGES = [
  { id: 1, name: '첫 낙하', t3: 1, t2: 2, limit: 4, hint: '로봇 아래 나무 블록을 탭해 보세요.', tutorial: 'w1', hintSeq: [['w1', 'up']],
    robot: [360, 600],
    items: [
      { t: 'stone', x: 180, y: 950, w: 120, h: 460 }, { t: 'stone', x: 540, y: 950, w: 120, h: 460 },
      { t: 'wood', id: 'w1', x: 360, y: 695, w: 420, h: 50 },
      { t: 'cushion', x: 360, y: 1155, w: 220, h: 50 },
    ] },
  { id: 2, name: '순서가 중요해', t3: 3, t2: 4, limit: 6, hint: '블록에 적힌 숫자 순서(1→2→3)대로 위에서부터 빼세요. 순서가 틀리면 탭 +1 벌칙!',
    order: ['t', 'm', 'b'], hintSeq: [['t', 'right'], ['m', 'right'], ['b', 'right']],
    robot: [360, 818],
    items: [
      { t: 'cushion', x: 360, y: 1155, w: 300, h: 50 },
      { t: 'wood', id: 'b', x: 360, y: 1090, w: 84, h: 80 },
      { t: 'wood', id: 'm', x: 360, y: 1010, w: 84, h: 80 },
      { t: 'wood', id: 't', x: 360, y: 930, w: 84, h: 80 },
    ] },
  { id: 3, name: '돌 등장', t3: 1, t2: 2, limit: 4, hint: '돌은 없앨 수 없어요. 판자를 받친 나무 기둥을 빼 보세요.', hintSeq: [['post', 'left']],
    robot: [250, 610],
    items: [
      { t: 'stone', x: 90, y: 945, w: 80, h: 490 },
      { t: 'plank', id: 'p', x: 300, y: 700, w: 320, h: 26, hinge: [140, 700] },
      { t: 'wood', id: 'post', x: 430, y: 948, w: 50, h: 464 },
      { t: 'wood', id: 'decoy', x: 650, y: 1120, w: 70, h: 120 },
      { t: 'cushion', x: 300, y: 1155, w: 280, h: 50 },
    ] },
  { id: 4, name: '시소', t3: 1, t2: 2, limit: 4, hint: '반대쪽 끝의 무거운 나무 상자를 빼면 판자가 로봇 쪽으로 기울어요.', hintSeq: [['box', 'down']],
    robot: [235, 790],
    items: [
      { t: 'fulcrum', x: 360, y: 1040, w: 120, h: 280 },
      { t: 'plank', id: 'p', x: 360, y: 880, w: 440, h: 26, pivot: [360, 880] },
      { t: 'stone', x: 560, y: 1038, w: 50, h: 290 },
      { t: 'wood', id: 'box', x: 525, y: 822, w: 110, h: 90 },
      { t: 'cushion', x: 130, y: 1155, w: 230, h: 50 },
    ] },
  { id: 5, name: '쾅!', t3: 1, t2: 2, limit: 4, hint: '폭탄은 반대쪽으로 밀어내요. 어느 쪽 폭탄을 터뜨릴까요?', hintSeq: [['br', 'down']],
    robot: [360, 710],
    items: [
      { t: 'stone', x: 360, y: 800, w: 260, h: 40 },
      { t: 'stone', x: 360, y: 1000, w: 40, h: 360 },
      { t: 'bomb', id: 'bl', x: 268, y: 754, r: 26 },
      { t: 'bomb', id: 'br', x: 452, y: 754, r: 26 },
      { t: 'stone', x: 20, y: 1040, w: 40, h: 300 },
      { t: 'cushion', x: 180, y: 1155, w: 260, h: 50 },
    ] },
];

/* ---------------- 텍스처 생성 ---------------- */
function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h)); const ctx = t.getContext();
  draw(ctx, w, h); t.refresh(); return key;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// 몸통 꼭짓점(bbox 기준, 역사다리꼴 어깨:허리 = 1:0.6)
const TORSO_V = [[-30, -27], [30, -27], [18, 27], [-18, 27]].map(([x, y]) => ({ x: x * S, y: y * S }));
const WIN = { cx: 0, cy: -8 * S, w: 12 * S, h: 18 * S }; // 주스 창(몸통 폭 약 1/5, 높이 약 1/3)

function makeRobotTextures(scene) {
  const pad = 8;
  // 머리: 펄 화이트 달걀형 + 검은 얼굴 화면 + 핑크 머리띠
  canvasTex(scene, 'r_head', 76 * S + pad * 2, 74 * S + pad * 2, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, rx = 38 * S, ry = 36 * S;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 1.5, ry + 1.5, 0, 0, Math.PI * 2); ctx.fillStyle = C.edge; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, 4, cx, cy, rx * 1.05);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.55, C.white); g.addColorStop(1, C.shade);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // 얼굴 화면
    const fw = 58 * S, fh = 38 * S; rr(ctx, cx - fw / 2, cy - fh / 2 + 6 * S, fw, fh, 17 * S);
    const fg = ctx.createLinearGradient(0, cy - fh / 2, 0, cy + fh / 2); fg.addColorStop(0, '#1A222C'); fg.addColorStop(1, C.screen);
    ctx.fillStyle = fg; ctx.fill();
    ctx.globalAlpha = 0.18; rr(ctx, cx - fw / 2 + 6, cy - fh / 2 + 6 * S + 3, fw * 0.45, 5, 3); ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
    // 머리띠
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = 7 * S; ctx.lineCap = 'round';
    ctx.strokeStyle = C.bandShade; ctx.beginPath(); ctx.ellipse(cx, cy + 6 * S, rx * 0.98, ry * 0.95, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.strokeStyle = C.band; ctx.lineWidth = 5 * S; ctx.beginPath(); ctx.ellipse(cx, cy + 5 * S, rx * 0.98, ry * 0.95, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.restore();
    // 하이라이트
    ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(cx - rx * 0.45, cy - ry * 0.25, 5 * S, 3 * S, -0.6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
  });
  // 토끼 귀(큰 귀 유지)
  canvasTex(scene, 'r_ear', 22 * S + 6, 60 * S + 6, (ctx, w, h) => {
    const cx = w / 2;
    ctx.beginPath(); ctx.ellipse(cx, h / 2, 10 * S, 29 * S, 0, 0, Math.PI * 2); ctx.fillStyle = C.ear; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#E8889A'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, h / 2 + 3 * S, 5 * S, 21 * S, 0, 0, Math.PI * 2); ctx.fillStyle = C.earIn; ctx.fill();
    // 털 느낌
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, y = h / 2 + Math.sin(a) * 26 * S, x = cx + Math.cos(a) * 9 * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); ctx.stroke(); }
  });
  // 몸통: 역사다리꼴 + 목 링 + 쏙 들어간 주스 창 소켓
  canvasTex(scene, 'r_torso', 64 * S + pad * 2, 64 * S + pad * 2, (ctx, w, h) => {
    const ox = w / 2, oy = h / 2 + 2 * S;
    const path = () => { ctx.beginPath(); TORSO_V.forEach((p, i) => i ? ctx.lineTo(ox + p.x, oy + p.y) : ctx.moveTo(ox + p.x, oy + p.y)); ctx.closePath(); };
    ctx.lineJoin = 'round';
    path(); ctx.lineWidth = 16 * S + 3; ctx.strokeStyle = C.edge; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(ox - 30 * S, oy - 27 * S, ox + 30 * S, oy + 27 * S); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, C.white); g.addColorStop(1, C.shade);
    path(); ctx.lineWidth = 16 * S; ctx.strokeStyle = g; ctx.stroke(); ctx.fillStyle = g; ctx.fill();
    // 목 링
    rr(ctx, ox - 24 * S, oy - 36 * S, 48 * S, 8 * S, 4 * S); ctx.fillStyle = C.ringShade; ctx.fill();
    rr(ctx, ox - 24 * S, oy - 36 * S, 48 * S, 5.5 * S, 3 * S); ctx.fillStyle = C.ring; ctx.fill();
    // 주스 창 소켓(안쪽 경사면 → 그림자 → 빈 공간)
    const sx = ox + WIN.cx - WIN.w / 2, sy = oy + WIN.cy - WIN.h / 2;
    rr(ctx, sx - 2, sy - 2, WIN.w + 4, WIN.h + 4, WIN.w / 2 + 2); ctx.fillStyle = C.shade; ctx.fill();
    rr(ctx, sx - 1, sy - 1, WIN.w + 2, WIN.h + 2, WIN.w / 2 + 1); ctx.fillStyle = C.edge; ctx.fill();
    rr(ctx, sx, sy, WIN.w, WIN.h, WIN.w / 2); ctx.fillStyle = C.sockEmpty; ctx.fill();
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(ox - 16 * S, oy - 14 * S, 6 * S, 3 * S, -0.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
  });
  const limb = (key, r) => canvasTex(scene, key, r * 2 + 8, r * 2 + 8, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 1.2, 0, Math.PI * 2); ctx.fillStyle = C.edge; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 1, cx, cy, r); g.addColorStop(0, '#fff'); g.addColorStop(0.6, C.white); g.addColorStop(1, C.shade);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  });
  limb('r_arm', 10 * S); limb('r_foot', 12 * S);
  canvasTex(scene, 'shadow', 120, 24, (ctx, w, h) => { const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(60,40,30,0.35)'); g.addColorStop(1, 'rgba(60,40,30,0)'); ctx.save(); ctx.scale(1, h / w); ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore(); });
}

function blockTex(scene, t, w, h) {
  const key = `${t}_${w}_${h}`;
  return canvasTex(scene, key, w, h, (ctx) => {
    if (t === 'wood') {
      rr(ctx, 1, 1, w - 2, h - 2, Math.min(10, h / 3)); ctx.fillStyle = '#B9773F'; ctx.fill();
      rr(ctx, 3, 3, w - 6, h - 7, Math.min(8, h / 3)); const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#E9B57A'); g.addColorStop(1, '#D3965A'); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(140,80,35,0.45)'; ctx.lineWidth = 2;
      const horiz = w >= h;
      const n = Math.max(1, Math.floor((horiz ? h : w) / 16));
      for (let i = 1; i <= n; i++) { ctx.beginPath(); if (horiz) { const y = (h / (n + 1)) * i; ctx.moveTo(10, y); ctx.bezierCurveTo(w * 0.3, y - 3, w * 0.6, y + 3, w - 10, y); } else { const x = (w / (n + 1)) * i; ctx.moveTo(x, 10); ctx.bezierCurveTo(x - 3, h * 0.3, x + 3, h * 0.6, x, h - 10); } ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(ctx, 6, 5, Math.max(4, w * 0.35), 4, 2); ctx.fill();
    } else if (t === 'plank') {
      rr(ctx, 1, 1, w - 2, h - 2, 8); ctx.fillStyle = '#A8683A'; ctx.fill();
      rr(ctx, 2, 2, w - 4, h - 6, 7); ctx.fillStyle = '#E2A867'; ctx.fill();
      ctx.strokeStyle = 'rgba(140,80,35,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, h / 2); ctx.lineTo(w - 12, h / 2 - 1); ctx.stroke();
    } else if (t === 'stone') {
      rr(ctx, 1, 1, w - 2, h - 2, 9); ctx.fillStyle = '#6E747C'; ctx.fill();
      rr(ctx, 3, 3, w - 6, h - 7, 8); const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#B7BCC2'); g.addColorStop(1, '#949AA2'); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(70,75,82,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.3, 8); ctx.lineTo(w * 0.42, Math.min(h * 0.3, 40)); ctx.lineTo(w * 0.36, Math.min(h * 0.45, 60)); ctx.stroke();
      ctx.fillStyle = '#5E646B'; [[9, 9], [w - 9, 9], [9, h - 10], [w - 9, h - 10]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); });
    } else if (t === 'cushion') {
      ctx.shadowColor = 'rgba(111,214,192,0.9)'; ctx.shadowBlur = 10;
      rr(ctx, 6, 8, w - 12, h - 12, 18); ctx.fillStyle = '#4FB7A2'; ctx.fill(); ctx.shadowBlur = 0;
      rr(ctx, 6, 6, w - 12, h - 16, 18); const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9BE7D6'); g.addColorStop(1, C.mint); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2; rr(ctx, 14, 12, w - 28, h - 28, 12); ctx.stroke(); ctx.setLineDash([]);
    } else if (t === 'fulcrum') {
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#B7BCC2'); g.addColorStop(1, '#8D939B'); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#5E646B'; ctx.beginPath(); ctx.arc(w / 2, 14, 6, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'bomb') {
      const r = w / 2 - 6, cx = w / 2, cy = h / 2 + 4;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); const g = ctx.createRadialGradient(cx - r / 3, cy - r / 3, 2, cx, cy, r); g.addColorStop(0, '#5A5F69'); g.addColorStop(1, '#16181D'); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#16181D'; rr(ctx, cx - 7, cy - r - 6, 14, 9, 3); ctx.fill();
      ctx.strokeStyle = '#E8483B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy - r - 6); ctx.quadraticCurveTo(cx + 6, cy - r - 12, cx + 10, cy - r - 6); ctx.stroke();
      // 해골 아이콘
      ctx.fillStyle = '#F7F4F1'; ctx.beginPath(); ctx.arc(cx, cy - 2, r * 0.38, 0, Math.PI * 2); ctx.fill(); rr(ctx, cx - r * 0.22, cy + r * 0.2, r * 0.44, r * 0.25, 2); ctx.fill();
      ctx.fillStyle = '#16181D'; ctx.beginPath(); ctx.arc(cx - r * 0.15, cy - 3, r * 0.1, 0, Math.PI * 2); ctx.arc(cx + r * 0.15, cy - 3, r * 0.1, 0, Math.PI * 2); ctx.fill();
    }
  });
}

/* ---------------- 배경 (월드 1 팔레트) ---------------- */
function drawWorld1Bg(scene) {
  canvasTex(scene, 'bg_w1', W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6EC4FA'); g.addColorStop(0.6, C.sky); g.addColorStop(1, '#CDEEFF'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 먼 언덕(채도 낮게)
    ctx.fillStyle = '#B9E3D4'; ctx.beginPath(); ctx.moveTo(0, 1000); ctx.quadraticCurveTo(180, 880, 380, 990); ctx.quadraticCurveTo(560, 900, 720, 980); ctx.lineTo(720, H); ctx.lineTo(0, H); ctx.fill();
    // 관람차 실루엣
    ctx.strokeStyle = 'rgba(255,158,199,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(590, 760, 120, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(590, 760); ctx.lineTo(590 + Math.cos(a) * 120, 760 + Math.sin(a) * 120); ctx.stroke(); ctx.fillStyle = i % 2 ? 'rgba(255,217,90,0.8)' : 'rgba(255,158,199,0.8)'; ctx.beginPath(); ctx.arc(590 + Math.cos(a) * 120, 760 + Math.sin(a) * 120, 11, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,158,199,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(590, 760); ctx.lineTo(540, 960); ctx.moveTo(590, 760); ctx.lineTo(640, 960); ctx.stroke();
    // 구름
    const cloud = (x, y, s) => { ctx.fillStyle = 'rgba(255,255,255,0.85)'; [[0, 0, 40], [35, -15, 34], [70, 0, 38], [35, 10, 36]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }); };
    cloud(80, 260, 1); cloud(470, 190, 0.8); cloud(260, 420, 0.6);
    // 울타리
    ctx.fillStyle = 'rgba(255,230,176,0.9)'; for (let x = 10; x < W; x += 46) { rr(ctx, x, 1100, 14, 80, 6); ctx.fill(); } ctx.fillRect(0, 1120, W, 10); ctx.fillRect(0, 1150, W, 10);
    // 바닥(놀이공원 바닥)
    ctx.fillStyle = '#E9C98E'; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y); ctx.fillStyle = C.bright; ctx.fillRect(0, FLOOR_Y, W, 12);
    ctx.fillStyle = 'rgba(200,160,100,0.35)'; for (let x = 0; x < W; x += 60) ctx.fillRect(x, FLOOR_Y + 30, 30, 6);
  });
  scene.add.image(0, 0, 'bg_w1').setOrigin(0).setDepth(-10);
}

/* ---------------- 공통 UI ---------------- */
function button(scene, x, y, w, h, label, cb, opt = {}) {
  const c = scene.add.container(x, y).setDepth(opt.depth || 50);
  const g = scene.add.graphics();
  const col = opt.color || 0xFF8A1F, sh = opt.shade || 0xE0650F;
  g.fillStyle(sh, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h / 2.6);
  g.fillStyle(col, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2.6);
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 12, -h / 2 + 6, w - 24, h * 0.25, h * 0.12);
  const t = scene.add.text(0, -1, label, { fontFamily: FONT, fontSize: (opt.size || 34) + 'px', fontStyle: 'bold', color: opt.text || '#ffffff' }).setOrigin(0.5);
  c.add([g, t]); c.setSize(w, h + 6).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { Sfx.init(); Sfx.tap(); scene.tweens.add({ targets: c, scale: 0.92, duration: 60, yoyo: true }); });
  c.on('pointerup', () => cb());
  c.label = t; return c;
}
function starShape(g, x, y, r, fill, alpha = 1) {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r; pts.push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad }); }
  g.fillStyle(fill, alpha).fillPoints(pts, true);
}

/* ---------------- 로봇 ---------------- */
class Robot {
  constructor(scene, x, y) {
    this.scene = scene; const M = scene.matter; const MB = Phaser.Physics.Matter.Matter;
    this.group = M.world.nextGroup(true);
    const opt = (label, extra = {}) => Object.assign({ label, collisionFilter: { group: this.group }, friction: 0.9, frictionStatic: 1, frictionAir: 0.012, restitution: 0.05, density: 0.0015 }, extra);
    // 몸통: 무게중심 보정
    const cen = MB.Vertices.centre(TORSO_V.map(p => ({ x: p.x, y: p.y })));
    this.tc = cen;
    this.torso = M.add.fromVertices(x + cen.x, y + cen.y, TORSO_V.map(p => ({ x: p.x, y: p.y })), opt('robot_torso', { density: 0.002 }));
    this.head = M.add.circle(x, y - 71 * S, 34 * S, opt('robot_head'));
    this.armL = M.add.circle(x - 44 * S, y - 6 * S, 10 * S, opt('robot_arm'));
    this.armR = M.add.circle(x + 44 * S, y - 6 * S, 10 * S, opt('robot_arm'));
    this.footL = M.add.circle(x - 13 * S, y + 44 * S, 12 * S, opt('robot_foot'));
    this.footR = M.add.circle(x + 13 * S, y + 44 * S, 12 * S, opt('robot_foot'));
    this.parts = [this.head, this.torso, this.armL, this.armR, this.footL, this.footR];
    // 연결(부드러운 구속)
    const tl = (p) => ({ x: p[0] * S - cen.x, y: p[1] * S - cen.y });
    this.links = [];
    const link = (a, pa, b, pb, stiff = 0.35) => {
      const wa = this.worldPt(a, pa), wb = this.worldPt(b, pb);
      const len = Math.hypot(wa.x - wb.x, wa.y - wb.y);
      const c = M.add.constraint(a, b, len, stiff, { pointA: pa, pointB: pb, damping: 0.12 });
      this.links.push(c);
    };
    link(this.torso, tl([-12, -27]), this.head, { x: -12 * S, y: 30 * S }, 0.6);
    link(this.torso, tl([12, -27]), this.head, { x: 12 * S, y: 30 * S }, 0.6);
    link(this.torso, tl([-26, -16]), this.armL, { x: 0, y: 0 });
    link(this.torso, tl([26, -16]), this.armR, { x: 0, y: 0 });
    link(this.torso, tl([-11, 24]), this.footL, { x: 0, y: 0 }, 0.5);
    link(this.torso, tl([11, 24]), this.footR, { x: 0, y: 0 }, 0.5);
    // 그래픽
    this.glow = scene.add.graphics().setDepth(19);
    this.shadow = scene.add.image(x, FLOOR_Y, 'shadow').setDepth(5);
    const img = (k) => scene.add.image(0, 0, k);
    this.armLi = img('r_arm').setDepth(20); this.armRi = img('r_arm').setDepth(20);
    this.footLi = img('r_foot').setDepth(20); this.footRi = img('r_foot').setDepth(20);
    this.torsoC = scene.add.container(0, 0).setDepth(21);
    this.torsoImg = img('r_torso'); this.torsoImg.y = -2 * S;
    this.juiceG = scene.add.graphics();
    this.torsoC.add([this.torsoImg, this.juiceG]);
    this.headC = scene.add.container(0, 0).setDepth(22);
    this.earL = img('r_ear').setOrigin(0.5, 0.93); this.earR = img('r_ear').setOrigin(0.5, 0.93);
    this.earL.setPosition(-15 * S, -24 * S); this.earR.setPosition(15 * S, -24 * S);
    this.headImg = img('r_head');
    this.faceG = scene.add.graphics();
    this.headC.add([this.earL, this.earR, this.headImg, this.faceG]);
    this.ears = [{ a: -0.2, w: 0, side: -1 }, { a: 0.2, w: 0, side: 1 }];
    this.expr = 'calm'; this.exprT = 0; this.blinkT = 2 + Math.random() * 2; this.scaredHold = 0;
    this.juice = 1; this.juiceTarget = 1; this.slosh = 0; this.sloshV = 0; this.flash = 0; this.prevV = { x: 0, y: 0 };
    this.squash = 1; this.time = 0;
    // 주스 창 외곽(알약형) 다각형
    this.pill = []; const r = WIN.w / 2, top = WIN.cy - WIN.h / 2 + r, bot = WIN.cy + WIN.h / 2 - r;
    for (let i = 0; i <= 12; i++) { const a = Math.PI + i * Math.PI / 12; this.pill.push({ x: Math.cos(a) * r, y: top + Math.sin(a) * r }); }
    for (let i = 0; i <= 12; i++) { const a = i * Math.PI / 12; this.pill.push({ x: Math.cos(a) * r, y: bot + Math.sin(a) * r }); }
  }
  worldPt(body, p) { const c = Math.cos(body.angle), s = Math.sin(body.angle); return { x: body.position.x + p.x * c - p.y * s, y: body.position.y + p.x * s + p.y * c }; }
  isPart(b) { return this.parts.includes(b) || this.parts.includes(b.parent); }
  maxSpeed() { return Math.max(...this.parts.map(p => p.speed)); }
  center() { return this.torso.position; }
  setExpr(e) { if (this.expr === e) return; this.expr = e; this.exprT = 0; if (e === 'scared') Sfx.scream(); }
  impact(strength) {
    this.sloshV += (Math.random() < 0.5 ? -1 : 1) * Math.min(0.5, strength * 0.05); this.flash = 1; this.squash = 0.82; Sfx.slosh();
  }
  destroy() { this.parts.forEach(p => this.scene.matter.world.remove(p)); this.links.forEach(l => this.scene.matter.world.removeConstraint(l)); [this.glow, this.shadow, this.armLi, this.armRi, this.footLi, this.footRi, this.torsoC, this.headC].forEach(o => o.destroy()); }
  clipBelow(poly, nx, ny, d) { // n·p >= d 인 쪽(아래)만 남김
    const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const da = a.x * nx + a.y * ny - d, db = b.x * nx + b.y * ny - d; if (da >= 0) out.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } } return out;
  }
  update(dt) {
    const s = dt / 1000; this.time += s;
    const T = this.torso, Hd = this.head;
    // 몸통/머리 위치
    const ca = Math.cos(T.angle), sa = Math.sin(T.angle);
    const tcx = T.position.x - (this.tc.x * ca - this.tc.y * sa), tcy = T.position.y - (this.tc.x * sa + this.tc.y * ca);
    this.squash += (1 - this.squash) * Math.min(1, s * 10);
    this.torsoC.setPosition(tcx, tcy).setRotation(T.angle).setScale(2 - this.squash, this.squash);
    this.headC.setPosition(Hd.position.x, Hd.position.y).setRotation(Hd.angle).setScale(1 + (1 - this.squash) * 0.5, 1 - (1 - this.squash) * 0.5);
    [[this.armLi, this.armL], [this.armRi, this.armR], [this.footLi, this.footL], [this.footRi, this.footR]].forEach(([i, b]) => i.setPosition(b.position.x, b.position.y).setRotation(b.angle));
    // 연결 빛
    const g = this.glow; g.clear();
    this.links.forEach(l => { const a = this.worldPt(l.bodyA, l.pointA), b = this.worldPt(l.bodyB, l.pointB); g.lineStyle(10, C.link, 0.18).lineBetween(a.x, a.y, b.x, b.y); g.lineStyle(4, C.link, 0.5).lineBetween(a.x, a.y, b.x, b.y); g.fillStyle(C.link, 0.6).fillCircle(a.x, a.y, 3); });
    // 접지 그림자
    const by = Math.max(...this.parts.map(p => p.bounds.max.y)); const hgt = Math.max(0, this.groundY - by);
    this.shadow.setPosition(T.position.x, this.groundY - 4).setScale(Math.max(0.3, 1 - hgt / 600)).setAlpha(Math.max(0.15, 1 - hgt / 500));
    // 표정
    this.exprT += s;
    const sp = this.maxSpeed();
    if (this.expr === 'calm' && sp > 7.5) this.setExpr('scared');
    if (this.expr === 'scared') { if (sp > 4) this.scaredHold = 0; else { this.scaredHold += s; if (this.scaredHold > 0.7) this.setExpr('calm'); } }
    // 귀 스프링(비물리 스프라이트)
    const hv = Hd.velocity;
    this.ears.forEach((e, i) => {
      let target = e.side * 0.2;
      if (this.expr === 'scared') target = e.side * 1.25 + Math.sin(this.time * 60) * 0.06;
      else if (this.expr === 'dizzy') target = e.side * 2.0;
      else if (this.expr === 'happy') target = e.side * 0.1 + Math.sin(this.time * 8 + i) * 0.12;
      target += -hv.x * 0.05 - Hd.angularVelocity * 2 + Phaser.Math.Clamp(hv.y * 0.04, -0.4, 0.4) * e.side;
      e.w += (target - e.a) * 0.18; e.w *= 0.82; e.a += e.w;
      (i ? this.earR : this.earL).setRotation(e.a);
    });
    this.drawFace();
    // 주스
    this.juice += (this.juiceTarget - this.juice) * Math.min(1, s * 4);
    const ax = (T.velocity.x - this.prevV.x); this.prevV = { x: T.velocity.x, y: T.velocity.y };
    this.sloshV += (-this.slosh * 0.25 - ax * 0.03); this.sloshV *= 0.9; this.slosh += this.sloshV;
    let tilt = this.slosh + Math.sin(this.time * 1.6) * 0.05; if (this.expr === 'scared') tilt += Math.sin(this.time * 45) * 0.08;
    tilt = Phaser.Math.Clamp(tilt, -0.9, 0.9);
    this.flash = Math.max(0, this.flash - s * 5);
    this.lastTilt = tilt;
    this.drawJuice(tilt);
  }
  // 리플레이용: 화면에 보이는 상태만 기록/재생(물리 바디는 건드리지 않음)
  snap() {
    const tr = (o) => [o.x, o.y, o.rotation, o.scaleX, o.scaleY];
    return { tc: tr(this.torsoC), hc: tr(this.headC),
      limbs: [this.armLi, this.armRi, this.footLi, this.footRi].map(i => [i.x, i.y, i.rotation]),
      ears: [this.earL.rotation, this.earR.rotation],
      links: this.links.map(l => { const a = this.worldPt(l.bodyA, l.pointA), b = this.worldPt(l.bodyB, l.pointB); return [a.x, a.y, b.x, b.y]; }),
      sh: [this.shadow.x, this.shadow.y, this.shadow.scaleX, this.shadow.alpha],
      expr: this.expr, exprT: this.exprT, juice: this.juice, tilt: this.lastTilt || 0, flash: this.flash };
  }
  applySnap(f) {
    const tr = (o, v) => o.setPosition(v[0], v[1]).setRotation(v[2]).setScale(v[3], v[4]);
    tr(this.torsoC, f.tc); tr(this.headC, f.hc);
    [this.armLi, this.armRi, this.footLi, this.footRi].forEach((i, k) => i.setPosition(f.limbs[k][0], f.limbs[k][1]).setRotation(f.limbs[k][2]));
    this.earL.setRotation(f.ears[0]); this.earR.setRotation(f.ears[1]);
    const g = this.glow; g.clear();
    f.links.forEach(([ax, ay, bx, by]) => { g.lineStyle(10, C.link, 0.18).lineBetween(ax, ay, bx, by); g.lineStyle(4, C.link, 0.5).lineBetween(ax, ay, bx, by); g.fillStyle(C.link, 0.6).fillCircle(ax, ay, 3); });
    this.shadow.setPosition(f.sh[0], f.sh[1]).setScale(f.sh[2]).setAlpha(f.sh[3]);
    this.expr = f.expr; this.exprT = f.exprT; this.juice = f.juice; this.flash = f.flash;
    this.drawFace(); this.drawJuice(f.tilt);
  }
  drawJuice(tilt) {
    const g = this.juiceG; g.clear();
    const lvl = Phaser.Math.Clamp(this.juice, 0, 1);
    const yTop = WIN.cy + WIN.h / 2 - WIN.h * lvl; // 수면 높이
    const nx = Math.sin(-tilt), ny = Math.cos(-tilt);
    if (lvl > 0.01) {
      const poly = this.clipBelow(this.pill, nx, ny, nx * 0 + ny * yTop);
      if (poly.length > 2) g.fillStyle(C.juice, 1).fillPoints(poly, true);
      const shadeY = yTop + (WIN.cy + WIN.h / 2 - yTop) * 0.6;
      const p2 = this.clipBelow(this.pill, 0, 1, shadeY);
      if (p2.length > 2 && shadeY > yTop) g.fillStyle(C.juiceShade, 1).fillPoints(p2, true);
    }
    g.fillStyle(0xffffff, 0.8).fillRoundedRect(-WIN.w / 2 + 2.5, WIN.cy - WIN.h / 2 + 3, 2.5, 6, 1.2);
    if (this.flash > 0) g.fillStyle(0xffffff, this.flash * 0.85).fillPoints(this.pill, true);
  }
  drawFace() {
    const g = this.faceG; g.clear(); const t = this.exprT;
    const ey = 6 * S, ex = 12 * S;
    const glowRect = (x, y, w, h, r) => { g.fillStyle(C.eyeGlow, 0.28).fillRoundedRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, r + 3); g.fillStyle(C.eye, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, r); };
    if (this.expr === 'calm') {
      this.blinkT -= 1 / 60; const blink = this.blinkT < 0.12;
      if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 2.5;
      [-1, 1].forEach(sd => glowRect(sd * ex, ey, 9 * S, blink ? 2 * S : 14 * S, blink ? 1 : 4 * S));
    } else if (this.expr === 'scared') {
      [-1, 1].forEach(sd => glowRect(sd * ex + (Math.random() - 0.5) * 2, ey + (Math.random() - 0.5) * 2, 10 * S, 20 * S, 5 * S));
      // LED 땀방울
      const dy = (t * 20) % 8;
      g.fillStyle(C.eye, 0.9).fillCircle(22 * S, -2 * S + dy, 3 * S); g.fillTriangle(22 * S - 2.6 * S, -2 * S + dy - 0.5, 22 * S + 2.6 * S, -2 * S + dy - 0.5, 22 * S, -8 * S + dy);
    } else if (this.expr === 'happy') {
      [-1, 1].forEach(sd => { const cx = sd * ex; g.lineStyle(9, C.eyeGlow, 0.3); g.beginPath(); g.arc(cx, ey + 5 * S, 6 * S, Math.PI * 1.1, Math.PI * 1.9); g.strokePath(); g.lineStyle(4, C.eye, 1); g.beginPath(); g.arc(cx, ey + 5 * S, 6 * S, Math.PI * 1.1, Math.PI * 1.9); g.strokePath(); });
      if (Math.floor(t * 4) % 2 === 0) starShape(g, 26 * S, -10 * S, 5 * S, 0xFFD95A);
    } else if (this.expr === 'dizzy') {
      [-1, 1].forEach(sd => { const cx = sd * ex; g.lineStyle(3, C.eye, 1); g.beginPath(); for (let i = 0; i < 26; i++) { const a = t * 8 * sd + i * 0.5, r = i * 0.32 * S; const px = cx + Math.cos(a) * r, py = ey + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.strokePath(); });
      for (let i = 0; i < 3; i++) { const a = t * 3 + i * Math.PI * 2 / 3; starShape(g, Math.cos(a) * 34 * S, -40 * S + Math.sin(a) * 8 * S, 5 * S, 0xFFD95A); }
    }
  }
}

/* ---------------- 장면: 부트/타이틀 ---------------- */
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    makeRobotTextures(this); drawWorld1Bg(this);
    this.matter.world.setBounds(-200, -400, W + 400, FLOOR_Y + 400, 64, false, false, false, true);
    const floor = this.matter.add.rectangle(W / 2, FLOOR_Y + 50, W * 2, 100, { isStatic: true, label: 'floor' });
    const g = this.add.graphics().setDepth(30);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(70, 150, 580, 220, 40); g.lineStyle(6, 0xFFB7CF, 1).strokeRoundedRect(70, 150, 580, 220, 40);
    this.add.text(W / 2, 222, '러그돌 로봇', { fontFamily: FONT, fontSize: '76px', fontStyle: 'bold', color: '#FF8A1F', stroke: '#ffffff', strokeThickness: 8 }).setOrigin(0.5).setDepth(31);
    this.add.text(W / 2, 312, '블록을 빼서 매트에 안착!', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#4E9A45' }).setOrigin(0.5).setDepth(31);
    // 떨어지는 로봇과 블록(타이틀 연출)
    this.matter.add.image(W / 2, 1155, blockTex(this, 'cushion', 300, 50), null, { isStatic: true, label: 'cushion' }).setDepth(8);
    this.matter.add.image(W / 2, 760, blockTex(this, 'cushion', 260, 50), null, { isStatic: true, label: 'cushion' }).setDepth(8);
    this.robot = new Robot(this, W / 2 - 20, 470); this.robot.groundY = 735; 
    Phaser.Physics.Matter.Matter.Body.setAngularVelocity(this.robot.torso, 0.02);
    for (let i = 0; i < 4; i++) { const b = this.matter.add.image([90, 630, 120, 600][i], 470 - i * 90, blockTex(this, 'wood', 80, 50), null, { restitution: 0.2 }); b.setAngularVelocity(0.05 * (i - 1.5)); b.setDepth(15); }
    this.robot.setExpr('scared');
    button(this, W / 2, 1010, 360, 120, '플레이', () => this.scene.start('Select'), { size: 48 });
    this.add.text(W / 2, 1240, '프로토타입 · 월드 1 스테이지 1~5', { fontFamily: FONT, fontSize: '24px', color: '#5b4a3a' }).setOrigin(0.5).setDepth(40);
    window.__STATE = { scene: 'Title' };
  }
  update(t, dt) { this.robot.update(dt); if (this.robot.torso.position.y > 600 && this.robot.expr === 'scared' && this.robot.maxSpeed() < 3) this.robot.setExpr('happy'); }
}

/* ---------------- 스테이지 선택 ---------------- */
class SelectScene extends Phaser.Scene {
  constructor() { super('Select'); }
  create() {
    makeRobotTextures(this); drawWorld1Bg(this);
    const save = Save.load();
    const g = this.add.graphics(); g.fillStyle(0xffffff, 0.9).fillRoundedRect(60, 80, 600, 120, 30);
    this.add.text(W / 2, 140, '월드 1 · 놀이공원', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#FF8A1F' }).setOrigin(0.5);
    let total = 0;
    STAGES.forEach((st, i) => {
      const unlocked = i === 0 || (save.stars[STAGES[i - 1].id] || 0) > 0 || /unlock/.test(location.search);
      const stars = save.stars[st.id] || 0; total += stars;
      const x = 180 + (i % 3) * 180, y = 380 + Math.floor(i / 3) * 260;
      const b = button(this, x, y, 150, 150, unlocked ? String(st.id) : '🔒', () => { if (unlocked) this.scene.start('Game', { idx: i }); }, { size: 60, color: unlocked ? 0xFFD95A : 0xBBBBBB, shade: unlocked ? 0xE0A93A : 0x999999, text: unlocked ? '#7a4a12' : '#666' });
      b.name = 'stage' + st.id;
      this.add.text(x, y + 98, st.name, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#3b3f4a' }).setOrigin(0.5);
      const sg = this.add.graphics(); for (let k = 0; k < 3; k++) starShape(sg, x - 40 + k * 40, y + 138, 16, k < stars ? 0xFFB224 : 0xffffff, k < stars ? 1 : 0.7);
    });
    this.add.text(W / 2, 960, `모은 별 ${total} / ${STAGES.length * 3}`, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#3b3f4a' }).setOrigin(0.5);
    button(this, W / 2, 1090, 300, 100, '타이틀', () => this.scene.start('Title'), { size: 36, color: 0x6FD6C0, shade: 0x4FB7A2 });
    window.__STATE = { scene: 'Select' };
  }
}

/* ---------------- 게임 ---------------- */
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(d) { this.idx = d.idx || 0; this.st = STAGES[this.idx]; }
  create() {
    makeRobotTextures(this); drawWorld1Bg(this);
    const MB = Phaser.Physics.Matter.Matter;
    this.matter.world.engine.positionIterations = 10; this.matter.world.engine.velocityIterations = 8;
    this.state = 'play'; this.taps = 0; this.restT = 0; this.idleT = 0; this.blocks = []; this.cushions = [];
    this.penalties = 0; this.hintsLeft = HINTS_PER_STAGE; this.hintsUsed = 0; this.rec = []; this.recEvents = []; this.recObjs = []; this.recording = true; this.replaying = false; this.resultObjs = null;
    this.floor = this.matter.add.rectangle(W / 2, FLOOR_Y + 50, W * 3, 100, { isStatic: true, label: 'floor', friction: 0.9 });
    this.st.items.forEach(it => this.addItem(it));
    this.robot = new Robot(this, this.st.robot[0], this.st.robot[1]); this.robot.groundY = FLOOR_Y;
    this.cushionTouch = new Set(); this.floorTouch = new Set(); this.floorT = 0;
    // 충돌 이벤트
    this.matter.world.on('collisionstart', (ev) => ev.pairs.forEach(p => this.onCollide(p, true)));
    this.matter.world.on('collisionend', (ev) => ev.pairs.forEach(p => this.onCollide(p, false)));
    this.makeHud();
    if (this.st.tutorial) {
      const b = this.blocks.find(b => b.bid === this.st.tutorial);
      this.hand = this.add.text(b.x + 60, b.y + 30, '👆 탭!', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff', stroke: '#FF8A1F', strokeThickness: 8 }).setDepth(60);
      this.tweens.add({ targets: this.hand, y: b.y + 50, yoyo: true, repeat: -1, duration: 450 });
    }
    if (this.st.order) { this.refreshBadges(); this.time.delayedCall(450, () => { if (this.state === 'play' && this.taps === 0) this.toast('블록의 숫자 순서대로 빼세요! 순서가 틀리면 탭 +1'); }); }
    this.cameras.main.fadeIn(250);
    this.exposeState();
  }
  /* ---- 순서 규칙 ---- */
  nextOrderId() { if (!this.st.order) return null; return this.st.order.find(id => this.blocks.some(b => b.bid === id && b.active)) || null; }
  refreshBadges() {
    const next = this.nextOrderId();
    this.blocks.forEach(b => { if (!b.badge) return; const on = b.bid === next; b.badge.ring.setFillStyle(on ? 0xFF8A1F : 0xFFFFFF, 1); b.badge.txt.setColor(on ? '#ffffff' : '#B9773F');
      if (on && !b.badge.pulse) b.badge.pulse = this.tweens.add({ targets: b.badge, scale: 1.18, yoyo: true, repeat: -1, duration: 420 }); });
  }
  wrongOrder(obj) {
    Sfx.tone(220, 140, 0.22, 'square', 0.08); this.cameras.main.shake(160, 0.006);
    this.robot.sloshV += 0.25; this.robot.flash = 1;
    obj.setTint(0xFF7B7B); this.time.delayedCall(450, () => { if (obj.active) obj.clearTint(); });
    const x = obj.x, y = obj.y;
    const mark = this.add.text(x, y, '✕', { fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#E8483B', stroke: '#ffffff', strokeThickness: 8 }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: mark, x: { from: x - 10, to: x + 10 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => this.tweens.add({ targets: mark, alpha: 0, y: y - 30, duration: 300, onComplete: () => mark.destroy() }) });
    const pen = this.add.text(x + 70, y - 40, `탭 +${ORDER_PENALTY}`, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#E8483B', stroke: '#ffffff', strokeThickness: 7 }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: pen, y: y - 100, alpha: 0, delay: 500, duration: 700, onComplete: () => pen.destroy() });
    this.flashTapText();
    const nb = this.blocks.find(b => b.bid === this.nextOrderId());
    this.toast(`순서가 틀렸어요! ${nb && nb.badge ? nb.badge.num + '번' : '숫자 순서대로'} 블록부터 빼세요 (탭 +${ORDER_PENALTY})`);
  }
  flashTapText() { this.tapText.setColor('#E8483B'); this.tweens.add({ targets: this.tapText, scale: 1.25, yoyo: true, duration: 120 }); this.time.delayedCall(700, () => this.tapText.setColor('#FF8A1F')); }
  /* ---- 힌트 화살표 ---- */
  hintTarget() {
    const ok = (id) => this.blocks.some(b => b.bid === id && b.active);
    if (this.st.order) { const id = this.nextOrderId(); const e = (this.st.hintSeq || []).find(h => h[0] === id) || [id, 'right']; return id ? e : null; }
    return (this.st.hintSeq || []).find(h => ok(h[0])) || null;
  }
  useHint() {
    if (this.state !== 'play' || this.replaying) return;
    if (this.hintsLeft <= 0) { this.toast('이 스테이지의 힌트 화살표를 다 썼어요.\n' + this.st.hint); return; }
    const h = this.hintTarget(); if (!h) { this.toast(this.st.hint); return; }
    this.hintsLeft--; this.hintsUsed++; this.updateHintBtn();
    this.toast(this.st.hint);
    this.showArrow(this.blocks.find(b => b.bid === h[0]), h[1]);
    this.exposeState();
  }
  showArrow(obj, dir) {
    this.clearArrow(); if (!obj) return;
    const c = this.add.container(0, 0).setDepth(65);
    const g = this.add.graphics();
    // 오른쪽을 가리키는 기본 화살표(끝점이 원점)
    g.fillStyle(0xE0650F, 1).fillPoints([{ x: -86, y: -13 }, { x: -36, y: -13 }, { x: -36, y: -32 }, { x: 4, y: 3 }, { x: -36, y: 38 }, { x: -36, y: 19 }, { x: -86, y: 19 }], true);
    g.fillStyle(0xFF8A1F, 1).fillPoints([{ x: -90, y: -16 }, { x: -40, y: -16 }, { x: -40, y: -36 }, { x: 0, y: 0 }, { x: -40, y: 36 }, { x: -40, y: 16 }, { x: -90, y: 16 }], true);
    g.lineStyle(5, 0xffffff, 1).strokePoints([{ x: -90, y: -16 }, { x: -40, y: -16 }, { x: -40, y: -36 }, { x: 0, y: 0 }, { x: -40, y: 36 }, { x: -40, y: 16 }, { x: -90, y: 16 }], true);
    c.add(g); c.rotation = { right: 0, left: Math.PI, down: Math.PI / 2, up: -Math.PI / 2 }[dir] || 0;
    const ring = this.add.graphics().setDepth(64);
    this.arrow = { c, ring, obj, dir, t: 0, life: 4.0 };
    this.positionArrow(0);
  }
  positionArrow(dt) {
    const a = this.arrow; if (!a) return;
    a.t += dt / 1000;
    if (!a.obj.active || a.t > a.life) { this.clearArrow(); return; }
    const o = a.obj, hw = o.displayWidth / 2, hh = o.displayHeight / 2, bob = 10 + Math.sin(a.t * 9) * 10;
    const off = { right: [-hw - bob, 0], left: [hw + bob, 0], down: [0, -hh - bob], up: [0, hh + bob] }[a.dir] || [-hw - bob, 0];
    a.c.setPosition(o.x + off[0], o.y + off[1]).setAlpha(a.t > a.life - 0.4 ? (a.life - a.t) / 0.4 : 1);
    const pr = (a.t * 1.6) % 1;
    a.ring.clear().lineStyle(6 * (1 - pr) + 1, 0xFF8A1F, 0.9 * (1 - pr)).strokeRoundedRect(o.x - hw - 6 - pr * 18, o.y - hh - 6 - pr * 18, o.displayWidth + 12 + pr * 36, o.displayHeight + 12 + pr * 36, 14);
  }
  clearArrow() { if (this.arrow) { this.arrow.c.destroy(); this.arrow.ring.destroy(); this.arrow = null; } }
  updateHintBtn() { if (this.hintBadge) { this.hintBadgeT.setText(String(this.hintsLeft)); this.hintBadge.setAlpha(this.hintsLeft > 0 ? 1 : 0.45); this.hintBtn.setAlpha(this.hintsLeft > 0 ? 1 : 0.6); } }
  addItem(it) {
    const M = this.matter; let obj;
    if (it.t === 'stone') { obj = M.add.image(it.x, it.y, blockTex(this, 'stone', it.w, it.h), null, { isStatic: true, label: 'stone', friction: 0.8 }); }
    else if (it.t === 'cushion') { obj = M.add.image(it.x, it.y, blockTex(this, 'cushion', it.w, it.h), null, { isStatic: true, label: 'cushion', friction: 1, restitution: 0 }); this.cushions.push(obj); }
    else if (it.t === 'wood') { obj = M.add.image(it.x, it.y, blockTex(this, 'wood', it.w, it.h), null, { label: 'wood', friction: 0.9, frictionStatic: 1, density: 0.002 }); obj.removable = true; }
    else if (it.t === 'bomb') { obj = M.add.image(it.x, it.y, blockTex(this, 'bomb', it.r * 2 + 12, it.r * 2 + 16), null, { shape: { type: 'circle', radius: it.r }, label: 'bomb', friction: 0.9, density: 0.002 }); obj.removable = true; obj.bomb = true;
      const f = this.add.circle(0, 0, 5, 0xFFD95A).setDepth(16); this.tweens.add({ targets: f, alpha: 0.2, scale: 1.6, yoyo: true, repeat: -1, duration: 200 }); obj.fuse = f; }
    else if (it.t === 'plank') {
      obj = M.add.image(it.x, it.y, blockTex(this, 'plank', it.w, it.h), null, { label: 'plank', friction: 0.6, density: 0.002 });
      const pv = it.pivot || it.hinge;
      M.add.worldConstraint(obj.body, 0, 1, { pointA: { x: pv[0], y: pv[1] }, pointB: { x: pv[0] - it.x, y: pv[1] - it.y } });
      const pin = this.add.circle(pv[0], pv[1], 7, 0x5E646B).setDepth(16); obj.pin = pin;
    }
    else if (it.t === 'fulcrum') {
      obj = this.add.image(it.x, it.y, blockTex(this, 'fulcrum', it.w, it.h));
    }
    obj.setDepth(it.t === 'cushion' ? 8 : 15); obj.bid = it.id; obj.kind = it.t;
    if (obj.body && !obj.body.isStatic) { obj.recIdx = this.recObjs.length; this.recObjs.push({ obj, key: obj.texture.key, depth: obj.depth }); }
    if (this.st.order && this.st.order.includes(it.id)) {
      const num = this.st.order.indexOf(it.id) + 1;
      const ring = this.add.circle(0, 0, 21, 0xffffff, 1).setStrokeStyle(4, 0xB9773F);
      const txt = this.add.text(0, 0, String(num), { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#B9773F' }).setOrigin(0.5);
      obj.badge = this.add.container(it.x, it.y, [ring, txt]).setDepth(16); obj.badge.ring = ring; obj.badge.txt = txt; obj.badge.num = num;
    }
    if (obj.removable) {
      obj.setInteractive({ useHandCursor: true });
      obj.on('pointerdown', () => this.tapBlock(obj));
      this.blocks.push(obj);
    } else if (it.id) this.blocks.push(obj);
    return obj;
  }
  makeHud() {
    const g = this.add.graphics().setDepth(80);
    g.fillStyle(0xffffff, 0.88).fillRoundedRect(16, 16, W - 32, 150, 30);
    button(this, 74, 74, 84, 84, 'Ⅱ', () => this.scene.start('Select'), { size: 36, color: 0x8FD3FF, shade: 0x5AA9DD, depth: 81 });
    button(this, W - 168, 74, 84, 84, '↻', () => this.scene.restart({ idx: this.idx }), { size: 44, color: 0xFF9EC7, shade: 0xE07AA6, depth: 81 });
    this.hintBtn = button(this, W - 74, 74, 84, 84, '힌트', () => this.useHint(), { size: 26, color: 0xFFD95A, shade: 0xE0A93A, text: '#7a4a12', depth: 81 });
    this.hintBadge = this.add.circle(W - 36, 36, 17, 0xFF8A1F).setStrokeStyle(3, 0xffffff).setDepth(83);
    this.hintBadgeT = this.add.text(W - 36, 35, String(this.hintsLeft), { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(84);
    this.add.text(140, 34, `1-${this.st.id} ${this.st.name}`, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#3b3f4a' }).setDepth(81);
    this.tapText = this.add.text(140, 76, '', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#FF8A1F' }).setDepth(81);
    this.nextText = this.add.text(140, 118, '', { fontFamily: FONT, fontSize: '22px', color: '#5b4a3a' }).setDepth(81);
    this.starG = this.add.graphics().setDepth(81);
    this.updateHud();
  }
  starsNow() { return this.taps <= this.st.t3 ? 3 : this.taps <= this.st.t2 ? 2 : 1; }
  updateHud() {
    const st = this.st, u = this.taps;
    this.tapText.setText(`탭 ${u} / ${st.limit}`);
    const n = this.starsNow();
    const left = n === 3 ? st.t3 - u : n === 2 ? st.t2 - u : null;
    this.nextText.setText(left === null ? '별 1개 확보(클리어하면 받아요)' : `다음 별까지 남은 탭 ${left}`);
    this.starG.clear(); for (let k = 0; k < 3; k++) starShape(this.starG, 380 + k * 52, 96, 22, k < n ? 0xFFB224 : 0xBDBDBD, 1);
    // 주스 = 별 페이스
    let j; if (u <= st.t3) j = 1 - (u / Math.max(1, st.t3)) / 3; else if (u <= st.t2) j = 2 / 3 - ((u - st.t3) / Math.max(1, st.t2 - st.t3)) / 3; else j = 1 / 3;
    if (this.robot) { const prevStars = this.lastStars || 3; this.robot.juiceTarget = j; if (n < prevStars) { this.robot.sloshV += 0.35; this.robot.flash = 1; Sfx.slosh(); } }
    this.lastStars = n;
  }
  tapBlock(obj) {
    if (this.state !== 'play' || !obj.active) return;
    Sfx.init();
    if (this.taps >= this.st.limit) { this.toast('탭을 다 썼어요! 다시하기를 눌러 보세요'); return; }
    if (this.st.order && obj.bid !== this.nextOrderId()) { // 순서 틀림: 블록은 그대로, 탭 +1
      this.taps = Math.min(this.st.limit, this.taps + ORDER_PENALTY); this.penalties++;
      this.wrongOrder(obj); this.updateHud(); this.exposeState(); return;
    }
    this.taps++; this.lastTapT = this.time.now; if (this.hand) { this.hand.destroy(); this.hand = null; }
    if (obj.bomb) this.explode(obj); else this.removeBlock(obj, true);
    if (this.st.order) this.refreshBadges();
    this.updateHud(); this.exposeState();
  }
  removeBlock(obj, sound) {
    if (!obj.active) return;
    if (this.recording) this.recEvents.push({ t: this.time.now, type: 'pop', x: obj.x, y: obj.y });
    if (obj.badge) { obj.badge.destroy(); obj.badge = null; }
    if (this.arrow && this.arrow.obj === obj) this.clearArrow();
    if (sound) Sfx.pop();
    const x = obj.x, y = obj.y;
    for (let i = 0; i < 8; i++) { const p = this.add.rectangle(x + Phaser.Math.Between(-obj.displayWidth / 3, obj.displayWidth / 3), y, 10, 10, 0xD3965A).setDepth(30); this.tweens.add({ targets: p, x: p.x + Phaser.Math.Between(-60, 60), y: p.y + Phaser.Math.Between(-80, 20), angle: 180, alpha: 0, duration: 450, onComplete: () => p.destroy() }); }
    this.blocks = this.blocks.filter(b => b !== obj);
    if (obj.fuse) obj.fuse.destroy();
    const ghost = this.add.image(x, y, obj.texture.key).setRotation(obj.rotation).setDepth(15);
    this.tweens.add({ targets: ghost, scaleX: 1.15, scaleY: 0.6, alpha: 0, duration: 140, onComplete: () => ghost.destroy() });
    obj.destroy();
  }
  explode(obj) {
    const MB = Phaser.Physics.Matter.Matter.Body;
    const x = obj.x, y = obj.y, R = 230;
    this.removeBlock(obj, false); Sfx.boom();
    if (this.recording) this.recEvents.push({ t: this.time.now, type: 'boom', x, y });
    this.cameras.main.shake(350, 0.02);
    const fl = this.add.circle(x, y, 30, 0xFFD95A, 0.9).setDepth(40); this.tweens.add({ targets: fl, scale: 6, alpha: 0, duration: 380, onComplete: () => fl.destroy() });
    const ring = this.add.circle(x, y, 40).setStrokeStyle(10, 0xFF8A1F).setDepth(40); this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    // 주변 나무 블록 제거, 다른 폭탄 연쇄
    this.blocks.slice().forEach(b => { if (!b.active) return; const d = Math.hypot(b.x - x, b.y - y); if (d < 110 && b.kind === 'wood') this.removeBlock(b, false); else if (d < 140 && b.bomb) this.time.delayedCall(150, () => this.explode(b)); });
    // 로봇은 한 덩어리로 밀어냄
    const rc = this.robot.center(); const dx = rc.x - x, dy = rc.y - y, d = Math.hypot(dx, dy);
    if (d < R) { const k = 8 * (1 - d / R) + 4.5; const nx = dx / d, ny = dy / d - 3.6; const n = Math.hypot(nx, ny);
      this.robot.parts.forEach(p => MB.setVelocity(p, { x: p.velocity.x + nx / n * k, y: p.velocity.y + ny / n * k })); this.robot.setExpr('scared'); }
    this.matter.world.localWorld.bodies.forEach(b => { if (b.isStatic || this.robot.isPart(b) || b.label === 'bomb') return; const ddx = b.position.x - x, ddy = b.position.y - y, dd = Math.hypot(ddx, ddy); if (dd < R && dd > 1) MB.setVelocity(b, { x: b.velocity.x + ddx / dd * 10 * (1 - dd / R), y: b.velocity.y + ddy / dd * 10 * (1 - dd / R) - 3 }); });
  }
  onCollide(pair, start) {
    const a = pair.bodyA, b = pair.bodyB; const r = this.robot; if (!r) return;
    const ra = r.isPart(a), rb = r.isPart(b); if (ra === rb) return;
    const part = ra ? (a.parent || a) : (b.parent || b), other = ra ? b : a;
    const lab = other.label;
    if (lab === 'cushion') { if (start) this.cushionTouch.add(part.id); else this.cushionTouch.delete(part.id); }
    if (lab === 'floor') { if (start) this.floorTouch.add(part.id); else this.floorTouch.delete(part.id); }
    if (!start || this.state !== 'play') return;
    const rel = Math.hypot(part.velocity.x - other.velocity.x, part.velocity.y - other.velocity.y);
    if (part.label === 'robot_head' && lab === 'floor') { this.fail('머리가 바닥에 부딪혔어요'); return; }
    if (rel > 6 && (part.label === 'robot_torso' || part.label === 'robot_head')) {
      r.impact(rel); Sfx.thud();
      if (rel > 9) this.cameras.main.shake(180, 0.012);
      if (lab === 'cushion') { const c = this.cushions[0]; if (c) this.tweens.add({ targets: c, scaleY: 0.8, scaleX: 1.06, duration: 90, yoyo: true }); }
    }
  }
  toast(msg) {
    if (this.toastObj) this.toastObj.destroy();
    const t = this.add.text(W / 2, 220, msg, { fontFamily: FONT, fontSize: '28px', color: '#ffffff', backgroundColor: '#3b3f4acc', padding: { x: 20, y: 14 }, wordWrap: { width: 600 }, align: 'center' }).setOrigin(0.5, 0).setDepth(90);
    this.toastObj = t; this.time.delayedCall(2600, () => { if (t.active) this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() }); });
  }
  update(time, dt) {
    if (!this.robot) return;
    if (this.replaying) { this.stepReplay(dt); return; }
    this.robot.update(dt);
    if (this.recording) this.recordFrame();
    this.exposeState();
    this.blocks.forEach(b => { if (b.fuse && b.active) b.fuse.setPosition(b.x + 10 + Math.cos(b.rotation) * 0, b.y - 28); if (b.badge && b.active) b.badge.setPosition(b.x, b.y).setRotation(b.rotation); });
    this.positionArrow(dt);
    if (this.state !== 'play') return;
    const r = this.robot; const sp0 = r.maxSpeed(); this.spAvg = this.spAvg === undefined ? sp0 : this.spAvg * 0.85 + sp0 * 0.15; const sp = this.spAvg;
    // 화면 밖 = 실패
    if (r.parts.some(p => p.position.y > H + 80 || p.position.x < -120 || p.position.x > W + 120)) { this.fail('화면 밖으로 떨어졌어요'); return; }
    // 안착 판정: 매트에 닿아 있고 거의 멈춘 상태로 1.5초
    const c = this.cushions[0];
    const cTop = c ? c.y - c.displayHeight / 2 : 0;
    const touchC = c && r.parts.some(p => p.bounds.max.y >= cTop - 6 && p.bounds.max.y <= cTop + 14 && p.position.x > c.x - c.displayWidth / 2 && p.position.x < c.x + c.displayWidth / 2);
    const onC = (this.cushionTouch.size > 0 || touchC) && c && Math.abs(r.torso.position.x - c.x) < c.displayWidth / 2 + 30 && r.torso.position.y < c.y;
    this.dbg = { sp: +sp.toFixed(2), touchC, ct: this.cushionTouch.size, onC };
    if (onC && sp < 1.6) { this.restT += dt / 1000; if (!this.restBar) this.restBar = this.add.graphics().setDepth(70); this.restBar.clear().fillStyle(0x6FD6C0, 1).fillRoundedRect(r.torso.position.x - 40, r.torso.position.y - 150, 80 * Math.min(1, this.restT / 1.5), 10, 5).lineStyle(2, 0xffffff, 1).strokeRoundedRect(r.torso.position.x - 40, r.torso.position.y - 150, 80, 10, 5); }
    else { this.restT = 0; if (this.restBar) this.restBar.clear(); }
    if (this.restT >= 1.5) { this.clear(); return; }
    // 매트 대신 바닥에 내려앉으면 실패
    if (this.floorTouch.size > 0 && !onC && sp < 1.5) { this.floorT += dt / 1000; if (this.floorT > 1.2) { this.fail('매트 대신 바닥에 내려앉았어요'); return; } } else this.floorT = 0;
    // 탭을 다 쓰고 멈추면 실패
    if (this.taps >= this.st.limit && sp < 0.6 && !onC) { this.idleT += dt / 1000; if (this.idleT > 2) this.fail('탭을 다 썼어요'); } else this.idleT = 0;
  }
  clear() {
    this.state = 'clear'; this.keyT = this.time.now - 1500; const r = this.robot; r.setExpr('happy'); if (this.restBar) this.restBar.clear();
    const stars = this.starsNow(); Save.setStars(this.st.id, stars); Sfx.clear();
    r.juiceTarget = stars / 3 + 0.001; // 받은 별 수만큼 차오름
    for (let i = 0; i < 6; i++) { const bb = this.add.circle(r.torso.position.x + Phaser.Math.Between(-5, 5), r.torso.position.y, 2.5, 0xffffff, 0.8).setDepth(25); this.tweens.add({ targets: bb, y: bb.y - 30, alpha: 0, delay: i * 120, duration: 500, onComplete: () => bb.destroy() }); }
    const bub = this.add.text(r.head.position.x + 70, r.head.position.y - 90, '휴...', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#3b3f4a', backgroundColor: '#ffffff', padding: { x: 18, y: 10 } }).setDepth(70).setOrigin(0.5); bub.isSpeech = true;
    this.time.delayedCall(700, () => this.showResult(true, stars));
    this.exposeState();
  }
  fail(reason) {
    if (this.state !== 'play') return;
    this.state = 'fail'; this.keyT = this.time.now; this.robot.setExpr('dizzy'); this.robot.juiceTarget = 0; Sfx.fail(); Sfx.gulp();
    this.cameras.main.shake(250, 0.015);
    this.time.delayedCall(500, () => this.time.timeScale = 1);
    this.failReason = reason;
    this.time.delayedCall(900, () => this.showResult(false, 0, reason));
    this.exposeState();
  }
  showResult(win, stars, reason) {
    this.recording = false; this.clearArrow();
    const before = new Set(this.children.list);
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x1B2533, 0.45).fillRect(0, 0, W, H);
    g.fillStyle(0xffffff, 0.97).fillRoundedRect(80, 300, 560, win ? 560 : 540, 40);
    g.lineStyle(6, win ? 0x6FD6C0 : 0xFF9EC7, 1).strokeRoundedRect(80, 300, 560, win ? 560 : 540, 40);
    this.add.text(W / 2, 370, win ? '클리어!' : '실패…', { fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: win ? '#4FB7A2' : '#E07AA6' }).setOrigin(0.5).setDepth(101);
    if (win) {
      const sg = this.add.graphics().setDepth(101);
      for (let k = 0; k < 3; k++) this.time.delayedCall(250 + k * 280, () => { starShape(sg, W / 2 - 110 + k * 110, 490, 46, k < stars ? 0xFFB224 : 0xD9D9D9); if (k < stars) Sfx.star(k); });
      this.add.text(W / 2, 580, `탭 ${this.taps}번 · 별 3개 기준 ${this.st.t3}번`, { fontFamily: FONT, fontSize: '28px', color: '#5b4a3a' }).setOrigin(0.5).setDepth(101);
      const hasNext = this.idx < STAGES.length - 1;
      if (this.penalties || this.hintsUsed) this.add.text(W / 2, 620, [this.penalties ? `순서 벌칙 +${this.penalties * ORDER_PENALTY}탭` : '', this.hintsUsed ? `힌트 ${this.hintsUsed}회 사용(무료)` : ''].filter(Boolean).join(' · '), { fontFamily: FONT, fontSize: '22px', color: '#9a7a6a' }).setOrigin(0.5).setDepth(101);
      button(this, W / 2, 690, 400, 100, hasNext ? '다음 스테이지' : '스테이지 선택', () => hasNext ? this.scene.start('Game', { idx: this.idx + 1 }) : this.scene.start('Select'), { size: 40, depth: 102 }).name = 'btnNext';
      button(this, W / 2 - 175, 800, 160, 70, '리플레이', () => this.startReplay(), { size: 26, color: 0xFFD95A, shade: 0xE0A93A, text: '#7a4a12', depth: 102 }).name = 'btnReplay';
      button(this, W / 2, 800, 160, 70, '다시하기', () => this.scene.restart({ idx: this.idx }), { size: 26, color: 0xFF9EC7, shade: 0xE07AA6, depth: 102 });
      button(this, W / 2 + 175, 800, 160, 70, '선택', () => this.scene.start('Select'), { size: 26, color: 0x8FD3FF, shade: 0x5AA9DD, depth: 102 });
    } else {
      this.add.text(W / 2, 470, reason || '', { fontFamily: FONT, fontSize: '32px', color: '#5b4a3a' }).setOrigin(0.5).setDepth(101);
      this.add.text(W / 2, 520, '힌트: ' + this.st.hint, { fontFamily: FONT, fontSize: '24px', color: '#7a6a5a', wordWrap: { width: 480 }, align: 'center' }).setOrigin(0.5, 0).setDepth(101);
      button(this, W / 2, 660, 400, 110, '다시하기', () => this.scene.restart({ idx: this.idx }), { size: 40, depth: 102 }).name = 'btnRetry';
      button(this, W / 2 - 115, 770, 210, 76, '리플레이', () => this.startReplay(), { size: 28, color: 0xFFD95A, shade: 0xE0A93A, text: '#7a4a12', depth: 102 }).name = 'btnReplay';
      button(this, W / 2 + 115, 770, 210, 76, '스테이지 선택', () => this.scene.start('Select'), { size: 26, color: 0x8FD3FF, shade: 0x5AA9DD, depth: 102 });
    }
    this.resultObjs = this.children.list.filter(o => !before.has(o));
    this.exposeState();
  }
  /* ---- 슬로모션 리플레이 ---- */
  recordFrame() {
    const now = this.time.now;
    const objs = []; this.recObjs.forEach((r, i) => { const o = r.obj; if (o.active) objs.push([i, o.x, o.y, o.rotation]); });
    this.rec.push({ t: now, r: this.robot.snap(), o: objs });
    const cut = now - 6000; while (this.rec.length && this.rec[0].t < cut) this.rec.shift();
    while (this.recEvents.length && this.recEvents[0].t < cut) this.recEvents.shift();
  }
  startReplay() {
    if (this.replaying || this.rec.length < 2) return;
    const last = this.rec[this.rec.length - 1].t, key = this.keyT || last;
    const end = Math.min(last, key + REPLAY_POST * 1000);
    const start = Math.max(this.rec[0].t, key - REPLAY_MAX_PRE * 1000, Math.min(key - 1000, (this.lastTapT || 0) - 300));
    this.replaying = true; this.rp = { start, end, t: start, i: 0, ev: 0 };
    this.matter.world.pause();
    (this.resultObjs || []).forEach(o => o.setVisible(false));
    [this.toastObj, this.restBar].forEach(o => o && o.active && o.setVisible(false));
    this.children.list.filter(o => o.isSpeech).forEach(o => o.setVisible(false));
    this.recObjs.forEach(r => { if (r.obj.active) { r.obj.setVisible(false); if (r.obj.fuse) r.obj.fuse.setVisible(false); if (r.obj.badge) r.obj.badge.setVisible(false); } });
    this.ghosts = this.recObjs.map(r => this.add.image(0, 0, r.key).setDepth(r.depth).setVisible(false));
    const ui = this.add.container(0, 0).setDepth(120);
    const bars = this.add.graphics(); bars.fillStyle(0x0B0F14, 0.82).fillRect(0, 0, W, 120).fillRect(0, H - 110, W, 110);
    const rec = this.add.circle(48, 60, 12, 0xE8483B); this.tweens.add({ targets: rec, alpha: 0.2, yoyo: true, repeat: -1, duration: 400 });
    const t1 = this.add.text(72, 60, `슬로 리플레이 ${REPLAY_SPEED}×`, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#FFD27A' }).setOrigin(0, 0.5);
    const t2 = this.add.text(W / 2, H - 55, '화면을 탭하면 결과로 돌아가요', { fontFamily: FONT, fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);
    const prog = this.add.graphics();
    const zone = this.add.zone(W / 2, H / 2, W, H).setInteractive();
    zone.on('pointerup', () => this.endReplay());
    ui.add([bars, rec, t1, t2, prog, zone]); this.rp.ui = ui; this.rp.prog = prog;
    this.stepReplay(0); this.exposeState();
  }
  stepReplay(dt) {
    const rp = this.rp; rp.t += dt * REPLAY_SPEED;
    if (rp.t >= rp.end) { rp.t = rp.end; if (!rp.done) { rp.done = true; this.time.delayedCall(450, () => { if (this.rp === rp) this.endReplay(); }); } }
    while (rp.i < this.rec.length - 1 && this.rec[rp.i + 1].t <= rp.t) rp.i++;
    while (rp.i > 0 && this.rec[rp.i].t > rp.t) rp.i--;
    const f = this.rec[rp.i]; if (!f) return;
    this.robot.applySnap(f.r);
    this.ghosts.forEach(gh => gh.setVisible(false));
    f.o.forEach(([i, x, y, r]) => this.ghosts[i].setVisible(true).setPosition(x, y).setRotation(r));
    while (rp.ev < this.recEvents.length && this.recEvents[rp.ev].t <= rp.t) { const e = this.recEvents[rp.ev++]; if (e.t >= rp.start) this.replayFx(e); }
    rp.prog.clear().fillStyle(0xffffff, 0.25).fillRoundedRect(40, 100, W - 80, 8, 4).fillStyle(0xFF8A1F, 1).fillRoundedRect(40, 100, (W - 80) * (rp.t - rp.start) / Math.max(1, rp.end - rp.start), 8, 4);
  }
  replayFx(e) {
    if (e.type === 'pop') { Sfx.pop(); const c = this.add.circle(e.x, e.y, 20, 0xFFE6B0, 0.9).setDepth(40); this.tweens.add({ targets: c, scale: 3, alpha: 0, duration: 900, onComplete: () => c.destroy() }); }
    else { Sfx.boom(); this.cameras.main.shake(500, 0.012); const c = this.add.circle(e.x, e.y, 30, 0xFFD95A, 0.9).setDepth(40); this.tweens.add({ targets: c, scale: 6, alpha: 0, duration: 950, onComplete: () => c.destroy() }); }
  }
  endReplay() {
    if (!this.replaying) return;
    this.replaying = false;
    this.rp.ui.destroy(); this.ghosts.forEach(g => g.destroy()); this.ghosts = null;
    this.recObjs.forEach(r => { if (r.obj.active) { r.obj.setVisible(true); if (r.obj.fuse) r.obj.fuse.setVisible(true); if (r.obj.badge) r.obj.badge.setVisible(true); } });
    this.children.list.filter(o => o.isSpeech).forEach(o => o.setVisible(true));
    (this.resultObjs || []).forEach(o => o.active && o.setVisible(true));
    this.matter.world.resume();
    this.robot.update(0);
    this.exposeState();
  }
  exposeState() {
    window.__STATE = { scene: 'Game', stage: this.st.id, state: this.state, taps: this.taps, stars: this.starsNow(),
      penalties: this.penalties, hintsLeft: this.hintsLeft, hintsUsed: this.hintsUsed, nextOrder: this.nextOrderId(), arrow: this.arrow ? this.arrow.obj.bid : null,
      replaying: this.replaying, recFrames: this.rec ? this.rec.length : 0, result: !!this.resultObjs,
      dbg: this.dbg, blocks: this.blocks.filter(b => b.active && b.removable).map(b => ({ id: b.bid, x: b.x, y: b.y, kind: b.kind })) };
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#8FD3FF',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'matter', matter: { gravity: { y: 1 }, runner: { isFixed: true, fps: 60 }, debug: /debug/.test(location.search), enableSleeping: false } },
  input: { activePointers: 2 },
  render: { antialias: true },
  scene: [TitleScene, SelectScene, GameScene],
});
window.__game = game;
window.__blockPos = () => (window.__STATE && window.__STATE.blocks) || [];
