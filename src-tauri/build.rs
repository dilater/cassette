use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let lib_dir = manifest_dir.join("lib");

    // Tell cargo where to find libmpv.dll.a for the linker
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=mpv");
    println!("cargo:rerun-if-changed=lib/libmpv.dll.a");
    println!("cargo:rerun-if-changed=lib/libmpv-2.dll");

    // Copy libmpv-2.dll next to the output binary so it can be found at runtime
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // OUT_DIR is something like target/{profile}/build/cassette-.../out
    // Walk up to target/{profile}
    let profile_dir = out_dir
        .ancestors()
        .find(|p| {
            p.parent()
                .and_then(|pp| pp.file_name())
                .map(|n| n == "target")
                .unwrap_or(false)
        })
        .map(|p| p.to_path_buf());

    if let Some(dest_dir) = profile_dir {
        let src = lib_dir.join("libmpv-2.dll");
        let dst = dest_dir.join("libmpv-2.dll");
        if src.exists() && !dst.exists() {
            std::fs::copy(&src, &dst).ok();
        }
    }

    tauri_build::build()
}
