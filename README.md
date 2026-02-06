# Vancouver Crime Dashboard

An interactive web dashboard for visualizing crime data from the Vancouver Police Department (2003-2026).

## Features

- **Interactive Map**: View crime incidents across Vancouver with color-coded markers
- **Dynamic Charts**: Analyze crime patterns by type, location, time, and day of week
- **Smart Filters**: Filter data by year, crime type, neighbourhood, and month range
- **Real-time Statistics**: View total incidents, most common crimes, peak hours, and hotspots



## Project Structure

```
vancouver-crime-dashboard/
├── index.html          # Main page
├── css/
│   └── styles.css      # Styling
├── js/
│   ├── main.js         # Core logic
│   ├── charts.js       # Visualizations
│   └── map.js          # Map functionality
└── data/
    └── Crimedata_csv_all_years.csv  # Your CSV file goes here
```

## Technologies

- HTML5, CSS3, JavaScript
- D3.js v7 (charts)
- Leaflet.js (maps)
- Proj4js (coordinate conversion)

## Data Source

Crime data from the Vancouver Police Department Open Data Portal covering January 2003 to February 2026.

**Important Geographic Coverage Note**: 
- This data covers **City of Vancouver only** (VPD jurisdiction)
- **North Vancouver** and **West Vancouver** are NOT included as they have separate police departments:
  - North Vancouver: Policed by RCMP (Royal Canadian Mounted Police)
  - West Vancouver: West Vancouver Police Department
- If you need crime data for these municipalities, you must obtain separate datasets from their respective police departments

**Note**: Location data is offset for privacy protection and should not be used to identify specific properties or individuals.


## License

MIT

---

**Built with ❤️ for Vancouver crime data analysis**