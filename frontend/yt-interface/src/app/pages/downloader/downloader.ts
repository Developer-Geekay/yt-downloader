import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ApiService } from '../../core/api.service';
import { ViewService } from '../../core/view.service';
import { OptionItem, JobStatus } from '../../core/models';

type FormatTab = 'video_audio' | 'video_only' | 'audio';

@Component({
  selector: 'app-downloader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './downloader.html',
  styleUrl: './downloader.css',
})
export class Downloader implements OnInit {
  private api = inject(ApiService);
  protected viewSvc = inject(ViewService);

  url = signal('');
  optionsId = signal('');
  selectedOption = signal<string | null>(null);
  formatTab = signal<FormatTab>('video_audio');

  videoAudio = signal<OptionItem[]>([]);
  videoOnly = signal<OptionItem[]>([]);
  audioOnly = signal<OptionItem[]>([]);

  currentTitle = signal('');
  currentThumbnail = signal('');
  includeSubtitles = signal(false);
  isLoading = signal(false);
  fetchError = signal<string | null>(null);

  jobs = signal<Record<string, JobStatus>>({});
  history = signal<JobStatus[]>([]);

  hasOptions = computed(
    () => this.videoAudio().length + this.videoOnly().length + this.audioOnly().length > 0,
  );

  activeJobList = computed(() =>
    Object.entries(this.jobs()).map(([id, job]) => ({ id, ...job })),
  );

  activeJobCount = computed(() => Object.keys(this.jobs()).length);

  currentOptions = computed<OptionItem[]>(() => {
    switch (this.formatTab()) {
      case 'video_audio': return this.videoAudio();
      case 'video_only': return this.videoOnly();
      case 'audio': return this.audioOnly();
    }
  });

  recentHistory = computed(() => this.history().slice(0, 6));

  ngOnInit() {
    this.loadHistory();
    this.resumeActiveJobs();
  }

  resumeActiveJobs() {
    this.api.getActiveJobs().subscribe(active => {
      for (const job of active) {
        if (!job.id) continue;
        this.jobs.update(j => ({ ...j, [job.id!]: job }));
        this.trackJob(job.id!);
      }
    });
  }

  loadHistory() {
    this.api.getHistory().subscribe(h => this.history.set(h));
  }

  fetchOptions() {
    if (!this.url() || this.isLoading()) return;
    this.isLoading.set(true);
    this.fetchError.set(null);

    this.api.fetchOptions(this.url()).subscribe({
      next: res => {
        this.optionsId.set(res.options_id);
        this.videoAudio.set(res.video_audio);
        this.videoOnly.set(res.video_only);
        this.audioOnly.set(res.audio);
        this.currentTitle.set(res.title);
        this.currentThumbnail.set(res.thumbnail ?? '');
        this.selectedOption.set(null);
        // Read default subtitle preference from app config
        (window as any).electronAPI?.getAppConfig?.()
          ?.then((cfg: any) => { if (cfg?.defaultSubtitles !== undefined) this.includeSubtitles.set(cfg.defaultSubtitles); })
          ?.catch(() => {});
        // Default to first available tab
        if (res.video_audio.length) this.formatTab.set('video_audio');
        else if (res.video_only.length) this.formatTab.set('video_only');
        else if (res.audio.length) this.formatTab.set('audio');
        this.isLoading.set(false);
        this.viewSvc.currentView.set('configure');
      },
      error: err => {
        const detail = err?.error?.detail ?? err?.message ?? 'Failed to fetch video options.';
        this.fetchError.set(detail);
        this.isLoading.set(false);
      },
    });
  }

  startDownload() {
    const option = this.selectedOption();
    if (!option) return;

    const title = this.currentTitle();
    const thumbnail = this.currentThumbnail();

    this.api.startDownload(this.url(), this.optionsId(), option, title, thumbnail, this.includeSubtitles()).subscribe(res => {
      this.jobs.update(j => ({
        ...j,
        [res.job_id]: { status: 'queued', progress: '0%', title, thumbnail },
      }));
      this.trackJob(res.job_id);
      this.clearUrl();
      this.viewSvc.currentView.set('queue');
    });
  }

  trackJob(jobId: string) {
    const timer = setInterval(() => {
      this.api.getProgress(jobId).subscribe(status => {
        if (status.status === 'finished') {
          clearInterval(timer);
          this.jobs.update(j => {
            const next = { ...j };
            delete next[jobId];
            return next;
          });
          this.loadHistory();
          window.electronAPI?.setProgress(-1);
          return;
        }

        this.jobs.update(j => ({
          ...j,
          [jobId]: { title: j[jobId]?.title, thumbnail: j[jobId]?.thumbnail, ...status },
        }));

        if (status.progress && window.electronAPI?.isElectron) {
          const pct = parseFloat(status.progress.replace('%', ''));
          if (!isNaN(pct)) window.electronAPI.setProgress(pct / 100);
        }

        if (status.status === 'error' || status.status === 'cancelled') {
          clearInterval(timer);
          this.jobs.update(j => {
            const next = { ...j };
            delete next[jobId];
            return next;
          });
          this.loadHistory();
          window.electronAPI?.setProgress(-1);
        }
      });
    }, 2000);
  }

  cancelJob(jobId: string) {
    this.api.cancelJob(jobId).subscribe();
  }

  openFile(jobId: string) {
    if (window.electronAPI?.isElectron) {
      this.api.getFilePath(jobId).subscribe(res => {
        window.electronAPI!.showInFolder(res.path);
      });
    } else {
      window.open(this.api.getDownloadUrl(jobId), '_blank');
    }
  }

  deleteHistoryJob(jobId: string) {
    this.api.deleteJob(jobId).subscribe(() => this.loadHistory());
  }

  clearAllHistory() {
    this.api.deleteAllJobs().subscribe(() => this.history.set([]));
  }

  updateUrl(value: string) {
    this.url.set(value);
    if (!value) this.clearUrl();
  }

  clearUrl() {
    this.url.set('');
    this.optionsId.set('');
    this.selectedOption.set(null);
    this.videoAudio.set([]);
    this.videoOnly.set([]);
    this.audioOnly.set([]);
    this.currentTitle.set('');
    this.currentThumbnail.set('');
    this.includeSubtitles.set(false);
    this.fetchError.set(null);
  }

  backToDashboard() {
    this.viewSvc.currentView.set('dashboard');
  }

  restartDownload(url: string) {
    if (!url) return;
    this.clearUrl();
    this.url.set(url);
    this.viewSvc.currentView.set('dashboard');
    this.fetchOptions();
  }

  getDownloadUrl(jobId: string) {
    return this.api.getDownloadUrl(jobId);
  }

  getProgressPct(progress?: string): number {
    if (!progress) return 0;
    return Math.min(100, parseFloat(progress.replace('%', '')) || 0);
  }

  async pasteAndFetch() {
    if (this.isLoading()) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text?.trim()) {
        this.url.set(text.trim());
        this.fetchOptions();
      }
    } catch {
      // Clipboard read denied — user can type manually
    }
  }

  getDisplayName(filename?: string, title?: string): string {
    if (filename) return filename.replace(/\\/g, '/').split('/').pop() || filename;
    if (title) return title;
    return 'Download';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      queued: 'Queued',
      downloading: 'Downloading',
      finished: 'Done',
      error: 'Failed',
      cancelled: 'Cancelled',
    };
    return map[status] ?? status;
  }
}
