const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, globalShortcut, shell } = require('electron');
const path = require('path');
const { BackendManager } = require('./backend');
const { ConfigManager } = require('./config');

// ─── Constants ───────────────────────────────────────────────────────────────
const IS_DEV = process.env.ELECTRON_DEV === 'true';
const RENDERER_DEV_URL = 'http://localhost:4200';

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let splashWindow = null;
let tray = null;
let backendManager = new BackendManager();

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

// ─── APP STARTUP CORE ────────────────────────────────────────────────────────
async function startBackendAndUI() {
  // In dev mode the backend is already running via `npm run dev:backend` on port 8000.
  // Don't spawn a second copy — just reuse it.
  if (IS_DEV) {
    backendManager.port = 8000;
    createMainWindow();
    return;
  }

  // If not configured, we don't start the backend yet.
  // The main window will open and redirect to /setup.
  if (!ConfigManager.isConfigured()) {
    createMainWindow();
    return;
  }

  // 1. Show splash screen
  createSplashWindow();

  // 2. Start backend with user config
  try {
    const port = await backendManager.start({
      downloadPath: ConfigManager.get('downloadPath'),
      tempPath: ConfigManager.get('tempPath'),
      dbPath: ConfigManager.getDbPath(),
    });
    console.log(`Backend started on port ${port}`);
  } catch (err) {
    console.error('Failed to start backend:', err.message);
    dialog.showErrorBox(
        'Startup Error',
        `Failed to initialize the application:\n${err.message}\n\nPlease check your installation.`
    );
    app.quit();
    return;
  }

  // 3. Create main window
  createMainWindow();
}

// ─── Main Window ────────────────────────────────────────────────────────────
function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Video Downloader',
    backgroundColor: '#f8f9fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (IS_DEV) {
    mainWindow.loadURL(RENDERER_DEV_URL);
  } else {
    const indexPath = path.join(__dirname, '..', 'frontend', 'yt-interface', 'dist', 'yt-interface', 'browser', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Application Menu ────────────────────────────────────────────────────────
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Settings', click: () => { if (mainWindow) mainWindow.webContents.send('navigate', '/settings'); } },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'Learn More', click: async () => { await require('electron').shell.openExternal('https://github.com/Developer-Geekay/yt-downloader'); } }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── System Tray ────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDEwAAAhAAASyEsHQAAAAASUVORK5CYII=', 'base64')));
  const contextMenu = Menu.buildFromTemplate([
    { label: '🎬 Video Downloader', enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.webContents.send('navigate', '/settings'); } } },
    { label: 'Show Window', click: () => { if (mainWindow) mainWindow.show(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('Video Downloader');
  tray.setContextMenu(contextMenu);
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-backend-port', () => backendManager.port || 8000);
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('is-configured', () => ConfigManager.isConfigured());
  ipcMain.handle('get-app-config', () => ({
    downloadPath:     ConfigManager.get('downloadPath'),
    tempPath:         ConfigManager.get('tempPath'),
    defaultSubtitles: ConfigManager.get('defaultSubtitles') ?? false,
    proxy:            ConfigManager.get('proxy') ?? '',
  }));
  ipcMain.handle('check-dependencies', () => backendManager.checkDependencies());

  ipcMain.handle('restart-backend', async () => {
    if (IS_DEV) return backendManager.port; // dev backend is external
    if (backendManager) {
      backendManager.stop();
      await new Promise(r => setTimeout(r, 1000));
      return await backendManager.start({
        downloadPath: ConfigManager.get('downloadPath'),
        tempPath: ConfigManager.get('tempPath'),
        dbPath: ConfigManager.getDbPath(),
      });
    }
    return null;
  });


  ipcMain.handle('choose-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose Folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('save-setup-config', async (_, config) => {
    const success = ConfigManager.save(config);
    if (!success) return false;

    if (IS_DEV) return true; // dev backend is external — nothing to restart

    if (backendManager.process) {
      // Backend already running (settings update) — restart cleanly with new config
      backendManager.stop();
      await new Promise(r => setTimeout(r, 1000));
      await backendManager.start({
        downloadPath: ConfigManager.get('downloadPath'),
        tempPath: ConfigManager.get('tempPath'),
        dbPath: ConfigManager.getDbPath(),
      });
    } else {
      // Initial setup — backend not yet running, start everything
      startBackendAndUI();
    }
    return true;
  });

  ipcMain.handle('set-progress', (_, progress) => {
    if (mainWindow) mainWindow.setProgressBar(progress);
  });

  ipcMain.handle('show-in-folder', (_, filePath) => {
    shell.showItemInFolder(filePath);
  });
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupIPC();
  createMenu();
  createTray();
  startBackendAndUI();
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) startBackendAndUI();
  else mainWindow.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (backendManager) backendManager.stop();
});

