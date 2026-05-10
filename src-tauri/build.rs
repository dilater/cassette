use std::path::PathBuf;

fn main() {
    // Ensure windres.exe is findable. On machines where MinGW is installed but
    // not on the system PATH (CI, Claude Code, fresh dev setups), embed-resource
    // fails with "program not found". Probe common MSYS2/MinGW install locations
    // and prepend the first match to PATH so windres is reachable.
    ensure_windres_in_path();

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

    // Switch the final binary link step from MinGW ld (bfd) to lld.
    // MinGW ld returns exit code 53 (argument list too long / OOM) when
    // linking cassette because librqbit introduces hundreds of rlibs that push
    // the combined command beyond what ld can handle on Windows.
    //
    // The Rust toolchain ships a bundled ld.lld.exe in:
    //   <sysroot>/lib/rustlib/<target>/bin/gcc-ld/ld.lld.exe
    //
    // We emit two cargo:rustc-link-arg directives:
    //   -fuse-ld=lld  asks gcc to use lld instead of ld
    //   -B<gcc-ld>    tells gcc where to find ld.lld.exe
    use_bundled_lld();

    tauri_build::build()
}

fn use_bundled_lld() {
    let target = match std::env::var("TARGET") {
        Ok(t) => t,
        Err(_) => return,
    };
    // Only applies to Windows GNU (the target that uses MinGW ld).
    if !target.contains("windows-gnu") {
        return;
    }

    let rustc = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".to_string());
    let output = std::process::Command::new(&rustc)
        .args(["--print", "sysroot"])
        .output();

    let sysroot = match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => return,
    };

    let gcc_ld = PathBuf::from(&sysroot)
        .join("lib")
        .join("rustlib")
        .join(&target)
        .join("bin")
        .join("gcc-ld");

    if gcc_ld.join("ld.lld.exe").exists() {
        // Pass to gcc when it links the final binary.
        println!("cargo:rustc-link-arg=-fuse-ld=lld");
        println!("cargo:rustc-link-arg=-B{}", gcc_ld.display());
    }
}

fn ensure_windres_in_path() {
    // If windres is already findable, nothing to do.
    let path_env = std::env::var("PATH").unwrap_or_default();
    let already_findable = std::path::Path::new("windres.exe").exists()
        || path_env.split(';').any(|dir| {
            std::path::Path::new(dir).join("windres.exe").exists()
        });
    if already_findable {
        return;
    }

    // Probe common MinGW/MSYS2 installation paths.
    let candidates = [
        r"C:\msys64\mingw64\bin",
        r"C:\msys64\ucrt64\bin",
        r"C:\msys2\mingw64\bin",
        r"C:\mingw64\bin",
        r"C:\mingw-w64\mingw64\bin",
        r"C:\Program Files\mingw-w64\x86_64-8.1.0-posix-seh-rt_v6-rev0\mingw64\bin",
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).join("windres.exe").exists() {
            let new_path = format!("{};{}", candidate, path_env);
            // SAFETY: single-threaded build script; no other threads reading PATH.
            unsafe { std::env::set_var("PATH", new_path); }
            return;
        }
    }
}
