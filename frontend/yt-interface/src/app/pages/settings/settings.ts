import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="settings-container">
      <div class="settings-card">
        <header>
          <h1>Settings</h1>
          <button class="close-btn" (click)="close()">✕</button>
        </header>

        <section>
          <h3>Download Folder</h3>
          <div class="input-group">
            <input type="text" [value]="downloadPath()" readonly>
            <button (click)="changeFolder()">Change</button>
          </div>
        </section>

        <section>
          <h3>Backend Status</h3>
          <div class="status-info">
            <span class="label">Running Port:</span>
            <span class="value">{{ port() }}</span>
          </div>
          <button class="secondary" (click)="restartBackend()">Restart Backend</button>
        </section>

        <hr>

        <section class="danger-zone">
          <h3>Danger Zone</h3>
          <p>This action cannot be undone.</p>
          <button class="danger" (click)="clearHistory()">Clear Download History</button>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .settings-container { display: flex; justify-content: center; align-items: center; height: 100vh; background: #020617; color: #f8fafc; }
    .settings-card { background: #0f172a; padding: 2rem; border-radius: 1rem; border: 1px solid #1e293b; width: 500px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    h1 { margin: 0; font-size: 1.25rem; }
    h3 { font-size: 0.9rem; margin-bottom: 0.5rem; color: #94a3b8; }
    .close-btn { background: transparent; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; }
    .input-group { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
    input { flex: 1; background: #1e293b; border: 1px solid #1e293b; border-radius: 0.4rem; padding: 0.6rem; color: #fff; font-size: 0.85rem; }
    button { background: #3b82f6; color: white; border: none; border-radius: 0.4rem; padding: 0.6rem 1rem; cursor: pointer; font-size: 0.85rem; }
    button.secondary { background: #334155; margin-top: 0.5rem; }
    button.danger { background: #ef4444; width: 100%; font-weight: 600; margin-top: 0.5rem; }
    .status-info { display: flex; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
    .label { color: #94a3b8; }
    hr { border: none; border-top: 1px solid #1e293b; margin: 2rem 0; }
    .danger-zone h3 { color: #f87171; }
    .danger-zone p { font-size: 0.8rem; color: #94a3b8; margin-top: -0.25rem; }
  `]
})
export class SettingsComponent implements OnInit {
  downloadPath = signal<string>('');
  port = signal<number>(0);

  constructor(private router: Router, private api: ApiService) {}

  async ngOnInit() {
    this.port.set(await (window as any).electronAPI.getBackendPort());
    // In a real app, we'd fetch the current config from Electron too
  }

  async changeFolder() {
    const path = await (window as any).electronAPI.chooseDirectory();
    if (path) {
      this.downloadPath.set(path);
      await (window as any).electronAPI.saveSetupConfig({ downloadPath: path });
    }
  }

  async restartBackend() {
    // This would trigger an IPC call we'll implement in main.js
    console.log('Restarting backend...');
  }

  async clearHistory() {
    if (confirm('Are you sure you want to clear all download history? This will not delete files from your disk.')) {
      this.api.deleteAllJobs().subscribe(() => {
        alert('History cleared successfully.');
      });
    }
  }

  close() {
    this.router.navigate(['/']);
  }
}
