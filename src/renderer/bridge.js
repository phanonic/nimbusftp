import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Tauri v2 IPC bridge exposing the window.api interface used by the renderer.
const call = async (channel, ...args) => {
  const r = await invoke('ipc_call', { channel, args });
  if (!r || !r.ok) throw new Error((r && r.error) || 'Bilinmeyen hata');
  return r.data;
};

window.api = {
  call,
  on: (channel, cb) => {
    let unlisten = null;
    let cancelled = false;
    listen(channel, (e) => cb(e.payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  },
  // Tauri, DataTransfer File nesnelerinden yerel yol vermez. Harici dosya
  // sürükleme ileride Tauri'nin yerel drag-drop olayıyla eklenecek.
  pathForFile: () => null,
  platform: 'win32',
};
