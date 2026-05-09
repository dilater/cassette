use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TorrentState {
    Downloading,
    Paused,
    Complete,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentInfo {
    pub id: u64,
    pub name: String,
    pub state: TorrentState,
    pub progress_pct: f32,
    pub down_speed_kbps: u64,
    pub up_speed_kbps: u64,
    pub peers: u32,
    pub eta_seconds: Option<u64>,
    pub size_bytes: u64,
    pub downloaded_bytes: u64,
    pub error_message: Option<String>,
    pub file_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentComplete {
    pub id: u64,
    pub name: String,
    pub file_paths: Vec<String>,
}
