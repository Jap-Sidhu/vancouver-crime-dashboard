// ================================================================
//  Vancouver Crime Dashboard — forecast.js
//  8-week forecast by neighbourhood and type (data/forecast.json,
//  produced by scripts/forecast.py)
// ================================================================

let forecast = null;

const LEVEL_LABELS = {
  neighbourhood_x_type: 'One neighbourhood, one crime type',
  neighbourhood_total:  'One neighbourhood, all types',
  type_total:           'All Vancouver, one crime type',
  city_total:           'All Vancouver, all types'
};
const MODEL_LABELS = {
  seasonal_naive: 'Same week last year',
  recent_average: 'Recent 13-week average',
  poisson_glm:    'Poisson regression',
  gradient_boosting: 'Gradient boosting (used)'
};

document.addEventListener('DOMContentLoaded', loadForecast);

async function loadForecast() {
  try {
    const res = await fetch('data/forecast.json');
    if (!res.ok) throw new Error(res.status);
    forecast = await res.json();
  } catch (err) {
    console.error('Forecast unavailable:', err);
    document.getElementById('forecast-section').hidden = true;
    return;
  }

  const hoodSel = document.getElementById('fc-hood');
  const typeSel = document.getElementById('fc-type');
  const add = (sel, value, label) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  };
  add(hoodSel, forecast.all, 'All neighbourhoods');
  forecast.hoods.forEach(h => add(hoodSel, h, h));
  add(typeSel, forecast.all, 'All crime types');
  forecast.types.forEach(t => add(typeSel, t, t));
  hoodSel.addEventListener('change', drawForecast);
  typeSel.addEventListener('change', drawForecast);

  renderAccuracy();
  drawForecast();
  window.addEventListener('resize', () => { clearTimeout(loadForecast.t); loadForecast.t = setTimeout(drawForecast, 200); });
}

function levelFor(hood, type) {
  const all = forecast.all;
  if (hood !== all && type !== all) return 'neighbourhood_x_type';
  if (hood !== all) return 'neighbourhood_total';
  if (type !== all) return 'type_total';
  return 'city_total';
}

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function drawForecast() {
  const hood = document.getElementById('fc-hood').value;
  const type = document.getElementById('fc-type').value;
  const s = forecast.series[`${hood}|${type}`];
  const container = document.getElementById('forecast-chart');
  container.innerHTML = '';
  if (!s) return;

  const parse = iso => new Date(iso + 'T00:00:00');
  const hist = forecast.historyWeeks.map((w, i) => ({ date: parse(w), v: s.actual[i] }));
  const fut  = forecast.forecastWeeks.map((w, i) => ({ date: parse(w), v: s.mean[i], lo: s.lo[i], hi: s.hi[i] }));
  // Join the forecast line to the last actual week so the two read as one series
  const bridge = [{ date: hist[hist.length - 1].date, v: hist[hist.length - 1].v,
                    lo: hist[hist.length - 1].v, hi: hist[hist.length - 1].v }, ...fut];

  const margin = { top: 14, right: 12, bottom: 24, left: 36 };
  const W  = container.clientWidth || 600;
  const H  = 220;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime().domain([hist[0].date, fut[fut.length - 1].date]).range([0, iW]);
  const yMax = d3.max([...hist.map(d => d.v), ...fut.map(d => d.hi)]) || 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);
  // Smoothing small weekly counts (0, 1, 2…) would invent in-between values, so draw them straight
  const curve = yMax < 30 ? d3.curveLinear : d3.curveMonotoneX;

  // Forecast zone background + divider
  const x0 = x(hist[hist.length - 1].date);
  g.append('rect').attr('x', x0).attr('y', 0).attr('width', iW - x0).attr('height', iH).attr('fill', C.paper2);
  g.append('line').attr('x1', x0).attr('x2', x0).attr('y1', 0).attr('y2', iH)
    .attr('stroke', C.rule).attr('stroke-dasharray', '3,3');
  g.append('text').attr('x', x0 + 6).attr('y', 10)
    .style('font-family', 'JetBrains Mono, monospace').style('font-size', '9px')
    .style('fill', C.inkMuted).style('letter-spacing', '0.08em').text('FORECAST →');

  // 80% range band
  g.append('path').datum(bridge)
    .attr('d', d3.area().x(d => x(d.date)).y0(d => y(d.lo)).y1(d => y(d.hi)).curve(curve))
    .attr('fill', C.red).attr('fill-opacity', 0.14);

  // Actual and forecast lines
  g.append('path').datum(hist)
    .attr('d', d3.line().x(d => x(d.date)).y(d => y(d.v)).curve(curve))
    .attr('fill', 'none').attr('stroke', C.ink).attr('stroke-width', 1.6);
  g.append('path').datum(bridge)
    .attr('d', d3.line().x(d => x(d.date)).y(d => y(d.v)).curve(curve))
    .attr('fill', 'none').attr('stroke', C.red).attr('stroke-width', 1.8).attr('stroke-dasharray', '5,3');

  // Hover targets
  g.selectAll('.fc-dot').data([...hist, ...fut]).join('circle')
    .attr('cx', d => x(d.date)).attr('cy', d => y(d.v)).attr('r', 5)
    .attr('fill', 'transparent')
    .on('mouseover', (event, d) => showTooltip(event, d.lo === undefined
      ? `<strong>Week of ${d.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>${d.v} incidents recorded`
      : `<strong>Week of ${d.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>` +
        `Forecast ${d.v.toFixed(1)} · likely ${Math.floor(d.lo)}–${Math.ceil(d.hi)}`))
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip);

  g.append('g').attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).ticks(W < 500 ? 4 : 8).tickFormat(d3.timeFormat('%b %d')).tickSize(3))
    .call(styleAxis).select('.domain').remove();
  g.append('g')
    .call(d3.axisLeft(y).ticks(4).tickSize(3))
    .call(styleAxis).select('.domain').remove();

  // Plain-language summary
  const recent = hist.slice(-8).reduce((a, d) => a + d.v, 0) / 8;
  const ahead = fut.reduce((a, d) => a + d.v, 0) / fut.length;
  const change = recent > 0 ? (ahead - recent) / recent : 0;
  const level = levelFor(hood, type);
  const where = hood === forecast.all ? 'across Vancouver' : `in ${hood}`;
  const what = type === forecast.all ? 'incidents' : `“${type}” incidents`;
  const dir = Math.abs(change) < 0.05 ? 'about the same as' : change > 0 ? `${Math.round(change * 100)}% more than` : `${Math.round(-change * 100)}% fewer than`;
  document.getElementById('forecast-summary').innerHTML =
    `About <b>${ahead.toFixed(ahead < 10 ? 1 : 0)}</b> ${what} a week expected ${where} from ` +
    `${shortDate(forecast.forecastWeeks[0])} to ${shortDate(forecast.forecastWeeks[forecast.forecastWeeks.length - 1])}, ` +
    `${dir} the last 8 recorded weeks (${recent.toFixed(recent < 10 ? 1 : 0)} a week).`;

  const m = forecast.test.metrics[level];
  const baselines = ['seasonal_naive', 'recent_average'].map(k => m[k].wape);
  const gain = 1 - m.gradient_boosting.wape / Math.min(...baselines);
  document.getElementById('forecast-quality').textContent =
    `At this level the model was off by ${Math.round(m.gradient_boosting.wape * 100)}% on average in testing ` +
    `(${gain > 0 ? Math.round(gain * 100) + '% better than' : 'no better than'} the best simple baseline), and ` +
    `${Math.round(forecast.test.coverage80[level] * 100)}% of test weeks fell inside the shaded range.`;
}

function renderAccuracy() {
  const t = forecast.test;
  const pct = v => (v * 100).toFixed(1) + '%';
  const levels = Object.keys(LEVEL_LABELS);
  const models = Object.keys(MODEL_LABELS);
  let html = '<table class="fc-table"><thead><tr><th>Error (WAPE) by level</th>' +
    models.map(k => `<th>${MODEL_LABELS[k]}</th>`).join('') + '<th>In 80% range</th></tr></thead><tbody>';
  levels.forEach(l => {
    const row = t.metrics[l];
    const best = Math.min(...models.map(k => row[k].wape));
    html += `<tr><td>${LEVEL_LABELS[l]}</td>` +
      models.map(k => `<td class="${row[k].wape === best ? 'best' : ''}">${pct(row[k].wape)}</td>`).join('') +
      `<td>${pct(t.coverage80[l])}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('forecast-accuracy').innerHTML = html;
  document.getElementById('forecast-test-range').textContent =
    `${shortDate(t.from)}, ${t.from.slice(0, 4)} – ${shortDate(t.to)}, ${t.to.slice(0, 4)}`;
}
