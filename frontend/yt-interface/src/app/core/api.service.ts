import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OptionsResponse, DownloadResponse, JobStatus } from './models';

/** Type declaration for the Electron preload API */
declare global {
  interface Window {
    electronAPI?: {
      getBackendPort: () => Promise<number>;
      chooseDirectory: () => Promise<string | null>;
      getAppVersion: () => Promise<string>;
      setProgress: (progress: number) => void;
      isElectron: boolean;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private _base = signal('http://localhost:8000');

  get base() {
    return this._base();
  }

  constructor() {
    this.initBaseUrl();
  }

  private async initBaseUrl() {
    if (window.electronAPI?.isElectron) {
      try {
        const port = await window.electronAPI.getBackendPort();
        this._base.set(`http://127.0.0.1:${port}`);
      } catch {
        // Fallback to default
      }
    }
  }

  fetchOptions(url: string) {
    return this.http.post<OptionsResponse>(
      `${this.base}/api/options`,
      { url }
    );
  }

  startDownload(url: string, optionsId: string, option: string) {
    return this.http.post<DownloadResponse>(
      `${this.base}/api/download`,
      { url, options_id: optionsId, option }
    );
  }

  getProgress(jobId: string) {
    return this.http.get<JobStatus>(
      `${this.base}/api/progress/${jobId}`
    );
  }

  cancelJob(jobId: string) {
    return this.http.post(`${this.base}/api/cancel/${jobId}`, {});
  }

  getDownloadUrl(jobId: string) {
    return `${this.base}/api/file/${jobId}`;
  }

  getHistory() {
    return this.http.get<JobStatus[]>(`${this.base}/api/history`);
  }

  deleteJob(jobId: string) {
    return this.http.delete(`${this.base}/api/job/${jobId}`);
  }
}
