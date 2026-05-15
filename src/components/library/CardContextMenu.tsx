import { useEffect, useRef, useState } from "react";
import type { LibraryItem } from "../../types/library";
import { setWatchStatus, setUserRating, setNotes, toggleFavourite } from "../../lib/tauri";

interface Props {
  item: LibraryItem;
  x: number;
  y: number;
  onClose: () => void;
  onChanged: () => void;
  onEdit?: () => void;
}

export default function CardContextMenu({ item, x, y, onClose, onChanged, onEdit }: Props) {
  const [localRating, setLocalRating] = useState<number | null>(item.user_rating);
  const [localStatus, setLocalStatus] = useState(item.watch_status);
  const [localNote, setLocalNote] = useState(item.notes ?? "");
  const menuRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleStatusToggle() {
    const next = localStatus === "watched" ? "unwatched" : "watched";
    setLocalStatus(next);
    await setWatchStatus(item.id, next);
    onChanged();
  }

  async function handleRating(n: number) {
    const next = localRating === n ? null : n;
    setLocalRating(next);
    await setUserRating(item.id, next);
    onChanged();
  }

  async function handleNoteCommit() {
    const val = localNote.trim() || null;
    await setNotes(item.id, val);
    onChanged();
  }

  async function handleToggleFav() {
    await toggleFavourite(item.id);
    onChanged();
  }

  // Clamp position so menu stays in viewport
  const menuWidth = 220;
  const menuHeight = 240;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          background: "transparent",
        }}
        onClick={onClose}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        className="card-context-menu"
        style={{ left: clampedX, top: clampedY }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Edit metadata */}
        {onEdit && (
          <>
            <button className="ctx-item" onClick={onEdit}>Edit metadata</button>
            <div className="ctx-divider" />
          </>
        )}

        {/* Watch status */}
        <button className="ctx-item" onClick={handleStatusToggle}>
          {localStatus === "watched" ? "Mark as unwatched" : "Mark as watched"}
        </button>

        <div className="ctx-divider" />

        {/* Rating */}
        <div className="ctx-rating-row">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={`ctx-rating-btn${localRating === n ? " active" : ""}`}
              onClick={() => handleRating(n)}
              title={`Rate ${n}`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="ctx-divider" />

        {/* Note */}
        <div className="ctx-note-wrap">
          <input
            ref={noteRef}
            className="ctx-note-input"
            placeholder="Add a note..."
            value={localNote}
            onChange={(e) => setLocalNote(e.target.value)}
            onBlur={handleNoteCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        {/* Favourite toggle — always shown */}
        <div className="ctx-divider" />
        <button
          className={`ctx-item${item.is_favourite ? " danger" : ""}`}
          onClick={handleToggleFav}
        >
          {item.is_favourite ? "Remove from favourites" : "Add to favourites"}
        </button>
      </div>
    </>
  );
}
