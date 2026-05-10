import { togglePause, seekRelative } from "../../lib/tauri";

interface Props {
  paused: boolean;
  visible: boolean;
}

export default function SkipOverlay({ paused, visible }: Props) {
  return (
    <div className={`skip-overlay${visible ? " visible" : ""}`}>
      <button
        className="skip-btn"
        onClick={(e) => { e.stopPropagation(); seekRelative(-5); }}
        aria-label="Skip back 5 seconds"
      >
        <SkipBackIcon />
        <span className="skip-label">5</span>
      </button>

      <button
        className={`play-pause-btn${paused ? " is-paused" : ""}`}
        onClick={(e) => { e.stopPropagation(); togglePause(); }}
        aria-label={paused ? "Play" : "Pause"}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>

      <button
        className="skip-btn"
        onClick={(e) => { e.stopPropagation(); seekRelative(5); }}
        aria-label="Skip forward 5 seconds"
      >
        <SkipForwardIcon />
        <span className="skip-label">5</span>
      </button>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "scaleX(-1)" }}>
      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}
