import { useState, useEffect, useRef, useCallback } from "react";

const HIDE_DELAY_MS = 2500;

export function useAutoHide(isFullscreen: boolean, itemId: number) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    if (isFullscreen) {
      timer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }
  }, [isFullscreen]);

  // Re-initialise whenever fullscreen state or the playing item changes
  useEffect(() => {
    show();
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isFullscreen, itemId, show]);

  return { visible, show };
}
