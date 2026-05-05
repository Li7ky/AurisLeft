use std::sync::mpsc;

use global_hotkey::{
    GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState,
};
use global_hotkey::hotkey::HotKey;
use global_hotkey::hotkey::{Code, Modifiers};

pub enum HotKeyAction {
    PlayPause,
    Next,
    Prev,
}

pub fn setup_hotkeys(
    _app: &tauri::App,
) -> Result<mpsc::Receiver<HotKeyAction>, String> {
    let manager = GlobalHotKeyManager::new().map_err(|e| {
        format!("Failed to init hotkey manager: {}", e)
    })?;

    let hk_play = HotKey::new(
        Some(Modifiers::empty()),
        Code::MediaPlayPause,
    );
    let hk_next = HotKey::new(
        Some(Modifiers::empty()),
        Code::MediaTrackNext,
    );
    let hk_prev = HotKey::new(
        Some(Modifiers::empty()),
        Code::MediaTrackPrevious,
    );

    let play_id = hk_play.id();
    let next_id = hk_next.id();
    let prev_id = hk_prev.id();

    manager.register_all(&[hk_play, hk_next, hk_prev]).map_err(|e| {
        format!("Failed to register hotkey: {}", e)
    })?;

    let (tx, rx) = mpsc::channel::<HotKeyAction>();

    std::thread::spawn(move || loop {
        match GlobalHotKeyEvent::receiver().recv() {
            Ok(event) => {
                if event.state() == HotKeyState::Pressed {
                    let action = if event.id() == play_id {
                        HotKeyAction::PlayPause
                    } else if event.id() == next_id {
                        HotKeyAction::Next
                    } else if event.id() == prev_id {
                        HotKeyAction::Prev
                    } else {
                        continue;
                    };

                    let _ = tx.send(action);
                }
            }
            Err(_) => break,
        }
    });

    Ok(rx)
}
