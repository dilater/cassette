use std::path::Path;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use walkdir::WalkDir;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::db;
use super::parse::parse_filename;

const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "mov", "m4v", "wmv", "flv", "webm", "ts", "m2ts"];

pub type SharedDb = Arc<Mutex<Connection>>;

pub fn scan_folder(conn: &Connection, folder_path: &str) {
    for entry in WalkDir::new(folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else { continue };
        if !VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
            continue;
        }

        let path_str = match path.to_str() {
            Some(s) => s,
            None => continue,
        };
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(s) => s,
            None => continue,
        };

        let parsed = parse_filename(filename);

        let series_id = if parsed.is_episode && !parsed.title.is_empty() {
            db::upsert_series(conn, &parsed.title, parsed.year).ok()
        } else {
            None
        };

        let row = db::FileRow {
            path: path_str.to_string(),
            filename: filename.to_string(),
            parsed_title: if parsed.title.is_empty() { None } else { Some(parsed.title) },
            parsed_year: parsed.year,
            parsed_season: parsed.season,
            parsed_episode: parsed.episode,
            series_id,
            resolution: parsed.resolution,
            added_at: db::FileRow::now(),
            needs_review: parsed.needs_review,
        };

        db::upsert_file(conn, &row).ok();
    }
}

pub fn rescan_all(conn: &Connection) {
    // Soft-delete: flag files that no longer exist on disk rather than removing
    // the row. This preserves favourites, ratings, notes, and watch status when
    // an external drive is disconnected. The flag clears automatically via
    // upsert_file when the file reappears.
    if let Ok(paths) = db::all_file_paths(conn) {
        for (id, path) in paths {
            if !Path::new(&path).exists() {
                db::mark_file_missing(conn, id).ok();
            }
        }
    }

    let folders = match db::list_watched_folders(conn) {
        Ok(f) => f,
        Err(_) => return,
    };
    for folder in folders {
        if Path::new(&folder.path).exists() {
            scan_folder(conn, &folder.path);
        }
    }
}

pub fn start_watcher(shared_db: SharedDb) -> Option<RecommendedWatcher> {
    let db_for_watcher = Arc::clone(&shared_db);

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        let is_create_or_modify = matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
        );
        if !is_create_or_modify {
            return;
        }

        let Ok(conn) = db_for_watcher.lock() else { return };
        for path in &event.paths {
            let Some(ext) = path.extension().and_then(|e| e.to_str()) else { continue };
            if !VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                continue;
            }
            let Some(path_str) = path.to_str() else { continue };
            let Some(filename) = path.file_name().and_then(|n| n.to_str()) else { continue };

            let parsed = parse_filename(filename);
            let series_id = if parsed.is_episode && !parsed.title.is_empty() {
                db::upsert_series(&conn, &parsed.title, parsed.year).ok()
            } else {
                None
            };

            let row = db::FileRow {
                path: path_str.to_string(),
                filename: filename.to_string(),
                parsed_title: if parsed.title.is_empty() { None } else { Some(parsed.title) },
                parsed_year: parsed.year,
                parsed_season: parsed.season,
                parsed_episode: parsed.episode,
                series_id,
                resolution: parsed.resolution,
                added_at: db::FileRow::now(),
                needs_review: parsed.needs_review,
            };

            db::upsert_file(&conn, &row).ok();
        }
    }).ok()?;

    // Watch all currently registered folders
    if let Ok(conn) = shared_db.lock() {
        if let Ok(folders) = db::list_watched_folders(&conn) {
            for folder in folders {
                if Path::new(&folder.path).exists() {
                    watcher.watch(Path::new(&folder.path), RecursiveMode::Recursive).ok();
                }
            }
        }
    }

    Some(watcher)
}
