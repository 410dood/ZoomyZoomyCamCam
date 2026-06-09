//! Standalone LPR validation: find the best plate in an image and read it.
//!
//!   cargo run -p zoomy --example lpr_probe -- image.jpg

use anyhow::Result;

fn main() -> Result<()> {
    let path = std::env::args().nth(1).expect("usage: lpr_probe <image>");
    let img = image::open(&path)?;
    let mut engine = zoomy::lpr::PlateEngine::try_new()?;
    println!("class maxima: {:?}", engine.debug_class_maxima(&img)?);
    match engine.detect(&img, 0.5)? {
        Some(plate) => {
            println!(
                "plate {:.0}% box=[{:.0},{:.0},{:.0},{:.0}]",
                plate.score * 100.0,
                plate.x1,
                plate.y1,
                plate.x2,
                plate.y2
            );
            println!("text: {:?}", engine.read(&img, &plate)?);
        }
        None => println!("no plate found"),
    }
    Ok(())
}
