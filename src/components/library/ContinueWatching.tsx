import { useState, useEffect } from "react";
import type { LibraryItem } from "../../types/library";
import { posterColor, formatMinutesLeft } from "../../lib/format";
import { getCwThumb } from "../../lib/tauri";

interface Props {
  items: LibraryItem[];
  onPlay: (item: LibraryItem) => void;
}

function cardTitle(item: LibraryItem): string {
  return item.series_title ?? item.parsed_title ?? item.filename;
}

function cardSub(item: LibraryItem): string {
  const parts: string[] = [];
  if (item.parsed_season != null && item.parsed_episode != null) {
    parts.push(`S${item.parsed_season} E${item.parsed_episode}`);
  }
  const dur = item.duration_seconds;
  const pos = item.resume_position_seconds;
  if (dur && pos) {
    parts.push(formatMinutesLeft(dur - pos));
  }
  return parts.join(", ");
}

function progressPct(item: LibraryItem): number {
  const dur = item.duration_seconds;
  const pos = item.resume_position_seconds;
  if (!dur || !pos || dur === 0) return 0;
  return Math.min(100, (pos / dur) * 100);
}

function CwCard({ item, onPlay }: { item: LibraryItem; onPlay: (item: LibraryItem) => void }) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const pos = item.resume_position_seconds ?? 0;

  useEffect(() => {
    if (pos < 5) return;
    getCwThumb(item.id, item.path, pos).then((src) => {
      if (src) setThumbSrc(src);
    }).catch(() => {});
  }, [item.id, item.path, pos]);

  return (
    <div className="cw-card" onClick={() => onPlay(item)}>
      <div className="cw-thumb-wrap">
        {thumbSrc ? (
          <img src={thumbSrc} alt={cardTitle(item)} className="cw-thumb-img" />
        ) : (
          <div
            className="cw-thumb-placeholder"
            style={{ background: posterColor(cardTitle(item)) }}
          />
        )}
        <div className="cw-progress-bar">
          <div
            className="cw-progress-fill"
            style={{ width: `${progressPct(item)}%` }}
          />
        </div>
      </div>
      <div className="cw-glow" />
      <div className="cw-info">
        <div className="cw-title">{cardTitle(item)}</div>
        {cardSub(item) && (
          <div className="cw-sub">{cardSub(item)}</div>
        )}
      </div>
    </div>
  );
}

export default function ContinueWatching({ items, onPlay }: Props) {
  if (items.length === 0) return null;

  return (
    <>
      <p className="section-label">Continue watching</p>
      <div className="continue-watching-strip">
        {items.map((item) => (
          <CwCard key={item.id} item={item} onPlay={onPlay} />
        ))}
      </div>
    </>
  );
}
