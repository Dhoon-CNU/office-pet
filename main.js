const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 290, H = 480, PET_W = 120;   // 창 크기(투명), 펫 캔버스 폭
const SIDE = (W - PET_W) / 2;           // 펫 좌우 여백 (화면 끝까지 걸어갈 수 있게)
const HOTKEY = 'Control+Alt+P';

let win = null, tray = null, dragTimer = null, mode = 'walk', updater = null, manualCheck = false, quitting = false;

app.setAppUserModelId('kr.dhoon.officepet');
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => showWin());
  app.whenReady().then(init);
}

/* ===== 저장 파일 (프로그램 폴더와 분리: %APPDATA%\OfficePet\save.json) ===== */
const savePath = () => path.join(app.getPath('userData'), 'save.json');
function readSave() { try { return JSON.parse(fs.readFileSync(savePath(), 'utf8')); } catch (e) { return null; } }
function writeSave(d) {
  try {
    if (win && !win.isDestroyed()) { const b = win.getBounds(); d.win = { x: b.x, y: b.y }; }
    const p = savePath(), tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, p);
  } catch (e) { }
}

/* ===== 위치 계산 ===== */
const areaOf = b => screen.getDisplayMatching(b).workArea;
function limits(wa) { return { minX: wa.x - SIDE, maxX: wa.x + wa.width - W + SIDE, bottomY: wa.y + wa.height - H }; }
function place(x, y) { if (win && !win.isDestroyed()) win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H }); }
function defaultPos() { const wa = screen.getPrimaryDisplay().workArea; const L = limits(wa); return { x: wa.x + wa.width - W - 40, y: L.bottomY }; }
function validPos(p) {
  if (!p || typeof p.x !== 'number') return null;
  const c = { x: p.x + W / 2, y: p.y + H - 40 };
  return screen.getAllDisplays().some(d => { const a = d.bounds; return c.x >= a.x && c.x <= a.x + a.width && c.y >= a.y && c.y <= a.y + a.height; }) ? p : null;
}

/* ===== 창 ===== */
function createWindow() {
  const saved = readSave();
  if (saved && saved.mode) mode = saved.mode;
  const pos = validPos(saved && saved.win) || defaultPos();
  win = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y,
    transparent: true, frame: false, resizable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, fullscreenable: false, show: false,
    backgroundColor: '#00000000', title: '사무실 펫',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); updateTray(); });
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); updateTray(); } });
}
function showWin() { if (!win) return; win.showInactive(); win.setAlwaysOnTop(true, 'floating'); updateTray(); }
function toggleWin() { if (!win) return; win.isVisible() ? win.hide() : showWin(); updateTray(); }
function send(ch, ...a) { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); }
function resetPos() { const p = defaultPos(); place(p.x, p.y); showWin(); }

/* ===== 트레이 ===== */
function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16, quality: 'best' });
}
function updateTray() {
  if (!tray) return;
  const visible = win && win.isVisible();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visible ? '숨기기 (Ctrl+Alt+P)' : '보이기 (Ctrl+Alt+P)', click: toggleWin },
    { label: '메뉴 열기', click: () => { showWin(); send('cmd', 'menu'); } },
    { type: 'separator' },
    { label: '걸어다니기', type: 'radio', checked: mode === 'walk', click: () => send('cmd', 'mode-walk') },
    { label: '앉아있기', type: 'radio', checked: mode === 'sit', click: () => send('cmd', 'mode-sit') },
    { label: '펫 위치 초기화', click: resetPos },
    { type: 'separator' },
    { label: '윈도우 시작 시 자동 실행', type: 'checkbox', checked: getAutostart(), click: i => setAutostart(i.checked) },
    { label: '업데이트 확인', click: () => checkUpdate(true) },
    { label: '버전 ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: '종료', click: () => { send('flush'); setTimeout(() => { quitting = true; app.quit(); }, 150); } }
  ]));
}
function getAutostart() { try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; } }
function setAutostart(on) { try { app.setLoginItemSettings({ openAtLogin: !!on }); } catch (e) { } updateTray(); return getAutostart(); }

/* ===== 자동 업데이트 (GitHub Releases) ===== */
function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', i => { if (manualCheck) send('msg', '새 버전 ' + i.version + ' 받는 중…'); });
    autoUpdater.on('update-not-available', () => { if (manualCheck) send('msg', '지금이 최신 버전이야 (' + app.getVersion() + ')'); manualCheck = false; });
    autoUpdater.on('update-downloaded', i => { send('update', i.version); manualCheck = false; });
    autoUpdater.on('error', () => { if (manualCheck) send('msg', '업데이트 확인 실패 (인터넷 또는 배포 설정 확인)'); manualCheck = false; });
    updater = autoUpdater;
    setTimeout(() => checkUpdate(false), 8000);
    setInterval(() => checkUpdate(false), 6 * 3600 * 1000);
  } catch (e) { updater = null; }
}
function checkUpdate(manual) {
  manualCheck = !!manual;
  if (!updater) { if (manual) send('msg', '개발용 실행이라 업데이트 확인은 건너뛰었어'); return; }
  updater.checkForUpdates().catch(() => { });
}

/* ===== 렌더러와 통신 ===== */
ipcMain.handle('load', () => readSave());
ipcMain.handle('save', (e, d) => { writeSave(d); });
ipcMain.on('save-sync', (e, d) => { writeSave(d); e.returnValue = true; });
ipcMain.on('set-ignore', (e, on) => { if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!on, { forward: true }); });
ipcMain.handle('walk', (e, dx) => {
  if (!win || win.isDestroyed()) return { hit: false };
  const b = win.getBounds(), L = limits(areaOf(b));
  let x = b.x + dx, hit = false;
  if (x <= L.minX) { x = L.minX; hit = true; }
  if (x >= L.maxX) { x = L.maxX; hit = true; }
  place(x, L.bottomY);
  return { hit };
});
ipcMain.on('drag-start', (e, ox, oy) => {
  clearInterval(dragTimer);
  dragTimer = setInterval(() => { const p = screen.getCursorScreenPoint(); place(p.x - ox, p.y - oy); }, 16);
});
ipcMain.handle('drag-end', () => { clearInterval(dragTimer); dragTimer = null; });
ipcMain.handle('snap-bottom', () => new Promise(resolve => {
  if (!win || win.isDestroyed()) return resolve();
  const b = win.getBounds(), L = limits(areaOf(b));
  const tx = Math.min(Math.max(b.x, L.minX), L.maxX);
  let y = b.y, v = 0;
  if (y >= L.bottomY) { place(tx, L.bottomY); return resolve(); }
  const t = setInterval(() => {
    v += 1.5; y = Math.min(L.bottomY, y + v); place(tx, y);
    if (y >= L.bottomY) { clearInterval(t); resolve(); }
  }, 16);
}));
ipcMain.on('hide', () => { if (win) { win.hide(); updateTray(); } });
ipcMain.on('mode', (e, m) => { mode = m === 'sit' ? 'sit' : 'walk'; updateTray(); });
ipcMain.handle('get-autostart', () => getAutostart());
ipcMain.handle('set-autostart', (e, on) => setAutostart(on));
ipcMain.handle('version', () => app.getVersion());
ipcMain.on('check-update', () => checkUpdate(true));

/* ===== 시작/종료 ===== */
function init() {
  createWindow();
  tray = new Tray(trayIcon());
  tray.setToolTip('사무실 펫');
  tray.on('click', toggleWin);
  updateTray();
  globalShortcut.register(HOTKEY, toggleWin);
  const refit = () => { if (!win || win.isDestroyed()) return; const b = win.getBounds(), L = limits(areaOf(b)); if (mode === 'walk') place(Math.min(Math.max(b.x, L.minX), L.maxX), L.bottomY); else if (!validPos(b)) resetPos(); };
  screen.on('display-metrics-changed', refit); screen.on('display-removed', refit);
  setupUpdater();
}
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
