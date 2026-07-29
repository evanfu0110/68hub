#[cfg(not(any(target_os = "windows", target_os = "android")))]
compile_error!("68HUB supports Windows and Android only");

mod commands;
mod database;
mod error;
mod models;
mod opencode;
mod proxy;
#[cfg(any(target_os = "android", test))]
#[allow(dead_code)]
mod secret_file;
mod secrets;
mod sync;

use std::sync::Arc;

use commands::AppState;
use database::Database;
use sync::SyncManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.plugin(
            tauri_plugin_keyring_store::Builder::new()
                .service("com.hub68.v2.credentials")
                .build(),
        );
    }

    builder
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let database = Database::open(&data_dir.join("68hub-v2.db"))
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            app.manage(AppState {
                database: Arc::new(database),
                sync: Arc::new(SyncManager::default()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::list_accounts,
            commands::create_account,
            commands::update_account,
            commands::delete_account,
            commands::test_account,
            commands::get_dashboard,
            commands::sync_usage,
            commands::get_sync_progress,
            commands::get_usage,
            commands::get_daily_stats,
            commands::get_daily_model_stats,
            commands::get_model_stats,
            commands::get_settings,
            commands::update_settings,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build 68HUB")
        .run(|app, event| {
            let exit_requested = matches!(&event, tauri::RunEvent::ExitRequested { .. });
            #[cfg(target_os = "android")]
            let app_suspended = matches!(
                &event,
                tauri::RunEvent::WindowEvent {
                    event: tauri::WindowEvent::Suspended,
                    ..
                }
            );
            #[cfg(not(target_os = "android"))]
            let app_suspended = false;

            if exit_requested || app_suspended {
                if let Some(state) = app.try_state::<AppState>() {
                    state.sync.cancel_all();
                }
            }
        });
}
