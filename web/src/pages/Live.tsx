import { AppConfig, Camera } from "../api";

export default function Live({
  cameras,
  config,
}: {
  cameras: Camera[];
  config: AppConfig | null;
}) {
  const live = cameras.filter((c) => c.enabled);
  if (!config) return <p className="muted">Connecting…</p>;
  if (live.length === 0)
    return (
      <>
        <h1>Live</h1>
        <div className="empty">
          No cameras yet — add one on the <b>Cameras</b> page.
        </div>
      </>
    );

  return (
    <>
      <h1>Live</h1>
      <div className="live-grid">
        {live.map((cam) => (
          <div className="tile" key={cam.id}>
            <div className="label">{cam.name}</div>
            <iframe
              title={cam.name}
              src={`${config.go2rtc_base}/stream.html?src=${encodeURIComponent(cam.name)}&mode=webrtc`}
              allow="autoplay"
            />
          </div>
        ))}
      </div>
    </>
  );
}
