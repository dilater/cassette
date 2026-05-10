export interface WatchedFolder {
  id: number;
  path: string;
  added_at: number;
}

export interface LibraryItem {
  id: number;
  path: string;
  filename: string;
  parsed_title: string | null;
  parsed_year: number | null;
  parsed_season: number | null;
  parsed_episode: number | null;
  series_id: number | null;
  resolution: string | null;
  last_played_at: number | null;
  resume_position_seconds: number | null;
  duration_seconds: number | null;
  poster_path: string | null;
  needs_review: boolean;
  series_title: string | null;
  metadata_locked: boolean;
  is_favourite: boolean;
  user_rating: number | null;
  watch_status: 'unwatched' | 'watching' | 'watched';
  watched_at: number | null;
  notes: string | null;
}

export interface CollectionStats {
  films_watched: number;
  series_watched: number;
  total_hours: number;
}

export interface TrackInfo {
  id: number;
  kind: "audio" | "sub" | "video";
  lang: string | null;
  title: string | null;
  selected: boolean;
}

export type VisualProfile = "film" | "anime" | "low-power" | "none";

export type LibraryFilter = "all" | "film" | "tv" | "collection" | "archiving" | "settings";

export type DiscState =
  | { kind: "waiting" }
  | { kind: "detected"; drive: string; label: string; size_bytes: number }
  | { kind: "archiving"; drive: string; label: string; bytes_read: number; bytes_total: number; speed_mbps: number; eta_seconds: number; output_path: string }
  | { kind: "complete"; label: string; iso_path: string }
  | { kind: "error"; label: string; message: string; drive: string };

// Items grouped by parent directory
export interface FolderGroup {
  dirPath: string;
  name: string;
  items: LibraryItem[];
  isTV: boolean;
}
