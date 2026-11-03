// ================================================================
//  Vancouver Crime Dashboard — charts.js
//  All D3 charts styled to the editorial newspaper theme
// ================================================================

// Palette (mirrors CSS variables — used directly in D3)
const C = {
  red:      '#c0392b',
  amber:    '#c07a2b',
  grey:     '#5a5047',
  paper:    '#f5f0e8',
  paper2:   '#ede7d9',
  paper3:   '#e5dece',
  rule:     '#c8bfb0',
  inkMuted: '#9a8e84',
  ink:      '#1a1614'
};

// ── Dispatch ──────────────────────────────────────────────────
function updateCharts() {
  createCrimeTypeChart();
  createNeighbourhoodChart();
  createTimeSeriesChart();
  createHourlyChart();
  createWeekdayChart();
}

// ── Shared axis style helper ───────────────────────────────────
function styleAxis(selection) {
  selection.selectAll('text')
    .style('fill', C.inkMuted)
    .style('font-family', 'JetBrains Mono, monospace')
    .style('font-size', '10px');
  selection.selectAll('path, line')
    .style('stroke', C.rule);
}

// ── Crime Type Distribution (horizontal bars) ─────────────────
function createCrimeTypeChart() {
  const container = document.getElementById('crime-type-chart');
  container.innerHTML = '';

  const data = Array.from(agg.byType, (count, i) => ({ type: meta.types[i], count }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count);

  if (!data.length) {
    container.innerHTML = '<p style="font-family:JetBrains Mono,monospace;font-size:0.72em;color:#9a8e84;padding:12px 0;">No data available</p>';
    return;
  }

  const margin = { top: 4, right: 52, bottom: 8, left: 8 };
  const barH   = 20;
  const gap    = 5;
  const W      = container.clientWidth || 220;
  const iW     = W - margin.left - margin.right;
  const H      = data.length * (barH + gap) + margin.top + margin.bottom;

  const svg = d3.select(container).append('svg')
    .attr('width', W).attr('height', H);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, data[0].count])
    .range([0, iW]);

  // Alternating bar colours by category
  const barColors = data.map(d => getCrimeColor(d.type));

  // Rank numbers
  g.selectAll('.rank')
    .data(data).join('text')
    .attr('x', 0)
    .attr('y', (d, i) => i * (barH + gap) + barH / 2)
    .attr('dominant-baseline', 'middle')
    .style('font-family', 'Playfair Display, serif')
    .style('font-size', '11px')
    .style('font-weight', '700')
    .style('fill', C.inkMuted)
    .text((d, i) => i + 1);

  // Track backgrounds
  g.selectAll('.track')
    .data(data).join('rect')
    .attr('x', 18)
    .attr('y', (d, i) => i * (barH + gap) + 6)
    .attr('width', iW - 18)
    .attr('height', barH - 12)
    .attr('fill', C.paper3);

  // Bars
  g.selectAll('.bar')
    .data(data).join('rect')
    .attr('class', 'bar')
    .attr('x', 18)
    .attr('y', (d, i) => i * (barH + gap) + 6)
    .attr('width', d => x(d.count))
    .attr('height', barH - 12)
    .attr('fill', (d, i) => barColors[i])
    .on('mouseover', (event, d) => showTooltip(event,
      `<strong>${d.type}</strong>${d.count.toLocaleString()} incidents`))
    .on('mousemove', moveTooltip)
    .on('mouseout',  hideTooltip);

  // Count labels
  g.selectAll('.val')
    .data(data).join('text')
    .attr('x', iW + 4)
    .attr('y', (d, i) => i * (barH + gap) + barH / 2)
    .attr('dominant-baseline', 'middle')
    .style('font-family', 'JetBrains Mono, monospace')
    .style('font-size', '9px')
    .style('fill', C.inkMuted)
    .text(d => d.count >= 1000 ? (d.count / 1000).toFixed(1) + 'k' : d.count);
}

// ── Top Neighbourhoods (col 3 — flex HTML bars) ───────────────
function createNeighbourhoodChart() {
  const container = document.getElementById('neighbourhood-chart');
  container.innerHTML = '';

  const rows = Array.from(agg.byHood, (count, i) => ({ neighbourhood: meta.neighbourhoods[i], count }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  if (!rows.length) {
    container.innerHTML = '<p style="font-family:JetBrains Mono,monospace;font-size:0.72em;color:#9a8e84;padding:12px 0;">No neighbourhood data available</p>';
    return;
  }


  const max = rows[0].count;
  // Cycle 3 colours across ranks
  const fillColors = [C.red, C.ink, C.amber, C.red, C.ink, C.amber, C.red, C.ink, C.amber, C.red];

  rows.forEach((d, i) => {
    const pct = Math.round((d.count / max) * 100);
    const item = document.createElement('div');
    item.className = 'nbr-item';
    item.innerHTML = `
      <div class="nbr-rank">${i + 1}</div>
      <div class="nbr-info">
        <div class="nbr-name">${d.neighbourhood}</div>
        <div class="nbr-track">
          <div class="nbr-fill" style="width:${pct}%; background:${fillColors[i]}"></div>
        </div>
      </div>
      <div class="nbr-val">${d.count >= 1000 ? (d.count / 1000).toFixed(1) + 'k' : d.count}</div>
    `;
    item.addEventListener('mouseover', ev => showTooltip(ev,
      `<strong>${d.neighbourhood}</strong>${d.count.toLocaleString()} incidents`));
    item.addEventListener('mousemove', moveTooltip);
    item.addEventListener('mouseout',  hideTooltip);
    container.appendChild(item);
  });
}

// ── Time Series (area chart, by year-month) ───────────────────
function createTimeSeriesChart() {
  const container = document.getElementById('time-series-chart');
  container.innerHTML = '';

  if (!agg.total) return;

  // Every month between the first and last with data, inside the selected month range.
  // Empty months show as zero rather than being bridged by the line.
  const first = agg.byMonth.findIndex(c => c > 0);
  const last  = agg.byMonth.findLastIndex(c => c > 0);
  const data = [];
  for (let i = first; i >= 0 && i <= last; i++) {
    if (!agg.monthOk[(i % 12) + 1]) continue;
    data.push({ date: new Date(meta.yearBase + Math.floor(i / 12), i % 12, 1), count: agg.byMonth[i] });
  }

  if (!data.length) return;

  const margin = { top: 8, right: 8, bottom: 20, left: 30 };
  const W  = container.clientWidth || 260;
  const H  = 95;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top  - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime().domain(d3.extent(data, d => d.date)).range([0, iW]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice().range([iH, 0]);

  // Gradient fill
  const gradId = 'tsGrad';
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id', gradId).attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1);
  grad.append('stop').attr('offset', '0%').attr('stop-color', C.red).attr('stop-opacity', 0.15);
  grad.append('stop').attr('offset', '100%').attr('stop-color', C.red).attr('stop-opacity', 0);

  const area = d3.area().x(d => x(d.date)).y0(iH).y1(d => y(d.count)).curve(d3.curveMonotoneX);
  const line = d3.line().x(d => x(d.date)).y(d => y(d.count)).curve(d3.curveMonotoneX);

  g.append('path').datum(data).attr('d', area).attr('fill', `url(#${gradId})`);
  g.append('path').datum(data).attr('d', line)
    .attr('fill', 'none').attr('stroke', C.red).attr('stroke-width', 1.5);

  // Interactive overlay dots (invisible, for hover)
  g.selectAll('.dot').data(data).join('circle')
    .attr('cx', d => x(d.date)).attr('cy', d => y(d.count))
    .attr('r', 4).attr('fill', 'transparent').attr('stroke', 'none')
    .on('mouseover', (event, d) => showTooltip(event,
      `<strong>${d.date.toLocaleDateString('en-CA', {year:'numeric',month:'short'})}</strong>${d.count.toLocaleString()} incidents`))
    .on('mousemove', moveTooltip)
    .on('mouseout',  hideTooltip);

  // Axes
  g.append('g').attr('transform', `translate(0,${iH})`).attr('class', 'axis')
    .call(d3.axisBottom(x).ticks(5).tickSize(3))
    .call(styleAxis).select('.domain').remove();

  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => d >= 1000 ? (d/1000).toFixed(0)+'k' : d).tickSize(3))
    .call(styleAxis).select('.domain').remove();
}

// ── Hourly Distribution ───────────────────────────────────────
function createHourlyChart() {
  const container = document.getElementById('hourly-chart');
  container.innerHTML = '';

  if (!agg.knownHour) return;

  // Incidents logged at exactly 00:00 are VPD's "time unknown" and are left out
  const data = Array.from(agg.byHour, (count, hour) => ({ hour, count }));

  const margin = { top: 8, right: 6, bottom: 20, left: 30 };
  const W  = container.clientWidth || 260;
  const H  = 95;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top  - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(data.map(d => d.hour)).range([0, iW]).padding(0.1);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice().range([iH, 0]);

  // Colour: ramp from paper3 to crimson based on intensity
  const colorScale = d3.scaleSequential()
    .domain([0, d3.max(data, d => d.count)])
    .interpolator(t => d3.interpolateRgb(C.paper3, C.red)(t));

  g.selectAll('.bar').data(data).join('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d.hour))
    .attr('y', d => y(d.count))
    .attr('width', x.bandwidth())
    .attr('height', d => iH - y(d.count))
    .attr('fill', d => colorScale(d.count))
    .on('mouseover', (event, d) => showTooltip(event,
      `<strong>${String(d.hour).padStart(2,'0')}:00</strong>${d.count.toLocaleString()} incidents`))
    .on('mousemove', moveTooltip)
    .on('mouseout',  hideTooltip);

  g.append('g').attr('transform', `translate(0,${iH})`).attr('class', 'axis')
    .call(d3.axisBottom(x).tickValues([0, 6, 12, 18, 23]).tickFormat(d => d + 'h').tickSize(3))
    .call(styleAxis).select('.domain').remove();

  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => d >= 1000 ? (d/1000).toFixed(0)+'k' : d).tickSize(3))
    .call(styleAxis).select('.domain').remove();
}

// ── Day of Week Pattern ───────────────────────────────────────
function createWeekdayChart() {
  const container = document.getElementById('weekday-chart');
  container.innerHTML = '';

  if (!agg.total) return;

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = Array.from(agg.byDow, (count, i) => ({ day: DAY_LABELS[i], count }));

  const margin = { top: 6, right: 6, bottom: 18, left: 30 };
  const W  = container.clientWidth || 500;
  const H  = 80;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top  - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(DAY_LABELS).range([0, iW]).padding(0.15);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice().range([iH, 0]);

  const colorScale = d3.scaleSequential()
    .domain([0, d3.max(data, d => d.count)])
    .interpolator(t => d3.interpolateRgb(C.paper3, C.red)(t));

  g.selectAll('.bar').data(data).join('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d.day))
    .attr('y', d => y(d.count))
    .attr('width', x.bandwidth())
    .attr('height', d => iH - y(d.count))
    .attr('fill', d => colorScale(d.count))
    .on('mouseover', (event, d) => showTooltip(event,
      `<strong>${d.day}</strong>${d.count.toLocaleString()} incidents`))
    .on('mousemove', moveTooltip)
    .on('mouseout',  hideTooltip);

  g.append('g').attr('transform', `translate(0,${iH})`).attr('class', 'axis')
    .call(d3.axisBottom(x).tickSize(3))
    .call(styleAxis).select('.domain').remove();

  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(3).tickFormat(d => d >= 1000 ? (d/1000).toFixed(0)+'k' : d).tickSize(3))
    .call(styleAxis).select('.domain').remove();
}
