import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="setup-container">
      <div class="setup-card">
        <h1>Welcome to Video Downloader</h1>
        <p>Let's get your application ready for the first use.</p>

        <section class="dependency-check">
          <h3>Bundled Tools</h3>
          <div class="dep-item" [class.found]="deps().node?.found">
            <span class="dot"></span>
            <span class="name">Node.js</span>
            <span class="status">{{ deps().node?.found ? deps().node.version : 'Not Found' }}</span>
          </div>
          <div class="dep-item" [class.found]="deps().ytdlp?.found">
            <span class="dot"></span>
            <span class="name">yt-dlp</span>
            <span class="status">{{ deps().ytdlp?.found ? 'Found' : 'Not Found' }}</span>
          </div>
          <div class="dep-item" [class.found]="deps().ffmpeg?.found">
            <span class="dot"></span>
            <span class="name">FFmpeg</span>
            <span class="status">{{ deps().ffmpeg?.found ? 'Found' : 'Not Found' }}</span>
          </div>
        </section>

        <section class="path-config">
          <h3>Download Folder</h3>
          <div class="input-group">
            <input type="text" [value]="downloadPath()" readonly placeholder="Choose a folder...">
            <button (click)="chooseFolder()">Browse</button>
          </div>
        </section>

        <div class="actions">
          <button class="primary" [disabled]="!downloadPath()" (click)="finish()">Finish Setup</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .setup-container { display: flex; justify-content: center; align-items: center; height: 100vh; background: #020617; color: #f8fafc; }
    .setup-card { background: #0f172a; padding: 2.5rem; border-radius: 1rem; border: 1px solid #1e293b; width: 450px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; font-size: 1.5rem; color: #3b82f6; }
    h3 { font-size: 0.9rem; margin-top: 1.5rem; color: #94a3b8; }
    .dep-item { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }
    .found .dot { background: #22c55e; }
    .input-group { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    input { flex: 1; background: #1e293b; border: 1px solid #1e293b; border-radius: 0.4rem; padding: 0.6rem; color: #fff; font-size: 0.85rem; outline: none; }
    button { background: #334155; color: white; border: none; border-radius: 0.4rem; padding: 0.6rem 1rem; cursor: pointer; font-size: 0.85rem; }
    button.primary { background: #3b82f6; width: 100%; margin-top: 2rem; font-weight: 600; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class SetupComponent implements OnInit {
  deps = signal<any>({ node: {}, ytdlp: {}, ffmpeg: {} });
  downloadPath = signal<string>('');

  constructor(private router: Router) {}

  async ngOnInit() {
    this.deps.set(await (window as any).electronAPI.checkDependencies());
  }

  async chooseFolder() {
    const path = await (window as any).electronAPI.chooseDirectory();
    if (path) this.downloadPath.set(path);
  }

  async finish() {
    const success = await (window as any).electronAPI.saveSetupConfig({
      downloadPath: this.downloadPath()
    });
    if (success) {
      this.router.navigate(['/']);
    }
  }
}
