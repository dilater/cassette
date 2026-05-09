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
      <div className="empty-state-heading">No folders added yet</div>
      <div className="empty-state-sub">Add a folder to start building your library.</div>
      <button
        className="empty-state-action"
        onClick={() => handleAdd(onFolderAdded)}
      >
        Add folder
      </button>
    </div>
  );
}
