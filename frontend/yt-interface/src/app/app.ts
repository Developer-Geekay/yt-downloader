import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('yt-interface');

  constructor(private router: Router) {}

  async ngOnInit() {
    const isConfigured = await (window as any).electronAPI.isConfigured();
    if (!isConfigured) {
      this.router.navigate(['/setup']);
    }

    // Listen for navigation from Electron main process (Menu/Tray)
    if ((window as any).electronAPI?.onNavigate) {
      (window as any).electronAPI.onNavigate((path: string) => {
        this.router.navigate([path]);
      });
    }
  }
}


