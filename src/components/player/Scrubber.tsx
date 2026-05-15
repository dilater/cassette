import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { formatTime } from "../../lib/format";
import { getScrubThumb } from "../../lib/tauri";

export interface ScrubberHandle {
  update: (pos: number, dur: number) => void;
}

interface Props {
  durationRef: React.MutableRefObject<number>;
  onSeek: (seconds: number) => void;
  fileId?: number;
  filePath?: string;
}

// Scrubber uses an imperative handle so the parent can push position/duration
// updates directly to the DOM (no React reconciliation) at 4 Hz. Only
// hover/drag state lives in React — those events are user-triggered and rare.
const Scrubber = forwardRef<ScrubberHandle, Props>(function Scrubber(
  { durationRef, onSeek, fileId, filePath },
  ref,
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const handleElemRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBucket = useRef<number>(-1);

  // Called by PlayerView on every playback:state event — no re-render.
  useImperativeHandle(ref, () => ({
    update(pos: number, dur: number) {
      const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (handleElemRef.current) handleElemRef.current.style.left = `${pct}%`;
    },
  }));

  const hoverPct =
    hoverX != null && trackRef.current
      ? Math.max(0, Math.min(100, (hoverX / trackRef.current.clientWidth) * 100))
      : null;
  const hoverTime =
    hoverPct != null ? (hoverPct / 100) * durationRef.current : null;

  const seekFromX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      const dur = durationRef.current;
      if (!track || dur === 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * dur);
    },
    [durationRef, onSeek],
  );

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

    if (!fileId || !filePath || durationRef.current === 0) return;
    const ratio = Math.max(0, Math.min(1, x / track.clientWidth));
    const secs = ratio * durationRef.current;
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
        <div ref={fillRef} className="scrubber-fill" style={{ width: "0%" }} />
        <div ref={handleElemRef} className="scrubber-handle" style={{ left: "0%" }} />
      </div>
    </div>
  );
});

export default Scrubber;
