import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { DiscState } from "../types/library";
import { discGetState, discDismiss, discCancelArchive, discRetry, discStartArchive } from "../lib/tauri";

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${b} B`;
}

function formatEta(secs: number): string {
  if (secs <= 0) return "calculating...";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

export default function ArchivingView() {
  const [state, setState] = useState<DiscState>({ kind: "waiting" });
  const [outputFolder, setOutputFolder] = useState("");
  const [flourish, setFlourish] = useState(false);
  const prevKind = useRef<string>("");

  useEffect(() => {
    discGetState().then(setState).catch(() => {});
    let unlisten: (() => void) | null = null;
    listen<DiscState>("disc:state-changed", (e) => {
      setState(e.payload);
    }).then((f) => { unlisten = f; });
    return () => { unlisten?.(); };
  }, []);

  // Fire aurora on transition to complete
  useEffect(() => {
    if (state.kind === "complete" && prevKind.current !== "complete") {
      setFlourish(true);
      setTimeout(() => setFlourish(false), 900);
    }
    prevKind.current = state.kind;
  }, [state.kind]);

  async function handlePickFolder() {
    const folder = await openDialog({ directory: true, multiple: false }).catch(() => null);
    if (typeof folder === "string") setOutputFolder(folder);
  }

  async function handleStartArchive() {
    if (state.kind !== "detected" || !outputFolder) return;
    const safeName = state.label.replace(/[<>:"/\\|?*]/g, "_");
    const sep = outputFolder.endsWith("\\") || outputFolder.endsWith("/") ? "" : "\\";
    const isoPath = `${outputFolder}${sep}${safeName}.iso`;
    await discStartArchive(state.drive, isoPath).catch(console.error);
  }

  async function handleCancel() {
    await discCancelArchive();
  }

  async function handleDismiss() {
    await discDismiss();
    setState({ kind: "waiting" });
  }

  async function handleRetry() {
    await discRetry().catch(() => {});
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (state.kind === "waiting") {
    return (
      <div className="archiving-waiting">
        <CassetteGlyph />
        <p className="archiving-waiting-label">Insert a disc to begin</p>
      </div>
    );
  }

  if (state.kind === "detected") {
    return (
      <div className="archiving-card">
        <div className="archiving-disc-header">
          <DiscIcon />
          <div>
            <div className="archiving-disc-name">{state.label}</div>
            <div className="archiving-disc-meta mono">{formatBytes(state.size_bytes)} · {state.drive}</div>
          </div>
        </div>

        <div className="archiving-folder-row">
          <div className="archiving-folder-display mono">
            {outputFolder || "Choose output folder..."}
          </div>
          <button className="archiving-btn-secondary" onClick={handlePickFolder}>Browse</button>
        </div>

        <button
          className="archiving-btn-primary"
          onClick={handleStartArchive}
          disabled={!outputFolder}
        >
          Archive disc
        </button>
      </div>
    );
  }

  if (state.kind === "archiving") {
    const pct = state.bytes_total > 0
      ? Math.min(99, Math.round((state.bytes_read / state.bytes_total) * 100))
      : 0;
    return (
      <div className="archiving-card">
        <div className="archiving-disc-header">
          <DiscIcon />
          <div>
            <div className="archiving-disc-name">{state.label}</div>
            <div className="archiving-disc-meta mono">{state.drive}</div>
          </div>
        </div>

        <div className="archiving-progress-wrap">
          <div className="archiving-progress-bar">
            <div className="archiving-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="archiving-progress-stats">
            <span className="mono">{pct}%</span>
            <span className="mono">{state.speed_mbps.toFixed(1)} MB/s</span>
            <span className="mono">{formatBytes(state.bytes_read)} / {formatBytes(state.bytes_total)}</span>
          </div>
          <div className="archiving-eta mono">{formatEta(state.eta_seconds)}</div>
        </div>

        <button className="archiving-btn-cancel" onClick={handleCancel}>Cancel</button>
      </div>
    );
  }

  if (state.kind === "complete") {
    return (
      <div className={`archiving-card archiving-complete${flourish ? " is-flourishing" : ""}`}>
        {flourish && <div className="star-aurora" />}
        <div className="archiving-disc-header">
          <DiscIcon />
          <div>
            <div className="archiving-disc-name">{state.label}</div>
            <div className="archiving-disc-meta mono" style={{ wordBreak: "break-all" }}>
              {state.iso_path}
            </div>
          </div>
          <span className="archiving-in-library-badge">
            <span className="badge-dot" />
            In library
          </span>
        </div>
        <button className="archiving-btn-secondary" onClick={handleDismiss}>
          Archive another disc
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="archiving-card archiving-error">
        <div className="archiving-disc-header">
          <DiscIcon />
          <div>
            <div className="archiving-disc-name">{state.label}</div>
            <div className="archiving-error-msg mono">{state.message}</div>
          </div>
        </div>
        <div className="archiving-btn-row">
          <button className="archiving-btn-secondary" onClick={handleRetry}>Retry</button>
          <button className="archiving-btn-cancel" onClick={handleDismiss}>Cancel</button>
        </div>
      </div>
    );
  }

  return null;
}

function CassetteGlyph() {
  return (
    <svg className="archiving-glyph" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="112" height="64" rx="8" stroke="currentColor" strokeWidth="3" />
      <circle cx="36" cy="44" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="84" cy="44" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="36" cy="44" r="5" fill="currentColor" />
      <circle cx="84" cy="44" r="5" fill="currentColor" />
      <path d="M50 44 Q60 52 70 44" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect x="46" y="14" width="28" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function DiscIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, opacity: 0.7 }}>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}
