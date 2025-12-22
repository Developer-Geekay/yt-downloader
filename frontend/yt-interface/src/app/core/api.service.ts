import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OptionsResponse, DownloadResponse, JobStatus } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = 'http://localhost:8000';

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
