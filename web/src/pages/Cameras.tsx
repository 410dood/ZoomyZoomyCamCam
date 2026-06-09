import { FormEvent, useState } from "react";
import { api, Camera } from "../api";

export default function Cameras({
  cameras,
  onChange,
  onError,
}: {
  cameras: Camera[];
  onChange: () => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [detect, setDetect] = useState(true);
  const [record, setRecord] = useState(true);
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addCamera({ name: name.trim(), source: source.trim(), detect, record });
      setName("");
      setSource("");
      onChange();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (cam: Camera, field: "enabled" | "detect" | "record") => {
    try {
      await api.patchCamera(cam.id, { [field]: !cam[field] });
      onChange();
    } catch (err) {
      onError(String(err));
    }
  };

  const remove = async (cam: Camera) => {
    if (!window.confirm(`Delete camera "${cam.name}"? Its events are removed too.`)) return;
    try {
      await api.deleteCamera(cam.id);
      onChange();
    } catch (err) {
      onError(String(err));
    }
  };

  return (
    <>
      <h1>Cameras</h1>

      <div className="card">
        <h2>Add camera</h2>
        <form onSubmit={add} className="row">
          <label className="field">
            name
            <input
              type="text"
              placeholder="front-door"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 280 }}>
            source (RTSP URL or any go2rtc source)
            <input
              type="text"
              placeholder="rtsp://user:pass@192.168.1.50:554/stream1"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={detect} onChange={() => setDetect(!detect)} /> detect
          </label>
          <label className="toggle">
            <input type="checkbox" checked={record} onChange={() => setRecord(!record)} /> record
          </label>
          <button className="primary" disabled={busy}>
            Add
          </button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          Names: lowercase letters, digits, "-", "_". The source is passed to go2rtc verbatim, so{" "}
          <code>rtsp://</code>, <code>ffmpeg:</code>, <code>exec:</code>… all work.
        </p>
      </div>

      <div className="card">
        <h2>Registered</h2>
        {cameras.length === 0 ? (
          <p className="muted">No cameras registered.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Source</th>
                <th>Enabled</th>
                <th>Detect</th>
                <th>Record</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((cam) => (
                <tr key={cam.id}>
                  <td>
                    <b>{cam.name}</b>
                  </td>
                  <td className="muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cam.source}
                  </td>
                  {(["enabled", "detect", "record"] as const).map((f) => (
                    <td key={f}>
                      <span className={`pill toggle ${cam[f] ? "on" : ""}`} onClick={() => toggle(cam, f)}>
                        {cam[f] ? "on" : "off"}
                      </span>
                    </td>
                  ))}
                  <td>
                    <button className="danger" onClick={() => remove(cam)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
