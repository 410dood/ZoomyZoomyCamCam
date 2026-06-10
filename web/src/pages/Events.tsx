import { useEffect, useState } from "react";
import { api, CamEvent, Camera, fmtTime, Segment } from "../api";

export default function Events({ cameras }: { cameras: Camera[] }) {
  const [events, setEvents] = useState<CamEvent[]>([]);
  const [cameraId, setCameraId] = useState<number | "">("");
  const [label, setLabel] = useState("");
  const [review, setReview] = useState<"all" | "alerts">("all");
  const [alertLabels, setAlertLabels] = useState<string[]>(["person"]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CamEvent[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [faceFilter, setFaceFilter] = useState("");
  const [plateFilter, setPlateFilter] = useState("");

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = await api.search(q, 24);
      setSearchResults(r.results.map((x) => x.event));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };
  const [open, setOpen] = useState<CamEvent | null>(null);
  const [playing, setPlaying] = useState<{ segment: Segment; offset: number } | null>(null);
  const [noClip, setNoClip] = useState<number | null>(null);

  // Protect-style playback shortcuts: space pause, arrows seek (shift =
  // frame-ish steps), f fullscreen, Esc close.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const v = document.querySelector<HTMLVideoElement>(".modal-bg video");
      if (!v) return;
      if (e.key === " ") {
        e.preventDefault();
        if (v.paused) v.play();
        else v.pause();
      } else if (e.key === "ArrowLeft") {
        v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 1 / 15 : 5));
      } else if (e.key === "ArrowRight") {
        v.currentTime = Math.min(v.duration, v.currentTime + (e.shiftKey ? 1 / 15 : 5));
      } else if (e.key === "f") {
        v.requestFullscreen().catch(() => {});
      } else if (e.key === "Escape") {
        setPlaying(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const jumpToRecording = async (ev: CamEvent) => {
    try {
      const r = await api.recordingAt(ev.camera_id, ev.ts);
      // Land a few seconds before the event so you see it happen.
      setPlaying({ segment: r.segment, offset: Math.max(0, r.offset_secs - 3) });
    } catch {
      setNoClip(ev.id);
      setTimeout(() => setNoClip(null), 2500);
    }
  };

  const load = () => {
    api
      .events({
        camera_id: cameraId === "" ? undefined : cameraId,
        label: label || undefined,
        limit: 200,
      })
      .then(setEvents)
      .catch(() => {});
  };

  useEffect(() => {
    api
      .settings()
      .then((s) => setAlertLabels(s.alert_labels ?? ["person"]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // events appear as they happen
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, label]);

  const labels = [...new Set(events.map((e) => e.label))];
  const faces = [...new Set(events.map((e) => e.face).filter(Boolean))] as string[];
  let shown =
    searchResults ??
    (review === "alerts" ? events.filter((e) => alertLabels.includes(e.label)) : events);
  if (faceFilter) shown = shown.filter((e) => e.face === faceFilter);
  if (plateFilter.trim())
    shown = shown.filter((e) =>
      (e.plate ?? "").toUpperCase().includes(plateFilter.trim().toUpperCase())
    );

  return (
    <>
      <h1>Events</h1>

      <div className="smart-search">
        <span>✨</span>
        <input
          type="text"
          placeholder='Smart search — describe what you are looking for ("person in a dark coat", "blue car")'
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim() === "") setSearchResults(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        {searchResults && (
          <button
            className="ghost"
            onClick={() => {
              setQuery("");
              setSearchResults(null);
            }}
          >
            clear
          </button>
        )}
        <button className="primary" onClick={runSearch} disabled={searching || !query.trim()}>
          {searching ? "searching…" : "Search"}
        </button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className={review === "all" ? "primary" : "ghost"} onClick={() => setReview("all")}>
          All
        </button>
        <button
          className={review === "alerts" ? "primary" : "ghost"}
          onClick={() => setReview("alerts")}
          title={`alert labels: ${alertLabels.join(", ")}`}
        >
          🔔 Alerts
        </button>
        <select value={cameraId} onChange={(e) => setCameraId(e.target.value === "" ? "" : Number(e.target.value))}>
          <option value="">all cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">all objects</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select value={faceFilter} onChange={(e) => setFaceFilter(e.target.value)}>
          <option value="">anyone</option>
          {faces.map((f) => (
            <option key={f} value={f}>
              👤 {f}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="plate…"
          style={{ width: 110 }}
          value={plateFilter}
          onChange={(e) => setPlateFilter(e.target.value)}
        />
        <span className="muted">{shown.length} events · auto-refreshing</span>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          No events yet. They appear when a detect-enabled camera sees motion and the AI
          recognizes an object.
        </div>
      ) : (
        <div className="event-grid">
          {shown.map((ev) => (
            <div className="event-card" key={ev.id} onClick={() => setOpen(ev)}>
              {ev.snapshot ? (
                <img src={`/api/snapshots/${ev.snapshot}`} alt={ev.label} loading="lazy" />
              ) : (
                <div style={{ aspectRatio: "4 / 3", background: "#000" }} />
              )}
              <div className="meta">
                <b>{ev.label}</b> {(ev.score * 100).toFixed(0)}% · {ev.camera}
                {ev.face && <span style={{ color: "var(--ok)" }}> · 👤 {ev.face}</span>}
                {ev.plate && <span style={{ color: "var(--warn)" }}> · 🚗 {ev.plate}</span>}
                <div className="muted">{fmtTime(ev.ts)}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToRecording(ev);
                    }}
                  >
                    {noClip === ev.id ? "no recording" : "▶ view recording"}
                  </button>
                  <a
                    className="ghost"
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", textDecoration: "none", color: "var(--text)", fontSize: "0.9rem" }}
                    href={`/api/events/${ev.id}/clip`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    ⬇ clip
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          {open.snapshot && <img src={`/api/snapshots/${open.snapshot}`} alt={open.label} />}
        </div>
      )}

      {playing && (
        <div className="modal-bg" onClick={() => setPlaying(null)}>
          <video
            src={`/api/recordings/${playing.segment.id}/video`}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = playing.offset;
            }}
          />
        </div>
      )}
    </>
  );
}
