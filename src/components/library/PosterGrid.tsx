import { useState, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FolderGroup, LibraryItem } from "../../types/library";
import { posterColor, formatDuration } from "../../lib/format";
import { toggleFavourite } from "../../lib/tauri";
import CardContextMenu from "./CardContextMenu";

interface Props {
  groups: FolderGroup[];
  onPlay: (item: LibraryItem) => void;
  onOpenGroup: (group: FolderGroup) => void;
  onEdit: (group: FolderGroup) => void;
  onChanged?: () => void;
}

interface ContextMenuState {
  item: LibraryItem;
  group: FolderGroup;
  x: number;
  y: number;
}

export default function PosterGrid({ groups, onPlay, onOpenGroup, onEdit, onChanged }: Props) {
  const [localFavs, setLocalFavs] = useState<Record<number, boolean>>({});
  const [auroraCards, setAuroraCards] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleStarClick = useCallback(async (e: React.MouseEvent, item: LibraryItem, dirPath: string) => {
    e.stopPropagation();
    e.preventDefault();
    // Optimistic update
    const current = localFavs[item.id] ?? item.is_favourite;
    setLocalFavs((prev) => ({ ...prev, [item.id]: !current }));
    // Aurora bloom
    setAuroraCards((prev) => ({ ...prev, [dirPath]: true }));
    setTimeout(() => setAuroraCards((prev) => ({ ...prev, [dirPath]: false })), 860);
    // DB write
    await toggleFavourite(item.id);
    onChanged?.();
  }, [localFavs, onChanged]);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: LibraryItem, group: FolderGroup) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ item, group, x: e.clientX, y: e.clientY });
  }, []);

  if (groups.length === 0) return null;

  return (
    <>
      <p className="section-label">Browse</p>
      <div className="poster-grid">
        {groups.map((group) => {
          const count = group.items.length;
          const firstItem = group.items[0];
          const posterSrc = firstItem?.poster_path
            ? convertFileSrc(firstItem.poster_path)
            : null;
          const handleClick = count > 1
            ? () => onOpenGroup(group)
            : () => onPlay(firstItem);
          const isFav = localFavs[firstItem?.id] ?? firstItem?.is_favourite ?? false;
          const isFlourishing = auroraCards[group.dirPath] ?? false;
          const isFilm = !group.isTV && count === 1;
          const dur = firstItem?.duration_seconds;
          const durLabel = isFilm && dur && dur >= 60 ? formatDuration(dur) : null;

          return (
            <div
              key={group.dirPath}
              className={`poster-card${isFlourishing ? " is-favouriting" : ""}`}
              onClick={handleClick}
              onContextMenu={(e) => { e.preventDefault(); handleContextMenu(e, firstItem, group); }}
            >
              <div className="poster-image">
                {posterSrc ? (
                  <img src={posterSrc} alt={group.name} className="poster-real-img" />
                ) : (
                  <div className="poster-placeholder" style={{ background: posterColor(group.name) }} />
                )}
                {isFlourishing && <div className="star-aurora" />}
                {durLabel && <span className="poster-duration">{durLabel}</span>}
                <button
                  className={`star-btn${isFav ? " starred" : ""}`}
                  onClick={(e) => handleStarClick(e, firstItem, group.dirPath)}
                  aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
                  title={isFav ? "Remove from favourites" : "Add to favourites"}
                >
                  {isFav ? <StarFilled /> : <StarOutline />}
                </button>
                <button
                  className="poster-edit-btn"
                  onClick={(e) => { e.stopPropagation(); onEdit(group); }}
                  aria-label="Edit metadata"
                  title="Edit metadata"
                >
                  <PencilIcon />
                </button>
                <div className="poster-overlay">
                  <div className="poster-title">{group.name}</div>
                  {group.isTV && count > 1 && (
                    <div className="poster-year">{count} episodes</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {contextMenu && (
        <CardContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onChanged={() => { setContextMenu(null); onChanged?.(); }}
          onEdit={() => { setContextMenu(null); onEdit(contextMenu.group); }}
        />
      )}
    </>
  );
}

function StarOutline() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <polygon points="8,1 10.2,6 15.5,6.5 11.5,10.2 12.8,15.5 8,12.5 3.2,15.5 4.5,10.2 0.5,6.5 5.8,6" />
    </svg>
  );
}

function StarFilled() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" stroke="none">
      <polygon points="8,1 10.2,6 15.5,6.5 11.5,10.2 12.8,15.5 8,12.5 3.2,15.5 4.5,10.2 0.5,6.5 5.8,6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" />
    </svg>
  );
}
