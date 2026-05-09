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

export type LibraryFilter = "all" | "film" | "tv" | "collection" | "downloads";

export type TorrentState = "downloading" | "paused" | "complete" | "error";

export interface TorrentInfo {
  id: number;
  name: string;
  state: TorrentState;
  progress_pct: number;
  down_speed_kbps: number;
  up_speed_kbps: number;
  peers: number;
  eta_seconds: number | null;
  size_bytes: number;
  downloaded_bytes: number;
  error_message: string | null;
  file_paths: string[];
}

// Items grouped by parent directory
export interface FolderGroup {
  dirPath: string;
  name: string;
  items: LibraryItem[];
  isTV: boolean;
}
