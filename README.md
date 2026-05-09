# Cassette

Cassette is a personal home media player for Windows. It wraps mpv as the playback engine and adds a minimal, designed library UI with poster art from TMDb, per-series audio and subtitle preferences, named visual profiles backed by GLSL shader chains, Trakt sync, Letterboxd export, and a built-in torrent client for streaming while downloading. The aesthetic sits in the Linear / Arc / Things 3 territory: borderless, monochrome, monospace for technical readouts.

---

## Building from source

### Prerequisites

Cassette links against libmpv and bundles ffmpeg. These binaries are not included in the repository and must be downloaded separately before building.

**libmpv** (Windows build):
Download from [sourceforge.net/projects/mpv-player-windows/files/libmpv/](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/).
Place the following files in `src-tauri/lib/`:
- `libmpv-2.dll`
- `libmpv.dll.a`

**ffmpeg**:
Download a Windows build from [gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/).
Place `ffmpeg.exe` in `src-tauri/bin/`.

**mpv.exe** (optional, only needed for the rendering fallback path):
Place `mpv.exe` in `src-tauri/bin/`.

### Build steps

```
npm install
npm run tauri build
```

The installer is produced at `src-tauri/target/release/bundle/nsis/`.

For development with hot-reload:

```
npm run tauri dev
```

---

## Requirements

- Windows 10 or later (Windows 11 recommended)
- NVIDIA GPU recommended for shader profiles (FSRCNNX, Anime4K, KrigBilateral)
- No additional runtime dependencies: libmpv-2.dll is bundled with the installer

---

## License

MIT
