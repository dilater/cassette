use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const API_BASE: &str = "https://api.trakt.tv";

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Convert a unix timestamp to `YYYY-MM-DDTHH:MM:SS.000Z` (UTC, no chrono dep).
pub fn unix_to_iso(ts: i64) -> String {
    let secs = ts.max(0) as u64;
    let days = secs / 86400;
    let rem = secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    let (year, month, day) = days_to_date(days);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.000Z")
}

/// Convert a unix timestamp to `YYYY-MM-DD` for Letterboxd CSV.
pub fn unix_to_date(ts: i64) -> String {
    let days = (ts.max(0) as u64) / 86400;
    let (y, m, d) = days_to_date(days);
    format!("{y:04}-{m:02}-{d:02}")
}

fn days_to_date(mut d: u64) -> (u64, u64, u64) {
    let mut year = 1970u64;
    loop {
        let yd = if is_leap(year) { 366 } else { 365 };
        if d < yd { break; }
        d -= yd;
        year += 1;
    }
    let months = if is_leap(year) {
        [31u64, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31u64, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for &ml in &months {
        if d < ml { break; }
        d -= ml;
        month += 1;
    }
    (year, month, d + 1)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

// ── token persistence ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TraktTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub username: Option<String>,
    pub last_synced: Option<i64>,
}

pub fn load_tokens(data_dir: &std::path::Path) -> Option<TraktTokens> {
    let text = std::fs::read_to_string(data_dir.join("trakt.json")).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save_tokens(data_dir: &std::path::Path, tokens: &TraktTokens) -> std::io::Result<()> {
    let text = serde_json::to_string_pretty(tokens)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(data_dir.join("trakt.json"), text)
}

// ── device auth ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_url: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Deserialize, Debug)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
}

#[derive(Deserialize, Debug)]
struct UserSettingsResponse {
    user: UserInfo,
}

#[derive(Deserialize, Debug)]
struct UserInfo {
    username: String,
}

pub async fn start_device_auth(client_id: &str) -> Result<DeviceCodeResponse, String> {
    let client = Client::new();
    let resp = client
        .post(format!("{API_BASE}/oauth/device/code"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "client_id": client_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Trakt error: {}", resp.status()));
    }
    resp.json::<DeviceCodeResponse>().await.map_err(|e| e.to_string())
}

/// Returns `Ok(Some(tokens))` on success, `Ok(None)` when still pending, `Err` on failure.
pub async fn poll_device_auth(
    device_code: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<Option<TraktTokens>, String> {
    let client = Client::new();
    let resp = client
        .post(format!("{API_BASE}/oauth/device/token"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "code": device_code,
            "client_id": client_id,
            "client_secret": client_secret
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    if status == 400 || status == 404 {
        return Ok(None); // authorization_pending
    }
    if status == 410 || status == 409 {
        return Err("Device code expired".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("Trakt auth error: {status}"));
    }

    let token: TokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    let expires_at = unix_now() + token.expires_in;
    let username = get_username(&token.access_token, client_id).await.ok();

    Ok(Some(TraktTokens {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at,
        username,
        last_synced: None,
    }))
}

async fn get_username(access_token: &str, client_id: &str) -> Result<String, String> {
    let client = Client::new();
    let resp = client
        .get(format!("{API_BASE}/users/settings"))
        .header("Authorization", format!("Bearer {access_token}"))
        .header("trakt-api-key", client_id)
        .header("trakt-api-version", "2")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let s: UserSettingsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(s.user.username)
}

// ── scrobble ─────────────────────────────────────────────────────────────────

pub async fn scrobble_stop(
    access_token: &str,
    client_id: &str,
    item: &crate::library::db::LibraryItem,
    progress_pct: f64,
) -> Result<(), String> {
    let client = Client::new();
    let body = if item.parsed_season.is_some() {
        let show_title = item
            .series_title
            .as_deref()
            .or(item.parsed_title.as_deref())
            .unwrap_or(&item.filename);
        serde_json::json!({
            "show": { "title": show_title },
            "episode": {
                "season": item.parsed_season,
                "number": item.parsed_episode
            },
            "progress": progress_pct
        })
    } else {
        serde_json::json!({
            "movie": {
                "title": item.parsed_title.as_deref().unwrap_or(&item.filename),
                "year": item.parsed_year
            },
            "progress": progress_pct
        })
    };

    let resp = client
        .post(format!("{API_BASE}/scrobble/stop"))
        .header("Authorization", format!("Bearer {access_token}"))
        .header("trakt-api-key", client_id)
        .header("trakt-api-version", "2")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let s = resp.status().as_u16();
    if s == 201 || s == 200 || s == 409 { Ok(()) } else { Err(format!("scrobble error: {s}")) }
}

// ── ratings ──────────────────────────────────────────────────────────────────

pub async fn push_rating(
    access_token: &str,
    client_id: &str,
    item: &crate::library::db::LibraryItem,
    rating: i64,
) -> Result<(), String> {
    let client = Client::new();
    let now_iso = unix_to_iso(unix_now());
    let body = if item.parsed_season.is_some() {
        let show_title = item
            .series_title
            .as_deref()
            .or(item.parsed_title.as_deref())
            .unwrap_or(&item.filename);
        serde_json::json!({
            "episodes": [{
                "rated_at": now_iso,
                "rating": rating,
                "title": show_title,
                "season": item.parsed_season,
                "number": item.parsed_episode
            }]
        })
    } else {
        serde_json::json!({
            "movies": [{
                "rated_at": now_iso,
                "rating": rating,
                "title": item.parsed_title.as_deref().unwrap_or(&item.filename),
                "year": item.parsed_year
            }]
        })
    };

    let resp = client
        .post(format!("{API_BASE}/sync/ratings"))
        .header("Authorization", format!("Bearer {access_token}"))
        .header("trakt-api-key", client_id)
        .header("trakt-api-version", "2")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() { Ok(()) } else { Err(format!("rating error: {}", resp.status())) }
}

// ── history sync ──────────────────────────────────────────────────────────────

pub struct WatchedItem {
    pub title: String,
    pub year: Option<i64>,
    pub watched_at_ts: Option<i64>,
}

pub async fn sync_watch_history(
    access_token: &str,
    client_id: &str,
    items: Vec<WatchedItem>,
) -> Result<u32, String> {
    if items.is_empty() { return Ok(0); }
    let client = Client::new();
    let movies: Vec<_> = items.iter().map(|i| {
        let watched_at = i.watched_at_ts.map(unix_to_iso)
            .unwrap_or_else(|| "released".to_string());
        serde_json::json!({ "title": i.title, "year": i.year, "watched_at": watched_at })
    }).collect();
    let count = movies.len() as u32;
    let resp = client
        .post(format!("{API_BASE}/sync/history"))
        .header("Authorization", format!("Bearer {access_token}"))
        .header("trakt-api-key", client_id)
        .header("trakt-api-version", "2")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "movies": movies }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() { Ok(count) } else { Err(format!("sync error: {}", resp.status())) }
}
