use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DiscState {
    Waiting,
    Detected {
        drive: String,
        label: String,
        size_bytes: u64,
    },
    Archiving {
        drive: String,
        label: String,
        bytes_read: u64,
        bytes_total: u64,
        speed_mbps: f32,
        eta_seconds: u64,
        output_path: String,
    },
    Complete {
        label: String,
        iso_path: String,
    },
    Error {
        label: String,
        message: String,
        drive: String,
    },
}
