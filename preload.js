const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('officePet', {
  load: () => ipcRenderer.invoke('load'),
  save: d => ipcRenderer.invoke('save', d),
  saveSync: d => ipcRenderer.sendSync('save-sync', d),
  setIgnore: on => ipcRenderer.send('set-ignore', on),
  walk: dx => ipcRenderer.invoke('walk', dx),
  dragStart: (ox, oy) => ipcRenderer.send('drag-start', ox, oy),
  dragEnd: () => ipcRenderer.invoke('drag-end'),
  snapBottom: () => ipcRenderer.invoke('snap-bottom'),
  hide: () => ipcRenderer.send('hide'),
  setMode: m => ipcRenderer.send('mode', m),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: on => ipcRenderer.invoke('set-autostart', on),
  version: () => ipcRenderer.invoke('version'),
  checkUpdate: () => ipcRenderer.send('check-update'),
  on: (ch, fn) => ipcRenderer.on(ch, (e, ...args) => fn(...args))
});
