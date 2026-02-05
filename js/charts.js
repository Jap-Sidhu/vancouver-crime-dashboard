// Chart creation and update functions using D3.js

// Update all charts
function updateCharts() {
    createCrimeTypeChart();
    createNeighbourhoodChart();
    createTimeSeriesChart();
    createHourlyChart();
    createWeekdayChart();
}

// Create Crime Type Distribution Chart (Horizontal Bar Chart)
function createCrimeTypeChart() {
    const container = document.getElementById('crime-type-chart');
    container.innerHTML = ''; // Clear previous chart

    // Aggregate data by crime type
    const crimeTypeCounts = d3.rollup(
        filteredData,
        v => v.length,
        d => d.type
    );

    const data = Array.from(crimeTypeCounts, ([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

    if (data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">No data available</p>';
        return;
    }

    // Set dimensions
    const margin = { top: 20, right: 30, bottom: 40, left: 200 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = Math.max(400, data.length * 30) - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([0, width]);

    const y = d3.scaleBand()
        .domain(data.map(d => d.type))
        .range([0, height])
        .padding(0.2);

    // Add bars
    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', 0)
        .attr('y', d => y(d.type))
        .attr('width', d => x(d.count))
        .attr('height', y.bandwidth())
        .attr('fill', d => getCrimeColor(d.type))
        .attr('rx', 4)
        .on('mouseover', function(event, d) {
            showTooltip(event, `<strong>${d.type}</strong><br>${d.count.toLocaleString()} incidents`);
        })
        .on('mouseout', hideTooltip);

    // Add value labels
    svg.selectAll('.label')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.count) + 5)
        .attr('y', d => y(d.type) + y.bandwidth() / 2)
        .attr('dy', '.35em')
        .text(d => d.count.toLocaleString())
        .style('fill', '#e0e0e0')
        .style('font-size', '12px');

    // Add axes
    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y))
        .selectAll('text')
        .style('text-anchor', 'end')
        .style('fill', '#a0aec0');

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('.0s')))
        .selectAll('text')
        .style('fill', '#a0aec0');
}

// Create Top Neighbourhoods Chart
function createNeighbourhoodChart() {
    const container = document.getElementById('neighbourhood-chart');
    container.innerHTML = '';

    // Filter out empty neighbourhoods
    const dataWithNeighbourhood = filteredData.filter(d => d.neighbourhood && d.neighbourhood !== '');

    if (dataWithNeighbourhood.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">No neighbourhood data available</p>';
        return;
    }

    // Aggregate data
    const neighbourhoodCounts = d3.rollup(
        dataWithNeighbourhood,
        v => v.length,
        d => d.neighbourhood
    );

    const data = Array.from(neighbourhoodCounts, ([neighbourhood, count]) => ({ neighbourhood, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

    // Set dimensions
    const margin = { top: 20, right: 30, bottom: 40, left: 150 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 350 - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([0, width]);

    const y = d3.scaleBand()
        .domain(data.map(d => d.neighbourhood))
        .range([0, height])
        .padding(0.2);

    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', 0)
        .attr('y', d => y(d.neighbourhood))
        .attr('width', d => x(d.count))
        .attr('height', y.bandwidth())
        .attr('fill', '#4a9eff')
        .attr('rx', 4)
        .on('mouseover', function(event, d) {
            showTooltip(event, `<strong>${d.neighbourhood}</strong><br>${d.count.toLocaleString()} incidents`);
        })
        .on('mouseout', hideTooltip);

    svg.selectAll('.label')
        .data(data)
        .enter()
        .append('text')
        .attr('x', d => x(d.count) + 5)
        .attr('y', d => y(d.neighbourhood) + y.bandwidth() / 2)
        .attr('dy', '.35em')
        .text(d => d.count.toLocaleString())
        .style('fill', '#e0e0e0')
        .style('font-size', '12px');

    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y))
        .selectAll('text')
        .style('fill', '#a0aec0');

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('.0s')))
        .selectAll('text')
        .style('fill', '#a0aec0');
}

// Create Time Series Chart
function createTimeSeriesChart() {
    const container = document.getElementById('time-series-chart');
    container.innerHTML = '';

    if (filteredData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">No data available</p>';
        return;
    }

    // Aggregate by year and month
    const timeCounts = d3.rollup(
        filteredData,
        v => v.length,
        d => `${d.year}-${String(d.month).padStart(2, '0')}`
    );

    const data = Array.from(timeCounts, ([date, count]) => {
        const [year, month] = date.split('-');
        return {
            date: new Date(+year, +month - 1, 1),
            count: count
        };
    }).sort((a, b) => a.date - b.date);

    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 250 - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .nice()
        .range([height, 0]);

    // Create area
    const area = d3.area()
        .x(d => x(d.date))
        .y0(height)
        .y1(d => y(d.count))
        .curve(d3.curveMonotoneX);

    svg.append('path')
        .datum(data)
        .attr('class', 'area')
        .attr('fill', '#4a9eff')
        .attr('d', area);

    // Create line
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.count))
        .curve(d3.curveMonotoneX);

    svg.append('path')
        .datum(data)
        .attr('class', 'line')
        .attr('stroke', '#4a9eff')
        .attr('d', line);

    // Add axes
    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(6))
        .selectAll('text')
        .style('fill', '#a0aec0');

    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0s')))
        .selectAll('text')
        .style('fill', '#a0aec0');
}

// Create Hourly Distribution Chart
function createHourlyChart() {
    const container = document.getElementById('hourly-chart');
    container.innerHTML = '';

    const hourlyData = filteredData.filter(d => d.hour !== null);

    if (hourlyData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">No hourly data available</p>';
        return;
    }

    const hourlyCounts = d3.rollup(
        hourlyData,
        v => v.length,
        d => d.hour
    );

    const data = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: hourlyCounts.get(i) || 0
    }));

    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
        .domain(data.map(d => d.hour))
        .range([0, width])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .nice()
        .range([height, 0]);

    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.hour))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', '#ffaa00')
        .attr('rx', 2)
        .on('mouseover', function(event, d) {
            showTooltip(event, `<strong>${d.hour}:00</strong><br>${d.count.toLocaleString()} incidents`);
        })
        .on('mouseout', hideTooltip);

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).tickValues(data.filter((d, i) => i % 3 === 0).map(d => d.hour)))
        .selectAll('text')
        .style('fill', '#a0aec0');

    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0s')))
        .selectAll('text')
        .style('fill', '#a0aec0');
}

// Create Weekday Distribution Chart
function createWeekdayChart() {
    const container = document.getElementById('weekday-chart');
    container.innerHTML = '';

    if (filteredData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">No data available</p>';
        return;
    }

    const weekdayCounts = d3.rollup(
        filteredData,
        v => v.length,
        d => d.dayOfWeek
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const data = Array.from({ length: 7 }, (_, i) => ({
        day: dayNames[i],
        count: weekdayCounts.get(i) || 0
    }));

    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
        .domain(data.map(d => d.day))
        .range([0, width])
        .padding(0.2);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .nice()
        .range([height, 0]);

    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.day))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.count))
        .attr('fill', '#ff44aa')
        .attr('rx', 4)
        .on('mouseover', function(event, d) {
            showTooltip(event, `<strong>${d.day}</strong><br>${d.count.toLocaleString()} incidents`);
        })
        .on('mouseout', hideTooltip);

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .style('fill', '#a0aec0')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');

    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0s')))
        .selectAll('text')
        .style('fill', '#a0aec0');
}

// Tooltip functions
let tooltip;

function showTooltip(event, html) {
    if (!tooltip) {
        tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
    }

    tooltip.html(html)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

function hideTooltip() {
    if (tooltip) {
        tooltip.style('opacity', 0);
    }
}
