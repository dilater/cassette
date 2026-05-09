import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { TorrentInfo } from "../../types/library";
import {
  torrentAddMagnet,
  torrentAddFile,
  torrentList,
  torrentPause,
  torrentResume,
  torrentRemove,
  torrentGetFilePath,
  getDownloadFolder,
  setDownloadFolder,
} from "../../lib/tauri";

interface Props {
  onPlay: (path: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(kbps: number): string {
  if (kbps === 0) return "0 KB/s";
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} MB/s`;
  return `${kbps} KB/s`;
}

function formatEta(seconds: number | null): string {
  if (seconds == null) return "";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function DownloadsView({ onPlay }: Props) {
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [magnet, setMagnet] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadFolder, setDownloadFolderState] = useState<string>("");
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadTorrents() {
    try {
      setTorrents(await torrentList());
    } catch {}
  }

  async function loadFolder() {
    try {
      setDownloadFolderState(await getDownloadFolder());
    } catch {}
  }

  useEffect(() => {
    loadFolder();
    loadTorrents();
    intervalRef.current = setInterval(loadTorrents, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  async function handleChangeFolder() {
    try {
      const chosen = await open({ directory: true, multiple: false, title: "Choose download folder" });
      if (!chosen) return;
      const path = chosen as string;
      await setDownloadFolder(path);
      setDownloadFolderState(path);
    } catch {}
  }

  async function handleAddMagnet() {
    const m = magnet.trim();
    if (!m) return;
    setAdding(true);
    setError(null);
    try {
      await torrentAddMagnet(m);
      setMagnet("");
      await loadTorrents();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    setAdding(true);
    setError(null);
    try {
      await torrentAddFile(Array.from(new Uint8Array(buf)));
      await loadTorrents();
    } catch (ex) {
      setError(String(ex));
    } finally {
      setAdding(false);
      e.target.value = "";
    }
  }

  function handleBrowse() {
    fileInputRef.current?.click();
  }

  async function handlePlay(t: TorrentInfo) {
    const path = await torrentGetFilePath(t.id, 0);
    if (path) onPlay(path);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith(".torrent")) return;
    const buf = await file.arrayBuffer();
    setAdding(true);
    setError(null);
    try {
      await torrentAddFile(Array.from(new Uint8Array(buf)));
      await loadTorrents();
    } catch (ex) {
      setError(String(ex));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="downloads-view">
      {/* Download folder row */}
      {downloadFolder && (
        <div className="downloads-folder-row">
          <span className="downloads-folder-label">Save to</span>
          <span className="downloads-folder-path mono">{downloadFolder}</span>
          <button className="downloads-folder-change" onClick={handleChangeFolder}>change</button>
        </div>
      )}

      {/* Hidden file input for .torrent picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".torrent"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />

      {/* Add torrent strip */}
      <div
        className="downloads-add-strip"
        ref={dropRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          className="downloads-magnet-input"
          placeholder="Paste a magnet link"
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddMagnet(); }}
        />
        <button className="downloads-browse-btn" onClick={handleBrowse} disabled={adding}>
          Browse
        </button>
        <button className="downloads-add-btn" onClick={handleAddMagnet} disabled={adding || !magnet.trim()}>
          {adding ? "Adding..." : "Add"}
        </button>
      </div>
      {error && <p className="downloads-error">{error}</p>}

      {torrents.length === 0 ? (
        <div className="downloads-empty">
          <p className="downloads-empty-heading">No downloads yet</p>
          <p className="downloads-empty-sub">Paste a magnet link or drop a .torrent file above.</p>
        </div>
      ) : (
        <div className="downloads-list">
          {torrents.map((t) => (
            <TorrentCard key={t.id} torrent={t} onPlay={() => handlePlay(t)} onRefresh={loadTorrents} />
          ))}
        </div>
      )}
    </div>
  );
}

function TorrentCard({ torrent: t, onPlay, onRefresh }: { torrent: TorrentInfo; onPlay: () => void; onRefresh: () => void }) {
  const isPlayable = t.progress_pct >= 2 || t.state === "complete";
  const [removing, setRemoving] = useState(false);

  async function handlePauseResume() {
    if (t.state === "paused") {
      await torrentResume(t.id);
    } else {
      await torrentPause(t.id);
    }
    onRefresh();
  }

  async function handleRemove() {
    setRemoving(true);
    await torrentRemove(t.id, false);
    onRefresh();
  }

  return (
    <div className={`torrent-card${t.state === "complete" ? " complete" : ""}`}>
      <div className="torrent-card-body">
        <div className="torrent-info">
          <div className="torrent-name">{t.name}</div>
          <div className="torrent-meta mono">
            {formatBytes(t.size_bytes)}
            {t.state === "downloading" && t.down_speed_kbps > 0 && (
              <> · <DownArrow /> {formatSpeed(t.down_speed_kbps)}</>
            )}
            {t.peers > 0 && <> · {t.peers} peers</>}
            {t.eta_seconds != null && t.state === "downloading" && (
              <> · {formatEta(t.eta_seconds)} left</>
            )}
          </div>
        </div>

        <div className="torrent-actions">
          {t.state === "complete" ? (
            <span className="torrent-badge-complete">
              <GreenDot /> in library
            </span>
          ) : (
            <button className="torrent-action-btn" onClick={handlePauseResume}>
              {t.state === "paused" ? "Resume" : "Pause"}
            </button>
          )}
          <button
            className={`torrent-play-btn${isPlayable ? "" : " buffering"}`}
            onClick={onPlay}
            disabled={!isPlayable}
          >
            {isPlayable ? "Play" : "Buffering"}
          </button>
          <button className="torrent-remove-btn" onClick={handleRemove} disabled={removing}>
            {removing ? "..." : "Remove"}
          </button>
        </div>
      </div>

      {t.state !== "complete" && (
        <div className="torrent-progress-track">
          <div
            className="torrent-progress-fill"
            style={{ width: `${Math.min(100, t.progress_pct)}%` }}
          />
        </div>
      )}

      {t.state === "error" && t.error_message && (
        <div className="torrent-error-msg mono">{t.error_message}</div>
      )}
    </div>
  );
}

function DownArrow() {
  return <span style={{ fontSize: 10 }}>↓</span>;
}

function GreenDot() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--accent-active)",
        marginRight: 4,
        verticalAlign: "middle",
      }}
    />
  );
}
