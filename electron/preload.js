const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure context bridge — exposes only specific APIs to the renderer.
 * The Angular app accesses these via `window.electronAPI`.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Get the backend port (dynamically assigned)
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),

  // Open native directory picker
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),

  // Get app version string
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Check if app is configured
  isConfigured: () => ipcRenderer.invoke('is-configured'),

  // Check system dependencies (Python, FFmpeg)
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),

  // Save setup configuration (first launch)

  saveSetupConfig: (config) => ipcRenderer.invoke('save-setup-config', config),

  // Get current config
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),

  // Restart backend
  restartBackend: () => ipcRenderer.invoke('restart-backend'),

  // Listen for navigation requests from main
  onNavigate: (callback) => ipcRenderer.on('navigate', (_, path) => callback(path)),

  // Set taskbar download progress (0-1, or -1 to clear)
  setProgress: (progress) => ipcRenderer.invoke('set-progress', progress),



  // Check if running inside Electron
  isElectron: true,
});
