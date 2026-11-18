#!/usr/bin/env python3
import struct
import zlib
import os

def create_png(width, height, color_rgba=(99, 102, 241, 255)):
    # PNG signature
    png_sig = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk: width(4), height(4), bit_depth(1), color_type(1), compression(1), filter(1), interlace(1)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_chunk = b'IHDR' + ihdr_data
    ihdr_crc = struct.pack('>I', zlib.crc32(ihdr_chunk))
    ihdr = struct.pack('>I', len(ihdr_data)) + ihdr_chunk + ihdr_crc

    # IDAT chunk (raw scanlines)
    raw_scanlines = bytearray()
    r, g, b, a = color_rgba
    for y in range(height):
        raw_scanlines.append(0) # filter type 0 (None)
        for x in range(width):
            dist = ((x - width/2)**2 + (y - height/2)**2)**0.5
            if dist < width * 0.45:
                raw_scanlines.extend([r, g, b, a])
            else:
                raw_scanlines.extend([r // 2, g // 2, b // 2, 180])

    compressed = zlib.compress(bytes(raw_scanlines), level=9)
    idat_chunk = b'IDAT' + compressed
    idat_crc = struct.pack('>I', zlib.crc32(idat_chunk))
    idat = struct.pack('>I', len(compressed)) + idat_chunk + idat_crc

    # IEND chunk
    iend_chunk = b'IEND'
    iend_crc = struct.pack('>I', zlib.crc32(iend_chunk))
    iend = struct.pack('>I', 0) + iend_chunk + iend_crc

    return png_sig + ihdr + idat + iend

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
    os.makedirs(icons_dir, exist_ok=True)

    png32 = create_png(32, 32)
    png128 = create_png(128, 128)
    png256 = create_png(256, 256)

    with open(os.path.join(icons_dir, "32x32.png"), "wb") as f:
        f.write(png32)
    with open(os.path.join(icons_dir, "128x128.png"), "wb") as f:
        f.write(png128)
    with open(os.path.join(icons_dir, "128x128@2x.png"), "wb") as f:
        f.write(png256)
    with open(os.path.join(icons_dir, "icon.png"), "wb") as f:
        f.write(png256)
    with open(os.path.join(icons_dir, "icon.ico"), "wb") as f:
        f.write(png128)
    with open(os.path.join(icons_dir, "icon.icns"), "wb") as f:
        f.write(png256)

    print("Icons generated successfully.")

if __name__ == "__main__":
    main()
