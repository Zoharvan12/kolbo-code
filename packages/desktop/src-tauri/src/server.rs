use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::task::JoinHandle;

use crate::{
    cli,
    cli::CommandChild,
    constants::{DEFAULT_SERVER_URL_KEY, SETTINGS_STORE, WSL_ENABLED_KEY},
};

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type, Debug, Default)]
pub struct WslConfig {
    pub enabled: bool,
}

#[tauri::command]
#[specta::specta]
pub fn get_default_server_url(app: AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    let value = store.get(DEFAULT_SERVER_URL_KEY);
    match value {
        Some(v) => Ok(v.as_str().map(String::from)),
        None => Ok(None),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn set_default_server_url(app: AppHandle, url: Option<String>) -> Result<(), String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    match url {
        Some(u) => {
            store.set(DEFAULT_SERVER_URL_KEY, serde_json::Value::String(u));
        }
        None => {
            store.delete(DEFAULT_SERVER_URL_KEY);
        }
    }

    store
        .save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_wsl_config(_app: AppHandle) -> Result<WslConfig, String> {
    // let store = app
    //     .store(SETTINGS_STORE)
    //     .map_err(|e| format!("Failed to open settings store: {}", e))?;

    // let enabled = store
    //     .get(WSL_ENABLED_KEY)
    //     .as_ref()
    //     .and_then(|v| v.as_bool())
    //     .unwrap_or(false);

    Ok(WslConfig { enabled: false })
}

#[tauri::command]
#[specta::specta]
pub fn set_wsl_config(app: AppHandle, config: WslConfig) -> Result<(), String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    store.set(WSL_ENABLED_KEY, serde_json::Value::Bool(config.enabled));

    store
        .save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    Ok(())
}

pub fn spawn_local_server(
    app: AppHandle,
    hostname: String,
    port: u32,
    password: String,
) -> (Arc<Mutex<Option<CommandChild>>>, HealthCheck) {
    let (child, exit) = cli::serve(&app, &hostname, port, &password);
    let child_arc: Arc<Mutex<Option<CommandChild>>> = Arc::new(Mutex::new(Some(child)));

    let url = format!("http://{hostname}:{port}");

    // Initial readiness probe — same semantics as before.
    let health_check = HealthCheck(tokio::spawn({
        let url = url.clone();
        let password = password.clone();
        async move {
            let timestamp = Instant::now();
            loop {
                tokio::time::sleep(Duration::from_millis(100)).await;
                if check_health(&url, Some(&password)).await {
                    tracing::info!(elapsed = ?timestamp.elapsed(), "Server ready");
                    return Ok::<(), String>(());
                }
            }
        }
    }));

    // Watchdog: respawns the sidecar if it crashes after becoming healthy.
    // `kill_sidecar` takes the child out of the Arc to indicate intentional shutdown;
    // if we see the Arc empty after a termination, we leave well enough alone.
    tokio::spawn({
        let app = app.clone();
        let child_arc = child_arc.clone();
        async move {
            let mut exit_rx = exit;
            loop {
                let payload = exit_rx.await;
                {
                    let guard = child_arc.lock().expect("child mutex poisoned");
                    if guard.is_none() {
                        tracing::info!("Sidecar shutdown was intentional; watchdog exiting");
                        return;
                    }
                }
                tracing::warn!(
                    payload = ?payload,
                    "Sidecar exited unexpectedly; respawning"
                );
                let _ = app.emit("sidecar:down", ());

                // Brief pause so we don't busy-loop if the sidecar crashes immediately.
                tokio::time::sleep(Duration::from_millis(500)).await;

                let (new_child, new_exit) = cli::serve(&app, &hostname, port, &password);
                {
                    let mut guard = child_arc.lock().expect("child mutex poisoned");
                    *guard = Some(new_child);
                }
                exit_rx = new_exit;

                // Wait up to 30s for the respawn to become healthy.
                let healthy = {
                    let timestamp = Instant::now();
                    loop {
                        if timestamp.elapsed() > Duration::from_secs(30) {
                            break false;
                        }
                        tokio::time::sleep(Duration::from_millis(200)).await;
                        if check_health(&url, Some(&password)).await {
                            break true;
                        }
                    }
                };
                if healthy {
                    tracing::info!("Sidecar respawned and healthy");
                    let _ = app.emit("sidecar:up", ());
                } else {
                    tracing::error!("Sidecar respawn did not become healthy within 30s");
                }
            }
        }
    });

    (child_arc, health_check)
}

pub struct HealthCheck(pub JoinHandle<Result<(), String>>);

async fn check_health(url: &str, password: Option<&str>) -> bool {
    let Ok(url) = reqwest::Url::parse(url) else {
        return false;
    };

    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(7));

    if url
        .host_str()
        .is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        })
    {
        // Some environments set proxy variables (HTTP_PROXY/HTTPS_PROXY/ALL_PROXY) without
        // excluding loopback. reqwest respects these by default, which can prevent the desktop
        // app from reaching its own local sidecar server.
        builder = builder.no_proxy();
    }

    let Ok(client) = builder.build() else {
        return false;
    };
    let Ok(health_url) = url.join("/global/health") else {
        return false;
    };

    let mut req = client.get(health_url);

    if let Some(password) = password {
        req = req.basic_auth("kodu", Some(password));
    }

    req.send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}
