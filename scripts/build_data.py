"""Turn the VPD crime CSV into small files the dashboard can load quickly.

Input:  data/Crimedata_csv_all_years.csv   (~89 MB, ~965k rows, VPD open data)
Output: data/incidents.bin.gz   every incident as packed columns, gzip-compressed
        data/meta.json          lookup tables and facts about the dataset

Run:    python3 scripts/build_data.py

Each incident becomes 10 bytes in separate columns (columns compress far better than
rows). The browser decompresses it with DecompressionStream and reads typed arrays.

Column layout of incidents.bin, n = number of incidents:
    uint8  type[n]     index into meta.types
    uint8  year[n]     year - meta.yearBase
    uint8  month[n]    1-12
    uint8  dow[n]      day of week, 0 = Sunday
    uint8  hour[n]     0-23, or 255 when the time is unknown
    uint8  hood[n]     index into meta.neighbourhoods, or 255 when missing
    uint16 lat[n]      latitude as a step 0..meta.grid inside meta.bbox, 65535 when there is no location
    uint16 lng[n]      quantised longitude, same rule
All multi-byte values are little-endian.
"""

import csv
import gzip
import json
import math
import struct
import sys
from array import array
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "Crimedata_csv_all_years.csv"
OUT_BIN = ROOT / "data" / "incidents.bin.gz"
OUT_META = ROOT / "data" / "meta.json"

# City of Vancouver plus a margin. Anything outside is treated as "no location".
BBOX = {"south": 49.18, "north": 49.33, "west": -123.27, "east": -123.01}
UNKNOWN_U8 = 255
NO_LOC = 65535
# 4096 steps across the box is about 4 m. VPD already offsets locations to the hundred
# block for privacy, so finer precision adds bytes without adding information.
GRID = 4095


def utm10n_to_latlng(x: float, y: float) -> tuple[float, float]:
    """Inverse UTM (zone 10N, WGS84). Accurate to well under a metre for this area."""
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x -= 500000.0
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
            + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
            + (151 * e1**3 / 96) * math.sin(6 * mu)
            + (1097 * e1**4 / 512) * math.sin(8 * mu))
    sin1, cos1, tan1 = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    n1 = a / math.sqrt(1 - e2 * sin1**2)
    t1 = tan1**2
    c1 = ep2 * cos1**2
    r1 = a * (1 - e2) / (1 - e2 * sin1**2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * tan1 / r1) * (
        d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
    lng = (d - (1 + 2 * t1 + c1) * d**3 / 6
           + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120) / cos1
    return math.degrees(lat), -123.0 + math.degrees(lng)  # zone 10 central meridian


def quantise(v: float, lo: float, hi: float) -> int:
    return min(GRID, max(0, round((v - lo) / (hi - lo) * GRID)))


def main() -> None:
    if not SRC.exists():
        sys.exit(f"Missing {SRC}. Download 'All years, all neighbourhoods' (and 2022) from geodash.vpd.ca/opendata.")

    rows = []
    with SRC.open(newline="") as f:
        for r in csv.DictReader(f):
            try:
                year, month, day = int(r["YEAR"]), int(r["MONTH"]), int(r["DAY"])
                dow = (date(year, month, day).weekday() + 1) % 7  # Python Monday=0 -> Sunday=0
            except (ValueError, TypeError):
                continue
            hour = int(r["HOUR"]) if r["HOUR"] not in ("", None) else None
            minute = int(r["MINUTE"]) if r["MINUTE"] not in ("", None) else None
            # VPD records unknown or withheld times as exactly 00:00, so treat that as unknown.
            if hour is None or (hour == 0 and (minute or 0) == 0):
                hour = None
            try:
                x, y = float(r["X"] or 0), float(r["Y"] or 0)
            except ValueError:
                x = y = 0.0
            lat = lng = None
            if x > 0 and y > 0:
                la, ln = utm10n_to_latlng(x, y)
                if BBOX["south"] <= la <= BBOX["north"] and BBOX["west"] <= ln <= BBOX["east"]:
                    lat, lng = la, ln
            rows.append((r["TYPE"].strip(), year, month, dow, hour, (r["NEIGHBOURHOOD"] or "").strip(), lat, lng))

    types = sorted({r[0] for r in rows})
    hoods = sorted({r[5] for r in rows if r[5]})
    year_base = min(r[1] for r in rows)
    t_idx = {t: i for i, t in enumerate(types)}
    h_idx = {h: i for i, h in enumerate(hoods)}

    # Sorting groups similar values together, which makes gzip much more effective.
    rows.sort(key=lambda r: (r[1], r[2], r[0], r[5], r[6] or 0, r[7] or 0))

    cols_u8 = [array("B") for _ in range(6)]
    lat_col, lng_col = array("H"), array("H")
    for t, yr, mo, dw, hr, hd, la, ln in rows:
        cols_u8[0].append(t_idx[t])
        cols_u8[1].append(yr - year_base)
        cols_u8[2].append(mo)
        cols_u8[3].append(dw)
        cols_u8[4].append(UNKNOWN_U8 if hr is None else hr)
        cols_u8[5].append(h_idx.get(hd, UNKNOWN_U8))
        if la is None:
            lat_col.append(NO_LOC); lng_col.append(NO_LOC)
        else:
            lat_col.append(quantise(la, BBOX["south"], BBOX["north"]))
            lng_col.append(quantise(ln, BBOX["west"], BBOX["east"]))
    if sys.byteorder != "little":
        lat_col.byteswap(); lng_col.byteswap()

    raw = b"".join(c.tobytes() for c in cols_u8) + lat_col.tobytes() + lng_col.tobytes()
    OUT_BIN.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))

    years = Counter(r[1] for r in rows)
    last = max((r[1], r[2]) for r in rows)
    meta = {
        "n": len(rows),
        "types": types,
        "neighbourhoods": hoods,
        "yearBase": year_base,
        "years": sorted(years),
        "countsByYear": {str(k): v for k, v in sorted(years.items())},
        "latestMonth": f"{last[0]}-{last[1]:02d}",
        "bbox": BBOX,
        "grid": GRID,
        "unknownTimeShare": round(sum(1 for r in rows if r[4] is None) / len(rows), 4),
        "noLocationShare": round(sum(1 for r in rows if r[6] is None) / len(rows), 4),
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": "Vancouver Police Department open data (geodash.vpd.ca/opendata)",
    }
    OUT_META.write_text(json.dumps(meta, indent=1))

    print(f"{len(rows):,} incidents, {len(types)} types, {len(hoods)} neighbourhoods, "
          f"{years and min(years)}-{last[0]}-{last[1]:02d}")
    print(f"raw {len(raw)/1e6:.1f} MB -> {OUT_BIN.name} {OUT_BIN.stat().st_size/1e6:.2f} MB, "
          f"{OUT_META.name} {OUT_META.stat().st_size/1e3:.1f} KB")
    print(f"unknown time {meta['unknownTimeShare']:.1%}, no location {meta['noLocationShare']:.1%}")


if __name__ == "__main__":
    main()
