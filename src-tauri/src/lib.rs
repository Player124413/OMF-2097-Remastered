//! Desktop shell for One Must Fall 2097 Remastered: windows (WebView2 on Windows, WebKit on macOS and Linux) hosting
//! the Vite-built web game (index.html) and OMF Studio, the modding tool (studio.html). The program opens the game,
//! or Studio when it is started with `--studio` or its file is named like Studio (the release's Studio downloads are
//! this program under Studio's name: `OMF-Studio-….exe`, `OMF Studio.app`, `OMF-Studio-….AppImage`). The game opens
//! Studio in a second window (`open_studio`); both share the game's storage, so Studio installs mods straight into it.
//! Permissions are in `capabilities/default.json`; the frontend talks to Tauri through
//! `src/platform/desktop.ts`. LAN games (hosting, finding and joining them) are in `lan.rs`, reached through the
//! `lan_*` commands below (the game's `src/net/lan.ts`).

mod lan;

use std::sync::Arc;

use tauri::{Emitter, Manager, State};

#[cfg(not(mobile))]
use std::time::Duration;
#[cfg(not(mobile))]
use tauri::{webview::PageLoadEvent, WebviewUrl, WebviewWindowBuilder};

/// Show a window after this long even if the page never reports that it finished loading.
#[cfg(not(mobile))]
const SHOW_WINDOW_FALLBACK: Duration = Duration::from_secs(5);

/// WebView2's arguments: the same for every window (windows that share the storage must agree on them). Timers keep
/// their pace in a hidden window: a LAN game goes on while its window is minimized (src/main.ts, the hidden loop).
#[cfg(not(mobile))]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required \
   --disable-background-timer-throttling";

/// The kinds of file the game and Studio save: pictures, clips, replays and the game's own files (nothing that runs).
const SAVE_EXTENSIONS: &[&str] = &["png", "gif", "mp4", "webm", "rec", "omfmod", "omfbot", "omftrn", "zip", "json"];

/// Whether this start opens OMF Studio instead of the game: `--studio`, or the program's file is named like Studio.
/// The file is the one the player started: the AppImage itself on Linux (not the program unpacked from it), the `.app`
/// bundle on macOS (its program inside keeps the game's name).
#[cfg(not(mobile))]
fn studio_start() -> bool {
  // (args_os: an argument that is not valid Unicode must not stop the program)
  if std::env::args_os().skip(1).any(|a| a.eq_ignore_ascii_case("--studio")) {
    return true;
  }
  let named = |p: &std::path::Path| p.file_stem().is_some_and(|s| s.to_string_lossy().to_lowercase().contains("studio"));
  if let Some(image) = std::env::var_os("APPIMAGE") {
    return named(std::path::Path::new(&image));
  }
  let Ok(exe) = std::env::current_exe() else {
    return false;
  };
  if cfg!(target_os = "macos") {
    if let Some(app) = exe.ancestors().find(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("app"))) {
      return named(app);
    }
  }
  named(&exe)
}

/// Opens a window: the game ("main", index.html) or OMF Studio ("studio", studio.html). Created hidden and
/// shown once its page has loaded, so there is no white flash while WebView2 starts up.
#[cfg(not(mobile))]
fn open_window(app: &tauri::AppHandle, studio: bool) -> tauri::Result<tauri::WebviewWindow> {
  let (label, page, title, size) = if studio {
    ("studio", "studio.html", "OMF Studio", (1440.0, 900.0))
  } else {
    ("main", "index.html", "One Must Fall 2097 Remastered", (1280.0, 800.0))
  };
  if let Some(window) = app.get_webview_window(label) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    return Ok(window);
  }
  let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
    .title(title)
    .inner_size(size.0, size.1)
    .min_inner_size(640.0, 400.0)
    .resizable(true)
    .center()
    .prevent_overflow()
    .visible(false)
    .background_color(tauri::webview::Color(if studio { 4 } else { 0 }, if studio { 6 } else { 0 }, if studio { 26 } else { 0 }, 255))
    // (files dropped on the window reach the page: mods, music, pictures)
    .disable_drag_drop_handler()
    .additional_browser_args(BROWSER_ARGS)
    // (macOS 14 and later: WebKit would pause a page hidden for a while, a LAN game with it)
    .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
    .build()?;
  let handle = app.clone();
  let label = label.to_string();
  std::thread::spawn(move || {
    std::thread::sleep(SHOW_WINDOW_FALLBACK);
    if let Some(window) = handle.get_webview_window(&label) {
      let _ = window.show();
    }
  });
  #[cfg(windows)]
  if !cfg!(debug_assertions) {
    disable_browser_ui(&window);
  }
  Ok(window)
}

/// The languages the system is set to, most preferred first, as BCP 47 tags ("de-DE", "zh-Hans-CN"): on Windows the
/// display languages of the user's settings. The game speaks the first one it has unless the player chose a language
/// (src/i18n/i18n.ts).
#[tauri::command]
fn os_languages() -> Vec<String> {
  sys_locale::get_locales().collect()
}

/// Opens OMF Studio's window (or brings it to the front). Async: on Windows, building a window from a synchronous
/// command deadlocks (it runs on the main thread the window needs).
#[cfg(not(mobile))]
#[tauri::command]
async fn open_studio(app: tauri::AppHandle) -> Result<(), String> {
  open_window(&app, true).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Linux with NVIDIA's driver: WebKitGTK's DMA-BUF renderer can leave the window blank (unless the player chose).
  #[cfg(target_os = "linux")]
  if std::path::Path::new("/proc/driver/nvidia").exists() && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  }
  let builder = tauri::Builder::default();
  #[cfg(target_os = "macos")]
  let builder = builder.menu(mac_menu).on_menu_event(|app, event| {
    if event.id() == QUIT_MENU_ID {
      let windows = app.webview_windows();
      if windows.is_empty() {
        app.exit(0);
      }
      for window in windows.values() {
        let _ = window.close();
      }
    }
  });
  // Desktop windows are created hidden and shown once their page has loaded; Android owns one fullscreen activity.
  #[cfg(not(mobile))]
  let builder = builder.on_page_load(|webview, payload| {
    if payload.event() == PageLoadEvent::Finished {
      let _ = webview.window().show();
    }
  });
  let builder = builder.setup(|app| {
    app.manage(lan::Lan::new(Arc::new(GameEvents(app.handle().clone()))));
    // The Android activity creates its single `main` window from tauri.android.conf.json. Desktop keeps
    // its dynamic startup window so it can optionally launch OMF Studio instead of the game.
    #[cfg(not(mobile))]
    open_window(app.handle(), studio_start())?;
    Ok(())
  });
  #[cfg(not(mobile))]
  let builder = builder.invoke_handler(tauri::generate_handler![
    save_file,
    open_studio,
    os_languages,
    lan_info,
    lan_host,
    lan_unhost,
    lan_scan,
    lan_join,
    lan_send,
    lan_close
  ]);
  #[cfg(mobile)]
  let builder = builder.invoke_handler(tauri::generate_handler![
    save_file,
    os_languages,
    lan_info,
    lan_host,
    lan_unhost,
    lan_scan,
    lan_join,
    lan_send,
    lan_close
  ]);
  let started = builder.run(tauri::generate_context!());
  if let Err(e) = started {
    fatal(&e.to_string());
  }
}

/// The id of the macOS menu bar's Quit (mac_menu).
#[cfg(target_os = "macos")]
const QUIT_MENU_ID: &str = "quit";

/// macOS: Tauri's default menu bar (Services, Hide, the Edit menu text fields need for copy and paste, full screen...),
/// but its Quit closes the windows as their close buttons do, so OMF Studio saves its project first; the default Quit
/// ends the program on the spot. The program ends once its last window has closed.
#[cfg(target_os = "macos")]
fn mac_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
  use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
  let name = app.package_info().name.clone();
  let about = AboutMetadata { name: Some(name.clone()), version: Some(app.package_info().version.to_string()), ..Default::default() };
  let quit = MenuItem::with_id(app, QUIT_MENU_ID, format!("Quit {name}"), true, Some("Cmd+Q"))?;
  Menu::with_items(
    app,
    &[
      &Submenu::with_items(
        app,
        name.clone(),
        true,
        &[
          &PredefinedMenuItem::about(app, None, Some(about))?,
          &PredefinedMenuItem::separator(app)?,
          &PredefinedMenuItem::services(app, None)?,
          &PredefinedMenuItem::separator(app)?,
          &PredefinedMenuItem::hide(app, None)?,
          &PredefinedMenuItem::hide_others(app, None)?,
          &PredefinedMenuItem::separator(app)?,
          &quit,
        ],
      )?,
      &Submenu::with_items(app, "File", true, &[&PredefinedMenuItem::close_window(app, None)?])?,
      &Submenu::with_items(
        app,
        "Edit",
        true,
        &[
          &PredefinedMenuItem::undo(app, None)?,
          &PredefinedMenuItem::redo(app, None)?,
          &PredefinedMenuItem::separator(app)?,
          &PredefinedMenuItem::cut(app, None)?,
          &PredefinedMenuItem::copy(app, None)?,
          &PredefinedMenuItem::paste(app, None)?,
          &PredefinedMenuItem::select_all(app, None)?,
        ],
      )?,
      &Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?,
      &Submenu::with_items(
        app,
        "Window",
        true,
        &[
          &PredefinedMenuItem::minimize(app, None)?,
          &PredefinedMenuItem::maximize(app, None)?,
          &PredefinedMenuItem::separator(app)?,
          &PredefinedMenuItem::close_window(app, None)?,
        ],
      )?,
    ],
  )
}

/// The program could not start (no window could be made: on Windows, most likely no WebView2 Runtime). Says so in a
/// message box (a Windows program started from Explorer has no console to print to), then ends.
fn fatal(error: &str) -> ! {
  #[cfg(windows)]
  {
    #[link(name = "user32")]
    extern "system" {
      fn MessageBoxW(hwnd: *mut std::ffi::c_void, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let text = wide(&format!(
      "One Must Fall 2097 Remastered could not start.\n\n{error}\n\nIt needs the Microsoft Edge WebView2 Runtime, which Windows 10 and 11 normally have. If yours does not, install it from https://developer.microsoft.com/microsoft-edge/webview2/ and start the game again."
    ));
    let caption = wide("One Must Fall 2097 Remastered");
    // (MB_OK | MB_ICONERROR)
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10) };
  }
  eprintln!("One Must Fall 2097 Remastered could not start: {error}");
  std::process::exit(1);
}

/// LAN games' events, for the game's window: `lan:open` (a guest joined the hosted game), `lan:data` (a message),
/// `lan:close` (a connection ended).
struct GameEvents(tauri::AppHandle);

impl lan::LanEvents for GameEvents {
  fn opened(&self, id: u32, peer: String) {
    let _ = self.0.emit_to("main", "lan:open", serde_json::json!({ "id": id, "peer": peer }));
  }
  fn data(&self, id: u32, text: String) {
    let _ = self.0.emit_to("main", "lan:data", serde_json::json!({ "id": id, "text": text }));
  }
  fn closed(&self, id: u32, reason: String) {
    let _ = self.0.emit_to("main", "lan:close", serde_json::json!({ "id": id, "reason": reason }));
  }
}

/// This computer's user name and network addresses (the LAN page shows them).
#[tauri::command]
fn lan_info() -> lan::LanInfo {
  lan::info()
}

/// Hosts a LAN game under the player's name; returns the port it waits on. (Async, the work on a blocking thread:
/// re-hosting waits for the last hosting's threads.)
#[tauri::command]
async fn lan_host(lan: State<'_, Arc<lan::Lan>>, name: String, version: String) -> Result<u16, String> {
  let lan = lan.inner().clone();
  tauri::async_runtime::spawn_blocking(move || lan.host(&name, &version))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Stops hosting (a guest already playing stays connected).
#[tauri::command]
async fn lan_unhost(lan: State<'_, Arc<lan::Lan>>) -> Result<(), String> {
  let lan = lan.inner().clone();
  tauri::async_runtime::spawn_blocking(move || lan.unhost()).await.map_err(|e| e.to_string())
}

/// Looks for LAN games on the network (about a second).
#[tauri::command]
async fn lan_scan() -> Result<Vec<lan::LanGame>, String> {
  tauri::async_runtime::spawn_blocking(lan::scan).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

/// Joins the LAN game hosted at an address.
#[tauri::command]
async fn lan_join(lan: State<'_, Arc<lan::Lan>>, address: String) -> Result<lan::Joined, String> {
  let lan = lan.inner().clone();
  tauri::async_runtime::spawn_blocking(move || lan.join(&address))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Sends messages on a LAN connection (queued for its writer thread, in order: synchronous, so the game's calls are
/// taken in the order it makes them).
#[tauri::command]
fn lan_send(lan: State<'_, Arc<lan::Lan>>, id: u32, texts: Vec<String>) -> Result<(), String> {
  lan.send(id, texts)
}

/// Closes a LAN connection (what was sent goes out first).
#[tauri::command]
fn lan_close(lan: State<'_, Arc<lan::Lan>>, id: u32) {
  lan.close(id);
}

/// Saves a file the game hands over (a replay, a video or GIF clip) in the Downloads folder's OMF 2097
/// Remastered folder, adding a number when the name is taken. The request body is the file's bytes and
/// the `x-file-name` header its name (see `saveFile` in src/platform/files.ts); only the kinds of
/// file in `SAVE_EXTENSIONS`. Returns the path. Async, the writing on a blocking thread: a large
/// clip must not hold up the windows.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
  let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
    return Err("expected the file's bytes".into());
  };
  let name = request
    .headers()
    .get("x-file-name")
    .and_then(|v| v.to_str().ok())
    .map(safe_file_name)
    .filter(|n| !n.is_empty())
    .ok_or("missing file name")?;
  let allowed = std::path::Path::new(&name)
    .extension()
    .and_then(|e| e.to_str())
    .is_some_and(|e| SAVE_EXTENSIONS.iter().any(|x| x.eq_ignore_ascii_case(e)));
  if !allowed {
    return Err(format!("not a kind of file the game saves: {name}"));
  }
  // (Linux without the XDG user folders set up has no Downloads folder of record: ~/Downloads then)
  let downloads = app.path().download_dir().or_else(|_| app.path().home_dir().map(|home| home.join("Downloads")));
  let dir = downloads.map_err(|e| e.to_string())?.join("OMF 2097 Remastered");
  let data = data.clone();
  tauri::async_runtime::spawn_blocking(move || {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &name);
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Letters, digits, spaces, dots, dashes and underscores only (no paths), not starting with a dot
/// or a space.
fn safe_file_name(name: &str) -> String {
  let name: String = name
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
    .collect();
  name.trim_start_matches(['.', ' ']).trim_end().to_string()
}

/// `dir/name`, or `dir/name (2)`, `dir/name (3)`... when it exists.
fn free_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
  let path = dir.join(name);
  if !path.exists() {
    return path;
  }
  let (stem, ext) = match name.rfind('.') {
    Some(i) if i > 0 => (&name[..i], &name[i..]),
    _ => (name, ""),
  };
  (2..)
    .map(|n| dir.join(format!("{stem} ({n}){ext}")))
    .find(|p| !p.exists())
    .expect("a free file name")
}

/// Release builds: stop WebView2 from acting on browser shortcuts (F5/Ctrl+R reload, Ctrl+F/F3
/// find, Ctrl+P print, ...) and from showing its default context menu, so a keyboard-driven game
/// can't trigger them by accident. The page still receives every key and `contextmenu` event.
/// Dev builds keep both so DevTools stay reachable.
///
/// Tauri has no config switch for this, and the equivalent WebView2 *settings*
/// (AreBrowserAcceleratorKeysEnabled etc.) only apply from the next navigation, which is too late
/// for the game's single page load. The per-event hooks used here apply immediately.
/// `webview2-com`/`windows-core` in Cargo.toml must stay on the versions Tauri itself uses.
#[cfg(windows)]
fn disable_browser_ui(window: &tauri::WebviewWindow) {
  use webview2_com::{
    AcceleratorKeyPressedEventHandler, ContextMenuRequestedEventHandler,
    Microsoft::Web::WebView2::Win32::{ICoreWebView2AcceleratorKeyPressedEventArgs2, ICoreWebView2_11},
  };
  use windows_core::Interface;

  let _ = window.with_webview(|webview| unsafe {
    let controller = webview.controller();
    let mut token = 0;
    let _ = controller.add_AcceleratorKeyPressed(
      &AcceleratorKeyPressedEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args.and_then(|args| args.cast::<ICoreWebView2AcceleratorKeyPressedEventArgs2>().ok()) {
          args.SetIsBrowserAcceleratorKeyEnabled(false)?;
        }
        Ok(())
      })),
      &mut token,
    );
    if let Ok(core) = controller.CoreWebView2().and_then(|core| core.cast::<ICoreWebView2_11>()) {
      let _ = core.add_ContextMenuRequested(
        &ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
          if let Some(args) = args {
            args.SetHandled(true)?;
          }
          Ok(())
        })),
        &mut token,
      );
    }
  });
}
