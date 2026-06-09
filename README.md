# ZoomyZoomyCamCam

A self-hosted, **cross-platform** (Windows + macOS + Linux) home surveillance / NVR
platform — think Blue Iris, but not chained to Windows, with Frigate-class AI object
detection that runs natively on Apple Silicon and any DirectX 12 GPU.

> Status: **Phase 0 — spikes.** We are de-risking the two hardest parts before
> building the real core. See [`docs/01-research-and-architecture.md`](docs/01-research-and-architecture.md)
> for the full survey, architecture, and roadmap.

## Why another NVR?

| Gap in the field | Our answer |
|---|---|
| Blue Iris is Windows-only | Rust core + web UI → runs everywhere |
| Frigate needs Linux/Docker + Coral/Nvidia | ONNX Runtime: DirectML on Windows, CoreML on Mac |
| Moonfire records but has no AI | We add the motion-gate + detector layer |

## Architecture at a glance

```
cameras ──RTSP──▶ go2rtc (ingest + WebRTC) ──▶ recorder (packets→disk)
                          │                  └─▶ motion gate ─▶ AI detector (ONNX/YOLO)
                          └──WebRTC──▶ web UI            └─▶ core API + SQLite (events/config)
```

The design deliberately reuses two battle-tested binaries — **go2rtc** (camera
protocols + WebRTC) and **FFmpeg** (codec edge cases) — and writes first-party Rust
for the recorder, motion gate, AI detector, and core API. AI is portable because the
same exported YOLO `.onnx` runs through ONNX Runtime with a per-OS GPU backend.

## Phase 0 spikes

Two programs that, between them, prove ~80% of the project is feasible:

- **[`crates/spike-live`](crates/spike-live)** — launches go2rtc against one real
  camera and gives you a live WebRTC view in the browser. Proves ingest → low-latency
  live viewing.
- **[`crates/spike-detect`](crates/spike-detect)** — runs a YOLOv8 model on an image
  via ONNX Runtime, auto-selecting the GPU backend for your OS (DirectML / CoreML /
  CUDA / CPU). Proves cross-platform accelerated AI.

Each crate has its own README with exact run steps.

## Prerequisites

- **Rust** (stable) — install via [rustup](https://rustup.rs).
- **go2rtc** binary — for the live spike. Download from
  [go2rtc releases](https://github.com/AlexxIT/go2rtc/releases) and either put it on
  your `PATH` or point `GO2RTC_BIN` at it. The spike will tell you if it can't find it.
- A **YOLOv8 ONNX model** — for the detect spike. See that crate's README for the
  one-line export command.

## Quick start

```bash
# Live view (replace with your camera's RTSP URL)
cargo run -p spike-live -- --rtsp "rtsp://user:pass@192.168.1.50:554/stream1"

# Object detection on a sample image
cargo run -p spike-detect -- --model yolov8n.onnx --image sample.jpg
```

## Layout

```
ZoomyZoomyCamCam/
├── Cargo.toml                # workspace
├── docs/                     # research, architecture, roadmap
├── config/                   # example go2rtc config
└── crates/
    ├── spike-live/           # Phase 0 spike 1
    └── spike-detect/         # Phase 0 spike 2
```

## License

Dual-licensed under MIT or Apache-2.0.
