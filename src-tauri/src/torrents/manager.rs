use std::path::PathBuf;
use std::sync::Arc;
use librqbit::{
    AddTorrent, AddTorrentOptions, AddTorrentResponse, Session,
    Api, api::TorrentIdOrHash,
};
use crate::torrents::state::{TorrentInfo, TorrentState};

pub type TorrentId = usize;

pub enum TorrentSource {
    Magnet(String),
    FileBytes(Vec<u8>),
}

pub async fn add_torrent(
    session: &Arc<Session>,
    source: TorrentSource,
    download_dir: PathBuf,
) -> anyhow::Result<(TorrentId, String)> {
    let add = match source {
        TorrentSource::Magnet(m) => AddTorrent::from_url(m),
        TorrentSource::FileBytes(b) => AddTorrent::from_bytes(b),
    };
    let opts = AddTorrentOptions {
        output_folder: Some(download_dir.to_string_lossy().to_string()),
        ..Default::default()
    };
    let response = session.add_torrent(add, Some(opts)).await?;
    match response {
        AddTorrentResponse::Added(id, handle) => {
            let name = handle.name().unwrap_or_else(|| format!("torrent-{id}"));
            Ok((id, name))
        }
        AddTorrentResponse::AlreadyManaged(id, handle) => {
            let name = handle.name().unwrap_or_else(|| format!("torrent-{id}"));
            Ok((id, name))
        }
        AddTorrentResponse::ListOnly(_) => anyhow::bail!("unexpected ListOnly response"),
    }
}

pub async fn pause_torrent(session: &Arc<Session>, id: TorrentId) -> anyhow::Result<()> {
    let handle = session.get(TorrentIdOrHash::Id(id))
        .ok_or_else(|| anyhow::anyhow!("torrent {id} not found"))?;
    session.pause(&handle).await
}

pub async fn resume_torrent(session: &Arc<Session>, id: TorrentId) -> anyhow::Result<()> {
    let handle = session.get(TorrentIdOrHash::Id(id))
        .ok_or_else(|| anyhow::anyhow!("torrent {id} not found"))?;
    session.unpause(&handle).await
}

pub async fn remove_torrent(
    session: &Arc<Session>,
    id: TorrentId,
    delete_files: bool,
) -> anyhow::Result<()> {
    session.delete(TorrentIdOrHash::Id(id), delete_files).await
}

pub fn get_file_paths(session: &Arc<Session>, id: TorrentId) -> Vec<String> {
    let api = Api::new(Arc::clone(session), None);
    match api.api_torrent_details(TorrentIdOrHash::Id(id)) {
        Ok(details) => {
            let output_folder = &details.output_folder;
            match details.files {
                Some(files) => files.iter().map(|f| {
                    let mut path = PathBuf::from(output_folder);
                    for component in &f.components {
                        path.push(component);
                    }
                    path.to_string_lossy().to_string()
                }).collect(),
                None => vec![],
            }
        }
        Err(_) => vec![],
    }
}

pub fn get_torrent_info(session: &Arc<Session>, id: TorrentId) -> Option<TorrentInfo> {
    let handle = session.get(TorrentIdOrHash::Id(id))?;
    let stats = handle.stats();
    let name = handle.name().unwrap_or_else(|| format!("torrent-{id}"));

    let total = stats.total_bytes;
    let downloaded = stats.progress_bytes;
    let progress_pct = if total > 0 {
        (downloaded as f32 / total as f32) * 100.0
    } else {
        0.0
    };

    let live = stats.live.as_ref();
    let down_speed_kbps = live
        .map(|l| (l.download_speed.mbps * 1000.0 / 8.0) as u64)
        .unwrap_or(0);
    let up_speed_kbps = live
        .map(|l| (l.upload_speed.mbps * 1000.0 / 8.0) as u64)
        .unwrap_or(0);
    let peers = live
        .map(|l| l.snapshot.peer_stats.live as u32)
        .unwrap_or(0);

    let eta_seconds = live.and_then(|l| {
        if l.download_speed.mbps > 0.0 {
            let remaining = total.saturating_sub(downloaded);
            let bytes_per_sec = l.download_speed.mbps * 1_000_000.0 / 8.0;
            Some((remaining as f64 / bytes_per_sec) as u64)
        } else {
            None
        }
    });

    let state = if stats.error.is_some() {
        TorrentState::Error
    } else if stats.finished {
        TorrentState::Complete
    } else if handle.is_paused() {
        TorrentState::Paused
    } else {
        TorrentState::Downloading
    };

    let file_paths = get_file_paths(session, id);

    Some(TorrentInfo {
        id: id as u64,
        name,
        state,
        progress_pct,
        down_speed_kbps,
        up_speed_kbps,
        peers,
        eta_seconds,
        size_bytes: total,
        downloaded_bytes: downloaded,
        error_message: stats.error.clone(),
        file_paths,
    })
}

pub fn list_torrents(session: &Arc<Session>) -> Vec<TorrentInfo> {
    session.with_torrents(|iter| {
        iter.filter_map(|(id, _)| get_torrent_info(session, id))
            .collect()
    })
}

pub fn get_file_path(session: &Arc<Session>, id: TorrentId, file_index: usize) -> Option<String> {
    get_file_paths(session, id).into_iter().nth(file_index)
}
