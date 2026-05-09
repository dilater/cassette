import { useState, useRef, useEffect } from "react";
import type { VisualProfile } from "../../types/library";
import { applyVisualProfile } from "../../lib/tauri";

interface Props {
  profile: VisualProfile;
  resolution?: string | null;
  onProfileChange: (p: VisualProfile) => void;
  seriesId?: number | null;
  onSaveForSeries?: (p: VisualProfile) => void;
}

const PROFILES: { id: VisualProfile; label: string; desc: string }[] = [
  { id: "film",      label: "Film",      desc: "KrigBilateral chroma, debanding, HDR" },
  { id: "anime",     label: "Anime",     desc: "Anime4K restore and upscale" },
  { id: "low-power", label: "Low power", desc: "Bilinear, GPU decode only" },
  { id: "none",      label: "None",      desc: "No processing, raw decode" },
];

export default function ProfileChip({ profile, resolution, onProfileChange, seriesId, onSaveForSeries }: Props) {
  const [open, setOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  async function selectProfile(p: VisualProfile) {
    await applyVisualProfile(p);
    onProfileChange(p);
    setOpen(false);
  }

  function handleSaveForSeries() {
    onSaveForSeries?.(profile);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const label = PROFILES.find((p) => p.id === profile)?.label ?? profile;

  return (
    <div ref={ref} className="chip-popover-anchor profile-anchor" style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
      {open && (
        <div className="chip-popover chip-popover-left chip-popover-down">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              className={`popover-track-btn${profile === p.id ? " active" : ""}`}
              onClick={() => selectProfile(p.id)}
            >
              {profile === p.id && <span className="popover-check">·</span>}
              <span>
                <span className="popover-track-name">{p.label}</span>
                <span className="popover-track-desc">{p.desc}</span>
              </span>
            </button>
          ))}
          {seriesId != null && onSaveForSeries && (
            <>
              <div className="popover-divider" />
              <button
                className="popover-track-btn popover-save-series"
                onClick={handleSaveForSeries}
              >
                {savedFlash ? "Applied to this series" : "Apply profile to this series"}
              </button>
            </>
          )}
        </div>
      )}
      <button
        className="player-chip profile-chip"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chip-dot" />
        <span className="chip-text">
          {label}{resolution ? `, ${resolution}` : ""}
        </span>
      </button>
    </div>
  );
}
