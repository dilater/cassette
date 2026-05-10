use std::time::Duration;

use windows_sys::Win32::Foundation::{HWND, RECT};
use windows_sys::Win32::Graphics::Gdi::{GetStockObject, BLACK_BRUSH};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleA;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetClientRect, RegisterClassW, SetWindowPos,
    CS_HREDRAW, CS_VREDRAW, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    WNDCLASSW, WS_CHILD, WS_VISIBLE,
};

use tauri::Emitter;
use super::SharedMpv;

unsafe extern "system" fn video_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// Create a borderless child window that mpv renders into via --wid.
pub fn create_video_child(parent: HWND, w: i32, h: i32) -> Result<HWND, String> {
    let class: Vec<u16> = "CassetteVideo\0".encode_utf16().collect();
    unsafe {
        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(video_wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: GetModuleHandleA(std::ptr::null()),
            hIcon: 0,
            hCursor: 0,
            hbrBackground: unsafe { GetStockObject(BLACK_BRUSH as i32) },
            lpszMenuName: std::ptr::null(),
            lpszClassName: class.as_ptr(),
        };
        RegisterClassW(&wc);

        let hwnd = CreateWindowExW(
            0,
            class.as_ptr(),
            std::ptr::null(),
            WS_CHILD | WS_VISIBLE,
            0, 0, w, h,
            parent,
            0,
            GetModuleHandleA(std::ptr::null()),
            std::ptr::null(),
        );
        if hwnd == 0 {
            return Err("CreateWindowExW failed".into());
        }
        // Behind the WebView2 sibling so the HTML overlay sits on top
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        Ok(hwnd)
    }
}

/// Resize the video child to match the parent client area.
pub fn resize_video_child(video_hwnd: HWND, parent_hwnd: HWND) {
    let mut rect: RECT = unsafe { std::mem::zeroed() };
    unsafe { GetClientRect(parent_hwnd, &mut rect) };
    unsafe {
        SetWindowPos(
            video_hwnd,
            HWND_BOTTOM,
            0, 0,
            rect.right - rect.left,
            rect.bottom - rect.top,
            SWP_NOACTIVATE,
        )
    };
}

/// Spawn a thread that emits playback state events every 250 ms.
/// Also applies any pending resume seek the first tick after a new file loads.
/// mpv renders directly to the HWND via the `wid` property — no GL needed here.
pub fn spawn_state_thread(shared_mpv: SharedMpv, pending_seek: super::SharedPendingSeek, app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("mpv-state".into())
        .spawn(move || {
            let mut prev_duration = 0.0_f64;
            loop {
                std::thread::sleep(Duration::from_millis(250));
                if let Ok(guard) = shared_mpv.try_lock() {
                    let mpv = &guard.0;
                    let dur = mpv.get_property::<f64>("duration").unwrap_or(0.0);

                    // New file just finished loading — apply resume seek if pending
                    if dur > 0.0 && prev_duration == 0.0 {
                        if let Ok(mut seek) = pending_seek.lock() {
                            if let Some(pos) = seek.take() {
                                let pos_str = format!("{pos}");
                                mpv.command("seek", &[pos_str.as_str(), "absolute"]).ok();
                            }
                        }
                    }
                    prev_duration = dur;

                    let paused = mpv.get_property::<bool>("pause").unwrap_or(true);
                    let pos = mpv.get_property::<f64>("time-pos").unwrap_or(0.0);
                    let state = super::PlaybackState {
                        paused,
                        position_seconds: pos,
                        duration_seconds: dur,
                    };
                    app.emit("playback:state", state).ok();
                }
            }
        })
        .expect("failed to spawn state thread");
}
