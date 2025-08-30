use std::{env, fs, io::Write, path::PathBuf};

fn ensure_windows_icon() -> std::io::Result<()> {
    // Create a minimal 32x32 32-bit BGRA ICO (solid color) if missing
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let icons_dir = manifest_dir.join("icons");
    let icon_path = icons_dir.join("icon.ico");

    if icon_path.exists() {
        return Ok(());
    }

    fs::create_dir_all(&icons_dir)?;

    // Build ICO bytes
    // ICONDIR
    let mut bytes: Vec<u8> = Vec::with_capacity(22 + 40 + 4096 + 128);
    let bytes_in_res: u32 = 40 + 4096 + 128; // header + pixel data + AND mask
    // ICONDIR header
    bytes.extend_from_slice(&[0x00, 0x00]); // reserved
    bytes.extend_from_slice(&[0x01, 0x00]); // type = 1 (icon)
    bytes.extend_from_slice(&[0x01, 0x00]); // count = 1
    // ICONDIRENTRY
    bytes.push(32); // width
    bytes.push(32); // height
    bytes.push(0); // color count
    bytes.push(0); // reserved
    bytes.extend_from_slice(&1u16.to_le_bytes()); // planes
    bytes.extend_from_slice(&32u16.to_le_bytes()); // bit count
    bytes.extend_from_slice(&bytes_in_res.to_le_bytes()); // bytes in resource
    bytes.extend_from_slice(&22u32.to_le_bytes()); // image offset right after header (6+16)

    // BITMAPINFOHEADER (40 bytes)
    bytes.extend_from_slice(&40u32.to_le_bytes()); // biSize
    bytes.extend_from_slice(&32i32.to_le_bytes()); // biWidth
    bytes.extend_from_slice(&(32i32 * 2).to_le_bytes()); // biHeight (XOR+AND), so *2
    bytes.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    bytes.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    bytes.extend_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
    bytes.extend_from_slice(&4096u32.to_le_bytes()); // biSizeImage (can be 0 for BI_RGB; set explicitly)
    bytes.extend_from_slice(&0u32.to_le_bytes()); // biXPelsPerMeter
    bytes.extend_from_slice(&0u32.to_le_bytes()); // biYPelsPerMeter
    bytes.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    bytes.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant

    // Pixel data: 32x32 BGRA solid color (green-ish)
    let px: [u8; 4] = [0x00, 0xAA, 0x00, 0xFF]; // B, G, R, A
    for _row in 0..32 {
        for _col in 0..32 {
            bytes.extend_from_slice(&px);
        }
    }

    // AND mask: 1 bit per pixel, pad rows to 32 bits => 4 bytes/row for width=32, 32 rows -> 128 bytes
    bytes.extend(std::iter::repeat(0u8).take(128));

    let mut f = fs::File::create(&icon_path)?;
    f.write_all(&bytes)?;
    Ok(())
}

fn main() {
    // Ensure placeholder icon exists for Windows builds to avoid tauri-build failure.
    let _ = ensure_windows_icon();
    tauri_build::build()
}
