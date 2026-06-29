import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';

type SectionId = 'general' | 'downloads' | 'backend' | 'about';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <!-- Toast -->
    @if (toast(); as t) {
      <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
        [class]="t.type === 'success'
          ? 'bg-on-surface text-surface'
          : 'bg-error text-on-error'">
        <span class="material-symbols-outlined fill" style="font-size:16px">
          {{ t.type === 'success' ? 'check_circle' : 'error' }}
        </span>
        <span class="text-sm font-semibold">{{ t.message }}</span>
      </div>
    }

    <div class="h-[calc(100vh-64px)] overflow-y-auto">
      <div class="max-w-2xl mx-auto px-5 py-8 pb-24">

        <!-- Header -->
        <h2 class="font-display text-2xl font-bold text-on-surface mb-6">Settings</h2>

        <!-- Tab bar -->
        <div class="flex gap-1 p-1 bg-surface-container rounded-2xl mb-8">
          @for (s of sections; track s.id) {
            <button
              (click)="activeSection.set(s.id)"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all"
              [class]="activeSection() === s.id
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'">
              <span class="material-symbols-outlined" style="font-size:15px"
                [class]="activeSection() === s.id ? 'fill' : ''">{{ s.icon }}</span>
              <span class="hidden sm:inline">{{ s.label }}</span>
            </button>
          }
        </div>

        <!-- ════ GENERAL ════ -->
        @if (activeSection() === 'general') {

          <!-- Download folder -->
          <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden mb-4">
            <div class="px-5 py-4 border-b border-outline-variant/20">
              <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Download Folder</p>
            </div>
            <div class="px-5 py-4">
              <div class="flex items-center gap-3 mb-3">
                <span class="material-symbols-outlined text-on-surface-variant shrink-0" style="font-size:20px">folder_open</span>
                <span class="text-sm text-on-surface flex-1 truncate">
                  {{ downloadPath() || 'No folder selected' }}
                </span>
              </div>
              <button (click)="changeFolder()"
                class="w-full py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined" style="font-size:16px">drive_folder_upload</span>
                Change Folder
              </button>
            </div>
          </div>

          <!-- Danger zone -->
          <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div class="px-5 py-4 border-b border-outline-variant/20">
              <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Danger Zone</p>
            </div>
            @if (!confirmClearHistory()) {
              <button (click)="clearHistoryClick()"
                class="w-full flex items-center gap-4 px-5 py-4 hover:bg-error-container/30 transition-colors group">
                <div class="w-9 h-9 rounded-xl bg-error-container text-on-error-container flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined fill" style="font-size:18px">delete_forever</span>
                </div>
                <div class="flex-1 text-left">
                  <div class="text-sm font-semibold text-error">Clear Download History</div>
                  <div class="text-xs text-on-surface-variant mt-0.5">Remove all history records (files on disk are not affected)</div>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant group-hover:text-error transition-colors" style="font-size:18px">chevron_right</span>
              </button>
            } @else {
              <div class="px-5 py-4">
                <p class="text-sm text-on-surface-variant mb-4">This will permanently remove all history entries. Files on disk are untouched.</p>
                <div class="flex gap-3">
                  <button (click)="clearHistoryClick()"
                    class="flex-1 py-2.5 rounded-xl bg-error text-on-error text-sm font-bold hover:opacity-90 active:scale-95 transition-all">
                    Yes, clear it
                  </button>
                  <button (click)="cancelClear()"
                    class="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high active:scale-95 transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            }
          </div>
        }

        <!-- ════ DOWNLOADS ════ -->
        @if (activeSection() === 'downloads') {
          <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div class="px-5 py-4 border-b border-outline-variant/20">
              <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Subtitles</p>
            </div>
            <div class="flex items-center gap-4 px-5 py-4">
              <div class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined" style="font-size:18px">subtitles</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-on-surface">Include subtitles by default</div>
                <div class="text-xs text-on-surface-variant mt-0.5">Pre-fills the subtitle toggle when configuring a download</div>
              </div>
              <button (click)="toggleDefaultSubtitles()" class="shrink-0"
                [class]="defaultSubtitles()
                  ? 'relative w-11 h-6 rounded-full bg-primary transition-colors duration-200'
                  : 'relative w-11 h-6 rounded-full bg-surface-container-high transition-colors duration-200'">
                <span [class]="defaultSubtitles()
                  ? 'absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-200'
                  : 'absolute top-0.5 left-0.5 w-5 h-5 bg-outline rounded-full shadow-sm transition-all duration-200'">
                </span>
              </button>
            </div>
          </div>
        }

        <!-- ════ BACKEND ════ -->
        @if (activeSection() === 'backend') {
          <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden mb-4">
            <div class="px-5 py-4 border-b border-outline-variant/20">
              <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Status</p>
            </div>

            <!-- Status row -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-on-surface-variant" style="font-size:18px">circle</span>
                </div>
                <span class="text-sm font-medium text-on-surface">Backend</span>
              </div>
              <div class="flex items-center gap-2">
                @if (backendStatus() === 'checking') {
                  <div class="w-2 h-2 rounded-full bg-outline animate-pulse"></div>
                  <span class="text-xs font-medium text-on-surface-variant">Checking…</span>
                } @else if (backendStatus() === 'online') {
                  <div class="w-2 h-2 rounded-full bg-green-500"></div>
                  <span class="text-xs font-semibold" style="color:#22c55e">Online</span>
                } @else {
                  <div class="w-2 h-2 rounded-full" style="background:#ef4444"></div>
                  <span class="text-xs font-semibold text-error">Offline</span>
                }
              </div>
            </div>

            <!-- Port row -->
            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-on-surface-variant" style="font-size:18px">lan</span>
                </div>
                <span class="text-sm font-medium text-on-surface">Port</span>
              </div>
              <span class="text-sm font-bold text-on-surface font-mono px-3 py-1 bg-surface-container rounded-lg">
                {{ port() || '—' }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button (click)="pingBackend()"
              class="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:scale-95 transition-all flex items-center justify-center gap-2">
              <span class="material-symbols-outlined" style="font-size:16px">radar</span>
              Refresh
            </button>
            <button (click)="restartBackend()" [disabled]="restarting()"
              class="flex-1 py-3 rounded-2xl bg-surface-container-highest text-on-surface text-sm font-semibold hover:bg-surface-container-high disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
              @if (restarting()) {
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Restarting…
              } @else {
                <span class="material-symbols-outlined" style="font-size:16px">restart_alt</span>
                Restart
              }
            </button>
          </div>
        }

        <!-- ════ ABOUT ════ -->
        @if (activeSection() === 'about') {

          <!-- App identity -->
          <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden mb-4">
            <div class="flex items-center gap-4 px-5 py-5 border-b border-outline-variant/20">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-on-primary shadow-sm shrink-0">
                <span class="material-symbols-outlined fill" style="font-size:24px">movie</span>
              </div>
              <div>
                <div class="font-bold text-on-surface text-base">StreamFlow</div>
                <div class="text-xs text-on-surface-variant mt-0.5">Self-hosted video downloader</div>
              </div>
              @if (version()) {
                <span class="ml-auto px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg shrink-0">
                  v{{ version() }}
                </span>
              }
            </div>

            <!-- Stack rows -->
            <div class="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/10">
              <span class="text-sm text-on-surface-variant">Download Engine</span>
              <span class="text-sm font-semibold text-on-surface">yt-dlp</span>
            </div>
            <div class="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/10">
              <span class="text-sm text-on-surface-variant">Media Processing</span>
              <span class="text-sm font-semibold text-on-surface">FFmpeg</span>
            </div>
            <div class="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/10">
              <span class="text-sm text-on-surface-variant">Backend Runtime</span>
              <span class="text-sm font-semibold text-on-surface">Node.js 22</span>
            </div>
            <div class="flex items-center justify-between px-5 py-3.5">
              <span class="text-sm text-on-surface-variant">Frontend</span>
              <span class="text-sm font-semibold text-on-surface">Angular 21</span>
            </div>
          </div>

          <p class="text-xs text-center text-on-surface-variant leading-relaxed">
            Zero cloud dependencies · Everything runs locally on your machine
          </p>
        }

      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  readonly sections: { id: SectionId; label: string; icon: string }[] = [
    { id: 'general',   label: 'General',   icon: 'settings'  },
    { id: 'downloads', label: 'Downloads',  icon: 'download'  },
    { id: 'backend',   label: 'Backend',    icon: 'terminal'  },
    { id: 'about',     label: 'About',      icon: 'info'      },
  ];

  activeSection       = signal<SectionId>('general');
  downloadPath        = signal('');
  port                = signal(0);
  version             = signal('');
  backendStatus       = signal<'online' | 'offline' | 'checking'>('checking');
  defaultSubtitles    = signal(false);
  confirmClearHistory = signal(false);
  restarting          = signal(false);
  toast               = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  constructor(private router: Router, private api: ApiService) {}

  async ngOnInit() {
    try {
      const eAPI = (window as any).electronAPI;
      const [port, config, version] = await Promise.all([
        eAPI?.getBackendPort?.(),
        eAPI?.getAppConfig?.(),
        eAPI?.getAppVersion?.(),
      ]);
      if (port)    this.port.set(port);
      if (version) this.version.set(version);
      if (config?.downloadPath)    this.downloadPath.set(config.downloadPath);
      if (config?.defaultSubtitles !== undefined) this.defaultSubtitles.set(config.defaultSubtitles);
    } catch {}
    this.pingBackend();
  }

  pingBackend() {
    this.backendStatus.set('checking');
    this.api.checkHealth().subscribe({
      next:  () => this.backendStatus.set('online'),
      error: () => this.backendStatus.set('offline'),
    });
  }

  async changeFolder() {
    const path = await (window as any).electronAPI?.chooseDirectory?.();
    if (path) {
      this.downloadPath.set(path);
      await (window as any).electronAPI?.saveSetupConfig?.({ downloadPath: path });
      this.showToast('Download folder updated');
    }
  }

  async toggleDefaultSubtitles() {
    const next = !this.defaultSubtitles();
    this.defaultSubtitles.set(next);
    await (window as any).electronAPI?.saveSetupConfig?.({ defaultSubtitles: next });
    this.showToast(next ? 'Subtitles enabled by default' : 'Subtitles disabled');
  }

  async restartBackend() {
    this.restarting.set(true);
    try {
      await (window as any).electronAPI?.restartBackend?.();
      setTimeout(async () => {
        try {
          const port = await (window as any).electronAPI?.getBackendPort?.();
          if (port) this.port.set(port);
        } catch {}
        this.restarting.set(false);
        this.pingBackend();
        this.showToast('Backend restarted');
      }, 2500);
    } catch {
      this.restarting.set(false);
      this.showToast('Failed to restart backend', 'error');
    }
  }

  clearHistoryClick() {
    if (!this.confirmClearHistory()) {
      this.confirmClearHistory.set(true);
      return;
    }
    this.api.deleteAllJobs().subscribe({
      next:  () => { this.confirmClearHistory.set(false); this.showToast('History cleared'); },
      error: () => this.showToast('Failed to clear history', 'error'),
    });
  }

  cancelClear() {
    this.confirmClearHistory.set(false);
  }

  showToast(message: string, type: 'success' | 'error' = 'success') {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), 3000);
  }
}
