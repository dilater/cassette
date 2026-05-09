import { useState, useRef, useEffect } from "react";
import type { TrackInfo } from "../../types/library";
import { setAudioTrack, setSubtitleTrack } from "../../lib/tauri";
import SubtitleFontPicker from "./SubtitleFontPicker";

interface Props {
  tracks: TrackInfo[];
  onTrackChange: () => void;
  onAudioSelect?: (trackId: number, lang: string | null) => void;
}

function trackLabel(t: TrackInfo): string {
  if (t.title && t.lang) return `${t.lang.toUpperCase()} — ${t.title}`;
  if (t.title) return t.title;
  if (t.lang) return t.lang.toUpperCase();
  return `Track ${t.id}`;
}

export default function AudioChip({ tracks, onTrackChange, onAudioSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const audioTracks = tracks.filter((t) => t.kind === "audio");
  const subTracks = tracks.filter((t) => t.kind === "sub");
  const currentAudio = audioTracks.find((t) => t.selected);
  const currentSub = subTracks.find((t) => t.selected);

  const audioLabel = currentAudio ? (currentAudio.lang?.toUpperCase() ?? `Track ${currentAudio.id}`) : "audio";
  const subLabel = currentSub ? (currentSub.lang?.toUpperCase() ?? "subs") : "subs off";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function selectAudio(t: TrackInfo) {
    await setAudioTrack(t.id);
    onAudioSelect?.(t.id, t.lang ?? null);
    onTrackChange();
    setOpen(false);
  }

  async function selectSub(id: number | null) {
    await setSubtitleTrack(id);
    onTrackChange();
    setOpen(false);
  }

  return (
    <div ref={ref} className="chip-popover-anchor" style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
      {open && (
        <div className="chip-popover chip-popover-left">
          {audioTracks.length > 0 && (
            <div className="popover-section">
              <div className="popover-label">Audio</div>
              {audioTracks.map((t) => (
                <button
                  key={t.id}
                  className={`popover-track-btn${t.selected ? " active" : ""}`}
                  onClick={() => selectAudio(t)}
                >
                  {t.selected && <span className="popover-check">·</span>}
                  {trackLabel(t)}
                </button>
              ))}
            </div>
          )}

          {subTracks.length > 0 && (
            <div className="popover-section">
              <div className="popover-label">Subtitles</div>
              <div style={{ maxHeight: "220px", overflowY: "auto", scrollbarWidth: "thin" }}>
                <button
                  className={`popover-track-btn${!currentSub ? " active" : ""}`}
                  onClick={() => selectSub(null)}
                >
                  {!currentSub && <span className="popover-check">·</span>}
                  Off
                </button>
                {subTracks.map((t) => (
                  <button
                    key={t.id}
                    className={`popover-track-btn${t.selected ? " active" : ""}`}
                    onClick={() => selectSub(t.id)}
                  >
                    {t.selected && <span className="popover-check">·</span>}
                    {trackLabel(t)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {audioTracks.length === 0 && subTracks.length === 0 && (
            <div className="popover-empty">No tracks found</div>
          )}

          <SubtitleFontPicker />
        </div>
      )}
      <button
        className="player-chip audio-chip"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chip-text">{audioLabel} · {subLabel}</span>
      </button>
    </div>
  );
}
