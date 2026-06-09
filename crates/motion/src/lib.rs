//! Stage 1 of two-stage detection: a cheap pixel-diff motion gate.
//!
//! Frames are downscaled to a small grayscale thumbnail and compared to the
//! previous frame. If the fraction of meaningfully-changed pixels crosses a
//! threshold, the frame is worth sending to the (expensive) AI detector.
//! Never run YOLO on every frame of every camera — that's the whole point.

use image::{imageops::FilterType, DynamicImage, GrayImage};

/// Thumbnail edge used for diffing. Small enough to be ~free, large enough to
/// catch a person-sized object in a 4K frame.
const DIFF_SIZE: u32 = 64;

/// Per-pixel luma delta (0-255) below which a change is treated as noise.
const PIXEL_NOISE_FLOOR: u8 = 25;

/// Result of feeding one frame to the gate.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Verdict {
    /// First frame ever seen — nothing to compare against.
    Baseline,
    /// Below threshold: don't bother running AI.
    Still { changed: f32 },
    /// At/above threshold: run AI on this frame.
    Motion { changed: f32 },
}

impl Verdict {
    pub fn is_motion(&self) -> bool {
        matches!(self, Verdict::Motion { .. })
    }
}

/// Stateful per-camera motion gate.
pub struct MotionGate {
    prev: Option<GrayImage>,
    /// Fraction of pixels (0..1) that must change to call it motion.
    threshold: f32,
}

impl MotionGate {
    pub fn new(threshold: f32) -> Self {
        Self {
            prev: None,
            threshold,
        }
    }

    /// Feed the next frame; returns whether it differs enough from the last one.
    pub fn update(&mut self, frame: &DynamicImage) -> Verdict {
        let thumb = frame
            .resize_exact(DIFF_SIZE, DIFF_SIZE, FilterType::Triangle)
            .to_luma8();

        let verdict = match &self.prev {
            None => Verdict::Baseline,
            Some(prev) => {
                let total = (DIFF_SIZE * DIFF_SIZE) as f32;
                let changed = prev
                    .pixels()
                    .zip(thumb.pixels())
                    .filter(|(a, b)| a.0[0].abs_diff(b.0[0]) > PIXEL_NOISE_FLOOR)
                    .count() as f32
                    / total;
                if changed >= self.threshold {
                    Verdict::Motion { changed }
                } else {
                    Verdict::Still { changed }
                }
            }
        };

        self.prev = Some(thumb);
        verdict
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    fn solid(rgb: [u8; 3]) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_pixel(128, 128, Rgb(rgb)))
    }

    #[test]
    fn first_frame_is_baseline() {
        let mut gate = MotionGate::new(0.02);
        assert_eq!(gate.update(&solid([0, 0, 0])), Verdict::Baseline);
    }

    #[test]
    fn identical_frames_are_still() {
        let mut gate = MotionGate::new(0.02);
        gate.update(&solid([10, 10, 10]));
        assert!(!gate.update(&solid([10, 10, 10])).is_motion());
    }

    #[test]
    fn full_frame_change_is_motion() {
        let mut gate = MotionGate::new(0.02);
        gate.update(&solid([0, 0, 0]));
        assert!(gate.update(&solid([255, 255, 255])).is_motion());
    }

    #[test]
    fn small_noise_is_not_motion() {
        let mut gate = MotionGate::new(0.02);
        gate.update(&solid([100, 100, 100]));
        // 10 luma levels of uniform drift — below the per-pixel noise floor.
        assert!(!gate.update(&solid([110, 110, 110])).is_motion());
    }

    #[test]
    fn localized_change_crosses_threshold() {
        let mut gate = MotionGate::new(0.02);
        let mut img = RgbImage::from_pixel(128, 128, Rgb([0, 0, 0]));
        gate.update(&DynamicImage::ImageRgb8(img.clone()));
        // Paint a bright 32x32 block (~6% of the 128x128 frame).
        for y in 0..32 {
            for x in 0..32 {
                img.put_pixel(x, y, Rgb([255, 255, 255]));
            }
        }
        assert!(gate.update(&DynamicImage::ImageRgb8(img)).is_motion());
    }
}
