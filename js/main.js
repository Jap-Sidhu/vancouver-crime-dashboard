// ================================================================
//  Vancouver Crime Dashboard — main.js
//  Core data loading, filtering, statistics
// ================================================================

// Global state
// The dataset is held as typed-array columns (see scripts/build_data.py), and every
// filter change produces one `agg` object with all the counts the page needs.
let meta = null;      // data/meta.json
let cols = null;      // { type, year, month, dow, hour, hood, lat, lng }
let agg  = null;      // counts for the current filters
let map;

const UNKNOWN = 255;      // hour / neighbourhood not recorded
const NO_LOC  = 65535;    // incident has no published location
const HEAT_SHIFT = 3;     // heat-map cell = 8 grid steps ≈ 30 m

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
      if (agg) updateDashboard();
      if (map) map.invalidateSize();
    }, 200);
  });
});

// ── Load the pre-built data ────────────────────────────────────
async function loadData() {
  try {
    const t0 = performance.now();
    const [metaRes, binRes] = await Promise.all([
      fetch('data/meta.json'),
      fetch('data/incidents.bin.gz')
    ]);
    if (!metaRes.ok || !binRes.ok) throw new Error('data files missing');
    meta = await metaRes.json();

    // The file is gzip-compressed on disk. Some hosts already decompress it in transit
    // (Content-Encoding: gzip), so only decompress when the gzip header is still there.
    let buf = await binRes.arrayBuffer();
    const head = new Uint8Array(buf, 0, 2);
    if (head[0] === 0x1f && head[1] === 0x8b) {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = await new Response(stream).arrayBuffer();
    }
    if (buf.byteLength !== meta.n * 10) throw new Error('data file does not match meta.json');
    cols = unpackColumns(buf, meta.n);

    console.log(`Loaded ${meta.n.toLocaleString()} incidents in ${Math.round(performance.now() - t0)} ms`);

    document.getElementById('meta-count').textContent = meta.n.toLocaleString();
    document.getElementById('meta-range').textContent =
      `${meta.years[0]}–${formatMonth(meta.latestMonth)}`;

    populateFilters();
    applyFilters();

    // Hide loading overlay
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
    setTimeout(() => { loading.style.display = 'none'; }, 500);

  } catch (error) {
    console.error('Error loading data:', error);
    const loading = document.getElementById('loading');
    loading.querySelector('p').textContent =
      'Could not load the crime data. Run scripts/build_data.py to create data/incidents.bin.gz.';
    loading.querySelector('p').style.color = 'var(--red)';
    loading.querySelector('.spinner').style.display = 'none';
  }
}

// Column layout matches scripts/build_data.py
function unpackColumns(buf, n) {
  const u8 = i => new Uint8Array(buf, i * n, n);
  return {
    type:  u8(0), year: u8(1), month: u8(2), dow: u8(3), hour: u8(4), hood: u8(5),
    lat:   new Uint16Array(buf, 6 * n, n),
    lng:   new Uint16Array(buf, 8 * n, n)
  };
}

function formatMonth(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
}

// ── Populate filter dropdowns ──────────────────────────────────
function populateFilters() {
  // Years (newest first)
  const yearSel = document.getElementById('year-filter');
  [...meta.years].reverse().forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  });

  // Neighbourhoods
  const hoodSel = document.getElementById('neighbourhood-filter');
  meta.neighbourhoods.forEach((n, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = n;
    hoodSel.appendChild(o);
  });

  // Crime type checkboxes — styled to match editorial design
  const container = document.getElementById('crime-type-filter');
  meta.types.forEach((type, i) => {
    const lbl = document.createElement('label');
    lbl.className = 'ct-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = i;
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

// ── Apply filters: one pass over all incidents ──────────────────
function applyFilters() {
  const yearVal = document.getElementById('year-filter').value;
  const hoodVal = document.getElementById('neighbourhood-filter').value;
  const mFrom   = +document.getElementById('month-start').value;
  const mTo     = +document.getElementById('month-end').value;

  const yearIdx = yearVal === 'all' ? -1 : +yearVal - meta.yearBase;
  const hoodIdx = hoodVal === 'all' ? -1 : +hoodVal;

  // Month mask handles wrap-around ranges (e.g. Oct → Feb)
  const monthOk = new Uint8Array(13);
  for (let m = 1; m <= 12; m++) {
    monthOk[m] = mFrom <= mTo ? (m >= mFrom && m <= mTo) : (m >= mFrom || m <= mTo);
  }
  const typeOk = new Uint8Array(meta.types.length);
  document.querySelectorAll('#crime-type-filter input:checked').forEach(cb => { typeOk[+cb.value] = 1; });

  const nYears = meta.years[meta.years.length - 1] - meta.yearBase + 1;
  const a = {
    total: 0, knownHour: 0, located: 0,
    byType: new Uint32Array(meta.types.length),
    byHood: new Uint32Array(meta.neighbourhoods.length),
    byMonth: new Uint32Array(nYears * 12),   // index = yearIdx * 12 + (month - 1)
    byHour: new Uint32Array(24),
    byDow:  new Uint32Array(7),
    heat:   new Map(),                        // heat-map cell → count
    monthOk
  };

  const { type, year, month, dow, hour, hood, lat, lng } = cols;
  for (let i = 0, n = meta.n; i < n; i++) {
    if (yearIdx >= 0 && year[i] !== yearIdx) continue;
    if (hoodIdx >= 0 && hood[i] !== hoodIdx) continue;
    if (!monthOk[month[i]] || !typeOk[type[i]]) continue;

    a.total++;
    a.byType[type[i]]++;
    if (hood[i] !== UNKNOWN) a.byHood[hood[i]]++;
    a.byMonth[year[i] * 12 + month[i] - 1]++;
    a.byDow[dow[i]]++;
    if (hour[i] !== UNKNOWN) { a.byHour[hour[i]]++; a.knownHour++; }
    if (lat[i] !== NO_LOC) {
      a.located++;
      const key = ((lat[i] >> HEAT_SHIFT) << 12) | (lng[i] >> HEAT_SHIFT);
      a.heat.set(key, (a.heat.get(key) || 0) + 1);
    }
  }

  agg = a;
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
function topIndex(counts) {
  let best = -1, max = 0;
  counts.forEach((c, i) => { if (c > max) { max = c; best = i; } });
  return best;
}

function updateStatistics() {
  document.getElementById('total-incidents').textContent = agg.total.toLocaleString();

  // Most common crime
  const t = topIndex(agg.byType);
  const crimeEl = document.getElementById('most-common-crime');
  if (t >= 0) {
    let lbl = meta.types[t]
      .replace('Break and Enter ', 'B&E ')
      .replace('Vehicle Collision or Pedestrian Struck (with Fatality)', 'Collision (Fatal)')
      .replace('Vehicle Collision or Pedestrian Struck (with Injury)', 'Collision (Injury)');
    if (lbl.length > 20) lbl = lbl.slice(0, 18) + '…';
    crimeEl.textContent = lbl;
  } else {
    crimeEl.textContent = '—';
  }

  // Peak hour, from incidents with a recorded time only
  const h = topIndex(agg.byHour);
  document.getElementById('peak-hour').textContent = h >= 0 ? `${String(h).padStart(2, '0')}:00` : 'N/A';
  const unknown = agg.total - agg.knownHour;
  document.getElementById('peak-hour-note').textContent = agg.total
    ? `${Math.round((unknown / agg.total) * 100)}% have no recorded time`
    : '';

  // Top neighbourhood
  const nb = topIndex(agg.byHood);
  const nbrEl = document.getElementById('hotspot-neighbourhood');
  if (nb >= 0) {
    let lbl = meta.neighbourhoods[nb];
    if (lbl.length > 18) lbl = lbl.slice(0, 16) + '…';
    nbrEl.textContent = lbl;
  } else {
    nbrEl.textContent = 'N/A';
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
