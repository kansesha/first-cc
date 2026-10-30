const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  minimize: () => ipcRenderer.send('window:minimize'),
  quitApp: () => ipcRenderer.send('window:quit'),
  togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
  isPinned: () => ipcRenderer.invoke('window:is-pinned'),
  onTrayToggle: (cb) => ipcRenderer.on('tray:toggle', () => cb()),
});
