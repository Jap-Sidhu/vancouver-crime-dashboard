// Main application logic for Vancouver Crime Dashboard

// Global variables
let crimeData = [];
let filteredData = [];
let map;

// Crime type categories
const CRIME_CATEGORIES = {
    person: ['Offence Against a Person', 'Homicide'],
    property: ['Theft from Vehicle', 'Theft of Vehicle', 'Theft of Bicycle', 'Other Theft', 
               'BNE Commercial', 'BNE Residential/Other'],
    other: ['Mischief', 'Vehicle Collision or Pedestrian Struck (with Fatality)', 
            'Vehicle Collision or Pedestrian Struck (with Injury)']
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();

    // Redraw charts and map on resize (responsive layout/orientation change)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (crimeData.length > 0) {
                updateDashboard();
            }
        }, 200);
    });
});

// Load CSV data
async function loadData() {
    try {
        const data = await d3.csv('data/Crimedata_csv_all_years.csv');
        
        // Process and clean the data
        crimeData = data.map(d => ({
            type: d.TYPE,
            year: +d.YEAR,
            month: +d.MONTH,
            day: +d.DAY,
            hour: d.HOUR !== '' ? +d.HOUR : null,
            minute: d.MINUTE !== '' ? +d.MINUTE : null,
            hundredBlock: d.HUNDRED_BLOCK,
            neighbourhood: d.NEIGHBOURHOOD,
            x: d.X !== '' ? +d.X : null,
            y: d.Y !== '' ? +d.Y : null,
            // Calculate day of week
            dayOfWeek: new Date(+d.YEAR, +d.MONTH - 1, +d.DAY).getDay()
        })).filter(d => d.type && d.year); // Remove invalid entries

        console.log(`Loaded ${crimeData.length} crime incidents`);
        
        // Initialize filters
        populateFilters();
        
        // Set initial filtered data to all data
        filteredData = [...crimeData];
        
        // Update dashboard
        updateDashboard();
        
        // Hide loading indicator
        document.getElementById('loading').classList.add('hidden');
        
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').innerHTML = 
            '<p style="color: #ff4444;">Error loading data. Please ensure Crimedata_csv_all_years.csv is in the data/ folder.</p>';
    }
}

// Populate filter dropdowns
function populateFilters() {
    // Populate years
    const years = [...new Set(crimeData.map(d => d.year))].sort((a, b) => b - a);
    const yearFilter = document.getElementById('year-filter');
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    // Populate crime types
    const crimeTypes = [...new Set(crimeData.map(d => d.type))].sort();
    const crimeTypeFilter = document.getElementById('crime-type-filter');
    crimeTypes.forEach(type => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = type;
        checkbox.checked = true;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(type));
        crimeTypeFilter.appendChild(label);
    });

    // Populate neighbourhoods
    const neighbourhoods = [...new Set(crimeData.map(d => d.neighbourhood))]
        .filter(n => n && n !== '')
        .sort();
    const neighbourhoodFilter = document.getElementById('neighbourhood-filter');
    neighbourhoods.forEach(neighbourhood => {
        const option = document.createElement('option');
        option.value = neighbourhood;
        option.textContent = neighbourhood;
        neighbourhoodFilter.appendChild(option);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Year filter
    document.getElementById('year-filter').addEventListener('change', applyFilters);
    
    // Neighbourhood filter
    document.getElementById('neighbourhood-filter').addEventListener('change', applyFilters);
    
    // Month range filters
    document.getElementById('month-start').addEventListener('change', applyFilters);
    document.getElementById('month-end').addEventListener('change', applyFilters);
    
    // Crime type checkboxes
    document.getElementById('crime-type-filter').addEventListener('change', applyFilters);
    
    // Reset button
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

// Apply filters
function applyFilters() {
    const yearFilter = document.getElementById('year-filter').value;
    const neighbourhoodFilter = document.getElementById('neighbourhood-filter').value;
    const monthStart = +document.getElementById('month-start').value;
    const monthEnd = +document.getElementById('month-end').value;
    
    // Get selected crime types
    const selectedCrimeTypes = Array.from(
        document.querySelectorAll('#crime-type-filter input:checked')
    ).map(cb => cb.value);

    // Filter data
    filteredData = crimeData.filter(d => {
        // Year filter
        if (yearFilter !== 'all' && d.year !== +yearFilter) return false;
        
        // Neighbourhood filter
        if (neighbourhoodFilter !== 'all' && d.neighbourhood !== neighbourhoodFilter) return false;
        
        // Month range filter
        if (monthStart <= monthEnd) {
            if (d.month < monthStart || d.month > monthEnd) return false;
        } else {
            // Handle wrap-around (e.g., Oct to Feb)
            if (d.month < monthStart && d.month > monthEnd) return false;
        }
        
        // Crime type filter
        if (!selectedCrimeTypes.includes(d.type)) return false;
        
        return true;
    });

    console.log(`Filtered to ${filteredData.length} incidents`);
    updateDashboard();
}

// Reset all filters
function resetFilters() {
    document.getElementById('year-filter').value = 'all';
    document.getElementById('neighbourhood-filter').value = 'all';
    document.getElementById('month-start').value = '1';
    document.getElementById('month-end').value = '12';
    
    // Check all crime type checkboxes
    document.querySelectorAll('#crime-type-filter input').forEach(cb => {
        cb.checked = true;
    });
    
    applyFilters();
}

// Update entire dashboard
function updateDashboard() {
    updateStatistics();
    updateCharts();
    updateMap();
}

// Update key statistics
function updateStatistics() {
    // Total incidents
    document.getElementById('total-incidents').textContent = 
        filteredData.length.toLocaleString();

    // Most common crime type
    const crimeTypeCounts = d3.rollup(
        filteredData,
        v => v.length,
        d => d.type
    );
    const mostCommon = Array.from(crimeTypeCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
    document.getElementById('most-common-crime').textContent = 
        mostCommon ? mostCommon[0].substring(0, 20) + (mostCommon[0].length > 20 ? '...' : '') : '-';

    // Peak hour
    const hourData = filteredData.filter(d => d.hour !== null);
    if (hourData.length > 0) {
        const hourCounts = d3.rollup(
            hourData,
            v => v.length,
            d => d.hour
        );
        const peakHour = Array.from(hourCounts.entries())
            .sort((a, b) => b[1] - a[1])[0];
        document.getElementById('peak-hour').textContent = 
            peakHour ? `${peakHour[0]}:00` : '-';
    } else {
        document.getElementById('peak-hour').textContent = 'N/A';
    }

    // Top neighbourhood
    const neighbourhoodData = filteredData.filter(d => d.neighbourhood && d.neighbourhood !== '');
    if (neighbourhoodData.length > 0) {
        const neighbourhoodCounts = d3.rollup(
            neighbourhoodData,
            v => v.length,
            d => d.neighbourhood
        );
        const topNeighbourhood = Array.from(neighbourhoodCounts.entries())
            .sort((a, b) => b[1] - a[1])[0];
        document.getElementById('hotspot-neighbourhood').textContent = 
            topNeighbourhood ? topNeighbourhood[0].substring(0, 15) + (topNeighbourhood[0].length > 15 ? '...' : '') : '-';
    } else {
        document.getElementById('hotspot-neighbourhood').textContent = 'N/A';
    }
}

// Get color for crime category
function getCrimeColor(crimeType) {
    if (CRIME_CATEGORIES.person.includes(crimeType)) {
        return '#ff4444'; // Red for crimes against persons
    } else if (CRIME_CATEGORIES.property.includes(crimeType)) {
        return '#44aaff'; // Blue for property crimes
    } else {
        return '#ffaa00'; // Orange for other crimes
    }
}
