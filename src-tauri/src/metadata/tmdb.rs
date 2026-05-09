use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

const API_BASE: &str = "https://api.themoviedb.org/3";
const IMAGE_BASE_W500: &str = "https://image.tmdb.org/t/p/w500";
const IMAGE_BASE_W92: &str = "https://image.tmdb.org/t/p/w92";

// Legacy constant kept for fetch_poster
const IMAGE_BASE: &str = "https://image.tmdb.org/t/p/w500";

#[derive(Deserialize)]
struct SearchResponse {
    results: Vec<SearchItem>,
}

#[derive(Deserialize)]
struct SearchItem {
    id: i64,
    poster_path: Option<String>,
}

// ── multi-search ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TmdbSearchResult {
    pub tmdb_id: i64,
    pub title: String,
    pub year: Option<i64>,
    pub poster_url: Option<String>,  // w92 thumbnail URL for display in the frontend
    pub poster_path: Option<String>, // raw TMDb path like "/abc123.jpg" for backend download
    pub is_tv: bool,
}

#[derive(Deserialize)]
struct MultiSearchResponse {
    results: Vec<MultiSearchItem>,
}

#[derive(Deserialize)]
struct MultiSearchItem {
    id: i64,
    media_type: Option<String>,
    title: Option<String>,          // movies
    name: Option<String>,           // TV shows
    release_date: Option<String>,   // movies (YYYY-MM-DD)
    first_air_date: Option<String>, // TV shows
    poster_path: Option<String>,
}

pub async fn search_titles(query: &str, api_key: &str) -> Vec<TmdbSearchResult> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{API_BASE}/search/multi"))
        .query(&[
            ("api_key", api_key),
            ("query", query),
            ("language", "en-US"),
            ("include_adult", "false"),
        ])
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    let search: MultiSearchResponse = match resp.json().await {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    search
        .results
        .into_iter()
        .filter(|item| {
            matches!(
                item.media_type.as_deref(),
                Some("movie") | Some("tv")
            )
        })
        .map(|item| {
            let is_tv = item.media_type.as_deref() == Some("tv");
            let title = item
                .name
                .or(item.title)
                .unwrap_or_else(|| "Unknown".to_owned());

            // Extract year from date string "YYYY-MM-DD"
            let year = item
                .first_air_date
                .or(item.release_date)
                .as_deref()
                .and_then(|d| d.get(..4))
                .and_then(|y| y.parse::<i64>().ok());

            let poster_url = item
                .poster_path
                .as_deref()
                .map(|p| format!("{IMAGE_BASE_W92}{p}"));

            TmdbSearchResult {
                tmdb_id: item.id,
                title,
                year,
                poster_url,
                poster_path: item.poster_path,
                is_tv,
            }
        })
        .collect()
}

/// Downloads a w500 poster from TMDb and saves it to `dest`.
/// Returns true on success.
pub async fn download_poster(poster_path: &str, dest: &Path, client: &reqwest::Client) -> bool {
    let url = format!("{IMAGE_BASE_W500}{poster_path}");
    let bytes = match client.get(&url).send().await {
        Ok(r) => match r.bytes().await {
            Ok(b) => b,
            Err(_) => return false,
        },
        Err(_) => return false,
    };
    std::fs::write(dest, &bytes).is_ok()
}

/// Returns `(local_path, tmdb_id)` on success.
pub async fn fetch_poster(
    title: &str,
    year: Option<i64>,
    is_tv: bool,
    api_key: &str,
    cache_dir: &Path,
) -> Option<(PathBuf, i64)> {
    let client = reqwest::Client::new();

    let endpoint = if is_tv { "search/tv" } else { "search/movie" };
    let mut params: Vec<(&str, String)> = vec![
        ("api_key", api_key.to_string()),
        ("query", title.to_string()),
        ("language", "en-US".to_string()),
    ];
    if let Some(y) = year {
        let key = if is_tv { "first_air_date_year" } else { "primary_release_year" };
        params.push((key, y.to_string()));
    }

    let resp = client
        .get(format!("{API_BASE}/{endpoint}"))
        .query(&params)
        .send()
        .await
        .ok()?;

    let search: SearchResponse = resp.json().await.ok()?;

    // If year-filtered search returns nothing, retry without year constraint.
    let hit = if search.results.is_empty() && year.is_some() {
        let params_no_year: Vec<(&str, String)> = vec![
            ("api_key", api_key.to_string()),
            ("query", title.to_string()),
            ("language", "en-US".to_string()),
        ];
        let retry = client
            .get(format!("{API_BASE}/{endpoint}"))
            .query(&params_no_year)
            .send()
            .await
            .ok()?;
        let retry_search: SearchResponse = retry.json().await.ok()?;
        retry_search.results.into_iter().next()
    } else {
        search.results.into_iter().next()
    };
    let hit = hit?;
    let tmdb_id = hit.id;
    let poster_path = hit.poster_path.as_deref()?;

    let image_url = format!("{IMAGE_BASE}{poster_path}");
    let image_bytes = client.get(&image_url).send().await.ok()?.bytes().await.ok()?;

    let safe: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect();
    let year_part = year.map(|y| format!("_{y}")).unwrap_or_default();
    let dest = cache_dir.join(format!("{safe}{year_part}.jpg"));

    std::fs::write(&dest, &image_bytes).ok()?;
    Some((dest, tmdb_id))
}

#[derive(Deserialize)]
struct StillsResponse {
    stills: Vec<StillItem>,
}

#[derive(Deserialize)]
struct StillItem {
    file_path: String,
}

/// Downloads the episode still for a specific TV episode.
/// Returns the local cache path on success.
pub async fn fetch_episode_still(
    series_tmdb_id: i64,
    season: i64,
    episode: i64,
    api_key: &str,
    cache_dir: &Path,
) -> Option<PathBuf> {
    let client = reqwest::Client::new();
    let url = format!("{API_BASE}/tv/{series_tmdb_id}/season/{season}/episode/{episode}/images");
    let resp = client
        .get(&url)
        .query(&[("api_key", api_key)])
        .send()
        .await
        .ok()?;

    let stills: StillsResponse = resp.json().await.ok()?;
    let file_path = stills.stills.first().map(|s| s.file_path.as_str())?;

    let image_url = format!("https://image.tmdb.org/t/p/w300{file_path}");
    let image_bytes = client.get(&image_url).send().await.ok()?.bytes().await.ok()?;

    let dest = cache_dir.join(format!("still_{series_tmdb_id}_s{season}e{episode}.jpg"));
    std::fs::write(&dest, &image_bytes).ok()?;
    Some(dest)
}
