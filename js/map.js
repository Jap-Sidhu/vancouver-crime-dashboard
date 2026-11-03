// ================================================================
//  Vancouver Crime Dashboard — map.js
//  Incident map: one dot per ~30 m location (or a heat map), on a muted
//  street map with street and neighbourhood names
// ================================================================

const VANCOUVER_CENTER = [49.2600, -123.1150];
const BASE_ZOOM = 12;
let mapMode = 'dots';       // 'dots' | 'heat'
let dotLayer = null;
let heatLayer = null;
let canvasRenderer = null;

// ── Initialise map ─────────────────────────────────────────────
function initializeMap() {
  map = L.map('crime-map', {
    zoomControl: true,
    attributionControl: true
  }).setView(VANCOUVER_CENTER, BASE_ZOOM);

  // Esri World Street Map (no API key needed), which has full street and neighbourhood
  // names. It's muted with a CSS filter (.basemap in styles.css) to match the paper look.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors',
    className: 'basemap',
    maxZoom: 18
  }).addTo(map);

  // Tens of thousands of dots draw much faster on one canvas than as separate elements
  canvasRenderer = L.canvas({ padding: 0.3 });

  // Zooming changes how many locations fit, so the dots are rebuilt for the new zoom
  map.on('zoomend', () => { if (mapMode === 'dots' && agg) { drawDots(); updateMapNote(); } });

  document.querySelectorAll('.map-mode button').forEach(btn => {
    btn.addEventListener('click', () => {
      mapMode = btn.dataset.mode;
      document.querySelectorAll('.map-mode button').forEach(b =>
        b.classList.toggle('active', b === btn));
      updateMap();
    });
  });

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

// Map cell key → latitude / longitude of the cell centre
function cellToLatLng(key) {
  const { bbox, grid } = meta;
  const half = (1 << CELL_SHIFT) / 2;
  const latStep = ((key >> 12) << CELL_SHIFT) + half;
  const lngStep = ((key & 4095) << CELL_SHIFT) + half;
  return [
    bbox.south + (latStep / grid) * (bbox.north - bbox.south),
    bbox.west  + (lngStep / grid) * (bbox.east - bbox.west)
  ];
}

// Most common crime type in a cell
function dominantType(byType) {
  let best = 0;
  for (let t = 1; t < byType.length; t++) if (byType[t] > byType[best]) best = t;
  return best;
}

// ── Dots ───────────────────────────────────────────────────────
// Over 23 years almost every block has incidents, so drawing all ~37,000 locations at
// city zoom fills the map solid. Zoomed out, only the busiest locations are shown; zooming
// in reveals more, down to every location at street level. The map note says which.
function dotLimit(zoom) {
  if (zoom <= 11) return 1500;
  if (zoom === 12) return 3000;
  if (zoom === 13) return 8000;
  if (zoom === 14) return 20000;
  return Infinity;
}

function dotRadius(n, logMax) {
  // Log scale (a block with 2,000 incidents is bigger than one with 2, but not 1,000x),
  // and dots grow a little as you zoom in (capped, so they don't cover street names)
  const t = Math.log1p(n) / logMax;
  return (1.2 + 3.6 * t * t) * Math.pow(1.3, Math.min(2, map.getZoom() - BASE_ZOOM));
}

function drawDots() {
  if (dotLayer) map.removeLayer(dotLayer);

  let maxN = 1;
  agg.cells.forEach(c => { if (c.n > maxN) maxN = c.n; });
  const logMax = Math.log1p(maxN);

  // Busiest first to pick the ones to show, then drawn quietest first so busy ones sit on top
  const cells = [...agg.cells.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, dotLimit(map.getZoom()))
    .reverse();
  dotLayer = L.featureGroup();
  dotLayer.shown = cells.length;

  for (const [key, cell] of cells) {
    const color = getCrimeColor(meta.types[dominantType(cell.byType)]);
    const t = Math.log1p(cell.n) / logMax;
    L.circleMarker(cellToLatLng(key), {
      renderer: canvasRenderer,
      radius: dotRadius(cell.n, logMax),
      stroke: false,
      fillColor: color,
      fillOpacity: (map.getZoom() >= 15 ? 0.3 : 0.45) + 0.4 * t,   // lighter up close so street names show
      cellKey: key
    }).addTo(dotLayer);
  }

  dotLayer.on('click', e => {
    const cell = agg.cells.get(e.layer.options.cellKey);
    if (!cell) return;
    const top = Array.from(cell.byType, (count, i) => ({ type: meta.types[i], count }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    L.popup({ maxWidth: 240 })
      .setLatLng(e.latlng)
      .setContent(
        `<strong>${cell.n.toLocaleString()} incident${cell.n === 1 ? '' : 's'} on this block</strong>` +
        top.map(d => `${d.type} · ${d.count.toLocaleString()}`).join('<br>') +
        `<div class="popup-note">Locations are offset to the hundred block by VPD.</div>`)
      .openOn(map);
  });

  dotLayer.addTo(map);
}

// ── Heat ───────────────────────────────────────────────────────
function drawHeat() {
  // Counts span 1 to several thousand per cell, so intensity uses a log scale; otherwise
  // a few downtown blocks would wash out every other neighbourhood.
  let maxCount = 1;
  agg.cells.forEach(c => { if (c.n > maxCount) maxCount = c.n; });
  const logMax = Math.log1p(maxCount);
  const points = [];
  agg.cells.forEach((cell, key) => {
    const [lat, lng] = cellToLatLng(key);
    points.push([lat, lng, Math.log1p(cell.n) / logMax]);
  });

  if (heatLayer) {
    heatLayer.setLatLngs(points);
    if (!map.hasLayer(heatLayer)) heatLayer.addTo(map);
  } else {
    // `max` above 1 leaves headroom for overlapping cells before the colour saturates
    heatLayer = L.heatLayer(points, {
      radius: 9, blur: 12, max: 2, maxZoom: 15, minOpacity: 0.1,
      gradient: { 0.2: '#e5c9a0', 0.45: '#d9963f', 0.7: '#c0392b', 1.0: '#5c1610' }
    }).addTo(map);
  }
}

// ── Update map with the current counts ─────────────────────────
function updateMap() {
  if (!map) map = initializeMap();

  // Both layers need a map with a real size (not a hidden tab); try again once it has one
  if (map.getSize().x === 0) {
    if (!updateMap.waiting) {
      updateMap.waiting = true;
      map.once('resize', () => { updateMap.waiting = false; updateMap(); });
    }
    return;
  }

  if (mapMode === 'dots') {
    if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
    drawDots();
  } else {
    if (dotLayer) { map.removeLayer(dotLayer); dotLayer = null; }
    drawHeat();
  }
  document.getElementById('legend-dots').hidden = mapMode !== 'dots';
  document.getElementById('legend-heat').hidden = mapMode !== 'heat';

  // Zoom to the selection when a single neighbourhood is chosen
  const hoodSelected = document.getElementById('neighbourhood-filter').value !== 'all';
  if (hoodSelected && agg.cells.size) {
    // Use the 2nd–98th percentile so a few stray points don't stretch the view
    const pts = [...agg.cells.keys()].map(cellToLatLng);
    const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
    const lats = pts.map(p => p[0]).sort((a, b) => a - b);
    const lngs = pts.map(p => p[1]).sort((a, b) => a - b);
    map.fitBounds([[pct(lats, 0.02), pct(lngs, 0.02)], [pct(lats, 0.98), pct(lngs, 0.98)]],
                  { padding: [30, 30], maxZoom: 15, animate: false });
  } else if (!hoodSelected && updateMap.wasHood) {
    map.setView(VANCOUVER_CENTER, BASE_ZOOM, { animate: false });
  }
  updateMap.wasHood = hoodSelected;

  updateMapNote();
}

// Say what the map shows, and how many incidents can't be mapped
// (VPD withholds locations for offences against a person)
function updateMapNote() {
  const hidden = agg.total - agg.located;
  let shown = `Showing ${agg.located.toLocaleString()} mapped incidents. `;
  if (mapMode === 'dots' && dotLayer) {
    shown = dotLayer.shown < agg.cells.size
      ? `Showing the ${dotLayer.shown.toLocaleString()} busiest of ${agg.cells.size.toLocaleString()} locations; zoom in to see more. `
      : `Showing all ${agg.cells.size.toLocaleString()} locations (${agg.located.toLocaleString()} incidents). Click a dot for details. `;
  }
  document.getElementById('map-note').textContent = agg.total
    ? shown + (hidden ? `${hidden.toLocaleString()} incidents (${Math.round(hidden / agg.total * 100)}%) have no published location, mostly offences against a person, which VPD withholds for privacy.` : '')
    : 'No incidents match these filters.';
}

