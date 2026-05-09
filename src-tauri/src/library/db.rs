use rusqlite::{Connection, Result, params};
use serde::Serialize;
use std::path::Path;

pub fn open(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    create_schema(&conn)?;
    Ok(conn)
}

fn create_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS watched_folders (
            id       INTEGER PRIMARY KEY,
            path     TEXT NOT NULL UNIQUE,
            added_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS series (
            id          INTEGER PRIMARY KEY,
            title       TEXT NOT NULL,
            year        INTEGER,
            tmdb_id     INTEGER,
            poster_path TEXT,
            UNIQUE(title, year)
        );

        CREATE TABLE IF NOT EXISTS files (
            id                      INTEGER PRIMARY KEY,
            path                    TEXT NOT NULL UNIQUE,
            filename                TEXT NOT NULL,
            parsed_title            TEXT,
            parsed_year             INTEGER,
            parsed_season           INTEGER,
            parsed_episode          INTEGER,
            series_id               INTEGER REFERENCES series(id),
            duration_seconds        INTEGER,
            resolution              TEXT,
            added_at                INTEGER NOT NULL,
            last_played_at          INTEGER,
            resume_position_seconds INTEGER DEFAULT 0,
            poster_path             TEXT,
            thumb_path              TEXT,
            needs_review            INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS series_track_preferences (
            series_id         INTEGER PRIMARY KEY REFERENCES series(id),
            audio_lang        TEXT,
            audio_track_index INTEGER,
            subtitle_lang     TEXT,
            subtitle_track_index INTEGER,
            updated_at        INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_files_series
            ON files(series_id, parsed_season, parsed_episode);
        CREATE INDEX IF NOT EXISTS idx_files_last_played
            ON files(last_played_at DESC)
            WHERE last_played_at IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_files_needs_review
            ON files(needs_review)
            WHERE needs_review = 1;
    ")?;
    // Migrations: add columns if they don't exist yet
    conn.execute_batch(
        "ALTER TABLE files ADD COLUMN metadata_locked INTEGER DEFAULT 0;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE files ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE files ADD COLUMN user_rating INTEGER;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE files ADD COLUMN watch_status TEXT NOT NULL DEFAULT 'unwatched';"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE files ADD COLUMN watched_at INTEGER;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE files ADD COLUMN notes TEXT;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE series ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE series ADD COLUMN user_rating INTEGER;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE series ADD COLUMN watch_status TEXT NOT NULL DEFAULT 'unwatched';"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE series ADD COLUMN watched_at INTEGER;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE series ADD COLUMN video_profile TEXT;"
    ).ok();
    // Phase 12: torrent tracking table
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS torrents (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            source       TEXT NOT NULL,
            state        TEXT NOT NULL DEFAULT 'downloading',
            progress_pct REAL DEFAULT 0,
            added_at     INTEGER NOT NULL,
            completed_at INTEGER,
            download_path TEXT,
            file_count   INTEGER DEFAULT 1,
            error_message TEXT
        );
    ").ok();
    Ok(())
}

// ── watched folders ──────────────────────────────────────────────────────────

pub fn add_watched_folder(conn: &Connection, path: &str) -> Result<()> {
    let now = unix_now();
    conn.execute(
        "INSERT OR IGNORE INTO watched_folders (path, added_at) VALUES (?1, ?2)",
        params![path, now],
    )?;
    Ok(())
}

pub fn list_watched_folders(conn: &Connection) -> Result<Vec<WatchedFolder>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, added_at FROM watched_folders ORDER BY added_at"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(WatchedFolder {
            id: row.get(0)?,
            path: row.get(1)?,
            added_at: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn remove_watched_folder(conn: &Connection, path: &str) -> Result<()> {
    conn.execute("DELETE FROM watched_folders WHERE path = ?1", params![path])?;
    Ok(())
}

// ── series ───────────────────────────────────────────────────────────────────

pub fn upsert_series(conn: &Connection, title: &str, year: Option<i64>) -> Result<i64> {
    conn.execute(
        "INSERT OR IGNORE INTO series (title, year) VALUES (?1, ?2)",
        params![title, year],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM series WHERE title = ?1 AND (year = ?2 OR (year IS NULL AND ?2 IS NULL))",
        params![title, year],
        |row| row.get(0),
    )?;
    Ok(id)
}

// ── files ────────────────────────────────────────────────────────────────────

pub fn upsert_file(conn: &Connection, f: &FileRow) -> Result<()> {
    conn.execute(
        "INSERT INTO files
            (path, filename, parsed_title, parsed_year, parsed_season, parsed_episode,
             series_id, resolution, added_at, needs_review)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(path) DO UPDATE SET
            parsed_title   = CASE WHEN metadata_locked THEN parsed_title ELSE excluded.parsed_title END,
            parsed_year    = CASE WHEN metadata_locked THEN parsed_year ELSE excluded.parsed_year END,
            parsed_season  = CASE WHEN metadata_locked THEN parsed_season ELSE excluded.parsed_season END,
            parsed_episode = CASE WHEN metadata_locked THEN parsed_episode ELSE excluded.parsed_episode END,
            series_id      = CASE WHEN metadata_locked THEN series_id ELSE excluded.series_id END,
            resolution     = excluded.resolution,
            needs_review   = CASE WHEN metadata_locked THEN needs_review ELSE excluded.needs_review END",
        params![
            f.path, f.filename, f.parsed_title, f.parsed_year,
            f.parsed_season, f.parsed_episode, f.series_id,
            f.resolution, f.added_at, f.needs_review,
        ],
    )?;
    Ok(())
}

pub fn library_list(conn: &Connection, kind: &str) -> Result<Vec<LibraryItem>> {
    let kind_filter = match kind {
        "tv"   => " AND f.parsed_season IS NOT NULL",
        "film" => " AND f.parsed_season IS NULL",
        _      => "",
    };
    let sql = format!(
        "SELECT f.id, f.path, f.filename, f.parsed_title, f.parsed_year,
                f.parsed_season, f.parsed_episode, f.series_id,
                f.resolution, f.last_played_at, f.resume_position_seconds,
                f.needs_review, s.title as series_title, f.duration_seconds,
                f.poster_path, f.metadata_locked,
                f.is_favourite, f.user_rating, f.watch_status, f.watched_at, f.notes
         FROM files f
         LEFT JOIN series s ON f.series_id = s.id
         WHERE 1=1{kind_filter}
         ORDER BY COALESCE(s.title, f.parsed_title, f.filename),
                  f.parsed_season, f.parsed_episode"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| map_library_item(row))?;
    rows.collect()
}

pub fn all_file_paths(conn: &Connection) -> Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT id, path FROM files")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

pub fn delete_file(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM files WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_progress(
    conn: &Connection,
    file_id: i64,
    position_seconds: f64,
    duration_seconds: Option<f64>,
) -> Result<()> {
    let now = unix_now();
    let pos = position_seconds as i64;
    if let Some(dur) = duration_seconds {
        conn.execute(
            "UPDATE files SET resume_position_seconds = ?1, last_played_at = ?2, duration_seconds = ?3 WHERE id = ?4",
            params![pos, now, dur as i64, file_id],
        )?;
    } else {
        conn.execute(
            "UPDATE files SET resume_position_seconds = ?1, last_played_at = ?2 WHERE id = ?3",
            params![pos, now, file_id],
        )?;
    }
    Ok(())
}

// ── track preferences ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SeriesTrackPref {
    pub audio_lang: Option<String>,
    pub audio_track_index: Option<i64>,
}

pub fn get_series_track_pref(conn: &Connection, series_id: i64) -> Result<Option<SeriesTrackPref>> {
    let mut stmt = conn.prepare(
        "SELECT audio_lang, audio_track_index FROM series_track_preferences WHERE series_id = ?1"
    )?;
    let mut rows = stmt.query(params![series_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(SeriesTrackPref {
            audio_lang: row.get(0)?,
            audio_track_index: row.get(1)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_series_profile(conn: &Connection, series_id: i64) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT video_profile FROM series WHERE id = ?1")?;
    let mut rows = stmt.query(params![series_id])?;
    Ok(rows.next()?.and_then(|row| row.get::<_, Option<String>>(0).ok().flatten()))
}

pub fn set_series_profile(conn: &Connection, series_id: i64, profile: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE series SET video_profile = ?1 WHERE id = ?2",
        params![profile, series_id],
    )?;
    Ok(())
}

pub fn set_series_track_pref(conn: &Connection, series_id: i64, audio_lang: Option<&str>, audio_track_index: Option<i64>) -> Result<()> {
    let now = unix_now();
    conn.execute(
        "INSERT INTO series_track_preferences (series_id, audio_lang, audio_track_index, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(series_id) DO UPDATE SET audio_lang = excluded.audio_lang, audio_track_index = excluded.audio_track_index, updated_at = excluded.updated_at",
        params![series_id, audio_lang, audio_track_index, now],
    )?;
    Ok(())
}

pub fn update_series_tmdb_id(conn: &Connection, series_id: i64, tmdb_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE series SET tmdb_id = ?1 WHERE id = ?2",
        params![tmdb_id, series_id],
    )?;
    Ok(())
}

/// Returns `(file_id, series_id, series_tmdb_id, season, episode)` for TV episodes
/// that have no thumb_path yet but whose series has a known tmdb_id.
pub fn get_episodes_needing_stills(conn: &Connection) -> Result<Vec<(i64, i64, i64, i64, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT f.id, f.series_id, s.tmdb_id, f.parsed_season, f.parsed_episode
         FROM files f
         JOIN series s ON f.series_id = s.id
         WHERE f.parsed_season IS NOT NULL
           AND f.parsed_episode IS NOT NULL
           AND f.thumb_path IS NULL
           AND s.tmdb_id IS NOT NULL"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    })?;
    rows.collect()
}

pub fn update_thumb_for_file(conn: &Connection, file_id: i64, thumb_path: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET thumb_path = ?1 WHERE id = ?2",
        params![thumb_path, file_id],
    )?;
    Ok(())
}

pub fn update_poster_by_series(conn: &Connection, series_id: i64, poster_path: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET poster_path = ?1 WHERE series_id = ?2",
        params![poster_path, series_id],
    )?;
    Ok(())
}

pub fn update_poster_for_file(conn: &Connection, file_id: i64, poster_path: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET poster_path = ?1 WHERE id = ?2",
        params![poster_path, file_id],
    )?;
    Ok(())
}

pub fn apply_override_for_file(
    conn: &Connection,
    file_id: i64,
    title: &str,
    year: Option<i64>,
    poster_path: &str,
    tmdb_id: Option<i64>,
) -> Result<()> {
    let _ = tmdb_id; // stored at series level; ignored for standalone files
    conn.execute(
        "UPDATE files SET parsed_title = ?1, parsed_year = ?2, poster_path = ?3,
                          needs_review = 0, metadata_locked = 1
         WHERE id = ?4",
        params![title, year, poster_path, file_id],
    )?;
    Ok(())
}

pub fn apply_override_for_series(
    conn: &Connection,
    series_id: i64,
    title: &str,
    year: Option<i64>,
    poster_path: &str,
    tmdb_id: Option<i64>,
) -> Result<()> {
    conn.execute(
        "UPDATE series SET title = ?1, year = ?2, tmdb_id = ?3, poster_path = ?4 WHERE id = ?5",
        params![title, year, tmdb_id, poster_path, series_id],
    )?;
    conn.execute(
        "UPDATE files SET poster_path = ?1, needs_review = 0, metadata_locked = 1
         WHERE series_id = ?2",
        params![poster_path, series_id],
    )?;
    Ok(())
}

pub fn set_metadata_locked(conn: &Connection, file_id: i64, locked: bool) -> Result<()> {
    conn.execute(
        "UPDATE files SET metadata_locked = ?1 WHERE id = ?2",
        params![locked as i64, file_id],
    )?;
    Ok(())
}

// ── favourites and collection ─────────────────────────────────────────────────

pub fn toggle_favourite(conn: &Connection, file_id: i64) -> Result<bool> {
    conn.execute(
        "UPDATE files SET is_favourite = CASE WHEN is_favourite = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        params![file_id],
    )?;
    let new_val: i64 = conn.query_row(
        "SELECT is_favourite FROM files WHERE id = ?1",
        params![file_id],
        |row| row.get(0),
    )?;
    Ok(new_val != 0)
}

pub fn set_user_rating(conn: &Connection, file_id: i64, rating: Option<i64>) -> Result<()> {
    conn.execute(
        "UPDATE files SET user_rating = ?1 WHERE id = ?2",
        params![rating, file_id],
    )?;
    Ok(())
}

pub fn set_watch_status(conn: &Connection, file_id: i64, status: &str) -> Result<()> {
    let now = unix_now();
    let watched_at: Option<i64> = if status == "watched" { Some(now) } else { None };
    conn.execute(
        "UPDATE files SET watch_status = ?1, watched_at = ?2 WHERE id = ?3",
        params![status, watched_at, file_id],
    )?;
    Ok(())
}

pub fn set_notes(conn: &Connection, file_id: i64, notes: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE files SET notes = ?1 WHERE id = ?2",
        params![notes, file_id],
    )?;
    Ok(())
}

pub fn get_favourite_films(conn: &Connection) -> Result<Vec<LibraryItem>> {
    let sql = "SELECT f.id, f.path, f.filename, f.parsed_title, f.parsed_year,
                      f.parsed_season, f.parsed_episode, f.series_id,
                      f.resolution, f.last_played_at, f.resume_position_seconds,
                      f.needs_review, s.title as series_title, f.duration_seconds,
                      f.poster_path, f.metadata_locked,
                      f.is_favourite, f.user_rating, f.watch_status, f.watched_at, f.notes
               FROM files f
               LEFT JOIN series s ON f.series_id = s.id
               WHERE f.is_favourite = 1 AND f.parsed_season IS NULL
               ORDER BY COALESCE(f.parsed_title, f.filename)";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| map_library_item(row))?;
    rows.collect()
}

pub fn get_favourite_episodes(conn: &Connection) -> Result<Vec<LibraryItem>> {
    let sql = "SELECT f.id, f.path, f.filename, f.parsed_title, f.parsed_year,
                      f.parsed_season, f.parsed_episode, f.series_id,
                      f.resolution, f.last_played_at, f.resume_position_seconds,
                      f.needs_review, s.title as series_title, f.duration_seconds,
                      f.poster_path, f.metadata_locked,
                      f.is_favourite, f.user_rating, f.watch_status, f.watched_at, f.notes
               FROM files f
               LEFT JOIN series s ON f.series_id = s.id
               WHERE f.is_favourite = 1 AND f.parsed_season IS NOT NULL
               ORDER BY COALESCE(s.title, f.parsed_title, f.filename),
                        f.parsed_season, f.parsed_episode";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| map_library_item(row))?;
    rows.collect()
}

pub fn get_collection_stats(conn: &Connection) -> Result<(i64, i64, f64)> {
    let films_watched: i64 = conn.query_row(
        "SELECT COUNT(*) FROM files WHERE watch_status = 'watched' AND parsed_season IS NULL",
        [],
        |row| row.get(0),
    )?;
    let series_watched: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT series_id) FROM files WHERE watch_status = 'watched' AND series_id IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    let total_secs: f64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM files WHERE watch_status = 'watched'",
        [],
        |row| row.get::<_, f64>(0),
    )?;
    Ok((films_watched, series_watched, total_secs / 3600.0))
}

// ── episode navigation ────────────────────────────────────────────────────────

const ITEM_SELECT: &str = "SELECT f.id, f.path, f.filename, f.parsed_title, f.parsed_year,
       f.parsed_season, f.parsed_episode, f.series_id,
       f.resolution, f.last_played_at, f.resume_position_seconds,
       f.needs_review, s.title as series_title, f.duration_seconds,
       f.poster_path, f.metadata_locked,
       f.is_favourite, f.user_rating, f.watch_status, f.watched_at, f.notes
FROM files f LEFT JOIN series s ON f.series_id = s.id";

pub fn get_next_episode(conn: &Connection, file_id: i64) -> Result<Option<LibraryItem>> {
    let sql = format!(
        "{ITEM_SELECT}
         WHERE f.series_id = (SELECT series_id FROM files WHERE id = ?1)
           AND f.parsed_season IS NOT NULL
           AND (
             (f.parsed_season = (SELECT parsed_season FROM files WHERE id = ?1)
              AND f.parsed_episode > (SELECT parsed_episode FROM files WHERE id = ?1))
             OR f.parsed_season > (SELECT parsed_season FROM files WHERE id = ?1)
           )
         ORDER BY f.parsed_season ASC, f.parsed_episode ASC
         LIMIT 1"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![file_id])?;
    rows.next()?.map(|row| map_library_item(row)).transpose()
}

pub fn get_prev_episode(conn: &Connection, file_id: i64) -> Result<Option<LibraryItem>> {
    let sql = format!(
        "{ITEM_SELECT}
         WHERE f.series_id = (SELECT series_id FROM files WHERE id = ?1)
           AND f.parsed_season IS NOT NULL
           AND (
             (f.parsed_season = (SELECT parsed_season FROM files WHERE id = ?1)
              AND f.parsed_episode < (SELECT parsed_episode FROM files WHERE id = ?1))
             OR f.parsed_season < (SELECT parsed_season FROM files WHERE id = ?1)
           )
         ORDER BY f.parsed_season DESC, f.parsed_episode DESC
         LIMIT 1"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![file_id])?;
    rows.next()?.map(|row| map_library_item(row)).transpose()
}

pub fn get_season_episode_count(conn: &Connection, series_id: i64, season: i64) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM files WHERE series_id = ?1 AND parsed_season = ?2",
        params![series_id, season],
        |row| row.get(0),
    )
}

pub fn library_needs_review(conn: &Connection) -> Result<Vec<LibraryItem>> {
    let sql = format!(
        "{ITEM_SELECT}
         WHERE f.needs_review = 1
         ORDER BY f.filename"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| map_library_item(row))?;
    rows.collect()
}

pub fn tag_needs_review(
    conn: &Connection,
    file_id: i64,
    title: &str,
    season: Option<i64>,
    episode: Option<i64>,
) -> Result<()> {
    conn.execute(
        "UPDATE files SET parsed_title = ?1, parsed_season = ?2, parsed_episode = ?3,
                          needs_review = 0
         WHERE id = ?4",
        params![title, season, episode, file_id],
    )?;
    Ok(())
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ── types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct WatchedFolder {
    pub id: i64,
    pub path: String,
    pub added_at: i64,
}

pub fn get_films_needing_duration(conn: &Connection) -> Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, path FROM files WHERE parsed_season IS NULL AND duration_seconds IS NULL"
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

pub fn update_duration(conn: &Connection, file_id: i64, duration_seconds: i64) -> Result<()> {
    conn.execute(
        "UPDATE files SET duration_seconds = ?1 WHERE id = ?2",
        params![duration_seconds, file_id],
    )?;
    Ok(())
}

pub fn get_file_by_id(conn: &Connection, file_id: i64) -> Result<Option<LibraryItem>> {
    let sql = format!("{ITEM_SELECT} WHERE f.id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![file_id])?;
    rows.next()?.map(|row| map_library_item(row)).transpose()
}

pub struct LetterboxdRow {
    pub title: String,
    pub year: Option<i64>,
    pub watched_at: Option<i64>,
    pub rating: Option<i64>,
}

pub fn get_watched_items_for_export(conn: &Connection) -> Result<Vec<LetterboxdRow>> {
    let mut stmt = conn.prepare(
        "SELECT COALESCE(f.parsed_title, f.filename), f.parsed_year, f.watched_at, f.user_rating
         FROM files f
         WHERE f.watch_status = 'watched' AND f.parsed_season IS NULL
         ORDER BY f.watched_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LetterboxdRow {
            title: row.get(0)?,
            year: row.get(1)?,
            watched_at: row.get(2)?,
            rating: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn get_watched_films_for_trakt(conn: &Connection) -> Result<Vec<LibraryItem>> {
    let sql = format!(
        "{ITEM_SELECT}
         WHERE f.watch_status = 'watched' AND f.parsed_season IS NULL
         ORDER BY f.watched_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| map_library_item(row))?;
    rows.collect()
}

pub struct FileRow {
    pub path: String,
    pub filename: String,
    pub parsed_title: Option<String>,
    pub parsed_year: Option<i64>,
    pub parsed_season: Option<i64>,
    pub parsed_episode: Option<i64>,
    pub series_id: Option<i64>,
    pub resolution: Option<String>,
    pub added_at: i64,
    pub needs_review: bool,
}

impl FileRow {
    pub fn now() -> i64 {
        unix_now()
    }
}

#[derive(Debug, Serialize)]
pub struct LibraryItem {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub parsed_title: Option<String>,
    pub parsed_year: Option<i64>,
    pub parsed_season: Option<i64>,
    pub parsed_episode: Option<i64>,
    pub series_id: Option<i64>,
    pub resolution: Option<String>,
    pub last_played_at: Option<i64>,
    pub resume_position_seconds: Option<i64>,
    pub needs_review: bool,
    pub series_title: Option<String>,
    pub duration_seconds: Option<i64>,
    pub poster_path: Option<String>,
    pub metadata_locked: bool,
    pub is_favourite: bool,
    pub user_rating: Option<i64>,
    pub watch_status: String,
    pub watched_at: Option<i64>,
    pub notes: Option<String>,
}

fn map_library_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryItem> {
    Ok(LibraryItem {
        id: row.get(0)?,
        path: row.get(1)?,
        filename: row.get(2)?,
        parsed_title: row.get(3)?,
        parsed_year: row.get(4)?,
        parsed_season: row.get(5)?,
        parsed_episode: row.get(6)?,
        series_id: row.get(7)?,
        resolution: row.get(8)?,
        last_played_at: row.get(9)?,
        resume_position_seconds: row.get(10)?,
        needs_review: row.get::<_, i64>(11)? != 0,
        series_title: row.get(12)?,
        duration_seconds: row.get(13)?,
        poster_path: row.get(14)?,
        metadata_locked: row.get::<_, i64>(15)? != 0,
        is_favourite: row.get::<_, i64>(16).unwrap_or(0) != 0,
        user_rating: row.get(17).ok().flatten(),
        watch_status: row.get::<_, Option<String>>(18)?.unwrap_or_else(|| "unwatched".to_string()),
        watched_at: row.get(19).ok().flatten(),
        notes: row.get(20).ok().flatten(),
    })
}
