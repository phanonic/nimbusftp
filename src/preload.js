'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = async (ch, ...a) => {
  const r = await ipcRenderer.invoke(ch, ...a);
  if (!r || !r.ok) throw new Error((r && r.error) || 'Bilinmeyen hata');
  return r.data;
};

contextBridge.exposeInMainWorld('api', {
  call,
  on: (ch, cb) => {
    const f = (_e, d) => cb(d);
    ipcRenderer.on(ch, f);
    return () => ipcRenderer.removeListener(ch, f);
  },
  pathForFile: (f) => webUtils.getPathForFile(f),
  platform: process.platform,
});
