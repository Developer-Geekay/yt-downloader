import { Injectable, signal } from '@angular/core';

export type AppView = 'dashboard' | 'configure' | 'queue' | 'library';

@Injectable({ providedIn: 'root' })
export class ViewService {
  currentView = signal<AppView>('dashboard');
}
