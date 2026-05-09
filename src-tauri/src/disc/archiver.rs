use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

/// Reads a raw disc volume into an ISO file, reporting progress via callback.
/// `size_hint` is the expected byte count (for progress display only).
/// Returns Ok(()) on success, Err("Cancelled") on cancel, Err(msg) on I/O error.
pub async fn archive_disc(
    drive: String,
    output_path: String,
    size_hint: u64,
    cancel: Arc<AtomicBool>,
    on_progress: impl Fn(u64, u64, f32, u64) + Send + 'static,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        archive_blocking(&drive, &output_path, size_hint, cancel, on_progress)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn archive_blocking(
    drive: &str,
    output_path: &str,
    size_hint: u64,
    cancel: Arc<AtomicBool>,
    on_progress: impl Fn(u64, u64, f32, u64),
) -> Result<(), String> {
    use std::os::windows::fs::OpenOptionsExt;

    // Open the raw volume. FILE_SHARE_READ | FILE_SHARE_WRITE (0x3) lets Windows
    // keep its own handles to the disc while we read it.
    let mut src = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0x3)
        .open(format!(r"\\.\{}", drive))
        .map_err(|e| format!("Cannot open disc {drive}: {e}"))?;

    let mut dst = std::fs::File::create(output_path)
        .map_err(|e| format!("Cannot create output file: {e}"))?;

    const CHUNK: usize = 1024 * 1024; // 1 MB per read
    let mut buf = vec![0u8; CHUNK];
    let mut bytes_done: u64 = 0;
    let start = Instant::now();
    let mut last_cb = Instant::now();

    loop {
        if cancel.load(Ordering::Relaxed) {
            drop(dst);
            let _ = std::fs::remove_file(output_path);
            return Err("Cancelled".to_string());
        }

        let n = match src.read(&mut buf) {
            Ok(0) => break, // EOF — disc fully read
            Ok(n) => n,
            Err(e) => {
                drop(dst);
                let _ = std::fs::remove_file(output_path);
                return Err(format!("Read error: {e}"));
            }
        };

        if let Err(e) = dst.write_all(&buf[..n]) {
            drop(dst);
            let _ = std::fs::remove_file(output_path);
            return Err(format!("Write error: {e}"));
        }

        bytes_done += n as u64;

        if last_cb.elapsed().as_millis() >= 500 {
            let elapsed = start.elapsed().as_secs_f32().max(0.001);
            let speed_mbps = (bytes_done as f32 / elapsed) / (1024.0 * 1024.0);
            let total = size_hint.max(bytes_done);
            let remaining = total.saturating_sub(bytes_done);
            let eta = if speed_mbps > 0.0 {
                (remaining as f32 / (speed_mbps * 1024.0 * 1024.0)) as u64
            } else {
                0
            };
            on_progress(bytes_done, total, speed_mbps, eta);
            last_cb = Instant::now();
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn archive_blocking(
    _drive: &str,
    _output_path: &str,
    _size_hint: u64,
    _cancel: Arc<AtomicBool>,
    _on_progress: impl Fn(u64, u64, f32, u64),
) -> Result<(), String> {
    Err("Disc archiving is only supported on Windows".to_string())
}
