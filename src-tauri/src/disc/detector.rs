pub struct DiscInfo {
    pub drive: String,
    pub label: String,
    pub size_bytes: u64,
}

#[cfg(target_os = "windows")]
pub fn scan_optical_drives() -> Vec<DiscInfo> {
    use windows_sys::Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetVolumeInformationW, DRIVE_CDROM,
    };

    let mut result = Vec::new();
    for code in b'A'..=b'Z' {
        let letter = code as char;
        // Null-terminated UTF-16 path "D:\\"
        let root: Vec<u16> = format!("{}:\\\0", letter).encode_utf16().collect();
        let drive_type = unsafe { GetDriveTypeW(root.as_ptr()) };
        if drive_type != DRIVE_CDROM {
            continue;
        }
        // Attempt to read volume info — fails if no media present
        let mut label_buf = [0u16; 256];
        let vol_ok = unsafe {
            GetVolumeInformationW(
                root.as_ptr(),
                label_buf.as_mut_ptr(),
                label_buf.len() as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
            )
        };
        if vol_ok == 0 {
            continue;
        }
        let end = label_buf.iter().position(|&c| c == 0).unwrap_or(label_buf.len());
        let label = String::from_utf16_lossy(&label_buf[..end]);

        let mut total: u64 = 0;
        let mut free_caller: u64 = 0;
        let mut free: u64 = 0;
        unsafe {
            GetDiskFreeSpaceExW(root.as_ptr(), &mut free_caller, &mut total, &mut free);
        }

        result.push(DiscInfo {
            drive: format!("{}:", letter),
            label: if label.is_empty() { "DISC".to_string() } else { label },
            size_bytes: total,
        });
    }
    result
}

#[cfg(not(target_os = "windows"))]
pub fn scan_optical_drives() -> Vec<DiscInfo> {
    vec![]
}
