# CLAUDE.md — ZoomyZoomyCamCam

Guidance for Claude Code (and any AI agent) working in this repository. Read this
first. For the full background, read `docs/01-research-and-architecture.md`.

## What we are building

A **self-hosted, cross-platform home surveillance / NVR platform** — Blue Iris-class
features, but not locked to Windows, with Frigate-class AI object detection that runs
natively on **Windows and macOS** (and Linux). Target users self-host on a home
machine or NAS.

The differentiator: Blue Iris is Windows-only; Frigate needs Linux/Docker plus
Coral/Nvidia. We combine **Moonfire-class efficient recording** with **portable
GPU-accelerated AI** so the same model runs on Apple Silicon and any DirectX 12 GPU.

## Current status: v0.1 vertical slice — Phases 1-4 working on Windows, 2026-06-09

The platform runs end-to-end behind one binary (`cargo run -p zoomy`) + web UI:

- **Phase 0 (spikes):** validated 2026-06-09 — DirectML EP active, 8.7 ms GPU vs
  39.2 ms CPU on bus.jpg; WebRTC playback verified in Chrome. Spike crates are kept
  as standalone validation tools.
- **Phase 1 (core):** `crates/core` — a library (`zoomy::run(ServerConfig,
  shutdown_rx)`) plus a thin CLI bin. Axum API + SQLite (cameras, events, segments,
  settings JSON blob), go2rtc supervised as a child with config generated from the
  registry + watchdog, React/TS web UI in `web/` (live grid via go2rtc stream.html
  iframes, events, recordings, cameras, settings).
- **Desktop app:** `crates/desktop` — Tauri 2 shell embedding the zoomy library
  in-process on port 18080; native window onto the same UI; NSIS installer via
  `npx @tauri-apps/cli build` (bundles web/dist, go2rtc.exe, yolov8n.onnx as
  resources; data goes to the per-user app-data dir). Debug builds deliberately
  use the workspace checkout (shared `data/`) — see comment in `resolve_config`.
- **Phase 2 (recorder):** `crates/recorder` — ffmpeg `-c copy -f segment` per camera
  off go2rtc's RTSP restream, strftime-named 60 s MP4 segments (faststart), SQLite
  index, retention by age + total bytes. Reconciliation loop self-heals dead ffmpeg.
- **Phase 3 (motion gate):** `crates/motion` — 64×64 grayscale diff, noise floor 25,
  changed-pixel fraction vs threshold.
- **Phase 4 (detector):** `crates/detector` (lib form of spike-detect) — one shared
  ONNX session; pipeline polls go2rtc `/api/frame.jpeg` ~1 fps per camera, motion
  gate → YOLO → label/conf filter → per-(camera,label) cooldown → event + annotated
  snapshot.

Verified E2E with synthetic cameras (panning bus video over `exec:ffmpeg` loop):
live WebRTC grid, person/bus events with red-box snapshots, segment recording +
browser playback. A static camera correctly produces zero events (gate works).

Not yet validated: real RTSP camera hardware, macOS (CoreML), Linux (CUDA).
Known soft spots: go2rtc restart on camera CRUD briefly drops live streams; frame
sampling needs camera keyframe interval ≲ a few seconds (real cameras: fine; demo
videos need `-g`), recordings have no audio yet (`-an`).

```
cameras ──RTSP──▶ go2rtc (ingest + WebRTC) ──▶ recorder (packets→disk)   [Phase 2]
                          │                  └─▶ motion gate              [Phase 3]
                          │                       └─▶ AI detector (ONNX)  [Phase 4]
                          └──WebRTC──▶ web UI                             [Phase 1]
                                       core API + SQLite (config/events)  [Phase 1+]
```

## Architecture decisions (don't relitigate without reason)

- **Language:** Rust for the core/services; TypeScript/React for the web UI (future).
- **Reuse, don't rebuild, two binaries:** `go2rtc` handles all camera protocols +
  WebRTC; `FFmpeg` handles codec edge cases. We supervise them as child processes.
  Do NOT write our own RTSP/WebRTC stack. For in-process RTSP later, use the
  **Retina** crate (what Moonfire uses).
- **Recording model:** copy packets to disk WITHOUT decoding (Moonfire's approach) —
  cheap and lossless. Video segments on disk, metadata/index in SQLite.
- **Two-stage detection:** a cheap motion/pixel-diff pass on the low-res sub-stream
  gates expensive AI, which runs YOLO only on cropped motion regions. Never run the
  model on every frame of every camera.
- **AI portability via ONNX Runtime (`ort` crate):** one exported `.onnx`, with a
  per-OS execution provider chosen at runtime — DirectML (Windows), CoreML (macOS),
  CUDA (Linux), CPU fallback. This is the whole cross-platform AI thesis.

## Repository layout

```
ZoomyZoomyCamCam/
├── Cargo.toml                 # workspace (resolver 2); shared dep versions
├── rust-toolchain.toml        # pinned stable + clippy/rustfmt
├── CLAUDE.md                  # this file
├── README.md
├── docs/01-research-and-architecture.md   # field survey, architecture, roadmap
├── config/go2rtc.example.yaml             # reference multi-camera config
├── web/                       # React + TypeScript UI (Vite); build -> web/dist
└── crates/
    ├── core/          # zoomy lib (+ CLI bin): Axum API + SQLite + supervisors + pipeline
    ├── desktop/       # Tauri 2 desktop app embedding the zoomy lib (port 18080)
    ├── detector/      # lib: YOLOv8 via ONNX Runtime, per-OS GPU EP
    ├── motion/        # lib: pixel-diff motion gate
    ├── recorder/      # lib: ffmpeg packet-copy segments + retention
    ├── spike-live/    # Phase 0 spike 1 (kept as standalone validation)
    └── spike-detect/  # Phase 0 spike 2 (kept as standalone validation)
```

Runtime state lives in `data/` (gitignored): `zoomy.db`, `go2rtc.yaml` (generated),
`recordings/{camera}/`, `snapshots/`.

## Build / run / test

```bash
# Build everything
cargo build

# Tests (db, motion gate, NMS/decode, segment scan/retention)
cargo test

# Lint + format (CI should enforce these)
cargo clippy --all-targets -- -D warnings
cargo fmt --all

# Web UI (one-time, or after changing web/)
cd web && npm install && npm run build

# Run the platform headless: http://localhost:8080 (needs bin/go2rtc.exe,
# ffmpeg on PATH, yolov8n.onnx in repo root — see README prerequisites)
cargo run -p zoomy

# Run the desktop app (same engine, native window, port 18080)
cargo run -p zoomy-desktop

# Build the Windows installer (target/release/bundle/nsis/*.exe)
cd crates/desktop && npx @tauri-apps/cli build

# Spikes still run standalone (validation tools)
cargo run -p spike-live -- --rtsp "rtsp://user:pass@192.168.1.50:554/stream1"
cargo run -p spike-detect -- --model yolov8n.onnx --image sample.jpg
```

## Known gotchas

- **`ort` is pinned to `=2.0.0-rc.10`.** Its execution-provider API has churned
  across pre-1.0 releases; if you bump the version, re-check `build_session` in
  `crates/spike-detect/src/main.rs` against the new API and keep the per-OS
  feature flags in `crates/spike-detect/Cargo.toml` in sync. With
  `default-features = false`, the **`std` feature must be re-enabled explicitly**
  (it gates `commit_from_file` and the `std::error::Error` impl on `ort::Error`),
  and **`copy-dylibs`** is needed on Windows so `onnxruntime.dll` lands next to
  the exe. `ort::inputs![...]` returns a value, not a `Result`.
- **External binaries are not vendored.** `go2rtc` and model weights are downloaded
  by the user, not committed (see `.gitignore`). Don't commit binaries or `*.onnx`.
- **YOLOv8 output layout** is assumed to be `[1, 84, 8400]` (4 box + 80 COCO
  classes). YOLOv5/older exports differ and would need decode changes.

## Conventions

- Keep `cargo clippy` clean (`-D warnings`).
- Shared dependencies go in the workspace `[workspace.dependencies]`, referenced with
  `dep.workspace = true` — don't pin versions per-crate except the per-OS `ort`
  feature flags.
- Prefer `anyhow::Result` + `.context(...)` for application errors; reserve custom
  error types for library crates if/when we add them.
- New first-party services become their own crate under `crates/`.

## What to work on next (suggested order)

1. **Real-camera + cross-OS validation:** point the platform at real RTSP/ONVIF
   hardware; build and validate on macOS (CoreML) and Linux (CUDA).
2. **Live-view polish:** replace per-camera stream.html iframes with go2rtc's
   video-stream.js (or MSE) embedded directly; add streams via go2rtc's REST API
   instead of restarting the child on camera CRUD.
3. **Event/recording linkage:** click an event → jump to the recording at that
   timestamp; event-bracketed clip export.
4. **Detection quality:** run YOLO on motion ROIs (crops) instead of full frames;
   sub-stream support (detect on low-res, record high-res); audio in recordings.
5. **Ops:** auth for non-LAN exposure, packaging (installer/service), CI running
   fmt/clippy/test on the three OSes.

When you ship a meaningful chunk, update this file's status section.
