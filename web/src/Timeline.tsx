import { useMemo } from "react";
import { CamEvent, Segment } from "./api";

/// UniFi-style scrubber: recorded coverage as blocks, events as ticks.
/// Click anywhere in a recorded span to start playback at that instant.
export default function Timeline({
  windowSecs,
  segmentSecs,
  segments,
  events,
  onSeek,
}: {
  windowSecs: number;
  segmentSecs: number;
  segments: Segment[];
  events: CamEvent[];
  onSeek: (ts: number) => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - windowSecs;

  const frac = (ts: number) => (ts - start) / windowSecs;

  const blocks = useMemo(
    () =>
      segments
        .filter((s) => s.start_ts + segmentSecs > start && s.start_ts < now)
        .map((s) => ({
          left: Math.max(0, frac(s.start_ts)),
          width: Math.min(1, frac(s.start_ts + segmentSecs)) - Math.max(0, frac(s.start_ts)),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, windowSecs, segmentSecs]
  );

  const ticks = useMemo(
    () => events.filter((e) => e.ts >= start && e.ts <= now).map((e) => ({ left: frac(e.ts), e })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, windowSecs]
  );

  // Hour gridlines (or 10-minute lines for the 1h window).
  const gridStep = windowSecs <= 3600 ? 600 : 3600;
  const gridLines: number[] = [];
  for (let t = Math.ceil(start / gridStep) * gridStep; t < now; t += gridStep) {
    gridLines.push(frac(t));
  }

  const click = (ev: React.MouseEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const ts = Math.round(start + ((ev.clientX - rect.left) / rect.width) * windowSecs);
    onSeek(ts);
  };

  return (
    <div className="timeline" onClick={click} title="Click to play from this moment">
      {gridLines.map((g, i) => (
        <div className="tl-grid" key={i} style={{ left: `${g * 100}%` }} />
      ))}
      {blocks.map((b, i) => (
        <div
          className="tl-block"
          key={i}
          style={{ left: `${b.left * 100}%`, width: `${Math.max(0.15, b.width * 100)}%` }}
        />
      ))}
      {ticks.map(({ left, e }, i) => (
        <div
          className="tl-tick"
          key={i}
          style={{ left: `${left * 100}%` }}
          title={`${e.label} ${(e.score * 100).toFixed(0)}% @ ${new Date(e.ts * 1000).toLocaleTimeString()}`}
        />
      ))}
      <div className="tl-times">
        <span>{new Date(start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <span>now</span>
      </div>
    </div>
  );
}
