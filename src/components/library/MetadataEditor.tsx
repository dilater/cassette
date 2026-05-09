import { useState, useEffect, useRef, useCallback } from "react";
import type { FolderGroup } from "../../types/library";
import {
  searchTmdbTitles,
  applyTmdbOverride,
  applyLocalPoster,
  setMetadataLocked,
  type TmdbSearchResult,
} from "../../lib/tauri";

interface Props {
  group: FolderGroup;
  onClose: () => void;
  onApplied: () => void;
}

export default function MetadataEditor({ group, onClose, onApplied }: Props) {
  const rep = group.items[0];
  const seriesId = rep?.series_id ?? null;
  const isLocked = rep?.metadata_locked ?? false;

  const [query, setQuery] = useState(group.name);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [selected, setSelected] = useState<TmdbSearchResult | null>(null);

  const [localImageData, setLocalImageData] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [applying, setApplying] = useState(false);
  const [lockedState, setLockedState] = useState(isLocked);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    setNoKey(false);
    try {
      const res = await searchTmdbTitles(q);
      setResults(res);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("No TMDb API key")) setNoKey(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // Initial search on open
  useEffect(() => { runSearch(group.name); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as string;
      setLocalImageData(data);
      setLocalPreviewUrl(data);
      setSelected(null);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  async function handleApply() {
    if (!rep) return;
    setApplying(true);
    try {
      if (selected) {
        await applyTmdbOverride(
          rep.id,
          seriesId,
          selected.tmdb_id,
          selected.title,
          selected.year ?? null,
          selected.poster_path ?? null,
        );
      } else if (localImageData) {
        await applyLocalPoster(
          rep.id,
          seriesId,
          manualTitle.trim() || null,
          localImageData,
        );
      }
      onApplied();
      onClose();
    } catch (err) {
      console.error("apply failed", err);
    } finally {
      setApplying(false);
    }
  }

  async function handleUnlock() {
    if (!rep) return;
    await setMetadataLocked(rep.id, false);
    setLockedState(false);
  }

  const canApply = (selected !== null || (localImageData !== null)) && !applying;
  const displayName = rep?.series_title ?? rep?.parsed_title ?? rep?.filename ?? group.name;

  return (
    <div className="metadata-editor-overlay" onClick={onClose}>
      <div className="metadata-editor" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="editor-header">
          <div>
            <div className="editor-heading">Edit metadata</div>
            <div className="editor-filename">{displayName}</div>
          </div>
          <button className="editor-close-btn" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        {/* TMDb search */}
        <div className="editor-section">
          <input
            className="editor-search-input"
            placeholder="Search TMDb..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {noKey && (
            <div className="editor-no-key">No TMDb API key configured. Add one in the library settings.</div>
          )}
          {!noKey && (
            <div className="editor-results">
              {searching && <div className="editor-results-empty">Searching...</div>}
              {!searching && results.length === 0 && query.trim() && (
                <div className="editor-results-empty">No results</div>
              )}
              {results.map((r) => (
                <button
                  key={r.tmdb_id}
                  className={`editor-result-row${selected?.tmdb_id === r.tmdb_id ? " selected" : ""}`}
                  onClick={() => { setSelected(r); setLocalImageData(null); setLocalPreviewUrl(null); }}
                >
                  {r.poster_url ? (
                    <img src={r.poster_url} alt={r.title} className="editor-result-poster" />
                  ) : (
                    <div className="editor-result-poster editor-result-poster-empty" />
                  )}
                  <div className="editor-result-info">
                    <span className="editor-result-title">{r.title}</span>
                    <span className="editor-result-meta">
                      {r.year ?? ""}
                      <span className={`editor-result-badge${r.is_tv ? " tv" : ""}`}>
                        {r.is_tv ? "TV" : "Film"}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="editor-divider">or use a local image</div>

        {/* Local override */}
        <div className="editor-section">
          <div
            ref={dropZoneRef}
            className={`editor-drop-zone${dragOver ? " drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {localPreviewUrl ? (
              <img src={localPreviewUrl} alt="preview" className="editor-drop-preview" />
            ) : (
              <span className="editor-drop-hint">drop image here</span>
            )}
          </div>
          <input
            className="editor-manual-title"
            placeholder="Manual title (optional)"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
          />
        </div>

        {/* Footer */}
        <div className="editor-footer">
          {lockedState && (
            <div className="editor-lock-badge">
              <LockIcon />
              <span>Locked - changes won't be overwritten on rescan</span>
              <button className="editor-unlock-btn" onClick={handleUnlock}>Unlock</button>
            </div>
          )}
          <div className="editor-footer-actions">
            <button className="editor-cancel-btn" onClick={onClose}>Cancel</button>
            <button
              className="editor-apply-btn"
              disabled={!canApply}
              onClick={handleApply}
            >
              {applying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="5" width="9" height="7" rx="1.5" />
      <path d="M3.5 5V3.5a2 2 0 0 1 4 0V5" />
    </svg>
  );
}
