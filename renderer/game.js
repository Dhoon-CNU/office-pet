/* 사무실 펫 — 치이카와 7종 에디션 게임 로직 (3슬롯 다중 육성 지원) */
(function () {
  'use strict';
  const SPR = window.Sprites;

  /* ===== 설정값 (숫자만 바꿔서 밸런스 조정) ===== */
  const CFG = {
    WORK_START: 9, WORK_END: 18,                       // 근무시간 (평일)
    STAGE_MIN: { egg: 1080, baby: 1080, child: 1620 }, // 단계별 근무시간(분): 알 2일, 아기 2일, 어린이 3일
    FAST: 5,                                           // 빠른 모드: 실제 1초 = 근무 5분
    NEGLECT: 6,                                        // 알 단계 돌봄 횟수가 이보다 적으면 모몽가(도도/방치)
    COOLDOWN: 60000,                                   // 알 단계 돌봄 집계 간격(ms)
    DECAY: { full: 0.42, mood: 0.28, energy: 0.19 },   // 근무 1분당 감소량
    SLEEP: { energy: 0.6, full: 0.2 },
    POMO: { focus: 25, brk: 5 },                       // 뽀모도로(분)
    SPEED: { baby: 26, child: 34, adult: 40 }          // 걷는 속도(px/초)
  };
  const NEXT = { egg: 'baby', baby: 'child', child: 'adult' };
  const STAGE_KO = { egg: '알', baby: '아기', child: '어린이', adult: '어른' };
  const SC = 5, OY = 5;

  /* ===== 프로그램 연결 (브라우저로 열면 미리보기 모드) ===== */
  let webX = 0, webY = 0, webDrag = null;
  function applyWebPos() {
    if (window.officePet) return;
    const stg = document.getElementById('stage');
    if (stg) stg.style.transform = 'translate(calc(-50% + ' + Math.round(webX) + 'px), ' + Math.round(webY) + 'px)';
  }
  const api = window.officePet || {
    load: async () => { try { return JSON.parse(localStorage.getItem('officePet.chiikawa.v1')); } catch (e) { return null; } },
    save: async d => { try { localStorage.setItem('officePet.chiikawa.v1', JSON.stringify(d)); } catch (e) { } },
    saveSync: d => { try { localStorage.setItem('officePet.chiikawa.v1', JSON.stringify(d)); } catch (e) { } },
    setIgnore() { },
    walk: async dx => {
      const lim = Math.max(40, (window.innerWidth - 160) / 2);
      webX += dx;
      let hit = false;
      if (webX <= -lim) { webX = -lim; hit = true; }
      if (webX >= lim) { webX = lim; hit = true; }
      applyWebPos();
      return { hit };
    },
    dragStart(ox, oy) { webDrag = { ox, oy, startX: webX, startY: webY }; },
    dragEnd: async () => { webDrag = null; },
    snapBottom: async () => { webY = 0; applyWebPos(); },
    hide() { document.body.classList.add('hidden'); },
    setMode() { }, getAutostart: async () => false, setAutostart: async () => false,
    version: async () => '0.4.0 (3슬롯·치이카와)', checkUpdate() { }, on() { }
  };
  if (!window.officePet) {
    window.addEventListener('mousemove', e => {
      if (webDrag) {
        const lim = Math.max(40, (window.innerWidth - 140) / 2);
        webX = Math.max(-lim, Math.min(lim, e.clientX - window.innerWidth / 2));
        webY = Math.min(0, e.clientY - window.innerHeight + 75);
        applyWebPos();
      }
    });
  }

  /* ===== 상태 (펫 1마리 단위 + 전체 3슬롯 구조) ===== */
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dayKey(new Date());
  const freshEgg = (hatchMode, target) => ({
    prog: 0, feed: 0, play: 0, rest: 0, poke: 0, work: 0,
    hatchMode: hatchMode || 'random', // 'random' | 'care' | 'select'
    target: target || 'chiikawa',
    last: {}
  });
  const freshPet = (hatchMode, target) => ({
    stage: 'egg', species: null, egg: freshEgg(hatchMode, target),
    stats: { full: 75, mood: 75, energy: 85 },
    sleeping: false, stageMin: 0
  });
  function fresh() {
    return {
      v: 4, slots: [freshPet('random', 'chiikawa'), null, null], active: 0,
      dex: {}, fast: false, mode: 'walk', gfx: 'image', dayOff: null,
      todos: [], pomo: { state: 'idle', until: 0 }, count: { todo: 0, pomo: 0 }, daily: { day: today(), todo: 0, pomo: 0 },
      last: Date.now()
    };
  }
  let S = null, P = null, confirmBox = null;
  function normalizePet(p) {
    if (!p || typeof p !== 'object') return null;
    const fp = freshPet('random', 'chiikawa');
    Object.assign(fp, p);
    fp.egg = Object.assign(freshEgg('random', 'chiikawa'), p.egg || {});
    if (!SPR.ORDER.includes(fp.egg.target)) fp.egg.target = 'chiikawa';
    if (!['random', 'care', 'select'].includes(fp.egg.hatchMode)) fp.egg.hatchMode = 'random';
    if (fp.stage !== 'egg' && !SPR.ORDER.includes(fp.species)) fp.species = 'chiikawa';
    fp.stats = Object.assign({ full: 75, mood: 75, energy: 85 }, p.stats || {});
    return fp;
  }
  const usePet = () => {
    if (!Array.isArray(S.slots) || S.slots.length < 3) S.slots = [freshPet('random', 'chiikawa'), null, null];
    if (typeof S.active !== 'number' || S.active < 0 || S.active > 2) S.active = 0;
    if (!S.slots[S.active]) S.slots[S.active] = freshPet('random', 'chiikawa');
    P = S.slots[S.active];
  };
  function save() { if (S) api.save(JSON.parse(JSON.stringify(S))); }

  /* ===== 구버전 저장 데이터 호환 (단일 펫 v2/v3 → 1번 슬롯으로 자동 이전) ===== */
  function migrateSave(d) {
    if (!d) return null;
    const base = fresh();
    if (!Array.isArray(d.slots)) {
      const pet = normalizePet({
        stage: d.stage, species: d.species, egg: d.egg,
        stats: d.stats, sleeping: d.sleeping, stageMin: d.stageMin
      });
      ['stage', 'species', 'egg', 'stats', 'sleeping', 'stageMin'].forEach(k => delete d[k]);
      Object.assign(base, d);
      base.slots = [pet || freshPet('random', 'chiikawa'), null, null];
      base.active = 0;
    } else {
      Object.assign(base, d);
      base.slots = [0, 1, 2].map(i => normalizePet(d.slots[i]));
      if (!base.slots[0] && !base.slots[1] && !base.slots[2]) {
        base.slots[0] = freshPet('random', 'chiikawa');
      }
    }
    base.v = 4;
    if (!['image', 'pixel'].includes(base.gfx)) base.gfx = 'image';
    const cleanDex = {};
    for (const k of SPR.ORDER) {
      if (base.dex && base.dex[k]) cleanDex[k] = base.dex[k];
    }
    base.dex = cleanDex;
    return base;
  }

  /* ===== 슬롯 전환 (비활성 슬롯은 시간 멈춤·보관) ===== */
  function switchSlot(i) {
    if (hatching || i === S.active || i < 0 || i > 2) return;
    const isNew = !S.slots[i];
    if (isNew) S.slots[i] = freshPet('random', 'chiikawa');
    S.active = i;
    usePet();
    S.last = Date.now();
    anim = { type: null, until: 0 };
    beh = { s: 'idle', until: 0, dir: 1 };
    walking = false;
    confirmBox = null;
    if (isNew) {
      view = 'hatch';
      say((i + 1) + '번 슬롯에 새 알을 받았어! 부화 방식을 골라줘', 4000);
    } else {
      if (view === 'hatch' && P.stage !== 'egg') view = 'status';
      say((i + 1) + '번 슬롯: ' + (P.stage === 'egg' ? '알이 나왔어!' : SPR.META[P.species].name + ' 나왔어!'));
    }
    save(); renderPanel();
  }

  /* ===== 시간 ===== */
  function workMin(a, b) {
    if (b <= a) return 0;
    a = Math.max(a, b - 14 * 864e5);
    let tot = 0; const d = new Date(a); d.setHours(0, 0, 0, 0);
    while (d.getTime() < b) {
      const w = d.getDay();
      if (w >= 1 && w <= 5 && dayKey(d) !== S.dayOff) {
        const s = new Date(d); s.setHours(CFG.WORK_START, 0, 0, 0);
        const e = new Date(d); e.setHours(CFG.WORK_END, 0, 0, 0);
        const o = Math.min(b, e.getTime()) - Math.max(a, s.getTime());
        if (o > 0) tot += o;
      }
      d.setDate(d.getDate() + 1);
    }
    return tot / 6e4;
  }
  function isWork() {
    if (S.fast) return true;
    const d = new Date(), w = d.getDay(), h = d.getHours();
    return w >= 1 && w <= 5 && h >= CFG.WORK_START && h < CFG.WORK_END && S.dayOff !== today();
  }
  function offReason() {
    const w = new Date().getDay();
    if (S.dayOff === today()) return '오늘은 휴무… zZ';
    return (w === 0 || w === 6) ? '주말이야… zZ' : '퇴근했어… zZ';
  }
  function leaveText() {
    const d = new Date(), w = d.getDay();
    if (S.fast) return '빠른 모드 (테스트 중)';
    if (S.dayOff === today()) return '오늘은 휴무';
    if (w === 0 || w === 6) return '주말';
    const now = d.getHours() * 60 + d.getMinutes();
    if (now < CFG.WORK_START * 60) return '출근 전';
    if (now >= CFG.WORK_END * 60) return '퇴근 완료';
    const m = CFG.WORK_END * 60 - now;
    return '퇴근까지 ' + Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
  }

  /* ===== 부화 분기 (랜덤 / 돌봄 성향 / 캐릭터 직접 선택) ===== */
  function decideCare(ignoreNeglect, pet) {
    const e = (pet || P).egg;
    const t = e.feed + e.play + e.rest;
    const all = t + e.poke + (e.work || 0);
    if (!ignoreNeglect && all < CFG.NEGLECT) return 'momonga';
    if ((e.work || 0) >= 2 && (e.work || 0) >= e.feed && (e.work || 0) >= e.play) return 'rakko';
    if (t > 0 && e.feed / t >= 0.48) return 'kurimanju';
    if (t > 0 && e.play / t >= 0.48) return 'usagi';
    if (t > 0 && e.rest / t >= 0.48) return 'shisa';
    if (e.poke > t && all > 0) return 'hachiware';
    return 'chiikawa';
  }
  function decideSpecies(ignoreNeglect, pet) {
    const e = (pet || P).egg;
    if (e.hatchMode === 'select' && SPR.ORDER.includes(e.target)) {
      return e.target;
    }
    if (e.hatchMode === 'random') {
      const unowned = SPR.ORDER.filter(k => !S.dex[k]);
      const pool = (unowned.length > 0 && Math.random() < 0.7) ? unowned : SPR.ORDER;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return decideCare(ignoreNeglect, pet);
  }
  function eggHint(pet) {
    const e = (pet || P).egg;
    if (e.hatchMode === 'select' && SPR.ORDER.includes(e.target)) return e.target;
    if (e.hatchMode === 'random') return 'random';
    const all = e.feed + e.play + e.rest + e.poke + (e.work || 0), p = e.prog / CFG.STAGE_MIN.egg;
    if (all < 3 && p < 0.5) return 'neutral';
    return decideCare(p < 0.5, pet);
  }
  function hatchModeLabel(pet) {
    const e = (pet || P).egg;
    if (e.hatchMode === 'select') return '직접 선택 (' + SPR.META[e.target].name + ')';
    if (e.hatchMode === 'random') return '랜덤 부화';
    return '돌봄 성향 부화';
  }

  /* ===== 진행 (현재 화면에 나와 있는 활성 슬롯 P만 진행) ===== */
  let anim = { type: null, until: 0 }, hatching = false;
  const play = (type, ms) => { anim = { type, until: performance.now() + ms }; };
  function clampStats(pet) { const st = (pet || P).stats; for (const k of ['full', 'mood', 'energy']) st[k] = Math.max(0, Math.min(100, st[k])); }
  function advance(dm) {
    if (P.stage === 'egg') {
      P.egg.prog += dm;
      if (P.egg.prog >= CFG.STAGE_MIN.egg && !hatching) startHatch();
      return;
    }
    const st = P.stats;
    if (P.sleeping) {
      st.energy += dm * CFG.SLEEP.energy; st.full -= dm * CFG.SLEEP.full;
      if (st.energy >= 100) { st.energy = 100; P.sleeping = false; say('잘 잤다!'); }
    } else {
      st.full -= dm * CFG.DECAY.full; st.mood -= dm * CFG.DECAY.mood; st.energy -= dm * CFG.DECAY.energy;
      if (st.full < 20) st.mood -= dm * 0.2;
      if (st.energy <= 0) { st.energy = 0; P.sleeping = true; say('기운이 없어서 잠들었어'); }
    }
    clampStats(P);
    if (P.stage !== 'adult') {
      const rate = (st.full < 20 || st.mood < 20) ? 0.5 : 1;
      P.stageMin += dm * rate;
      if (P.stageMin >= CFG.STAGE_MIN[P.stage]) evolve();
    }
  }
  function completeHatch(pet) {
    pet = pet || P;
    const sp = decideSpecies(false, pet);
    Object.assign(pet, { stage: 'baby', species: sp, stats: { full: 75, mood: 80, energy: 85 }, sleeping: false, stageMin: 0 });
    S.dex[sp] = S.dex[sp] || { first: Date.now(), adult: false };
    hatching = false; play('joy', 1800); say(SPR.META[sp].born, 4000); save();
    if (view === 'hatch') view = 'status';
    renderPanel();
  }
  function startHatch(instant) {
    if (hatching) return;
    const pet = P; // 부화 시작 시점의 펫 고정
    if (instant) {
      completeHatch(pet);
      return;
    }
    hatching = true; play('hatch', 2400); say('어? 알이 흔들려…!', 2400);
    setTimeout(() => completeHatch(pet), 2400);
  }
  function evolve() {
    P.stage = NEXT[P.stage]; P.stageMin = 0;
    play('evolve', 1400);
    if (P.stage === 'adult') { S.dex[P.species].adult = true; say('다 컸어! 어른 ' + SPR.META[P.species].name + ' (도감에 ★ 등록)', 4500); }
    else say('쑥 자랐어! 이제 어린이야', 3500);
    save(); renderPanel();
  }

  /* ===== 돌보기 ===== */
  function canCount(k) { const now = Date.now(), cd = S.fast ? 3000 : CFG.COOLDOWN; if (now - (P.egg.last[k] || 0) >= cd) { P.egg.last[k] = now; return true; } return false; }
  function act(k) {
    if (!isWork()) { say('지금은 쉬는 시간이야 (평일 ' + CFG.WORK_START + '~' + CFG.WORK_END + '시 · 설정에서 빠른 모드를 켜면 바로 가능해)'); return; }
    if (hatching) return;
    if (P.stage === 'egg') {
      if (canCount(k)) P.egg[k]++;
      say({ feed: '알이 따뜻해진 것 같아', play: '알이 살짝 흔들렸어!', rest: '포근하게 덮어줬어' }[k]);
      play('wobble', 600);
    } else {
      const st = P.stats;
      if (k === 'feed') {
        if (P.sleeping) { say('자는 중이야…'); return; }
        if (st.full > 90) { say('배불러…'); st.mood -= 3; }
        else { st.full += 35; st.mood += 5; say('냠냠! 맛있다~'); play('eat', 2000); }
      } else if (k === 'play') {
        if (P.sleeping) { say('자는 중이야…'); return; }
        if (st.energy < 15) { say('너무 졸려…'); return; }
        st.mood += 25; st.energy -= 8; st.full -= 5; say('우와! 신난다!'); play('play', 2200);
      } else if (k === 'rest') {
        P.sleeping = !P.sleeping; say(P.sleeping ? '잘 자~ zZ' : '일어났어!');
      }
      clampStats(P);
    }
    save(); renderPanel();
  }
  function poke() {
    if (hatching) return;
    if (P.stage === 'egg') {
      if (!isWork()) { say('알도 쉬는 중… zZ'); return; }
      if (canCount('poke')) P.egg.poke++;
      say(['톡톡…', '안에서 꼬물거려!', '따뜻하다~'][Math.floor(Math.random() * 3)]);
      play('wobble', 600); save(); return;
    }
    if (!isWork()) { say(offReason()); return; }
    if (P.sleeping) { say('zZ… (쿨쿨 자는 중)'); return; }
    if (S.pomo.state === 'focus') { say(['집중 중이야!', '조금만 더 힘내자!', '타닥타닥…'][Math.floor(Math.random() * 3)]); return; }
    const pool = ['헤헤~', '왜 불렀어?', '오늘 일 잘 돼?', '같이 힘내자!'].concat(SPR.META[P.species].lines);
    P.stats.mood = Math.min(100, P.stats.mood + 2);
    say(pool[Math.floor(Math.random() * pool.length)]);
    play('joy', 1400); save();
  }
  function reward(mood, msg) {
    if (P.stage !== 'egg') { P.stats.mood += mood; clampStats(P); play('joy', 1600); }
    else { P.egg.work = (P.egg.work || 0) + 1; play('wobble', 600); }
    say(msg);
  }

  /* ===== 할 일 ===== */
  function rollDaily() {
    if (S.daily.day !== today()) S.daily = { day: today(), todo: 0, pomo: 0 };
    const t = today(), before = S.todos.length;
    S.todos = S.todos.filter(x => !x.done || x.doneDay === t);
    return before !== S.todos.length;
  }
  function addTodo(text) {
    text = (text || '').trim(); if (!text) return false;
    S.todos.push({ id: Date.now() + Math.random(), t: text.slice(0, 60), done: false, doneDay: null });
    save(); return true;
  }
  function toggleTodo(id, on) {
    const it = S.todos.find(x => String(x.id) === String(id)); if (!it) return;
    it.done = on; it.doneDay = on ? today() : null;
    if (on) { S.count.todo++; S.daily.todo++; reward(10, ['수고했어!', '하나 끝! 멋지다~', '착착 해내는 중!'][Math.floor(Math.random() * 3)]); }
    save();
  }
  function delTodo(id) { S.todos = S.todos.filter(x => String(x.id) !== String(id)); save(); }

  /* ===== 뽀모도로 ===== */
  const pomoDur = k => CFG.POMO[k] * (S.fast ? 1000 : 60000);
  function pomoStart() { S.pomo = { state: 'focus', until: Date.now() + pomoDur('focus') }; say('집중 시작! 같이 열심히 해보자', 2500); save(); }
  function pomoStop() { S.pomo = { state: 'idle', until: 0 }; say('타이머를 멈췄어'); save(); }
  function pomoTick(now) {
    const p = S.pomo;
    if (p.state === 'focus' && now >= p.until) {
      S.count.pomo++; S.daily.pomo++;
      S.pomo = { state: 'break', until: now + pomoDur('brk') };
      if (P.stage !== 'egg') { P.stats.energy -= 5; }
      reward(15, '집중 끝! ' + CFG.POMO.brk + '분 동안 푹 쉬자'); save();
    } else if (p.state === 'break' && now >= p.until) {
      S.pomo = { state: 'idle', until: 0 }; say('쉬는 시간 끝! 다시 달려볼까?', 4000); save();
    }
  }
  function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }

  /* ===== 알림 ===== */
  const notified = {};
  const TIPS = ['물 한 잔 마실 시간!', '어깨 한번 쭉 펴기~', '눈 좀 쉬어주자', '잠깐 일어나서 스트레칭!'];
  function noticeTick() {
    if (S.fast || !isWork() && new Date().getHours() !== CFG.WORK_END) return;
    const d = new Date(), w = d.getDay(); if (w === 0 || w === 6 || S.dayOff === today()) return;
    const h = d.getHours(), m = d.getMinutes(), key = today() + '-' + h + '-' + m;
    if (notified[key]) return;
    if (h === CFG.WORK_END - 1 && m === 50) { notified[key] = 1; say('퇴근 10분 전!', 5000); }
    else if (h === CFG.WORK_END && m === 0) { notified[key] = 1; play('joy', 2000); say('퇴근 시간이다! 오늘도 수고했어', 6000); }
    else if (m === 0 && h > CFG.WORK_START && h < CFG.WORK_END && h !== 12) { notified[key] = 1; say(TIPS[Math.floor(Math.random() * TIPS.length)], 4000); }
  }

  /* ===== 매초 ===== */
  function tick() {
    const now = Date.now();
    const dm = S.fast ? (now - S.last) / 1000 * CFG.FAST : workMin(S.last, now);
    S.last = now;
    if (dm > 0 && !hatching) advance(dm);
    pomoTick(now);
    noticeTick();
    if (rollDaily() && panelOpen && view === 'todo') renderPanel();
    if (panelOpen) liveRefresh();
  }

  /* ===== 말풍선 ===== */
  const bub = document.getElementById('bubble'); let bubT = 0, lastMsg = '';
  function say(txt, ms) {
    ms = ms || 2600; lastMsg = txt;
    const pm = document.getElementById('pmsg');
    if (panelOpen && pm) { pm.textContent = txt; return; }
    bub.textContent = txt; bub.classList.add('on');
    clearTimeout(bubT); bubT = setTimeout(() => bub.classList.remove('on'), ms);
  }

  /* ===== 그리기 ===== */
  const cv = document.getElementById('pet'), ctx = cv.getContext('2d');
  function px(c, x, y, col, sc) { sc = sc || SC; c.fillStyle = col; c.fillRect(x * sc, y * sc, sc, sc); }
  function blit(c, g, dx, dy, over, sc) { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const v = g[y][x]; if (v) px(c, x + dx, y + dy, over || v, sc); } }
  function pat(c, p, x0, y0, map) { p.forEach((row, r) => { for (let x = 0; x < row.length; x++) { const k = row[x]; if (k !== '.' && map[k]) px(c, x0 + x, y0 + r, map[k]); } }); }
  const HEART = ['.o.o.', 'ooooo', '.ooo.', '..o..'], ZZZ = ['oooo', '..o.', '.o..', 'oooo'], DROP = ['.o', 'oo'];
  const RICE = ['..oo..', '.owwo.', 'owwwwo', 'owwwwo', 'onnnno', '.oooo.'], BALL = ['.rr.', 'rwrr', 'rrrr', '.rr.'];
  const LAPTOP = ['..kkkkkkkk..', '..kssssssk..', '..kssssssk..', '..kkkkkkkk..', 'kkkkkkkkkkkk', '.kkkkkkkkkk.'];
  const SPARK = ['.o.', 'ooo', '.o.'];
  function shadow(w) { ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect((12 - w) * SC, (OY + 23) * SC, w * 2 * SC, SC); }

  function drawEgg(t) {
    const hint = eggHint(P), g = SPR.EGG[hint] || SPR.EGG.neutral;
    let dx = 0;
    if (anim.type === 'hatch') dx = Math.floor(t / 60) % 2 ? 1 : -1;
    else if (anim.type === 'wobble' && t < anim.until) dx = Math.floor(t / 80) % 2 ? 1 : -1;
    else if (isWork() && (t % 3000) < 300) dx = Math.floor(t / 90) % 2 ? 1 : -1;
    shadow(6);
    const flash = anim.type === 'hatch' && t > anim.until - 350;
    blit(ctx, g, dx, OY, flash ? '#FFFFFF' : null);
    const p = P.egg.prog / CFG.STAGE_MIN.egg, o = (SPR.EGGP[hint] || SPR.EGGP.neutral).o;
    if (p >= 0.8 && !flash) [[8, 11], [9, 12], [10, 11], [11, 12], [12, 11], [13, 12], [14, 11], [15, 12]].forEach(([x, y]) => px(ctx, x + dx, y + OY, o));
    if (p >= 0.95 && !flash) [[10, 13], [14, 13], [12, 10]].forEach(([x, y]) => px(ctx, x + dx, y + OY, o));
    if (!isWork()) pat(ctx, ZZZ, 18, 3 - Math.floor(t / 700) % 3, { o: '#8A93B8' });
  }

  function drawPetImage(t, sp, st, work, a) {
    let expr = 'normal', dy = 0, fx = null, fo = 0, laptop = false, walkTilt = 0;
    const blink = (t % 3600) < 130;
    if (dragging) { expr = 'eat'; dy = -2; }
    else if (!work || P.sleeping) { expr = 'sleep'; dy = (Math.floor(t / 1100) % 2) ? 1 : 0; fx = 'zzz'; }
    else if (a === 'joy' || a === 'play') { expr = 'joy'; const q = [0, -1, -3, -4, -3, -1]; dy = q[Math.floor(t / 85) % q.length]; fx = a === 'play' ? 'ball' : 'heart'; }
    else if (a === 'eat') { expr = (Math.floor(t / 180) % 2) ? 'eat' : 'normal'; fx = 'rice'; dy = (Math.floor(t / 180) % 2) ? 0 : -1; }
    else if (S.pomo.state === 'focus') { expr = blink ? 'sleep' : 'normal'; laptop = true; if ((t % 7000) < 900) fx = 'drop'; }
    else if (st.full < 30 || st.mood < 30) { expr = 'sad'; dy = 1; if (st.full < 30) fx = 'drop'; }
    else if (st.energy < 25) { expr = 'sleep'; dy = 1; }
    else if (walking) {
      expr = blink ? 'sleep' : 'normal';
      dy = (Math.floor(t / 160) % 2) ? -1 : 0;
      walkTilt = (Math.floor(t / 160) % 2) ? 0.04 : -0.04;
      fo = beh.dir;
    } else {
      dy = (Math.floor(t / 600) % 2) ? 0 : -1;
      if (beh.s === 'look') fo = (Math.floor(t / 900) % 2) ? 1 : -1;
      if (st.mood > 75 && (t % 5000) < 700) expr = 'joy';
      else if (blink) expr = 'sleep';
    }

    const sw = { baby: 4, child: 5, adult: 6 }[P.stage];
    shadow(dy < -2 ? sw - 2 : sw);
    if (fx === 'heart') pat(ctx, HEART, 18, 1 + (Math.floor(t / 200) % 2), { o: '#E8596B' });
    if (fx === 'zzz') pat(ctx, ZZZ, 18, 3 - Math.floor(t / 700) % 3, { o: '#8A93B8' });

    const flash = a === 'evolve' && Math.floor(t / 120) % 2 === 0;
    const imgSet = SPR.IMGS && SPR.IMGS[P.species];
    const img = imgSet && (imgSet[expr] || imgSet.normal);
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = { baby: 0.66, child: 0.84, adult: 1.0 }[P.stage] || 1.0;
      const dw = Math.round(96 * scale), dh = Math.round(108 * scale);
      const groundY = (OY + 23) * SC + 2;
      const drawY = groundY - dh + dy * SC;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(60, drawY + dh / 2);
      if (fo < 0) ctx.scale(-1, 1);
      if (walkTilt) ctx.rotate(walkTilt);
      if (flash) ctx.filter = 'brightness(2.5)';
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    const Y = OY + dy;
    if (flash) { pat(ctx, SPARK, 2, Y + 4, { o: '#F5C542' }); pat(ctx, SPARK, 19, Y + 8, { o: '#F5C542' }); return; }
    if (laptop) {
      const ly = OY + 17 + dy, glow = Math.floor(t / 300) % 3 === 0 ? '#C7E7FA' : '#9FD3F5';
      pat(ctx, LAPTOP, 6, ly, { k: '#5B6170', s: glow });
    }
    if (fx === 'rice') pat(ctx, RICE, 18, OY + 16, { o: '#4a4a4a', w: '#FFFFFF', n: '#2f3b2f' });
    if (fx === 'ball') { const by = OY + 12 - Math.round(Math.abs(Math.sin(t / 180)) * 6); pat(ctx, BALL, 19, by, { r: '#E8596B', w: '#FFFFFF' }); }
    if (fx === 'drop') pat(ctx, DROP, 19, Y + 6 + (Math.floor(t / 400) % 2), { o: '#7EC3F0' });
  }

  function drawPet(t) {
    const sp = SPR.SPR[P.species][P.stage], meta = SPR.META[P.species], st = P.stats, work = isWork();
    const a = (anim.type && t < anim.until) ? anim.type : null;
    if (S.gfx !== 'pixel' && SPR.IMGS && SPR.IMGS[P.species]) {
      drawPetImage(t, sp, st, work, a);
      return;
    }
    let eyes = 'open', mouth = 'smile', dy = 0, fx = null, feet = 'stand', fo = 0, laptop = false;
    if (dragging) { eyes = 'open'; mouth = 'o'; feet = 'dangle'; }
    else if (!work || P.sleeping) { eyes = 'sleep'; mouth = 'flat'; dy = (Math.floor(t / 1100) % 2) ? 1 : 0; fx = 'zzz'; feet = 'none'; }
    else if (a === 'joy' || a === 'play') { eyes = 'joy'; mouth = 'open'; const q = [0, -1, -3, -4, -3, -1]; dy = q[Math.floor(t / 85) % q.length]; fx = a === 'play' ? 'ball' : 'heart'; }
    else if (a === 'eat') { mouth = (Math.floor(t / 180) % 2) ? 'open' : 'flat'; fx = 'rice'; dy = (Math.floor(t / 180) % 2) ? 0 : -1; }
    else if (S.pomo.state === 'focus') { mouth = 'flat'; laptop = true; feet = 'none'; if ((t % 7000) < 900) fx = 'drop'; }
    else if (st.full < 30) { eyes = 'teary'; mouth = 'wavy'; dy = 1; fx = 'drop'; }
    else if (st.energy < 25) { eyes = 'tired'; mouth = 'flat'; dy = 1; }
    else if (st.mood < 30) { mouth = 'frown'; }
    else if (walking) { feet = 'walk'; dy = (Math.floor(t / 160) % 2) ? -1 : 0; fo = P.stage === 'baby' ? 0 : beh.dir; }
    else {
      dy = (Math.floor(t / 600) % 2) ? 0 : -1;
      if (beh.s === 'look' && P.stage !== 'baby') fo = (Math.floor(t / 900) % 2) ? 1 : -1;
      if (st.mood > 75 && (t % 5000) < 700) eyes = 'joy';
    }
    const sw = { baby: 4, child: 5, adult: 6 }[P.stage];
    shadow(dy < -2 ? sw - 2 : sw);
    if (fx === 'heart') pat(ctx, HEART, 18, 1 + (Math.floor(t / 200) % 2), { o: '#E8596B' });
    if (fx === 'zzz') pat(ctx, ZZZ, 18, 3 - Math.floor(t / 700) % 3, { o: '#8A93B8' });
    const Y = OY + dy, fb = Y + sp.bottom + 1;
    const flash = a === 'evolve' && Math.floor(t / 120) % 2 === 0;
    if (feet === 'stand') { [9, 10, 13, 14].forEach(x => px(ctx, x, fb, sp.o)); }
    else if (feet === 'walk') { const f = Math.floor(t / 160) % 2; if (f) { px(ctx, 9, fb, sp.o); px(ctx, 10, fb, sp.o); } else { px(ctx, 13, fb, sp.o); px(ctx, 14, fb, sp.o); } }
    else if (feet === 'dangle') { [9, 10, 13, 14].forEach(x => px(ctx, x, fb, sp.o)); [9, 14].forEach(x => px(ctx, x, fb + 1, sp.o)); }
    blit(ctx, sp.g, 0, Y, flash ? '#FFFFFF' : null);
    if (flash) { pat(ctx, SPARK, 2, Y + 4, { o: '#F5C542' }); pat(ctx, SPARK, 19, Y + 8, { o: '#F5C542' }); return; }

    const E = sp.eye, ink = meta.ink, blink = (t % 3600) < 130 && eyes === 'open';
    [E.l + fo, E.r + fo].forEach(x0 => {
      const y0 = E.y + Y, yb = y0 + E.h - 1;
      if (eyes === 'joy') { px(ctx, x0, y0 + 1, ink); px(ctx, x0 + 1, y0 + 1, ink); px(ctx, x0 - 1, y0 + 2, ink); px(ctx, x0 + 2, y0 + 2, ink); }
      else if (eyes === 'sleep') { px(ctx, x0 - 1, yb - 1, ink); px(ctx, x0, yb, ink); px(ctx, x0 + 1, yb, ink); px(ctx, x0 + 2, yb - 1, ink); }
      else if (blink) { px(ctx, x0, yb, ink); px(ctx, x0 + 1, yb, ink); }
      else if (eyes === 'tired') { px(ctx, x0 - 1, yb - 1, ink); px(ctx, x0, yb - 1, ink); px(ctx, x0 + 1, yb - 1, ink); px(ctx, x0 + 2, yb - 1, ink); px(ctx, x0, yb, ink); px(ctx, x0 + 1, yb, ink); }
      else {
        for (let k = 0; k < E.h; k++) { px(ctx, x0, y0 + k, ink); px(ctx, x0 + 1, y0 + k, ink); }
        px(ctx, x0, y0, '#FFFFFF');
        if (E.h > 2) px(ctx, x0 + 1, yb, 'rgba(255,255,255,0.45)');
        if (eyes === 'teary') px(ctx, x0 + 1, yb, '#9FD3F5');
      }
    });
    const M = sp.mouth, mx = M.x + fo, my = M.y + Y, red = '#D9534F';
    if (mouth === 'smile') { px(ctx, mx - 1, my, ink); px(ctx, mx + 2, my, ink); px(ctx, mx, my + 1, ink); px(ctx, mx + 1, my + 1, ink); }
    else if (mouth === 'open') { px(ctx, mx, my, ink); px(ctx, mx + 1, my, ink); px(ctx, mx, my + 1, red); px(ctx, mx + 1, my + 1, red); }
    else if (mouth === 'o') { px(ctx, mx, my, ink); px(ctx, mx + 1, my, ink); px(ctx, mx, my + 1, ink); px(ctx, mx + 1, my + 1, ink); }
    else if (mouth === 'frown') { px(ctx, mx, my, ink); px(ctx, mx + 1, my, ink); px(ctx, mx - 1, my + 1, ink); px(ctx, mx + 2, my + 1, ink); }
    else if (mouth === 'wavy') { px(ctx, mx - 1, my + 1, ink); px(ctx, mx, my, ink); px(ctx, mx + 1, my + 1, ink); px(ctx, mx + 2, my, ink); }
    else { px(ctx, mx, my + 1, ink); px(ctx, mx + 1, my + 1, ink); }
    if (eyes !== 'sleep' && mouth !== 'frown') { const B = sp.blush;[B.l + fo, B.l + 1 + fo, B.r + fo, B.r + 1 + fo].forEach(x => px(ctx, x, B.y + Y, meta.bl)); }
    if (laptop) {
      const ly = Y + sp.bottom - 4, glow = Math.floor(t / 300) % 3 === 0 ? '#C7E7FA' : '#9FD3F5';
      pat(ctx, LAPTOP, 6, ly, { k: '#5B6170', s: glow });
    }
    if (fx === 'rice') pat(ctx, RICE, 18, OY + 16, { o: '#4a4a4a', w: '#FFFFFF', n: '#2f3b2f' });
    if (fx === 'ball') { const by = OY + 12 - Math.round(Math.abs(Math.sin(t / 180)) * 6); pat(ctx, BALL, 19, by, { r: '#E8596B', w: '#FFFFFF' }); }
    if (fx === 'drop') pat(ctx, DROP, 19, Y + 6 + (Math.floor(t / 400) % 2), { o: '#7EC3F0' });
  }

  /* ===== 미니 캔버스 아이콘 렌더링 (도감·선택창) ===== */
  function drawThumb(c, spKey, locked) {
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    if (S.gfx !== 'pixel' && SPR.IMGS && SPR.IMGS[spKey] && SPR.IMGS[spKey].normal && SPR.IMGS[spKey].normal.complete && SPR.IMGS[spKey].normal.naturalWidth > 0) {
      x.save();
      x.imageSmoothingEnabled = false;
      if (locked) x.filter = 'brightness(0) opacity(0.22)';
      x.drawImage(SPR.IMGS[spKey].normal, 0, 0, c.width, c.height);
      x.restore();
    } else {
      const sc = Math.max(1, Math.floor(c.width / 24));
      blit(x, SPR.SPR[spKey].adult.g, 0, 0, locked ? '#C8C8D0' : null, sc);
    }
  }

  /* ===== 걷기 ===== */
  let beh = { s: 'idle', until: 0, dir: 1 }, walkAcc = 0, walkBusy = false, walking = false, lastT = 0;
  function canWalk(t) {
    return S.mode === 'walk' && P.stage !== 'egg' && isWork() && !P.sleeping && S.pomo.state !== 'focus' &&
      !panelOpen && !dragging && !(anim.type && t < anim.until) && P.stats.energy >= 25 && P.stats.full >= 30;
  }
  function behave(t, dt) {
    if (!canWalk(t)) { walking = false; if (beh.s === 'walk') beh.s = 'idle'; return; }
    if (t > beh.until) {
      if (beh.s === 'walk') beh = { s: Math.random() < 0.6 ? 'idle' : 'look', until: t + 3000 + Math.random() * 6000, dir: beh.dir };
      else beh = { s: 'walk', until: t + 2000 + Math.random() * 5000, dir: Math.random() < 0.5 ? -1 : 1 };
    }
    walking = beh.s === 'walk';
    if (!walking) return;
    walkAcc += beh.dir * CFG.SPEED[P.stage] * dt / 1000;
    const step = Math.trunc(walkAcc);
    if (step !== 0 && !walkBusy) {
      walkAcc -= step; walkBusy = true;
      api.walk(step).then(r => { walkBusy = false; if (r && r.hit) beh.dir = -beh.dir; }).catch(() => { walkBusy = false; });
    }
  }
  function setMode(m) {
    S.mode = m; api.setMode(m); beh = { s: 'idle', until: 0, dir: 1 };
    if (m === 'walk') api.snapBottom();
    say(m === 'walk' ? '산책 모드! 돌아다닐게' : '여기 가만히 앉아 있을게'); save(); renderPanel();
  }

  function loop(t) {
    const dt = Math.min(100, t - (lastT || t)); lastT = t;
    if (S && P) {
      behave(t, dt);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (P.stage === 'egg') drawEgg(t); else drawPet(t);
    }
    requestAnimationFrame(loop);
  }

  /* ===== 메뉴 ===== */
  const panel = document.getElementById('panel'); let panelOpen = false, view = 'status', panelPress = false;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function bar(label, v) { const n = Math.round(v); return '<div class="lbl"><span>' + label + '</span><span>' + n + '</span></div><div class="bar"><i class="' + (n < 30 ? 'low' : '') + '" style="width:' + n + '%"></i></div>'; }
  const VIEWS = {
    hatch() {
      const hm = P.egg.hatchMode || 'random';
      const tg = (m, txt) => '<button class="toggle' + (hm === m ? ' on' : '') + '" data-hm="' + m + '">' + txt + '</button>';
      let h = '<div class="lbl"><span>' + (S.active + 1) + '번 슬롯 부화 방식을 골라줘</span></div>';
      h += '<div class="row">' + tg('random', '🎲 랜덤') + tg('select', '🎯 직접 선택') + tg('care', '🌱 돌봄 성향') + '</div>';
      if (hm === 'select') {
        h += '<div class="sub note">태어날 치이카와 친구를 선택해줘:</div><div class="pick-grid">';
        SPR.ORDER.forEach(k => {
          const on = P.egg.target === k;
          h += '<div class="pick-card' + (on ? ' on' : '') + '" data-pick="' + k + '"><canvas width="48" height="54" data-sp="' + k + '" data-open="1"></canvas><span>' + SPR.META[k].name + '</span></div>';
        });
        h += '</div>';
      } else if (hm === 'random') {
        h += '<div class="sub note">치이카와·하치와레·우사기·쿠리만쥬·모몽가·라꼬·시사 7종 중 무작위로 태어나! (아직 못 만난 친구 확률 UP)</div>';
      } else {
        h += '<div class="sub note">알을 어떻게 돌보는지에 따라 7종으로 나뉘어:<br>· 밥주기→쿠리만쥬 / 놀아주기→우사기 / 쓰다듬기→하치와레<br>· 덮어주기→시사 / 할일·집중→라꼬 / 골고루→치이카와 / 방치→모몽가</div>';
      }
      h += '<div class="row" style="margin-top:8px"><button class="pri" data-a="hatchDone">알부터 키우기</button><button data-a="hatchNow">지금 바로 부화</button></div>';
      return h;
    },
    status() {
      const dis = isWork() ? '' : 'disabled'; let h = '';
      if (P.stage === 'egg') {
        h += bar('부화까지', Math.min(100, P.egg.prog / CFG.STAGE_MIN.egg * 100));
        h += '<div class="sub">' + SPR.HINT[eggHint(P)] + ' · <b>' + esc(hatchModeLabel(P)) + '</b></div>';
        h += '<div class="row"><button data-a="feed" ' + dis + '>밥주기</button><button data-a="play" ' + dis + '>놀아주기</button><button data-a="rest" ' + dis + '>덮어주기</button></div>';
        h += '<div class="row"><button data-a="openHatch">부화 방식 · 캐릭터 변경</button><button data-a="hatchNow">바로 깨우기</button></div>';
      } else {
        const st = P.stats;
        if (P.stage !== 'adult') h += bar(P.stage === 'baby' ? '어린이까지' : '어른까지', Math.min(100, P.stageMin / CFG.STAGE_MIN[P.stage] * 100));
        h += bar('배부름', st.full) + bar('기분', st.mood) + bar('기운', st.energy);
        h += '<div class="row"><button data-a="feed" ' + dis + '>밥주기</button><button data-a="play" ' + dis + '>놀아주기</button><button data-a="rest" ' + dis + '>' + (P.sleeping ? '깨우기' : '재우기') + '</button></div>';
        if (P.stage === 'adult') h += '<div class="row"><button class="pri" data-a="newegg">이 슬롯에 새 알 받기</button></div>';
      }
      h += '<div class="sub note">상단 ①·②·③ 버튼으로 3마리까지 번갈아 키울 수 있어 (쉬는 슬롯은 시간이 멈춰서 배고파지지 않아)</div>';
      if (!isWork()) h += '<div class="sub note">지금은 쉬는 시간이라 시간이 멈춰 있어 (평일 ' + CFG.WORK_START + '~' + CFG.WORK_END + '시 · 설정에서 빠른 모드를 켜면 바로 플레이 가능)</div>';
      return h;
    },
    todo() {
      let h = '<div class="todo-add"><input id="todoIn" maxlength="60" placeholder="할 일 입력 후 Enter"><button data-a="todoAdd">추가</button></div><ul class="todos">';
      if (!S.todos.length) h += '<li class="sub" style="border:none">아직 할 일이 없어</li>';
      S.todos.forEach(x => { h += '<li class="' + (x.done ? 'done' : '') + '"><label><input type="checkbox" data-t="' + x.id + '"' + (x.done ? ' checked' : '') + '><span title="' + esc(x.t) + '">' + esc(x.t) + '</span></label><button class="ic" data-del="' + x.id + '" title="삭제">×</button></li>'; });
      h += '</ul><div class="sub note">완료하면 현재 나와 있는 펫 기분이 올라가 · 오늘 완료 ' + S.daily.todo + '개</div>';
      return h;
    },
    pomo() {
      const p = S.pomo, left = p.state === 'idle' ? pomoDur('focus') : p.until - Date.now();
      const label = { idle: '대기 중', focus: '집중 중 — 펫도 같이 일하는 중', break: '쉬는 시간' }[p.state];
      let h = '<div class="pomo"><div class="big" id="pomoT">' + mmss(left) + '</div><div class="sub" id="pomoL">' + label + '</div></div>';
      h += '<div class="row">' + (p.state === 'idle' ? '<button data-a="pomoStart">집중 시작 (' + CFG.POMO.focus + '분)</button>' : '<button data-a="pomoStop">멈추기</button>') + '</div>';
      h += '<div class="sub note">끝까지 집중하면 현재 펫 기분이 크게 올라가 · 오늘 ' + S.daily.pomo + '회 / 누적 ' + S.count.pomo + '회</div>';
      return h;
    },
    dex() {
      const total = SPR.ORDER.length;
      const got = SPR.ORDER.filter(k => S.dex[k]).length, big = SPR.ORDER.filter(k => S.dex[k] && S.dex[k].adult).length;
      let h = '<div class="sub" style="margin-bottom:6px">만난 친구 ' + got + '/' + total + ' · 다 키운 친구 ' + big + '/' + total + '</div><div class="dex">';
      SPR.ORDER.forEach(k => {
        const d = S.dex[k], m = SPR.META[k];
        h += '<div><canvas width="48" height="54" data-sp="' + k + '"></canvas>' + (d ? '<b>' + m.name + (d.adult ? ' ★' : '') + '</b><br>' + m.desc : '<b>??? (' + m.sub + ')</b><br>' + m.desc) + '</div>';
      });
      return h + '</div>';
    },
    cfg() {
      const tg = (a, on, txt) => '<button class="toggle' + (on ? ' on' : '') + '" data-a="' + a + '">' + txt + '</button>';
      let h = '<div class="lbl">도트 그래픽 표현</div><div class="row">' + tg('gfx-image', S.gfx !== 'pixel', '원본 이미지 도트') + tg('gfx-pixel', S.gfx === 'pixel', '24px 코드 도트') + '</div>';
      h += '<div class="lbl" style="margin-top:6px">펫 위치</div><div class="row">' + tg('walk', S.mode === 'walk', '걸어다니기') + tg('sit', S.mode === 'sit', '앉아있기') + '</div>';
      h += '<div class="lbl" style="margin-top:6px">근무</div><div class="row">' + tg('dayoff', S.dayOff === today(), '오늘 휴무 ' + (S.dayOff === today() ? '켜짐' : '꺼짐')) + tg('fast', S.fast, '빠른 모드 ' + (S.fast ? '켜짐' : '꺼짐')) + '</div>';
      h += '<div class="lbl" style="margin-top:6px">프로그램</div><div class="row">' + tg('autostart', autostart, '자동 실행 ' + (autostart ? '켜짐' : '꺼짐')) + '<button data-a="update">업데이트 확인</button></div>';
      h += '<div class="sub note">근무시간 평일 ' + CFG.WORK_START + '~' + CFG.WORK_END + '시 · 숨기기 Esc / Ctrl+Alt+P · 버전 ' + esc(version) + '</div>';
      if (confirmBox === 'reset') {
        h += '<div class="row"><button class="pri" data-a="resetYes">3슬롯·도감 전부 초기화</button><button data-a="confirmCancel">취소</button></div>';
      } else if (confirmBox === 'newegg') {
        h += '<div class="row"><button class="pri" data-a="neweggYes">' + (S.active + 1) + '번 슬롯 새 알 받기</button><button data-a="confirmCancel">취소</button></div>';
      } else {
        h += '<div class="row"><button data-a="neweggAsk">현재 슬롯 새 알</button><button data-a="reset">전체 초기화</button></div>';
      }
      return h;
    }
  };
  function renderPanel() {
    if (!panelOpen) return;
    const title = P.stage === 'egg' ? '알 (' + hatchModeLabel(P) + ')' : SPR.META[P.species].name + ' · ' + STAGE_KO[P.stage];
    const slotBtns = [0, 1, 2].map(i => {
      const s = S.slots[i];
      const on = i === S.active;
      const empty = !s;
      const tip = (i + 1) + '번 슬롯: ' + (s ? (s.stage === 'egg' ? '알' : SPR.META[s.species].name + ' (' + STAGE_KO[s.stage] + ')') : '빈 슬롯 (클릭 시 새 알)');
      return '<button class="ic slot' + (on ? ' on' : '') + (empty ? ' empty' : '') + '" data-slot="' + i + '" title="' + esc(tip) + '">' + (i + 1) + '</button>';
    }).join('');
    const tabs = [['status', '상태'], ['todo', '할 일'], ['pomo', '집중'], ['dex', '도감'], ['cfg', '설정']];
    let h = '<div class="ph"><div><b>' + title + '</b><div class="sub" id="leave">' + leaveText() + '</div></div><div class="ph-btns">' + slotBtns + '<span class="slot-sep"></span><button class="ic" data-a="hide" title="숨기기 (Esc)">–</button><button class="ic" data-a="close" title="닫기">×</button></div></div>';
    h += '<div class="tabs">' + tabs.map(([k, l]) => '<button class="tab' + ((view === k || (view === 'hatch' && k === 'status')) ? ' on' : '') + '" data-v="' + k + '">' + l + '</button>').join('') + '</div>';
    h += '<div class="body">' + (VIEWS[view] ? VIEWS[view]() : VIEWS.status()) + '</div><div class="pmsg" id="pmsg">' + esc(lastMsgShown ? lastMsg : '') + '</div>';
    panel.innerHTML = h;
    panel.querySelectorAll('canvas[data-sp]').forEach(c => {
      const k = c.dataset.sp, open = c.dataset.open === '1';
      drawThumb(c, k, !open && !S.dex[k]);
    });
  }
  let lastMsgShown = false;
  function liveRefresh() {
    const lv = document.getElementById('leave'); if (lv) lv.textContent = leaveText();
    if (panelPress) return;
    if (view === 'status') renderPanel();
    else if (view === 'pomo') {
      const p = S.pomo, el = document.getElementById('pomoT');
      if (el && p.state !== 'idle') el.textContent = mmss(p.until - Date.now());
      if (el && (p.state === 'idle') !== !!panel.querySelector('[data-a="pomoStart"]')) renderPanel();
    }
  }
  function openPanel(v) { panelOpen = true; view = v || view; confirmBox = null; lastMsgShown = false; panel.classList.add('on'); bub.classList.remove('on'); renderPanel(); }
  function closePanel() { panelOpen = false; confirmBox = null; panel.classList.remove('on'); }
  function togglePanel() { panelOpen ? closePanel() : openPanel('status'); }

  let autostart = false, version = '';
  panel.addEventListener('mousedown', () => { panelPress = true; });
  window.addEventListener('mouseup', () => { panelPress = false; });
  panel.addEventListener('click', async e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      P.egg.hatchMode = 'select';
      P.egg.target = pick.dataset.pick;
      lastMsgShown = true;
      say(SPR.META[P.egg.target].name + ' 알을 선택했어!');
      save(); renderPanel(); return;
    }
    const hmBtn = e.target.closest('[data-hm]');
    if (hmBtn) {
      P.egg.hatchMode = hmBtn.dataset.hm;
      lastMsgShown = true;
      say('부화 방식: ' + hatchModeLabel(P));
      save(); renderPanel(); return;
    }
    const b = e.target.closest('button'); if (!b) return;
    lastMsgShown = true;
    if (b.dataset.slot != null) { switchSlot(+b.dataset.slot); return; }
    if (b.dataset.v) { confirmBox = null; view = b.dataset.v; renderPanel(); if (view === 'todo') { const i = document.getElementById('todoIn'); if (i) i.focus(); } return; }
    if (b.dataset.del) { delTodo(b.dataset.del); renderPanel(); return; }
    const a = b.dataset.a;
    if (a === 'feed' || a === 'play' || a === 'rest') act(a);
    else if (a === 'close') closePanel();
    else if (a === 'hide') { closePanel(); api.hide(); }
    else if (a === 'openHatch') { view = 'hatch'; renderPanel(); }
    else if (a === 'hatchDone') { view = 'status'; say('부화 설정 완료! ' + hatchModeLabel(P)); save(); renderPanel(); }
    else if (a === 'hatchNow') { startHatch(true); }
    else if (a === 'todoAdd') { const i = document.getElementById('todoIn'); if (addTodo(i.value)) { renderPanel(); const n = document.getElementById('todoIn'); if (n) n.focus(); } }
    else if (a === 'pomoStart') { pomoStart(); renderPanel(); }
    else if (a === 'pomoStop') { pomoStop(); renderPanel(); }
    else if (a === 'walk' || a === 'sit') setMode(a);
    else if (a === 'gfx-image') { S.gfx = 'image'; say('원본 이미지 도트 모드로 바꿨어!'); save(); renderPanel(); }
    else if (a === 'gfx-pixel') { S.gfx = 'pixel'; say('24px 코드 도트 모드로 바꿨어!'); save(); renderPanel(); }
    else if (a === 'dayoff') { S.dayOff = S.dayOff === today() ? null : today(); S.last = Date.now(); say(S.dayOff ? '오늘은 푹 쉬자! 시간도 멈출게' : '휴무 해제! 다시 출근 모드'); save(); renderPanel(); }
    else if (a === 'fast') { S.fast = !S.fast; S.last = Date.now(); say(S.fast ? '빠른 모드 켜짐' : '빠른 모드 꺼짐'); save(); renderPanel(); }
    else if (a === 'autostart') { autostart = await api.setAutostart(!autostart); say(autostart ? '윈도우 켤 때 같이 켜질게' : '자동 실행 껐어'); renderPanel(); }
    else if (a === 'update') { api.checkUpdate(); say('업데이트 확인 중…'); }
    else if (a === 'neweggAsk') { confirmBox = 'newegg'; renderPanel(); }
    else if (a === 'newegg' || a === 'neweggYes') {
      const hm = P.egg ? P.egg.hatchMode : 'random';
      const tgt = P.egg ? P.egg.target : 'chiikawa';
      S.slots[S.active] = freshPet(hm, tgt);
      usePet(); confirmBox = null;
      save(); view = 'hatch'; renderPanel();
      say((S.active + 1) + '번 슬롯에 새 알을 받았어! 부화 방식을 골라줘');
    }
    else if (a === 'reset') { confirmBox = 'reset'; renderPanel(); }
    else if (a === 'confirmCancel') { confirmBox = null; renderPanel(); }
    else if (a === 'resetYes') {
      const mode = S.mode, gfx = S.gfx;
      S = fresh(); S.mode = mode; S.gfx = gfx;
      usePet(); confirmBox = null;
      save(); view = 'hatch'; renderPanel();
      say('처음부터 다시 시작! 부화 방식을 골라줘');
    }
  });
  panel.addEventListener('change', e => {
    const c = e.target; if (c.dataset && c.dataset.t) { lastMsgShown = true; toggleTodo(c.dataset.t, c.checked); renderPanel(); }
  });
  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'todoIn') { lastMsgShown = true; if (addTodo(e.target.value)) { renderPanel(); const n = document.getElementById('todoIn'); if (n) n.focus(); } }
    e.stopPropagation();
  });

  /* ===== 마우스: 클릭 통과, 드래그, 클릭 ===== */
  let down = null, dragging = false, ignoring = true;
  function interactive(x, y) {
    if (dragging || down) return true;
    const el = document.elementFromPoint(x, y); if (!el) return false;
    if (el.closest('#panel') || el.id === 'menuBtn') return true;
    if (el === cv) {
      const r = cv.getBoundingClientRect(), cx = Math.floor((x - r.left) * cv.width / r.width), cy = Math.floor((y - r.top) * cv.height / r.height);
      try { const d = ctx.getImageData(Math.max(0, cx - 4), Math.max(0, cy - 4), 9, 9).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; } catch (e) { return true; }
    }
    return false;
  }
  function setIgnore(on) { if (on !== ignoring) { ignoring = on; api.setIgnore(on); } }
  document.addEventListener('mousemove', e => {
    setIgnore(!interactive(e.clientX, e.clientY));
    if (down && !dragging && Math.hypot(e.screenX - down.sx, e.screenY - down.sy) > 4) { dragging = true; closePanel(); api.dragStart(down.x, down.y); }
  });
  document.addEventListener('mouseleave', () => { if (!dragging && !down) setIgnore(true); });
  cv.addEventListener('mousedown', e => { if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY, sx: e.screenX, sy: e.screenY }; });
  window.addEventListener('mouseup', async e => {
    if (e.button !== 0) return;
    if (dragging) { dragging = false; down = null; await api.dragEnd(); if (S.mode === 'walk') api.snapBottom(); save(); }
    else if (down) { down = null; poke(); }
  });
  window.addEventListener('blur', () => { if (dragging) { dragging = false; down = null; api.dragEnd(); if (S && S.mode === 'walk') api.snapBottom(); } if (panelOpen && !panel.contains(document.activeElement)) closePanel(); });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); togglePanel(); });
  document.getElementById('menuBtn').addEventListener('click', togglePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePanel(); api.hide(); } });

  /* ===== 프로그램 쪽 신호 ===== */
  api.on('cmd', c => {
    if (!S) return;
    if (c === 'mode-walk') setMode('walk'); else if (c === 'mode-sit') setMode('sit');
    else if (c === 'menu') openPanel('status');
  });
  api.on('msg', t => say(t, 4000));
  api.on('update', v => say('새 버전 ' + v + ' 준비 완료! 다음 실행 때 적용돼', 6000));
  api.on('flush', () => { if (S && api.saveSync) api.saveSync(JSON.parse(JSON.stringify(S))); });

  /* ===== 시작 ===== */
  (async () => {
    let d = null; try { d = await api.load(); } catch (e) { }
    const first = !d;
    S = first ? fresh() : migrateSave(d);
    usePet();
    rollDaily();
    try { autostart = await api.getAutostart(); version = await api.version(); } catch (e) { }
    api.setMode(S.mode); api.setIgnore(true);
    if (S.mode === 'walk') api.snapBottom();
    tick(); setInterval(tick, 1000); setInterval(save, 10000);
    window.addEventListener('beforeunload', () => { if (api.saveSync) api.saveSync(JSON.parse(JSON.stringify(S))); });
    requestAnimationFrame(loop);
    if (first) {
      setTimeout(() => {
        openPanel('hatch');
        say('반가워! 1번 슬롯의 알 부화 방식(랜덤/직접 선택)을 골라줘', 5500);
      }, 400);
    }
    else if (!isWork()) setTimeout(() => say(P.stage === 'egg' ? '알도 쉬는 중… zZ' : offReason()), 500);
    else setTimeout(() => say(P.stage === 'egg' ? '좋은 아침!' : ['출근했어? 좋은 아침!', '오늘도 같이 힘내자!', '왔구나! 반가워~'][Math.floor(Math.random() * 3)]), 500);
  })();
})();
