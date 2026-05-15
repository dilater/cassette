import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, PhysicalSize, PhysicalPosition, availableMonitors, primaryMonitor } from "@tauri-apps/api/window";
import { playFile, stop, saveWindowState, getWindowState, getCliFile, setVideoVisible, listWatchedFolders } from "./lib/tauri";
import type { LibraryItem } from "./types/library";
import LibraryView from "./views/LibraryView";
import PlayerView from "./views/PlayerView";
import OnboardingView from "./views/OnboardingView";

type View = "library" | "player" | "onboarding";

const appWindow = getCurrentWindow();

export default function App() {
  const [view, setView] = useState<View>("library");
  const [currentItem, setCurrentItem] = useState<LibraryItem | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smart window sizing on boot:
  // - First run (savedX === -1): 1280×800 centred on primary monitor
  // - Returning session: restore saved size/position, clamped to work area
  // - Off-screen (disconnected monitor): centre 1280×800 on primary
  useEffect(() => {
    async function init() {
      try {
        const monitors = await availableMonitors();
        const primary = (await primaryMonitor()) ?? monitors[0] ?? null;

        const [savedW, savedH, savedX, savedY] = await getWindowState().catch(
          () => [1280, 800, -1, -1] as [number, number, number, number],
        );

        if (savedX === -1 || savedY === -1) {
          // First run — no saved state
          await applyWindowSize(1280, 800, primary ? centerPos(primary, 1280, 800) : null);
        } else {
          // Check whether the saved position is on any connected monitor
          const onScreen = monitors.some((m) => {
            const wa = m.workArea;
            return (
              savedX + 300 > wa.position.x &&
              savedX < wa.position.x + wa.size.width - 200 &&
              savedY + 60 > wa.position.y &&
              savedY < wa.position.y + wa.size.height - 60
            );
          });

          if (onScreen && primary) {
            const wa = primary.workArea;
            const w = Math.min(savedW, wa.size.width - 80);
            const h = Math.min(savedH, wa.size.height - 80);
            await appWindow.setSize(new PhysicalSize(w, h));
            await appWindow.setPosition(new PhysicalPosition(savedX, savedY));
          } else {
            // Previous monitor no longer available — centre on primary
            await applyWindowSize(1280, 800, primary ? centerPos(primary, 1280, 800) : null);
          }
        }
      } catch {
        // Positioning failed — just show whatever Tauri defaulted to
      }

      await appWindow.show();

      // First-run detection: no watched folders = show onboarding
      const folders = await listWatchedFolders().catch(() => []);
      if (folders.length === 0) {
        setView("onboarding");
        return;
      }

      // If the app was opened by double-clicking a media file
      const cliFile = await getCliFile();
      if (cliFile) {
        const filename = cliFile.replace(/\\/g, "/").split("/").pop() ?? cliFile;
        const item: LibraryItem = {
          id: -1,
          path: cliFile,
          filename,
          parsed_title: null,
          parsed_year: null,
          parsed_season: null,
          parsed_episode: null,
          series_id: null,
          resolution: null,
          last_played_at: null,
          resume_position_seconds: null,
          duration_seconds: null,
          poster_path: null,
          needs_review: false,
          series_title: null,
          metadata_locked: false,
          is_favourite: false,
          user_rating: null,
          watch_status: "unwatched",
          watched_at: null,
          notes: null,
          file_missing: false,
        };
        await handlePlay(item);
      }
    }
    init();
  }, []);

  // Resize handler: save windowed state on a 1 s debounce (skip while
  // maximised so the restore size is preserved).
  // Note: the mpv child HWND is resized synchronously on the Rust side via
  // window.on_window_event(Resized) — no JS round-trip needed for that.
  useEffect(() => {
    const unlisten = appWindow.onResized(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const maximized = await appWindow.isMaximized();
          if (!maximized) {
            const size = await appWindow.innerSize();
            const pos = await appWindow.outerPosition();
            await saveWindowState(size.width, size.height, pos.x, pos.y);
          }
        } catch {}
      }, 1000);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  async function handlePlay(item: LibraryItem) {
    const resume = (item.resume_position_seconds ?? 0) > 30
      ? item.resume_position_seconds ?? undefined
      : undefined;
    await setVideoVisible(true);
    await playFile(item.path, resume);
    setCurrentItem(item);
    setView("player");
  }

  async function handleBack() {
    await stop();
    await setVideoVisible(false);
    setView("library");
  }

  return (
    <div className="app">
      {view === "onboarding" ? (
        <OnboardingView onComplete={() => setView("library")} />
      ) : view === "player" && currentItem != null ? (
        <PlayerView
          currentItem={currentItem}
          onBack={handleBack}
          onPlayItem={handlePlay}
        />
      ) : (
        <LibraryView onPlay={handlePlay} />
      )}
    </div>
  );
}

// Helpers for window positioning

async function applyWindowSize(
  w: number,
  h: number,
  pos: { x: number; y: number } | null,
) {
  await appWindow.setSize(new PhysicalSize(w, h));
  if (pos) await appWindow.setPosition(new PhysicalPosition(pos.x, pos.y));
}

function centerPos(
  monitor: { workArea: { position: { x: number; y: number }; size: { width: number; height: number } } } | null,
  w: number,
  h: number,
): { x: number; y: number } {
  if (!monitor) return { x: 100, y: 100 };
  const wa = monitor.workArea;
  return {
    x: wa.position.x + Math.max(0, Math.floor((wa.size.width - w) / 2)),
    y: wa.position.y + Math.max(0, Math.floor((wa.size.height - h) / 2)),
  };
}
