import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
  inject,
  OnInit
} from '@angular/core';
import { ApiService } from '../../core/api.service';
import { OptionItem, JobStatus } from '../../core/models';
import { KeyValuePipe } from '@angular/common';

@Component({
  selector: 'app-downloader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyValuePipe],
  templateUrl: './downloader.html',
  styleUrl: './downloader.css',
})
export class Downloader implements OnInit {
  private api = inject(ApiService);

  url = signal('');
  optionsId = signal('');
  selectedOption = signal<string | null>(null);

  videoAudio = signal<OptionItem[]>([]);
  videoOnly = signal<OptionItem[]>([]);
  audioOnly = signal<OptionItem[]>([]);
  
  currentTitle = signal('');
  isLoading = signal(false);

  jobs = signal<Record<string, JobStatus>>({});
  history = signal<JobStatus[]>([]);

  hasOptions = computed(() =>
    this.videoAudio().length +
    this.videoOnly().length +
    this.audioOnly().length > 0
  );

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.api.getHistory().subscribe(history => {
      this.history.set(history);
    });
  }

  fetchOptions() {
    if (!this.url()) return;
    this.isLoading.set(true);
    this.api.fetchOptions(this.url()).subscribe({
      next: (res) => {
        this.optionsId.set(res.options_id);
        this.videoAudio.set(res.video_audio);
        this.videoOnly.set(res.video_only);
        this.audioOnly.set(res.audio);
        this.currentTitle.set(res.title);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  startDownload() {
    const option = this.selectedOption();
    if (!option) return;

    this.api.startDownload(
      this.url(),
      this.optionsId(),
      option
    ).subscribe(res => {
      this.jobs.update(j => ({
        ...j,
        [res.job_id]: { 
          status: 'queued', 
          progress: '0%', 
          title: this.currentTitle() 
        }
      }));
      this.trackJob(res.job_id);
    });
  }

  trackJob(jobId: string) {
    const timer = setInterval(() => {
      this.api.getProgress(jobId).subscribe(status => {
        // If finished, remove from active jobs and refresh history
        if (status.status === 'finished') {
           clearInterval(timer);
           this.jobs.update(j => {
             const newJobs = { ...j };
             delete newJobs[jobId];
             return newJobs;
           });
           this.loadHistory();
           // Clear taskbar progress
           window.electronAPI?.setProgress(-1);
           return;
        }

        this.jobs.update(j => ({ ...j, [jobId]: status }));

        // Update taskbar progress in Electron
        if (status.progress && window.electronAPI?.isElectron) {
          const pct = parseFloat(status.progress.replace('%', ''));
          if (!isNaN(pct)) {
            window.electronAPI.setProgress(pct / 100);
          }
        }

        if (
          status.status === 'error' ||
          status.status === 'cancelled'
        ) {
          clearInterval(timer);
          // Clear taskbar progress
          window.electronAPI?.setProgress(-1);
        }
      });
    }, 2000);
  }

  cancelJob(jobId: string) {
    this.api.cancelJob(jobId).subscribe();
  }
  
  deleteHistoryJob(jobId: string) {
    if(!confirm('Are you sure you want to delete this file?')) return;
    
    this.api.deleteJob(jobId).subscribe(() => {
      this.loadHistory();
    });
  }

  updateUrl(value: string) {
    this.url.set(value);
    if (!value) {
      this.clearUrl();
    }
  }

  clearUrl() {
    this.url.set('');
    this.optionsId.set('');
    this.selectedOption.set(null);
    this.videoAudio.set([]);
    this.videoOnly.set([]);
    this.audioOnly.set([]);
    this.currentTitle.set('');
  }

  getDownloadUrl(jobId: string) {
    return this.api.getDownloadUrl(jobId);
  }
}
