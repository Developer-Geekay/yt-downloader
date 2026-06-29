import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [],
  template: `
    <div class="w-full max-w-3xl mx-auto px-4 md:px-16 py-8 md:py-12 pb-24">

      <!-- Header -->
      <div class="mb-10">
        <h2 class="font-display text-3xl font-semibold text-on-surface mb-2">Settings</h2>
        <p class="text-base text-on-surface-variant">
          Manage your download preferences and advanced configurations.
        </p>
      </div>

      <div class="flex flex-col gap-6">

        <!-- ── General ── -->
        <section class="bg-surface-container-lowest rounded-2xl p-6 md:p-8 border border-outline-variant/30 shadow-sm">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container">
              <span class="material-symbols-outlined" style="font-size:20px">folder</span>
            </div>
            <h3 class="text-lg font-semibold text-on-surface">General</h3>
          </div>

          <!-- Download Path -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-on-surface-variant mb-2">Default Download Path</label>
            <div class="flex flex-col sm:flex-row gap-3">
              <div class="relative flex-1">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline" style="font-size:18px">folder_open</span>
                <input
                  type="text"
                  [value]="downloadPath()"
                  readonly
                  placeholder="Select a folder…"
                  class="w-full bg-surface pl-10 pr-4 py-3 rounded-xl border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary transition-colors" />
              </div>
              <button
                (click)="changeFolder()"
                class="px-5 py-3 rounded-xl bg-secondary-container text-on-secondary-container text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap">
                Browse…
              </button>
            </div>
            <p class="mt-2 text-xs text-on-surface-variant">All downloads will be saved here unless specified per task.</p>
          </div>

          <!-- Auto-start toggle -->
          <div class="flex items-center justify-between py-1">
            <div>
              <div class="text-sm font-medium text-on-surface">Auto-start Downloads</div>
              <div class="text-xs text-on-surface-variant mt-0.5">Begin downloading immediately when a new URL is added.</div>
            </div>
            <button
              (click)="autoStart.set(!autoStart())"
              [class]="autoStart()
                ? 'relative w-12 h-6 rounded-full bg-primary-container transition-colors'
                : 'relative w-12 h-6 rounded-full bg-surface-container-high transition-colors'">
              <span
                [class]="autoStart()
                  ? 'absolute top-0.5 right-0.5 w-5 h-5 bg-primary rounded-full shadow-sm transition-transform'
                  : 'absolute top-0.5 left-0.5 w-5 h-5 bg-outline rounded-full shadow-sm transition-transform'">
              </span>
            </button>
          </div>
        </section>

        <!-- ── Backend Status ── -->
        <section class="bg-surface-container-lowest rounded-2xl p-6 md:p-8 border border-outline-variant/30 shadow-sm">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center text-on-tertiary-container">
              <span class="material-symbols-outlined" style="font-size:20px">terminal</span>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-on-surface">Backend</h3>
            </div>
            <span class="px-3 py-1 bg-surface-container-high rounded-full text-xs font-medium text-on-surface-variant">yt-dlp Engine</span>
          </div>

          <div class="flex items-center justify-between mb-4 p-3 bg-surface-container rounded-xl">
            <span class="text-sm text-on-surface-variant">Running Port</span>
            <span class="text-sm font-semibold text-on-surface font-mono">{{ port() || '–' }}</span>
          </div>

          <button
            (click)="restartBackend()"
            class="px-5 py-2.5 rounded-xl border border-outline-variant text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center gap-2">
            <span class="material-symbols-outlined" style="font-size:16px">restart_alt</span>
            Restart Backend
          </button>
        </section>

        <!-- ── Danger Zone ── -->
        <section class="bg-surface-container-lowest rounded-2xl p-6 md:p-8 border border-error-container shadow-sm">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
              <span class="material-symbols-outlined" style="font-size:20px">warning</span>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-error">Danger Zone</h3>
              <p class="text-xs text-on-surface-variant">These actions cannot be undone.</p>
            </div>
          </div>

          <button
            (click)="clearHistory()"
            class="w-full py-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold hover:opacity-80 transition-opacity flex items-center justify-center gap-2">
            <span class="material-symbols-outlined" style="font-size:16px">delete_forever</span>
            Clear Download History
          </button>
        </section>

      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  downloadPath = signal<string>('');
  port = signal<number>(0);
  autoStart = signal(true);

  constructor(private router: Router, private api: ApiService) {}

  async ngOnInit() {
    try {
      const [port, config] = await Promise.all([
        (window as any).electronAPI.getBackendPort(),
        (window as any).electronAPI.getAppConfig(),
      ]);
      this.port.set(port);
      if (config?.downloadPath) this.downloadPath.set(config.downloadPath);
    } catch {}
  }

  async changeFolder() {
    const path = await (window as any).electronAPI.chooseDirectory();
    if (path) {
      this.downloadPath.set(path);
      await (window as any).electronAPI.saveSetupConfig({ downloadPath: path });
    }
  }

  async restartBackend() {
    console.log('Restarting backend…');
  }

  async clearHistory() {
    if (confirm('Clear all download history? This will not delete files from your disk.')) {
      this.api.deleteAllJobs().subscribe(() => {
        alert('History cleared.');
      });
    }
  }
}
