const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    // We keep config.json in userData for persistence, 
    // but the database and temp files can be elsewhere.
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'config.json');
    
    // Application root (where the exe/source is)
    this.appRoot = path.dirname(app.getPath('exe'));
    if (process.env.ELECTRON_DEV === 'true') {
      this.appRoot = path.join(__dirname, '..');
    }

    this.defaultConfig = {
      downloadPath: path.join(os.homedir(), 'Downloads', 'VideoDownloader'),
      tempPath: os.tmpdir(), // Use system default temp
      isConfigured: false,
    };
    this.config = this.load();
  }

  load() {
    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...this.defaultConfig, ...JSON.parse(data) };
      } catch (err) {
        console.error('Failed to load config:', err);
        return this.defaultConfig;
      }
    }
    return this.defaultConfig;
  }

  save(newConfig) {
    this.config = { ...this.config, ...newConfig, isConfigured: true };
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save config:', err);
      return false;
    }
  }

  get(key) {
    return this.config[key];
  }

  getDbPath() {
    // Database inside application installed location (data/app.db)
    const dbDir = path.join(this.appRoot, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    return path.join(dbDir, 'app.db');
  }

  isConfigured() {
    return this.config.isConfigured;
  }
}

module.exports = { ConfigManager: new ConfigManager() };

