#!/usr/bin/env python3
"""Extract the Nexto actor weights from nexto-model.pt into rl/nexto.bin (no PyTorch needed).

nexto-model.pt is a TorchScript archive: a zip of raw little-endian float32 tensors in
nexto-model/data/<n>. We read the byte blobs directly and never unpickle the file. Tensor order and
shapes were read from the TorchScript source in nexto-model/code and checked against byte sizes.

Architecture (EARL perceiver): query MLP 32->128->128, key/value MLP 24->128->128, two perceiver blocks
(pre-norm 4-head cross attention, then pre-norm 128->512->128 MLP, both residual), then ReLU, a linear
128->32 and a dot product with an MLP (8->32->32->32, ReLU after each) of the 90 action rows.

Usage: python3 tools/extract_nexto.py path/to/nexto-model.pt rl/nexto.bin
Source: https://github.com/Rolv-Arild/Necto (CC BY-NC-SA 4.0, see rl/NEXTO-LICENSE.txt)
"""
import struct
import sys
import zipfile

D = 128
TENSORS = [
    ("0", "q0.w", (D, 32)), ("1", "q0.b", (D,)), ("2", "q1.w", (D, D)), ("3", "q1.b", (D,)),
    ("4", "kv0.w", (D, 24)), ("5", "kv0.b", (D,)), ("6", "kv1.w", (D, D)), ("7", "kv1.b", (D,)),
]
for block, base in ((0, 8), (1, 22)):
    TENSORS += [
        (str(base), f"b{block}.in_w", (3 * D, D)), (str(base + 1), f"b{block}.in_b", (3 * D,)),
        (str(base + 2), f"b{block}.out_w", (D, D)), (str(base + 3), f"b{block}.out_b", (D,)),
        (str(base + 4), f"b{block}.l1_w", (4 * D, D)), (str(base + 5), f"b{block}.l1_b", (4 * D,)),
        (str(base + 6), f"b{block}.l2_w", (D, 4 * D)), (str(base + 7), f"b{block}.l2_b", (D,)),
        (str(base + 8), f"b{block}.n1_w", (D,)), (str(base + 9), f"b{block}.n1_b", (D,)),
        (str(base + 10), f"b{block}.n2_w", (D,)), (str(base + 11), f"b{block}.n2_b", (D,)),
        (str(base + 12), f"b{block}.n3_w", (D,)), (str(base + 13), f"b{block}.n3_b", (D,)),
    ]
TENSORS += [
    ("36", "a0.w", (32, 8)), ("37", "a0.b", (32,)), ("38", "a1.w", (32, 32)), ("39", "a1.b", (32,)),
    ("40", "a2.w", (32, 32)), ("41", "a2.b", (32,)), ("42", "emb.w", (32, D)), ("43", "emb.b", (32,)),
]


def main(src, dst):
    z = zipfile.ZipFile(src)
    data = {n.split("/")[-1]: n for n in z.namelist() if "/data/" in n}
    total = 0
    with open(dst, "wb") as out:
        for key, name, shape in TENSORS:
            count = 1
            for d in shape:
                count *= d
            blob = z.read(data[key])
            if len(blob) != count * 4:
                raise SystemExit(f"{name}: expected {count * 4} bytes, found {len(blob)}")
            values = struct.unpack("<%df" % count, blob)
            if any(v != v or abs(v) > 1e6 for v in values):
                raise SystemExit(f"{name}: non-finite or absurd values")
            out.write(blob)
            total += count
    print("wrote", dst, total, "floats")
    consts = {n.split("/")[-1]: n for n in z.namelist() if "/constants/" in n}
    c1 = struct.unpack("<d", z.read(consts["1"]))[0]
    c2 = struct.unpack("<720f", z.read(consts["2"]))
    print("attention scale constant:", c1, "(sqrt(32) =", 32 ** 0.5, ")")
    print("action rows:", len(c2) // 8, "first rows:", c2[:8], c2[8:16], "last:", c2[-8:])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
