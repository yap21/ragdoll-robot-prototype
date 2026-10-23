/* 러그돌 로봇 블록 제거 퍼즐 – 월드 1 프로토타입 v3 (Phaser 3 + Matter.js)
   v3: 로봇 = 단일 물리 바디(머리 원 + 몸통 볼록 다각형 복합 바디) + 고해상도 절차적 스프라이트 */
'use strict';
const W = 720, H = 1280, FLOOR_Y = 1180, HORIZON = 930;
const W_ = 720, H_ = 1280;
const Z = (() => { // 캔버스/텍스처 해상도 배율: 실제 화면 픽셀에 맞춤(1~2배)
  const q = /[?&]z=([\d.]+)/.exec(location.search); if (q) return Math.max(1, Math.min(2, +q[1]));
  const dpr = window.devicePixelRatio || 1, cw = Math.min(window.innerWidth, window.innerHeight * W_ / H_);
  return Math.max(1, Math.min(2, Math.round(cw * dpr / W_ * 4) / 4));
})();
const TS = Z;
const FONT = "'Jua','Gothic A1','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const C = {
  white: '#F7F4F1', shade: '#D9CFCB', edge: '#BFB2AD', band: '#F7C3C9', bandShade: '#E39FA8',
  screen: '#0B0F14', eye: 0xFFB224, eyeGlow: 0xFFD27A, link: 0xFFC861, ear: '#FBA0AE', earIn: '#FFE4E6',
  sockEmpty: '#FBF3EE', juice: 0xFF8A1F, juiceShade: 0xE0650F, ring: '#72C25E', ringShade: '#4E9A45',
  mint: '#6FD6C0', sky: '#8FD3FF', accent: '#FFD95A', bright: '#FFE6B0', navy: '#2F4D78'
};
const S = 1.25; // 로봇 크기 배율
const SAVE_KEY = 'ragdollRobotProto_v1';
const HINTS_PER_STAGE = 2;   // 힌트: 별/탭 비용 없음, 스테이지당 2회
const ORDER_PENALTY = 1;     // 순서 틀림: 블록은 안 빠지고 탭 +1
const REPLAY_MAX_PRE = 3.6, REPLAY_POST = 0.8, REPLAY_SPEED = 0.45;

/* 로봇 형상 (기준점 = 몸통 중심, 단위 px) */
const HEAD_CY = -71 * S, HEAD_RX = 38 * S, HEAD_RY = 36 * S, HEAD_COL_R = 34 * S;
const TORSO_V = [[-30, -27], [30, -27], [18, 27], [-18, 27]].map(([x, y]) => ({ x: x * S, y: y * S })); // 어깨:허리 = 1:0.6
const COL_V = [[-30, -29], [30, -29], [23, 32], [21, 46], [15, 55], [-15, 55], [-21, 46], [-23, 32]].map(([x, y]) => ({ x: x * S, y: y * S }));
const FOOT_BOTTOM = 55 * S;
const WIN = { cx: 0, cy: -5 * S, w: 12 * S, h: 20 * S }; // 주스 창
const FOOT = { x: 12 * S, y: 44 * S, rx: 11 * S, ry: 10 * S };
const ARM = { x: 41 * S, y: -5 * S, rx: 9 * S, ry: 12.5 * S };
const EAR = { x: 16 * S, y: -30 * S, w: 24 * S, h: 62 * S };

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
  boing() { this.tone(220, 520, 0.18, 'sine', 0.16); },
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

/* ---------------- 그리기 유틸 ---------------- */
function tex(scene, key, w, h, draw, ts = TS) {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, Math.ceil(w * ts), Math.ceil(h * ts)); const ctx = t.getContext();
  ctx.save(); ctx.scale(ts, ts); draw(ctx, w, h); ctx.restore(); t.refresh(); return key;
}
function img(scene, x, y, key) { return scene.add.image(x, y, key).setScale(1 / TS); }
function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function rpoly(ctx, pts, r) { // 둥근 모서리 다각형
  ctx.beginPath(); const n = pts.length;
  for (let i = 0; i < n; i++) { const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n]; const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }; if (i === 0) ctx.moveTo(m0.x, m0.y); const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }; ctx.arcTo(p1.x, p1.y, m2.x, m2.y, r); }
  ctx.closePath();
}
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); }
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
function mixc(a, b, t) { const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255; return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t); }
function specular(ctx, x, y, rx, ry, rot, a = 0.9) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function txt(scene, x, y, s, size, color, o = {}) {
  const t = scene.add.text(x, y, s, Object.assign({ fontFamily: FONT, fontSize: size + 'px', color, resolution: Z, padding: { x: 6, y: 6 } }, o.style || {}));
  t.setOrigin(o.ox == null ? 0.5 : o.ox, o.oy == null ? 0.5 : o.oy);
  if (o.stroke) t.setStroke(o.stroke, o.sw || 6);
  if (o.shadow) t.setShadow(0, o.shadow, o.shadowColor || 'rgba(30,30,60,0.35)', o.shadow * 1.6, !!o.stroke, true);
  if (o.depth != null) t.setDepth(o.depth);
  return t;
}

/* ---------------- 로봇 텍스처 (고해상도 절차적 렌더) ---------------- */
function makeRobotTextures(scene) {
  if (scene.textures.exists('r_head')) return;
  const RT = TS * 1.25; // 로봇은 조금 더 높은 해상도로
  // 머리: 펄 화이트 셸 + 유리 얼굴 화면 + 핑크 머리띠
  const HW = HEAD_RX * 2 + 16, HH = HEAD_RY * 2 + 16;
  const FW = 60 * S, FH = 40 * S, FY = 5 * S, FR = 18 * S;
  tex(scene, 'r_head', HW, HH, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, rx = HEAD_RX, ry = HEAD_RY;
    ell(ctx, cx, cy, rx + 1.3, ry + 1.3); ctx.fillStyle = C.edge; ctx.fill();
    let g = ctx.createRadialGradient(cx - rx * 0.32, cy - ry * 0.45, 2, cx - rx * 0.05, cy - ry * 0.05, rx * 1.2);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.42, '#FCFAF8'); g.addColorStop(0.75, C.white); g.addColorStop(1, C.shade);
    ell(ctx, cx, cy, rx, ry); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ell(ctx, cx, cy, rx, ry); ctx.clip();
    g = ctx.createLinearGradient(0, cy + ry * 0.15, 0, cy + ry); g.addColorStop(0, 'rgba(150,122,110,0)'); g.addColorStop(1, 'rgba(150,122,110,0.30)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,252,246,0.95)'; ctx.beginPath(); ctx.ellipse(cx - 2.2, cy - 2.2, rx - 1, ry - 1, 0, 0.02 * Math.PI, 0.6 * Math.PI); ctx.stroke(); // 림 라이트
    ctx.restore();
    // 얼굴 베젤(쏙 들어간 느낌) + 화면
    const fx = cx - FW / 2, fy = cy + FY - FH / 2;
    g = ctx.createLinearGradient(0, fy - 4, 0, fy + FH + 4); g.addColorStop(0, '#C9BDB8'); g.addColorStop(0.5, '#E6DDD9'); g.addColorStop(1, '#FFFFFF');
    rr(ctx, fx - 3.5, fy - 3.5, FW + 7, FH + 7, FR + 3.5); ctx.fillStyle = g; ctx.fill();
    g = ctx.createLinearGradient(0, fy, 0, fy + FH); g.addColorStop(0, '#222B37'); g.addColorStop(0.35, '#121821'); g.addColorStop(1, '#05070A');
    rr(ctx, fx, fy, FW, FH, FR); ctx.fillStyle = g; ctx.fill();
    ctx.save(); rr(ctx, fx, fy, FW, FH, FR); ctx.clip();
    g = ctx.createRadialGradient(cx, fy + FH * 0.55, 2, cx, fy + FH * 0.55, FW * 0.6); g.addColorStop(0, 'rgba(60,40,20,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, FH);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; rr(ctx, fx, fy, FW, FH, FR); ctx.stroke();
    ctx.restore();
    // 머리띠 (머리 윤곽을 따라 가는 두툼한 밴드)
    ctx.save(); ell(ctx, cx, cy, rx + 2, ry + 2); ctx.clip();
    const bandArc = (dy, lw, col) => { ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(cx, cy + 3 * S + dy, rx * 0.985, ry * 0.97, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); };
    ctx.shadowColor = 'rgba(120,70,70,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    bandArc(0.5, 8.5 * S, C.bandShade); ctx.shadowColor = 'transparent';
    bandArc(-0.6, 6.4 * S, C.band);
    bandArc(-2.2 * S, 1.6, 'rgba(255,255,255,0.75)');
    // 귀 뿌리 탭
    [-1, 1].forEach(sd => { const x = cx + sd * EAR.x, y = cy - ry * 0.86; ell(ctx, x, y + 2, 7 * S, 4.5 * S); ctx.fillStyle = C.bandShade; ctx.fill(); ell(ctx, x, y + 1, 6 * S, 3.4 * S); ctx.fillStyle = C.band; ctx.fill(); });
    ctx.restore();
    specular(ctx, cx - rx * 0.45, cy - ry * 0.5, rx * 0.26, ry * 0.13, -0.65, 0.95);
    specular(ctx, cx + rx * 0.72, cy - ry * 0.1, rx * 0.06, ry * 0.12, 0.2, 0.6);
  }, RT);
  // 얼굴 유리 반사 (눈 위에 덮는 오버레이)
  tex(scene, 'r_faceref', HW, HH, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, fx = cx - FW / 2, fy = cy + FY - FH / 2;
    ctx.save(); rr(ctx, fx, fy, FW, FH, FR); ctx.clip();
    let g = ctx.createLinearGradient(fx, fy, fx + FW * 0.6, fy + FH * 0.7); g.addColorStop(0, 'rgba(255,255,255,0.30)'); g.addColorStop(0.45, 'rgba(255,255,255,0.08)'); g.addColorStop(0.46, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx + FW * 0.25, fy - FH * 0.05, FW * 0.55, FH * 0.42, -0.25, 0, Math.PI * 2); ctx.fill();
    specular(ctx, fx + FW * 0.2, fy + FH * 0.2, 8, 3.2, -0.5, 0.75);
    specular(ctx, fx + FW * 0.84, fy + FH * 0.8, 4, 2, -0.5, 0.35);
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; rr(ctx, fx + 1.5, fy + 1.5, FW - 3, FH - 3, FR - 1.5); ctx.stroke();
    ctx.restore();
  }, RT);
  // 토끼 귀 (털 느낌)
  tex(scene, 'r_ear', EAR.w + 10, EAR.h + 10, (ctx, w, h) => {
    const R = rng(11), cx = w / 2, cy = h / 2, rx = EAR.w / 2 - 1, ry = EAR.h / 2 - 1;
    // 털 가장자리
    for (let i = 0; i < 260; i++) { const a = R() * Math.PI * 2, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry, l = 1.5 + R() * 3.2;
      ctx.strokeStyle = ['#FBA0AE', '#FFB7C2', '#EE8C9C'][i % 3]; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * 1.5, py - Math.sin(a) * 1.5); ctx.lineTo(px + Math.cos(a + (R() - 0.5) * 0.6) * l, py + Math.sin(a + (R() - 0.5) * 0.6) * l); ctx.stroke(); }
    ctx.globalAlpha = 1;
    let g = ctx.createRadialGradient(cx - rx * 0.4, cy - ry * 0.4, 1, cx, cy, ry * 1.05); g.addColorStop(0, '#FFC4CD'); g.addColorStop(0.55, C.ear); g.addColorStop(1, '#E7899A');
    ell(ctx, cx, cy, rx, ry); ctx.fillStyle = g; ctx.fill();
    // 안쪽 귀
    g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry); g.addColorStop(0, '#FFF0F1'); g.addColorStop(0.6, C.earIn); g.addColorStop(1, '#F9C9D0');
    ell(ctx, cx + 0.5, cy + 3 * S, rx * 0.5, ry * 0.72); ctx.fillStyle = g; ctx.fill();
    // 결 따라 털 스트로크
    ctx.save(); ell(ctx, cx, cy, rx, ry); ctx.clip();
    for (let i = 0; i < 160; i++) { const px = cx + (R() - 0.5) * rx * 1.9, py = cy + (R() - 0.5) * ry * 1.9, l = 2 + R() * 3.5;
      ctx.strokeStyle = R() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(200,90,110,0.18)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (px - cx) * 0.08, py - l); ctx.stroke(); }
    g = ctx.createLinearGradient(0, cy + ry * 0.4, 0, cy + ry); g.addColorStop(0, 'rgba(160,70,90,0)'); g.addColorStop(1, 'rgba(160,70,90,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    specular(ctx, cx - rx * 0.35, cy - ry * 0.55, rx * 0.35, ry * 0.12, -1.3, 0.5);
  }, RT);
  // 몸통: 역사다리꼴 + 목 링 + 쏙 들어간 주스 창
  const BW = 64 * S + 16, BH = 66 * S + 16;
  tex(scene, 'r_torso', BW, BH, (ctx, w, h) => {
    const ox = w / 2, oy = h / 2;
    const pts = TORSO_V.map(p => ({ x: ox + p.x, y: oy + p.y }));
    const path = () => rpoly(ctx, pts, 11 * S);
    ctx.save(); ctx.translate(0, 0); path(); ctx.lineWidth = 2.6; ctx.strokeStyle = C.edge; ctx.stroke(); ctx.restore();
    let g = ctx.createLinearGradient(ox - 30 * S, 0, ox + 30 * S, 0); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.45, '#FAF7F5'); g.addColorStop(0.8, C.white); g.addColorStop(1, C.shade);
    path(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); path(); ctx.clip();
    g = ctx.createLinearGradient(0, oy - 27 * S, 0, oy + 27 * S); g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(150,122,110,0.32)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    g = ctx.createRadialGradient(ox, oy - 27 * S, 2, ox, oy - 27 * S, 28 * S); g.addColorStop(0, 'rgba(120,95,85,0.35)'); g.addColorStop(1, 'rgba(120,95,85,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); // 목 아래 AO
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,252,246,0.9)'; ctx.beginPath(); ctx.moveTo(pts[1].x - 3, pts[1].y + 10 * S); ctx.lineTo(pts[2].x - 3, pts[2].y - 6 * S); ctx.stroke(); // 림 라이트
    ctx.restore();
    // 목 링
    const ry0 = oy - 28 * S;
    ell(ctx, ox, ry0 + 1.5 * S, 25 * S, 5.2 * S); ctx.fillStyle = C.ringShade; ctx.fill();
    g = ctx.createLinearGradient(0, ry0 - 4 * S, 0, ry0 + 3 * S); g.addColorStop(0, '#A6E08F'); g.addColorStop(0.5, C.ring); g.addColorStop(1, '#5DAA4E');
    ell(ctx, ox, ry0, 24.5 * S, 4.2 * S); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(ox, ry0 - 0.6 * S, 20 * S, 2.6 * S, 0, Math.PI * 1.15, Math.PI * 1.7); ctx.stroke();
    // 주스 창 소켓
    const sx = ox + WIN.cx - WIN.w / 2, sy = oy + WIN.cy - WIN.h / 2, cr = WIN.w / 2;
    g = ctx.createLinearGradient(0, sy - 3, 0, sy + WIN.h + 3); g.addColorStop(0, '#BFB2AD'); g.addColorStop(0.5, '#E3DAD6'); g.addColorStop(1, '#FFFFFF');
    rr(ctx, sx - 3.2, sy - 3.2, WIN.w + 6.4, WIN.h + 6.4, cr + 3.2); ctx.fillStyle = g; ctx.fill();
    rr(ctx, sx - 1, sy - 1, WIN.w + 2, WIN.h + 2, cr + 1); ctx.fillStyle = '#A99C97'; ctx.fill();
    g = ctx.createLinearGradient(0, sy, 0, sy + WIN.h); g.addColorStop(0, '#E9DED8'); g.addColorStop(0.25, C.sockEmpty); g.addColorStop(1, C.sockEmpty);
    rr(ctx, sx, sy, WIN.w, WIN.h, cr); ctx.fillStyle = g; ctx.fill();
    specular(ctx, ox - 15 * S, oy - 15 * S, 9 * S, 4 * S, -0.5, 0.85);
  }, RT);
  // 주스 창 유리 하이라이트
  tex(scene, 'r_glass', WIN.w + 4, WIN.h + 4, (ctx, w, h) => {
    const sx = 2, sy = 2, cr = WIN.w / 2;
    ctx.save(); rr(ctx, sx, sy, WIN.w, WIN.h, cr); ctx.clip();
    const g = ctx.createLinearGradient(sx, 0, sx + WIN.w, 0); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.36, 'rgba(255,255,255,0.0)'); g.addColorStop(0.8, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.3)');
    ctx.fillStyle = g; ctx.fillRect(sx, sy + 3, WIN.w, WIN.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ell(ctx, sx + WIN.w * 0.68, sy + 4.5, 1.6, 1.6); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(90,60,40,0.25)'; rr(ctx, sx + 0.5, sy + 0.5, WIN.w - 1, WIN.h - 1, cr); ctx.stroke();
    ctx.restore();
  }, RT);
  const ovalTex = (key, rx, ry) => tex(scene, key, rx * 2 + 8, ry * 2 + 8, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ell(ctx, cx, cy, rx + 1, ry + 1); ctx.fillStyle = C.edge; ctx.fill();
    let g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 1, cx, cy, Math.max(rx, ry) * 1.1); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.55, C.white); g.addColorStop(1, C.shade);
    ell(ctx, cx, cy, rx, ry); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ell(ctx, cx, cy, rx, ry); ctx.clip(); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,252,246,0.9)'; ctx.beginPath(); ctx.ellipse(cx - 1.6, cy - 1.6, rx - 0.8, ry - 0.8, 0, 0.05 * Math.PI, 0.55 * Math.PI); ctx.stroke(); ctx.restore();
    specular(ctx, cx - rx * 0.35, cy - ry * 0.42, rx * 0.4, ry * 0.2, -0.6, 0.9);
  }, RT);
  ovalTex('r_arm', ARM.rx, ARM.ry); ovalTex('r_foot', FOOT.rx, FOOT.ry);
  // 공통: 글로우, 그림자
  tex(scene, 'glow', 64, 64, (ctx, w, h) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
  tex(scene, 'shadow', 140, 36, (ctx, w, h) => { ctx.save(); ctx.scale(1, h / w); const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(70,40,40,0.42)'); g.addColorStop(0.5, 'rgba(70,40,40,0.22)'); g.addColorStop(1, 'rgba(70,40,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
}

/* ---------------- 블록 텍스처 (베벨 + 재질 + 접지 그림자) ---------------- */
const PAD = 14;
function woodFace(ctx, x, y, w, h, r, R, light) {
  rr(ctx, x, y, w, h, r);
  let g = ctx.createLinearGradient(0, y, 0, y + h);
  if (light) { g.addColorStop(0, '#E39A5E'); g.addColorStop(0.5, '#C97640'); g.addColorStop(1, '#A65B2D'); }
  else { g.addColorStop(0, '#D98149'); g.addColorStop(0.5, '#BD6434'); g.addColorStop(1, '#984A22'); }
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  const horiz = w >= h, L = horiz ? w : h, Wd = horiz ? h : w;
  for (let i = 0; i < Wd / 3.2; i++) { // 나뭇결
    const o = (i + R() * 0.8) * 3.2, amp = 1 + R() * 2.5, ph = R() * 6;
    ctx.strokeStyle = R() < 0.25 ? 'rgba(255,210,160,0.16)' : `rgba(90,35,12,${0.10 + R() * 0.16})`; ctx.lineWidth = 0.7 + R() * 1.3;
    ctx.beginPath();
    for (let t = 0; t <= L; t += 8) { const d = o + Math.sin(t / (30 + i * 3) + ph) * amp; const px = horiz ? x + t : x + d, py = horiz ? y + d : y + t; t ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  if (L > 90 && Wd > 30) { const kx = horiz ? x + L * (0.25 + R() * 0.5) : x + Wd * 0.5, ky = horiz ? y + Wd * 0.5 : y + L * (0.25 + R() * 0.5);
    for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(90,35,12,${0.35 - k * 0.08})`; ctx.lineWidth = 1.2; ell(ctx, kx, ky, (horiz ? 9 : 4) + k * 3, (horiz ? 4 : 9) + k * 3); ctx.stroke(); } }
  // 베벨
  g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,225,190,0.75)'); g.addColorStop(0.12, 'rgba(255,225,190,0)'); g.addColorStop(0.85, 'rgba(60,20,5,0)'); g.addColorStop(1, 'rgba(60,20,5,0.45)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(255,225,190,0.25)'); g.addColorStop(0.06, 'rgba(255,225,190,0)'); g.addColorStop(0.94, 'rgba(60,20,5,0)'); g.addColorStop(1, 'rgba(60,20,5,0.3)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,235,210,0.55)'; rr(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2)); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(75,30,10,0.75)'; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
}
function bolt(ctx, x, y, r) { let g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r); g.addColorStop(0, '#E6E3E0'); g.addColorStop(0.6, '#8D8682'); g.addColorStop(1, '#4E4845'); ell(ctx, x, y + 0.8, r, r); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ell(ctx, x, y, r, r); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(40,35,32,0.6)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x - r * 0.55, y + r * 0.2); ctx.lineTo(x + r * 0.55, y - r * 0.2); ctx.stroke(); }
function stoneFace(ctx, x, y, w, h, r, R) {
  rr(ctx, x, y, w, h, r);
  let g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h); g.addColorStop(0, '#B4ADA9'); g.addColorStop(0.5, '#979090'); g.addColorStop(1, '#7B7372');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  for (let i = 0; i < w * h / 22; i++) { ctx.fillStyle = R() < 0.5 ? `rgba(255,255,255,${R() * 0.12})` : `rgba(40,30,30,${R() * 0.14})`; ctx.fillRect(x + R() * w, y + R() * h, 1 + R() * 1.6, 1 + R() * 1.6); }
  for (let i = 0; i < Math.max(1, (w * h) / 9000); i++) { // 얼룩/긁힘
    const px = x + R() * w, py = y + R() * h; const gg = ctx.createRadialGradient(px, py, 0, px, py, 12 + R() * 20); gg.addColorStop(0, 'rgba(90,70,60,0.18)'); gg.addColorStop(1, 'rgba(90,70,60,0)'); ctx.fillStyle = gg; ctx.fillRect(px - 40, py - 40, 80, 80); }
  ctx.strokeStyle = 'rgba(60,50,48,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); const cx0 = x + w * (0.3 + R() * 0.3); ctx.moveTo(cx0, y + 6); ctx.lineTo(cx0 + 6, y + Math.min(h * 0.18, 30)); ctx.lineTo(cx0 + 1, y + Math.min(h * 0.3, 48)); ctx.stroke();
  // 패널 홈(긴 블록)
  if (h > 140 && w >= 50) { ctx.lineWidth = 2; for (let yy = y + 120; yy < y + h - 40; yy += 120) { ctx.strokeStyle = 'rgba(50,42,40,0.35)'; ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.lineTo(x + w - 4, yy); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(x + 4, yy + 2); ctx.lineTo(x + w - 4, yy + 2); ctx.stroke(); } }
  if (w > 140 && h >= 36) { ctx.lineWidth = 2; for (let xx = x + 90; xx < x + w - 40; xx += 90) { ctx.strokeStyle = 'rgba(50,42,40,0.35)'; ctx.beginPath(); ctx.moveTo(xx, y + 4); ctx.lineTo(xx, y + h - 4); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(xx + 2, y + 4); ctx.lineTo(xx + 2, y + h - 4); ctx.stroke(); } }
  g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(Math.min(0.25, 8 / h), 'rgba(255,255,255,0)'); g.addColorStop(Math.max(0.75, 1 - 8 / h), 'rgba(30,20,20,0)'); g.addColorStop(1, 'rgba(30,20,20,0.45)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(Math.min(0.3, 7 / w), 'rgba(255,255,255,0)'); g.addColorStop(Math.max(0.7, 1 - 7 / w), 'rgba(30,20,20,0)'); g.addColorStop(1, 'rgba(30,20,20,0.35)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; rr(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2)); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(45,38,36,0.8)'; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  const b = Math.min(4.5, Math.min(w, h) / 7), m = b + 5;
  [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]].forEach(([bx, by]) => bolt(ctx, bx, by, b));
}
function dropShadow(ctx, fn, blur = 12, oy = 6, a = 0.38) { ctx.save(); ctx.shadowColor = `rgba(70,35,30,${a})`; ctx.shadowBlur = blur * TS; ctx.shadowOffsetY = oy * TS; fn(); ctx.restore(); }
function blockTex(scene, t, w, h) {
  const key = `${t}_${w}_${h}`; const R = rng(hashStr(key));
  return tex(scene, key, w + PAD * 2, h + PAD * 2, (ctx) => {
    const x = PAD, y = PAD;
    if (t === 'wood' || t === 'plank') {
      const r = Math.min(t === 'plank' ? 9 : 11, h / 3, w / 3);
      dropShadow(ctx, () => { rr(ctx, x, y, w, h, r); ctx.fillStyle = '#7a3c1a'; ctx.fill(); });
      woodFace(ctx, x, y, w, h, r, R, t === 'plank');
      if (t === 'plank') [x + 12, x + w - 12].forEach(nx => bolt(ctx, nx, y + h / 2, 3.2));
    } else if (t === 'stone') {
      const r = Math.min(10, w / 4, h / 4);
      dropShadow(ctx, () => { rr(ctx, x, y, w, h, r); ctx.fillStyle = '#555'; ctx.fill(); });
      stoneFace(ctx, x, y, w, h, r, R);
    } else if (t === 'fulcrum') {
      const path = () => rpoly(ctx, [{ x: x + w / 2, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }], 10);
      dropShadow(ctx, () => { path(); ctx.fillStyle = '#555'; ctx.fill(); });
      path(); let g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#C5BFBC'); g.addColorStop(0.5, '#9C9593'); g.addColorStop(1, '#6F6866'); ctx.fillStyle = g; ctx.fill();
      ctx.save(); path(); ctx.clip(); for (let i = 0; i < w * h / 30; i++) { ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(30,20,20,0.1)'; ctx.fillRect(x + R() * w, y + R() * h, 1.4, 1.4); }
      g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(30,20,20,0.35)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(45,38,36,0.8)'; path(); ctx.stroke();
      bolt(ctx, x + w / 2, y + 16, 6); bolt(ctx, x + 14, y + h - 10, 3.5); bolt(ctx, x + w - 14, y + h - 10, 3.5);
    } else if (t === 'cushion') { // 마카롱 모양 푹신한 매트
      const ch = h + 6, cy0 = y - 2;
      dropShadow(ctx, () => { rr(ctx, x, cy0, w, ch, ch / 2); ctx.fillStyle = '#3E9C8A'; ctx.fill(); }, 14, 7, 0.4);
      rr(ctx, x, cy0, w, ch, ch / 2); let g = ctx.createLinearGradient(0, cy0, 0, cy0 + ch); g.addColorStop(0, '#A8EEDF'); g.addColorStop(0.35, C.mint); g.addColorStop(0.62, '#52BBA6'); g.addColorStop(0.7, '#6FD6C0'); g.addColorStop(1, '#3E9C8A'); ctx.fillStyle = g; ctx.fill();
      ctx.save(); rr(ctx, x, cy0, w, ch, ch / 2); ctx.clip();
      g = ctx.createRadialGradient(x + w * 0.35, cy0 + ch * 0.15, 2, x + w * 0.35, cy0 + ch * 0.15, w * 0.45); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x, cy0, w, ch * 0.6);
      ctx.strokeStyle = 'rgba(40,120,105,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, cy0 + ch * 0.64); ctx.quadraticCurveTo(x + w / 2, cy0 + ch * 0.7, x + w - 6, cy0 + ch * 0.64); ctx.stroke();
      ctx.strokeStyle = 'rgba(220,255,248,0.55)'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(x + 14, cy0 + ch * 0.56); ctx.quadraticCurveTo(x + w / 2, cy0 + ch * 0.62, x + w - 14, cy0 + ch * 0.56); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      specular(ctx, x + w * 0.3, cy0 + ch * 0.2, w * 0.18, 4, -0.05, 0.8);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(30,110,95,0.6)'; rr(ctx, x + 0.5, cy0 + 0.5, w - 1, ch - 1, ch / 2); ctx.stroke();
    } else if (t === 'bomb') {
      const r = (w - 12) / 2, cx = x + w / 2, cy = y + h / 2 + 4;
      dropShadow(ctx, () => { ell(ctx, cx, cy, r, r); ctx.fillStyle = '#000'; ctx.fill(); }, 10, 6, 0.45);
      let g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 1, cx, cy, r * 1.05); g.addColorStop(0, '#5C636E'); g.addColorStop(0.35, '#262A31'); g.addColorStop(1, '#08090B');
      ell(ctx, cx, cy, r, r); ctx.fillStyle = g; ctx.fill();
      ctx.save(); ell(ctx, cx, cy, r, r); ctx.clip(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(150,180,230,0.35)'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, r, 0.05 * Math.PI, 0.6 * Math.PI); ctx.stroke(); ctx.restore();
      specular(ctx, cx - r * 0.38, cy - r * 0.42, r * 0.38, r * 0.2, -0.7, 0.85);
      // 캡
      g = ctx.createLinearGradient(cx - 8, 0, cx + 8, 0); g.addColorStop(0, '#6B717B'); g.addColorStop(0.4, '#B9BEC6'); g.addColorStop(1, '#3B3F46');
      rr(ctx, cx - 8, cy - r - 7, 16, 10, 3); ctx.fillStyle = g; ctx.fill();
      // 심지
      ctx.lineCap = 'round'; ctx.strokeStyle = '#6E5638'; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(cx, cy - r - 6); ctx.quadraticCurveTo(cx + 3, cy - r - 15, cx + 10, cy - r - 14); ctx.stroke();
      ctx.strokeStyle = '#D9B47E'; ctx.lineWidth = 2.6; ctx.stroke();
    } else if (t === 'ice') {
      dropShadow(ctx, () => { rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(40,90,160,0.6)'; ctx.fill(); }, 10, 5, 0.3);
      rr(ctx, x, y, w, h, 10); let g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(210,240,255,0.95)'); g.addColorStop(0.5, 'rgba(120,190,250,0.8)'); g.addColorStop(1, 'rgba(70,140,230,0.9)'); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; rr(ctx, x + 5, y + 5, w - 10, h - 10, 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h * 0.7); ctx.lineTo(x + w * 0.45, y + h * 0.35); ctx.lineTo(x + w * 0.7, y + h * 0.55); ctx.stroke();
      specular(ctx, x + w * 0.3, y + h * 0.22, w * 0.25, h * 0.08, -0.5, 0.9);
    } else if (t === 'balloon') {
      const cx = x + w / 2, cy = y + w / 2, r = w / 2 - 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy + r + 4); ctx.bezierCurveTo(cx - 10, cy + r + 30, cx + 10, cy + r + 50, cx, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.bezierCurveTo(cx + r * 1.35, cy - r, cx + r * 1.1, cy + r * 0.9, cx, cy + r * 1.1); ctx.bezierCurveTo(cx - r * 1.1, cy + r * 0.9, cx - r * 1.35, cy - r, cx, cy - r); ctx.closePath();
      let g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 2, cx, cy, r * 1.2); g.addColorStop(0, '#FF7A7A'); g.addColorStop(0.5, '#E3262E'); g.addColorStop(1, '#8E0E16'); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#B5161E'; ctx.beginPath(); ctx.moveTo(cx - 5, cy + r * 1.18); ctx.lineTo(cx + 5, cy + r * 1.18); ctx.lineTo(cx, cy + r * 1.05); ctx.fill();
      specular(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.18, -0.8, 0.9);
    }
  });
}

/* ---------------- 배경 (월드 1 · 놀이공원, 레이어드) ---------------- */
function makeBgTextures(scene) {
  if (scene.textures.exists('bg_w1')) return;
  tex(scene, 'bg_w1', W, H, (ctx) => {
    let g = ctx.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, '#5BB8F5'); g.addColorStop(0.45, '#8FD3FF'); g.addColorStop(0.8, '#CDEBFA'); g.addColorStop(1, '#FBE3D6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON + 40);
    // 해 빛무리
    g = ctx.createRadialGradient(560, 300, 10, 560, 300, 420); g.addColorStop(0, 'rgba(255,250,225,0.85)'); g.addColorStop(0.25, 'rgba(255,240,210,0.35)'); g.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON);
    // 지평선 근처 분홍빛 대기
    g = ctx.createLinearGradient(0, HORIZON - 260, 0, HORIZON); g.addColorStop(0, 'rgba(255,190,200,0)'); g.addColorStop(1, 'rgba(255,200,205,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, HORIZON - 260, W, 260);
    // 먼 산 (채도 낮은 세이지)
    const hill = (pts, c1, c2, y0) => { ctx.beginPath(); ctx.moveTo(-10, HORIZON + 10); pts.forEach(([x, y, cx, cy]) => ctx.quadraticCurveTo(cx, cy, x, y)); ctx.lineTo(W + 10, HORIZON + 10); ctx.closePath(); const gg = ctx.createLinearGradient(0, y0, 0, HORIZON); gg.addColorStop(0, c1); gg.addColorStop(1, c2); ctx.fillStyle = gg; ctx.fill(); };
    hill([[180, 820, 60, 760], [420, 850, 300, 790], [730, 800, 600, 860]], '#C7DDD3', '#E5E4DA', 760);
    hill([[-10, 760, -10, 760], [150, 880, 90, 790], [330, HORIZON + 10, 260, 900]], '#A9CDB4', '#CFE0C9', 760);
    hill([[440, HORIZON + 10, 440, HORIZON + 10], [620, 860, 520, 870], [730, 840, 690, 830]], '#A9CDB4', '#CFE0C9', 820);
    // 나무 실루엣
    const tree = (x, y, s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - 18 * s, 18 * s, 0, Math.PI * 2); ctx.arc(x - 12 * s, y - 8 * s, 13 * s, 0, Math.PI * 2); ctx.arc(x + 12 * s, y - 8 * s, 13 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 2 * s, y - 4 * s, 4 * s, 10 * s); };
    [[40, 905, 1.2], [92, 915, 0.9], [640, 900, 1.3], [690, 912, 1]].forEach(([x, y, s]) => tree(x, y, s, 'rgba(120,170,135,0.75)'));
    // 바닥 평면 (피치색, 원근)
    g = ctx.createLinearGradient(0, HORIZON, 0, FLOOR_Y); g.addColorStop(0, '#F6D7BE'); g.addColorStop(0.5, '#F7CFAE'); g.addColorStop(1, '#F2BE95');
    ctx.fillStyle = g; ctx.fillRect(0, HORIZON, W, FLOOR_Y - HORIZON + 2);
    ctx.strokeStyle = 'rgba(214,150,110,0.25)'; ctx.lineWidth = 1.5; // 원근 타일 선
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 30, HORIZON); ctx.lineTo(W / 2 + i * 150, FLOOR_Y); ctx.stroke(); }
    for (let k = 1; k < 7; k++) { const y = HORIZON + (FLOOR_Y - HORIZON) * Math.pow(k / 7, 1.6); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    g = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 40); g.addColorStop(0, 'rgba(255,240,230,0.8)'); g.addColorStop(1, 'rgba(255,240,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, HORIZON, W, 40);
    // 앞면(바닥 밑 단면)
    g = ctx.createLinearGradient(0, FLOOR_Y, 0, H); g.addColorStop(0, '#E9A877'); g.addColorStop(1, '#C8805A'); ctx.fillStyle = g; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    ctx.fillStyle = C.bright; ctx.fillRect(0, FLOOR_Y - 2, W, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(0, FLOOR_Y - 2, W, 3);
    ctx.fillStyle = 'rgba(150,80,50,0.25)'; ctx.fillRect(0, FLOOR_Y + 10, W, 5);
    for (let x = 0; x < W; x += 72) { rr(ctx, x + 10, FLOOR_Y + 40, 52, 14, 7); ctx.fillStyle = 'rgba(255,230,200,0.25)'; ctx.fill(); }
    // 비네트
    g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.48, H * 0.78); g.addColorStop(0, 'rgba(60,40,80,0)'); g.addColorStop(1, 'rgba(60,40,80,0.22)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
  // 관람차 (천천히 회전)
  tex(scene, 'bg_wheel', 300, 300, (ctx) => {
    const cx = 150, cy = 150, R = 128;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#FFB7C6'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, R - 14, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.fillStyle = ['#FFD95A', '#FFFFFF', '#FF9EB5'][i % 3]; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 10, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  });
  tex(scene, 'bg_wheelstand', 220, 220, (ctx) => { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#FFB7C6'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(110, 8); ctx.lineTo(40, 215); ctx.moveTo(110, 8); ctx.lineTo(180, 215); ctx.moveTo(70, 130); ctx.lineTo(150, 130); ctx.stroke(); });
  // 구름 (분홍빛 밑면)
  const cloud = (key, w, h, seed) => tex(scene, key, w, h, (ctx) => {
    const R = rng(seed); const blobs = []; const n = 6;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); blobs.push([w * (0.15 + t * 0.7), h * (0.62 - Math.sin(t * Math.PI) * 0.22) + (R() - 0.5) * 6, h * (0.22 + Math.sin(t * Math.PI) * 0.18 + R() * 0.05)]); }
    ctx.save(); ctx.filter = 'none';
    let g = ctx.createLinearGradient(0, h * 0.15, 0, h * 0.9); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, '#FFF4F4'); g.addColorStop(1, '#FAD3DA'); ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(230,150,170,0.35)'; ctx.shadowBlur = 8 * TS; ctx.shadowOffsetY = 3 * TS;
    rr(ctx, w * 0.12, h * 0.55, w * 0.76, h * 0.3, h * 0.15); ctx.fill();
    ctx.beginPath(); blobs.forEach(([x, y, r]) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }); ctx.fill();
    ctx.shadowColor = 'transparent'; rr(ctx, w * 0.12, h * 0.55, w * 0.76, h * 0.3, h * 0.15); ctx.fill();
    ctx.restore();
    specular(ctx, w * 0.4, h * 0.35, w * 0.2, h * 0.1, 0, 0.6);
  });
  cloud('cloud_a', 260, 110, 3); cloud('cloud_b', 190, 86, 7); cloud('cloud_c', 140, 64, 13);
}
function addBg(scene, opt = {}) {
  makeBgTextures(scene);
  scene.add.image(0, 0, 'bg_w1').setOrigin(0).setScale(1 / TS).setDepth(-20);
  const wheel = img(scene, 585, 735, 'bg_wheel').setDepth(-18);
  img(scene, 585, 850, 'bg_wheelstand').setDepth(-19);
  scene.tweens.add({ targets: wheel, rotation: Math.PI * 2, duration: 90000, repeat: -1 });
  const clouds = [['cloud_a', 120, 230, 0.10], ['cloud_b', 520, 150, 0.06], ['cloud_c', 330, 430, 0.14], ['cloud_b', 650, 560, 0.18], ['cloud_c', 60, 640, 0.22]]
    .map(([k, x, y, sp]) => { const c = img(scene, x, y, k).setDepth(-17).setAlpha(0.95); c.sp = sp; return c; });
  scene.events.on('update', (t, dt) => clouds.forEach(c => { c.x += c.sp * dt * 0.06; if (c.x - c.displayWidth / 2 > W + 20) c.x = -c.displayWidth / 2 - 20; }));
}

/* ---------------- UI 텍스처 ---------------- */
const NAVY = ['#3C5E8E', '#203A61', '#152842'];
function makeUiTextures(scene) {
  if (scene.textures.exists('ui_round')) return;
  // 유리 같은 남색 원형 버튼
  tex(scene, 'ui_round', 112, 112, (ctx, w, h) => {
    const cx = 56, cy = 54, r = 40;
    dropShadow(ctx, () => { ell(ctx, cx, cy + 4, r, r); ctx.fillStyle = '#16243a'; ctx.fill(); }, 10, 5, 0.45);
    ell(ctx, cx, cy, r + 3, r + 3); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    let g = ctx.createLinearGradient(0, cy - r, 0, cy + r); g.addColorStop(0, NAVY[0]); g.addColorStop(0.55, NAVY[1]); g.addColorStop(1, NAVY[2]);
    ell(ctx, cx, cy, r, r); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ell(ctx, cx, cy, r, r); ctx.clip();
    g = ctx.createLinearGradient(0, cy - r, 0, cy); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0.04)'); ctx.fillStyle = g; ell(ctx, cx, cy - r * 0.45, r * 0.85, r * 0.55); ctx.fill();
    g = ctx.createRadialGradient(cx, cy + r, 2, cx, cy + r, r); g.addColorStop(0, 'rgba(120,200,255,0.35)'); g.addColorStop(1, 'rgba(120,200,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
  // 남색 알약 (탭 카운터)
  tex(scene, 'ui_pill', 236, 92, (ctx, w, h) => {
    const x = 14, y = 12, pw = w - 28, ph = 62;
    dropShadow(ctx, () => { rr(ctx, x, y, pw, ph, ph / 2); ctx.fillStyle = '#16243a'; ctx.fill(); }, 10, 5, 0.4);
    rr(ctx, x - 3, y - 3, pw + 6, ph + 6, ph / 2 + 3); ctx.fillStyle = '#fff'; ctx.fill();
    let g = ctx.createLinearGradient(0, y, 0, y + ph); g.addColorStop(0, NAVY[0]); g.addColorStop(0.6, NAVY[1]); g.addColorStop(1, NAVY[2]); rr(ctx, x, y, pw, ph, ph / 2); ctx.fillStyle = g; ctx.fill();
    ctx.save(); rr(ctx, x, y, pw, ph, ph / 2); ctx.clip(); g = ctx.createLinearGradient(0, y, 0, y + ph / 2); g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0.03)'); ctx.fillStyle = g; rr(ctx, x + 8, y + 3, pw - 16, ph * 0.45, ph * 0.22); ctx.fill(); ctx.restore();
  });
  // 별 (주황 + 남색 테두리) / 빈 별
  const star = (key, R0, full) => tex(scene, key, R0 * 2 + 20, R0 * 2 + 20, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2 + 1;
    const path = (r) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.5 : r; pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }); } rpoly(ctx, pts, r * 0.12); };
    if (full) {
      dropShadow(ctx, () => { path(R0); ctx.fillStyle = '#152842'; ctx.fill(); }, 6, 3, 0.4);
      path(R0); ctx.fillStyle = '#1E3558'; ctx.fill();
      let g = ctx.createLinearGradient(0, cy - R0, 0, cy + R0); g.addColorStop(0, '#FFE07A'); g.addColorStop(0.45, '#FFB224'); g.addColorStop(1, '#F0861A');
      path(R0 * 0.8); ctx.fillStyle = g; ctx.fill();
      ctx.save(); path(R0 * 0.8); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy - R0 * 0.5); ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.fill(); ctx.restore();
      specular(ctx, cx - R0 * 0.18, cy - R0 * 0.32, R0 * 0.22, R0 * 0.1, -0.6, 0.9);
    } else {
      path(R0); ctx.fillStyle = 'rgba(30,53,88,0.55)'; ctx.fill();
      path(R0 * 0.8); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; path(R0 * 0.8); ctx.stroke();
    }
  });
  star('star_s', 26, true); star('star_s0', 26, false); star('star_l', 56, true); star('star_l0', 56, false); star('star_xs', 15, true); star('star_xs0', 15, false);
  // 결과 패널
  tex(scene, 'ui_panel', 600, 640, (ctx, w, h) => {
    const x = 20, y = 40, pw = w - 40, ph = h - 70;
    dropShadow(ctx, () => { rr(ctx, x, y, pw, ph, 48); ctx.fillStyle = '#1a2233'; ctx.fill(); }, 30, 14, 0.45);
    let g = ctx.createLinearGradient(0, y, 0, y + ph); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#F4ECE7'); rr(ctx, x, y, pw, ph, 48); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#E9DDD6'; rr(ctx, x + 12, y + 12, pw - 24, ph - 24, 38); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; rr(ctx, x + 2, y + 2, pw - 4, ph - 4, 46); ctx.stroke();
  });
  // 리본 헤더
  const ribbon = (key, c1, c2, c3) => tex(scene, key, 480, 130, (ctx, w, h) => {
    const y = 22, rh = 76;
    // 꼬리
    [-1, 1].forEach(sd => { ctx.beginPath(); const x0 = sd < 0 ? 18 : w - 18, x1 = sd < 0 ? 78 : w - 78; ctx.moveTo(x1, y + 18); ctx.lineTo(x0, y + 18); ctx.lineTo(x0 + sd * -22, y + 18 + rh / 2); ctx.lineTo(x0, y + 18 + rh); ctx.lineTo(x1, y + 18 + rh); ctx.closePath(); ctx.fillStyle = c3; ctx.fill(); });
    dropShadow(ctx, () => { rr(ctx, 56, y, w - 112, rh, 20); ctx.fillStyle = c2; ctx.fill(); }, 10, 5, 0.35);
    let g = ctx.createLinearGradient(0, y, 0, y + rh); g.addColorStop(0, c1); g.addColorStop(1, c2); rr(ctx, 56, y, w - 112, rh, 20); ctx.fillStyle = g; ctx.fill();
    ctx.save(); rr(ctx, 56, y, w - 112, rh, 20); ctx.clip(); g = ctx.createLinearGradient(0, y, 0, y + rh / 2); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(56, y, w - 112, rh / 2); ctx.restore();
    ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; rr(ctx, 66, y + 8, w - 132, rh - 16, 14); ctx.stroke(); ctx.setLineDash([]);
  });
  ribbon('ui_ribbon_win', '#8BE6D2', '#3FAF98', '#2E8D7A'); ribbon('ui_ribbon_fail', '#FFB8C8', '#E06E8C', '#B9516F');
  // 토스트
  tex(scene, 'ui_toast', 640, 120, (ctx, w, h) => { dropShadow(ctx, () => { rr(ctx, 10, 10, w - 20, h - 26, 40); ctx.fillStyle = '#111a28'; ctx.fill(); }, 14, 6, 0.4); let g = ctx.createLinearGradient(0, 10, 0, h - 16); g.addColorStop(0, 'rgba(46,72,112,0.95)'); g.addColorStop(1, 'rgba(22,38,64,0.95)'); rr(ctx, 10, 10, w - 20, h - 26, 40); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; rr(ctx, 12, 12, w - 24, h - 30, 38); ctx.stroke(); });
  // 파티클
  tex(scene, 'p_dot', 16, 16, (ctx) => { const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16); });
  tex(scene, 'p_chip', 14, 10, (ctx) => { rr(ctx, 1, 1, 12, 8, 2.5); const g = ctx.createLinearGradient(0, 0, 0, 10); g.addColorStop(0, '#E39A5E'); g.addColorStop(1, '#984A22'); ctx.fillStyle = g; ctx.fill(); });
  tex(scene, 'p_smoke', 64, 64, (ctx) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.55, 'rgba(240,235,235,0.5)'); g.addColorStop(1, 'rgba(240,235,235,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); });
  tex(scene, 'p_conf', 12, 18, (ctx) => { rr(ctx, 1, 1, 10, 16, 2); ctx.fillStyle = '#ffffff'; ctx.fill(); });
  tex(scene, 'p_spark', 24, 24, (ctx) => { ctx.translate(12, 12); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 3 : 12; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); });
  tex(scene, 'p_ring', 128, 128, (ctx) => { ctx.lineWidth = 8; const g = ctx.createRadialGradient(64, 64, 40, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); });
  // 힌트 화살표
  tex(scene, 'ui_arrow', 120, 100, (ctx) => {
    const pts = [[16, 34], [62, 34], [62, 14], [104, 50], [62, 86], [62, 66], [16, 66]].map(([x, y]) => ({ x, y }));
    dropShadow(ctx, () => { rpoly(ctx, pts, 6); ctx.fillStyle = '#B4500C'; ctx.fill(); }, 8, 4, 0.4);
    rpoly(ctx, pts, 6); ctx.lineWidth = 9; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.stroke();
    const g = ctx.createLinearGradient(0, 14, 0, 86); g.addColorStop(0, '#FFB45C'); g.addColorStop(0.5, '#FF8A1F'); g.addColorStop(1, '#E0650F'); rpoly(ctx, pts, 6); ctx.fillStyle = g; ctx.fill();
    specular(ctx, 44, 42, 24, 5, 0, 0.6);
  });
  // 자물쇠
  tex(scene, 'ui_lock', 70, 80, (ctx) => {
    ctx.lineWidth = 8; ctx.strokeStyle = '#8D97A6'; ctx.beginPath(); ctx.arc(35, 32, 15, Math.PI, 0); ctx.lineTo(50, 42); ctx.moveTo(20, 32); ctx.lineTo(20, 42); ctx.stroke();
    dropShadow(ctx, () => { rr(ctx, 12, 38, 46, 34, 9); ctx.fillStyle = '#556'; ctx.fill(); }, 6, 3, 0.35);
    const g = ctx.createLinearGradient(0, 38, 0, 72); g.addColorStop(0, '#C7CED8'); g.addColorStop(1, '#7E8899'); rr(ctx, 12, 38, 46, 34, 9); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#4A5160'; ell(ctx, 35, 52, 4.5, 4.5); ctx.fill(); ctx.fillRect(33, 52, 4, 10);
  });
}
// 광택 버튼 텍스처(크기/색별 캐시)
const BTN_COLORS = {
  orange: ['#FFB45C', '#FF8A1F', '#D9600D', '#FFFFFF'],
  green: ['#9BE07D', '#5DBB48', '#3E8D33', '#FFFFFF'],
  mint: ['#9FEBDB', '#4FC2AA', '#2E8D7A', '#FFFFFF'],
  pink: ['#FFC2D1', '#F08AA6', '#C45F7E', '#FFFFFF'],
  navy: ['#4C6FA3', '#2A4673', '#172C4C', '#FFFFFF'],
  yellow: ['#FFE68A', '#FFC93B', '#D99A16', '#6B3E08'],
  cream: ['#FFFFFF', '#F4ECE7', '#CFC0B8', '#3B3F4A'],
  gray: ['#E3E6EA', '#B8BEC7', '#8D95A1', '#5A606B'],
};
function btnTex(scene, w, h, col) {
  const key = `btn_${col}_${w}_${h}`; const [c1, c2, c3] = BTN_COLORS[col];
  const r = Math.min(h / 2, 34);
  return tex(scene, key, w + 28, h + 32, (ctx) => {
    const x = 14, y = 10;
    dropShadow(ctx, () => { rr(ctx, x, y + 6, w, h, r); ctx.fillStyle = '#1a2233'; ctx.fill(); }, 12, 6, 0.38);
    rr(ctx, x, y + 7, w, h, r); ctx.fillStyle = c3; ctx.fill(); // 3D 립
    rr(ctx, x - 1, y - 1, w + 2, h + 2, r + 1); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    let g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(0.55, c2); g.addColorStop(1, c3);
    rr(ctx, x + 2.5, y + 2.5, w - 5, h - 5, r - 2.5); ctx.fillStyle = g; ctx.fill();
    ctx.save(); rr(ctx, x + 2.5, y + 2.5, w - 5, h - 5, r - 2.5); ctx.clip();
    g = ctx.createLinearGradient(0, y, 0, y + h * 0.5); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
    rr(ctx, x + 10, y + 5, w - 20, h * 0.42, Math.min(r, h * 0.21)); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  });
}
function button(scene, x, y, w, h, label, cb, opt = {}) {
  const col = opt.color || 'orange';
  const c = scene.add.container(x, y).setDepth(opt.depth || 50);
  const bg = img(scene, 0, 0, btnTex(scene, w, h, col)); // 텍스처 패딩 보정
  bg.setOrigin((14 + w / 2) / (w + 28), (10 + h / 2) / (h + 32));
  c.add(bg);
  let t = null;
  if (label) {
    const tc = opt.text || BTN_COLORS[col][3];
    t = txt(scene, opt.icon ? 18 : 0, -2, label, opt.size || 34, tc, tc === '#FFFFFF' ? { stroke: 'rgba(0,0,0,0.18)', sw: 4, shadow: 2, shadowColor: 'rgba(0,0,0,0.25)' } : {});
    c.add(t);
  }
  if (opt.icon) { const ic = scene.add.graphics(); drawIcon(ic, opt.icon, label ? -w / 2 + 44 : 0, -2, opt.iconSize || 18, opt.text || BTN_COLORS[col][3]); c.add(ic); }
  c.setSize(w, h + 8).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { Sfx.init(); Sfx.tap(); scene.tweens.add({ targets: c, scale: 0.92, duration: 70, yoyo: true }); });
  c.on('pointerup', () => cb());
  c.label = t; c.ui = [x, y]; return c;
}
function roundBtn(scene, x, y, icon, cb, opt = {}) {
  makeUiTextures(scene);
  const c = scene.add.container(x, y).setDepth(opt.depth || 81);
  const bg = img(scene, 0, 2, 'ui_round'); const ic = scene.add.graphics(); drawIcon(ic, icon, 0, 0, opt.iconSize || 18, '#FFFFFF');
  c.add([bg, ic]); c.setSize(84, 84).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { Sfx.init(); Sfx.tap(); scene.tweens.add({ targets: c, scale: 0.9, duration: 70, yoyo: true }); });
  c.on('pointerup', () => cb()); c.ui = [x, y]; return c;
}
function drawIcon(g, icon, x, y, s, color) {
  const col = Phaser.Display.Color.HexStringToColor(color).color;
  g.fillStyle(col, 1); g.lineStyle(s * 0.36, col, 1);
  if (icon === 'pause') { g.fillRoundedRect(x - s * 0.62, y - s * 0.8, s * 0.42, s * 1.6, s * 0.16); g.fillRoundedRect(x + s * 0.2, y - s * 0.8, s * 0.42, s * 1.6, s * 0.16); }
  else if (icon === 'retry') { g.beginPath(); g.arc(x, y, s * 0.72, -Math.PI * 0.35, Math.PI * 1.35); g.strokePath(); const a = -Math.PI * 0.35, px = x + Math.cos(a) * s * 0.72, py = y + Math.sin(a) * s * 0.72; g.fillTriangle(px - s * 0.45, py - s * 0.2, px + s * 0.42, py - s * 0.3, px + s * 0.05, py + s * 0.5); }
  else if (icon === 'hint') { g.fillCircle(x, y - s * 0.22, s * 0.62); g.fillRoundedRect(x - s * 0.32, y + s * 0.22, s * 0.64, s * 0.5, s * 0.1); g.fillRoundedRect(x - s * 0.24, y + s * 0.78, s * 0.48, s * 0.2, s * 0.08); g.fillStyle(0x203A61, 1).fillRect(x - s * 0.06, y - s * 0.5, s * 0.12, s * 0.7); }
  else if (icon === 'play') { g.fillTriangle(x - s * 0.5, y - s * 0.75, x - s * 0.5, y + s * 0.75, x + s * 0.8, y); }
  else if (icon === 'home') { g.fillTriangle(x - s * 0.9, y - s * 0.05, x + s * 0.9, y - s * 0.05, x, y - s * 0.9); g.fillRect(x - s * 0.6, y - s * 0.1, s * 1.2, s * 0.9); }
  else if (icon === 'replay') { g.fillRoundedRect(x - s * 0.85, y - s * 0.6, s * 1.15, s * 1.2, s * 0.2); g.fillTriangle(x + s * 0.35, y - s * 0.1, x + s * 0.95, y - s * 0.55, x + s * 0.95, y + s * 0.45); }
  else if (icon === 'next') { g.fillTriangle(x - s * 0.7, y - s * 0.7, x - s * 0.7, y + s * 0.7, x + s * 0.2, y); g.fillTriangle(x, y - s * 0.7, x, y + s * 0.7, x + s * 0.9, y); }
}
function starImg(scene, x, y, on, size = 's') { makeUiTextures(scene); return img(scene, x, y, on ? 'star_' + size : 'star_' + size + '0'); }

/* ---------------- 파티클 ---------------- */
function makeFx(scene) {
  makeUiTextures(scene);
  const sc = 1 / TS;
  const fx = {};
  fx.chips = scene.add.particles(0, 0, 'p_chip', { emitting: false, lifespan: 700, speed: { min: 120, max: 380 }, angle: { min: 200, max: 340 }, gravityY: 900, rotate: { min: 0, max: 360 }, scale: { start: 1.1 * sc, end: 0.6 * sc }, alpha: { start: 1, end: 0 } }).setDepth(30);
  fx.dust = scene.add.particles(0, 0, 'p_smoke', { emitting: false, lifespan: 600, speed: { min: 40, max: 140 }, angle: { min: 180, max: 360 }, scale: { start: 0.35 * sc, end: 0.9 * sc }, alpha: { start: 0.65, end: 0 }, tint: 0xFFF1E0 }).setDepth(29);
  fx.smoke = scene.add.particles(0, 0, 'p_smoke', { emitting: false, lifespan: 900, speed: { min: 60, max: 260 }, scale: { start: 0.8 * sc, end: 2.2 * sc }, alpha: { start: 0.8, end: 0 }, tint: [0xFFE2B0, 0xFFFFFF, 0xD9CFCB] }).setDepth(41);
  fx.spark = scene.add.particles(0, 0, 'p_spark', { emitting: false, lifespan: 500, speed: { min: 200, max: 520 }, scale: { start: 0.9 * sc, end: 0 * sc }, tint: [0xFFD27A, 0xFFB224, 0xFFFFFF], blendMode: 'ADD' }).setDepth(42);
  fx.conf = scene.add.particles(0, 0, 'p_conf', { emitting: false, lifespan: 1800, speed: { min: 260, max: 620 }, angle: { min: 235, max: 305 }, gravityY: 700, rotate: { start: 0, end: 720 }, scaleX: { start: 0.9 * sc, end: 0.3 * sc }, scaleY: 0.9 * sc, tint: [0xFF8A1F, 0x6FD6C0, 0xF7C3C9, 0xFFD95A, 0x72C25E, 0x8FD3FF] }).setDepth(96);
  fx.mint = scene.add.particles(0, 0, 'p_spark', { emitting: false, lifespan: 700, speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, scale: { start: 0.7 * sc, end: 0 * sc }, tint: [0xBFF5E8, 0xFFFFFF, 0x6FD6C0], blendMode: 'ADD' }).setDepth(31);
  fx.bubble = scene.add.particles(0, 0, 'p_dot', { emitting: false, lifespan: 600, speedY: { min: -80, max: -40 }, speedX: { min: -10, max: 10 }, scale: { start: 0.4 * sc, end: 0.1 * sc }, alpha: { start: 0.9, end: 0 } }).setDepth(26);
  return fx;
}

/* ---------------- 로봇: 단일 물리 바디 + 비물리 장식 스프링 ---------------- */
const RT = TS * 1.25;
class Robot {
  constructor(scene, x, y) {
    makeRobotTextures(scene);
    this.scene = scene; const MB = Phaser.Physics.Matter.Matter;
    const common = { friction: 0.85, frictionStatic: 1, frictionAir: 0.012, restitution: 0.02 };
    const cen = MB.Vertices.centre(COL_V);
    const torso = MB.Bodies.fromVertices(x + cen.x, y + cen.y, [COL_V.map(p => ({ x: p.x, y: p.y }))], Object.assign({ label: 'robot_torso', density: 0.0032 }, common));
    const head = MB.Bodies.circle(x, y + HEAD_CY, HEAD_COL_R, Object.assign({ label: 'robot_head', density: 0.0012 }, common));
    this.body = MB.Body.create(Object.assign({ parts: [torso, head], label: 'robot' }, common));
    scene.matter.world.add(this.body);
    this.torso = this.body; this.head = head; this.parts = [this.body];
    this.refOff = { x: x - this.body.position.x, y: y - this.body.position.y }; // 질량중심 → 기준점(몸통 중심)
    // ---- 그래픽 ----
    const im = (k, ox = 0.5, oy = 0.5) => scene.add.image(0, 0, k).setScale(1 / RT).setOrigin(ox, oy);
    this.shadow = scene.add.image(x, FLOOR_Y, 'shadow').setScale(1 / TS).setDepth(17);
    this.root = scene.add.container(x, y + FOOT_BOTTOM).setDepth(21);
    this.bodyC = scene.add.container(0, -FOOT_BOTTOM); this.root.add(this.bodyC);
    this.linkG = scene.add.graphics();
    this.feet = [im('r_foot'), im('r_foot')]; this.arms = [im('r_arm'), im('r_arm')];
    this.torsoImg = im('r_torso'); this.juiceG = scene.add.graphics(); this.glassImg = im('r_glass');
    this.glassImg.setPosition(WIN.cx, WIN.cy);
    this.headC = scene.add.container(0, HEAD_CY);
    this.ears = [im('r_ear', 0.5, 0.93), im('r_ear', 0.5, 0.93)];
    this.ears[0].setPosition(-EAR.x, EAR.y); this.ears[1].setPosition(EAR.x, EAR.y);
    this.headImg = im('r_head');
    this.eyeGlow = [0, 1].map(() => scene.add.image(0, 0, 'glow').setScale(0.7 / TS).setTint(C.eyeGlow).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55));
    this.faceG = scene.add.graphics(); this.faceRef = im('r_faceref');
    this.headC.add([this.ears[0], this.ears[1], this.headImg, ...this.eyeGlow, this.faceG, this.faceRef]);
    this.bodyC.add([this.linkG, this.feet[0], this.feet[1], this.arms[0], this.arms[1], this.torsoImg, this.juiceG, this.glassImg, this.headC]);
    // 상태
    this.auto = true; this.expr = 'calm'; this.exprT = 0; this.blinkT = 2 + Math.random() * 2; this.hold = 0; this.time = 0;
    this.juice = 1; this.juiceTarget = 1; this.slosh = 0; this.sloshV = 0; this.flash = 0;
    this.sq = 1; this.sqV = 0; this.prevV = { x: 0, y: 0 };
    this.sp = { head: { x: 0, y: 0, vx: 0, vy: 0 }, armL: { x: 0, y: 0, vx: 0, vy: 0 }, armR: { x: 0, y: 0, vx: 0, vy: 0 } };
    this.earS = [{ a: -0.22, w: 0, side: -1 }, { a: 0.22, w: 0, side: 1 }];
    this.groundY = FLOOR_Y; this.surfaceW = 999;
    this.pill = []; const r = WIN.w / 2, top = WIN.cy - WIN.h / 2 + r, bot = WIN.cy + WIN.h / 2 - r;
    for (let i = 0; i <= 12; i++) { const a = Math.PI + i * Math.PI / 12; this.pill.push({ x: Math.cos(a) * r, y: top + Math.sin(a) * r }); }
    for (let i = 0; i <= 12; i++) { const a = i * Math.PI / 12; this.pill.push({ x: Math.cos(a) * r, y: bot + Math.sin(a) * r }); }
    this.vs = null; this.update(0);
  }
  isPart(b) { return b === this.body || b.parent === this.body; }
  maxSpeed() { return this.body.speed; }
  center() { return this.body.position; }
  refPos() { const b = this.body, c = Math.cos(b.angle), s = Math.sin(b.angle); return { x: b.position.x + this.refOff.x * c - this.refOff.y * s, y: b.position.y + this.refOff.x * s + this.refOff.y * c }; }
  headPos() { return this.head.position; }
  bottom() { return this.body.bounds.max.y; }
  setExpr(e, auto = false) { if (this.expr === e) return; if (!auto) this.auto = false; this.expr = e; this.exprT = 0; this.hold = 0; if (e === 'scared') Sfx.scream(); }
  impact(strength) {
    this.sloshV += (Math.random() < 0.5 ? -1 : 1) * Math.min(0.5, strength * 0.05); this.flash = 1; Sfx.slosh();
    this.sqV -= Math.min(0.22, strength * 0.018); // 착지 찌그러짐
    this.sp.head.vy += Math.min(12, strength * 1.2); this.sp.armL.vy += strength * 0.8; this.sp.armR.vy += strength * 0.8;
    if (this.auto && strength > 11) { this.expr = 'dizzy'; this.exprT = 0; this.hold = 0; }
  }
  destroy() { this.scene.matter.world.remove(this.body); this.root.destroy(); this.shadow.destroy(); }
  clipBelow(poly, nx, ny, d) { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const da = a.x * nx + a.y * ny - d, db = b.x * nx + b.y * ny - d; if (da >= 0) out.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } } return out; }
  findGround() { // 로봇 아래 가장 가까운 표면
    const b = this.body, x = b.position.x, by = b.bounds.max.y - 4; let gy = FLOOR_Y, gw = 9999;
    this.scene.matter.world.localWorld.bodies.forEach(o => { if (o === b || o.isSensor || o.label === 'floor') return; const bd = o.bounds; if (x > bd.min.x && x < bd.max.x && bd.min.y >= by - 6 && bd.min.y < gy) { gy = bd.min.y; gw = bd.max.x - bd.min.x; } });
    this.groundY = gy; this.surfaceW = gw;
  }
  spring(s, ax, ay, k, d, dt) { s.vx += (-s.x * k - ax) * dt; s.vy += (-s.y * k - ay) * dt; s.vx *= d; s.vy *= d; s.x += s.vx * dt; s.y += s.vy * dt; s.x = Phaser.Math.Clamp(s.x, -10, 10); s.y = Phaser.Math.Clamp(s.y, -10, 10); }
  update(dt) {
    const s = dt / 1000, f = Math.min(2.5, dt / 16.67); this.time += s;
    const B = this.body, rp = this.refPos(), ang = B.angle;
    // 몸 기준 가속도 → 장식 스프링
    const axw = (B.velocity.x - this.prevV.x), ayw = (B.velocity.y - this.prevV.y); this.prevV = { x: B.velocity.x, y: B.velocity.y };
    const c = Math.cos(-ang), sn = Math.sin(-ang); const ax = axw * c - ayw * sn, ay = axw * sn + ayw * c;
    if (dt > 0) {
      this.spring(this.sp.head, ax * 40, ay * 40, 0.55, Math.pow(0.86, f), f);
      this.spring(this.sp.armL, ax * 60, ay * 60, 0.35, Math.pow(0.88, f), f);
      this.spring(this.sp.armR, ax * 60, ay * 60, 0.32, Math.pow(0.88, f), f);
      // 찌그러짐/늘어남
      const airborne = Math.abs(B.velocity.y) > 4.5;
      const target = airborne ? 1 + Math.min(0.07, Math.abs(B.velocity.y) * 0.006) : 1;
      this.sqV += (target - this.sq) * 0.35 * f; this.sqV *= Math.pow(0.78, f); this.sq += this.sqV * f;
      this.sq = Phaser.Math.Clamp(this.sq, 0.78, 1.12);
    }
    // 표정 자동 전환
    this.exprT += s;
    const sp = B.speed;
    if (this.auto) {
      if (this.expr === 'calm' && (sp > 6 || B.velocity.y > 4.2)) { this.expr = 'scared'; this.exprT = 0; Sfx.scream(); }
      else if (this.expr === 'scared') { if (sp > 4) this.hold = 0; else { this.hold += s; if (this.hold > 0.7) { this.expr = 'calm'; this.exprT = 0; } } }
      else if (this.expr === 'dizzy' && this.exprT > 1.2 && sp < 3) { this.expr = 'calm'; this.exprT = 0; }
    }
    // 귀 스프링
    const ears = this.earS.map((e, i) => {
      let target = e.side * 0.22;
      if (this.expr === 'scared') target = e.side * 0.95 + Math.sin(this.time * 55) * 0.06;
      else if (this.expr === 'dizzy') target = e.side * 1.6 + Math.sin(this.time * 5 + i) * 0.2;
      else if (this.expr === 'sad') target = e.side * 1.9;
      else if (this.expr === 'happy') target = e.side * 0.12 + Math.sin(this.time * 9 + i * 1.3) * 0.16;
      else target += Math.sin(this.time * 1.7 + i) * 0.04;
      target += (-B.velocity.x * 0.045 - B.angularVelocity * 2 + Phaser.Math.Clamp(B.velocity.y * 0.04, -0.45, 0.45) * e.side) + this.sp.head.x * 0.02;
      if (dt > 0) { e.w += (target - e.a) * 0.16 * f; e.w *= Math.pow(0.82, f); e.a += e.w * f; }
      return e.a;
    });
    // 주스 출렁임
    if (dt > 0) {
      this.juice += (this.juiceTarget - this.juice) * Math.min(1, s * 4);
      this.sloshV += (-this.slosh * 0.25 - ax * 0.03) * f; this.sloshV *= Math.pow(0.9, f); this.slosh += this.sloshV * f;
      this.flash = Math.max(0, this.flash - s * 5);
      this.blinkT -= s; if (this.blinkT < -0.12) this.blinkT = 2.5 + Math.random() * 2.5;
    }
    let tilt = this.slosh + Math.sin(this.time * 1.6) * 0.05; if (this.expr === 'scared') tilt += Math.sin(this.time * 45) * 0.08;
    tilt = Phaser.Math.Clamp(tilt, -0.9, 0.9);
    // 그림자
    this.findGround();
    const hgt = Math.max(0, this.groundY - B.bounds.max.y);
    const shS = Math.max(0.35, 1 - hgt / 520) * Math.min(1, this.surfaceW / 150);
    const sq = this.sq;
    this.vs = {
      x: rp.x - Math.sin(ang) * FOOT_BOTTOM, y: rp.y + Math.cos(ang) * FOOT_BOTTOM, rot: ang,
      sx: 1 + (1 - sq) * 0.9, sy: sq,
      hx: this.sp.head.x, hy: this.sp.head.y * 0.8, hr: this.sp.head.x * 0.012,
      al: [this.sp.armL.x * 0.8, this.sp.armL.y * 0.8], ar: [this.sp.armR.x * 0.8, this.sp.armR.y * 0.8],
      ears, sh: [B.position.x, this.groundY + 2, shS, Math.max(0.12, 1 - hgt / 420)],
      expr: this.expr, exprT: this.exprT, blink: this.blinkT < 0, juice: this.juice, tilt, flash: this.flash, t: this.time,
    };
    this.draw(this.vs);
  }
  snap() { const v = this.vs; return Object.assign({}, v, { al: v.al.slice(), ar: v.ar.slice(), ears: v.ears.slice(), sh: v.sh.slice() }); }
  applySnap(v) { this.vs = v; this.expr = v.expr; this.exprT = v.exprT; this.juice = v.juice; this.flash = v.flash; this.draw(v); }
  draw(v) {
    this.root.setPosition(v.x, v.y).setRotation(v.rot).setScale(v.sx, v.sy);
    this.shadow.setPosition(v.sh[0], v.sh[1]).setScale(v.sh[2] / TS, v.sh[2] / TS).setAlpha(v.sh[3]);
    this.headC.setPosition(v.hx, HEAD_CY + v.hy).setRotation(v.hr).setScale(1 + (1 - v.sy) * 0.4, 1 - (1 - v.sy) * 0.3);
    const bob = Math.sin(v.t * 2.2) * 1.2;
    this.arms[0].setPosition(-ARM.x + v.al[0], ARM.y + v.al[1] + bob).setRotation(0.25 + v.al[0] * 0.03);
    this.arms[1].setPosition(ARM.x + v.ar[0], ARM.y + v.ar[1] - bob).setRotation(-0.25 + v.ar[0] * 0.03);
    this.feet[0].setPosition(-FOOT.x, FOOT.y); this.feet[1].setPosition(FOOT.x, FOOT.y);
    this.ears[0].setRotation(v.ears[0]); this.ears[1].setRotation(v.ears[1]);
    // 빛 연결선
    const g = this.linkG; g.clear();
    const links = [[-23 * S, -14 * S, this.arms[0]], [23 * S, -14 * S, this.arms[1]], [-10 * S, 26 * S, this.feet[0]], [10 * S, 26 * S, this.feet[1]]];
    links.forEach(([x0, y0, o]) => { g.lineStyle(7, C.link, 0.16).lineBetween(x0, y0, o.x, o.y); g.lineStyle(2.6, C.link, 0.5).lineBetween(x0, y0, o.x, o.y); });
    g.lineStyle(8, C.link, 0.12).lineBetween(0, -30 * S, this.headC.x, this.headC.y + HEAD_RY * 0.9);
    this.drawFace(v); this.drawJuice(v);
  }
  drawJuice(v) {
    const g = this.juiceG; g.clear();
    const lvl = Phaser.Math.Clamp(v.juice, 0, 1), tilt = v.tilt;
    const yTop = WIN.cy + WIN.h / 2 - WIN.h * lvl;
    const nx = Math.sin(-tilt), ny = Math.cos(-tilt);
    if (lvl > 0.01) {
      const poly = this.clipBelow(this.pill, nx, ny, ny * yTop);
      if (poly.length > 2) g.fillStyle(C.juice, 1).fillPoints(poly, true);
      const shadeY = yTop + (WIN.cy + WIN.h / 2 - yTop) * 0.55;
      const p2 = this.clipBelow(this.pill, 0, 1, shadeY);
      if (p2.length > 2 && shadeY > yTop) g.fillStyle(C.juiceShade, 0.9).fillPoints(p2, true);
      // 수면 하이라이트
      const surf = this.clipBelow(this.pill, nx, ny, ny * yTop); if (surf.length > 2) { const sy0 = yTop + 1.2; g.fillStyle(0xFFC27A, 0.9).fillRect(-WIN.w / 2 + 1.5, sy0 - 1 + Math.sin(v.t * 3) * 0.3, WIN.w - 3, 1.6); }
      if (lvl > 0.15) { const by = WIN.cy + WIN.h / 2 - 5 - ((v.t * 9) % (WIN.h * lvl - 6)); g.fillStyle(0xFFFFFF, 0.55).fillCircle(Math.sin(v.t * 4) * 2, by, 1.3); }
    }
    if (v.flash > 0) g.fillStyle(0xffffff, v.flash * 0.85).fillPoints(this.pill, true);
  }
  drawFace(v) {
    const g = this.faceG; g.clear(); const t = v.exprT;
    const ey = 6 * S, ex = 12 * S;
    let glowA = 0.55, glowS = 0.7, eyePos = [[-ex, ey], [ex, ey]];
    const led = (x, y, w, h, r) => { g.fillStyle(C.eyeGlow, 0.22).fillRoundedRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, r + 3); g.fillStyle(C.eye, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, r); g.fillStyle(0xFFF1C7, 0.9).fillRoundedRect(x - w / 2 + w * 0.22, y - h / 2 + h * 0.12, w * 0.3, Math.max(1, h * 0.28), Math.min(r, 2)); };
    const arcEye = (cx, cy, r, a0, a1) => { g.lineStyle(9, C.eyeGlow, 0.28); g.beginPath(); g.arc(cx, cy, r, a0, a1); g.strokePath(); g.lineStyle(4.5, C.eye, 1); g.beginPath(); g.arc(cx, cy, r, a0, a1); g.strokePath(); };
    if (v.expr === 'calm') {
      const b = v.blink; [-1, 1].forEach(sd => led(sd * ex, ey, 9 * S, b ? 2.2 * S : 14 * S, b ? 1 : 4 * S));
      if (b) glowA = 0.25;
    } else if (v.expr === 'scared') {
      const jx = Math.sin(v.t * 70) * 1.2, jy = Math.cos(v.t * 63) * 1.2;
      [-1, 1].forEach(sd => led(sd * ex + jx, ey + jy, 10.5 * S, 20 * S, 5 * S)); glowS = 0.85; glowA = 0.7;
      g.fillStyle(C.eyeGlow, 0.9).fillRoundedRect(-4 * S, ey + 13 * S - 7, 8 * S, 4 * S, 2 * S); // 놀란 입
      const dy = (t * 20) % 8; g.fillStyle(C.eye, 0.9).fillCircle(22 * S, -4 * S + dy, 2.6 * S); g.fillTriangle(22 * S - 2.3 * S, -4 * S + dy - 0.5, 22 * S + 2.3 * S, -4 * S + dy - 0.5, 22 * S, -9 * S + dy);
    } else if (v.expr === 'happy') {
      [-1, 1].forEach(sd => arcEye(sd * ex, ey + 5 * S, 6 * S, Math.PI * 1.1, Math.PI * 1.9));
      g.lineStyle(3.5, C.eye, 0.9); g.beginPath(); g.arc(0, ey + 6 * S, 5 * S, Math.PI * 0.2, Math.PI * 0.8); g.strokePath();
      eyePos = [[-ex, ey + 1 * S], [ex, ey + 1 * S]]; glowA = 0.5;
    } else if (v.expr === 'dizzy') {
      [-1, 1].forEach(sd => { const cx = sd * ex; g.lineStyle(7, C.eyeGlow, 0.22); g.lineStyle(3, C.eye, 1); g.beginPath(); for (let i = 0; i < 26; i++) { const a = t * 8 * sd + i * 0.5, r = i * 0.3 * S; const px = cx + Math.cos(a) * r, py = ey + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.strokePath(); });
      glowA = 0.4;
    } else if (v.expr === 'sad') {
      [-1, 1].forEach(sd => arcEye(sd * ex, ey - 3 * S, 6 * S, Math.PI * 0.15, Math.PI * 0.85));
      const dy = ((t * 14) % 10); g.fillStyle(0x8FD3FF, 0.9).fillCircle(-ex - 3 * S, ey + 4 * S + dy, 2.2 * S);
      glowA = 0.35;
    }
    this.eyeGlow.forEach((e, i) => e.setPosition(eyePos[i][0], eyePos[i][1]).setAlpha(glowA).setScale(glowS / TS));
    // 머리 위 별(행복/어지러움) – 화면 밖 장식
    if (v.expr === 'happy' && Math.floor(t * 4) % 2 === 0) starShape(g, 30 * S, -34 * S, 5 * S, 0xFFD95A);
    if (v.expr === 'dizzy') for (let i = 0; i < 3; i++) { const a = t * 3 + i * Math.PI * 2 / 3; starShape(g, Math.cos(a) * 34 * S, -44 * S + Math.sin(a) * 8 * S, 5 * S, 0xFFD95A); }
  }
}
function starShape(g, x, y, r, fill, alpha = 1) {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r; pts.push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad }); }
  g.fillStyle(fill, alpha).fillPoints(pts, true); g.lineStyle(1.5, 0xFFFFFF, 0.8 * alpha).strokePoints(pts, true);
}

/* ---------------- 공통 장면 셋업 ---------------- */
function setupScene(scene) {
  scene.cameras.main.setZoom(Z).centerOn(W / 2, H / 2);
  makeRobotTextures(scene); makeUiTextures(scene); addBg(scene);
  window.__UI = {};
}
function toastBox(scene, msg, y = 300) {
  const c = scene.add.container(W / 2, y).setDepth(90);
  const t = txt(scene, 0, 0, msg, 27, '#FFFFFF', { style: { wordWrap: { width: 560 }, align: 'center', lineSpacing: 4 } });
  const w = Math.min(640, t.width + 50), h = t.height + 22;
  const g = scene.add.graphics();
  g.fillStyle(0x0d1726, 0.25).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h / 2 > 40 ? 32 : h / 2);
  g.fillStyle(0x203A61, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2 > 40 ? 32 : h / 2);
  g.fillStyle(0xffffff, 0.10).fillRoundedRect(-w / 2 + 8, -h / 2 + 4, w - 16, h * 0.42, Math.min(26, h * 0.21));
  g.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, h / 2 > 40 ? 31 : h / 2 - 1);
  c.add([g, t]); c.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 160, ease: 'Back.Out' });
  return c;
}

/* ---------------- 타이틀 ---------------- */
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    setupScene(this);
    this.matter.world.setBounds(-200, -400, W + 400, FLOOR_Y + 400, 64, false, false, false, true);
    this.matter.add.rectangle(W / 2, FLOOR_Y + 50, W * 2, 100, { isStatic: true, label: 'floor' });
    // 로고 패널
    const lg = this.add.container(W / 2, 250).setDepth(30);
    const pg = this.add.graphics();
    pg.fillStyle(0x1a2233, 0.22).fillRoundedRect(-300, -112 + 14, 600, 230, 115);
    pg.fillStyle(0xFFFFFF, 1).fillRoundedRect(-300, -112, 600, 224, 112);
    pg.fillStyle(0xF4ECE7, 1).fillRoundedRect(-300, 0, 600, 112, { tl: 0, tr: 0, bl: 112, br: 112 });
    pg.fillStyle(0xFFFFFF, 1).fillRoundedRect(-300, -112, 600, 200, 100);
    pg.lineStyle(5, 0xF7C3C9, 1).strokeRoundedRect(-286, -98, 572, 196, 98);
    pg.fillStyle(0xffffff, 0.9).fillEllipse(-170, -78, 160, 22);
    lg.add(pg);
    lg.add(txt(this, 0, -30, '러그돌 로봇', 86, '#FF8A1F', { stroke: '#203A61', sw: 10, shadow: 5 }));
    lg.add(txt(this, 0, 56, '블록을 빼서 매트에 안착!', 34, '#4E9A45'));
    this.tweens.add({ targets: lg, y: 262, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    // 떠다니는 장식
    const deco = [['wood', 110, 520, 90, 60, -0.3], ['stone', 620, 470, 80, 80, 0.25], ['bomb', 600, 640, 64, 68, 0], ['ice', 120, 720, 78, 70, 0.2], ['balloon', 640, 820, 64, 130, 0], ['wood', 560, 1000, 70, 50, 0.4]];
    deco.forEach(([t, x, y, w, h, r], i) => { const o = img(this, x, y, blockTex(this, t, w, h)).setRotation(r).setDepth(10); this.tweens.add({ targets: o, y: y - 18, rotation: r + 0.12, duration: 1500 + i * 230, yoyo: true, repeat: -1, ease: 'Sine.InOut' }); });
    // 매트와 로봇
    const cush = this.matter.add.rectangle(W / 2, 1040, 300, 50, { isStatic: true, label: 'cushion' });
    this.cushVis = img(this, W / 2, 1040, blockTex(this, 'cushion', 300, 50)).setDepth(8);
    this.ring = this.add.ellipse(W / 2, 1066, 340, 40).setStrokeStyle(4, 0xffffff, 0.8).setDepth(7);
    this.tweens.add({ targets: this.ring, scaleX: 1.12, scaleY: 1.2, alpha: 0.2, duration: 1100, repeat: -1 });
    this.robot = new Robot(this, W / 2 + 10, 560);
        this.robot.setExpr('scared', true); this.robot.auto = true;
    this.hopT = 3;
    this.matter.world.on('collisionstart', (ev) => ev.pairs.forEach(p => { if (this.robot.isPart(p.bodyA) || this.robot.isPart(p.bodyB)) { const v = this.robot.body.velocity.y; if (v > 3) { this.robot.impact(v); this.tweens.add({ targets: this.cushVis, scaleY: 0.8 / TS, scaleX: 1.06 / TS, duration: 90, yoyo: true }); Sfx.boing(); } } }));
    // 플레이 버튼(초록 원형)
    const pb = button(this, W / 2, 1150, 320, 110, '플레이', () => this.scene.start('Select'), { color: 'green', icon: 'play', iconSize: 24, size: 48, depth: 40 });
    this.tweens.add({ targets: pb, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    window.__UI.play = [W / 2, 1150];
    txt(this, W / 2, 1238, '프로토타입 · 월드 1 스테이지 1~5', 24, '#7a4a32', { depth: 40 });
    window.__STATE = { scene: 'Title' };
  }
  update(t, dt) {
    dt = 1000 / 60; const r = this.robot; r.update(dt);
    if (r.body.position.y > 900 && r.expr === 'scared' && r.maxSpeed() < 2) { r.expr = 'happy'; r.exprT = 0; }
    this.hopT -= dt / 1000;
    if (this.hopT < 0 && r.maxSpeed() < 0.5) { this.hopT = 3.2; const MB = Phaser.Physics.Matter.Matter.Body; MB.setVelocity(r.body, { x: 0, y: -11 });  Sfx.boing(); r.expr = 'happy'; }
  }
}

/* ---------------- 스테이지 선택 ---------------- */
class SelectScene extends Phaser.Scene {
  constructor() { super('Select'); }
  create() {
    setupScene(this);
    const save = Save.load();
    const hg = this.add.graphics();
    hg.fillStyle(0x1a2233, 0.2).fillRoundedRect(70, 92, 580, 116, 58); hg.fillStyle(0xffffff, 0.96).fillRoundedRect(70, 82, 580, 116, 58); hg.lineStyle(4, 0xF7C3C9, 1).strokeRoundedRect(82, 94, 556, 92, 46);
    txt(this, W / 2, 140, '월드 1 · 놀이공원', 52, '#FF8A1F', { stroke: '#203A61', sw: 8 });
    let total = 0;
    STAGES.forEach((st, i) => {
      const unlocked = i === 0 || (save.stars[STAGES[i - 1].id] || 0) > 0 || /unlock/.test(location.search);
      const stars = save.stars[st.id] || 0; total += stars;
      const x = 180 + (i % 3) * 180, y = 380 + Math.floor(i / 3) * 260;
      const b = button(this, x, y, 150, 150, unlocked ? String(st.id) : '', () => { if (unlocked) this.scene.start('Game', { idx: i }); }, { size: 72, color: unlocked ? 'yellow' : 'gray', text: unlocked ? '#7A3E08' : '#5A606B' });
      if (!unlocked) b.add(img(this, 0, -2, 'ui_lock'));
      b.name = 'stage' + st.id; window.__UI['stage' + st.id] = [x, y];
      txt(this, x, y + 104, st.name, 28, '#FFFFFF', { stroke: '#203A61', sw: 6 });
      for (let k = 0; k < 3; k++) starImg(this, x - 42 + k * 42, y + 146 - (k === 1 ? 6 : 0), k < stars, 'xs');
    });
    const tg = this.add.graphics(); tg.fillStyle(0x203A61, 0.85).fillRoundedRect(W / 2 - 170, 932, 340, 60, 30);
    starImg(this, W / 2 - 128, 962, true, 'xs');
    txt(this, W / 2 + 14, 962, `모은 별 ${total} / ${STAGES.length * 3}`, 32, '#FFFFFF');
    button(this, W / 2, 1090, 300, 96, '타이틀', () => this.scene.start('Title'), { size: 36, color: 'mint', icon: 'home', iconSize: 20 });
    window.__UI.title = [W / 2, 1090];
    window.__STATE = { scene: 'Select' };
  }
}

/* ---------------- 게임 ---------------- */
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(d) { this.idx = d.idx || 0; this.st = STAGES[this.idx]; }
  create() {
    setupScene(this);
    this.matter.world.engine.positionIterations = 10; this.matter.world.engine.velocityIterations = 8;
    this.state = 'play'; this.taps = 0; this.restT = 0; this.idleT = 0; this.blocks = []; this.cushions = []; this.arrow = null; this.hand = null; this.toastObj = null; this.restBar = null;
    this.penalties = 0; this.hintsLeft = HINTS_PER_STAGE; this.hintsUsed = 0; this.rec = []; this.recEvents = []; this.recObjs = []; this.recording = true; this.replaying = false; this.resultObjs = null; this.spAvg = undefined; this.lastStars = 3; this.lastTapT = 0; this.keyT = 0;
    this.fx = makeFx(this);
    this.floor = this.matter.add.rectangle(W / 2, FLOOR_Y + 50, W * 3, 100, { isStatic: true, label: 'floor', friction: 0.9 });
    this.st.items.forEach(it => this.addItem(it));
    this.robot = new Robot(this, this.st.robot[0], this.st.robot[1]);
    this.cushionTouch = new Set(); this.floorTouch = new Set(); this.floorT = 0;
    this.matter.world.on('collisionstart', (ev) => ev.pairs.forEach(p => this.onCollide(p, true)));
    this.matter.world.on('collisionend', (ev) => ev.pairs.forEach(p => this.onCollide(p, false)));
    this.makeHud();
    if (this.st.tutorial) {
      const b = this.blocks.find(b => b.bid === this.st.tutorial);
      const hc = this.add.container(b.x + 120, b.y + 92).setDepth(60);
      const ar = img(this, 0, -30, 'ui_arrow').setRotation(-Math.PI / 2);
      hc.add([ar, txt(this, 0, 40, '탭!', 44, '#FFFFFF', { stroke: '#E0650F', sw: 9, shadow: 3 })]);
      this.tweens.add({ targets: hc, y: b.y + 108, yoyo: true, repeat: -1, duration: 450, ease: 'Sine.InOut' });
      this.hand = hc;
    }
    if (this.st.order) { this.refreshBadges(); this.time.delayedCall(450, () => { if (this.state === 'play' && this.taps === 0) this.toast('블록의 숫자 순서대로 빼세요! 순서가 틀리면 탭 +1'); }); }
    this.cameras.main.fadeIn(250);
    this.exposeState();
  }
  /* ---- 순서 규칙 ---- */
  nextOrderId() { if (!this.st.order) return null; return this.st.order.find(id => this.blocks.some(b => b.bid === id && b.active)) || null; }
  refreshBadges() {
    const next = this.nextOrderId();
    this.blocks.forEach(b => { if (!b.badge) return; const on = b.bid === next; b.badge.ring.setFillStyle(on ? 0xFF8A1F : 0xFFFFFF, 1).setStrokeStyle(4, on ? 0xFFFFFF : 0xB9773F); b.badge.txt.setColor(on ? '#ffffff' : '#B9773F');
      if (on && !b.badge.pulse) b.badge.pulse = this.tweens.add({ targets: b.badge, scale: 1.18, yoyo: true, repeat: -1, duration: 420 }); });
  }
  wrongOrder(obj) {
    Sfx.tone(220, 140, 0.22, 'square', 0.08); this.cameras.main.shake(160, 0.006);
    this.robot.sloshV += 0.25; this.robot.flash = 1;
    obj.setTint(0xFF8B8B); this.time.delayedCall(450, () => { if (obj.active) obj.clearTint(); });
    const x = obj.x, y = obj.y;
    const mark = txt(this, x, y, '✕', 70, '#E8483B', { stroke: '#ffffff', sw: 9, depth: 60 });
    this.tweens.add({ targets: mark, x: { from: x - 10, to: x + 10 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => this.tweens.add({ targets: mark, alpha: 0, y: y - 30, duration: 300, onComplete: () => mark.destroy() }) });
    const pen = txt(this, x + 80, y - 40, `탭 +${ORDER_PENALTY}`, 36, '#E8483B', { stroke: '#ffffff', sw: 8, depth: 60 });
    this.tweens.add({ targets: pen, y: y - 100, alpha: 0, delay: 500, duration: 700, onComplete: () => pen.destroy() });
    this.flashTapText();
    const nb = this.blocks.find(b => b.bid === this.nextOrderId());
    this.toast(`순서가 틀렸어요! ${nb && nb.badge ? nb.badge.num + '번' : '숫자 순서대로'} 블록부터 빼세요 (탭 +${ORDER_PENALTY})`);
  }
  flashTapText() { this.tapText.setColor('#FF8B8B'); this.tweens.add({ targets: this.tapText, scale: 1.25, yoyo: true, duration: 120 }); this.time.delayedCall(700, () => this.tapText.setColor('#FFFFFF')); }
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
    const a = img(this, -46, 0, 'ui_arrow').setOrigin(0.87, 0.5); a.x = 0; c.add(a);
    c.rotation = { right: 0, left: Math.PI, down: Math.PI / 2, up: -Math.PI / 2 }[dir] || 0;
    const ring = this.add.graphics().setDepth(64);
    this.arrow = { c, ring, obj, dir, t: 0, life: 4.0 };
    this.positionArrow(0);
  }
  positionArrow(dt) {
    const a = this.arrow; if (!a) return;
    a.t += dt / 1000;
    if (!a.obj.active || a.t > a.life) { this.clearArrow(); return; }
    const o = a.obj, hw = o.bw / 2, hh = o.bh / 2, bob = 10 + Math.sin(a.t * 9) * 10;
    const off = { right: [-hw - bob, 0], left: [hw + bob, 0], down: [0, -hh - bob], up: [0, hh + bob] }[a.dir] || [-hw - bob, 0];
    a.c.setPosition(o.x + off[0], o.y + off[1]).setAlpha(a.t > a.life - 0.4 ? (a.life - a.t) / 0.4 : 1);
    const pr = (a.t * 1.6) % 1;
    a.ring.clear().lineStyle(7 * (1 - pr) + 1, 0xFFB224, 0.95 * (1 - pr)).strokeRoundedRect(o.x - hw - 6 - pr * 18, o.y - hh - 6 - pr * 18, o.bw + 12 + pr * 36, o.bh + 12 + pr * 36, 16);
  }
  clearArrow() { if (this.arrow) { this.arrow.c.destroy(); this.arrow.ring.destroy(); this.arrow = null; } }
  updateHintBtn() { if (this.hintBadge) { this.hintBadgeT.setText(String(this.hintsLeft)); this.hintBadge.setAlpha(this.hintsLeft > 0 ? 1 : 0.45); this.hintBtn.setAlpha(this.hintsLeft > 0 ? 1 : 0.6); } }
  /* ---- 오브젝트 ---- */
  matterImg(x, y, key, shape, opts, w, h) {
    const o = this.matter.add.image(x, y, key, null, { isStatic: true, isSensor: true });
    o.setScale(1 / TS); o.setBody(shape, opts); o.bw = w; o.bh = h; return o;
  }
  addItem(it) {
    const M = this.matter; let obj;
    if (it.t === 'stone') obj = this.matterImg(it.x, it.y, blockTex(this, 'stone', it.w, it.h), { type: 'rectangle', width: it.w, height: it.h }, { isStatic: true, label: 'stone', friction: 0.8 }, it.w, it.h);
    else if (it.t === 'cushion') {
      obj = this.matter.add.rectangle(it.x, it.y, it.w, it.h, { isStatic: true, label: 'cushion', friction: 1, restitution: 0 });
      obj = { x: it.x, y: it.y, bw: it.w, bh: it.h, body: obj, active: true, kind: 'cushion' };
      const ring = this.add.ellipse(it.x, it.y + it.h / 2 - 2, it.w + 40, 34).setStrokeStyle(4, 0xffffff, 0.85).setDepth(6);
      this.tweens.add({ targets: ring, scaleX: 1.1, scaleY: 1.25, alpha: 0.15, duration: 1200, repeat: -1 });
      obj.vis = img(this, it.x, it.y, blockTex(this, 'cushion', it.w, it.h)).setDepth(8); obj.ring = ring;
      this.cushions.push(obj); return obj;
    }
    else if (it.t === 'wood') { obj = this.matterImg(it.x, it.y, blockTex(this, 'wood', it.w, it.h), { type: 'rectangle', width: it.w, height: it.h }, { label: 'wood', friction: 0.9, frictionStatic: 1, density: 0.002 }, it.w, it.h); obj.removable = true; }
    else if (it.t === 'bomb') {
      const tw = it.r * 2 + 12, th = it.r * 2 + 16;
      obj = this.matterImg(it.x, it.y, blockTex(this, 'bomb', tw, th), { type: 'circle', radius: it.r }, { label: 'bomb', friction: 0.9, density: 0.002 }, it.r * 2, it.r * 2);
      obj.setOrigin(0.5, (PAD + th / 2 + 4) / (th + PAD * 2)); obj.removable = true; obj.bomb = true; obj.br = it.r;
      const f = this.add.image(0, 0, 'p_spark').setScale(1 / TS).setDepth(16).setBlendMode(Phaser.BlendModes.ADD).setTint(0xFFD27A);
      this.tweens.add({ targets: f, scale: 1.6 / TS, alpha: 0.5, angle: 90, yoyo: true, repeat: -1, duration: 160 }); obj.fuse = f;
    }
    else if (it.t === 'plank') {
      obj = this.matterImg(it.x, it.y, blockTex(this, 'plank', it.w, it.h), { type: 'rectangle', width: it.w, height: it.h }, { label: 'plank', friction: 0.6, density: 0.002 }, it.w, it.h);
      const pv = it.pivot || it.hinge;
      M.add.worldConstraint(obj.body, 0, 1, { pointA: { x: pv[0], y: pv[1] }, pointB: { x: pv[0] - it.x, y: pv[1] - it.y } });
      const pg = this.add.graphics().setDepth(16); pg.fillStyle(0x2c2f35, 0.35).fillCircle(pv[0], pv[1] + 2, 10); pg.fillStyle(0x6B717B, 1).fillCircle(pv[0], pv[1], 9); pg.fillStyle(0xC9CDD3, 1).fillCircle(pv[0] - 2, pv[1] - 2, 5); pg.fillStyle(0xffffff, 0.9).fillCircle(pv[0] - 3, pv[1] - 3, 2); obj.pin = pg;
    }
    else if (it.t === 'fulcrum') { obj = img(this, it.x, it.y, blockTex(this, 'fulcrum', it.w, it.h)); obj.bw = it.w; obj.bh = it.h; }
    obj.setDepth(15); obj.bid = it.id; obj.kind = it.t;
    if (obj.body && !obj.body.isStatic) { obj.recIdx = this.recObjs.length; this.recObjs.push({ obj, key: obj.texture.key, depth: obj.depth, ox: obj.originX, oy: obj.originY }); }
    if (this.st.order && this.st.order.includes(it.id)) {
      const num = this.st.order.indexOf(it.id) + 1;
      const sh = this.add.circle(0, 3, 23, 0x000000, 0.22);
      const ring = this.add.circle(0, 0, 22, 0xffffff, 1).setStrokeStyle(4, 0xB9773F);
      const t = txt(this, 0, -1, String(num), 30, '#B9773F');
      obj.badge = this.add.container(it.x, it.y, [sh, ring, t]).setDepth(16); obj.badge.ring = ring; obj.badge.txt = t; obj.badge.num = num;
    }
    if (obj.removable) {
      const e = 8 * TS; // 손가락 여유
      obj.setInteractive(new Phaser.Geom.Rectangle(PAD * TS - e, PAD * TS - e, it.t === 'bomb' ? (it.r * 2 + 12) * TS + 2 * e : it.w * TS + 2 * e, it.t === 'bomb' ? (it.r * 2 + 16) * TS + 2 * e : it.h * TS + 2 * e), Phaser.Geom.Rectangle.Contains);
      obj.input.cursor = 'pointer';
      obj.on('pointerdown', () => this.tapBlock(obj));
      this.blocks.push(obj);
    } else if (it.id) this.blocks.push(obj);
    return obj;
  }
  /* ---- HUD ---- */
  makeHud() {
    const D = 80;
    roundBtn(this, 64, 72, 'pause', () => this.scene.start('Select'), { depth: D + 1 });
    this.add.image(236, 74, 'ui_pill').setScale(1 / TS).setDepth(D);
    this.tapLabel = txt(this, 170, 72, '탭', 24, '#FFD27A', { depth: D + 1 });
    this.tapText = txt(this, 252, 71, '', 36, '#FFFFFF', { depth: D + 1 });
    this.add.text(24, 136, `1-${this.st.id}  ${this.st.name}`, { fontFamily: FONT, fontSize: '32px', color: '#FFFFFF', resolution: Z, padding: { x: 6, y: 6 } }).setStroke('#203A61', 8).setShadow(0, 3, 'rgba(20,30,60,0.35)', 4, true, true).setOrigin(0, 0.5).setDepth(D + 1);
    this.nextText = this.add.text(24, 176, '', { fontFamily: FONT, fontSize: '23px', color: '#FFFFFF', resolution: Z, padding: { x: 6, y: 6 } }).setStroke('#203A61', 6).setOrigin(0, 0.5).setDepth(D + 1);
    this.starEmpty = []; this.starFull = [];
    [W - 200, W - 130, W - 60].forEach((x, k) => { const y = 70 - (k === 1 ? 6 : 0); this.starEmpty.push(starImg(this, x, y, false).setDepth(D)); this.starFull.push(starImg(this, x, y, true).setDepth(D + 1)); });
    this.retryBtn = roundBtn(this, W - 160, 160, 'retry', () => this.scene.restart({ idx: this.idx }), { depth: D + 1 });
    this.hintBtn = roundBtn(this, W - 60, 160, 'hint', () => this.useHint(), { depth: D + 1 });
    this.hintBadge = this.add.circle(W - 28, 128, 17, 0xFF8A1F).setStrokeStyle(3, 0xffffff).setDepth(D + 3);
    this.hintBadgeT = txt(this, W - 28, 127, String(this.hintsLeft), 22, '#FFFFFF', { depth: D + 4 });
    Object.assign(window.__UI, { pause: [64, 72], retry: [W - 160, 160], hint: [W - 60, 160] });
    this.updateHud();
  }
  starsNow() { return this.taps <= this.st.t3 ? 3 : this.taps <= this.st.t2 ? 2 : 1; }
  updateHud() {
    const st = this.st, u = this.taps;
    this.tapText.setText(`${u} / ${st.limit}`);
    const n = this.starsNow();
    const left = n === 3 ? st.t3 - u : n === 2 ? st.t2 - u : null;
    this.nextText.setText(left === null ? '별 1개 확보 (클리어하면 받아요)' : `다음 별까지 남은 탭 ${left}`);
    this.starFull.forEach((s, k) => { const on = k < n; if (!on && s.visible) { s.setVisible(false); const g = starImg(this, s.x, s.y, true).setDepth(82); this.tweens.add({ targets: g, scale: 1.6 / TS, alpha: 0, y: s.y + 30, angle: 40, duration: 500, onComplete: () => g.destroy() }); } else if (on) s.setVisible(true); });
    let j; if (u <= st.t3) j = 1 - (u / Math.max(1, st.t3)) / 3; else if (u <= st.t2) j = 2 / 3 - ((u - st.t3) / Math.max(1, st.t2 - st.t3)) / 3; else j = 1 / 3;
    if (this.robot) { this.robot.juiceTarget = j; if (n < this.lastStars) { this.robot.sloshV += 0.35; this.robot.flash = 1; Sfx.slosh(); } }
    this.lastStars = n;
  }
  tapBlock(obj) {
    if (this.state !== 'play' || !obj.active || this.replaying) return;
    Sfx.init();
    if (this.taps >= this.st.limit) { this.toast('탭을 다 썼어요! 다시하기를 눌러 보세요'); return; }
    if (this.st.order && obj.bid !== this.nextOrderId()) {
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
    if (obj.kind === 'wood') { const n = Math.min(16, 6 + Math.round(obj.bw * obj.bh / 2500)); for (let i = 0; i < n; i++) this.fx.chips.explode(1, x + (Math.random() - 0.5) * obj.bw * 0.8, y + (Math.random() - 0.5) * obj.bh * 0.6); this.fx.dust.explode(5, x, y); }
    this.blocks = this.blocks.filter(b => b !== obj);
    if (obj.fuse) obj.fuse.destroy();
    const ghost = img(this, x, y, obj.texture.key).setRotation(obj.rotation).setDepth(15).setOrigin(obj.originX, obj.originY);
    this.tweens.add({ targets: ghost, scaleX: 1.12 / TS, scaleY: 0.5 / TS, alpha: 0, duration: 150, onComplete: () => ghost.destroy() });
    obj.destroy();
  }
  explode(obj) {
    const MB = Phaser.Physics.Matter.Matter.Body;
    const x = obj.x, y = obj.y, R = 230;
    this.removeBlock(obj, false); Sfx.boom();
    if (this.recording) this.recEvents.push({ t: this.time.now, type: 'boom', x, y });
    this.boomFx(x, y, 1);
    this.blocks.slice().forEach(b => { if (!b.active) return; const d = Math.hypot(b.x - x, b.y - y); if (d < 110 && b.kind === 'wood') this.removeBlock(b, false); else if (d < 140 && b.bomb) this.time.delayedCall(150, () => this.explode(b)); });
    // 로봇은 한 덩어리로 밀어냄
    const rc = this.robot.center(); const dx = rc.x - x, dy = rc.y - y, d = Math.hypot(dx, dy);
    if (d < R) { const k = 8 * (1 - d / R) + 4.5; const nx = dx / d, ny = dy / d - 3.6; const n = Math.hypot(nx, ny);
      const B = this.robot.body; MB.setVelocity(B, { x: B.velocity.x + nx / n * k, y: B.velocity.y + ny / n * k }); MB.setAngularVelocity(B, B.angularVelocity + Math.sign(dx) * 0.06);
      this.robot.sp.head.vx += Math.sign(dx) * 8; }
    this.matter.world.localWorld.bodies.forEach(b => { if (b.isStatic || this.robot.isPart(b) || b.label === 'bomb') return; const ddx = b.position.x - x, ddy = b.position.y - y, dd = Math.hypot(ddx, ddy); if (dd < R && dd > 1) MB.setVelocity(b, { x: b.velocity.x + ddx / dd * 10 * (1 - dd / R), y: b.velocity.y + ddy / dd * 10 * (1 - dd / R) - 3 }); });
  }
  boomFx(x, y, k) {
    this.cameras.main.shake(350 * k, 0.02 / k);
    const fl = this.add.image(x, y, 'glow').setScale(2 / TS).setTint(0xFFD27A).setBlendMode(Phaser.BlendModes.ADD).setDepth(40); this.tweens.add({ targets: fl, scale: 9 / TS, alpha: 0, duration: 420 * k, onComplete: () => fl.destroy() });
    const ring = this.add.image(x, y, 'p_ring').setScale(0.5 / TS).setTint(0xFFB224).setDepth(40); this.tweens.add({ targets: ring, scale: 4.2 / TS, alpha: 0, duration: 420 * k, onComplete: () => ring.destroy() });
    this.fx.smoke.explode(14, x, y); this.fx.spark.explode(22, x, y);
  }
  onCollide(pair, start) {
    const a = pair.bodyA, b = pair.bodyB; const r = this.robot; if (!r) return;
    const ra = r.isPart(a), rb = r.isPart(b); if (ra === rb) return;
    const part = ra ? a : b, other = ra ? b : a, P = r.body;
    const lab = other.label;
    if (lab === 'cushion') { if (start) this.cushionTouch.add(part.id); else this.cushionTouch.delete(part.id); }
    if (lab === 'floor') { if (start) this.floorTouch.add(part.id); else this.floorTouch.delete(part.id); }
    if (!start || this.state !== 'play') return;
    const ov = (other.parent || other).velocity;
    const rel = Math.hypot(P.velocity.x - ov.x, P.velocity.y - ov.y);
    if (part.label === 'robot_head' && lab === 'floor') { r.setExpr('dizzy'); this.fail('머리가 바닥에 부딪혔어요'); return; }
    if (rel > 6) {
      r.impact(rel); Sfx.thud();
      const cp = pair.collision && pair.collision.supports && pair.collision.supports[0] ? pair.collision.supports[0] : { x: P.position.x, y: P.bounds.max.y };
      if (lab === 'cushion') {
        const c = this.cushions[0]; if (c) this.tweens.add({ targets: c.vis, scaleY: 0.78 / TS, scaleX: 1.07 / TS, duration: 90, yoyo: true, ease: 'Quad.Out' });
        this.fx.mint.explode(12, cp.x, cp.y); Sfx.boing();
      } else this.fx.dust.explode(Math.min(10, Math.round(rel / 1.5)), cp.x, cp.y);
      if (rel > 9) this.cameras.main.shake(180, 0.012);
    }
  }
  toast(msg) {
    if (this.toastObj) this.toastObj.destroy();
    const t = toastBox(this, msg, 300); this.toastObj = t;
    this.time.delayedCall(2600, () => { if (t.active) this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() }); });
  }
  update(time, rdt) {
    if (!this.robot) return;
    if (this.replaying) { this.stepReplay(rdt); return; }
    const dt = 1000 / 60; // 물리(고정 60Hz 스텝)와 같은 시간축으로 판정 → 프레임 저하에도 동일한 결과
    this.robot.update(dt);
    if (this.recording) this.recordFrame();
    this.exposeState();
    this.blocks.forEach(b => { if (b.fuse && b.active) { const c = Math.cos(b.rotation), s = Math.sin(b.rotation), ox = 10, oy = -b.br - 14; b.fuse.setPosition(b.x + ox * c - oy * s, b.y + ox * s + oy * c); } if (b.badge && b.active) b.badge.setPosition(b.x, b.y).setRotation(b.rotation); });
    this.positionArrow(rdt);
    if (this.state !== 'play') return;
    const r = this.robot, B = r.body; const sp0 = r.maxSpeed(); this.spAvg = this.spAvg === undefined ? sp0 : this.spAvg * 0.85 + sp0 * 0.15; const sp = this.spAvg;
    if (B.position.y > H + 80 || B.position.x < -120 || B.position.x > W + 120) { this.fail('화면 밖으로 떨어졌어요'); return; }
    const c = this.cushions[0];
    const cTop = c ? c.y - c.bh / 2 : 0;
    const touchC = c && B.bounds.max.y >= cTop - 6 && B.bounds.max.y <= cTop + 14 && B.position.x > c.x - c.bw / 2 && B.position.x < c.x + c.bw / 2;
    const onC = (this.cushionTouch.size > 0 || touchC) && c && Math.abs(B.position.x - c.x) < c.bw / 2 + 30 && B.position.y < c.y;
    this.dbg = { sp: +sp.toFixed(2), touchC, ct: this.cushionTouch.size, onC, ang: +B.angle.toFixed(2), y: Math.round(B.position.y) };
    if (onC && sp < 1.6) {
      this.restT += dt / 1000; if (!this.restBar) this.restBar = this.add.graphics().setDepth(70);
      const bx = B.position.x - 44, by = r.head.position.y - 78, k = Math.min(1, this.restT / 1.5);
      this.restBar.clear().fillStyle(0x203A61, 0.85).fillRoundedRect(bx - 3, by - 3, 94, 18, 9).fillStyle(0x6FD6C0, 1).fillRoundedRect(bx, by, 88 * k, 12, 6).fillStyle(0xffffff, 0.45).fillRoundedRect(bx + 2, by + 1, Math.max(0, 88 * k - 4), 4, 2);
    } else { this.restT = 0; if (this.restBar) this.restBar.clear(); }
    if (this.restT >= 1.5) { this.clear(); return; }
    if (this.floorTouch.size > 0 && !onC && sp < 1.5) { this.floorT += dt / 1000; if (this.floorT > 1.2) { this.fail('매트 대신 바닥에 내려앉았어요'); return; } } else this.floorT = 0;
    if (this.taps >= this.st.limit && sp < 0.6 && !onC) { this.idleT += dt / 1000; if (this.idleT > 2) this.fail('탭을 다 썼어요'); } else this.idleT = 0;
  }
  clear() {
    this.state = 'clear'; this.keyT = this.time.now - 1500; const r = this.robot; r.setExpr('happy'); if (this.restBar) this.restBar.clear();
    const stars = this.starsNow(); Save.setStars(this.st.id, stars); Sfx.clear();
    r.juiceTarget = stars / 3 + 0.001;
    const p = r.refPos(); this.fx.bubble.explode(8, p.x, p.y - 6 * S);
    this.fx.conf.explode(40, W / 2, H * 0.62);
    const h = r.headPos();
    const bub = this.add.container(h.x + 96, h.y - 70).setDepth(70); bub.isSpeech = true;
    const bt = txt(this, 0, 0, '휴...', 34, '#203A61'); const bg = this.add.graphics(); const bw = bt.width + 30, bh = 60;
    bg.fillStyle(0x000000, 0.15).fillRoundedRect(-bw / 2, -bh / 2 + 4, bw, bh, 30).fillStyle(0xffffff, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 30).fillTriangle(-bw / 2 + 18, bh / 2 - 6, -bw / 2 + 40, bh / 2 - 6, -bw / 2 + 6, bh / 2 + 16);
    bub.add([bg, bt]); bub.setScale(0.4); this.tweens.add({ targets: bub, scale: 1, duration: 260, ease: 'Back.Out' });
    this.time.delayedCall(700, () => this.showResult(true, stars));
    this.exposeState();
  }
  fail(reason) {
    if (this.state !== 'play') return;
    this.state = 'fail'; this.keyT = this.time.now; const r = this.robot;
    if (r.expr !== 'dizzy') r.setExpr('sad'); else r.auto = false;
    this.time.delayedCall(1100, () => { if (this.state === 'fail' && !this.replaying) r.setExpr('sad'); });
    r.juiceTarget = 0; Sfx.fail(); Sfx.gulp();
    this.cameras.main.shake(250, 0.015);
    this.failReason = reason;
    this.time.delayedCall(900, () => this.showResult(false, 0, reason));
    this.exposeState();
  }
  showResult(win, stars, reason) {
    this.recording = false; this.clearArrow();
    const before = new Set(this.children.list);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x101a2a, 0.5).setDepth(100); dim.alpha = 0; this.tweens.add({ targets: dim, alpha: 1, duration: 220 });
    const P = this.add.container(W / 2, 600).setDepth(101);
    P.add(img(this, 0, 0, 'ui_panel'));
    P.add(img(this, 0, -282, win ? 'ui_ribbon_win' : 'ui_ribbon_fail'));
    P.add(txt(this, 0, -272, win ? '클리어!' : '실패…', 54, '#FFFFFF', { stroke: win ? '#2E8D7A' : '#B9516F', sw: 8, shadow: 3 }));
    const ui = {};
    const addBtn = (name, x, y, w, h, label, cb, o) => { const b = button(this, x, y, w, h, label, cb, Object.assign({ depth: 102 }, o)); b.name = name; ui[name] = [x, y]; return b; };
    if (win) {
      for (let k = 0; k < 3; k++) {
        const sx = W / 2 - 130 + k * 130, sy = 450 - (k === 1 ? 18 : 0);
        starImg(this, sx, sy, false, 'l').setDepth(102);
        if (k >= stars) continue; const s = starImg(this, sx, sy, true, 'l').setDepth(103).setScale(2.2 / TS).setAlpha(0);
        this.time.delayedCall(250 + k * 280, () => { this.tweens.add({ targets: s, scale: 1 / TS, alpha: 1, duration: 260, ease: 'Back.Out' }); this.fx.spark.explode(10, sx, sy); Sfx.star(k); });
      }
      txt(this, W / 2, 548, `탭 ${this.taps}번 · 별 3개 기준 ${this.st.t3}번`, 30, '#3B3F4A', { depth: 102 });
      const hasNext = this.idx < STAGES.length - 1;
      if (this.penalties || this.hintsUsed) txt(this, W / 2, 592, [this.penalties ? `순서 벌칙 +${this.penalties * ORDER_PENALTY}탭` : '', this.hintsUsed ? `힌트 ${this.hintsUsed}회 사용(무료)` : ''].filter(Boolean).join(' · '), 23, '#9A7A6A', { depth: 102 });
      addBtn('btnNext', W / 2, 700, 400, 100, hasNext ? '다음 스테이지' : '스테이지 선택', () => hasNext ? this.scene.start('Game', { idx: this.idx + 1 }) : this.scene.start('Select'), { size: 40, color: 'green', icon: 'next', iconSize: 20 });
      addBtn('btnReplay', 185, 820, 160, 76, '리플레이', () => this.startReplay(), { size: 27, color: 'yellow' });
      addBtn('btnRetry', 360, 820, 160, 76, '다시하기', () => this.scene.restart({ idx: this.idx }), { size: 27, color: 'pink' });
      addBtn('btnSelect', 535, 820, 160, 76, '선택', () => this.scene.start('Select'), { size: 27, color: 'navy' });
    } else {
      txt(this, W / 2, 440, reason || '', 34, '#3B3F4A', { depth: 102 });
      const hb = this.add.graphics().setDepth(101); hb.fillStyle(0xFFF4E2, 1).fillRoundedRect(W / 2 - 230, 486, 460, 116, 22).lineStyle(2, 0xF2D3A8, 1).strokeRoundedRect(W / 2 - 230, 486, 460, 116, 22);
      txt(this, W / 2, 544, '힌트: ' + this.st.hint, 24, '#7A5A3A', { depth: 102, style: { wordWrap: { width: 420 }, align: 'center' } });
      addBtn('btnRetry', W / 2, 680, 400, 104, '다시하기', () => this.scene.restart({ idx: this.idx }), { size: 42, color: 'orange', icon: 'retry', iconSize: 20 });
      addBtn('btnReplay', 245, 800, 210, 76, '리플레이', () => this.startReplay(), { size: 28, color: 'yellow' });
      addBtn('btnSelect', 475, 800, 210, 76, '스테이지 선택', () => this.scene.start('Select'), { size: 26, color: 'navy' });
    }
    Object.assign(window.__UI, ui);
    P.setScale(0.85).setAlpha(0); this.tweens.add({ targets: P, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
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
    this.ghosts = this.recObjs.map(r => img(this, 0, 0, r.key).setOrigin(r.ox, r.oy).setDepth(r.depth).setVisible(false));
    const ui = this.add.container(0, 0).setDepth(120);
    const bars = this.add.graphics(); bars.fillStyle(0x0B0F14, 0.82).fillRect(0, 0, W, 124).fillRect(0, H - 110, W, 110);
    const rec = this.add.circle(48, 58, 12, 0xE8483B); this.tweens.add({ targets: rec, alpha: 0.2, yoyo: true, repeat: -1, duration: 400 });
    const t1 = txt(this, 72, 58, `슬로 리플레이 ${REPLAY_SPEED}×`, 36, '#FFD27A', { ox: 0 });
    const t2 = txt(this, W / 2, H - 55, '화면을 탭하면 결과로 돌아가요', 27, '#FFFFFF');
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
    rp.prog.clear().fillStyle(0xffffff, 0.25).fillRoundedRect(40, 102, W - 80, 8, 4).fillStyle(0xFF8A1F, 1).fillRoundedRect(40, 102, (W - 80) * (rp.t - rp.start) / Math.max(1, rp.end - rp.start), 8, 4);
  }
  replayFx(e) {
    if (e.type === 'pop') { Sfx.pop(); this.fx.chips.explode(10, e.x, e.y); this.fx.dust.explode(5, e.x, e.y); }
    else { Sfx.boom(); this.boomFx(e.x, e.y, 2.2); }
  }
  endReplay() {
    if (!this.replaying) return;
    this.replaying = false;
    this.rp.ui.destroy(); this.ghosts.forEach(g => g.destroy()); this.ghosts = null;
    this.recObjs.forEach(r => { if (r.obj.active) { r.obj.setVisible(true); if (r.obj.fuse) r.obj.fuse.setVisible(true); if (r.obj.badge) r.obj.badge.setVisible(true); } });
    this.children.list.filter(o => o.isSpeech).forEach(o => o.setVisible(true));
    (this.resultObjs || []).forEach(o => o.active && o.setVisible(true));
    this.matter.world.resume();
    if (this.state === 'fail') this.robot.setExpr('sad'); else if (this.state === 'clear') this.robot.setExpr('happy');
    this.robot.update(0);
    this.exposeState();
  }
  exposeState() {
    window.__STATE = { scene: 'Game', stage: this.st.id, state: this.state, taps: this.taps, stars: this.starsNow(),
      penalties: this.penalties, hintsLeft: this.hintsLeft, hintsUsed: this.hintsUsed, nextOrder: this.nextOrderId(), arrow: this.arrow ? this.arrow.obj.bid : null,
      replaying: this.replaying, recFrames: this.rec ? this.rec.length : 0, result: !!this.resultObjs, expr: this.robot ? this.robot.expr : null,
      dbg: this.dbg, blocks: this.blocks.filter(b => b.active && b.removable).map(b => ({ id: b.bid, x: b.x, y: b.y, kind: b.kind })) };
  }
}

function boot() {
  if (window.__game) return;
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: W * Z, height: H * Z, backgroundColor: '#8FD3FF',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'matter', matter: { gravity: { y: 1 }, runner: { isFixed: true, fps: 60 }, debug: /debug/.test(location.search), enableSleeping: false } },
    input: { activePointers: 2 },
    render: { antialias: true, roundPixels: false },
    scene: [TitleScene, SelectScene, GameScene],
  });
  window.__game = game;
}
window.__blockPos = () => (window.__STATE && window.__STATE.blocks) || [];
window.__Z = Z;
(function waitFont() {
  let done = false; const go = () => { if (!done) { done = true; boot(); } };
  try { if (document.fonts && document.fonts.load) { Promise.race([document.fonts.load("40px 'Jua'", '러그돌 로봇 0123'), new Promise(r => setTimeout(r, 1500))]).then(go, go); } else go(); } catch (e) { go(); }
  setTimeout(go, 2500);
})();
