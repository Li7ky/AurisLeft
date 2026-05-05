use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::models::{PlaybackState, Quality, Song};
use crate::core::audio::PlaybackProgress;

#[derive(Debug, Clone, Serialize)]
pub struct PlaybackStateChanged {
    pub state: String,
    pub song: Option<Song>,
    pub quality: Option<Quality>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceUpdateState {
    pub source_id: String,
    pub name: String,
    pub loaded: bool,
    pub error: Option<String>,
}

pub struct EventBridge;

impl EventBridge {
    pub fn emit_playback_state(app: &AppHandle, state: &PlaybackState) {
        let state_str = match state {
            PlaybackState::Idle => "idle",
            PlaybackState::Loading => "loading",
            PlaybackState::Playing => "playing",
            PlaybackState::Paused => "paused",
            PlaybackState::Error(_) => "error",
        };

        app.emit("playback-state", state_str).ok();
    }

    pub fn emit_progress(app: &AppHandle, progress: &PlaybackProgress) {
        app.emit("playback-progress", progress).ok();
    }

    pub fn emit_playback_ended(app: &AppHandle) {
        app.emit("playback-ended", ()).ok();
    }

    pub fn emit_song_changed(app: &AppHandle, song: Option<&Song>, quality: Option<&Quality>) {
        let payload = PlaybackStateChanged {
            state: "playing".to_string(),
            song: song.cloned(),
            quality: quality.cloned(),
        };
        app.emit("song-changed", &payload).ok();
    }

    pub fn emit_source_loaded(app: &AppHandle, source_id: &str, name: &str) {
        let payload = SourceUpdateState {
            source_id: source_id.to_string(),
            name: name.to_string(),
            loaded: true,
            error: None,
        };
        app.emit("source-updated", &payload).ok();
    }

    pub fn emit_source_error(app: &AppHandle, source_id: &str, name: &str, error: &str) {
        let payload = SourceUpdateState {
            source_id: source_id.to_string(),
            name: name.to_string(),
            loaded: false,
            error: Some(error.to_string()),
        };
        app.emit("source-updated", &payload).ok();
    }
}
