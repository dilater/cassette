import { useRef } from "react";
import type { LibraryFilter } from "../../types/library";

interface Props {
  active: LibraryFilter;
  onChange: (f: LibraryFilter) => void;
}

const CHIPS: { label: string; value: LibraryFilter }[] = [
  { label: "All", value: "all" },
  { label: "Films", value: "film" },
  { label: "TV", value: "tv" },
  { label: "Collection", value: "collection" },
  { label: "Downloads", value: "downloads" },
  { label: "Archiving", value: "archiving" },
];

export default function FilterChips({ active, onChange }: Props) {
  const auroraRefs = useRef<(HTMLSpanElement | null)[]>([]);

  function handleClick(value: LibraryFilter, idx: number) {
    onChange(value);
    const el = auroraRefs.current[idx];
    if (!el) return;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "f-bloom 700ms ease-out forwards";
  }

  return (
    <div className="filter-chips">
      {CHIPS.map(({ label, value }, idx) => (
        <button
          key={value}
          className={`filter-chip${active === value ? " active" : ""}`}
          onClick={() => handleClick(value, idx)}
        >
          <span
            className="f-aurora"
            ref={(el) => { auroraRefs.current[idx] = el; }}
            style={{ opacity: 0 }}
          />
          {label}
        </button>
      ))}
    </div>
  );
}
