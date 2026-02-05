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
    └── Crimedata_csv_all_years.csv  
```

## Technologies

- HTML5, CSS3, JavaScript
- D3.js v7 (charts)
- Leaflet.js (maps)
- Proj4js (coordinate conversion)

## Data Source

Crime data from the Vancouver Police Department Open Data Portal covering January 2003 to February 2026.

**Note**: Location data is offset for privacy protection and should not be used to identify specific properties or individuals.


## License

Educational and personal use. Data provided by VPD Geo Dash open data.

---

**Built with ❤️ for Vancouver crime data analysis**