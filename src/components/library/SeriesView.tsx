import { convertFileSrc } from "@tauri-apps/api/core";
import type { FolderGroup, LibraryItem } from "../../types/library";
import { posterColor, formatTime } from "../../lib/format";

interface Props {
  group: FolderGroup;
  onPlay: (item: LibraryItem) => void;
  onBack: () => void;
}

export default function SeriesView({ group, onPlay, onBack }: Props) {
  const posterSrc = group.items[0]?.poster_path
    ? convertFileSrc(group.items[0].poster_path)
    : null;

  return (
    <div className="series-view">
      <div className="series-header">
        <button className="series-back-btn" onClick={onBack}>
          <BackIcon />
          library
        </button>
        <div className="series-hero">
          {posterSrc ? (
            <img src={posterSrc} alt={group.name} className="series-poster" />
          ) : (
            <div
              className="series-poster series-poster-placeholder"
              style={{ background: posterColor(group.name) }}
            />
          )}
          <div className="series-meta">
            <div className="series-title">{group.name}</div>
            <div className="series-subtitle">
              {group.items.length} {group.isTV ? "episodes" : "files"}
            </div>
          </div>
        </div>
      </div>

      <div className="series-episode-list">
        {group.items.map((item) => {
          const progress =
            item.duration_seconds && (item.resume_position_seconds ?? 0) > 30
              ? Math.min(100, ((item.resume_position_seconds ?? 0) / item.duration_seconds) * 100)
              : null;

          const epLabel =
            item.parsed_season != null && item.parsed_episode != null
              ? `S${item.parsed_season} E${item.parsed_episode}`
              : null;

          const title = item.parsed_title ?? item.filename;

          return (
            <button
              key={item.id}
              className="episode-row"
              onClick={() => onPlay(item)}
            >
              {epLabel && <span className="episode-label">{epLabel}</span>}
              <span className="episode-title">{title}</span>
              {item.duration_seconds != null && (
                <span className="episode-duration">
                  {formatTime(item.duration_seconds)}
                </span>
              )}
              {progress != null && (
                <div className="episode-progress-bar">
                  <div
                    className="episode-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}
