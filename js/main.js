// ================================================================
//  Vancouver Crime Dashboard — main.js
//  Core data loading, filtering, statistics
// ================================================================

// Global state
let crimeData    = [];
let filteredData = [];
let map;

// Crime type category mappings (from original)
const CRIME_CATEGORIES = {
  person:   ['Offence Against a Person', 'Homicide', 'Sexual Offence'],
  property: [
    'Theft from Vehicle', 'Theft of Vehicle', 'Theft of Bicycle', 'Other Theft',
    'BNE Commercial', 'BNE Residential/Other',
    'Break and Enter Commercial', 'Break and Enter Residential/Other',
    'Mischief'
  ],
  other: [
    'Vehicle Collision or Pedestrian Struck (with Fatality)',
    'Vehicle Collision or Pedestrian Struck (with Injury)'
  ]
};

// Map category → editorial colour palette
const CRIME_COLORS = {
  person:   '#c0392b',   // crimson
  property: '#c07a2b',   // amber
  other:    '#5a5047'    // dark warm grey
};

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (crimeData.length > 0) updateDashboard();
      if (map) map.invalidateSize();
    }, 200);
  });
});

// ── Load CSV data ──────────────────────────────────────────────
async function loadData() {
  try {
    const data = await d3.csv('data/Crimedata_csv_all_years.csv');

    crimeData = data.map(d => ({
      type:          d.TYPE          || d.type          || '',
      year:          +(d.YEAR        || d.year          || 0),
      month:         +(d.MONTH       || d.month         || 0),
      day:           +(d.DAY         || d.day           || 0),
      hour:          (d.HOUR  !== '' && d.HOUR  != null) ? +(d.HOUR  || d.hour)  : null,
      minute:        (d.MINUTE!== '' && d.MINUTE!= null) ? +(d.MINUTE|| d.minute): null,
      hundredBlock:  d.HUNDRED_BLOCK || d.hundred_block || '',
      neighbourhood: d.NEIGHBOURHOOD || d.neighbourhood || '',
      x:             (d.X !== '' && d.X != null) ? +(d.X || d.x) : null,
      y:             (d.Y !== '' && d.Y != null) ? +(d.Y || d.y) : null,
      dayOfWeek:     new Date(+(d.YEAR||d.year), +(d.MONTH||d.month)-1, +(d.DAY||d.day)).getDay()
    })).filter(d => d.type && d.year > 2000);

    console.log(`Loaded ${crimeData.length} crime incidents`);

    // Update masthead record count
    document.getElementById('meta-count').textContent = crimeData.length.toLocaleString();

    populateFilters();

    filteredData = [...crimeData];
    updateDashboard();

    // Hide loading overlay
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
    setTimeout(() => { loading.style.display = 'none'; }, 500);

  } catch (error) {
    console.error('Error loading data:', error);
    const loading = document.getElementById('loading');
    loading.querySelector('p').textContent =
      'Error loading data. Ensure Crimedata_csv_all_years.csv is in the data/ folder.';
    loading.querySelector('p').style.color = 'var(--red)';
    loading.querySelector('.spinner').style.display = 'none';
  }
}

// ── Populate filter dropdowns ──────────────────────────────────
function populateFilters() {
  // Years (newest first)
  const years = [...new Set(crimeData.map(d => d.year))].sort((a, b) => b - a);
  const yearSel = document.getElementById('year-filter');
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  });

  // Neighbourhoods
  const hoods = [...new Set(crimeData.map(d => d.neighbourhood))]
    .filter(n => n && n.trim() !== '')
    .sort();
  const hoodSel = document.getElementById('neighbourhood-filter');
  hoods.forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    hoodSel.appendChild(o);
  });

  // Crime type checkboxes — styled to match editorial design
  const types = [...new Set(crimeData.map(d => d.type))].filter(Boolean).sort();
  const container = document.getElementById('crime-type-filter');
  types.forEach(type => {
    const lbl = document.createElement('label');
    lbl.className = 'ct-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = type;
    cb.checked = true;

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + type));
    container.appendChild(lbl);
  });
}

// ── Event listeners ────────────────────────────────────────────
function setupEventListeners() {
  document.getElementById('year-filter').addEventListener('change', applyFilters);
  document.getElementById('neighbourhood-filter').addEventListener('change', applyFilters);
  document.getElementById('month-start').addEventListener('change', applyFilters);
  document.getElementById('month-end').addEventListener('change', applyFilters);
  document.getElementById('crime-type-filter').addEventListener('change', applyFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

// ── Apply filters ──────────────────────────────────────────────
function applyFilters() {
  const yearVal  = document.getElementById('year-filter').value;
  const hoodVal  = document.getElementById('neighbourhood-filter').value;
  const mFrom    = +document.getElementById('month-start').value;
  const mTo      = +document.getElementById('month-end').value;

  const selectedTypes = new Set(
    Array.from(document.querySelectorAll('#crime-type-filter input:checked'))
      .map(cb => cb.value)
  );

  filteredData = crimeData.filter(d => {
    if (yearVal !== 'all' && d.year !== +yearVal)       return false;
    if (hoodVal !== 'all' && d.neighbourhood !== hoodVal) return false;
    if (mFrom <= mTo) {
      if (d.month < mFrom || d.month > mTo)             return false;
    } else {
      // wrap-around range (e.g. Oct → Feb)
      if (d.month < mFrom && d.month > mTo)             return false;
    }
    if (!selectedTypes.has(d.type))                     return false;
    return true;
  });

  console.log(`Filtered to ${filteredData.length} incidents`);
  updateDashboard();
}

// ── Reset filters ──────────────────────────────────────────────
function resetFilters() {
  document.getElementById('year-filter').value          = 'all';
  document.getElementById('neighbourhood-filter').value = 'all';
  document.getElementById('month-start').value          = '1';
  document.getElementById('month-end').value            = '12';
  document.querySelectorAll('#crime-type-filter input').forEach(cb => { cb.checked = true; });
  applyFilters();
}

// ── Update entire dashboard ────────────────────────────────────
function updateDashboard() {
  updateStatistics();
  updateCharts();
  updateMap();
}

// ── Update key statistics ──────────────────────────────────────
function updateStatistics() {
  // Total
  document.getElementById('total-incidents').textContent =
    filteredData.length.toLocaleString();

  // Most common crime
  const typeCounts = d3.rollup(filteredData, v => v.length, d => d.type);
  const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const crimeEl = document.getElementById('most-common-crime');
  if (topType) {
    let lbl = topType[0]
      .replace('Break and Enter ', 'B&E ')
      .replace('Vehicle Collision or Pedestrian Struck (with Fatality)', 'Collision (Fatal)')
      .replace('Vehicle Collision or Pedestrian Struck (with Injury)', 'Collision (Injury)');
    if (lbl.length > 20) lbl = lbl.slice(0, 18) + '…';
    crimeEl.textContent = lbl;
  } else {
    crimeEl.textContent = '—';
  }

  // Peak hour
  const hourData = filteredData.filter(d => d.hour !== null);
  if (hourData.length > 0) {
    const hourCounts = d3.rollup(hourData, v => v.length, d => d.hour);
    const peakHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    document.getElementById('peak-hour').textContent =
      peakHour ? `${String(peakHour[0]).padStart(2, '0')}:00` : '—';
  } else {
    document.getElementById('peak-hour').textContent = 'N/A';
  }

  // Top neighbourhood
  const nbrData = filteredData.filter(d => d.neighbourhood && d.neighbourhood.trim() !== '');
  if (nbrData.length > 0) {
    const nbrCounts = d3.rollup(nbrData, v => v.length, d => d.neighbourhood);
    const topNbr = [...nbrCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const nbrEl = document.getElementById('hotspot-neighbourhood');
    if (topNbr) {
      let lbl = topNbr[0];
      if (lbl.length > 18) lbl = lbl.slice(0, 16) + '…';
      nbrEl.textContent = lbl;
    }
  } else {
    document.getElementById('hotspot-neighbourhood').textContent = 'N/A';
  }
}

// ── Crime colour helper (used by charts + map) ─────────────────
function getCrimeColor(crimeType) {
  if (CRIME_CATEGORIES.person.includes(crimeType))   return CRIME_COLORS.person;
  if (CRIME_CATEGORIES.property.includes(crimeType)) return CRIME_COLORS.property;
  return CRIME_COLORS.other;
}

// ── Tooltip helpers ────────────────────────────────────────────
const tooltipEl = document.getElementById('tooltip');

function showTooltip(event, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add('visible');
  moveTooltip(event);
}

function moveTooltip(event) {
  let x = event.clientX + 14;
  let y = event.clientY - 10;
  if (x + 250 > window.innerWidth)  x = event.clientX - 260;
  if (y + 100 > window.innerHeight) y = event.clientY - 100;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top  = y + 'px';
}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
}
