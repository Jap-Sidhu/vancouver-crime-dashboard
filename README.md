# Vancouver Crime Dashboard

An interactive web-based dashboard for visualizing crime data from the Vancouver Police Department (VPD). This dashboard provides comprehensive insights into crime patterns across Vancouver through interactive maps, charts, and filters.

## Features

- **Interactive Map**: Visualize crime incidents across Vancouver with color-coded markers
- **Dynamic Filters**: Filter data by year, crime type, neighbourhood, and month range
- **Key Statistics**: Real-time statistics showing total incidents, most common crimes, peak hours, and hotspot neighbourhoods
- **Multiple Visualizations**:
  - Crime type distribution (horizontal bar chart)
  - Top 10 neighbourhoods by incident count
  - Time series analysis showing trends over time
  - Hourly distribution of incidents
  - Day of week patterns
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Dark Theme**: Easy on the eyes for extended data analysis

## Project Structure

```
vancouver-crime-dashboard/
├── index.html              # Main HTML file
├── css/
│   └── styles.css         # Stylesheet
├── js/
│   ├── main.js            # Main application logic
│   ├── charts.js          # D3.js chart visualizations
│   └── map.js             # Leaflet.js map functionality
├── data/
│   └── Crimedata_csv_all_years.csv  # VPD crime data (you need to add this)
└── README.md              # This file
```

## Setup Instructions

### 1. Download VPD Crime Data

1. Visit the VPD Open Data portal or GeoDASH
2. Download the `Crimedata_csv_all_years.csv` file
3. Place it in the `data/` folder

### 2. File Organization

Create the following folder structure:

```
vancouver-crime-dashboard/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── main.js
│   ├── charts.js
│   └── map.js
└── data/
    └── Crimedata_csv_all_years.csv
```

### 3. Running the Dashboard

**Option 1: Using a Local Web Server (Recommended)**

Due to browser security restrictions with loading local CSV files, you need to run a local web server:

**Using Python:**
```bash
# Python 3
python -m http.server 8000

# Then open http://localhost:8000 in your browser
```

**Using Node.js:**
```bash
# Install http-server globally
npm install -g http-server

# Run server
http-server -p 8000

# Then open http://localhost:8000 in your browser
```

**Using PHP:**
```bash
php -S localhost:8000
```

**Option 2: Using VS Code Live Server**

1. Install the "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

## Data Structure

The dashboard expects a CSV file with the following columns:

- `TYPE`: Crime type (e.g., "Theft from Vehicle", "Offence Against a Person")
- `YEAR`: Year of incident
- `MONTH`: Month (1-12)
- `DAY`: Day of month
- `HOUR`: Hour in 24-hour format (may be empty for privacy)
- `MINUTE`: Minute (may be empty for privacy)
- `HUNDRED_BLOCK`: Generalized location
- `NEIGHBOURHOOD`: Vancouver neighbourhood name
- `X`: UTM Zone 10 X coordinate
- `Y`: UTM Zone 10 Y coordinate

## Crime Categories

The dashboard categorizes crimes into three groups:

**Crimes Against Persons** (Red markers):
- Offence Against a Person
- Homicide

**Property Crimes** (Blue markers):
- Theft from Vehicle
- Theft of Vehicle
- Theft of Bicycle
- Other Theft
- BNE Commercial
- BNE Residential/Other

**Other Crimes** (Orange markers):
- Mischief
- Vehicle Collision or Pedestrian Struck (with Fatality)
- Vehicle Collision or Pedestrian Struck (with Injury)

## Features Explained

### Filters
- **Year Filter**: Select specific year or view all years
- **Crime Type Filter**: Select/deselect specific crime types
- **Neighbourhood Filter**: Focus on specific neighbourhoods
- **Month Range**: Filter by month range (supports wrap-around, e.g., Oct-Feb)

### Charts
- **Crime Type Distribution**: Shows the count of each crime type
- **Top Neighbourhoods**: Displays the 10 neighbourhoods with most incidents
- **Time Series**: Shows trend of incidents over time
- **Hourly Distribution**: Reveals what hours have most crime activity
- **Day of Week**: Shows which days have more incidents

### Map
- Color-coded markers based on crime category
- Click markers for detailed incident information
- Automatically adjusts to show filtered data
- Limited to 5,000 points for performance

## Technical Details

### Technologies Used
- **HTML5**: Structure
- **CSS3**: Styling with flexbox and grid layouts
- **Vanilla JavaScript**: Application logic
- **D3.js v7**: Data visualization and charts
- **Leaflet.js**: Interactive mapping

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance Considerations
- Map limited to 5,000 random samples for large datasets
- Charts use efficient D3.js rendering
- Filters update in real-time with debouncing

## Customization

### Changing Colors
Edit the `getCrimeColor()` function in `main.js`:

```javascript
function getCrimeColor(crimeType) {
    if (CRIME_CATEGORIES.person.includes(crimeType)) {
        return '#ff4444'; // Change this color
    }
    // ... etc
}
```

### Adjusting Map Tiles
Edit the tile layer in `map.js`:

```javascript
L.tileLayer('YOUR_TILE_URL_HERE', {
    // options
}).addTo(map);
```

Popular alternatives:
- OpenStreetMap: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- CartoDB Light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`

### Modifying Chart Dimensions
Chart dimensions are set in each chart function in `charts.js`. Look for the `margin`, `width`, and `height` variables.

## Troubleshooting

### CSV File Not Loading
- **Issue**: "Error loading data" message
- **Solution**: Make sure you're running a local web server (see Setup section)
- **Check**: File path is correct: `data/Crimedata_csv_all_years.csv`

### Map Not Showing Markers
- **Issue**: Map loads but no markers appear
- **Solution**: Check if your CSV has valid X and Y coordinates
- **Note**: Some records have coordinates marked as "Offset to Protect Privacy"

### Charts Not Displaying
- **Issue**: Chart sections show "No data available"
- **Solution**: Check your filters - you may have filtered out all data
- **Try**: Click "Reset All Filters" button

### Performance Issues
- **Issue**: Dashboard is slow with large datasets
- **Solution**: The map automatically limits to 5,000 points
- **Consider**: Filtering to a specific year or neighbourhood

## Privacy & Legal

This dashboard uses publicly available data from the Vancouver Police Department. Please note:

- Location data is intentionally offset for privacy protection
- Time information is omitted for "Offence Against a Person" crimes
- Data should not be used to identify individuals or specific properties
- See VPD's legal disclaimer for full details

## Future Enhancements

Potential features for future versions:
- Heatmap layer for crime density
- Comparison mode (year-over-year)
- Export filtered data to CSV
- Crime prediction modeling
- Neighbourhood comparison tool
- Mobile app version

## Credits

- Data Source: Vancouver Police Department Open Data
- Map Tiles: CARTO
- Libraries: D3.js, Leaflet.js

## License

This project is for educational and personal use. Please refer to VPD's data licensing terms for the crime data usage.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify your CSV file format matches VPD's official format
3. Ensure you're running a local web server

---

**Happy Analyzing! 📊🗺️**
