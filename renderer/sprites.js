/* 사무실 펫 — 도트 스프라이트 (DOM 없이 동작, 노드에서도 불러올 수 있음) */
(function (root) {
  const GW = 24;
  const K = { baby: 0.55, child: 0.78, adult: 1 };
  const STAGES = ['baby', 'child', 'adult'];

  function ell(cx, cy, rx, ry) { return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1; }
  function rell(cx, cy, rx, ry, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return (x, y) => { const dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c; return (u / rx) ** 2 + (v / ry) ** 2 <= 1; };
  }

  // 마스크 → 채색(밝은 면, 그림자, 외곽선 자동)
  function makeSprite(layers, post) {
    const g = Array.from({ length: GW }, () => Array(GW).fill(null));
    for (const L of layers) {
      const ins = (x, y) => x >= 0 && y >= 0 && x < GW && y < GW && L.m(x + 0.5, y + 0.5);
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < GW; y++) for (let x = 0; x < GW; x++) if (ins(x, y)) { sx += x; sy += y; n++; }
      const cx = sx / n, cy = sy / n;
      for (let y = 0; y < GW; y++) for (let x = 0; x < GW; x++) {
        if (!ins(x, y)) continue;
        let c = L.p.b;
        if (!ins(x, y + 1) || !ins(x, y + 2)) c = L.p.s;
        if (!ins(x + 1, y) && x > cx) c = L.p.s;
        if ((!ins(x - 1, y) || !ins(x, y - 1)) && x < cx && y < cy) c = L.p.h;
        g[y][x] = c;
      }
      for (let y = 0; y < GW; y++) for (let x = 0; x < GW; x++) {
        if (!ins(x, y) && (ins(x - 1, y) || ins(x + 1, y) || ins(x, y - 1) || ins(x, y + 1))) g[y][x] = L.p.o;
      }
    }
    if (post) post(g);
    return g;
  }
  const inner = (g, x, y, o) => g[y] && g[y][x] && g[y][x] !== o;

  // 눈·입·볼터치 위치 (좌우 대칭)
  function face(off, h, ey, my, blushDy, bo) {
    bo = bo == null ? 2 : bo;
    return { eye: { l: 12 - off, r: 10 + off, y: ey, h }, mouth: { x: 11, y: my }, blush: { l: 12 - off - bo, r: 10 + off + bo, y: my + blushDy } };
  }

  const P_TT = { o: '#8A6A3A', b: '#F6E7C8', h: '#FFF8EA', s: '#E3C99A' };
  const P_DB = { o: '#8C8C84', b: '#F7F7F0', h: '#FFFFFF', s: '#DEDED3' };
  const P_SSH = { o: '#4F7F3C', b: '#CFEBB9', h: '#EEF9E6', s: '#AED597' };
  const P_SSL = { o: '#3F6E30', b: '#86C96A', h: '#B5E39E', s: '#6BAF52' };
  const P_MG = { o: '#5E5E68', b: '#A9A9B3', h: '#CACAD2', s: '#8C8C96' };

  const BUILD = {
    tteok(st) {
      const k = K[st], bot = 21.6, rx = 10.5 * k, ryT = 7.5 * k, ryB = 6.5 * k, cy = bot - 6 * k;
      const g = makeSprite([{ m: (x, y) => { const dx = (x - 12) / rx, yy = y - cy, ry = yy < 0 ? ryT : ryB; return y < bot && dx * dx + (yy / ry) ** 2 <= 1; }, p: P_TT }], g => {
        if (st === 'baby') return;
        const dots = st === 'adult' ? [[6, 10], [16, 9], [19, 13], [4, 13], [11, 9], [14, 20], [8, 20], [19, 18], [3, 18]] : [[9, 12], [15, 12], [7, 17], [17, 18], [12, 20]];
        dots.forEach(([x, y]) => { if (inner(g, x, y, P_TT.o)) g[y][x] = '#D9A848'; });
      });
      const off = st === 'adult' ? 5 : st === 'child' ? 4 : 3, h = st === 'baby' ? 2 : 3, ey = Math.floor(cy) - 2;
      return Object.assign({ g, o: P_TT.o }, face(off, h, ey, ey + h + 1, -1));
    },
    dubu(st) {
      const k = K[st], w = 16 * k, hh = 17 * k, x0 = 12 - w / 2, x1 = 12 + w / 2, y1 = 22, y0 = y1 - hh, r = Math.max(1.5, 2.5 * k);
      const m = (x, y) => { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
      const top = Math.ceil(y0 - 0.5);
      const off = st === 'adult' ? 4 : 3, h = st === 'baby' ? 2 : 3, ey = top + Math.round(5 * k), my = ey + h + 1;
      const g = makeSprite([{ m, p: P_DB }], g => {
        if (st !== 'baby') {
          [top + 1, top + 2].forEach(y => { for (let x = 0; x < GW; x++) if (inner(g, x, y, P_DB.o)) g[y][x] = '#FFFFFF'; });
          for (let x = 0; x < GW; x++) if (inner(g, x, top + 3, P_DB.o)) g[top + 3][x] = '#E4E4DA';
        }
        const kn = my + 2, t = '#2F4A7A', T = '#3D5C94';
        if (st === 'adult') {
          [[11, kn], [12, kn]].forEach(([x, y]) => g[y][x] = t);
          [[11, kn + 1], [12, kn + 1], [11, kn + 2], [12, kn + 2], [10, kn + 3], [11, kn + 3], [12, kn + 3], [13, kn + 3], [10, kn + 4], [11, kn + 4], [12, kn + 4], [13, kn + 4], [11, kn + 5], [12, kn + 5]].forEach(([x, y]) => g[y][x] = T);
          [[10, kn - 1], [13, kn - 1]].forEach(([x, y]) => g[y][x] = '#FFFFFF');
        } else if (st === 'child') {
          [[11, kn], [12, kn]].forEach(([x, y]) => g[y][x] = t);
          [[11, kn + 1], [12, kn + 1], [11, kn + 2], [12, kn + 2]].forEach(([x, y]) => g[y][x] = T);
        }
      });
      return Object.assign({ g, o: P_DB.o }, face(off, h, ey, my, -1, st === 'baby' ? 1 : 2));
    },
    ssak(st) {
      const k = K[st], r = 8 * k, cy = 22.5 - r, top = cy - r;
      const layers = [];
      if (st === 'baby') layers.push({ m: rell(13.9, top - 1.6, 2.4, 1.4, -0.5), p: P_SSL });
      else {
        const lr = 4 * k, lry = Math.max(1.6, 2.2 * k), ly = top - 3.1 * k;
        layers.push({ m: rell(12 - 4.2 * k, ly, lr, lry, 0.45), p: P_SSL }, { m: rell(12 + 4.2 * k, ly, lr, lry, -0.45), p: P_SSL });
      }
      layers.push({ m: ell(12, cy, r, r), p: P_SSH });
      const g = makeSprite(layers, g => {
        const t0 = Math.floor(top), s0 = st === 'baby' ? t0 - 2 : Math.floor(top - 3.5 * k);
        const leaf = [P_SSL.o, P_SSL.b, P_SSL.s, P_SSL.h];
        for (let y = Math.max(0, s0); y < t0; y++) for (let x = 11; x <= 12; x++) { const c = g[y][x]; if (!c || leaf.includes(c)) g[y][x] = '#4F7F3C'; }
        if (st === 'adult') {
          [[11, 1], [12, 1]].forEach(([x, y]) => g[y][x] = '#F7B8CB');
          [[11, 2], [12, 2]].forEach(([x, y]) => g[y][x] = '#F49AB5');
          [[10, 1], [13, 1], [10, 2], [13, 2], [11, 0], [12, 0]].forEach(([x, y]) => { if (!g[y][x]) g[y][x] = '#B5577A'; });
        }
      });
      const off = st === 'adult' ? 4 : 3, h = st === 'baby' ? 2 : 3, ey = Math.floor(cy) - 2;
      return Object.assign({ g, o: P_SSH.o }, face(off, h, ey, ey + h + 1, -1, st === 'baby' ? 1 : 2));
    },
    mungi(st) {
      const k = K[st], R0 = 7.5 * k, f = st === 'baby' ? 0.5 : 0.8 * k, cy = 22.6 - R0 - f;
      const g = makeSprite([{ m: (x, y) => { const dx = x - 12, dy = y - cy, a = Math.atan2(dy, dx), R = R0 + f * Math.cos(a * 8); return dx * dx + dy * dy <= R * R; }, p: P_MG }], g => {
        if (st === 'adult') [[7, 8], [16, 8], [18, 17], [6, 18], [13, 20], [17, 11]].forEach(([x, y]) => { if (inner(g, x, y, P_MG.o)) g[y][x] = '#94949E'; });
        if (st === 'child') [[9, 12], [16, 13], [14, 20]].forEach(([x, y]) => { if (inner(g, x, y, P_MG.o)) g[y][x] = '#94949E'; });
      });
      const off = st === 'adult' ? 4 : 3, h = st === 'adult' ? 4 : st === 'child' ? 3 : 2, ey = Math.floor(cy) - (st === 'adult' ? 3 : 2);
      return Object.assign({ g, o: P_MG.o }, face(off, h, ey, ey + h + 1, -1, st === 'baby' ? 1 : 2));
    }
  };

  const META = {
    tteok: { name: '떡이', born: '떡이가 태어났어!', desc: '밥을 자주 챙겨주면', ink: '#3A2A1C', bl: '#F2A7A0', lines: ['쫀득!', '간식 없어?', '말랑말랑~'] },
    dubu: { name: '두부 사원', born: '두부 사원이 태어났어!', desc: '자주 들여다보면', ink: '#2A2A2E', bl: '#F4B3B3', lines: ['오늘도 출근 완료', '회의 언제 끝나…', '퇴근까지 화이팅', '결재 올렸어?'] },
    ssak: { name: '새싹이', born: '새싹이가 태어났어!', desc: '골고루 돌봐주면', ink: '#24321E', bl: '#F2B0A0', lines: ['광합성 중~', '물 한 잔 어때?', '쑥쑥 크는 중'] },
    mungi: { name: '먼지뭉치', born: '먼지뭉치가 태어났어!', desc: '거의 방치하면', ink: '#22222A', bl: '#D9A0B0', lines: ['먼지 아님, 친구임', '청소는 하지 마…', '키보드 밑이 그리워'] }
  };
  const ORDER = ['tteok', 'dubu', 'ssak', 'mungi'];

  const SPR = {};
  for (const sp of ORDER) {
    SPR[sp] = {};
    for (const st of STAGES) {
      const s = BUILD[sp](st);
      let bottom = 0;
      for (let y = 0; y < GW; y++) if (s.g[y].some(Boolean)) bottom = y;
      s.bottom = bottom;
      SPR[sp][st] = s;
    }
  }

  const EGGP = {
    neutral: { o: '#9B8B6E', b: '#FBF4E4', h: '#FFFFFF', s: '#EADFC6', sp: '#EFE3C8' },
    tteok: { o: '#9B8B6E', b: '#FBF4E4', h: '#FFFFFF', s: '#EADFC6', sp: '#D9A848' },
    dubu: { o: '#8C8C9A', b: '#F4F5F8', h: '#FFFFFF', s: '#DCDDE5', band: '#3D5C94' },
    ssak: { o: '#5E8F4A', b: '#EAF6E0', h: '#FFFFFF', s: '#CFE7BF', sp: '#8CCB6E' },
    mungi: { o: '#6E6E78', b: '#C9C9D0', h: '#E2E2E7', s: '#ADADB6', sp: '#A2A2AC' }
  };
  const eggMask = (x, y) => { const dy = y - 14, ry = 8.5, t = dy < 0 ? -dy / ry : 0, rx = 6.8 * (1 - 0.22 * t); return ((x - 12) / rx) ** 2 + (dy / ry) ** 2 <= 1; };
  const EGG = {};
  for (const key in EGGP) {
    const p = EGGP[key];
    EGG[key] = makeSprite([{ m: eggMask, p }], g => {
      if (p.sp) [[9, 9], [14, 10], [11, 13], [16, 15], [8, 16], [13, 18], [10, 20], [15, 20], [12, 8]].forEach(([x, y]) => { if (inner(g, x, y, p.o)) g[y][x] = p.sp; });
      if (p.band) for (let y = 14; y <= 15; y++) for (let x = 0; x < GW; x++) if (inner(g, x, y, p.o)) g[y][x] = p.band;
    });
  }
  const HINT = { neutral: '아직은 잘 모르겠어', tteok: '쫀득한 기운이 느껴져', dubu: '성실한 기운이 느껴져', ssak: '싱그러운 기운이 느껴져', mungi: '먼지 냄새가 나…' };

  const api = { GW, STAGES, SPR, META, ORDER, EGG, EGGP, HINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprites = api;
})(typeof window !== 'undefined' ? window : globalThis);
