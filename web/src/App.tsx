import { useEffect, useState } from "react";
import { api, AppConfig, Camera } from "./api";
import Live from "./pages/Live";
import Cameras from "./pages/Cameras";
import Events from "./pages/Events";
import Recordings from "./pages/Recordings";
import Settings from "./pages/Settings";

const PAGES = ["Live", "Events", "Recordings", "Cameras", "Settings"] as const;
type Page = (typeof PAGES)[number];

const ICONS: Record<Page, string> = {
  Live: "📺",
  Events: "🔔",
  Recordings: "🎞️",
  Cameras: "🎥",
  Settings: "⚙️",
};

export default function App() {
  const [page, setPage] = useState<Page>("Live");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api.cameras().then(setCameras).catch((e) => setError(String(e)));
  };

  useEffect(() => {
    api.config().then(setConfig).catch((e) => setError(String(e)));
    refresh();
  }, []);

  return (
    <>
      <nav className="sidebar">
        <div className="brand">
          Zoomy<span>Zoomy</span>CamCam
        </div>
        {PAGES.map((p) => (
          <button
            key={p}
            className={`nav-btn ${page === p ? "active" : ""}`}
            onClick={() => {
              setPage(p);
              refresh();
            }}
          >
            <span>{ICONS[p]}</span> {p}
          </button>
        ))}
        <div className="foot">
          {cameras.length} camera{cameras.length === 1 ? "" : "s"} · self-hosted NVR
        </div>
      </nav>
      <main className="main">
        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} (click to dismiss)
          </div>
        )}
        {page === "Live" && <Live cameras={cameras} config={config} />}
        {page === "Events" && <Events cameras={cameras} />}
        {page === "Recordings" && <Recordings cameras={cameras} />}
        {page === "Cameras" && (
          <Cameras cameras={cameras} onChange={refresh} onError={setError} />
        )}
        {page === "Settings" && <Settings onError={setError} />}
      </main>
    </>
  );
}
