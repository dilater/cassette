import { open } from "@tauri-apps/plugin-dialog";
import { addWatchedFolder } from "../lib/tauri";

interface Props {
  onFolderAdded: () => void;
}

async function handleAdd(onFolderAdded: () => void) {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  const path = typeof selected === "string" ? selected : selected[0];
  if (!path) return;
  await addWatchedFolder(path);
  onFolderAdded();
}

export default function EmptyState({ onFolderAdded }: Props) {
  return (
    <div className="empty-state">
      <CassetteGlyph className="empty-state-glyph" />
      <div className="empty-state-heading">Add a folder to get started</div>
      <div className="empty-state-sub">Point Cassette at your films and TV shows.</div>
      <button
        className="empty-state-action"
        onClick={() => handleAdd(onFolderAdded)}
      >
        Add source
      </button>
    </div>
  );
}

function CassetteGlyph({ className }: { className?: string }) {
  return (
    <svg className={className ?? ""} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="112" height="64" rx="8" stroke="currentColor" strokeWidth="3" />
      <circle cx="36" cy="44" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="84" cy="44" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="36" cy="44" r="5" fill="currentColor" />
      <circle cx="84" cy="44" r="5" fill="currentColor" />
      <path d="M50 44 Q60 52 70 44" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect x="46" y="14" width="28" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
