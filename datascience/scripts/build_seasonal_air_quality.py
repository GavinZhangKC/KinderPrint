"""Month-by-month fine-particle (PM2.5) pattern at the nearest EPA monitor to each SA2.

Inputs
------
data/processed/epa_air_quality_station_daily.csv
    Daily means of hourly EPA AirWatch observations, 2018-2025.
data/processed/epa_air_quality_stations.csv
    Monitoring-station coordinates.
data/reference/sa2_lga_2023_vic.csv
    ABS ASGS Edition 3 SA2 label points.
data/processed/healthdirect_facility_counts_sa2.csv
    The Greater Melbourne SA2s served by the application.

Method
------
A day counts when at least 18 of 24 hourly values are valid (75% completeness).
Each SA2 is assigned the nearest station (straight-line distance from its ABS
label point) that has at least 730 valid PM2.5 days. For every calendar month
the output gives the number of valid days, the mean of daily means, and the
number of days above the 24-hour PM2.5 standard of 25 ug/m3 in the National
Environment Protection (Ambient Air Quality) Measure.

The values describe the monitor, not exposure inside the SA2. They are a
record of past seasons, not a forecast.

Output
------
data/processed/seasonal_air_quality_sa2.csv
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DAILY = ROOT / "data" / "processed" / "epa_air_quality_station_daily.csv"
STATIONS = ROOT / "data" / "processed" / "epa_air_quality_stations.csv"
SA2_POINTS = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
SA2_SCOPE = ROOT / "data" / "processed" / "healthdirect_facility_counts_sa2.csv"
OUTPUT = ROOT / "data" / "processed" / "seasonal_air_quality_sa2.csv"

POLLUTANT = "PM2.5"
STANDARD_UG_M3 = 25.0
MIN_VALID_HOURS = 18
MIN_STATION_DAYS = 730


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def station_months(daily: pd.DataFrame) -> pd.DataFrame:
    frame = daily[(daily.pollutant == POLLUTANT) & (daily.valid_hours >= MIN_VALID_HOURS)].reset_index(drop=True)
    frame["month"] = pd.to_datetime(frame.date_local).dt.month
    frame["above"] = frame.daily_mean > STANDARD_UG_M3
    grouped = frame.groupby(["station_name", "month"])
    out = grouped.agg(
        valid_days=("daily_mean", "size"),
        mean_daily_ug_m3=("daily_mean", "mean"),
        days_above_standard=("above", "sum"),
        first_year=("year", "min"),
        last_year=("year", "max"),
    ).reset_index()
    peak = frame.loc[grouped.daily_mean.idxmax(), ["station_name", "month", "daily_mean", "date_local"]]
    peak = peak.rename(columns={"daily_mean": "highest_daily_ug_m3", "date_local": "highest_daily_date"})
    return out.merge(peak, on=["station_name", "month"])


def build(daily: pd.DataFrame, stations: pd.DataFrame, points: pd.DataFrame, scope: pd.Series) -> pd.DataFrame:
    months = station_months(daily)
    totals = months.groupby("station_name").valid_days.sum()
    eligible = stations[stations.station_name.isin(totals[totals >= MIN_STATION_DAYS].index)]
    if eligible.empty:
        raise ValueError("No station has enough valid PM2.5 days")
    points = points.copy()
    points["sa2_code_2021"] = points.sa2_code_2021.astype(str).str.zfill(9)
    points = points[points.sa2_code_2021.isin(set(scope.astype(str).str.zfill(9)))]
    missing = set(scope.astype(str).str.zfill(9)) - set(points.sa2_code_2021)
    if missing:
        raise ValueError(f"SA2s without a label point: {sorted(missing)}")
    rows = []
    for sa2 in points.itertuples():
        distances = [
            (haversine_km(sa2.label_point_latitude, sa2.label_point_longitude, s.latitude, s.longitude), s.station_name)
            for s in eligible.itertuples()
        ]
        distance, station = min(distances)
        for m in months[months.station_name == station].itertuples():
            rows.append({
                "sa2_code": sa2.sa2_code_2021,
                "sa2_name": sa2.sa2_name_2021,
                "station_name": station,
                "station_distance_km": round(distance, 1),
                "pollutant": POLLUTANT,
                "month": int(m.month),
                "valid_days": int(m.valid_days),
                "mean_daily_ug_m3": round(float(m.mean_daily_ug_m3), 2),
                "days_above_standard": int(m.days_above_standard),
                "standard_ug_m3": STANDARD_UG_M3,
                "highest_daily_ug_m3": round(float(m.highest_daily_ug_m3), 1),
                "highest_daily_date": m.highest_daily_date,
                "first_year": int(m.first_year),
                "last_year": int(m.last_year),
                "interpretation": "MONITOR_OBSERVATION_ONLY_NOT_SA2_EXPOSURE",
                "source_id": "epa_victoria_validated_hourly_air_2018_2025;abs_sa2_lga_label_point_2023",
            })
    return pd.DataFrame(rows).sort_values(["sa2_code", "month"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build(
        pd.read_csv(DAILY, dtype={"station_id": str}),
        pd.read_csv(STATIONS),
        pd.read_csv(SA2_POINTS, dtype={"sa2_code_2021": str}),
        pd.read_csv(SA2_SCOPE, dtype={"sa2_code": str}).sa2_code,
    )
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} rows for {result.sa2_code.nunique()} SA2s to {args.output}")


if __name__ == "__main__":
    main()
