use super::SharedMpv;
use libmpv2::Mpv;
use serde::Serialize;

pub fn play_file(mpv: &Mpv, path: &str) {
    let safe_path = path.replace('"', "");
    mpv.command("loadfile", &[safe_path.as_str(), "replace"]).ok();
}

pub fn stop(mpv: &Mpv) {
    mpv.command("stop", &[]).ok();
}

pub fn toggle_pause(mpv: &Mpv) {
    mpv.command("cycle", &["pause"]).ok();
}

pub fn seek_relative(mpv: &Mpv, delta: f64) {
    let delta_str = format!("{delta}");
    mpv.command("seek", &[delta_str.as_str(), "relative"]).ok();
}

pub fn seek(mpv: &Mpv, position: f64) {
    let pos_str = format!("{position}");
    mpv.command("seek", &[pos_str.as_str(), "absolute"]).ok();
}

pub fn get_playback_state(mpv: &Mpv) -> super::PlaybackState {
    let paused = mpv.get_property::<bool>("pause").unwrap_or(true);
    let position = mpv.get_property::<f64>("time-pos").unwrap_or(0.0);
    let duration = mpv.get_property::<f64>("duration").unwrap_or(0.0);
    super::PlaybackState {
        paused,
        position_seconds: position,
        duration_seconds: duration,
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct TrackInfo {
    pub id: i64,
    pub kind: String,
    pub lang: Option<String>,
    pub title: Option<String>,
    pub selected: bool,
}

pub fn get_track_list(mpv: &Mpv) -> Vec<TrackInfo> {
    let count = mpv.get_property::<i64>("track-list/count").unwrap_or(0);
    (0..count).filter_map(|i| {
        let kind = mpv.get_property::<String>(&format!("track-list/{i}/type")).ok()?;
        let id = mpv.get_property::<i64>(&format!("track-list/{i}/id")).ok()?;
        let lang = mpv.get_property::<String>(&format!("track-list/{i}/lang")).ok();
        let title = mpv.get_property::<String>(&format!("track-list/{i}/title")).ok();
        let selected = mpv.get_property::<bool>(&format!("track-list/{i}/selected")).unwrap_or(false);
        Some(TrackInfo { id, kind, lang, title, selected })
    }).collect()
}

pub fn set_audio_track(mpv: &Mpv, track_id: i64) {
    mpv.set_property("aid", track_id).ok();
}

pub fn set_subtitle_track(mpv: &Mpv, track_id: Option<i64>) {
    match track_id {
        Some(id) => { mpv.set_property("sid", id).ok(); }
        None => { mpv.command("set", &["sid", "no"]).ok(); }
    }
}

pub fn apply_visual_profile(mpv: &Mpv, profile: &str, shader_dir: Option<&std::path::Path>) {
    // Clear all loaded shaders first
    mpv.command("change-list", &["glsl-shaders", "set", ""]).ok();

    match profile {
        "film" => {
            // Load KrigBilateral for high-quality chroma upscaling
            if let Some(dir) = shader_dir {
                let krig = dir.join("KrigBilateral.glsl");
                if krig.exists() {
                    let s = krig.to_string_lossy();
                    mpv.command("change-list", &["glsl-shaders", "append", s.as_ref()]).ok();
                }
            }
            mpv.command("set", &["scale", "ewa_lanczossharp"]).ok();
            mpv.command("set", &["cscale", "mitchell"]).ok();
            mpv.command("set", &["dscale", "mitchell"]).ok();
            mpv.command("set", &["video-sync", "display-resample"]).ok();
            mpv.command("set", &["interpolation", "no"]).ok();
            mpv.command("set", &["deband", "yes"]).ok();
            mpv.command("set", &["deband-iterations", "2"]).ok();
            mpv.command("set", &["deband-threshold", "48"]).ok();
            mpv.command("set", &["deband-grain", "32"]).ok();
            mpv.command("set", &["tone-mapping", "bt.2446a"]).ok();
            mpv.command("set", &["hwdec", "auto"]).ok();
        }
        "anime" => {
            // Anime4K Mode A (lite): Restore then Upscale + KrigBilateral chroma
            if let Some(dir) = shader_dir {
                for name in &[
                    "Anime4K_Restore_CNN_Soft_M.glsl",
                    "Anime4K_Upscale_CNN_x2_M.glsl",
                    "KrigBilateral.glsl",
                ] {
                    let p = dir.join(name);
                    if p.exists() {
                        let s = p.to_string_lossy();
                        mpv.command("change-list", &["glsl-shaders", "append", s.as_ref()]).ok();
                    }
                }
            }
            mpv.command("set", &["scale", "bilinear"]).ok(); // Anime4K handles upscaling
            mpv.command("set", &["cscale", "bilinear"]).ok();
            mpv.command("set", &["dscale", "bilinear"]).ok();
            mpv.command("set", &["video-sync", "display-resample"]).ok();
            mpv.command("set", &["interpolation", "no"]).ok();
            mpv.command("set", &["deband", "yes"]).ok();
            mpv.command("set", &["deband-iterations", "1"]).ok();
            mpv.command("set", &["deband-threshold", "32"]).ok();
            mpv.command("set", &["deband-grain", "0"]).ok();
            mpv.command("set", &["tone-mapping", "auto"]).ok();
            mpv.command("set", &["hwdec", "auto"]).ok();
        }
        "low-power" => {
            mpv.command("set", &["scale", "bilinear"]).ok();
            mpv.command("set", &["cscale", "bilinear"]).ok();
            mpv.command("set", &["dscale", "bilinear"]).ok();
            mpv.command("set", &["video-sync", "audio"]).ok();
            mpv.command("set", &["interpolation", "no"]).ok();
            mpv.command("set", &["deband", "no"]).ok();
            mpv.command("set", &["tone-mapping", "auto"]).ok();
            mpv.command("set", &["hwdec", "auto"]).ok();
        }
        "none" => {
            mpv.command("set", &["scale", "bilinear"]).ok();
            mpv.command("set", &["cscale", "bilinear"]).ok();
            mpv.command("set", &["dscale", "bilinear"]).ok();
            mpv.command("set", &["video-sync", "audio"]).ok();
            mpv.command("set", &["interpolation", "no"]).ok();
            mpv.command("set", &["deband", "no"]).ok();
            mpv.command("set", &["tone-mapping", "auto"]).ok();
            mpv.command("set", &["hwdec", "auto"]).ok();
        }
        _ => {}
    }
}

pub fn volume_up(mpv: &Mpv) {
    mpv.command("add", &["volume", "5"]).ok();
}

pub fn volume_down(mpv: &Mpv) {
    mpv.command("add", &["volume", "-5"]).ok();
}

pub fn toggle_mute(mpv: &Mpv) {
    mpv.command("cycle", &["mute"]).ok();
}

pub fn speed_up(mpv: &Mpv) {
    mpv.command("multiply", &["speed", "1.1"]).ok();
}

pub fn speed_down(mpv: &Mpv) {
    mpv.command("multiply", &["speed", "0.9091"]).ok();
}

pub fn frame_step(mpv: &Mpv) {
    mpv.command("frame-step", &[]).ok();
}

pub fn frame_back_step(mpv: &Mpv) {
    mpv.command("frame-back-step", &[]).ok();
}

/// Called after loading a file to apply sane defaults.
pub fn configure_for_playback(shared: &SharedMpv) {
    if let Ok(guard) = shared.lock() {
        let mpv = &guard.0;
        mpv.set_property("keep-open", true).ok();
        mpv.set_property("hwdec", "auto").ok();
    }
}
