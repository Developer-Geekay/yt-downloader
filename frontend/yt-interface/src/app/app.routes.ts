import { Routes } from '@angular/router';
import { Downloader } from './pages/downloader/downloader';
import { SetupComponent } from './pages/setup/setup';
import { SettingsComponent } from './pages/settings/settings';

export const routes: Routes = [
    { path: '', component: Downloader },
    { path: 'setup', component: SetupComponent },
    { path: 'settings', component: SettingsComponent }
];

