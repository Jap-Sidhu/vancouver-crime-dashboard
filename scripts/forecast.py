"""Forecast weekly crime counts by neighbourhood and type, and check them honestly.

Input:  data/Crimedata_csv_all_years.csv
Output: data/forecast.json   history, 8-week forecasts with 80% ranges, test metrics

Run:    .venv/bin/python scripts/forecast.py      (needs pandas, numpy, scikit-learn)

What is predicted
    The number of incidents per week for every neighbourhood x crime type, plus the
    "all neighbourhoods" and "all types" totals. It does not predict individual incidents,
    places or times: the data is aggregated and location-offset, and per-incident
    prediction would mostly learn where crime was recorded before.

How
    Every feature uses data at least 8 weeks old, so one model can forecast any of the
    next 8 weeks. Features: recent lags and averages, the same weeks last year, season,
    long-run trend, and which neighbourhood / type the series is.
    Models compared on 2025 onward (trained on everything before):
      seasonal naive   same week last year
      recent average   average of the 13 most recent usable weeks
      Poisson GLM      linear model for counts
      gradient boost   HistGradientBoosting with a Poisson loss (used for the forecast)
    Totals ("all types", "all neighbourhoods") are the sum of the neighbourhood x type
    forecasts, which beat predicting each total directly.
    Ranges: count noise grows with the square root of the count, so errors are measured
    as (actual - forecast) / sqrt(forecast + 1). The 80th percentile of their size per level
    are taken from 2022-2024 (with models trained before 2022), giving an 80% range, and the
    test period checks that coverage on data neither step has seen.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "Crimedata_csv_all_years.csv"
OUT = ROOT / "data" / "forecast.json"

HORIZON = 8                 # weeks ahead, and the minimum age of any feature
HISTORY_WEEKS = 26          # actual weeks shipped to the dashboard for context
REPORTING_LAG_DAYS = 10     # recent weeks are under-counted until late reports arrive
CAL_START = "2022-01-03"    # calibration years for the ranges: 2022-2024 (a Monday)
TEST_START = "2025-01-06"   # first Monday of 2025
TARGET_COVERAGE = 0.80
ALL = "All"
SEED = 7


def weekly_counts() -> tuple[pd.DataFrame, pd.Timestamp]:
    df = pd.read_csv(SRC, usecols=["TYPE", "YEAR", "MONTH", "DAY", "NEIGHBOURHOOD"])
    date = pd.to_datetime(dict(year=df.YEAR, month=df.MONTH, day=df.DAY), errors="coerce")
    df = df.assign(week=(date - pd.to_timedelta(date.dt.weekday, unit="D")).dt.normalize(),
                   hood=df.NEIGHBOURHOOD.fillna("").str.strip(), type=df.TYPE.str.strip())
    df = df.dropna(subset=["week"])

    last_ok = date.max() - pd.Timedelta(days=REPORTING_LAG_DAYS)
    df = df[df.week + pd.Timedelta(days=6) <= last_ok]
    weeks = pd.date_range(df.week.min(), df.week.max(), freq="W-MON")

    # One column per series: every (hood, type), plus totals over hoods and over types
    parts = [
        df[df.hood != ""].groupby(["week", "hood", "type"]).size(),
        df[df.hood != ""].groupby(["week", "hood"]).size().rename(lambda x: x, level=0)
          .to_frame("n").assign(type=ALL).set_index("type", append=True)["n"],
        df.groupby(["week", "type"]).size().to_frame("n").assign(hood=ALL)
          .set_index("hood", append=True)["n"].reorder_levels(["week", "hood", "type"]),
        df.groupby("week").size().to_frame("n").assign(hood=ALL, type=ALL)
          .set_index(["hood", "type"], append=True)["n"],
    ]
    counts = pd.concat(parts).unstack(["hood", "type"]).reindex(weeks).fillna(0)
    return counts, weeks[-1]


def build_features(counts: pd.DataFrame) -> pd.DataFrame:
    """Long table: one row per (week, series) with features that are all >= HORIZON weeks old."""
    v = counts.to_numpy(dtype=float)
    shifted = lambda k: np.vstack([np.full((k, v.shape[1]), np.nan), v[:-k]])
    roll = lambda k, w: pd.DataFrame(shifted(k)).rolling(w, min_periods=w).mean().to_numpy()

    feats = {
        "lag8": shifted(8), "lag9": shifted(9), "lag10": shifted(10), "lag12": shifted(12),
        "mean13": roll(8, 13),                    # weeks t-8 .. t-20
        "mean52": roll(8, 52),                    # weeks t-8 .. t-59
        "last_year": roll(51, 3),                 # weeks t-51 .. t-53, centred on last year
    }
    weeks = counts.index
    n_w, n_s = v.shape
    rows = pd.DataFrame({
        "week": np.repeat(weeks, n_s),
        "hood": np.tile(counts.columns.get_level_values("hood"), n_w),
        "type": np.tile(counts.columns.get_level_values("type"), n_w),
        "y": v.reshape(-1),
        **{k: a.reshape(-1) for k, a in feats.items()},
    })
    woy = rows.week.dt.isocalendar().week.astype(float)
    rows["woy_sin"] = np.sin(2 * np.pi * woy / 52.18)
    rows["woy_cos"] = np.cos(2 * np.pi * woy / 52.18)
    rows["years"] = (rows.week - weeks[0]).dt.days / 365.25
    return rows


NUMERIC = ["lag8", "lag9", "lag10", "lag12", "mean13", "mean52", "last_year", "woy_sin", "woy_cos", "years"]
CATS = ["hood", "type"]


def hgb(**kw):
    return HistGradientBoostingRegressor(categorical_features="from_dtype", max_iter=400,
                                         learning_rate=0.05, max_leaf_nodes=48,
                                         l2_regularization=1.0, random_state=SEED, **kw)


def as_model_input(df: pd.DataFrame) -> pd.DataFrame:
    x = df[NUMERIC + CATS].copy()
    for c in CATS:
        x[c] = x[c].astype("category")
    return x


def glm():
    # Counts are skewed, so the linear model sees log(1 + count) for the lag features
    lag_cols = [c for c in NUMERIC if c.startswith(("lag", "mean", "last"))]
    other = [c for c in NUMERIC if c not in lag_cols]
    pre = ColumnTransformer([("lags", make_pipeline(FunctionTransformer(np.log1p), StandardScaler()), lag_cols),
                             ("num", StandardScaler(), other),
                             ("cat", OneHotEncoder(handle_unknown="ignore"), CATS)])
    return make_pipeline(pre, PoissonRegressor(alpha=1e-4, max_iter=500))


def scores(y, p) -> dict:
    err = np.abs(y - p)
    return {"mae": round(float(err.mean()), 3), "wape": round(float(err.sum() / max(y.sum(), 1e-9)), 4)}


def level_of(df: pd.DataFrame) -> pd.Series:
    return np.select(
        [(df.hood != ALL) & (df.type != ALL), (df.hood != ALL) & (df.type == ALL),
         (df.hood == ALL) & (df.type != ALL)],
        ["neighbourhood_x_type", "neighbourhood_total", "type_total"], "city_total")


def fit_predict(train: pd.DataFrame, target: pd.DataFrame) -> pd.DataFrame:
    """Train on `train`, return `target` with the forecast mean (totals built bottom-up)."""
    out = target[["week", "hood", "type"]].copy()
    model = hgb(loss="poisson").fit(as_model_input(train), train.y)
    out["mean"] = np.clip(model.predict(as_model_input(target)), 0, None)

    # Bottom-up totals: replace every total's mean with the sum of its parts
    base = out[(out.hood != ALL) & (out.type != ALL)]
    sums = {
        "hood": base.groupby(["week", "hood"], observed=True)["mean"].sum(),
        "type": base.groupby(["week", "type"], observed=True)["mean"].sum(),
        "city": base.groupby("week")["mean"].sum(),
    }
    is_h, is_t = out.hood == ALL, out.type == ALL
    m = ~is_h & is_t
    out.loc[m, "mean"] = sums["hood"].reindex(pd.MultiIndex.from_frame(out.loc[m, ["week", "hood"]])).to_numpy()
    m = is_h & ~is_t
    out.loc[m, "mean"] = sums["type"].reindex(pd.MultiIndex.from_frame(out.loc[m, ["week", "type"]])).to_numpy()
    m = is_h & is_t
    out.loc[m, "mean"] = sums["city"].reindex(out.loc[m, "week"]).to_numpy()
    out["level"] = level_of(out)
    return out


def scaled_error(y: np.ndarray, mean: np.ndarray) -> np.ndarray:
    return (y - mean) / np.sqrt(mean + 1)


def calibrate(pred: pd.DataFrame, y: np.ndarray) -> dict:
    """Per level: the scaled error size that 80% of calibration weeks stay within.

    Symmetric on purpose: whether the model runs high or low flips between periods
    (e.g. the post-2020 rebound), so a lopsided band learned in one period points the
    wrong way in the next.
    """
    errs = np.abs(scaled_error(y, pred["mean"].to_numpy()))
    out = {}
    for level in pred.level.unique():
        q = float(np.quantile(errs[(pred.level == level).to_numpy()], TARGET_COVERAGE))
        out[level] = [round(-q, 3), round(q, 3)]
    return out


def apply_ranges(pred: pd.DataFrame, bands: dict) -> pd.DataFrame:
    lo_z = pred.level.map(lambda l: bands[l][0]).astype(float)
    hi_z = pred.level.map(lambda l: bands[l][1]).astype(float)
    spread = np.sqrt(pred["mean"] + 1)
    pred["lo"] = np.clip(pred["mean"] + lo_z * spread, 0, None)
    pred["hi"] = np.clip(pred["mean"] + hi_z * spread, pred["mean"], None)
    return pred


def main() -> None:
    counts, last_week = weekly_counts()
    rows = build_features(counts).dropna(subset=NUMERIC)
    cat_levels = {c: sorted(rows[c].unique()) for c in CATS}
    for c in CATS:
        rows[c] = pd.Categorical(rows[c], categories=cat_levels[c])

    # 1) Calibrate range widths on 2022-2024 with models that never saw those years
    cal = rows[(rows.week >= CAL_START) & (rows.week < TEST_START)]
    cal_pred = fit_predict(rows[rows.week < CAL_START], cal)
    scale = calibrate(cal_pred, cal.y.to_numpy())

    # 2) Test on 2025 onward with models trained on everything before
    train = rows[rows.week < TEST_START]
    test = rows[rows.week >= TEST_START]
    print(f"{counts.shape[1]} series, weeks {counts.index[0].date()} → {last_week.date()}, "
          f"train {len(train):,} rows, test {len(test):,} rows")
    pred = apply_ranges(fit_predict(train, test), scale)
    glm_pred = glm().fit(train[NUMERIC + CATS], train.y).predict(test[NUMERIC + CATS])

    y = test.y.to_numpy()
    candidates = {
        "seasonal_naive": test.last_year.to_numpy(),
        "recent_average": test.mean13.to_numpy(),
        "poisson_glm": glm_pred,
        "gradient_boosting": pred["mean"].to_numpy(),
    }
    metrics, coverage = {}, {}
    for level in ["neighbourhood_x_type", "neighbourhood_total", "type_total", "city_total"]:
        m = (pred.level == level).to_numpy()
        metrics[level] = {name: scores(y[m], p[m]) for name, p in candidates.items()}
        coverage[level] = round(float(((y[m] >= pred.lo.to_numpy()[m]) & (y[m] <= pred.hi.to_numpy()[m])).mean()), 3)
        res = metrics[level]
        best = min(res, key=lambda k: res[k]["mae"])
        print(f"\n{level}   (80% range covered {coverage[level]:.1%}, band {scale[level]})")
        for name, r in res.items():
            print(f"  {name:<18} MAE {r['mae']:8.3f}   WAPE {r['wape']:.1%}{'   <- best' if name == best else ''}")

    # 3) Refit on everything, then forecast the next HORIZON weeks
    future_weeks = pd.date_range(pd.Timestamp(last_week) + pd.Timedelta(weeks=1), periods=HORIZON, freq="W-MON")
    extended = pd.concat([counts, pd.DataFrame(np.nan, index=future_weeks, columns=counts.columns)])
    fut = build_features(extended)
    fut = fut[fut.week.isin(future_weeks)].copy()
    for c in CATS:
        fut[c] = pd.Categorical(fut[c], categories=cat_levels[c])
    fut = apply_ranges(fit_predict(rows, fut), scale)

    hist = counts.iloc[-HISTORY_WEEKS:]
    fut = fut.set_index(["hood", "type"]).sort_values("week")
    series = {}
    for (hood, typ), col in hist.items():
        f = fut.loc[(hood, typ)]
        series[f"{hood}|{typ}"] = {
            "actual": [int(x) for x in col.to_numpy()],
            "mean": [round(float(x), 1) for x in f["mean"]],
            "lo": [round(float(x), 1) for x in f["lo"]],
            "hi": [round(float(x), 1) for x in f["hi"]],
        }

    out = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "lastWeek": last_week.strftime("%Y-%m-%d"),
        "historyWeeks": [w.strftime("%Y-%m-%d") for w in hist.index],
        "forecastWeeks": [w.strftime("%Y-%m-%d") for w in future_weeks],
        "hoods": [h for h in cat_levels["hood"] if h != ALL],
        "types": [t for t in cat_levels["type"] if t != ALL],
        "all": ALL,
        "test": {"from": TEST_START, "to": last_week.strftime("%Y-%m-%d"),
                 "metrics": metrics, "coverage80": coverage, "rangeScale": scale},
        "series": series,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e3:.0f} KB), "
          f"forecast {future_weeks[0].date()} → {future_weeks[-1].date()}")


if __name__ == "__main__":
    main()
