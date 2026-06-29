# Frontend Guide — Private Video Downloader

## Overview

The frontend is an **Angular 21** single-page application styled with **Tailwind CSS v4.1** and featuring a modern Material Design. It communicates with the Node.js backend via HTTP and uses Angular's **Signals** for reactive state management.

---

## Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| Angular | 21.0.0 | SPA framework |
| Tailwind CSS | 4.1.12 | Utility-first CSS framework |
| PostCSS | 8.5.3 | CSS transformation pipeline |
| TypeScript | 5.9.2 | Type-safe JavaScript |
| RxJS | 7.8.x | Reactive HTTP calls |
| Vitest | 4.0.8 | Unit testing |

---

## Project Structure

```
frontend/yt-interface/
├── src/
│   ├── index.html                    # Entry HTML with <app-root>
│   ├── main.ts                       # Angular bootstrap
│   ├── styles.css                    # Global styles, Tailwind theme
│   └── app/
│       ├── app.ts                    # Root component (router outlet)
│       ├── app.html                  # Root template
│       ├── app.css                   # Root styles
│       ├── app.config.ts             # Providers (router, HTTP, interceptors)
│       ├── app.routes.ts             # Route definitions
│       ├── core/
│       │   ├── api.service.ts        # Backend HTTP client
│       │   ├── auth.interceptor.ts   # HTTP Basic Auth header injection
│       │   └── models.ts            # TypeScript interfaces
│       └── pages/
│           └── downloader/
│               ├── downloader.ts     # Main page component
│               ├── downloader.html   # Page template (228 lines)
│               ├── downloader.css    # Page styles
│               └── downloader.spec.ts # Unit tests
├── angular.json                      # Angular CLI configuration
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript base config
├── tsconfig.app.json                 # App-specific TS config
└── tsconfig.spec.json                # Test TS config
```

---

## Design System

### Global Theme (`styles.css`)

The app uses a custom Tailwind v4 `@theme` block:

| Token | Value | Purpose |
|---|---|---|
| `--font-sans` | `Inter, system-ui, sans-serif` | Primary font |
| `--color-brand-primary` | `#6366f1` (Indigo) | Primary accent |
| `--color-brand-secondary` | `#a855f7` (Purple) | Secondary accent |
| `--color-glass-surface` | `rgba(30,41,59,0.7)` | Glass panel background |
| `--color-glass-border` | `rgba(255,255,255,0.1)` | Glass panel border |

### Body Styling
- Dark background: `bg-slate-950`
- Radial gradient blobs for ambient lighting effect
- Anti-aliased text rendering

### UI Aesthetic
- **Glassmorphism**: Frosted glass panels with `backdrop-blur-2xl`, semi-transparent backgrounds, subtle borders
- **Gradient text**: Indigo → Fuchsia gradient on headings
- **Decorative blobs**: Blurred gradient circles as background accents
- **Micro-animations**: Scale transforms on button press, fade-in for new content, pulse on active downloads

---

## Core Services

### API Service (`core/api.service.ts`)

Centralized HTTP client with typed responses. Base URL: `http://localhost:8000`.

| Method | Endpoint | Description |
|---|---|---|
| `fetchOptions(url)` | `POST /api/options` | Get available formats for a URL |
| `startDownload(url, optionsId, option)` | `POST /api/download` | Start a download job |
| `getProgress(jobId)` | `GET /api/progress/{id}` | Poll job progress |
| `cancelJob(jobId)` | `POST /api/cancel/{id}` | Cancel active download |
| `getDownloadUrl(jobId)` | `GET /api/file/{id}` | Get direct file download URL |
| `getHistory()` | `GET /api/history` | Fetch completed downloads |
| `deleteJob(jobId)` | `DELETE /api/job/{id}` | Delete file and history entry |

### Auth Interceptor (`core/auth.interceptor.ts`)

A functional HTTP interceptor that injects `Authorization: Basic <base64>` header on every outgoing request.

- **Credentials**: Hardcoded (`admin` / `change_this_password`)
- Uses Angular's `HttpInterceptorFn` (modern functional style)

### Models (`core/models.ts`)

| Interface | Purpose |
|---|---|
| `OptionsResponse` | Format options from backend (title, duration, categorized formats) |
| `OptionItem` | Single format option (id, label, optional size) |
| `DownloadResponse` | Download job creation response (job_id, status) |
| `JobStatus` | Live job state (status, progress, speed, eta, error, filename) |

---

## Downloader Page Component

The single main page of the application.

### State Management (Signals)

| Signal | Type | Purpose |
|---|---|---|
| `url` | `string` | Current input URL |
| `optionsId` | `string` | Backend options session ID |
| `selectedOption` | `string \| null` | Chosen format key |
| `videoAudio` | `OptionItem[]` | Video+Audio format list |
| `videoOnly` | `OptionItem[]` | Video-only format list |
| `audioOnly` | `OptionItem[]` | Audio-only format list |
| `currentTitle` | `string` | Video title from metadata |
| `isLoading` | `boolean` | Fetch-in-progress indicator |
| `jobs` | `Record<string, JobStatus>` | Active download jobs map |
| `history` | `JobStatus[]` | Completed downloads list |

### Computed Properties

| Computed | Logic |
|---|---|
| `hasOptions` | `true` if any format list has items |

### User Flow

1. **Paste URL** → Type or paste a video URL into the input field
2. **Fetch Options** → Press Enter or click button → calls `POST /api/options`
3. **Select Format** → Choose from grouped dropdown (Video+Audio / Video Only / Audio Only)
4. **Start Download** → Click button → creates background job, starts polling
5. **Track Progress** → Polls every 2 seconds, shows status/percentage/speed
6. **Completion** → Finished jobs move from "Active Downloads" to "Downloaded Files"
7. **Manage Files** → Save (direct download link) or Delete (removes file + history)

### Template Sections

1. **Header** — Gradient title + subtitle
2. **URL Input** — Text input with clear button
3. **Fetch Button** — Primary gradient CTA with loading spinner
4. **Format Selector** — Grouped `<select>` with custom chevron arrow
5. **Start Download** — Secondary CTA button
6. **Active Downloads** — Live job cards with progress, cancel button
7. **Downloaded Files** — History list with save/delete actions, scrollable (max 600px)

---

## Application Configuration

### Routing (`app.routes.ts`)

Single route: `""` → `Downloader` component (full-page).

### App Config (`app.config.ts`)

Providers registered:
- `provideRouter(routes)` — Client-side routing
- `provideHttpClient(withInterceptors([authInterceptor]))` — HTTP with auth
- `provideBrowserGlobalErrorListeners()` — Global error handling

### Change Detection

Uses `ChangeDetectionStrategy.OnPush` — optimal performance with Signals.

---

## Features Summary

- ✅ Modern Glassmorphism UI with dark theme
- ✅ Responsive design (mobile-friendly)
- ✅ Real-time download progress tracking (2s polling)
- ✅ Format selection with categorized groups
- ✅ Download cancellation
- ✅ Automatic history refresh on download completion
- ✅ File save via direct download link
- ✅ File deletion with confirmation dialog
- ✅ Loading states with animated spinners
- ✅ Gradient text and decorative background blobs
- ✅ Keyboard support (Enter to fetch)
- ✅ OnPush change detection for performance
- ✅ Signals-based reactive state (Angular 21)

---

## Running the Frontend

```bash
cd frontend/yt-interface
npm install
npm start
```

The app will be available at `http://localhost:4200`.
