import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, PhysicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { playFile, stop, getWindowState, saveWindowState, getCliFile, setVideoVisible, forceVideoResize } from "./lib/tauri";
import type { LibraryItem } from "./types/library";
import LibraryView from "./views/LibraryView";
import PlayerView from "./views/PlayerView";

type View = "library" | "player";

const appWindow = getCurrentWindow();

export default function App() {
  const [view, setView] = useState<View>("library");
  const [currentItem, setCurrentItem] = useState<LibraryItem | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore window size/position and check for CLI-launched file
  useEffect(() => {
    async function init() {
      const [w, h, x, y] = await getWindowState();
      if (w > 0 && h > 0) {
        await appWindow.setSize(new PhysicalSize(w, h));
      }
      if (x >= 0 && y >= 0) {
        await appWindow.setPosition(new PhysicalPosition(x, y));
      }
      await appWindow.show();

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
      {view === "library" || currentItem == null ? (
        <LibraryView onPlay={handlePlay} />
      ) : (
        <PlayerView
          currentItem={currentItem}
          onBack={handleBack}
          onPlayItem={handlePlay}
        />
      )}
    </div>
  );
}
