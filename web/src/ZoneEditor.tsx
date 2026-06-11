import { useState } from "react";
import { Camera, PolyZone, ZoneKind } from "./api";

type Mask = [number, number][];
type Draw = { kind: "zone"; zoneKind: ZoneKind; points: Mask } | { kind: "mask"; points: Mask } | null;

const COLORS: Record<string, string> = {
  required: "#36d399",
  ignore: "#f87272",
  mask: "#a3a3a3",
};

/**
 * Draw polygon detection zones (required / ignore) and privacy masks directly
 * on a still frame from the camera. All coordinates are stored as 0..1 frame
 * fractions so they survive resolution and sub-stream changes.
 */
export default function ZoneEditor({
  camera,
  zones,
  masks,
  onChange,
}: {
  camera: Camera;
  zones: PolyZone[];
  masks: Mask[];
  onChange: (zones: PolyZone[], masks: Mask[]) => void;
}) {
  const [draw, setDraw] = useState<Draw>(null);
  const [imgOk, setImgOk] = useState(true);

  const addPoint = (e: React.MouseEvent) => {
    if (!draw) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setDraw({ ...draw, points: [...draw.points, [Number(x.toFixed(4)), Number(y.toFixed(4))]] });
  };

  const finish = () => {
    if (!draw || draw.points.length < 3) {
      setDraw(null);
      return;
    }
    if (draw.kind === "zone") {
      onChange(
        [
          ...zones,
          { name: `zone ${zones.length + 1}`, points: draw.points, kind: draw.zoneKind, labels: [] },
        ],
        masks
      );
    } else {
      onChange(zones, [...masks, draw.points]);
    }
    setDraw(null);
  };

  const polyStr = (pts: Mask) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

  return (
    <div>
      <div
        onClick={addPoint}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 640,
          aspectRatio: "16 / 9",
          background: "#000",
          borderRadius: 8,
          overflow: "hidden",
          cursor: draw ? "crosshair" : "default",
        }}
      >
        <img
          src={`/api/cameras/${camera.id}/frame.jpg`}
          alt={camera.name}
          onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
        {!imgOk && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "#888",
              fontSize: "0.85rem",
              padding: 12,
              textAlign: "center",
            }}
          >
            No live frame — the camera must be enabled and streaming to draw on it. You can still
            edit zones numerically after saving.
          </div>
        )}
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {zones.map((z, i) => (
            <polygon
              key={`z${i}`}
              points={polyStr(z.points)}
              fill={COLORS[z.kind]}
              fillOpacity={0.2}
              stroke={COLORS[z.kind]}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {masks.map((m, i) => (
            <polygon
              key={`m${i}`}
              points={polyStr(m)}
              fill="#000"
              fillOpacity={0.75}
              stroke={COLORS.mask}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {draw && draw.points.length > 0 && (
            <>
              <polyline
                points={polyStr(draw.points)}
                fill="none"
                stroke={draw.kind === "mask" ? COLORS.mask : COLORS[draw.zoneKind]}
                strokeWidth={2}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              {draw.points.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#fff" vectorEffect="non-scaling-stroke" />
              ))}
            </>
          )}
        </svg>
      </div>

      <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
        {!draw ? (
          <>
            <button
              type="button"
              className="ghost"
              onClick={() => setDraw({ kind: "zone", zoneKind: "required", points: [] })}
            >
              + required zone
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setDraw({ kind: "zone", zoneKind: "ignore", points: [] })}
            >
              + ignore zone
            </button>
            <button type="button" className="ghost" onClick={() => setDraw({ kind: "mask", points: [] })}>
              + privacy mask
            </button>
            <span className="muted">
              click points on the image to outline a polygon, then Finish
            </span>
          </>
        ) : (
          <>
            <span className="pill on">
              drawing {draw.kind === "mask" ? "privacy mask" : `${draw.zoneKind} zone`} ·{" "}
              {draw.points.length} pts
            </span>
            <button
              type="button"
              className="ghost"
              disabled={draw.points.length === 0}
              onClick={() => setDraw({ ...draw, points: draw.points.slice(0, -1) })}
            >
              undo point
            </button>
            <button type="button" className="primary" disabled={draw.points.length < 3} onClick={finish}>
              Finish
            </button>
            <button type="button" className="ghost" onClick={() => setDraw(null)}>
              cancel
            </button>
          </>
        )}
      </div>

      {(zones.length > 0 || masks.length > 0) && (
        <div style={{ marginTop: 10 }}>
          {zones.map((z, i) => (
            <div className="row" key={`zr${i}`} style={{ marginBottom: 6, alignItems: "center" }}>
              <span className="dot" style={{ background: COLORS[z.kind] }} />
              <input
                type="text"
                style={{ width: 130 }}
                value={z.name}
                onChange={(e) =>
                  onChange(zones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)), masks)
                }
              />
              <select
                value={z.kind}
                onChange={(e) =>
                  onChange(
                    zones.map((x, j) => (j === i ? { ...x, kind: e.target.value as ZoneKind } : x)),
                    masks
                  )
                }
              >
                <option value="required">required</option>
                <option value="ignore">ignore</option>
              </select>
              <input
                type="text"
                placeholder="objects (all)"
                style={{ width: 150 }}
                value={z.labels.join(", ")}
                onChange={(e) =>
                  onChange(
                    zones.map((x, j) =>
                      j === i
                        ? { ...x, labels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }
                        : x
                    ),
                    masks
                  )
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() => onChange(zones.filter((_, j) => j !== i), masks)}
              >
                remove
              </button>
            </div>
          ))}
          {masks.map((_, i) => (
            <div className="row" key={`mr${i}`} style={{ marginBottom: 6, alignItems: "center" }}>
              <span className="dot" style={{ background: COLORS.mask }} />
              <span className="muted" style={{ width: 130 }}>
                privacy mask {i + 1}
              </span>
              <button
                type="button"
                className="danger"
                onClick={() => onChange(zones, masks.filter((_, j) => j !== i))}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
