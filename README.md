# The Vancouver Crime Record

An interactive dashboard of **965,133 Vancouver Police Department incidents (January 2003 – October 2026)**, with a heat map, filters, trend charts, and a machine-learning **8-week forecast** by neighbourhood and crime type.

**Live:** [vancouver-crime-dashboard.vercel.app](https://vancouver-crime-dashboard.vercel.app)

## Features

- **Heat map** of incident density at roughly 30 m resolution, scaled logarithmically so quieter neighbourhoods stay visible next to downtown
- **Filters** by year, neighbourhood, month range and crime type, recalculating every chart in well under 100 ms
- **Charts:** incidents over time, by type, hour of day, day of week, and the top 10 neighbourhoods
- **Forecast:** expected weekly incidents for the next 8 weeks for any neighbourhood and crime type, with an 80% likely range and the model's measured accuracy
- **Honest data notes:** incidents with no recorded time or no published location are counted and labelled, not silently dropped or misplotted

## Performance

The browser used to download and parse the full 89 MB CSV on every visit. A build step now packs it into typed columns:

| | Before | After |
|---|---:|---:|
| Data downloaded per visit | 89 MB CSV | **3.2 MB** (gzip, 10 bytes per incident) |
| Browser memory | ~425 MB | **~58 MB** |
| Re-filtering all 965k incidents | rebuilt 965k objects | **one pass over typed arrays, 40–90 ms including redraw** |

## The forecast

`scripts/forecast.py` predicts **how many** incidents will be recorded each week, for every neighbourhood × crime type plus the neighbourhood, type and city totals (298 series). It never predicts individual incidents, places or times. The data is location-offset, and per-incident prediction would mostly learn where crime was *recorded*, not where it happens.

**Method**

- **Features:** lagged weekly counts, 13- and 52-week averages, the same weeks last year, season (week of year), and long-run trend. Every feature is at least 8 weeks old, so one model covers the whole 8-week horizon.
- **Model:** scikit-learn `HistGradientBoostingRegressor` with a Poisson loss, using neighbourhood and type as categorical features.
- **Totals** are built bottom-up by summing the neighbourhood × type forecasts. That beat predicting each total directly; for the city total, error fell from 11.7% to 8.8%.
- **80% ranges:** errors are scaled by √(forecast + 1), the way count noise grows. The band width per level is calibrated on 2022–2024 using models trained only on earlier data.
- **Reporting lag:** the most recent ~10 days are left out, because late reports make them look artificially low.

**Results**, trained on 2003–2024 and tested on Jan 2025 – Oct 2026, data the model never saw. The figures are weighted absolute percentage error (lower is better):

| Level | Same week last year | Recent 13-week avg | Poisson GLM | **Gradient boosting** | Test weeks in 80% range |
|---|---:|---:|---:|---:|---:|
| Neighbourhood × type | 47.1% | 42.9% | 46.8% | **42.0%** | 81.4% |
| Neighbourhood total | 22.3% | 20.4% | 19.7% | **19.6%** | 83.4% |
| Crime type, city-wide | 17.7% | 17.0% | 16.2% | **15.9%** | 81.3% |
| City total | 9.3% | 10.4% | 9.6% | **8.8%** | 94.6% |

Gradient boosting is the most accurate at every level. Its edge over the simple baselines is real but modest: weekly crime counts in one neighbourhood are noisy, and a single neighbourhood's weekly count for one crime type is often 0–5. The ranges hit their 80% target at the three finer levels. City-wide they're cautious, because whether the model runs high or low there flips between periods.

## Data

- **Source:** [VPD Open Data](https://geodash.vpd.ca/opendata/). This covers the **City of Vancouver only**. North and West Vancouver have separate police services and aren't included.
- **2022 is a separate download.** VPD's "All years" export skips 2022, so download the 2022 file as well and merge it, as described below.
- **Unknown times.** About 12% of incidents are logged at exactly 00:00, VPD's placeholder for unknown or withheld times. They're excluded from the peak-hour stat and the hourly chart, and the share is shown.
- **No location.** About 9% of incidents have no coordinates, mostly offences against a person, which VPD withholds for privacy. They're counted everywhere except the map, and the map says how many are missing.
- **Offset locations.** Published locations are offset to the hundred block and shouldn't be used to identify specific properties or people. See `data/legal_disclaimer.txt`.

## Refreshing the data

```bash
# 1. Download from https://geodash.vpd.ca/opendata/ :
#    "All years, all neighbourhoods" (CSV) and "2022, all neighbourhoods" (CSV)
# 2. Combine them into data/Crimedata_csv_all_years.csv (skip the 2022 file's header line)
cp ~/Downloads/crimedata_csv_AllNeighbourhoods_AllYears/crimedata_csv_AllNeighbourhoods_AllYears.csv data/Crimedata_csv_all_years.csv
tail -n +2 ~/Downloads/crimedata_csv_AllNeighbourhoods_2022/crimedata_csv_AllNeighbourhoods_2022.csv >> data/Crimedata_csv_all_years.csv

# 3. Rebuild the site's data files
python3 scripts/build_data.py                      # -> data/incidents.bin.gz, data/meta.json

# 4. Retrain and re-run the forecast (about a minute)
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/forecast.py               # -> data/forecast.json, prints the test results
```

## Run locally

It's a static site, so any web server works:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

## Technologies

- **Frontend:** HTML, CSS, JavaScript, D3.js v7, Leaflet with Leaflet.heat, Esri basemap
- **Data pipeline:** Python (standard library); UTM to latitude/longitude conversion done at build time
- **Forecasting:** pandas, NumPy, scikit-learn (HistGradientBoosting, PoissonRegressor)

## License

MIT
