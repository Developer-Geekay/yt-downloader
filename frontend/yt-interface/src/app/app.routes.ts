import { Routes } from '@angular/router';
import { AppLayout } from './shared/layout/layout';
import { Downloader } from './pages/downloader/downloader';
import { SetupComponent } from './pages/setup/setup';
import { SettingsComponent } from './pages/settings/settings';

export const routes: Routes = [
  { path: 'setup', component: SetupComponent },
  {
    path: '',
    component: AppLayout,
    children: [
      { path: '', component: Downloader },
      { path: 'settings', component: SettingsComponent },
    ],
  },
];
