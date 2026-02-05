// Map functionality using Leaflet.js

// Initialize map
function initializeMap() {
    // Vancouver coordinates
    const vancouverCenter = [49.2827, -123.1207];

    map = L.map('crime-map').setView(vancouverCenter, 11);

    // Add dark theme tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    return map;
}

// Update map with crime data
function updateMap() {
    if (!map) {
        map = initializeMap();
    }

    // Clear existing markers
    map.eachLayer(layer => {
        if (layer instanceof L.CircleMarker) {
            map.removeLayer(layer);
        }
    });

    // Filter data with valid coordinates
    const mapData = filteredData.filter(d => d.x !== null && d.y !== null);

    // Limit to 5000 points for performance
    const maxPoints = 5000;
    const sampledData = mapData.length > maxPoints 
        ? mapData.sort(() => 0.5 - Math.random()).slice(0, maxPoints)
        : mapData;

    console.log(`Displaying ${sampledData.length} points on map`);

    // Create marker cluster groups by crime category
    const markers = {
        person: [],
        property: [],
        other: []
    };

    sampledData.forEach(incident => {
        const coords = utmToLatLng(incident.x, incident.y);
        
        // Validate coordinates are within reasonable bounds for Vancouver
        if (coords[0] < 49.0 || coords[0] > 49.4 || coords[1] < -123.3 || coords[1] > -122.9) {
            return; // Skip invalid coordinates
        }

        const color = getCrimeColor(incident.type);
        let category = 'other';
        
        if (CRIME_CATEGORIES.person.includes(incident.type)) {
            category = 'person';
        } else if (CRIME_CATEGORIES.property.includes(incident.type)) {
            category = 'property';
        }

        const marker = L.circleMarker(coords, {
            radius: 4,
            fillColor: color,
            color: color,
            weight: 1,
            opacity: 0.6,
            fillOpacity: 0.4
        });

        // Create popup content
        const popupContent = `
            <strong>${incident.type}</strong><br>
            ${incident.neighbourhood || 'Unknown neighbourhood'}<br>
            ${incident.hundredBlock || ''}<br>
            ${incident.year}-${String(incident.month).padStart(2, '0')}-${String(incident.day).padStart(2, '0')}
            ${incident.hour !== null ? ` ${String(incident.hour).padStart(2, '0')}:${String(incident.minute).padStart(2, '0')}` : ''}
        `;

        marker.bindPopup(popupContent);
        marker.addTo(map);
        markers[category].push(marker);
    });

    // If we have data, fit map to bounds
    if (sampledData.length > 0) {
        const validCoords = sampledData
            .map(d => utmToLatLng(d.x, d.y))
            .filter(coords => coords[0] >= 49.0 && coords[0] <= 49.4 && 
                            coords[1] >= -123.3 && coords[1] <= -122.9);
        
        if (validCoords.length > 0) {
            const bounds = L.latLngBounds(validCoords);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

// Enhanced UTM to Lat/Lng conversion for Vancouver (UTM Zone 10)
function utmToLatLng(x, y) {
    // Vancouver uses UTM Zone 10N
    // This is a simplified conversion for visualization purposes
    // For production, consider using proj4js library
    
    // Constants for UTM Zone 10
    const zone = 10;
    const falseEasting = 500000;
    const falseNorthing = 0; // Northern hemisphere
    
    // Approximate conversion (good enough for visualization)
    // Central meridian for Zone 10: -123°
    const centralMeridian = -123;
    
    // Convert UTM to approximate lat/lng
    const lng = centralMeridian + (x - falseEasting) / 111320;
    const lat = y / 110540;
    
    return [lat, lng];
}

// Alternative: More accurate conversion using proj4js
// If you want higher accuracy, include proj4js library and use:
/*
function utmToLatLngAccurate(x, y) {
    const utm = '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs';
    const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
    const [lng, lat] = proj4(utm, wgs84, [x, y]);
    return [lat, lng];
}
*/
