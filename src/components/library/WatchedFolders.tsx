import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { WatchedFolder, LibraryItem } from "../../types/library";
import { addWatchedFolder, getTmdbKey, setTmdbKey, fetchMetadataAll } from "../../lib/tauri";

interface Props {
  folders: WatchedFolder[];
  allItems: LibraryItem[];
  onFolderAdded: () => void;
}

function folderStats(folder: WatchedFolder, items: LibraryItem[]) {
  const inFolder = items.filter((i) => i.path.startsWith(folder.path));
  const titles = new Set(inFolder.map((i) => i.series_id ?? i.parsed_title ?? i.filename)).size;
  const series = new Set(inFolder.filter((i) => i.series_id != null).map((i) => i.series_id)).size;
  if (series > 0) {
    return `${titles} titles, ${series} series`;
  }
  return `${titles} titles`;
}

async function handleAddFolder(onFolderAdded: () => void) {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  const path = typeof selected === "string" ? selected : selected[0];
  if (!path) return;
  await addWatchedFolder(path);
  onFolderAdded();
  fetchMetadataAll().catch(() => {});
}

function TmdbSettings() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getTmdbKey().then((k) => {
      if (k) setKey(k);
    });
  }, []);

  async function handleSaveKey() {
    await setTmdbKey(key);
    setStatus("Key saved.");
    setTimeout(() => setStatus(null), 2000);
  }

  async function handleFetchPosters() {
    setStatus("Starting fetch...");
    try {
      const count = await fetchMetadataAll();
      setStatus(`Fetching ${count} titles...`);
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus(String(err));
      setTimeout(() => setStatus(null), 4000);
    }
  }

  return (
    <div className="tmdb-settings">
      <span className="tmdb-label">TMDb API key</span>
      <div className="tmdb-row">
        <input
          className="tmdb-input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your API key here"
          spellCheck={false}
        />
        <button className="tmdb-btn primary" onClick={handleSaveKey}>
          Apply key
        </button>
      </div>
      <div className="tmdb-row">
        <button className="tmdb-btn" onClick={handleFetchPosters}>
          Refresh metadata
        </button>
        {status && <span className="tmdb-status">{status}</span>}
      </div>
    </div>
  );
}

export default function WatchedFolders({ folders, allItems, onFolderAdded }: Props) {
  return (
    <>
      <p className="section-label">Sources</p>
      <div className="watched-folders">
        {folders.map((folder) => (
          <div key={folder.id} className="folder-row">
            <FolderIcon />
            <span className="folder-path">{folder.path}</span>
            <span className="folder-count">{folderStats(folder, allItems)}</span>
          </div>
        ))}
        <div
          className="folder-row folder-add-row"
          onClick={() => handleAddFolder(onFolderAdded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleAddFolder(onFolderAdded)}
        >
          <PlusIcon />
          <span className="folder-add-label">Add folder</span>
        </div>
      </div>
      <TmdbSettings />
    </>
  );
}

function FolderIcon() {
  return (
    <svg className="folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 3.5A1 1 0 012.5 2.5H6l1.5 1.5H13.5a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1V3.5z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
