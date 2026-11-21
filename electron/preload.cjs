const { contextBridge, ipcRenderer } = require('electron');

// Get port injected via process environment or commandline
const injectedPort = process.env.DESKTOP_PORT || '3000';
const apiUrl = `http://127.0.0.1:${injectedPort}/api`;
const socketUrl = `http://127.0.0.1:${injectedPort}`;

contextBridge.exposeInMainWorld('DESKTOP_ENV', {
  isDesktop: true,
  port: parseInt(injectedPort, 10),
  apiUrl,
  socketUrl
});

contextBridge.exposeInMainWorld('desktopApi', {
  openExternal: (url) => ipcRenderer.invoke('desktop:openExternal', url),
  getVersion: () => ipcRenderer.invoke('desktop:getVersion'),
  getHwid: () => ipcRenderer.invoke('desktop:getHwid'),
  minimize: () => ipcRenderer.invoke('desktop:minimize'),
  maximize: () => ipcRenderer.invoke('desktop:maximize'),
  close: () => ipcRenderer.invoke('desktop:close')
});
