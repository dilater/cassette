import { invoke } from "@tauri-apps/api/core";
import type { LibraryItem, WatchedFolder, LibraryFilter, TrackInfo, VisualProfile, TorrentInfo } from "../types/library";

// Favourites and collection
export const toggleFavourite = (fileId: number) => invoke<boolean>("toggle_favourite", { fileId });
export const setUserRating = (fileId: number, rating: number | null) => invoke<void>("set_user_rating", { fileId, rating });
export const setWatchStatus = (fileId: number, status: string) => invoke<void>("set_watch_status", { fileId, status });
export const setNotes = (fileId: number, notes: string | null) => invoke<void>("set_notes", { fileId, notes });
export const getFavouriteFilms = () => invoke<LibraryItem[]>("get_favourite_films");
export const getFavouriteEpisodes = () => invoke<LibraryItem[]>("get_favourite_episodes");
export const getCollectionStats = () => invoke<[number, number, number]>("get_collection_stats");

// Profile preferences
export const getGlobalProfile = () => invoke<string>("get_global_profile");
export const setGlobalProfile = (profile: string) => invoke<void>("set_global_profile", { profile });
export const getSeriesProfile = (seriesId: number) => invoke<string | null>("get_series_profile", { seriesId });
export const setSeriesProfile = (seriesId: number, profile: string | null) => invoke<void>("set_series_profile", { seriesId, profile });
export const getSubtitleFont = () => invoke<string>("get_subtitle_font");
export const setSubtitleFont = (font: string) => invoke<void>("set_subtitle_font", { font });

// Episode navigation
export const getNextEpisode = (fileId: number) => invoke<LibraryItem | null>("get_next_episode", { fileId });
export const getPrevEpisode = (fileId: number) => invoke<LibraryItem | null>("get_prev_episode", { fileId });
export const getSeasonEpisodeCount = (seriesId: number, season: number) => invoke<number>("get_season_episode_count", { seriesId, season });

// Playback
export const playFile = (path: string, resumePosition?: number) =>
  invoke<void>("play_file", { path, resumePosition: resumePosition ?? null });
export const stop = () => invoke<void>("stop");
export const togglePause = () => invoke<void>("toggle_pause");
export const seekRelative = (delta: number) => invoke<void>("seek_relative", { delta });
export const seek = (position: number) => invoke<void>("seek", { position });
export const getTrackList = () => invoke<TrackInfo[]>("get_track_list");
export const setAudioTrack = (trackId: number) => invoke<void>("set_audio_track", { trackId });
export const setSubtitleTrack = (trackId: number | null) => invoke<void>("set_subtitle_track", { trackId });
export const applyVisualProfile = (profile: VisualProfile) => invoke<void>("apply_visual_profile", { profile });
export const volumeUp = () => invoke<void>("volume_up");
export const volumeDown = () => invoke<void>("volume_down");
export const toggleMute = () => invoke<void>("toggle_mute");
export const speedUp = () => invoke<void>("speed_up");
export const speedDown = () => invoke<void>("speed_down");
export const frameStep = () => invoke<void>("frame_step");
export const frameBackStep = () => invoke<void>("frame_back_step");

// Metadata
export const setTmdbKey = (key: string) => invoke<void>("set_tmdb_key", { key });
export const getTmdbKey = () => invoke<string | null>("get_tmdb_key");
export const fetchMetadataAll = () => invoke<number>("fetch_metadata_all");

// Library
export const addWatchedFolder = (path: string) => invoke<void>("add_watched_folder", { path });
export const removeWatchedFolder = (path: string) => invoke<void>("remove_watched_folder", { path });
export const listWatchedFolders = () => invoke<WatchedFolder[]>("list_watched_folders");
export const rescan = () => invoke<void>("rescan");
export const scanFilmDurations = () => invoke<number>("scan_film_durations");
export const libraryList = (kind: LibraryFilter) => invoke<LibraryItem[]>("library_list", { kind });
export const libraryNeedsReview = () => invoke<LibraryItem[]>("library_needs_review");
export const tagNeedsReview = (fileId: number, title: string, season: number | null, episode: number | null) =>
  invoke<void>("tag_needs_review", { fileId, title, season, episode });
export const updateProgress = (fileId: number, positionSeconds: number, durationSeconds?: number) =>
  invoke<void>("update_progress", { fileId, positionSeconds, durationSeconds: durationSeconds ?? null });

export const initScrubThumbs = (fileId: number, filePath: string) =>
  invoke<void>("init_scrub_thumbs", { fileId, path: filePath });
export const getScrubThumb = (fileId: number, filePath: string, positionSecs: number) =>
  invoke<string | null>("get_scrub_thumb", { fileId, path: filePath, positionSecs });

export interface SeriesTrackPref { audio_lang: string | null; audio_track_index: number | null; }
export const getSeriesTrackPref = (seriesId: number) =>
  invoke<SeriesTrackPref | null>("get_series_track_pref", { seriesId });
export const setSeriesTrackPref = (seriesId: number, audioLang: string | null, audioTrackIndex: number) =>
  invoke<void>("set_series_track_pref", { seriesId, audioLang, audioTrackIndex });

// Window state
export const getWindowState = () => invoke<[number, number, number, number]>("get_window_state");
export const saveWindowState = (width: number, height: number, x: number, y: number) =>
  invoke<void>("save_window_state", { width, height, x, y });

// CLI file (file association open)
export const getCliFile = () => invoke<string | null>("get_cli_file");

// Metadata overrides
export interface TmdbSearchResult {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  poster_path: string | null;
  is_tv: boolean;
}
export const searchTmdbTitles = (query: string) =>
  invoke<TmdbSearchResult[]>("search_tmdb_titles", { query });
export const applyTmdbOverride = (
  fileId: number,
  seriesId: number | null,
  tmdbId: number,
  title: string,
  year: number | null,
  posterPath: string | null,
) => invoke<void>("apply_tmdb_override", { fileId, seriesId, tmdbId, title, year, posterPath });
export const applyLocalPoster = (
  fileId: number,
  seriesId: number | null,
  title: string | null,
  imageData: string,
) => invoke<void>("apply_local_poster", { fileId, seriesId, title, imageData });
export const setMetadataLocked = (fileId: number, locked: boolean) =>
  invoke<void>("set_metadata_locked", { fileId, locked });

// Video child window
export const setVideoVisible = (visible: boolean) => invoke<void>("set_video_visible", { visible });
export const forceVideoResize = () => invoke<void>("force_video_resize");

// Torrents
export const getDownloadFolder = () => invoke<string>("get_download_folder");
export const setDownloadFolder = (path: string) => invoke<void>("set_download_folder", { path });
export const torrentAddMagnet = (magnet: string) => invoke<number>("torrent_add_magnet", { magnet });
export const torrentAddFile = (bytes: number[]) => invoke<number>("torrent_add_file", { bytes });
export const torrentPause = (id: number) => invoke<void>("torrent_pause", { id });
export const torrentResume = (id: number) => invoke<void>("torrent_resume", { id });
export const torrentRemove = (id: number, deleteFiles: boolean) =>
  invoke<void>("torrent_remove", { id, deleteFiles });
export const torrentList = () => invoke<TorrentInfo[]>("torrent_list");
export const torrentGetFilePath = (id: number, fileIndex: number) =>
  invoke<string | null>("torrent_get_file_path", { id, fileIndex });
