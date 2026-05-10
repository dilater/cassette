import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { playFile, stop, saveWindowState, getCliFile, setVideoVisible, forceVideoResize, listWatchedFolders } from "./lib/tauri";
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

  // Restore window size/position and check for CLI-launched file
  useEffect(() => {
    async function init() {
      // Always boot maximised — saved width/height could exceed the current
      // monitor (multi-monitor moves, resolution changes) and the user expects
      // a media app to fill the screen by default.
      await appWindow.maximize();
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
        };
        await handlePlay(item);
      }
    }
    init();
  }, []);

  // Save window state debounced on resize; also sync video child size
  useEffect(() => {
    const unlisten = appWindow.onResized(async () => {
      forceVideoResize().catch(() => {});
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const size = await appWindow.innerSize();
          const pos = await appWindow.outerPosition();
          await saveWindowState(size.width, size.height, pos.x, pos.y);
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
