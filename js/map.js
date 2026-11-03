// ================================================================
//  Vancouver Crime Dashboard — map.js
//  Leaflet heat map of incident density
// ================================================================

const VANCOUVER_CENTER = [49.2600, -123.1150];
let heatLayer = null;

// ── Initialise map ─────────────────────────────────────────────
function initializeMap() {
  map = L.map('crime-map', {
    zoomControl: true,
    attributionControl: true
  }).setView(VANCOUVER_CENTER, 12);

  // Esri light-gray basemap (no API key needed). The CSS sepia filter in styles.css
  // tints it to match the editorial paper look.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16
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

// Grid step (0..meta.grid inside meta.bbox) → latitude / longitude
function cellToLatLng(key) {
  const { bbox, grid } = meta;
  const half = (1 << HEAT_SHIFT) / 2;   // centre of the heat cell
  const latStep = ((key >> 12) << HEAT_SHIFT) + half;
  const lngStep = ((key & 4095) << HEAT_SHIFT) + half;
  return [
    bbox.south + (latStep / grid) * (bbox.north - bbox.south),
    bbox.west  + (lngStep / grid) * (bbox.east - bbox.west)
  ];
}

// ── Update map with the current counts ─────────────────────────
function updateMap() {
  if (!map) map = initializeMap();

  // Counts span 1 to several thousand per cell, so intensity uses a log scale; otherwise
  // a few downtown blocks would wash out every other neighbourhood.
  let maxCount = 1;
  agg.heat.forEach(c => { if (c > maxCount) maxCount = c; });
  const logMax = Math.log1p(maxCount);
  const points = [];
  agg.heat.forEach((count, key) => {
    const [lat, lng] = cellToLatLng(key);
    points.push([lat, lng, Math.log1p(count) / logMax]);
  });

  // `max` above 1 leaves headroom for overlapping cells before the colour saturates
  const options = {
    radius: 9,
    blur: 12,
    max: 2,
    maxZoom: 15,
    minOpacity: 0.1,
    gradient: { 0.2: '#e5c9a0', 0.45: '#d9963f', 0.7: '#c0392b', 1.0: '#5c1610' }
  };
  if (heatLayer) {
    heatLayer.setLatLngs(points);
  } else if (map.getSize().x > 0) {
    heatLayer = L.heatLayer(points, options).addTo(map);
  } else {
    // The heat layer can't draw into a zero-size map (e.g. a hidden tab); try again once it has a size
    if (!updateMap.waiting) {
      updateMap.waiting = true;
      map.once('resize', () => { updateMap.waiting = false; updateMap(); });
    }
  }

  // Zoom to the selection when a single neighbourhood is chosen
  const hoodSelected = document.getElementById('neighbourhood-filter').value !== 'all';
  if (hoodSelected && points.length) {
    // Use the 2nd–98th percentile so a few stray points don't stretch the view
    const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
    const lats = points.map(p => p[0]).sort((a, b) => a - b);
    const lngs = points.map(p => p[1]).sort((a, b) => a - b);
    map.fitBounds([[pct(lats, 0.02), pct(lngs, 0.02)], [pct(lats, 0.98), pct(lngs, 0.98)]],
                  { padding: [30, 30], maxZoom: 15, animate: false });
  } else if (!hoodSelected && updateMap.wasHood) {
    map.setView(VANCOUVER_CENTER, 12, { animate: false });
  }
  updateMap.wasHood = hoodSelected;

  // Say how many incidents can't be mapped (VPD withholds locations for person offences)
  const hidden = agg.total - agg.located;
  document.getElementById('map-note').textContent = agg.total
    ? `Showing ${agg.located.toLocaleString()} mapped incidents. ` +
      (hidden ? `${hidden.toLocaleString()} (${Math.round(hidden / agg.total * 100)}%) have no published location, mostly offences against a person, which VPD withholds for privacy.` : '')
    : 'No incidents match these filters.';
}
