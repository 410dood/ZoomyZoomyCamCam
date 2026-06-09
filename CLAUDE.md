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

## Current status: Phase 0 (spikes) — validated on Windows, 2026-06-09

Both spikes compile, lint clean, and run end-to-end on Windows 11:

- **spike-detect:** YOLOv8n via `ort` 2.0.0-rc.10 with the **DirectML** EP active —
  8.7 ms GPU vs 39.2 ms CPU (~4.5×) on bus.jpg, correct detections (4 person + bus).
  Required the `std` + `copy-dylibs` ort features (see Known gotchas).
- **spike-live:** go2rtc 1.9.14 launched as a child process; verified WebRTC playback
  in Chrome using a synthetic camera (`exec:ffmpeg -re -stream_loop -1 -i sample.mp4
  -c copy -rtsp_transport tcp -f rtsp {output}` as the stream source — handy when no
  real RTSP camera is on the network). A frame pulled from go2rtc's
  `/api/frame.jpeg?src=cam1` fed into spike-detect closes the loop camera → AI.

Remaining Phase 0 exit criteria: validate against a **real RTSP camera** and on
**macOS (CoreML)**. Everything else (core API, recorder, motion gate, detector
service) **is not built yet.** Do not assume those modules exist.

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
└── crates/
    ├── spike-live/    # Phase 0 spike 1: RTSP -> go2rtc -> WebRTC live view
    └── spike-detect/  # Phase 0 spike 2: YOLOv8 via ONNX Runtime, GPU per-OS
```

Each spike crate has its own README with run steps and success criteria.

## Build / run / test

```bash
# Build everything
cargo build

# Lint + format (CI should enforce these)
cargo clippy --all-targets -- -D warnings
cargo fmt --all

# Run spike 1 (needs the go2rtc binary on PATH or $GO2RTC_BIN; see crate README)
cargo run -p spike-live -- --rtsp "rtsp://user:pass@192.168.1.50:554/stream1"

# Run spike 2 (needs a yolov8n.onnx; export command in crates/spike-detect/README.md)
cargo run -p spike-detect -- --model yolov8n.onnx --image sample.jpg
```

There are no unit tests yet. When you add real logic (decode, NMS, retention,
storage indexing), add tests alongside it.

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

1. **Validate the spikes** — get both compiling and running against a real camera /
   image. This is Phase 0's exit criteria.
2. **Phase 1 — core skeleton:** new `crates/core` with an Axum API + SQLite store
   (camera registry, config), and a minimal web UI live grid driven by go2rtc.
3. **Phase 2 — recorder:** `crates/recorder` pulling go2rtc's RTSP restream,
   packet-copy to disk + SQLite index, retention.
4. **Phase 3 — motion gate**, then **Phase 4 — AI detector** wrapping the
   `spike-detect` logic into a service on motion ROIs.

When you start a new phase, update this file's status section.
