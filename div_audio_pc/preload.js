'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('daa', {
  async call(name, ...args) {
    const r = await ipcRenderer.invoke('call', name, args);
    if (r.error) throw new Error(r.error);
    return r.value;
  },
  version: () => ipcRenderer.invoke('version'),
  on: cb => ipcRenderer.on('event', (_, name, data) => cb(name, data)),
  pathOf: file => webUtils.getPathForFile(file),
});
