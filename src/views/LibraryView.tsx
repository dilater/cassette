import { useState, useEffect, useMemo, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LibraryItem, WatchedFolder, LibraryFilter, FolderGroup } from "../types/library";
import { libraryList, listWatchedFolders, rescan, fetchMetadataAll, getFavouriteFilms, getFavouriteEpisodes, getCollectionStats, libraryNeedsReview, tagNeedsReview, scanFilmDurations } from "../lib/tauri";
import { posterColor } from "../lib/format";
import FilterChips from "../components/library/FilterChips";
import ContinueWatching from "../components/library/ContinueWatching";
import PosterGrid from "../components/library/PosterGrid";
import SeriesView from "../components/library/SeriesView";
import WatchedFolders from "../components/library/WatchedFolders";
import MetadataEditor from "../components/library/MetadataEditor";
import DownloadsView from "../components/library/DownloadsView";
import ArchivingView from "./ArchivingView";
import EmptyState from "./EmptyState";
import WindowControls from "../components/WindowControls";

interface Props {
  onPlay: (item: LibraryItem) => void;
}

function sep(path: string) {
  return path.includes("\\") ? "\\" : "/";
}

function dirName(dirPath: string): string {
  const lastSep = Math.max(dirPath.lastIndexOf("\\"), dirPath.lastIndexOf("/"));
  return lastSep >= 0 ? dirPath.substring(lastSep + 1) : dirPath;
}

function sortItems(a: LibraryItem, b: LibraryItem): number {
  if (a.parsed_season != null && b.parsed_season != null) {
    if (a.parsed_season !== b.parsed_season) return a.parsed_season - b.parsed_season;
    return (a.parsed_episode ?? 0) - (b.parsed_episode ?? 0);
  }
  return a.filename.localeCompare(b.filename);
}

// Group files by the first subdirectory under each watched folder.
// Files sitting directly in a watched folder each become their own card.
function groupByTopLevel(items: LibraryItem[], watchedFolders: WatchedFolder[]): FolderGroup[] {
  // Sort watched folders longest-first so the deepest match wins
  const roots = watchedFolders
    .map((f) => f.path.replace(/[/\\]$/, ""))
    .sort((a, b) => b.length - a.length);

  const groupMap = new Map<string, LibraryItem[]>();

  for (const item of items) {
    const root = roots.find(
      (r) => item.path.startsWith(r + "\\") || item.path.startsWith(r + "/")
    );

    let key: string;
    if (root) {
      const relative = item.path.slice(root.length + 1);
      const firstPart = relative.split(/[/\\]/)[0];
      // If firstPart IS the filename the file is a direct loose file in the watched folder
      key = firstPart === item.filename
        ? item.path
        : root + sep(root) + firstPart;
    } else {
      key = item.path;
    }

    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(item);
  }

  return Array.from(groupMap.entries())
    .map(([key, groupItems]) => {
      groupItems.sort(sortItems);
      const isMulti = groupItems.length > 1;
      const first = groupItems[0];
      const name = isMulti
        ? dirName(key)
        : (first.series_title ?? first.parsed_title ?? first.filename);
      return {
        dirPath: key,
        name,
        items: groupItems,
        isTV: groupItems.some((i) => i.parsed_season != null),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function makeLibraryItemFromPath(filePath: string): LibraryItem {
  const filename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return {
    id: -1,
    path: filePath,
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
}

export default function LibraryView({ onPlay }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<FolderGroup | null>(null);
  const [editingGroup, setEditingGroup] = useState<FolderGroup | null>(null);
  const [scanning, setScanning] = useState(false);
  const [needsReview, setNeedsReview] = useState<LibraryItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    const [fetchedItems, fetchedFolders, review] = await Promise.all([
      libraryList("all"),
      listWatchedFolders(),
      libraryNeedsReview(),
    ]);
    setItems(fetchedItems);
    setFolders(fetchedFolders);
    setNeedsReview(review);
  }

  async function handleRescan() {
    setScanning(true);
    await rescan();
    await loadData();
    setScanning(false);
    // Kick off metadata fetch silently — errors mean no API key configured, which is fine
    fetchMetadataAll().catch(() => {});
    // Scan film durations via ffprobe for any films missing duration_seconds
    scanFilmDurations().catch(() => {});
  }

  // Rescan on mount so new files are picked up automatically
  useEffect(() => { handleRescan(); }, []);

  useEffect(() => {
    const unlisten = listen("library:metadata-ready", () => { loadData(); });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const continueWatching = useMemo(() => {
    return items
      .filter((i) => {
        const pos = i.resume_position_seconds ?? 0;
        const dur = i.duration_seconds ?? 0;
        if (i.last_played_at == null || pos < 30) return false;
        // Hide if within 3 minutes of the end, or past 95% of duration
        if (dur > 0 && (pos >= dur - 180 || pos / dur >= 0.95)) return false;
        return true;
      })
      .sort((a, b) => (b.last_played_at ?? 0) - (a.last_played_at ?? 0))
      .slice(0, 3);
  }, [items]);

  const folderGroups = useMemo(() => {
    if (filter === "collection") return [];
    let base = items;
    if (filter === "film") base = items.filter((i) => i.parsed_season == null);
    else if (filter === "tv") base = items.filter((i) => i.parsed_season != null);

    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((i) =>
        (i.series_title ?? "").toLowerCase().includes(q) ||
        (i.parsed_title ?? "").toLowerCase().includes(q) ||
        i.filename.toLowerCase().includes(q)
      );
    }

    const groups = groupByTopLevel(base, folders);

    if (filter === "tv") return groups.filter((g) => g.isTV);
    if (filter === "film") return groups.filter((g) => !g.isTV);
    return groups;
  }, [items, folders, filter, search]);

  // Ctrl+F focuses the search input
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyF") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const appWindow = getCurrentWindow();

  return (
    <div className="library-view">
      <div
        className="title-bar"
        data-tauri-drag-region
        onDoubleClick={() => appWindow.toggleMaximize()}
      >
        <EmberMark />
        <span className="title-bar-label">Library</span>
        <button
          className={`library-refresh-btn${scanning ? " scanning" : ""}`}
          onClick={handleRescan}
          disabled={scanning}
          data-tauri-no-drag
          aria-label="Refresh library"
        >
          <RefreshIcon />
        </button>
        <WindowControls />
      </div>

      <div className="search-filter-row" data-tauri-no-drag>
        <input
          ref={searchRef}
          className="search-input"
          placeholder={`Search ${items.length} titles`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterChips active={filter} onChange={setFilter} />
      </div>

      {selectedGroup ? (
        <SeriesView
          group={selectedGroup}
          onPlay={(item) => { setSelectedGroup(null); onPlay(item); }}
          onBack={() => setSelectedGroup(null)}
        />
      ) : filter === "archiving" ? (
        <div className="library-body">
          <ArchivingView />
        </div>
      ) : filter === "downloads" ? (
        <div className="library-body">
          <DownloadsView onPlay={(path) => onPlay(makeLibraryItemFromPath(path))} />
        </div>
      ) : filter === "collection" ? (
        <div className="library-body">
          <CollectionView onPlay={onPlay} onEdit={setEditingGroup} />
        </div>
      ) : folders.length === 0 ? (
        <EmptyState onFolderAdded={loadData} />
      ) : (
        <div className="library-body">
          <ContinueWatching items={continueWatching} onPlay={onPlay} />
          <PosterGrid
            groups={folderGroups}
            onPlay={onPlay}
            onOpenGroup={setSelectedGroup}
            onEdit={setEditingGroup}
            onChanged={loadData}
          />
          {needsReview.length > 0 && (
            <NeedsReviewSection items={needsReview} onTagged={() => { loadData(); fetchMetadataAll().catch(() => {}); }} />
          )}
          <WatchedFolders
            folders={folders}
            allItems={items}
            onFolderAdded={loadData}
          />
        </div>
      )}
      {editingGroup && (
        <MetadataEditor
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onApplied={() => { setEditingGroup(null); loadData(); }}
        />
      )}
    </div>
  );
}

// ── Collection view ───────────────────────────────────────────────────────────

function CollectionView({ onPlay, onEdit }: { onPlay: (item: LibraryItem) => void; onEdit: (group: FolderGroup) => void }) {
  const [films, setFilms] = useState<LibraryItem[]>([]);
  const [episodes, setEpisodes] = useState<LibraryItem[]>([]);
  const [stats, setStats] = useState<[number, number, number]>([0, 0, 0]);

  async function load() {
    const [f, e, s] = await Promise.all([
      getFavouriteFilms(),
      getFavouriteEpisodes(),
      getCollectionStats(),
    ]);
    setFilms(f);
    setEpisodes(e);
    setStats(s);
  }

  useEffect(() => { load(); }, []);

  const [filmsWatched, seriesWatched, totalHours] = stats;

  return (
    <>
      {/* Stats strip */}
      <div className="collection-stats">
        <span>{filmsWatched} films watched</span>
        <span style={{ color: "var(--border-frame)" }}>·</span>
        <span>{seriesWatched} series with watched episodes</span>
        <span style={{ color: "var(--border-frame)" }}>·</span>
        <span>{Math.round(totalHours)} hours watched</span>
      </div>

      {/* Favourite films */}
      {films.length > 0 && (
        <>
          <p className="section-label">Favourite films</p>
          <div className="poster-grid">
            {films.map((item) => {
              const posterSrc = item.poster_path ? convertFileSrc(item.poster_path) : null;
              const displayName = item.series_title ?? item.parsed_title ?? item.filename;
              const group: FolderGroup = { dirPath: item.path, name: displayName, items: [item], isTV: false };
              return (
                <div
                  key={item.id}
                  className="poster-card"
                  onClick={() => onPlay(item)}
                  onContextMenu={(e) => { e.preventDefault(); onEdit(group); }}
                >
                  <div className="poster-image">
                    {posterSrc ? (
                      <img src={posterSrc} alt={displayName} className="poster-real-img" />
                    ) : (
                      <div className="poster-placeholder" style={{ background: posterColor(displayName) }} />
                    )}
                    <div className="poster-overlay">
                      <div className="poster-title">{displayName}</div>
                      {item.parsed_year && <div className="poster-year">{item.parsed_year}</div>}
                      {item.user_rating != null && (
                        <div className="poster-year" style={{ color: "var(--accent-active)" }}>
                          {"★"} {item.user_rating}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Favourite episodes */}
      {episodes.length > 0 && (
        <>
          <p className="section-label">Favourite episodes</p>
          <div className="fav-episodes-list">
            {episodes.map((item) => {
              const posterSrc = item.poster_path ? convertFileSrc(item.poster_path) : null;
              const seriesName = item.series_title ?? item.parsed_title ?? item.filename;
              const epLabel = item.parsed_season != null && item.parsed_episode != null
                ? `${seriesName} · S${item.parsed_season} E${item.parsed_episode}`
                : seriesName;
              return (
                <div key={item.id} className="fav-episode-row" onClick={() => onPlay(item)}>
                  {posterSrc ? (
                    <img src={posterSrc} alt={seriesName} className="fav-ep-thumb" />
                  ) : (
                    <div className="fav-ep-thumb" style={{ background: posterColor(seriesName) }} />
                  )}
                  <div className="fav-ep-info">
                    <div className="fav-ep-title">{epLabel}</div>
                    {item.parsed_title && (
                      <div className="fav-ep-sub">{item.parsed_title}</div>
                    )}
                  </div>
                  {item.user_rating != null && (
                    <div className="fav-ep-rating">{"★"} {item.user_rating}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {films.length === 0 && episodes.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <p className="empty-state-heading">No favourites yet</p>
          <p className="empty-state-sub">Star any title in the library to add it here.</p>
        </div>
      )}
    </>
  );
}

// ── Needs-review section ──────────────────────────────────────────────────────

function NeedsReviewSection({ items, onTagged }: { items: LibraryItem[]; onTagged: () => void }) {
  return (
    <>
      <p className="section-label">Needs review ({items.length})</p>
      <div className="review-list">
        {items.map((item) => (
          <ReviewRow key={item.id} item={item} onTagged={onTagged} />
        ))}
      </div>
    </>
  );
}

function ReviewRow({ item, onTagged }: { item: LibraryItem; onTagged: () => void }) {
  const [title, setTitle] = useState(item.parsed_title ?? item.filename.replace(/\.[^.]+$/, ""));
  const [season, setSeason] = useState(item.parsed_season?.toString() ?? "");
  const [episode, setEpisode] = useState(item.parsed_episode?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    await tagNeedsReview(
      item.id,
      title.trim(),
      season ? parseInt(season, 10) : null,
      episode ? parseInt(episode, 10) : null,
    );
    onTagged();
  }

  return (
    <div className="review-row">
      <span className="review-filename mono">{item.filename}</span>
      <div className="review-fields">
        <input
          className="review-input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="review-input review-input-short"
          placeholder="S"
          value={season}
          onChange={(e) => setSeason(e.target.value.replace(/\D/g, ""))}
        />
        <input
          className="review-input review-input-short"
          placeholder="E"
          value={episode}
          onChange={(e) => setEpisode(e.target.value.replace(/\D/g, ""))}
        />
        <button
          className="review-save-btn"
          onClick={handleSave}
          disabled={saving || !title.trim()}
        >
          {saving ? "applying" : "apply"}
        </button>
      </div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  );
}

function EmberMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      style={{ flexShrink: 0, marginRight: 8 }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ember-glow-lib" cx="50%" cy="88%" r="55%">
          <stop offset="0%" stopColor="#FF6B1F" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FF6B1F" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="20" height="20" rx="4" fill="#141210" />
      <rect width="20" height="20" rx="4" fill="url(#ember-glow-lib)" />
      <path d="M7.5 6.5 L14 10 L7.5 13.5 Z" fill="#C9501A" />
    </svg>
  );
}
