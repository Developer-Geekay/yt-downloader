const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, globalShortcut } = require('electron');
const path = require('path');
const { BackendManager } = require('./backend');

// ─── Constants ───────────────────────────────────────────────────────────────
const IS_DEV = process.env.ELECTRON_DEV === 'true';
const RENDERER_DEV_URL = 'http://localhost:4200';

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let splashWindow = null;
let tray = null;
let backendManager = null;

// ─── Splash Screen ──────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// ─── Main Window ────────────────────────────────────────────────────────────
function createMainWindow(backendPort) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    show: false,
    title: 'Video Downloader',
    backgroundColor: '#020617', // slate-950
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load content
  if (IS_DEV) {
    mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(
      __dirname,
      '..',
      'frontend',
      'yt-interface',
      'dist',
      'yt-interface',
      'browser',
      'index.html'
    );
    mainWindow.loadFile(indexPath);
  }

  // Show main window when ready, close splash
  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // ─── Drag & Drop Support ──────────────────────────────────────────────
  mainWindow.webContents.on('will-navigate', (event) => {
    // Prevent file drops from navigating the window
    event.preventDefault();
  });

  // Handle dropped files/URLs via IPC
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          const urlInput = document.getElementById('url');
          if (urlInput) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeInputValueSetter.call(urlInput, text);
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });
      document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    `);
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── System Tray ────────────────────────────────────────────────────────────
function createTray() {
  // Use a simple 16x16 tray icon
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromBuffer(createDefaultIcon()) : trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🎬 Video Downloader',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Paste URL & Fetch',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.executeJavaScript(`
            navigator.clipboard.readText().then(text => {
              if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                const urlInput = document.getElementById('url');
                if (urlInput) {
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                  ).set;
                  nativeInputValueSetter.call(urlInput, text);
                  urlInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
            });
          `);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Video Downloader');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// Generate a simple default tray icon (1x1 fallback)
function createDefaultIcon() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDEwAAAhAAASyEsHQAAAAASUVORK5CYII=',
    'base64'
  );
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────
function setupIPC() {
  // Provide backend port to renderer
  ipcMain.handle('get-backend-port', () => {
    return backendManager ? backendManager.port : 8000;
  });

  // Native file dialog: choose download directory
  ipcMain.handle('choose-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose Download Folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Set taskbar progress
  ipcMain.handle('set-progress', (_, progress) => {
    if (mainWindow) {
      mainWindow.setProgressBar(progress);
    }
  });
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
function registerShortcuts() {
  // Ctrl+N to clear and start new download
  globalShortcut.register('CommandOrControl+N', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.webContents.executeJavaScript(`
        const clearBtn = document.querySelector('[title="Clear and Reset"]');
        if (clearBtn) clearBtn.click();
      `);
    }
  });
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1. Show splash screen
  createSplashWindow();

  // 2. Start backend
  backendManager = new BackendManager();
  try {
    const port = await backendManager.start();
    console.log(`Backend started on port ${port}`);
  } catch (err) {
    console.error('Failed to start backend:', err.message);
    dialog.showErrorBox(
      'Backend Error',
      `Failed to start the backend server:\n${err.message}\n\nThe app will continue but downloads won't work.`
    );
  }

  // 3. Setup IPC, tray & shortcuts
  setupIPC();
  createTray();
  registerShortcuts();

  // 4. Create main window
  createMainWindow(backendManager ? backendManager.port : 8000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow(backendManager ? backendManager.port : 8000);
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  if (backendManager) {
    backendManager.stop();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
