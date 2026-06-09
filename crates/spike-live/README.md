# spike-live — camera → WebRTC live view

**Goal:** prove that we can ingest a real camera's RTSP stream and view it live in
the browser with low latency, using go2rtc as the streaming gateway. This is the
foundation of Phase 1 (live viewing).

## What it does

1. Takes your camera's RTSP URL.
2. Generates `config/go2rtc.generated.yaml`.
3. Launches the `go2rtc` binary as a child process.
4. Opens a browser tab with the WebRTC live view.

## Prerequisites

- The **go2rtc** binary. Download from
  [go2rtc releases](https://github.com/AlexxIT/go2rtc/releases) for your OS, then
  either add it to your `PATH`, set `GO2RTC_BIN`, or drop it at `./bin/go2rtc`
  (`go2rtc.exe` on Windows).
- A camera (or test stream) that speaks RTSP. Most IP cameras expose a URL like
  `rtsp://user:pass@<ip>:554/stream1`. Check your camera's manual or use ONVIF
  Device Manager to find it.

## Run

```bash
cargo run -p spike-live -- --rtsp "rtsp://user:pass@192.168.1.50:554/stream1"
```

Useful flags:

| Flag | Default | Purpose |
|---|---|---|
| `--rtsp <URL>` | (required) | Camera RTSP URL |
| `--name <id>` | `cam1` | Stream id in the URL/config |
| `--api-port <n>` | `1984` | go2rtc web/WebRTC port |
| `--go2rtc-bin <path>` | `$GO2RTC_BIN` / PATH | Explicit binary path |
| `--no-open` | off | Don't auto-open the browser |

Then open the printed URL (default
`http://localhost:1984/stream.html?src=cam1&mode=webrtc`).

## No camera handy? Test with a synthetic stream

You can point go2rtc at an FFmpeg test pattern instead of a real camera by editing
`config/go2rtc.example.yaml`, but the quickest smoke test is the go2rtc dashboard at
`http://localhost:1984/` — add a stream there and confirm WebRTC plays.

## Success criteria

- The browser shows live video within ~1 second of latency.
- The go2rtc dashboard lists your camera as connected.

If that works, ingest + live viewing is proven and Phase 1 is mostly UI.
