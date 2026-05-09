use torrent_name_parser::Metadata;

#[derive(Debug, Clone)]
pub struct ParsedFile {
    pub title: String,
    pub year: Option<i64>,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub resolution: Option<String>,
    pub is_episode: bool,
    pub needs_review: bool,
}

pub fn parse_filename(filename: &str) -> ParsedFile {
    // Strip extension
    let stem = std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    let Ok(meta) = Metadata::from(stem) else {
        return ParsedFile {
            title: String::new(),
            year: None,
            season: None,
            episode: None,
            resolution: None,
            is_episode: false,
            needs_review: true,
        };
    };

    let title = normalize_title(meta.title());
    let year = meta.year().map(|y| y as i64);
    let season = meta.season().map(|s| s as i64);
    let episode = meta.episode().map(|e| e as i64);
    let resolution = normalize_resolution(meta.resolution());
    let is_episode = season.is_some() && episode.is_some();

    // Mark needs_review if we can't determine what this is
    let needs_review = title.is_empty() || (!is_episode && year.is_none());

    ParsedFile {
        title,
        year,
        season,
        episode,
        resolution,
        is_episode,
        needs_review,
    }
}

fn normalize_title(raw: &str) -> String {
    // Replace dots and underscores with spaces, trim
    let spaced = raw.replace('.', " ").replace('_', " ");
    let trimmed = spaced.trim();
    // Capitalize first letter of each word (simple pass)
    trimmed
        .split_whitespace()
        .map(capitalize_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn normalize_resolution(raw: Option<&str>) -> Option<String> {
    let r = raw?;
    let lower = r.to_lowercase();
    for known in &["2160p", "1080p", "720p", "480p"] {
        if lower.contains(known) {
            return Some(known.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_episode() {
        let p = parse_filename("Severance.S02E04.2160p.HDR.WEB-DL.H265.mkv");
        assert_eq!(p.title, "Severance");
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, Some(4));
        assert_eq!(p.resolution, Some("2160p".into()));
        assert!(p.is_episode);
    }

    #[test]
    fn parses_film() {
        let p = parse_filename("Blade Runner 2049 (2017) [4K HDR].mkv");
        assert!(!p.is_episode);
        assert_eq!(p.year, Some(2017));
    }

    #[test]
    fn parses_lowercase_episode() {
        let p = parse_filename("the.bear.s03e02.1080p.amzn.web-dl.mkv");
        assert_eq!(p.season, Some(3));
        assert_eq!(p.episode, Some(2));
        assert_eq!(p.resolution, Some("1080p".into()));
    }
}
