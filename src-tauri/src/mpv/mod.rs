pub mod controller;
pub mod render;

use std::sync::{Arc, Mutex};
use libmpv2::Mpv;

/// Wraps Mpv so it can be shared across threads.
/// Safety: libmpv's C API is documented as thread-safe.
pub struct MpvWrapper(pub Mpv);
unsafe impl Send for MpvWrapper {}
unsafe impl Sync for MpvWrapper {}

pub type SharedMpv = Arc<Mutex<MpvWrapper>>;
pub type SharedPendingSeek = Arc<Mutex<Option<f64>>>;

#[derive(Debug, Clone, serde::Serialize)]
pub struct PlaybackState {
    pub paused: bool,
    pub position_seconds: f64,
    pub duration_seconds: f64,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self { paused: true, position_seconds: 0.0, duration_seconds: 0.0 }
    }
}
