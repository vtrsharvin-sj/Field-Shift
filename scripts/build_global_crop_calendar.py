"""Download and compact the public GGCMI Phase 3 global crop calendar.

Requires Python 3, numpy and h5py. Run from the repository root:
    python scripts/build_global_crop_calendar.py

The output is a gzip-compressed binary grid served as a static public asset.
Each grid-cell record stores planting day-of-year and growing-season length
as little-endian uint16 values (0 means no calendar value).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import urllib.request
from pathlib import Path

import h5py
import numpy as np


RECORD_URL = "https://zenodo.org/api/records/5062513"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data"
FILE_PATTERN = re.compile(r"(?P<crop>[a-z0-9]{3})_(?P<system>ir|rf)_ggcmi_crop_calendar_phase3_v1\.01\.nc4$")
EXPECTED_LAYERS = 40


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "FieldShift/1.0 (global crop calendar build)"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main() -> None:
    record = json.loads(download(RECORD_URL))
    license_id = record.get("metadata", {}).get("license", {}).get("id")
    if license_id != "cc-by-4.0":
        raise RuntimeError(f"Unexpected source license: {license_id!r}")

    files = []
    for item in record.get("files", []):
        match = FILE_PATTERN.fullmatch(item.get("key", ""))
        if match:
            files.append((match.group("crop"), match.group("system"), item))
    files.sort(key=lambda row: (row[0], row[1]))
    if len(files) != EXPECTED_LAYERS:
        raise RuntimeError(f"Expected {EXPECTED_LAYERS} calendar layers; found {len(files)}")

    OUT.mkdir(parents=True, exist_ok=True)
    # Keep the gzip payload under a .bin name. Vite/static hosts infer
    # Content-Encoding: gzip from a .gz extension, which makes fetch() expose
    # already-decompressed bytes and breaks the explicit DecompressionStream.
    temp_path = OUT / "global-crop-calendar-v1.bin.tmp"
    manifest_path = OUT / "global-crop-calendar-v1.json"
    layers = []
    rows = cols = None
    cell_count = None

    with temp_path.open("wb") as raw_file:
        with gzip.GzipFile(fileobj=raw_file, mode="wb", compresslevel=9, mtime=0) as packed:
            for crop, system, item in files:
                content = download(item["links"]["self"])
                checksum = hashlib.md5(content).hexdigest()
                expected = item.get("checksum", "").removeprefix("md5:")
                if checksum != expected:
                    raise RuntimeError(f"Checksum failed for {item['key']}")
                with h5py.File(io.BytesIO(content), "r") as source:
                    start = np.asarray(source["planting_day"][:], dtype=np.float64)
                    duration = np.asarray(source["growing_season_length"][:], dtype=np.float64)
                    if start.shape != duration.shape or start.ndim != 2:
                        raise RuntimeError(f"Unexpected array shape in {item['key']}")
                    if rows is None:
                        rows, cols = start.shape
                        cell_count = rows * cols
                    elif start.shape != (rows, cols):
                        raise RuntimeError(f"Grid shape changed in {item['key']}")

                    valid = (
                        np.isfinite(start)
                        & np.isfinite(duration)
                        & (start >= 1)
                        & (start < 367)
                        & (duration >= 1)
                        & (duration <= 366)
                    )
                    packed_values = np.zeros((rows, cols, 2), dtype="<u2")
                    packed_values[:, :, 0][valid] = np.rint(start[valid]).astype(np.uint16)
                    packed_values[:, :, 1][valid] = np.rint(duration[valid]).astype(np.uint16)
                    packed.write(packed_values.tobytes(order="C"))
                layers.append({"cropCode": crop, "system": system, "sourceFile": item["key"], "checksum": item["checksum"]})
                print(f"Packed {crop}_{system}")

    data_path = OUT / "global-crop-calendar-v1.bin"
    temp_path.replace(data_path)
    manifest = {
        "dataset": "AgMIP-GGCMI Phase 3 global crop calendar v1.01",
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "citation": "Jägermeyr et al. (2021), Climate impacts on global agriculture emerge earlier in new generation of climate and crop models, Nature Food 2, 873–885. https://doi.org/10.1038/s43016-021-00400-y",
        "recordUrl": "https://doi.org/10.5281/zenodo.5062513",
        "calendarPeriod": "Static multi-year average reference calendar",
        "grid": {"rows": rows, "columns": cols, "cellCount": cell_count, "resolutionDegrees": 0.5, "firstLatitudeCenter": 89.75, "latitudeStep": -0.5, "firstLongitudeCenter": -179.75, "longitudeStep": 0.5},
        "encoding": "Each layer is row-major; each cell is two little-endian uint16 values: planting day-of-year, growing-season length in days. Zero indicates missing.",
        "limitations": [
            "The source is a static average calendar, not an annually updated observation.",
            "The source merges observations and applies gap-filling and spatial extrapolation.",
            "A half-degree cell is regional context, not field-level planting advice.",
            "The source describes single-crop calendars, not crop-rotation outcomes.",
        ],
        "layers": layers,
    }
    manifest_path.write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {data_path} ({data_path.stat().st_size:,} bytes compressed)")


if __name__ == "__main__":
    main()
