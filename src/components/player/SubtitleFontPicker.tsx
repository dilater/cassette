import { useState, useEffect } from "react";
import { getSubtitleFont, setSubtitleFont } from "../../lib/tauri";

interface FontOption {
  id: string;
  label: string;
  family: string;
  sampleSize?: string;
}

const FONT_OPTIONS: FontOption[] = [
  { id: "Default",          label: "Default",        family: "var(--font-sans)" },
  { id: "Inter",            label: "Inter",          family: "Inter, var(--font-sans)" },
  { id: "Playfair Display", label: "Playfair",       family: "'Playfair Display', serif" },
  { id: "EB Garamond",      label: "Garamond",       family: "'EB Garamond', serif",         sampleSize: "14px" },
  { id: "Bebas Neue",       label: "Bebas Neue",     family: "'Bebas Neue', sans-serif",     sampleSize: "13px" },
  { id: "JetBrains Mono",   label: "Mono",           family: "'JetBrains Mono', monospace",  sampleSize: "11px" },
];

export default function SubtitleFontPicker() {
  const [active, setActive] = useState("Default");
  const [sweeping, setSweeping] = useState<string | null>(null);

  useEffect(() => {
    getSubtitleFont().then(setActive).catch(() => {});
  }, []);

  async function select(opt: FontOption) {
    if (opt.id === active) return;
    setActive(opt.id);
    setSweeping(opt.id);
    setTimeout(() => setSweeping(null), 700);
    setSubtitleFont(opt.id).catch(() => {});
  }

  return (
    <div className="popover-section">
      <div className="popover-label">Subtitle font</div>
      {FONT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          className={`popover-track-btn font-picker-btn${active === opt.id ? " active" : ""}`}
          onClick={() => select(opt)}
          style={{ position: "relative", overflow: "hidden" }}
        >
          {sweeping === opt.id && <span className="chip-aurora font-aurora" />}
          {active === opt.id && <span className="popover-check">·</span>}
          <span style={{ fontFamily: opt.family, fontSize: opt.sampleSize ?? "12px" }}>
            {opt.label}
          </span>
          <span className="font-sample" style={{ fontFamily: opt.family, fontSize: opt.sampleSize ?? "11px" }}>
            Abc 123
          </span>
        </button>
      ))}
    </div>
  );
}
