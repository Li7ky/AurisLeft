use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter,
};

pub fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let toggle_play = MenuItem::with_id(app, "toggle_play", "Play/Pause", true, None::<&str>)?;
    let next_track = MenuItem::with_id(app, "next_track", "Next", true, None::<&str>)?;
    let prev_track = MenuItem::with_id(app, "prev_track", "Previous", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&toggle_play, &next_track, &prev_track, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("AurisLeft")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "toggle_play" => {
                let _ = app.emit("hotkey-play-pause", ());
            }
            "next_track" => {
                let _ = app.emit("hotkey-next", ());
            }
            "prev_track" => {
                let _ = app.emit("hotkey-prev", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
