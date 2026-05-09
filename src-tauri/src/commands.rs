use tauri::{State, Manager, Emitter};
use crate::mpv::{SharedMpv, PlaybackState};
use crate::mpv::controller::{self, TrackInfo};
use crate::library::{SharedDb, db, scanner};
use crate::library::db::LibraryItem;
use crate::metadata;
use std::collections::HashSet;

fn find_ffmpeg(app: &tauri::AppHandle) -> String {
    // Prefer the bundled binary in resources/, fall back to PATH.
    app.path().resource_dir().ok()
        .map(|d| d.join("ffmpeg.exe"))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "ffmpeg".to_string())
}

fn find_ffprobe(app: &tauri::AppHandle) -> String {
    app.path().resource_dir().ok()
        .map(|d| d.join("ffprobe.exe"))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "ffprobe".to_string())
}

// ── playback ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn play_file(path: String, resume_position: Option<f64>, shared: State<SharedMpv>, pending_seek: State<crate::mpv::SharedPendingSeek>) {
    if let Some(pos) = resume_position.filter(|&p| p > 5.0) {
        if let Ok(mut seek) = pending_seek.lock() {
            *seek = Some(pos);
        }
    }
    if let Ok(guard) = shared.lock() {
        controller::play_file(&guard.0, &path);
    }
}

#[tauri::command]
pub fn stop(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() {
        controller::stop(&guard.0);
    }
}

#[tauri::command]
pub fn toggle_pause(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() {
        controller::toggle_pause(&guard.0);
    }
}

#[tauri::command]
pub fn seek_relative(delta: f64, shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() {
        controller::seek_relative(&guard.0, delta);
    }
}

#[tauri::command]
pub fn seek(position: f64, shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() {
        controller::seek(&guard.0, position);
    }
}

#[tauri::command]
pub fn get_playback_state(shared: State<SharedMpv>) -> PlaybackState {
    if let Ok(guard) = shared.lock() {
        controller::get_playback_state(&guard.0)
    } else {
        PlaybackState::default()
    }
}

#[tauri::command]
pub fn get_track_list(shared: State<SharedMpv>) -> Vec<TrackInfo> {
    if let Ok(guard) = shared.lock() {
        controller::get_track_list(&guard.0)
    } else {
        vec![]
    }
}

#[tauri::command]
pub fn set_audio_track(track_id: i64, shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() {
        controller::set_audio_track(&guard.0, track_id);
    }
}

#[tauri::command]
pub fn set_subtitle_track(track_id: Option<i64>, shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() {
        controller::set_subtitle_track(&guard.0, track_id);
    }
}

#[tauri::command]
pub fn apply_visual_profile(profile: String, shared: State<SharedMpv>, app: tauri::AppHandle) {
    let shader_dir = app.path().resource_dir().ok().map(|p| p.join("shaders"));
    if let Ok(guard) = shared.lock() {
        controller::apply_visual_profile(&guard.0, &profile, shader_dir.as_deref());
    }
}

#[tauri::command]
pub fn get_global_profile(app: tauri::AppHandle) -> String {
    let data_dir = app.path().app_data_dir().ok();
    data_dir
        .map(|d| metadata::load_settings(&d))
        .and_then(|s| s.global_profile)
        .unwrap_or_else(|| "film".to_string())
}

#[tauri::command]
pub fn set_global_profile(profile: String, app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut settings = metadata::load_settings(&data_dir);
    settings.global_profile = Some(profile);
    metadata::save_settings(&data_dir, &settings);
    Ok(())
}

#[tauri::command]
pub fn get_subtitle_font(app: tauri::AppHandle) -> String {
    let data_dir = app.path().app_data_dir().ok();
    data_dir
        .map(|d| metadata::load_settings(&d))
        .and_then(|s| s.subtitle_font)
        .unwrap_or_else(|| "Default".to_string())
}

#[tauri::command]
pub fn set_subtitle_font(font: String, shared: State<'_, SharedMpv>, app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(guard) = shared.lock() {
        if font == "Default" {
            guard.0.set_property("sub-font", "").map_err(|e| e.to_string())?;
        } else {
            guard.0.set_property("sub-font", font.as_str()).map_err(|e| e.to_string())?;
        }
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut settings = metadata::load_settings(&data_dir);
    settings.subtitle_font = if font == "Default" { None } else { Some(font) };
    metadata::save_settings(&data_dir, &settings);
    Ok(())
}

#[tauri::command]
pub fn get_series_profile(series_id: i64, shared_db: State<SharedDb>) -> Result<Option<String>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::get_series_profile(&conn, series_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_series_profile(series_id: i64, profile: Option<String>, shared_db: State<SharedDb>) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::set_series_profile(&conn, series_id, profile.as_deref()).map_err(|e| e.to_string())
}

// ── extra playback controls ───────────────────────────────────────────────────

#[tauri::command]
pub fn volume_up(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::volume_up(&guard.0); }
}

#[tauri::command]
pub fn volume_down(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::volume_down(&guard.0); }
}

#[tauri::command]
pub fn toggle_mute(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::toggle_mute(&guard.0); }
}

#[tauri::command]
pub fn speed_up(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::speed_up(&guard.0); }
}

#[tauri::command]
pub fn speed_down(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::speed_down(&guard.0); }
}

#[tauri::command]
pub fn frame_step(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::frame_step(&guard.0); }
}

#[tauri::command]
pub fn frame_back_step(shared: State<SharedMpv>) {
    if let Ok(guard) = shared.lock() { controller::frame_back_step(&guard.0); }
}

// ── needs-review tagging ──────────────────────────────────────────────────────

#[tauri::command]
pub fn library_needs_review(shared_db: State<SharedDb>) -> Result<Vec<LibraryItem>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::library_needs_review(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tag_needs_review(
    file_id: i64,
    title: String,
    season: Option<i64>,
    episode: Option<i64>,
    shared_db: State<SharedDb>,
) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::tag_needs_review(&conn, file_id, &title, season, episode).map_err(|e| e.to_string())
}

// ── video child visibility ────────────────────────────────────────────────────

pub struct VideoChildState(pub std::sync::Mutex<isize>);

#[tauri::command]
pub fn set_video_visible(visible: bool, video_child: State<'_, VideoChildState>) {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOW, SW_HIDE};
        if let Ok(hwnd) = video_child.0.lock() {
            let cmd = if visible { SW_SHOW } else { SW_HIDE };
            unsafe { ShowWindow(*hwnd as windows_sys::Win32::Foundation::HWND, cmd); }
        }
    }
}

#[tauri::command]
pub fn force_video_resize(video_child: State<'_, VideoChildState>, window: tauri::Window) {
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(hwnd) = video_child.0.lock() {
            if let Ok(handle) = window.window_handle() {
                let parent = match handle.as_raw() {
                    RawWindowHandle::Win32(h) => h.hwnd.get(),
                    _ => return,
                };
                crate::mpv::render::resize_video_child(
                    *hwnd as windows_sys::Win32::Foundation::HWND,
                    parent as windows_sys::Win32::Foundation::HWND,
                );
            }
        }
    }
}

// ── window state ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_window_state(app: tauri::AppHandle) -> (u32, u32, i32, i32) {
    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return (1200, 800, -1, -1),
    };
    let s = metadata::load_settings(&data_dir);
    (
        s.window_width.unwrap_or(1200),
        s.window_height.unwrap_or(800),
        s.window_x.unwrap_or(-1),
        s.window_y.unwrap_or(-1),
    )
}

#[tauri::command]
pub fn save_window_state(
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut settings = metadata::load_settings(&data_dir);
    settings.window_width = Some(width);
    settings.window_height = Some(height);
    settings.window_x = Some(x);
    settings.window_y = Some(y);
    metadata::save_settings(&data_dir, &settings);
    Ok(())
}

// ── cli file (file associations) ──────────────────────────────────────────────

#[tauri::command]
pub fn get_cli_file(cli_file: State<crate::CliFileState>) -> Option<String> {
    cli_file.0.lock().ok()?.clone()
}

// ── metadata ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn set_tmdb_key(key: String, app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut settings = metadata::load_settings(&data_dir);
    settings.tmdb_key = if key.is_empty() { None } else { Some(key) };
    metadata::save_settings(&data_dir, &settings);
    Ok(())
}

#[tauri::command]
pub fn get_tmdb_key(app: tauri::AppHandle) -> Option<String> {
    let data_dir = app.path().app_data_dir().ok()?;
    metadata::load_settings(&data_dir).tmdb_key
}

#[tauri::command]
pub async fn fetch_metadata_all(
    app: tauri::AppHandle,
    shared_db: State<'_, SharedDb>,
) -> Result<usize, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings = metadata::load_settings(&data_dir);
    let api_key = settings.tmdb_key.ok_or("No TMDb API key configured")?;
    let cache_dir = data_dir.join("metadata_cache");
    std::fs::create_dir_all(&cache_dir).ok();

    // Pass 1: items without posters, deduplicated by series or title
    let items = {
        let conn = shared_db.lock().map_err(|e| e.to_string())?;
        db::library_list(&conn, "all").map_err(|e| e.to_string())?
    };
    let mut seen: HashSet<String> = HashSet::new();
    let to_fetch: Vec<_> = items
        .into_iter()
        .filter(|i| i.poster_path.is_none() && !i.metadata_locked)
        .filter(|i| {
            let key = i.series_id.map(|id| format!("s:{id}"))
                .or_else(|| i.parsed_title.as_ref().map(|t| format!("f:{t}")))
                .unwrap_or_else(|| format!("x:{}", i.id));
            seen.insert(key)
        })
        .collect();

    let count = to_fetch.len();
    let db_clone = (*shared_db).clone();
    let app_clone = app.clone();
    let api_key_clone = api_key.clone();
    let cache_dir_clone = cache_dir.clone();

    tauri::async_runtime::spawn(async move {
        // ── Pass 1: posters ──────────────────────────────────────────────────
        for item in to_fetch {
            let is_tv = item.parsed_season.is_some();
            let title = item.series_title.as_deref()
                .or(item.parsed_title.as_deref())
                .unwrap_or(&item.filename)
                .to_owned();

            if let Some((p, tmdb_id)) = metadata::tmdb::fetch_poster(
                &title,
                item.parsed_year,
                is_tv,
                &api_key_clone,
                &cache_dir_clone,
            ).await {
                let path_str = p.to_string_lossy().into_owned();
                if let Ok(conn) = db_clone.lock() {
                    if let Some(sid) = item.series_id {
                        db::update_poster_by_series(&conn, sid, &path_str).ok();
                        db::update_series_tmdb_id(&conn, sid, tmdb_id).ok();
                    } else {
                        db::update_poster_for_file(&conn, item.id, &path_str).ok();
                    }
                }
                app_clone.emit("library:metadata-ready", ()).ok();
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
        }

        // ── Pass 2: episode stills (series must have tmdb_id from pass 1) ──
        let episodes = {
            if let Ok(conn) = db_clone.lock() {
                db::get_episodes_needing_stills(&conn).unwrap_or_default()
            } else {
                return;
            }
        };

        for (file_id, _series_id, series_tmdb_id, season, episode) in episodes {
            if let Some(p) = metadata::tmdb::fetch_episode_still(
                series_tmdb_id,
                season,
                episode,
                &api_key,
                &cache_dir,
            ).await {
                let path_str = p.to_string_lossy().into_owned();
                if let Ok(conn) = db_clone.lock() {
                    db::update_thumb_for_file(&conn, file_id, &path_str).ok();
                }
                app.emit("library:metadata-ready", ()).ok();
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
        }
    });

    Ok(count)
}

// ── library ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_watched_folder(path: String, shared_db: State<SharedDb>) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::add_watched_folder(&conn, &path).map_err(|e| e.to_string())?;
    scanner::scan_folder(&conn, &path);
    Ok(())
}

#[tauri::command]
pub fn remove_watched_folder(path: String, shared_db: State<SharedDb>) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::remove_watched_folder(&conn, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_watched_folders(shared_db: State<SharedDb>) -> Result<Vec<db::WatchedFolder>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::list_watched_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rescan(shared_db: State<SharedDb>) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    scanner::rescan_all(&conn);
    Ok(())
}

#[tauri::command]
pub fn library_list(kind: String, shared_db: State<SharedDb>) -> Result<Vec<LibraryItem>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::library_list(&conn, &kind).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn init_scrub_thumbs(
    file_id: i64,
    path: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_dir = data_dir.join("metadata_cache").join("thumbs").join(file_id.to_string());

    // Skip if already generated (more than a handful of files present)
    if thumb_dir.exists() {
        let count = std::fs::read_dir(&thumb_dir)
            .map(|d| d.count())
            .unwrap_or(0);
        if count > 5 {
            return Ok(());
        }
    }
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    let ffmpeg = find_ffmpeg(&app);

    tauri::async_runtime::spawn(async move {
        let temp_dir = thumb_dir.join("_tmp");
        std::fs::create_dir_all(&temp_dir).ok();
        let pattern = temp_dir.join("%06d.jpg").to_string_lossy().into_owned();

        let status = tokio::process::Command::new(&ffmpeg)
            .args([
                "-i", &path,
                "-vf", "fps=1/5,scale=160:-1",
                "-q:v", "6",
                "-y",
                &pattern,
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x08000000)
            .status()
            .await;

        if matches!(status, Ok(s) if s.success()) {
            // Rename: 000001.jpg → 000000.jpg (0s), 000002.jpg → 000005.jpg (5s), etc.
            if let Ok(entries) = std::fs::read_dir(&temp_dir) {
                let mut files: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().extension().map_or(false, |x| x == "jpg"))
                    .collect();
                files.sort_by_key(|e| e.path());
                for (i, entry) in files.iter().enumerate() {
                    let dest = thumb_dir.join(format!("{:06}.jpg", i as i64 * 5));
                    if !dest.exists() {
                        std::fs::rename(entry.path(), &dest).ok();
                    }
                }
            }
            std::fs::remove_dir_all(&temp_dir).ok();
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_scrub_thumb(
    file_id: i64,
    path: String,
    position_secs: f64,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let bucket = (position_secs as i64 / 5) * 5;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_dir = data_dir.join("metadata_cache").join("thumbs").join(file_id.to_string());
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    let thumb_path = thumb_dir.join(format!("{:06}.jpg", bucket));

    if !thumb_path.exists() {
        let ffmpeg = find_ffmpeg(&app);
        let status = tokio::process::Command::new(&ffmpeg)
            .args([
                "-ss", &bucket.to_string(),
                "-i", &path,
                "-frames:v", "1",
                "-q:v", "5",
                "-vf", "scale=160:-1",
                "-y",
                thumb_path.to_str().unwrap_or_default(),
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .status()
            .await;
        match status {
            Ok(s) if s.success() && thumb_path.exists() => {}
            _ => return Ok(None),
        }
    }

    let bytes = std::fs::read(&thumb_path).map_err(|e| e.to_string())?;
    Ok(Some(format!("data:image/jpeg;base64,{}", b64_encode(&bytes))))
}

fn b64_encode(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for c in data.chunks(3) {
        let n = match c {
            [a, b, c] => (*a as u32) << 16 | (*b as u32) << 8 | *c as u32,
            [a, b]    => (*a as u32) << 16 | (*b as u32) << 8,
            [a]       => (*a as u32) << 16,
            _         => 0,
        };
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        out.push(if c.len() > 1 { T[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if c.len() > 2 { T[(n      & 63) as usize] as char } else { '=' });
    }
    out
}

fn b64_val(b: u8) -> i16 {
    match b {
        b'A'..=b'Z' => (b - b'A') as i16,
        b'a'..=b'z' => (b - b'a' + 26) as i16,
        b'0'..=b'9' => (b - b'0' + 52) as i16,
        b'+' => 62,
        b'/' => 63,
        _ => -1,
    }
}

fn b64_decode(input: &str) -> Result<Vec<u8>, &'static str> {
    // Strip whitespace
    let clean: Vec<u8> = input
        .bytes()
        .filter(|&b| !b.is_ascii_whitespace())
        .collect();
    if clean.len() % 4 != 0 {
        return Err("invalid base64 length");
    }
    let mut out = Vec::with_capacity(clean.len() / 4 * 3);
    for chunk in clean.chunks(4) {
        let a = b64_val(chunk[0]);
        let b = b64_val(chunk[1]);
        let c = if chunk[2] == b'=' { 0i16 } else { b64_val(chunk[2]) };
        let d = if chunk[3] == b'=' { 0i16 } else { b64_val(chunk[3]) };
        if a < 0 || b < 0 || c < 0 || d < 0 {
            return Err("invalid base64 character");
        }
        let n = (a as u32) << 18 | (b as u32) << 12 | (c as u32) << 6 | (d as u32);
        out.push((n >> 16) as u8);
        if chunk[2] != b'=' { out.push((n >> 8) as u8); }
        if chunk[3] != b'=' { out.push(n as u8); }
    }
    Ok(out)
}

#[tauri::command]
pub fn get_series_track_pref(series_id: i64, shared_db: State<SharedDb>) -> Result<Option<db::SeriesTrackPref>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::get_series_track_pref(&conn, series_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_series_track_pref(series_id: i64, audio_lang: Option<String>, audio_track_index: Option<i64>, shared_db: State<SharedDb>) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::set_series_track_pref(&conn, series_id, audio_lang.as_deref(), audio_track_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_progress(
    file_id: i64,
    position_seconds: f64,
    duration_seconds: Option<f64>,
    shared_db: State<SharedDb>,
) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::update_progress(&conn, file_id, position_seconds, duration_seconds)
        .map_err(|e| e.to_string())
}

// ── metadata overrides ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn search_tmdb_titles(
    query: String,
    app: tauri::AppHandle,
) -> Result<Vec<metadata::tmdb::TmdbSearchResult>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings = metadata::load_settings(&data_dir);
    let api_key = settings.tmdb_key.ok_or("No TMDb API key configured")?;
    Ok(metadata::tmdb::search_titles(&query, &api_key).await)
}

#[tauri::command]
pub async fn apply_tmdb_override(
    file_id: i64,
    series_id: Option<i64>,
    tmdb_id: i64,
    title: String,
    year: Option<i64>,
    poster_path: Option<String>,
    app: tauri::AppHandle,
    shared_db: State<'_, SharedDb>,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = data_dir.join("metadata_cache");
    std::fs::create_dir_all(&cache_dir).ok();

    let saved_poster = if let Some(ref p) = poster_path {
        let safe: String = title
            .chars()
            .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
            .collect();
        let year_part = year.map(|y| format!("_{y}")).unwrap_or_default();
        let dest = cache_dir.join(format!("{safe}{year_part}_override.jpg"));
        let client = reqwest::Client::new();
        if metadata::tmdb::download_poster(p, &dest, &client).await {
            Some(dest.to_string_lossy().into_owned())
        } else {
            None
        }
    } else {
        None
    };

    let poster_str = saved_poster.as_deref().unwrap_or("");
    let conn = shared_db.lock().map_err(|e| e.to_string())?;

    if let Some(sid) = series_id {
        db::apply_override_for_series(&conn, sid, &title, year, poster_str, Some(tmdb_id))
            .map_err(|e| e.to_string())?;
    } else {
        db::apply_override_for_file(&conn, file_id, &title, year, poster_str, Some(tmdb_id))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_local_poster(
    file_id: i64,
    series_id: Option<i64>,
    title: Option<String>,
    image_data: String,
    app: tauri::AppHandle,
    shared_db: State<'_, SharedDb>,
) -> Result<(), String> {
    // Strip data URL prefix if present: "data:image/jpeg;base64,..."
    let base64_str = if let Some(pos) = image_data.find(',') {
        &image_data[pos + 1..]
    } else {
        &image_data
    };

    let bytes = b64_decode(base64_str).map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = data_dir.join("metadata_cache");
    std::fs::create_dir_all(&cache_dir).ok();

    let dest = cache_dir.join(format!("local_poster_{file_id}.jpg"));
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    let poster_str = dest.to_string_lossy().into_owned();

    let conn = shared_db.lock().map_err(|e| e.to_string())?;

    if let Some(sid) = series_id {
        let display_title = title.as_deref().unwrap_or("");
        db::apply_override_for_series(&conn, sid, display_title, None, &poster_str, None)
            .map_err(|e| e.to_string())?;
    } else {
        let display_title = title.as_deref().unwrap_or("");
        db::apply_override_for_file(&conn, file_id, display_title, None, &poster_str, None)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_metadata_locked(
    file_id: i64,
    locked: bool,
    shared_db: State<SharedDb>,
) -> Result<(), String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::set_metadata_locked(&conn, file_id, locked).map_err(|e| e.to_string())
}

// ── favourites and collection ─────────────────────────────────────────────────

#[tauri::command]
pub fn toggle_favourite(file_id: i64, db: State<SharedDb>) -> Result<bool, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::toggle_favourite(&conn, file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_user_rating(file_id: i64, rating: Option<i64>, db: State<SharedDb>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::set_user_rating(&conn, file_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_watch_status(file_id: i64, status: String, db: State<SharedDb>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::set_watch_status(&conn, file_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_notes(file_id: i64, notes: Option<String>, db: State<SharedDb>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::set_notes(&conn, file_id, notes.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favourite_films(db: State<SharedDb>) -> Result<Vec<db::LibraryItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::get_favourite_films(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favourite_episodes(db: State<SharedDb>) -> Result<Vec<db::LibraryItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::get_favourite_episodes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_collection_stats(db: State<SharedDb>) -> Result<(i64, i64, f64), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    db::get_collection_stats(&conn).map_err(|e| e.to_string())
}

// ── episode navigation ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_next_episode(file_id: i64, shared_db: State<SharedDb>) -> Result<Option<LibraryItem>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::get_next_episode(&conn, file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_prev_episode(file_id: i64, shared_db: State<SharedDb>) -> Result<Option<LibraryItem>, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::get_prev_episode(&conn, file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_season_episode_count(series_id: i64, season: i64, shared_db: State<SharedDb>) -> Result<i64, String> {
    let conn = shared_db.lock().map_err(|e| e.to_string())?;
    db::get_season_episode_count(&conn, series_id, season).map_err(|e| e.to_string())
}

// ── torrents ──────────────────────────────────────────────────────────────────

pub struct TorrentSessionState(pub tokio::sync::RwLock<Option<std::sync::Arc<librqbit::Session>>>);

fn resolve_download_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings = metadata::load_settings(&data_dir);
    let dir = match settings.download_folder {
        Some(ref p) => std::path::PathBuf::from(p),
        None => data_dir.join("downloads"),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn get_download_folder(app: tauri::AppHandle) -> Result<String, String> {
    let dir = resolve_download_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_download_folder(path: String, app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut settings = metadata::load_settings(&data_dir);
    settings.download_folder = if path.is_empty() { None } else { Some(path) };
    metadata::save_settings(&data_dir, &settings);
    Ok(())
}

#[tauri::command]
pub async fn torrent_add_magnet(
    magnet: String,
    session: State<'_, TorrentSessionState>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    let download_dir = resolve_download_dir(&app)?;
    let (id, _) = crate::torrents::manager::add_torrent(
        sess,
        crate::torrents::manager::TorrentSource::Magnet(magnet),
        download_dir,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(id as u64)
}

#[tauri::command]
pub async fn torrent_add_file(
    bytes: Vec<u8>,
    session: State<'_, TorrentSessionState>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    let download_dir = resolve_download_dir(&app)?;
    let (id, _) = crate::torrents::manager::add_torrent(
        sess,
        crate::torrents::manager::TorrentSource::FileBytes(bytes),
        download_dir,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(id as u64)
}

#[tauri::command]
pub async fn torrent_pause(id: u64, session: State<'_, TorrentSessionState>) -> Result<(), String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    crate::torrents::manager::pause_torrent(sess, id as usize)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn torrent_resume(id: u64, session: State<'_, TorrentSessionState>) -> Result<(), String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    crate::torrents::manager::resume_torrent(sess, id as usize)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn torrent_remove(
    id: u64,
    delete_files: bool,
    session: State<'_, TorrentSessionState>,
) -> Result<(), String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    crate::torrents::manager::remove_torrent(sess, id as usize, delete_files)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn torrent_list(session: State<'_, TorrentSessionState>) -> Result<Vec<crate::torrents::state::TorrentInfo>, String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    Ok(crate::torrents::manager::list_torrents(sess))
}

#[tauri::command]
pub async fn torrent_get_file_path(
    id: u64,
    file_index: usize,
    session: State<'_, TorrentSessionState>,
) -> Result<Option<String>, String> {
    let guard = session.0.read().await;
    let sess = guard.as_ref().ok_or("torrent session not started")?;
    Ok(crate::torrents::manager::get_file_path(sess, id as usize, file_index))
}

#[tauri::command]
pub async fn scan_film_durations(app: tauri::AppHandle, db: State<'_, SharedDb>) -> Result<u32, String> {
    let ffprobe = find_ffprobe(&app);
    let films: Vec<(i64, String)> = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        db::get_films_needing_duration(&conn).map_err(|e| e.to_string())?
    };
    let mut updated: u32 = 0;
    for (file_id, path) in films {
        let output = tokio::process::Command::new(&ffprobe)
            .args(["-v", "quiet", "-print_format", "json", "-show_format", &path])
            .output()
            .await;
        let Ok(out) = output else { continue };
        if !out.status.success() { continue }
        let json: serde_json::Value = match serde_json::from_slice(&out.stdout) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let dur_str = json["format"]["duration"].as_str().unwrap_or("");
        let dur_secs = match dur_str.parse::<f64>() {
            Ok(d) if d >= 60.0 => d as i64,
            _ => continue,
        };
        let conn = db.lock().map_err(|e| e.to_string())?;
        if db::update_duration(&conn, file_id, dur_secs).is_ok() {
            updated += 1;
        }
    }
    Ok(updated)
}
