mod commands;
mod mpv;
mod library;
mod metadata;
mod torrents;
mod disc;

use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use libmpv2::Mpv;
use mpv::{MpvWrapper, SharedMpv};
use library::SharedDb;
use library::scanner::start_watcher;
use tauri::Manager;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

// Holds the notify watcher so it stays alive for the process lifetime.
#[allow(dead_code)]
struct WatcherHandle(Option<notify::RecommendedWatcher>);

// File path passed via CLI (e.g. from a file association double-click).
pub struct CliFileState(pub Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ── database ──────────────────────────────────────────────────────
            let data_dir = app.path().app_data_dir()
                .map_err(|e| format!("app_data_dir: {e}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("create data dir: {e}"))?;
            let db_path = data_dir.join("library.db");
            let conn = library::db::open(&db_path)
                .map_err(|e| format!("db open: {e}"))?;
            let shared_db: SharedDb = Arc::new(Mutex::new(conn));

            // ── mpv ───────────────────────────────────────────────────────────
            let mpv = Mpv::with_initializer(|init| {
                init.set_property("terminal", false)?;
                init.set_property("keep-open", true)?;
                init.set_property("hwdec", "auto")?;
                init.set_property("gpu-api", "d3d11")?;
                init.set_property("video-sync", "display-resample")?;
                init.set_property("interpolation", false)?;
                Ok(())
            })
            .map_err(|e| format!("mpv init: {e}"))?;

            let shared_mpv: SharedMpv = Arc::new(Mutex::new(MpvWrapper(mpv)));
            let pending_seek: mpv::SharedPendingSeek = Arc::new(Mutex::new(None));

            // ── subtitle fonts ────────────────────────────────────────────────
            {
                let guard = shared_mpv.lock().unwrap();
                if let Ok(resource_dir) = app.path().resource_dir() {
                    let fonts_dir = resource_dir.join("fonts");
                    if fonts_dir.exists() {
                        let path_str = fonts_dir.to_string_lossy().to_string();
                        guard.0.set_property("sub-fonts-dir", path_str.as_str()).ok();
                    }
                }
                let settings = metadata::load_settings(&data_dir);
                if let Some(ref font) = settings.subtitle_font {
                    guard.0.set_property("sub-font", font.as_str()).ok();
                }
            }

            let window = app
                .get_webview_window("main")
                .ok_or("no main window")?;

            #[cfg(target_os = "windows")]
            {
                let raw = window
                    .window_handle()
                    .map_err(|e| format!("window_handle: {e}"))?;

                let parent_hwnd_isize = match raw.as_raw() {
                    RawWindowHandle::Win32(h) => h.hwnd.get(),
                    _ => return Err("expected Win32 window handle".into()),
                };

                let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(1200, 800));

                let video_hwnd = mpv::render::create_video_child(
                    parent_hwnd_isize as windows_sys::Win32::Foundation::HWND,
                    size.width as i32,
                    size.height as i32,
                )
                .map_err(|e| format!("create_video_child: {e}"))?;

                // Start hidden — frontend shows it when entering the player view.
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        video_hwnd,
                        windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE,
                    );
                }

                let video_hwnd_isize = video_hwnd as isize;

                {
                    let guard = shared_mpv.lock().unwrap();
                    guard.0.set_property("wid", video_hwnd_isize as i64)
                        .map_err(|e| format!("mpv wid: {e}"))?;
                }

                let parent_hwnd_for_resize = parent_hwnd_isize;
                window.on_window_event(move |ev| {
                    if let tauri::WindowEvent::Resized(_) = ev {
                        mpv::render::resize_video_child(
                            video_hwnd_isize as windows_sys::Win32::Foundation::HWND,
                            parent_hwnd_for_resize as windows_sys::Win32::Foundation::HWND,
                        );
                    }
                });

                mpv::render::spawn_state_thread(
                    Arc::clone(&shared_mpv),
                    Arc::clone(&pending_seek),
                    app.handle().clone(),
                );

                app.manage(commands::VideoChildState(Mutex::new(video_hwnd_isize)));
            }
            #[cfg(not(target_os = "windows"))]
            app.manage(commands::VideoChildState(Mutex::new(0isize)));

            // Restore saved window size/position
            if let Ok(data_dir) = app.path().app_data_dir() {
                let settings = metadata::load_settings(&data_dir);
                if let (Some(w), Some(h)) = (settings.window_width, settings.window_height) {
                    window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h))).ok();
                }
                let x = settings.window_x.unwrap_or(-1);
                let y = settings.window_y.unwrap_or(-1);
                if x >= 0 && y >= 0 {
                    window.set_position(tauri::Position::Physical(
                        tauri::PhysicalPosition::new(x, y)
                    )).ok();
                }
            }

            // Show the window now that backend setup is complete.
            window.show().ok();

            // Detect file path from CLI args (e.g. file association double-click)
            let cli_file: Option<String> = std::env::args().nth(1).filter(|arg| {
                let p = std::path::Path::new(arg);
                p.exists() && p.is_file()
            });
            app.manage(CliFileState(Mutex::new(cli_file)));

            let watcher = start_watcher(Arc::clone(&shared_db));
            app.manage(shared_mpv);
            app.manage(shared_db);
            app.manage(pending_seek);
            app.manage(Mutex::new(WatcherHandle(watcher)));

            // ── torrent session ───────────────────────────────────────────────
            let torrent_session_state = commands::TorrentSessionState(
                tokio::sync::RwLock::new(None)
            );
            app.manage(torrent_session_state);

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let download_dir = match app_handle.path().app_data_dir() {
                    Ok(data_dir) => {
                        let settings = metadata::load_settings(&data_dir);
                        match settings.download_folder {
                            Some(p) => std::path::PathBuf::from(p),
                            None => data_dir.join("downloads"),
                        }
                    }
                    Err(_) => return,
                };
                match torrents::start_session(download_dir).await {
                    Ok(session) => {
                        if let Some(state) = app_handle.try_state::<commands::TorrentSessionState>() {
                            *state.0.write().await = Some(session);
                        }
                    }
                    Err(e) => {
                        eprintln!("torrent session failed to start: {e}");
                    }
                }
            });

            // ── disc archiving ────────────────────────────────────────────────
            let disc_state: disc::SharedDiscState =
                Arc::new(Mutex::new(disc::DiscState::Waiting));
            let disc_cancel = disc::DiscCancelFlag(Arc::new(AtomicBool::new(false)));

            // Poll every 3 s for disc insertion / ejection
            let poll_state = Arc::clone(&disc_state);
            let poll_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                    let current = poll_state.lock().unwrap().clone();
                    match current {
                        disc::DiscState::Waiting => {
                            let discs = disc::detector::scan_optical_drives();
                            if let Some(d) = discs.first() {
                                let new = disc::DiscState::Detected {
                                    drive: d.drive.clone(),
                                    label: d.label.clone(),
                                    size_bytes: d.size_bytes,
                                };
                                *poll_state.lock().unwrap() = new.clone();
                                poll_app.emit("disc:state-changed", new).ok();
                            }
                        }
                        disc::DiscState::Detected { ref drive, .. } => {
                            let drive = drive.clone();
                            let discs = disc::detector::scan_optical_drives();
                            if discs.iter().all(|d| d.drive != drive) {
                                *poll_state.lock().unwrap() = disc::DiscState::Waiting;
                                poll_app.emit("disc:state-changed", disc::DiscState::Waiting).ok();
                            }
                        }
                        _ => {} // Archiving / Complete / Error: don't auto-transition
                    }
                }
            });

            app.manage(disc_state);
            app.manage(disc_cancel);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::play_file,
            commands::stop,
            commands::toggle_pause,
            commands::seek_relative,
            commands::seek,
            commands::get_playback_state,
            commands::get_track_list,
            commands::set_audio_track,
            commands::set_subtitle_track,
            commands::apply_visual_profile,
            commands::volume_up,
            commands::volume_down,
            commands::toggle_mute,
            commands::speed_up,
            commands::speed_down,
            commands::frame_step,
            commands::frame_back_step,
            commands::set_tmdb_key,
            commands::get_tmdb_key,
            commands::fetch_metadata_all,
            commands::add_watched_folder,
            commands::remove_watched_folder,
            commands::list_watched_folders,
            commands::rescan,
            commands::library_list,
            commands::library_needs_review,
            commands::tag_needs_review,
            commands::update_progress,
            commands::init_scrub_thumbs,
            commands::get_scrub_thumb,
            commands::get_series_track_pref,
            commands::set_series_track_pref,
            commands::search_tmdb_titles,
            commands::apply_tmdb_override,
            commands::apply_local_poster,
            commands::set_metadata_locked,
            commands::toggle_favourite,
            commands::set_user_rating,
            commands::set_watch_status,
            commands::set_notes,
            commands::get_favourite_films,
            commands::get_favourite_episodes,
            commands::get_collection_stats,
            commands::get_next_episode,
            commands::get_prev_episode,
            commands::get_season_episode_count,
            commands::get_global_profile,
            commands::set_global_profile,
            commands::get_subtitle_font,
            commands::set_subtitle_font,
            commands::get_series_profile,
            commands::set_series_profile,
            commands::get_window_state,
            commands::save_window_state,
            commands::get_cli_file,
            commands::set_video_visible,
            commands::force_video_resize,
            commands::get_download_folder,
            commands::set_download_folder,
            commands::torrent_add_magnet,
            commands::torrent_add_file,
            commands::torrent_pause,
            commands::torrent_resume,
            commands::torrent_remove,
            commands::torrent_list,
            commands::torrent_get_file_path,
            commands::scan_film_durations,
            commands::disc_get_state,
            commands::disc_dismiss,
            commands::disc_cancel_archive,
            commands::disc_retry,
            commands::disc_start_archive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use libmpv2::Mpv;

    #[test]
    fn can_create_mpv() {
        let mpv = Mpv::new().expect("failed to create mpv instance");
        mpv.set_property("terminal", false)
            .expect("failed to set terminal property");
        drop(mpv);
    }
}
