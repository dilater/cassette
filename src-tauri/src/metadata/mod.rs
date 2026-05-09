pub mod tmdb;

use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AppSettings {
    pub tmdb_key: Option<String>,
    pub global_profile: Option<String>,
    pub window_width: Option<u32>,
    pub window_height: Option<u32>,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
    pub download_folder: Option<String>,
    pub subtitle_font: Option<String>,
}

pub fn load_settings(data_dir: &Path) -> AppSettings {
    let path = data_dir.join("settings.json");
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_settings(data_dir: &Path, settings: &AppSettings) {
    let path = data_dir.join("settings.json");
    if let Ok(text) = serde_json::to_string_pretty(settings) {
        std::fs::write(path, text).ok();
    }
}
