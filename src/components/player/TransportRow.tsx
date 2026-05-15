import { forwardRef, useImperativeHandle, useRef, memo } from "react";
import type { ReactNode } from "react";
import { togglePause } from "../../lib/tauri";
import { formatTime } from "../../lib/format";
import type { LibraryItem } from "../../types/library";

export interface TransportRowHandle {
  update: (pos: number, dur: number) => void;
}

interface Props {
  paused: boolean;
  currentItem: LibraryItem | null;
  nextEpisode: LibraryItem | null;
  prevEpisode: LibraryItem | null;
  episodeCount: number | null;
  onNext: () => void;
  onPrev: () => void;
  rightCluster?: ReactNode;
}

// TransportRow never re-renders for position/duration changes. The timecode
// span is updated imperatively via the forwardRef handle. Only paused + episode
// info cause re-renders, which are rare (not 4 Hz).
const TransportRow = forwardRef<TransportRowHandle, Props>(function TransportRow(
  { paused, currentItem, nextEpisode, prevEpisode, episodeCount, onNext, onPrev, rightCluster },
  ref,
) {
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const isTV = currentItem?.parsed_season != null;

  useImperativeHandle(ref, () => ({
    update(pos: number, dur: number) {
      if (timecodeRef.current) {
        timecodeRef.current.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
      }
    },
  }));

  function handlePrev() {
    if (isTV && prevEpisode) onPrev();
  }

  function handleNext() {
    if (isTV && nextEpisode) onNext();
  }

  const prevDisabled = isTV && !prevEpisode;
  const nextDisabled = isTV && !nextEpisode;

  return (
    <div className="transport-row">
      <div className="transport-left">
        <NowPlayingInfo item={currentItem} episodeCount={episodeCount} nextEpisode={nextEpisode} />
      </div>
      <div className="transport-right">
        <div className="transport-controls">
          <button
            className="transport-btn"
            onClick={handlePrev}
            disabled={prevDisabled}
            aria-label="Previous episode"
          >
            <PrevIcon />
          </button>
          <button
            className={`transport-play-btn${paused ? " is-paused" : ""}`}
            onClick={() => togglePause()}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? <SmallPlayIcon /> : <SmallPauseIcon />}
          </button>
          <button
            className="transport-btn"
            onClick={handleNext}
            disabled={nextDisabled}
            aria-label="Next episode"
          >
            <NextIcon />
          </button>
        </div>
        <span ref={timecodeRef} className="transport-timecode">00:00 / 00:00</span>
        {rightCluster && (
          <div className="transport-chips-cluster">
            {rightCluster}
          </div>
        )}
      </div>
    </div>
  );
});

export default TransportRow;

const NowPlayingInfo = memo(function NowPlayingInfo({ item, episodeCount, nextEpisode }: {
  item: LibraryItem | null;
  episodeCount: number | null;
  nextEpisode: LibraryItem | null;
}) {
  if (!item) return null;

  const title = item.series_title ?? item.parsed_title ?? null;
  if (!title) return <span className="transport-title">{item.filename}</span>;

  if (item.parsed_season != null && item.parsed_episode != null) {
    const countSuffix = episodeCount != null ? ` of ${episodeCount}` : "";
    const upNext = nextEpisode?.parsed_episode != null
      ? nextEpisode.parsed_season !== item.parsed_season
        ? `Up next: S${nextEpisode.parsed_season} E${nextEpisode.parsed_episode}`
        : `Up next: episode ${nextEpisode.parsed_episode}`
      : null;

    return (
      <div className="transport-episode-info">
        <span className="transport-title">
          {title} · S{item.parsed_season} E{item.parsed_episode}{countSuffix}
        </span>
        {upNext && (
          <span className="transport-up-next">{upNext}</span>
        )}
      </div>
    );
  }

  return (
    <span className="transport-title">
      {title}{item.parsed_year ? ` (${item.parsed_year})` : ""}
    </span>
  );
});

function PrevIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z" />
    </svg>
  );
}

function SmallPlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.6 4.45 V19.85 L19.7 12.15 Z" />
    </svg>
  );
}

function SmallPauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
