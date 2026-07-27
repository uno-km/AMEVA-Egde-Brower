const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  existsSync: (pathStr) => ipcRenderer.sendSync('fs-exists', pathStr),
  mkdirSync: (pathStr, options) => ipcRenderer.sendSync('fs-mkdir', pathStr, options),
  writeFileSync: (pathStr, data) => ipcRenderer.sendSync('fs-write-file', pathStr, data),
  rmSync: (pathStr, options) => ipcRenderer.sendSync('fs-rm', pathStr, options),
  pathJoin: (...args) => ipcRenderer.sendSync('path-join', ...args),
  getDirname: () => ipcRenderer.sendSync('get-dirname'),
  
  spawnBrowser: (browserPath, args, sessionId) => ipcRenderer.invoke('spawn-browser', browserPath, args, sessionId),
  killProcess: (sessionId) => ipcRenderer.invoke('kill-process', sessionId),
  onBrowserExited: (callback) => ipcRenderer.on('browser-exited', (_event, sessionId) => callback(sessionId)),
  
  clearStorageData: (partition) => ipcRenderer.invoke('clear-storage', partition),
  setupSessionPolicy: (sessionId, proxyInput) => ipcRenderer.invoke('setup-session-policy', sessionId, proxyInput),
  
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  getWindowBounds: () => ipcRenderer.sendSync('get-window-bounds'),
  setWindowBounds: (bounds) => ipcRenderer.send('set-window-bounds', bounds),
  
  onOpenSettingsModal: (callback) => ipcRenderer.on('open-settings-modal', () => callback()),
  
  setOpacity: (val) => ipcRenderer.send('set-opacity', val)
});
