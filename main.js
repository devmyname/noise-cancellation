/**
 * Denoise AI - Main Process
 *
 * Electron main process:
 *   - BrowserWindow management
 *   - System tray integration
 *   - IPC communication with renderer
 *   - Window size and position management
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const isDev = process.argv.includes('--dev') || process.env.ELECTRON_DEV === '1';

// ========== Single Instance Lock ==========
// Prevent multiple instances — if already running, focus the existing window.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Autoplay policy - prevents AudioContext from being suspended
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;
let tray = null;
let currentLang = 'en';
let ncEnabled = true;
let audioRunning = false;
let trayIcons = { enabled: null, disabled: null };

// Tray menu translations
const trayStrings = {
  en: { title: 'Denoise AI', show: 'Show', nc: 'Noise Cancellation', exit: 'Exit' },
  tr: { title: 'Denoise AI', show: 'Göster', nc: 'Gürültü Engelleme', exit: 'Çıkış' }
};

function getTrayText(key) {
  return (trayStrings[currentLang] || trayStrings.en)[key] || key;
}

function createTrayCircleIcon({ r, g, b }) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist < size / 2 - 1) {
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = 255;
      } else {
        buf[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function updateTrayIcon() {
  if (!tray) return;
  const shouldShowEnabled = audioRunning && ncEnabled;
  tray.setImage(shouldShowEnabled ? trayIcons.enabled : trayIcons.disabled);
}

function setNCEnabled(enabled) {
  ncEnabled = Boolean(enabled);
  if (tray) {
    updateTrayIcon();
    updateTrayMenu();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 650,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.on('did-finish-load', () => {
      try {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      } catch (e) {
        console.warn('[Main] Failed to open DevTools:', e);
      }
    });
  }

  // Renderer crash/hang detection
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] Renderer process gone:', details.reason);
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Main] Renderer unresponsive!');
  });
  mainWindow.webContents.on('responsive', () => {});

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create 16x16 RGBA tray icons
  trayIcons.enabled = createTrayCircleIcon({ r: 34, g: 197, b: 94 });   // green
  trayIcons.disabled = createTrayCircleIcon({ r: 239, g: 68, b: 68 });  // red
  tray = new Tray(trayIcons.disabled);

  updateTrayIcon();

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: getTrayText('title'),
      enabled: false
    },
    { type: 'separator' },
    {
      label: getTrayText('show'),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: getTrayText('nc'),
      type: 'checkbox',
      checked: ncEnabled,
      click: (item) => {
        setNCEnabled(item.checked);
        if (mainWindow) {
          mainWindow.webContents.send('toggle-nc', item.checked);
        }
      }
    },
    { type: 'separator' },
    {
      label: getTrayText('exit'),
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Denoise AI');
  tray.setContextMenu(contextMenu);
}

// ========== IPC Handlers ==========

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

// NC status
ipcMain.on('nc-status', (event, data) => {
  const enabled = typeof data === 'boolean' ? data : data?.enabled;
  setNCEnabled(enabled);
});

// Audio pipeline running state (used for tray icon)
ipcMain.on('audio-running', (event, running) => {
  audioRunning = Boolean(running);
  updateTrayIcon();
});

// Language change from renderer
ipcMain.on('set-language', (event, lang) => {
  if (lang && trayStrings[lang]) {
    currentLang = lang;
    updateTrayMenu();
  }
});

// ========== App Lifecycle ==========

app.whenReady().then(() => {
  // Detect system language for initial tray
  const locale = app.getLocale();
  currentLang = locale.startsWith('tr') ? 'tr' : 'en';

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
