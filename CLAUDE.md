# Cassette: build specification

A complete spec for Claude Code to build a personal media player on Windows. Working name "Cassette", rename freely.

---

## 0. How to use this document

Save this file as `CLAUDE.md` at the root of your project once you've scaffolded the repo. Claude Code reads `CLAUDE.md` automatically and uses it as long-term context.

Build phase by phase. Each phase has a "Done when" criterion. Don't move to phase N+1 until phase N actually runs end-to-end. As decisions get made along the way (a library version pinned, a quirk discovered, a deviation from this plan), update this file inline so it stays the source of truth.

When you hit the inevitable wall, the section that covers the most likely walls is section 4 (video rendering) and section 14 (pitfalls).

---

## 1. What we're building

A single-user desktop media player for Windows that wraps mpv as the playback engine and adds:

1. A designed, minimal UI in the Linear / Arc / Things 3 territory. Borderless, monochrome, monospace for technical readouts.
2. A library that indexes media from arbitrary Windows folders (C:\, D:\, etc.) into a local SQLite database.
3. Posters and episode metadata pulled from TMDb (free API, same one Plex and Jellyfin use).
4. Frame-grab thumbnails from the user's actual playback position, shown in the Continue Watching strip.
5. Season-aware playback: when a TV episode is recognised, prev/next jumps episodes in the same season.
6. Per-series audio and subtitle track preferences, applied automatically to all episodes of a show.
7. Named visual profiles (Film, Anime, Low power) that swap entire shader chains for mpv's upscaling and frame interpolation.
8. Click-to-pause overlay with 5-second skip buttons. Mouse wheel scrubs (1s default, modifiers for 5s and 30s).

This is a **personal-use project**, not a commercial product. We are not signing installers, paying codec licenses, or supporting platforms beyond Windows for now. Anything cross-platform falls out of mpv being cross-platform; the rest can wait.

Target hardware: NVIDIA RTX 3070 Ti and similar. We assume a capable GPU and tune for quality, not for the lowest common denominator.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2.x | Smaller and faster than Electron. Rust backend is exactly where we need to integrate libmpv. |
| Frontend framework | React 18 + TypeScript + Vite | Industry default, Claude Code is comfortable with it, no surprises. |
| Styling | Hand-written CSS with CSS custom properties | No Tailwind, no UI library. Design language is small and specific. |
| Playback engine | libmpv via the `libmpv2` crate (currently 5.0.x) | Direct FFI bindings. Includes the render API so video draws inside our window. |
| Database | SQLite via `rusqlite` | One file, no server, perfect for a local library index. |
| HTTP client | `reqwest` + `serde` | For TMDb API calls. |
| Filename parsing | `torrent-name-parser` crate (0.12.x) | Handles scene release naming reliably. Wrap with our own normalisation layer. |
| Frame grabs | `ffmpeg.exe` invoked as subprocess | Bundled with the app. We don't need a Rust ffmpeg binding for what we're doing. |
| Async runtime | `tokio` | Required by reqwest, used for all background work on the Rust side. |
| Filesystem walker | `walkdir` | The standard choice. |
| File watcher | `notify` | For detecting new files dropped into watched folders. |

### Don't pin pre-1.0 crates initially

Let cargo pick the latest minor version on first build. Pin once the project actually works end-to-end, which prevents you from being stuck on bugs that have already been fixed upstream.

### What we deliberately don't use

- **No Electron.** Different stack, different tradeoffs, not what we picked.
- **No mpv.exe as a child process.** We bind libmpv directly via FFI so video renders inside our window.
- **No Redux, Zustand, Jotai or any other state library.** React local state and Context are sufficient.
- **No CSS-in-JS, no Tailwind, no shadcn, no Radix, no Material UI.** The component count is small and the design language is too specific for an off-the-shelf system.
- **No router library.** Two views, switched via component state. React Router is overkill here.
- **No animation library.** Plain CSS transitions for hover states.
- **No icon set.** Inline SVG paths for the small icon vocabulary we need.
- **No date or formatting library.** Format timecodes by hand: `Math.floor(seconds / 60)` with `String.padStart`.

If you find yourself reaching for one of these, stop and check whether the problem is actually big enough to justify it. It almost certainly isn't.

---

## 3. Architecture

Two layers, with a clean boundary at the Tauri command interface.

### Rust backend (`src-tauri/src/`) owns

- mpv lifecycle: create, configure, destroy
- All libmpv calls (loadfile, seek, set property, get property)
- The video render surface (libmpv render API into a GL context)
- Library indexing: filesystem walking, filename parsing, SQLite reads and writes
- Background workers: TMDb metadata fetching, ffmpeg frame grabs, file watching
- Bundled assets: shader files for the visual profiles

### Frontend (`src/`) owns

- All UI rendering
- User input: clicks, mouse wheel, keyboard
- View switching between Library and Player
- Per-component state (hover state, current view, etc.)
- Calling Tauri commands and subscribing to Tauri events. The frontend never imports Node-style filesystem or networking APIs.

### Communication

The frontend uses Tauri's `invoke()` for commands (request / response) and `listen()` for events (push). Wrap both in typed helpers in `src/lib/tauri.ts` so the rest of the codebase calls strongly-typed functions, not stringly-typed primitives.

### Tauri commands to expose (initial set)

```
Playback
  play_file(path: string)
  pause(), resume(), toggle_pause()
  seek(seconds: number)               // absolute
  seek_relative(delta_seconds: number)
  set_audio_track(track_index: number)
  set_subtitle_track(track_index: number | null)
  apply_visual_profile(profile_id: string)
  get_track_list()
  get_playback_state()

Library
  add_watched_folder(path: string)
  remove_watched_folder(path: string)
  list_watched_folders()
  rescan()
  library_list(filter?: { kind: 'all' | 'film' | 'tv' | 'concert' })
  library_search(query: string)
  library_continue_watching(limit: number)
  library_get_series(series_id: number)
  library_get_episodes(series_id: number)

Series preferences
  series_set_track_preference(series_id, audio_lang?, audio_index?, sub_lang?, sub_index?)
  series_get_track_preference(series_id)

Metadata
  metadata_fetch_for(library_item_id)   // queues TMDb fetch
  metadata_status()                     // queue length, recent failures
```

### Tauri events to emit

```
playback:state         { paused, position_seconds, duration_seconds }
playback:track-changed { kind: 'audio' | 'subtitle', track_index, track_lang }
playback:profile-changed { profile_id }
library:scan-progress  { folder, files_processed, files_total }
library:item-added     { id, path, parsed_title }
library:item-updated   { id }
library:metadata-ready { id, poster_path?, thumb_path? }
```

---

## 4. The hard part: video rendering

This is the part of the project most likely to consume more time than you expect. Read this whole section before writing any rendering code.

### The three modes mpv supports for embedding

1. **Direct window mode.** mpv creates and owns its own window. Useless for us; we want video inside our app.
2. **Window ID mode (`--wid`).** mpv renders into an existing native window referenced by handle. Works, but doesn't compose cleanly with a webview.
3. **Render API.** We provide an OpenGL or D3D11 context; mpv hands us frames; we draw them. Most flexible, also most complex.

### Target architecture (render API)

For Tauri on Windows, the right path is the render API. Outline:

1. Create a custom Tauri window, or a child window, with a native HWND we control.
2. Initialise an OpenGL (via `glow` or `glutin`) or D3D11 context bound to that HWND.
3. Call `mpv_render_context_create` with a `MPV_RENDER_PARAM_OPENGL_INIT_PARAMS` containing a function pointer that returns the GL `proc_addr`.
4. Register an update callback via `mpv_render_context_set_update_callback`. This fires on a different thread when mpv has a new frame ready.
5. From that callback, signal the main thread. On the main thread, call `mpv_render_context_render` with the current framebuffer, then swap buffers.
6. The HTML UI sits as an overlay in the rest of the webview. The video region is a transparent area (the chrome around it, like the title bar and transport, are HTML; the video area itself is the underlying GL surface showing through).

The libmpv2 crate has a render module and example code. Start from those examples. Don't try to translate the C examples directly.

### Fallback plan if render API takes too long

If render API integration is taking more than three days of dedicated effort, switch to the fallback in Appendix A: spawn `mpv.exe` as a child process with `--wid=<our_hwnd>` and control it via JSON IPC over a Windows named pipe. This is uglier and the HTML overlay positioning becomes a manual tracking problem, but it unblocks the rest of the build.

This is a fallback only. Don't reach for it preemptively.

### Sanity checks during this phase

- Does the video play at the correct framerate? (Check with the `display-fps` and `estimated-vf-fps` mpv properties.)
- Does pausing actually freeze the output, not just stop progressing the timecode?
- Does the GL context survive a window resize?
- Does the GL context survive entering and exiting fullscreen?

---

## 5. Phased build plan

Each phase ends with a working, demoable state. Don't move to phase N+1 until phase N runs end-to-end. Update this section as phases land so future-you (or future-Claude-Code-session) knows where you are.

### Phase 0: project setup

- Install Tauri CLI: `cargo install tauri-cli --version "^2"` and `npm install --global @tauri-apps/cli` (whichever path you prefer).
- Scaffold: `npm create tauri-app@latest cassette` and pick React + TypeScript + Vite.
- Verify `npm run tauri dev` opens an empty window with the React placeholder.
- Download the latest Windows libmpv build from the mpv project and place the DLL plus headers in `src-tauri/lib/`.
- Add `libmpv2 = "5"` to `src-tauri/Cargo.toml` with the `render` feature enabled.
- Configure the build script (`build.rs`) to find the libmpv DLL at link time.
- Verify `cargo tauri dev` still launches the window after adding the mpv linkage.

**Done when:** the dev binary opens a Tauri window with React, and a Rust unit test that calls `mpv_create()` succeeds.

### Phase 1: bare playback

- Implement the video render surface (section 4).
- Tauri command: `play_file(path: string)`.
- Hardcoded smoke test: load a known local video file, see it play in the window with audio.
- Basic keyboard handling: spacebar toggles pause, arrow keys seek 5 seconds.
- No UI yet beyond a debug overlay showing the current timecode.

**Done when:** drag-and-drop a `.mkv` file onto the dev window (or pass the path as a CLI arg) and watch it play.

### Phase 2: library indexer

- Add `rusqlite` and create the schema from section 7.
- Tauri commands: `add_watched_folder`, `list_watched_folders`, `rescan`, `library_list`.
- Filesystem walker using `walkdir`.
- Filename parser using `torrent-name-parser`. Wrap it in a normalisation function that handles the cases listed in section 9.1.
- Group episode files into series records by parsed title.
- File watcher using `notify` for the watched folders, so dropping a file in `D:\Films` adds it to the database within a couple of seconds.

**Done when:** point at `D:\Films` and `D:\TV shows` (or wherever your test media lives), call `rescan`, then call `library_list` and see grouped, parsed results in the dev tools console.

### Phase 3: library UI

- Build the Library view (mockup spec in section 9.2).
- Title bar with window dots and "Library".
- Search input plus filter chips (All, Films, TV, Concerts).
- Continue Watching strip: 3 cards in a 16:9 grid with progress bars at the bottom of each thumb.
- Browse grid: 4 columns, 2:3 aspect posters.
- Watched folders panel at the bottom showing path and title count per folder, plus an "Add folder" row that opens the native folder picker via Tauri's dialog plugin.
- No real thumbnails yet; use solid color placeholders matching the design system colors.

**Done when:** the Library view loads from the database, looks like the mockup, and clicking a tile starts playback (handing off to Phase 1's playback path).

### Phase 4: playback UI shell

- Build the Player view (mockup spec in section 9.3).
- Title bar with filename in mono.
- Video frame area (transparent; video renders through it).
- Profile chip top-right with a green dot and current profile readout.
- Audio/subtitle chip bottom-right.
- Scrubber and transport row at the bottom.
- Wire the scrubber position to the actual playback position via the `playback:state` event.
- Controls cluster sits on the right side of the transport row, not the left (this is intentional, see section 8).

**Done when:** play a file from the Library, see the player UI overlay correctly aligned, see the timecode update as it plays.

### Phase 5: skip controls and scroll-to-scrub

- Center overlay: skip-back-5, play-pause (solid white circle), skip-forward-5.
- Click on the video area to toggle pause and show the overlay.
- Auto-hide the overlay after 2.5 seconds of no mouse movement.
- Hover halo on the side skip buttons (subtle white wash, no border).
- Mouse wheel: 1 second seek per notch. Shift+wheel: 5 seconds. Ctrl+wheel: 30 seconds.
- Scrub preview tooltip following the cursor over the scrubber, showing the target timecode in mono.
- Bind these to mpv commands: `cycle pause`, `seek N exact`.

**Done when:** all the playback feedback feels right. Scroll, click, hover should all feel instant and unsurprising.

### Phase 6: episode-aware prev/next

- When the currently playing file is recognised as a TV episode, prev/next navigates to the prev/next episode in the same series and season.
- For films and unrecognised files, prev/next does mpv's chapter navigation, or skip-90s if no chapters exist.
- Episode metadata in the transport row: `Severance · S2 E4 of 10` plus `Up next: episode 5`.
- Last episode of a season either does nothing or jumps to next season's first episode if it exists.

**Done when:** you can binge a whole season by pressing N (next-episode keybind, see section 13).

### Phase 7: TMDb integration

- Get a free TMDb API key at themoviedb.org/settings/api.
- Store the key in an env var, read at startup. For development, use a `.env` file that is gitignored.
- Tauri command: `metadata_fetch_for(library_item_id)`.
- Background tokio task that processes a queue: for each library item, query TMDb, download poster and episode still, save bytes to `metadata_cache/`, write paths into the SQLite row.
- Rate-limit politely (TMDb allows 50 requests per second, we don't need anywhere near that).
- Library UI swaps placeholder colors for real posters as the metadata-ready event fires.

**Done when:** the Library view looks like the mockup with real posters for everything mainstream.

### Phase 8: frame-grab thumbnails for Continue Watching

- On pause, or on app close while a file is partway through, run:
  ```
  ffmpeg.exe -ss <position> -i <file> -frames:v 1 -q:v 2 <thumb_path>
  ```
- Save to `metadata_cache/<file_id>_<position_seconds>.jpg`.
- Continue Watching cards prefer the frame grab over the TMDb episode still.
- Bundle ffmpeg.exe with the app in `src-tauri/bin/`.

**Done when:** stopping mid-episode and going back to the Library shows a thumbnail of where you actually were, not a generic press image.

### Phase 9: audio track propagation

- Schema already has `series_track_preferences` from Phase 2.
- When the user manually changes audio or subtitle track, write a preference for the series (not the file).
- On loading a new file that belongs to a series with a stored preference: try to match by language tag first (`eng` to `eng`), fall back to track index if language tags are missing or mismatched.
- UI: small popover above the audio chip that appears when the user changes a track. Contains "Audio set to English (track 2)", a toggle "Apply to all episodes of Severance (10 episodes)", and Apply / Just this file buttons. Auto-dismisses after 8 seconds.

**Done when:** you change audio to English on episode 1 of an Italian-default series, and episodes 2 through 10 also play in English without intervention.

### Phase 10: profile system and shader chains

- Three named profiles: Film, Anime, Low power.
- Each profile is a Rust struct mapping to:
  - A list of mpv shader files to load via `glsl-shaders`.
  - mpv settings: interpolation on/off, scale algorithms, dither, etc.
- Bundle shader files in `src-tauri/resources/shaders/`. Sources:
  - FSRCNNX_x2_8-0-4-1.glsl (luma upscale, Film and Anime)
  - KrigBilateral.glsl (chroma upscale, Film and Anime)
  - Anime4K mode A pack (Anime only)
  - RIFE for frame interpolation if the user wants 60fps from 24fps source (optional, GPU-heavy)
- Profile chip in the player top-right shows the current profile and reflects active resolution and framerate.
- Settings drawer to switch the active profile globally or per series.

**Done when:** switching to Anime mode visibly changes the upscaling on an anime file, and switching to Low power drops GPU usage to baseline (NVDEC decode only, no shaders).

### Phase 11: polish

- Empty state for the Library when no folders are watched yet (full-screen "Add a folder" prompt).
- "Needs review" pile in the Library for files whose names didn't parse cleanly. Manual tagging UI: pick series, season, episode, save.
- Keyboard shortcuts (section 13).
- Window state persistence: size, position, last-played file, last view.
- Per-file resume position (small SQLite table, position in seconds, written every 5 seconds during playback).
- Bind to file association so Cassette can open `.mkv`, `.mp4`, etc. from Explorer.

**Done when:** you've replaced your previous player and stopped opening it.

---

## 6. Project structure

```
cassette/
├── CLAUDE.md                        # this file, kept up to date
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example                     # TMDB_API_KEY=...
├── src/                             # frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── views/
│   │   ├── LibraryView.tsx
│   │   ├── PlayerView.tsx
│   │   └── EmptyState.tsx
│   ├── components/
│   │   ├── library/
│   │   │   ├── PosterGrid.tsx
│   │   │   ├── ContinueWatching.tsx
│   │   │   ├── WatchedFolders.tsx
│   │   │   └── FilterChips.tsx
│   │   └── player/
│   │       ├── TitleBar.tsx
│   │       ├── ProfileChip.tsx
│   │       ├── AudioChip.tsx
│   │       ├── SkipOverlay.tsx
│   │       ├── Scrubber.tsx
│   │       ├── ScrubPreview.tsx
│   │       └── TransportRow.tsx
│   ├── styles/
│   │   ├── globals.css              # CSS variables, base resets
│   │   └── components.css
│   ├── lib/
│   │   ├── tauri.ts                 # typed wrappers around invoke()
│   │   ├── events.ts                # typed event subscriptions
│   │   └── format.ts                # timecode, file path formatting
│   └── types/
│       └── library.ts               # shared types matching Rust structs
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── lib/                         # libmpv DLLs
│   ├── bin/                         # bundled ffmpeg.exe
│   ├── resources/
│   │   └── shaders/                 # bundled mpv shader files
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── mpv/
│       │   ├── mod.rs
│       │   ├── render.rs            # render API + GL context
│       │   ├── controller.rs        # play/pause/seek/track commands
│       │   └── profiles.rs          # shader chain management
│       ├── library/
│       │   ├── mod.rs
│       │   ├── db.rs                # SQLite schema + queries
│       │   ├── scanner.rs           # filesystem walker + watcher
│       │   └── parse.rs             # filename parsing
│       ├── metadata/
│       │   ├── mod.rs
│       │   ├── tmdb.rs              # TMDb API client
│       │   └── thumb.rs             # ffmpeg frame grabs
│       └── commands.rs              # all Tauri command handlers
└── metadata_cache/                  # gitignored, runtime
```

---

## 7. Database schema

```sql
CREATE TABLE watched_folders (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  added_at INTEGER NOT NULL
);

CREATE TABLE series (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER,
  tmdb_id INTEGER,
  poster_path TEXT,
  UNIQUE(title, year)
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  parsed_title TEXT,
  parsed_year INTEGER,
  parsed_season INTEGER,
  parsed_episode INTEGER,
  series_id INTEGER REFERENCES series(id),
  duration_seconds INTEGER,
  resolution TEXT,
  added_at INTEGER NOT NULL,
  last_played_at INTEGER,
  resume_position_seconds INTEGER DEFAULT 0,
  poster_path TEXT,
  thumb_path TEXT,
  needs_review INTEGER DEFAULT 0
);

CREATE TABLE series_track_preferences (
  series_id INTEGER PRIMARY KEY REFERENCES series(id),
  audio_lang TEXT,
  audio_track_index INTEGER,
  subtitle_lang TEXT,
  subtitle_track_index INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_files_series ON files(series_id, parsed_season, parsed_episode);
CREATE INDEX idx_files_last_played ON files(last_played_at DESC) WHERE last_played_at IS NOT NULL;
CREATE INDEX idx_files_needs_review ON files(needs_review) WHERE needs_review = 1;
```

All timestamps are unix epoch seconds (INTEGER). Strings are UTF-8.

---

## 8. Design system

The aesthetic is minimal, monochrome, premium. Linear / Arc / Things 3 territory. The video itself is the canvas; chrome recedes.

### UI pass changelog (applied January 2025 via Codex)

The following changes were made in a non-destructive visual pass. This section records what changed so future sessions don't revert them.

- Color tokens extended: new semantic layer (`--color-bg`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-accent`) added above the existing tokens. Legacy tokens (`--bg-base`, `--bg-frame`) now map to the new layer rather than hardcoded hex.
- New accent: `--color-accent: #8C3A3A` (muted burgundy). Use for secondary interactive states only. Does not replace `--accent-active` (the green dot). Do not use both in the same component without intent.
- Motion standard token added: all transitions now reference `--motion-standard` rather than ad-hoc ease values.
- Font stack: Inter promoted to first position. Playfair Display added as `--font-display` for library headings and editorial moments only. Do not use on player chrome, chips, or any technical readout.
- Spacing: library padding widened from 16px to 20px horizontal, 24px to 28px bottom. Card gaps widened from 10px to 12px.
- Title bar separator: `var(--border-subtle)` replaced with `rgba(245, 245, 243, 0.025)` directly (slightly softer).
- Global font-weight: body weight shifted from 500 to 400. Note: a small number of components deliberately used 500 for hierarchy (episode title in transport row, filter chip active state, profile chip label). Check these in context before accepting the global change wholesale.
- Grain overlay: `.app::after` pseudo-element at `opacity: 0.03`. Subtle noise texture on the outermost container. Pointer-events none, does not affect interaction.
- Microcopy: "Watched folders" renamed to "Sources". "Save" renamed to "Apply" throughout. "Fetch posters" renamed to "Refresh metadata".

### Colors

```css
:root {
  /* Semantic layer (added in UI pass) */
  --color-bg: #0B0B0C;                        /* outermost background */
  --color-surface: #141416;                   /* elevated surface, cards, video frame fallback */
  --color-text-primary: #F5F5F3;              /* primary text */
  --color-text-secondary: #A1A1A6;            /* secondary / muted text */
  --color-accent: #8C3A3A;                    /* muted burgundy, secondary interactive */

  /* Legacy tokens — map to semantic layer, keep for backward compat */
  --bg-base: var(--color-bg);
  --bg-frame: var(--color-surface);

  /* Remaining surface tokens */
  --bg-elevated: rgba(255, 255, 255, 0.04);   /* subtle row backgrounds */
  --bg-chip: rgba(15, 15, 15, 0.7);           /* floating overlay chips */
  --bg-hover: rgba(255, 255, 255, 0.11);      /* button hover halo */
  --bg-handle: rgba(255, 255, 255, 0.95);     /* scrubber handle, primary CTA */

  /* Borders */
  --border-subtle: rgba(245, 245, 243, 0.025); /* updated in UI pass */
  --border-frame: rgba(255, 255, 255, 0.08);

  /* Text (legacy, kept for components not yet migrated) */
  --text-primary: rgba(255, 255, 255, 0.85);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-tertiary: rgba(255, 255, 255, 0.45);
  --text-muted: rgba(255, 255, 255, 0.4);
  --text-inverse: #0B0B0C;

  /* Accents */
  --accent-active: #5DCAA5;                   /* green dot, active state indicator */

  /* Radii */
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Typography */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: "Playfair Display", Georgia, serif;  /* library headings only */
  --font-mono: "SF Mono", "JetBrains Mono", "Consolas", monospace;

  /* Motion */
  --motion-standard: 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
```

### Typography rules

- Default body weight is 400. Use 500 only for deliberate hierarchy: episode title in the transport row, active filter chip label, profile chip label, poster card title. Never use 600 or above.
- `--font-display` (Playfair Display) is for library section headings and editorial moments only. Never use on player chrome, floating chips, technical readouts, or any element smaller than 16px.
- Sentence case throughout. Never Title Case, never ALL CAPS.
- No em dashes anywhere in UI strings, code comments, file paths, or this document. Use commas, middle dots, parentheses, or colons. Hard rule. ESLint rule to enforce on TS, pre-commit check for Rust.
- Sizes: 11px (smallest, mono labels), 12px (body), 13px (page headers). Never go below 11px.
- Letter-spacing: 0.04em on small caption labels like "Continue watching", "Browse", "Sources".
- Mono font is for technical readouts only: timecodes, filenames, GPU stats, file paths, episode numbers, download speeds.
- All transitions use `var(--motion-standard)`. Do not write ad-hoc `180ms ease` or similar.

### Layout primitives

- Outer player frame: 12px radius, 0.5px border, `var(--color-bg)` background.
- Title bar: 12px vertical padding, 20px horizontal padding, three small dot indicators on the left, content at 12-13px, 0.5px bottom border at `var(--border-subtle)` opacity.
- Video frame: 16:9 aspect, transparent when video is playing, `var(--color-surface)` fallback when nothing is loaded.
- Transport section: 14px / 18px padding around scrubber and controls.
- Library padding: 20px horizontal, 28px bottom. Card gaps: 12px.
- Chips on video: 6px / 11px padding, 999px radius, `var(--bg-chip)` background, no border.

### Component conventions

- Borderless surfaces. Almost nothing has a stroke. The exceptions are the outermost player frame and the title bar separator.
- Floating chips for status info: dark translucent pill, no border. Top-right for visual profile, bottom-right for audio/subtitles.
- Hover affordance: bare icons that brighten and gain a soft circular halo on hover. No fixed button outlines. Idle icon at 70% opacity, hovered at 100% with `var(--bg-hover)` background.
- The center play button is the one exception: weightless triangle at rest, aurora blob flourish on toggle. No circle, no housing.
- The grain overlay (`.app::after`) sits at the outermost container only. Do not add grain to nested surfaces.

### Tone of UI text

- Direct, functional, no marketing voice.
- "Sources" not "Watched folders". "Apply" not "Save". "Refresh metadata" not "Fetch posters".
- File paths verbatim: `D:\Films`, never `D:/Films` or `D:\\Films`.
- Counts: "42 titles", "19 series", not "42 Titles" or "42 items".
- Time formatting: `01:24:18` (with hours when needed), `23:18 / 47:02`. Always zero-padded.

---

## 9. Component specifications

### 9.1 Filename parser

The parser extracts metadata from typical scene release filenames. Use `torrent-name-parser` as the base, then post-process with a normalisation layer to handle the cases below.

Examples to handle:

| Input | Expected output |
|---|---|
| `Severance.S02E04.2160p.HDR.WEB-DL.H265.mkv` | series=Severance, season=2, episode=4, resolution=2160p |
| `Blade Runner 2049 (2017) [4K HDR].mkv` | film, title=Blade Runner 2049, year=2017 |
| `the.bear.s03e02.1080p.amzn.web-dl.mkv` | series=The Bear, season=3, episode=2 |
| `Atlanta.S01.Complete.720p/Atlanta.S01E01.mkv` | series=Atlanta, season=1, episode=1 |
| `Stalker (1979).mkv` | film, title=Stalker, year=1979 |
| `Random.Family.Vacation.2019.mp4` | film, title=Random Family Vacation, year=2019 |

Normalisation:

- Replace dots and underscores with spaces.
- Title-case each word (with sensible handling of "the", "of", "and" if you care; first pass can ignore).
- Strip release tags: WEB-DL, BluRay, x264, HDR, H265, HEVC, AMZN, NF, DV, etc.
- Resolution: keep only `2160p`, `1080p`, `720p`, `480p`. Discard everything else.
- If no season/episode and no year, mark `needs_review = 1`. These appear in a separate pile in the Library so the user can tag them manually.

### 9.2 Library view

(Mockup reference: see the chat history visualizations.)

Top-to-bottom order:

1. Title bar: window dots (three small dim circles) plus "Library" at 13px / weight 500.
2. Search input plus filter chips row. Search placeholder: "Search 193 titles" (number reflects current library count). Chips: All, Films, TV, Concerts. Active chip is white background with dark text.
3. "Continue watching" label (11px caption) plus a 3-card grid. Cards are 16:9 thumbs with a 2px progress bar across the bottom of the thumb, then below the thumb: title at 12px / 500, sub at 11px mono dimmer (e.g., `S2 E4, 38 min left`).
4. "Browse" label plus a 4-column poster grid. Posters are 2:3 with title and year in the bottom-left corner.
5. "Watched folders" label plus folder rows. Each row: small folder icon, path in mono, title count on the right (`132 titles`, `19 series`). Last row is "Add folder" with a plus icon, opens the native folder picker.

### 9.3 Player view

Top-to-bottom:

1. Title bar: window dots plus filename in mono, e.g., `Severance.S02E04.2160p.HDR.mkv`.
2. Video frame area:
   - Top-right: profile chip with green dot and `Film, 2160p, 60 fps` in mono.
   - Center: skip-back-5, play-pause (solid white circle when paused, 72px), skip-forward-5. Visible on click or mouse movement, fades after 2.5 seconds. Hover state: skip icons gain a soft circular halo (`var(--bg-hover)`) and brighten to 100% opacity.
   - Bottom-right: audio chip, e.g., `EN audio · subs off`.
3. Transport section:
   - Scrubber line (2px tall, very subtle background). Filled portion is bright white. Handle is a 9px white circle.
   - Hover preview tooltip floats above the scrubber at the cursor position, showing target timecode in mono with a small pointing tail.
   - Bottom row split into two:
     - Left: `Severance · S2 E4 of 10` at 12px / 500, then `Up next: episode 5` at 11px mono dimmer.
     - Right: prev / play / next icon group, then `23:18 / 47:02` timecode in mono. The control cluster is on the right side, never the left.

### 9.4 Audio track popover

Appears when the user manually changes an audio or subtitle track. Floats above the audio chip in the bottom-right. Contents:

- Heading: `Audio set to English (track 2)` in 12px / 500.
- Toggle row: `Apply to all episodes of Severance (10 episodes)` with a toggle on the right. Default state: on.
- Buttons: `Apply` (primary, white background) and `Just this file` (secondary, transparent with subtle border).
- Auto-dismisses after 8 seconds of inactivity, applying whichever state the toggle is in.

If the file is not part of a series (a film or unparsed), the toggle is hidden and the popover only shows the heading and an OK button.

### 9.5 Scrub preview tooltip

Small dark pill floating above the scrubber line at the cursor position. Contains the target timecode in mono (`31:24`). Has a small triangular tail at the bottom pointing down toward the line. Position updates on mousemove over the scrubber. Hidden when the cursor leaves the scrubber.

When (Phase 11+) we wire up thumbnail generation for the scrubber, this pill expands upward to also show a small frame thumb.

---

## 10. Visual profile definitions

These are the three named profiles for Phase 10. Each is a Rust struct that, on activation, runs a sequence of mpv property sets and `glsl-shaders` loads.

### Film

For live-action films and TV shows.

- Luma upscale: `FSRCNNX_x2_8-0-4-1.glsl`
- Chroma upscale: `KrigBilateral.glsl`
- Frame interpolation: optional, off by default. Toggle in the chip says "60 fps" when on.
- Debanding: `deband=yes`, `deband-iterations=2`, `deband-threshold=48`.
- Scale algorithm: `scale=ewa_lanczossharp`.
- Tone mapping: `tone-mapping=bt.2446a` for HDR sources.

### Anime

For animated content. Uses Anime4K shaders which are tuned for line art and flat shading.

- Luma upscale: Anime4K mode A shaders (chained: A through F per the official mode A pack).
- Disable FSRCNNX (it's tuned for live action).
- Chroma upscale: `KrigBilateral.glsl`.
- Frame interpolation: off (anime is animated at lower framerates intentionally; smoothing it looks wrong).
- Debanding: enabled, lower threshold (animation has fewer banding artifacts to mask).

### Low power

When you want to watch something on battery without spinning the GPU up.

- No shaders. Empty `glsl-shaders` list.
- Hardware decoding via NVDEC (`hwdec=auto`).
- Scale algorithm: default `bilinear`.
- Frame interpolation: off.
- Debanding: off.

Settings drawer in Phase 10 can set the active profile globally or per series. Per-series preference, when set, always wins over the global setting.

---

## 11. TMDb integration notes

- API key: free, get one at https://www.themoviedb.org/settings/api after creating an account.
- Endpoints used:
  - `GET /search/tv?query=<title>` to find a series.
  - `GET /search/movie?query=<title>&year=<year>` for films.
  - `GET /tv/<id>/season/<n>` for episode lists with stills.
  - `GET /movie/<id>/images` for posters.
- Image base URL: `https://image.tmdb.org/t/p/w500/<path>` for posters, `https://image.tmdb.org/t/p/w300/<path>` for episode stills (smaller, faster).
- Rate limit: TMDb allows about 50 requests per second. We should cap ourselves at 5 per second to be polite.
- Caching: download bytes once, save in `metadata_cache/`, never refetch unless the cache file is missing. Periodically (weekly maybe) check if a series has new seasons and fetch only the deltas.

---

## 12. Things Claude Code should not do

These are common mistakes when building this kind of project. Avoid them.

- **Don't use Electron.** This is a Tauri project.
- **Don't shell out to mpv.exe.** Use the libmpv2 crate's FFI bindings. The point of this project is direct mpv integration. The fallback in Appendix A is a fallback only.
- **Don't add a UI library.** No shadcn, no Radix, no Material UI, no Chakra. Hand-write the components.
- **Don't add Tailwind.** CSS variables in a single `globals.css` plus per-component scoped CSS modules.
- **Don't add a router.** Two views, switched via state.
- **Don't add an animation library.** CSS transitions for hover states.
- **Don't add a date library.** Format timecodes by hand.
- **Don't add an icon library.** Inline SVG paths for the small icon set.
- **Don't use ALL CAPS or Title Case anywhere in UI strings.** Sentence case everywhere.
- **Don't use em dashes anywhere.** Hyphens, commas, middle dots, colons, parentheses.
- **Don't write `console.log` in shipped code.** Use a tiny logger module that no-ops in release builds.
- **Don't query TMDb from the frontend.** TMDb calls happen in the Rust backend on a tokio task with caching. The frontend only sees cached results.
- **Don't put SQL queries in command handlers.** All queries live in `src-tauri/src/library/db.rs` as typed functions.
- **Don't store secrets in code.** TMDb API key in env var, gitignored `.env` for development.
- **Don't reach for the rendering fallback (Appendix A) preemptively.** Spend three days on the render API first. The result is worth it.
- **Don't pre-decide things this spec doesn't cover.** When something genuinely ambiguous comes up, ask. Don't paper over it with assumptions.

---

## 13. Keyboard shortcuts

These match mpv's defaults wherever possible. Don't reinvent.

| Key | Action |
|---|---|
| Space | Toggle pause |
| Left / Right | Seek 5 seconds |
| Shift+Left / Shift+Right | Seek 30 seconds |
| Up / Down | Volume up / down |
| F | Fullscreen |
| M | Mute |
| J / L | Seek 5 seconds back / forward |
| K | Toggle pause (Spacebar alias) |
| `[` / `]` | Slower / faster playback |
| `,` / `.` | Frame back / frame forward (when paused) |
| N / P | Next / previous episode (in season) |
| Esc | Exit fullscreen first, then close player back to Library |
| Ctrl+F | Focus search in Library view |

---

## 14. Smoke tests per phase

Run these before declaring a phase done.

| Phase | Smoke test |
|---|---|
| 1 | Cargo unit test: `mpv::tests::can_play_file` plays a 1-second fixture without panic. |
| 2 | `library_list()` returns expected counts for a fixture folder containing 1 film and one 3-episode series. Filename parser handles all 6 examples in section 9.1. |
| 3 | Library view renders without errors when database is empty (shows empty state) and when populated (shows the grid). |
| 4 | Player UI overlay sits on top of the video correctly. Resize the window: everything stays aligned. |
| 5 | Mouse wheel over the video produces 1-second seeks, no acceleration, no momentum. |
| 6 | Playing the last episode of a season and pressing N goes to next season's first episode if it exists, otherwise no-op (no crash). |
| 7 | TMDb fetcher handles rate limit responses gracefully. App restart does not lose queue progress. |
| 8 | If ffmpeg subprocess fails (e.g., delete the binary mid-test), the UI falls back to the TMDb still without console errors. |
| 9 | Switch to a track that doesn't exist on the next episode in the series. App falls back to default audio without crashing. |
| 10 | Switch profiles mid-playback. No more than one frame is dropped. |

---

## 15. Aurora flourish system

Cassette has a single interaction language layered on top of the monochrome design: a spectral colour flourish that fires on meaningful state changes. The rest of the UI stays completely flat. Colour is the verb, not the noun.

### Palette

Fixed across every flourish in the app. Always this order, always this set:

```css
:root {
  --aurora-pink:   #ff5ea3;
  --aurora-orange: #ff8a3d;
  --aurora-yellow: #ffd75e;
  --aurora-green:  #5DCAA5;   /* matches the existing accent */
  --aurora-cyan:   #5dcdf3;
  --aurora-violet: #8b5cf6;
}
```

Not pure RGB primaries. Pink is dusted, cyan is mineral, yellow is amber. This keeps the palette within the tonal world of the dark UI and away from gaming-keyboard associations.

### Rules

- **Only on state changes that mean something.** Play/pause toggle, profile switch, filter chip activation, scrub start, episode advance. Not on hover alone (hover stays as the existing white wash). Not on idle elements. Not as a loading indicator.
- **Always brief.** 850 to 1000ms total. Fast in, sweep or bloom, fade out. If the eye can dwell on it comfortably, it is too long.
- **Always returns to monochrome.** The settled state is always the existing white-and-grey palette. No colour persists after the animation ends.
- **Never obstructive.** Flourishes sit behind content via z-index. They never obscure text or icons.

### Flourish types

Five types, each matched to a surface geometry.

#### 1. Diffuse blob (play/pause button)

The play button is a borderless, weightless triangle at rest. No circle. No housing. On toggle, five independent colour blobs expand outward from behind the triangle, each heavily blurred and slightly offset from centre, unclipped, bleeding freely into the dark. They drift at slightly different speeds and delays (0ms, 20ms, 40ms, 60ms) to feel organic. The circle shape is never drawn; it is implied by the proximity of dissolving light.

```css
/* Each blob is a separate element, position: absolute, no overflow:hidden parent */
.blob-a { background: radial-gradient(circle, rgba(255,94,163,0.85) 0%, transparent 70%); filter: blur(14px); }
.blob-b { background: radial-gradient(circle, rgba(255,138,61,0.75)  0%, transparent 70%); filter: blur(16px); }
.blob-c { background: radial-gradient(circle, rgba(93,205,243,0.7)   0%, transparent 70%); filter: blur(18px); }
.blob-d { background: radial-gradient(circle, rgba(139,92,246,0.6)   0%, transparent 70%); filter: blur(20px); }
.blob-e { background: radial-gradient(circle, rgba(93,202,165,0.5)   0%, transparent 70%); filter: blur(12px); }

@keyframes blob-drift {
  0%   { opacity: 0; transform: scale(0.3); }
  30%  { opacity: 1; }
  70%  { opacity: 0.5; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(1.5); }
}
/* Duration: 860-1000ms per blob, cubic-bezier(0.22, 1, 0.36, 1) */
```

Pause icon (two bars) follows the same logic: no circle, no housing, just the bars. Same blob system fires on toggle.

#### 2. Linear sweep (profile chips, filter chips)

The spectrum slides left to right across the chip interior on activation. Clipped to the chip's border-radius. Enters and exits fast.

```css
.chip-aurora {
  position: absolute; inset: 0;
  background: linear-gradient(90deg,
    transparent,
    rgba(255,94,163,0.5),
    rgba(255,138,61,0.5),
    rgba(93,202,165,0.5),
    rgba(93,205,243,0.5),
    rgba(139,92,246,0.5),
    transparent
  );
  filter: blur(2px);
}
@keyframes chip-sweep {
  0%   { opacity: 0; transform: translateX(-100%); }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: translateX(100%); }
}
/* Duration: 700ms, ease-out */
```

#### 3. Conic bloom behind card (Continue Watching cards)

On hover, a soft conic-gradient glow blooms behind the card, sitting below it via z-index, blurred heavily. Settles to a faint persistent halo while hovered, disappears on mouse-leave.

```css
.cw-glow {
  position: absolute; inset: -1px; z-index: -1;
  background: conic-gradient(from 180deg, #ff5ea3, #ff8a3d, #5DCAA5, #5dcdf3, #8b5cf6, #ff5ea3);
  filter: blur(8px);
  border-radius: inherit;
}
@keyframes glow-bloom {
  0%   { opacity: 0; }
  35%  { opacity: 0.4; }
  100% { opacity: 0.15; }
}
/* Duration: 1200ms, ease-out. Final state: opacity 0.15 held while hovered */
```

#### 4. Linear flash (scrubber on seek)

When the user starts dragging the scrubber or mouse-wheel seeks, a spectrum gradient runs along the filled portion of the bar and fades back to white.

```css
.scrub-fill::before {
  content: '';
  position: absolute; inset: -1px 0;
  background: linear-gradient(90deg,
    transparent, #ff5ea3, #ff8a3d, #5DCAA5, #5dcdf3, #8b5cf6, transparent
  );
  filter: blur(1px);
}
@keyframes scrub-flash {
  0%   { opacity: 0; }
  30%  { opacity: 0.9; }
  100% { opacity: 0; }
}
/* Duration: 600ms, ease-out */
```

#### 5. Conic bloom small (filter chips)

Same principle as the card bloom but tighter. The gradient sits behind the chip pill, blurred heavily, blooms on activation, fades.

```css
.f-aurora {
  position: absolute; inset: -1px; z-index: -1;
  background: conic-gradient(from 0deg, #ff5ea3, #ff8a3d, #ffd75e, #5DCAA5, #5dcdf3, #8b5cf6, #ff5ea3);
  border-radius: 999px;
  filter: blur(4px);
}
@keyframes f-bloom {
  0%   { opacity: 0; }
  40%  { opacity: 0.65; }
  100% { opacity: 0; }
}
/* Duration: 700ms, ease-out */
```

### Where flourishes do not appear

Title bar, watched folder rows, timecode display, the corner profile chip readout, audio/subtitle chip, the scrubber handle, error states, empty states. These are informational surfaces. They stay completely flat. The flourish marks user agency: the system acknowledging that the user did something intentional.

### Implementation note for Claude Code

Create a single `src/styles/aurora.css` that contains all keyframe definitions and blob/aurora class definitions. Import it once in `globals.css`. Individual components import nothing extra; they just add the relevant class names. Flourishes are triggered by adding a CSS class (e.g. `is-flourishing`) to the component root, then removing it after the animation duration via a `setTimeout` in the component. Do not use JavaScript animation libraries for this.

---

## Appendix A: rendering fallback

If `libmpv_render` integration is taking longer than three days of dedicated effort, fall back to:

1. Add `mpv.exe` to `src-tauri/bin/`. Bundle in the app.
2. Spawn it with:
   ```
   mpv --idle=yes --force-window=no --keep-open=yes
       --input-ipc-server=\\.\pipe\cassette-mpv
       --wid=<HWND>
   ```
3. Connect to the named pipe from Rust using `tokio::net::windows::named_pipe::NamedPipeClient`.
4. Send JSON-RPC commands over the pipe:
   ```json
   {"command": ["loadfile", "C:\\path\\to\\file.mkv"]}
   {"command": ["set_property", "pause", true]}
   {"command": ["seek", 5, "relative"]}
   ```
5. Get the HWND of the Tauri window (or a child window) via `tauri::Window::hwnd()`. Pass that handle as `--wid=<value>`.

This works but the video lives in a separate sub-window, so HTML overlays don't naturally float over it. You'd need to position-absolute the React overlays as children of the Tauri window above the mpv area, and update positions on every Tauri window move/resize.

This is a fallback only.

---

## Appendix B: useful references

- libmpv2 docs: https://docs.rs/libmpv2/latest/libmpv2/
- libmpv2 examples (especially the render example): https://github.com/kohsine/libmpv2-rs/tree/main/examples
- mpv manual (the source of truth for everything mpv-related): https://mpv.io/manual/master/
- mpv input.conf reference: https://mpv.io/manual/master/#input-conf
- TMDb API docs: https://developer.themoviedb.org/reference/intro/getting-started
- Tauri 2 guide: https://v2.tauri.app/
- FSRCNNX shader: https://github.com/igv/FSRCNN-TensorFlow/releases
- Anime4K: https://github.com/bloc97/Anime4K
- KrigBilateral: https://gist.github.com/igv/a015fc885d5c22e6891820ad89555637

---

## 16. Torrent integration (Phase 12)

Cassette absorbs media from two sources: the local filesystem (existing library) and the BitTorrent network (this phase). The feature is a first-class torrent client embedded directly in the app, not a bolt-on. The UI speaks the same design language as the rest of Cassette. The experience from the user's perspective: add a magnet link or .torrent file, press play when enough has buffered, the file lands in your library when it finishes.

### Engine: librqbit

Add `librqbit` to `src-tauri/Cargo.toml`. Do not add `rqbit` (the binary wrapper). We want the library directly.

```toml
librqbit = { version = "8", features = ["http-api"] }
```

librqbit runs on tokio, which we already have. It is pure Rust, no C dependencies, and the same author has already shipped a Tauri desktop app using it, so the integration path is proven.

The two types to understand:

- `Session` is the top-level coordinator. Create one at app startup, keep it alive for the app lifetime. It manages DHT, peer connections, and all active torrents.
- `ManagedTorrentHandle` is the handle to an individual torrent. Use it to query progress, pause, resume, or stream.

```rust
use librqbit::*;

let session = Session::new(
    download_path.into(),
    SessionOptions {
        disable_dht: false,
        ..Default::default()
    }
).await?;
```

### Streaming while downloading

librqbit has a built-in HTTP server that serves the in-progress file at a localhost URL. The pieces being accessed are prioritised, so playback doesn't stall if the download is catching up. The Cassette backend:

1. Starts librqbit's HTTP server on a fixed local port (e.g. `127.0.0.1:9999`).
2. When the user presses play on a torrent, constructs the URL: `http://127.0.0.1:9999/<torrent_id>/<file_index>`.
3. Passes that URL to mpv via `play_file()`, which already accepts URLs as well as paths.
4. mpv streams over HTTP from librqbit. No changes needed to the mpv integration.

This is the cleanest possible approach. mpv handles HTTP natively, librqbit handles the partial-file complexity, Cassette just passes a URL.

The "Play" button on a downloading torrent becomes active once 2% of the file has downloaded (configurable). Before that it is visible but dimmed with a "buffering" label.

### Auto-import on completion

When a torrent completes:

1. The file is already in the configured download folder (librqbit writes there directly).
2. The library file watcher (`notify`) picks it up within seconds.
3. The filename parser runs on it.
4. It appears in the library with its poster and metadata.
5. The torrent entry in the Downloads view gets an "In library" badge and a soft aurora flourish fires on the card (the download-complete moment is exactly the kind of state change the flourish system was designed for).

The download folder should be one of the watched library folders so there is no manual step. On first-run setup, suggest `D:\Downloads\Cassette` and add it to both the library watcher and the librqbit session download path simultaneously.

### New architecture additions

Add a `torrents` module in `src-tauri/src/`:

```
src-tauri/src/
  torrents/
    mod.rs          # Session lifecycle, startup/shutdown
    manager.rs      # Add, pause, resume, remove torrent operations
    stream.rs       # HTTP streaming server management
    state.rs        # Serialisable torrent state for the frontend
```

The `Session` handle lives in a `tokio::sync::RwLock<Option<Session>>` in Tauri's managed state, alongside the existing mpv handle.

### New Tauri commands

```
torrent_add(source: TorrentSource)
  // TorrentSource is an enum: MagnetLink(String), TorrentFile(Vec<u8>), TorrentUrl(String)

torrent_pause(id: String)
torrent_resume(id: String)
torrent_remove(id: String, delete_files: bool)
torrent_list()                          // all active/completed torrents
torrent_get(id: String)                 // single torrent detail
torrent_get_stream_url(id: String, file_index: usize) -> String
torrent_set_bandwidth(down_kbps: Option<u32>, up_kbps: Option<u32>)
torrent_open_file_picker()              // opens native .torrent file dialog
```

### New Tauri events

```
torrent:progress   { id, name, progress_pct, down_speed_kbps, up_speed_kbps, peers, eta_seconds, state }
torrent:complete   { id, name, file_paths: Vec<String> }
torrent:error      { id, message }
```

Emit `torrent:progress` on a 1-second interval per active torrent from a tokio task. Emit `torrent:complete` and `torrent:error` as they occur.

### Windows: magnet link URI handler

Register `magnet:` as a URI scheme in `tauri.conf.json` under `app.protocols`. When the user clicks a magnet link in a browser, Cassette opens and the link is passed to `torrent_add` automatically. This is a one-line Tauri config addition, not a build task.

```json
"protocols": [
  { "name": "magnet", "schemes": ["magnet"] }
]
```

Handle the incoming URL in the Tauri `open-url` event listener in `main.rs`.

### Database additions

Add one table to the existing schema:

```sql
CREATE TABLE torrents (
  id TEXT PRIMARY KEY,                 -- librqbit info hash as hex string
  name TEXT NOT NULL,
  source TEXT NOT NULL,                -- magnet link or original torrent URL/path
  state TEXT NOT NULL,                 -- 'downloading' | 'paused' | 'complete' | 'error'
  progress_pct REAL DEFAULT 0,
  added_at INTEGER NOT NULL,
  completed_at INTEGER,
  download_path TEXT,                  -- final file path when complete
  file_count INTEGER DEFAULT 1,
  error_message TEXT
);
```

### UI: Downloads view

The Downloads view is a new top-level section in the Library, accessible via a fourth filter chip alongside All, Films, TV, Concerts. Label: "Downloads".

When there are no active or recent downloads, the view shows the add-torrent panel (see below) full-width. When downloads exist, the panel shrinks to a persistent strip at the top and the download cards fill the space below.

#### Add torrent panel

A single input strip. Contains:

- A text field with placeholder `Paste a magnet link`. Full-width minus the buttons.
- A "Browse" button (opens native .torrent file picker).
- An "Add" button (primary action, triggers `torrent_add`).

The strip accepts drag-and-drop of `.torrent` files onto it. On drop, the file bytes are read and passed directly to `torrent_add` without a dialog.

No additional UI. No tracker list, no advanced settings visible by default. Keep the complexity in the settings drawer (see bandwidth section below).

#### Download card

Each torrent gets a card in a single-column list (not a grid, because cards carry more metadata than posters):

```
┌─────────────────────────────────────────────────────┐
│  [16:9 thumb or placeholder]  Title                 │
│                                S2 E4 · 2.3 GB       │
│  ████████████░░░░░░░░ 43%      ↓ 4.2 MB/s  12 peers │
│  ETA 18 min                   [Pause]  [Play]       │
└─────────────────────────────────────────────────────┘
```

Design rules for the card:

- Same monochrome language as the rest of Cassette.
- Progress bar is the same 2px style as the Continue Watching strip, not a chunky custom component.
- Speed and peer count in mono at 11px, right-aligned.
- "Play" button becomes active (full white) at 2% complete. Before that it is rendered but at 30% opacity with the label "Buffering".
- "Pause" toggles to "Resume" when the torrent is paused.
- On completion, the progress bar disappears, the buttons are replaced by an "In library" badge (11px, green dot matching `--accent-active`), and the aurora bloom fires on the card.
- If the torrent errors, the progress bar turns a dim red and the error message appears at 11px below the bar.

#### Scrubber buffer indicator

When mpv is playing a streaming torrent (i.e. a localhost HTTP URL), the scrubber gains a second layer showing how much of the file has been downloaded as a dimmer white fill behind the played fill:

```
[played ████████          buffered ░░░░░░░░░         ]
```

The buffer position is derived from `torrent:progress` events. If the torrent is complete, the buffer indicator matches the scrubber end and is effectively invisible. This is one additional `div` absolutely positioned in the scrubber, `z-index` below the played fill.

### Bandwidth settings

Add a "Network" section to the settings drawer (Phase 10's settings drawer, which exists by Phase 12):

- Download speed limit: number input in MB/s, 0 = unlimited.
- Upload speed limit: same.
- Active when: always / when playing / never (lets the user stop seeding without hunting for the setting).
- Persist to a `settings` key in SQLite.

These call `torrent_set_bandwidth` on change. Changes take effect immediately without restarting the session.

### Smoke tests (Phase 12)

| Test | Pass condition |
|---|---|
| Magnet link add | Add a valid public domain magnet link (e.g. a Big Buck Bunny torrent). Torrent appears in the Downloads view within 3 seconds. Peers begin connecting within 30 seconds. |
| .torrent file drag-and-drop | Drag a .torrent file onto the add panel. Same result as magnet link. |
| Stream-while-downloading | Press Play at 2% complete. mpv starts playing within 5 seconds. Playback does not stall unless the download falls behind the playback position. |
| Auto-import | Let a small torrent complete. Within 10 seconds it appears in the main Library grid with correct metadata. |
| Pause/resume | Pause a downloading torrent. Speed drops to 0. Resume: download continues from same progress point. |
| Magnet URI handler | Click a magnet link in a browser with Cassette running. Cassette comes to the foreground and the torrent begins downloading. |
| Aurora on complete | A completed torrent card shows the bloom flourish. The flourish lasts less than 1 second. The settled state shows the "In library" badge with no colour. |
| Bandwidth limit | Set a 1 MB/s download limit. Confirm in the download card that speed does not exceed 1 MB/s. |

### Things Claude Code should not do (torrent module)

- Do not add any UI to browse or search external torrent indexes. The add panel accepts magnet links and .torrent files only. The content the user puts in is their responsibility.
- Do not start the librqbit HTTP server on a publicly accessible interface. Bind only to `127.0.0.1`, never `0.0.0.0`.
- Do not expose peer IP addresses or raw DHT data in the UI. The peer count number is sufficient.
- Do not auto-start seeding after the download completes without the user's explicit opt-in. Default seed ratio is 0 (stop when complete). The user can change this in bandwidth settings.
- Do not use a separate process for librqbit. Embed it in the Tauri backend as a library. The integration should be invisible to the user.
- Do not add a torrent search UI.
