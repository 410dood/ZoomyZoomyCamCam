//! zoomy — the ZoomyZoomyCamCam core service.
//!
//! One binary that:
//!   - serves the web UI and JSON API (Axum)
//!   - owns the camera registry / events / recordings index (SQLite)
//!   - supervises go2rtc (ingest + WebRTC) as a child process
//!   - runs continuous packet-copy recording with retention (ffmpeg)
//!   - runs the motion-gated AI detection pipeline (ONNX Runtime)

mod api;
mod db;
mod go2rtc;
mod pipeline;
mod record;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use clap::Parser;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Parser, Debug)]
#[command(name = "zoomy", version, about)]
struct Args {
    /// Port for the web UI / API.
    #[arg(long, default_value_t = 8080)]
    port: u16,

    /// Where the database, recordings and snapshots live.
    #[arg(long, default_value = "data")]
    data_dir: PathBuf,

    /// Built web UI to serve (Vite build output).
    #[arg(long, default_value = "web/dist")]
    ui_dir: PathBuf,

    /// Path to the go2rtc binary. Falls back to ./bin, then PATH.
    #[arg(long, env = "GO2RTC_BIN")]
    go2rtc_bin: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,zoomy=info".into()),
        )
        .init();
    let args = Args::parse();

    let db = db::Db::open(&args.data_dir.join("zoomy.db")).context("opening database")?;
    let settings = db.settings();
    db.save_settings(&settings)?; // persist defaults on first run

    let go2rtc = Arc::new(go2rtc::Go2Rtc::new(
        args.go2rtc_bin.as_deref(),
        args.data_dir.join("go2rtc.yaml"),
        settings.go2rtc_api_port,
    )?);
    go2rtc.restart_with(&db).context("starting go2rtc")?;

    let shutdown = Arc::new(AtomicBool::new(false));
    let snapshots_dir = args.data_dir.join("snapshots");
    let recordings_dir = args.data_dir.join("recordings");

    // Recording manager + detection pipeline run on their own threads (both
    // drive blocking child processes / inference).
    let rec_thread = std::thread::Builder::new().name("recorder".into()).spawn({
        let (db, go2rtc, dir, stop) = (
            db.clone(),
            go2rtc.clone(),
            recordings_dir.clone(),
            shutdown.clone(),
        );
        move || record::run(db, go2rtc, dir, stop)
    })?;
    let det_thread = std::thread::Builder::new().name("detector".into()).spawn({
        let (db, go2rtc, dir, stop) = (
            db.clone(),
            go2rtc.clone(),
            snapshots_dir.clone(),
            shutdown.clone(),
        );
        move || pipeline::run(db, go2rtc, dir, stop)
    })?;

    // go2rtc watchdog.
    tokio::spawn({
        let (db, go2rtc, stop) = (db.clone(), go2rtc.clone(), shutdown.clone());
        async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                tick.tick().await;
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                if let Err(e) = go2rtc.ensure_alive(&db) {
                    tracing::warn!("go2rtc watchdog: {e:#}");
                }
            }
        }
    });

    // API + static web UI (SPA fallback to index.html).
    let state = api::AppState {
        db: db.clone(),
        go2rtc: go2rtc.clone(),
        snapshots_dir,
    };
    let ui = ServeDir::new(&args.ui_dir)
        .not_found_service(ServeFile::new(args.ui_dir.join("index.html")));
    let app = api::router(state).fallback_service(ui);

    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("binding {addr}"))?;

    println!();
    println!("  ZoomyZoomyCamCam is running");
    println!("      Web UI:   http://localhost:{}/", args.port);
    println!("      API:      http://localhost:{}/api/health", args.port);
    println!("      go2rtc:   {}/", go2rtc.api_base());
    println!("  Press Ctrl+C to stop.");
    println!();

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            tracing::info!("shutting down");
        })
        .await?;

    // Orderly teardown: stop workers (they finalize ffmpeg segments), then go2rtc.
    shutdown.store(true, Ordering::Relaxed);
    let _ = tokio::task::spawn_blocking(move || {
        let _ = rec_thread.join();
        let _ = det_thread.join();
    })
    .await;
    go2rtc.stop();
    Ok(())
}
