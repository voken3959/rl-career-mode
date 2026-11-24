#!/usr/bin/env python3
"""Extract the Whiskers V5 actor weights from model.pt into rl/whiskers.bin (no PyTorch needed).

A PyTorch .pt file is a zip archive. Each tensor lives in archive/data/<n> as raw little-endian
float32. We read those byte blobs directly and never unpickle the file (unpickling untrusted
data can execute code). The tensor order and shapes below were read from the checkpoint's
pickle opcodes and checked against the byte sizes.

Usage: python3 tools/extract_whiskers.py path/to/model.pt rl/whiskers.bin
Source bot: https://github.com/adventure-gpt/whiskers-v5-bot (MIT licence, see rl/WHISKERS-LICENSE.txt)
"""
import struct
import sys
import zipfile

# (storage file, name, shape) in the order whiskers.js reads them.
TENSORS = [
    ("0", "encoder0.w", (192, 33)),
    ("1", "encoder0.b", (192,)),
    ("2", "encoder1.w", (192, 192)),
    ("3", "encoder1.b", (192,)),
    ("4", "trunk0.w", (1024, 1065)),
    ("5", "trunk0.b", (1024,)),
    ("6", "trunk1.w", (1024, 1024)),
    ("7", "trunk1.b", (1024,)),
    ("8", "trunk2.w", (512, 1024)),
    ("9", "trunk2.b", (512,)),
    ("10", "out.w", (90, 512)),
    ("11", "out.b", (90,)),
]


def main(src, dst):
    z = zipfile.ZipFile(src)
    names = {n.split("/")[-1]: n for n in z.namelist() if "/data/" in n}
    total = 0
    with open(dst, "wb") as out:
        for key, name, shape in TENSORS:
            count = 1
            for d in shape:
                count *= d
            blob = z.read(names[key])
            if len(blob) != count * 4:
                raise SystemExit(f"{name}: expected {count * 4} bytes, found {len(blob)}")
            out.write(blob)
            total += count
    print(f"wrote {dst}: {total} float32 weights ({total * 4} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
