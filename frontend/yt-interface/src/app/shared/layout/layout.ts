import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ViewService, AppView } from '../../core/view.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './layout.html',
})
export class AppLayout {
  protected viewSvc = inject(ViewService);
  private router = inject(Router);

  private currentUrl = signal(this.router.url);

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => this.currentUrl.set((e as NavigationEnd).url));
  }

  protected isOnSettings = computed(() => this.currentUrl().startsWith('/settings'));

  protected isNavActive(view: AppView): boolean {
    return !this.isOnSettings() && this.viewSvc.currentView() === view;
  }

  protected navigate(view: AppView) {
    this.viewSvc.currentView.set(view);
    if (this.currentUrl() !== '/') {
      this.router.navigate(['/']);
    }
  }

  protected goToSettings() {
    this.router.navigate(['/settings']);
  }
}
