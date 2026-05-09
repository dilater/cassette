import { useRef, useState, useCallback } from "react";
import { formatTime } from "../../lib/format";
import { getScrubThumb } from "../../lib/tauri";

interface Props {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  fileId?: number;
  filePath?: string;
}

export default function Scrubber({ position, duration, onSeek, fileId, filePath }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBucket = useRef<number>(-1);

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const hoverPct = hoverX != null && trackRef.current
    ? Math.max(0, Math.min(100, (hoverX / trackRef.current.clientWidth) * 100))
    : null;
  const hoverTime = hoverPct != null ? (hoverPct / 100) * duration : null;

  const seekFromX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || duration === 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }, [duration, onSeek]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    seekFromX(e.clientX);

    const onMove = (me: MouseEvent) => seekFromX(me.clientX);
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverX(x);

    if (!fileId || !filePath || duration === 0) return;
    const ratio = Math.max(0, Math.min(1, x / track.clientWidth));
    const secs = ratio * duration;
    const bucket = Math.floor(secs / 5) * 5;

    if (bucket === lastBucket.current) return;
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(() => {
      lastBucket.current = bucket;
      getScrubThumb(fileId, filePath, secs).then((src) => {
        if (src) setThumbSrc(src);
      });
    }, 50);
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
  };

  return (
    <div
      className="scrubber"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {hoverTime != null && !isDragging && (
        <div className="scrub-tooltip" style={{ left: `${hoverPct}%` }}>
          {thumbSrc && (
            <div className="scrub-thumb-wrap">
              <img className="scrub-thumb" src={thumbSrc} alt="" />
            </div>
          )}
          <span className="scrub-tooltip-time">{formatTime(hoverTime)}</span>
          <span className="scrub-tooltip-tail" />
        </div>
      )}

      <div
        ref={trackRef}
        className="scrubber-track"
        onMouseDown={handleMouseDown}
      >
        <div className="scrubber-fill" style={{ width: `${pct}%` }} />
        <div className="scrubber-handle" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
