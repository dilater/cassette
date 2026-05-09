import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export default function WindowControls() {
  return (
    <div className="window-controls" data-tauri-no-drag>
      <button className="wc-btn minimize" onClick={() => appWindow.minimize()} aria-label="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button className="wc-btn maximize" onClick={() => appWindow.toggleMaximize()} aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="0.5" y="0.5" width="9" height="9" />
        </svg>
      </button>
      <button className="wc-btn close" onClick={() => appWindow.close()} aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
