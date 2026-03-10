// ================================================================
//  Vancouver Crime Dashboard — map.js
//  Leaflet map with UTM projection, crime markers, popups
// ================================================================

// ── Initialise map ─────────────────────────────────────────────
function initializeMap() {
  const vancouverCenter = [49.2827, -123.1207];

  map = L.map('crime-map', {
    zoomControl: true,
    attributionControl: true
  }).setView(vancouverCenter, 11);

  // Light CartoDB tiles — CSS sepia filter applied in styles.css
  // to match the editorial paper aesthetic
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Redraw on resize (mobile orientation fix)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (map) map.invalidateSize(); }, 150);
  });

  // Force render after layout settles
  setTimeout(() => map.invalidateSize(), 400);

  return map;
}

// ── Update map with filtered data ─────────────────────────────
function updateMap() {
  if (!map) {
    map = initializeMap();
  }

  // Remove existing circle markers (keep tile layer)
  map.eachLayer(layer => {
    if (layer instanceof L.CircleMarker) {
      map.removeLayer(layer);
    }
  });

  // Only use records with coordinates
  const mapData = filteredData.filter(d => d.x !== null && d.y !== null && d.x !== 0 && d.y !== 0);

  // Sample for performance — max 5000 points
  const MAX_POINTS = 5000;
  const sampledData = mapData.length > MAX_POINTS
    ? mapData.filter(() => Math.random() < MAX_POINTS / mapData.length)
    : mapData;

  console.log(`Displaying ${sampledData.length} points on map`);

  const validCoords = [];

  sampledData.forEach(incident => {
    const coords = utmToLatLng(incident.x, incident.y);

    if (!isValidVancouverCoords(coords[0], coords[1])) return;

    validCoords.push(coords);

    const color = getCrimeColor(incident.type);

    const marker = L.circleMarker(coords, {
      radius:      4,
      fillColor:   color,
      color:       color,
      weight:      0.5,
      opacity:     0.7,
      fillOpacity: 0.55
    });

    // Popup content
    const dateStr = `${incident.year}-${String(incident.month).padStart(2, '0')}-${String(incident.day).padStart(2, '0')}`;
    const timeStr = incident.hour !== null
      ? `${String(incident.hour).padStart(2, '0')}:${String(incident.minute || 0).padStart(2, '0')}`
      : '';

    marker.bindPopup(`
      <strong>${incident.type}</strong>
      ${incident.neighbourhood || 'Unknown neighbourhood'}<br>
      ${incident.hundredBlock  ? incident.hundredBlock + '<br>' : ''}
      ${dateStr}${timeStr ? ' · ' + timeStr : ''}
    `, { maxWidth: 220 });

    marker.addTo(map);
  });

  // Fit bounds to visible data
  if (validCoords.length > 0) {
    try {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } catch (_) {
      map.setView([49.2827, -123.1207], 11);
    }
  }
}

// ── UTM Zone 10N → WGS84 via proj4js ──────────────────────────
function utmToLatLng(x, y) {
  const utm   = '+proj=utm +zone=10 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';
  const wgs84 = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs';
  try {
    const [lng, lat] = proj4(utm, wgs84, [x, y]);
    return [lat, lng];
  } catch (_) {
    return [0, 0];
  }
}

// ── Validate coordinates are within greater Vancouver ──────────
function isValidVancouverCoords(lat, lng) {
  return lat >= 49.15 && lat <= 49.35 && lng >= -123.3 && lng <= -122.95;
}
