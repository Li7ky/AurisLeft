use crate::core::error::Result;
use crate::models::{Lyric, LyricLine, LyricMetadata};

/// Parses LRC-format lyric content and provides time-based line lookup
pub struct LyricParser;

impl LyricParser {
    /// Parse LRC content into structured lyrics
    pub fn parse_lrc(content: &str) -> Result<Lyric> {
        let mut lines = Vec::new();
        let mut metadata = LyricMetadata {
            title: None,
            artist: None,
            album: None,
            by: None,
        };

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Parse metadata tags: [ti:...], [ar:...], [al:...], [by:...]
            if let Some(meta_content) = line.strip_prefix("[ti:").and_then(|s| s.strip_suffix(']'))
            {
                metadata.title = Some(meta_content.to_string());
                continue;
            }
            if let Some(meta_content) = line.strip_prefix("[ar:").and_then(|s| s.strip_suffix(']'))
            {
                metadata.artist = Some(meta_content.to_string());
                continue;
            }
            if let Some(meta_content) = line.strip_prefix("[al:").and_then(|s| s.strip_suffix(']'))
            {
                metadata.album = Some(meta_content.to_string());
                continue;
            }
            if let Some(meta_content) = line.strip_prefix("[by:").and_then(|s| s.strip_suffix(']'))
            {
                metadata.by = Some(meta_content.to_string());
                continue;
            }

            // Extract all [mm:ss.xx] timestamps from this line
            let mut timestamps = Vec::new();
            let mut text_start = 0;

            let chars: Vec<char> = line.chars().collect();
            let mut i = 0;
            let mut found_ts = false;

            while i < chars.len() {
                if chars[i] == '[' {
                    if let Some(end) = chars[i..].iter().position(|&c| c == ']') {
                        let ts_str: String = chars[i + 1..i + end].iter().collect();
                        if let Some(time) = parse_timestamp(&ts_str) {
                            timestamps.push(time);
                            found_ts = true;
                        }
                        i += end + 1;
                        text_start = i;
                    } else {
                        i += 1;
                    }
                } else {
                    i += 1;
                }
            }

            if !found_ts {
                continue;
            }

            if timestamps.len() == 1 && text_start == 0 {
                i = 0;
                found_ts = false;
                while i < chars.len() {
                    if chars[i] == '[' {
                        if let Some(end) = chars[i..].iter().position(|&c| c == ']') {
                            let inner: String = chars[i + 1..i + end].iter().collect();
                            if let Some(time) = parse_timestamp(&inner) {
                                timestamps.clear();
                                timestamps.push(time);
                                found_ts = true;
                            }
                            i += end + 1;
                            text_start = i;
                        } else {
                            i += 1;
                        }
                    } else {
                        i += 1;
                    }
                }
                if found_ts {
                    let text: String = chars[text_start..].iter().collect();
                    let text = text.trim().to_string();
                    for ts in &timestamps {
                        lines.push(LyricLine {
                            time: *ts,
                            text: text.clone(),
                        });
                    }
                    continue;
                }
            }

            let text: String = chars[text_start..].iter().collect();
            let text = text.trim().to_string();

            for ts in &timestamps {
                lines.push(LyricLine {
                    time: *ts,
                    text: text.clone(),
                });
            }
        }

        lines.sort_by(|a, b| {
            a.time
                .partial_cmp(&b.time)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(Lyric {
            lines,
            metadata: if metadata.title.is_some()
                || metadata.artist.is_some()
                || metadata.album.is_some()
                || metadata.by.is_some()
            {
                Some(metadata)
            } else {
                None
            },
        })
    }

    /// Find the index of the lyric line that corresponds to the given playback time
    pub fn find_current_line(lines: &[LyricLine], current_time_secs: f64) -> Option<usize> {
        if lines.is_empty() {
            return None;
        }

        let mut left = 0;
        let mut right = lines.len();

        while left < right {
            let mid = left + (right - left) / 2;
            if lines[mid].time <= current_time_secs {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        if left == 0 {
            return None;
        }

        Some(left - 1)
    }
}

fn parse_timestamp(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return None;
    }

    let minutes: f64 = parts[0].parse().ok()?;
    let seconds: f64 = parts[1].parse().ok()?;

    Some(minutes * 60.0 + seconds)
}
