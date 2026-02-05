# Quick Start Guide - Vancouver Crime Dashboard

## Step-by-Step Setup (5 minutes)

### Step 1: Get Your Files Ready
You should have downloaded this project folder with the following structure:
```
vancouver-crime-dashboard/
├── index.html
├── README.md
├── QUICKSTART.md (this file)
├── css/
│   └── styles.css
├── js/
│   ├── main.js
│   ├── charts.js
│   └── map.js
└── data/
    └── PLACE_CSV_HERE.md
```

### Step 2: Download VPD Crime Data
1. You need to get the `Crimedata_csv_all_years.csv` file
2. Since your file is too large to upload, you already have it!
3. **Place it in the `data/` folder**
4. The path should be: `vancouver-crime-dashboard/data/Crimedata_csv_all_years.csv`

### Step 3: Run a Local Web Server

**Why?** Modern browsers block loading local CSV files for security. A local server solves this.

**Choose ONE method:**

#### Option A: Python (Easiest if you have Python)
```bash
# Open terminal/command prompt in the project folder
cd vancouver-crime-dashboard

# Python 3 (most common)
python -m http.server 8000

# Or Python 2
python -m SimpleHTTPServer 8000
```

Then open your browser to: **http://localhost:8000**

#### Option B: Node.js
```bash
# Install http-server (one-time)
npm install -g http-server

# Run from project folder
cd vancouver-crime-dashboard
http-server -p 8000
```

Then open: **http://localhost:8000**

#### Option C: VS Code Live Server
1. Open VS Code
2. Install "Live Server" extension
3. Right-click `index.html`
4. Click "Open with Live Server"

#### Option D: PHP
```bash
cd vancouver-crime-dashboard
php -S localhost:8000
```

Then open: **http://localhost:8000**

### Step 4: Use the Dashboard!

Once the page loads:
1. Wait for data to load (may take 10-30 seconds for large files)
2. The loading spinner will disappear
3. Explore the filters, charts, and map!

## Common Issues & Solutions

### ❌ "Error loading data"
**Problem:** CSV file not found or wrong path
**Solution:** 
- Ensure `Crimedata_csv_all_years.csv` is in the `data/` folder
- Check the filename is EXACTLY: `Crimedata_csv_all_years.csv`
- Make sure you're running a local server (Step 3)

### ❌ Map shows but no markers
**Problem:** Your filters may have excluded all data
**Solution:** Click the "Reset All Filters" button

### ❌ Loading takes forever
**Problem:** Large CSV file (30+ MB)
**Solution:** 
- Be patient! It can take 30-60 seconds to load
- Consider filtering to recent years only
- The map auto-limits to 5,000 points for performance

### ❌ "Cross-Origin Request Blocked"
**Problem:** Not using a local server
**Solution:** You MUST use a local server (see Step 3)

## Tips for Best Experience

1. **Start with Recent Data**: Use the year filter to select 2023-2024 for faster loading
2. **Explore Neighbourhoods**: Use the neighbourhood dropdown to focus on specific areas
3. **Find Patterns**: Check the hourly and weekday charts to see when crimes peak
4. **Map Details**: Click any marker on the map for full incident details
5. **Mobile Friendly**: Works great on tablets and phones too!

## What You Can Do

✅ Filter by year, crime type, neighbourhood, and month range
✅ View interactive charts showing crime patterns
✅ Explore an interactive map with color-coded crime markers
✅ See real-time statistics as you filter
✅ Analyze trends over time, by hour, and by day of week

## File Size Note

Your CSV file is 31 MB, which means:
- **Initial load**: 30-60 seconds
- **Filtering**: Near-instant
- **Map**: Limited to 5,000 random points for smooth performance
- **Charts**: Show ALL filtered data (very fast)

## Need Help?

Check the full README.md for:
- Detailed documentation
- Customization options
- Technical details
- Privacy information

---

**Ready to start? Follow Step 3 to run your server!** 🚀
