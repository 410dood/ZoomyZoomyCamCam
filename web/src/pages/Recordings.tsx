import { useEffect, useState } from "react";
import { api, Camera, fmtBytes, fmtTime, Segment } from "../api";

export default function Recordings({ cameras }: { cameras: Camera[] }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [cameraId, setCameraId] = useState<number | "">("");
  const [playing, setPlaying] = useState<Segment | null>(null);

  const load = () => {
    api
      .recordings({ camera_id: cameraId === "" ? undefined : cameraId, limit: 200 })
      .then(setSegments)
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  return (
    <>
      <h1>Recordings</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <select value={cameraId} onChange={(e) => setCameraId(e.target.value === "" ? "" : Number(e.target.value))}>
          <option value="">all cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="muted">
          {segments.length} segments · {fmtBytes(segments.reduce((a, s) => a + s.bytes, 0))} total
        </span>
      </div>

      {segments.length === 0 ? (
        <div className="empty">
          No recordings yet. Segments land here ~1 minute after a record-enabled camera connects.
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Camera</th>
                <th>Start</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.camera}</b>
                  </td>
                  <td>{fmtTime(s.start_ts)}</td>
                  <td className="muted">{fmtBytes(s.bytes)}</td>
                  <td>
                    <button className="ghost" onClick={() => setPlaying(s)}>
                      ▶ Play
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {playing && (
        <div className="modal-bg" onClick={() => setPlaying(null)}>
          <video
            src={`/api/recordings/${playing.id}/video`}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
