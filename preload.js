/**
 * Denoise AI - Preload Script
 *
 * Sets up a secure IPC bridge between main process and renderer.
 * Only allowed APIs are exposed to the renderer via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('denoiseAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  // Report NC status
  sendNCStatus: (data) => ipcRenderer.send('nc-status', data),

  // Listen for NC toggle from main process (system tray)
  onToggleNC: (callback) => {
    ipcRenderer.on('toggle-nc', (event, enabled) => callback(enabled));
  },

  // Set language (for tray menu)
  setLanguage: (lang) => ipcRenderer.send('set-language', lang),

  // Report whether the audio pipeline is running (used for tray icon state)
  sendAudioRunning: (running) => ipcRenderer.send('audio-running', running)
});
