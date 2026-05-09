// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Add the resources directory to the DLL search path so Windows can find
    // libmpv-2.dll, which Tauri bundles into {install_dir}\resources\ rather
    // than {install_dir}\ where the EXE lives.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let resources = dir.join("resources");
                let wide: Vec<u16> = resources.as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                unsafe {
                    windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW(wide.as_ptr());
                }
            }
        }
    }

    cassette_lib::run()
}
