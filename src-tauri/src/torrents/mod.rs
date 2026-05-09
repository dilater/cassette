pub mod state;
pub mod manager;

use std::path::PathBuf;
use std::sync::Arc;
use librqbit::{Session, SessionOptions};

pub async fn start_session(download_dir: PathBuf) -> anyhow::Result<Arc<Session>> {
    std::fs::create_dir_all(&download_dir)?;
    let session = Session::new_with_opts(download_dir, SessionOptions::default()).await?;
    Ok(session)
}
