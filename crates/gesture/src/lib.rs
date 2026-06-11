//! Hand-signal recognition support: a canonical gesture taxonomy plus a pure
//! geometric classifier over the MediaPipe 21-landmark hand layout.
//!
//! Landmark *detection* (turning camera pixels into 21 (x,y) points) runs in
//! the browser via MediaPipe Tasks Vision — GPU-accelerated and portable,
//! exactly the cross-platform-AI thesis of this project. This crate is the
//! server's shared, testable brain: it normalizes the gesture names the client
//! reports and can re-derive a gesture from raw landmarks, so a hand signal is
//! a first-class, well-defined event regardless of where it was spotted.
//!
//! Coordinates are normalized to the frame (0..1, top-left origin), the same
//! convention MediaPipe emits, so the classifier is resolution-independent.

use serde::{Deserialize, Serialize};

/// MediaPipe hand landmark indices (21 points). Named for readability.
pub mod lm {
    pub const WRIST: usize = 0;
    pub const THUMB_MCP: usize = 2;
    pub const THUMB_IP: usize = 3;
    pub const THUMB_TIP: usize = 4;
    pub const INDEX_MCP: usize = 5;
    pub const INDEX_PIP: usize = 6;
    pub const INDEX_TIP: usize = 8;
    pub const MIDDLE_MCP: usize = 9;
    pub const MIDDLE_PIP: usize = 10;
    pub const MIDDLE_TIP: usize = 12;
    pub const RING_PIP: usize = 14;
    pub const RING_TIP: usize = 16;
    pub const PINKY_MCP: usize = 17;
    pub const PINKY_PIP: usize = 18;
    pub const PINKY_TIP: usize = 20;
}

/// The canonical hand signals this platform understands. Every name the UI,
/// the API and alarm rules use is one of these snake_case strings.
pub const GESTURES: &[&str] = &[
    "open_palm",
    "fist",
    "victory",
    "point",
    "thumb_up",
    "thumb_down",
    "ok",
    "call_me",
    "love",
    "hand",
];

/// A point in normalized frame coordinates.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
    fn dist(&self, o: &Point) -> f32 {
        let (dx, dy) = (self.x - o.x, self.y - o.y);
        (dx * dx + dy * dy).sqrt()
    }
}

/// Normalize an arbitrary gesture name (MediaPipe's CamelCase, loose spacing,
/// or our own snake_case) to a canonical [`GESTURES`] entry. Returns `None`
/// for names we don't model, so callers can reject or fall back to "hand".
pub fn canonical(name: &str) -> Option<&'static str> {
    let key: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    let out = match key.as_str() {
        "openpalm" | "open" | "palm" | "wave" | "five" | "highfive" => "open_palm",
        "closedfist" | "fist" | "closed" => "fist",
        "victory" | "peace" | "v" => "victory",
        "pointingup" | "pointing" | "point" | "one" => "point",
        "thumbup" | "thumbsup" | "thumbup1" | "like" => "thumb_up",
        "thumbdown" | "thumbsdown" | "dislike" => "thumb_down",
        "ok" | "okay" | "oksign" => "ok",
        "callme" | "shaka" | "hangloose" => "call_me",
        "iloveyou" | "love" | "ily" => "love",
        "hand" | "none" => "hand",
        _ => return None,
    };
    Some(out)
}

/// Per-finger extension flags: [thumb, index, middle, ring, pinky].
///
/// A finger (index..pinky) is "extended" when its tip is farther from the wrist
/// than its PIP joint. The thumb splays sideways rather than curling, so it is
/// judged by distance from the pinky MCP (the far side of the palm) instead.
pub fn fingers_extended(p: &[Point; 21]) -> [bool; 5] {
    let wrist = p[lm::WRIST];
    let ext = |tip: usize, pip: usize| p[tip].dist(&wrist) > p[pip].dist(&wrist);
    let thumb = {
        let anchor = p[lm::PINKY_MCP];
        p[lm::THUMB_TIP].dist(&anchor) > p[lm::THUMB_IP].dist(&anchor)
    };
    [
        thumb,
        ext(lm::INDEX_TIP, lm::INDEX_PIP),
        ext(lm::MIDDLE_TIP, lm::MIDDLE_PIP),
        ext(lm::RING_TIP, lm::RING_PIP),
        ext(lm::PINKY_TIP, lm::PINKY_PIP),
    ]
}

/// Rough hand size: wrist → middle-finger MCP. Used to scale the pinch test so
/// it is independent of how close the hand is to the camera.
fn hand_scale(p: &[Point; 21]) -> f32 {
    p[lm::WRIST].dist(&p[lm::MIDDLE_MCP]).max(1e-4)
}

/// Thumb tip and index tip touching (the "OK" ring).
fn pinched(p: &[Point; 21]) -> bool {
    p[lm::THUMB_TIP].dist(&p[lm::INDEX_TIP]) < 0.35 * hand_scale(p)
}

/// Classify a hand pose into a canonical gesture. Always returns a [`GESTURES`]
/// entry — an unrecognized but valid hand falls back to the generic "hand".
pub fn classify(p: &[Point; 21]) -> &'static str {
    let [t, i, m, r, pk] = fingers_extended(p);

    // OK sign: thumb+index pinched into a ring, the other three up.
    if pinched(p) && m && r && pk {
        return "ok";
    }
    match [t, i, m, r, pk] {
        [true, true, true, true, true] => "open_palm",
        [false, true, true, false, false] => "victory",
        [false, true, false, false, false] => "point",
        [true, false, false, false, false] => "thumb_up",
        [true, true, false, false, true] => "love",
        [true, false, false, false, true] => "call_me",
        // All four fingers curled (thumb either way) is a fist — knuckles only.
        [_, false, false, false, false] => "fist",
        _ => "hand",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a hand: every finger laid out vertically from a wrist at (0.5, 1.0)
    /// growing upward (smaller y = higher), with a per-finger `curl` that pulls
    /// the tip back down toward the wrist when the finger is "closed".
    fn hand(thumb_out: bool, fingers: [bool; 4]) -> [Point; 21] {
        let mut p = [Point::default(); 21];
        let wrist = Point::new(0.5, 1.0);
        p[lm::WRIST] = wrist;
        p[lm::MIDDLE_MCP] = Point::new(0.5, 0.7); // sets hand scale ~0.3

        // Four fingers across x = 0.40, 0.50, 0.60, 0.70.
        let cols = [
            (lm::INDEX_MCP, lm::INDEX_PIP, lm::INDEX_TIP, 0.40),
            (lm::MIDDLE_MCP, lm::MIDDLE_PIP, lm::MIDDLE_TIP, 0.50),
            (13usize, lm::RING_PIP, lm::RING_TIP, 0.60),
            (lm::PINKY_MCP, lm::PINKY_PIP, lm::PINKY_TIP, 0.70),
        ];
        for (k, (mcp, pip, tip, x)) in cols.iter().enumerate() {
            p[*mcp] = Point::new(*x, 0.75);
            p[*pip] = Point::new(*x, 0.60);
            // Extended: tip high (y=0.30, far from wrist). Curled: tip pulled
            // back below the PIP (y=0.68, closer to wrist than the PIP).
            p[*tip] = Point::new(*x, if fingers[k] { 0.30 } else { 0.68 });
        }

        // Thumb on the left. Extended: tip far from the pinky side (x=0.30).
        // Curled: tip tucked toward the palm (x=0.55, near the pinky MCP).
        p[lm::THUMB_MCP] = Point::new(0.42, 0.80);
        p[lm::THUMB_IP] = Point::new(0.38, 0.74);
        p[lm::THUMB_TIP] = if thumb_out {
            Point::new(0.28, 0.66)
        } else {
            Point::new(0.52, 0.66)
        };
        p
    }

    #[test]
    fn extension_flags_match_layout() {
        let open = hand(true, [true, true, true, true]);
        assert_eq!(fingers_extended(&open), [true, true, true, true, true]);
        let closed = hand(false, [false, false, false, false]);
        assert_eq!(
            fingers_extended(&closed),
            [false, false, false, false, false]
        );
    }

    #[test]
    fn classifies_core_signals() {
        assert_eq!(classify(&hand(true, [true, true, true, true])), "open_palm");
        assert_eq!(classify(&hand(false, [false, false, false, false])), "fist");
        assert_eq!(
            classify(&hand(false, [true, true, false, false])),
            "victory"
        );
        assert_eq!(classify(&hand(false, [true, false, false, false])), "point");
        assert_eq!(
            classify(&hand(true, [false, false, false, false])),
            "thumb_up"
        );
        assert_eq!(classify(&hand(true, [true, false, false, true])), "love");
        assert_eq!(
            classify(&hand(true, [false, false, false, true])),
            "call_me"
        );
    }

    #[test]
    fn ok_sign_detected_by_pinch() {
        // Three fingers up, thumb+index tips touching near (0.5, 0.45).
        let mut p = hand(false, [false, true, true, true]);
        p[lm::THUMB_TIP] = Point::new(0.50, 0.45);
        p[lm::INDEX_TIP] = Point::new(0.52, 0.45);
        assert_eq!(classify(&p), "ok");
    }

    #[test]
    fn canonical_normalizes_aliases() {
        assert_eq!(canonical("Open_Palm"), Some("open_palm"));
        assert_eq!(canonical("openpalm"), Some("open_palm"));
        assert_eq!(canonical("Thumb_Up"), Some("thumb_up"));
        assert_eq!(canonical("Victory"), Some("victory"));
        assert_eq!(canonical("Pointing_Up"), Some("point"));
        assert_eq!(canonical("ILoveYou"), Some("love"));
        assert_eq!(canonical("None"), Some("hand"));
        assert_eq!(canonical("backflip"), None);
    }

    #[test]
    fn every_classified_name_is_canonical() {
        // The classifier must only ever emit names the rest of the system
        // recognizes.
        let poses = [
            hand(true, [true, true, true, true]),
            hand(false, [false, false, false, false]),
            hand(false, [true, true, false, false]),
            hand(true, [false, true, false, true]),
        ];
        for pose in poses {
            assert!(GESTURES.contains(&classify(&pose)));
        }
    }
}
