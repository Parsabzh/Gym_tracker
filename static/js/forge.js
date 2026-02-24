/* IronLog — FORGE Analytics */

const C = {
  green:  '#c8f135',
  teal:   '#3af5c8',
  orange: '#ff6b4a',
  yellow: '#f5c83a',
  grid:   'rgba(255,255,255,0.05)',
  text:   '#7a7d8a',
  bg:     '#17181c',
};

Chart.defaults.color = C.text;
Chart.defaults.borderColor = C.grid;
Chart.defaults.font.family = "'Barlow', sans-serif";

let charts = {};
let forgeData = null;

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

async function loadForge() {
  forgeData = await fetch('/api/analytics/overview').then(r=>r.json());
  renderStatPills(forgeData);
  renderHeatmap(forgeData.heatmap);
  renderVolumeChart(forgeData.weekly_volume);
  renderCaloriesChart(forgeData.calories_timeline);
  renderBWChart(forgeData.bw_trend);
  populateExercisePicker(forgeData.exercise_progress);
  renderCardioCharts(forgeData.cardio_by_activity);
}

// ── Stat Pills ────────────────────────────────────────────────────────────────
function renderStatPills(d) {
  const t  = d.totals;
  const ct = d.cardio_totals;
  document.getElementById('stat-pills').innerHTML = `
    <div class="stat-pill">
      <div class="stat-pill-val">${t.total_sessions||0}</div>
      <div class="stat-pill-lbl">Sessions</div>
    </div>
    <div class="stat-pill">
      <div class="stat-pill-val">${t.total_volume ? (t.total_volume/1000).toFixed(1)+'t' : '0'}</div>
      <div class="stat-pill-lbl">Total Volume</div>
    </div>
    <div class="stat-pill">
      <div class="stat-pill-val blue">${ct.total_distance ? ct.total_distance.toFixed(0)+'km' : '0'}</div>
      <div class="stat-pill-lbl">Distance Run</div>
    </div>
    <div class="stat-pill">
      <div class="stat-pill-val red">${t.total_calories ? Math.round(t.total_calories).toLocaleString() : '—'}</div>
      <div class="stat-pill-lbl">Kcal Burned</div>
    </div>`;
}

// ── Heatmap ────────────────────────────────────────────────────────────────────
function renderHeatmap(rows) {
  const c = document.getElementById('heatmap-container');
  if (!rows.length) { c.innerHTML = noData(); return; }
  const map = {};
  rows.forEach(r => map[r.date] = r.count);
  const maxC = Math.max(...rows.map(r=>r.count));
  const end = new Date();
  const start = new Date(); start.setMonth(start.getMonth()-6);
  start.setDate(start.getDate()-start.getDay());
  const cells = [];
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    const count = map[d]||0;
    const lvl = count > 0 ? Math.ceil((count/maxC)*4) : 0;
    cells.push(`<div class="heatmap-cell${lvl?` h${lvl}`:''}" title="${d}${count?' · '+count+' session'+(count>1?'s':''):''}"></div>`);
    cur.setDate(cur.getDate()+1);
  }
  c.innerHTML = `<div class="heatmap-grid">${cells.join('')}</div>`;
}

// ── Weekly Volume ─────────────────────────────────────────────────────────────
function renderVolumeChart(rows) {
  destroyChart('volume');
  if (!rows.length) { document.getElementById('chart-volume').parentElement.innerHTML += noData(); return; }
  const ctx = document.getElementById('chart-volume').getContext('2d');
  charts.volume = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r=>r.week.replace(/^\d{4}-/,'')),
      datasets: [{ label:'Volume (kg)', data: rows.map(r=>Math.round(r.volume||0)),
        backgroundColor:'rgba(200,241,53,0.1)', borderColor:C.green, borderWidth:2, borderRadius:6, borderSkipped:false }]
    },
    options: baseOptions('kg')
  });
}

// ── Calories per Session ───────────────────────────────────────────────────────
function renderCaloriesChart(rows) {
  destroyChart('calories');
  if (!rows.length) { document.getElementById('chart-calories').parentElement.innerHTML += noData(); return; }
  const ctx = document.getElementById('chart-calories').getContext('2d');
  charts.calories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r=>r.date?r.date.slice(5):''),
      datasets: [{ label:'Calories Burned', data: rows.map(r=>Math.round(r.calories||0)),
        backgroundColor:'rgba(255,107,74,0.15)', borderColor:C.orange, borderWidth:2, borderRadius:4, borderSkipped:false }]
    },
    options: baseOptions('kcal')
  });
}

// ── Body Weight ────────────────────────────────────────────────────────────────
function renderBWChart(rows) {
  destroyChart('bw');
  if (!rows.length) { document.getElementById('chart-bw').parentElement.innerHTML += noData(); return; }
  const ctx = document.getElementById('chart-bw').getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,200);
  grad.addColorStop(0,'rgba(200,241,53,0.2)'); grad.addColorStop(1,'rgba(200,241,53,0)');
  charts.bw = new Chart(ctx, {
    type: 'line',
    data: {
      labels: rows.map(r=>r.date?r.date.slice(5):''),
      datasets: [{ label:'Body Weight (kg)', data: rows.map(r=>r.weight_kg),
        borderColor:C.green, backgroundColor:grad, borderWidth:2.5,
        pointBackgroundColor:C.green, pointRadius:4, fill:true, tension:0.3 }]
    },
    options: baseOptions('kg')
  });
}

// ── Per-Exercise Weight Progression ───────────────────────────────────────────
function populateExercisePicker(exDict) {
  const sel = document.getElementById('exercise-picker');
  sel.innerHTML = '<option value="">— Select exercise —</option>';
  Object.keys(exDict).sort().forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  });
  // Auto-select first exercise if available
  if (Object.keys(exDict).length > 0) {
    sel.value = Object.keys(exDict).sort()[0];
    renderExerciseChart();
  }
}

function renderExerciseChart() {
  if (!forgeData) return;
  const name = document.getElementById('exercise-picker').value;
  destroyChart('exercise');
  const wrap = document.getElementById('chart-exercise');
  if (!name || !forgeData.exercise_progress[name]) {
    wrap.parentElement.querySelector('.no-data')?.remove();
    return;
  }
  const ex = forgeData.exercise_progress[name];
  const ctx = wrap.getContext('2d');
  charts.exercise = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ex.data.map(d=>d.date?d.date.slice(5):''),
      datasets: [{
        label: 'Max Weight (kg)',
        data: ex.data.map(d=>d.max_weight),
        borderColor: C.teal, backgroundColor:'rgba(58,245,200,0.1)',
        borderWidth: 2.5, pointBackgroundColor:C.teal,
        pointRadius: 5, fill:true, tension:0.3,
        yAxisID: 'y'
      }, {
        label: 'Max Reps',
        data: ex.data.map(d=>d.max_reps),
        borderColor: C.yellow, backgroundColor:'transparent',
        borderWidth: 1.5, pointRadius:3, borderDash:[4,4],
        tension:0.3, yAxisID: 'y2'
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:true, position:'top', labels:{font:{size:11},padding:10} },
        tooltip: tooltipStyle()
      },
      scales:{
        x:{ grid:{color:C.grid}, ticks:{font:{size:10}} },
        y:{ grid:{color:C.grid}, ticks:{font:{size:10}}, title:{display:true,text:'kg',font:{size:10}} },
        y2:{ position:'right', grid:{display:false}, ticks:{font:{size:10}}, title:{display:true,text:'reps',font:{size:10}} }
      }
    }
  });
}

// ── Cardio Charts (one per activity type) ─────────────────────────────────────
function renderCardioCharts(cardioDict) {
  const container = document.getElementById('cardio-charts');
  container.innerHTML = '';
  const ICONS = {running:'🏃',walking:'🚶',cycling:'🚴',rowing:'🚣',swimming:'🏊',other:'⚡'};
  const COLORS = {running:C.green, walking:C.teal, cycling:C.yellow, rowing:C.orange, swimming:'#60a5fa', other:'#a78bfa'};

  Object.entries(cardioDict).forEach(([activity, entries]) => {
    if (!entries.length) return;
    const color = COLORS[activity]||C.green;
    const icon  = ICONS[activity]||'⚡';

    // Format pace as MM:SS string for display
    const paceLabels = entries.map(e => {
      if (!e.avg_pace_min_km) return null;
      const m = Math.floor(e.avg_pace_min_km);
      const s = Math.round((e.avg_pace_min_km-m)*60);
      return `${m}:${s.toString().padStart(2,'0')}`;
    });

    const div = document.createElement('div');
    div.className = 'chart-card';
    div.innerHTML = `
      <div class="chart-title">${icon} ${activity.charAt(0).toUpperCase()+activity.slice(1)} — Distance & Pace</div>
      <div class="chart-wrap" style="height:220px"><canvas id="chart-cardio-${activity}"></canvas></div>`;
    container.appendChild(div);

    setTimeout(() => {
      const ctx = document.getElementById(`chart-cardio-${activity}`).getContext('2d');
      charts[`cardio-${activity}`] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: entries.map(e=>e.date?e.date.slice(5):''),
          datasets: [
            {
              label: 'Distance (km)',
              data: entries.map(e=>e.distance_km),
              borderColor: color,
              backgroundColor: hexAlpha(color, 0.1),
              borderWidth: 2.5, pointRadius:5,
              pointBackgroundColor: color,
              fill:true, tension:0.3, yAxisID:'y'
            },
            {
              label: 'Pace (min/km)',
              data: entries.map(e=>e.avg_pace_min_km),
              borderColor: C.orange,
              backgroundColor:'transparent',
              borderWidth:1.5, borderDash:[4,4],
              pointRadius:3, tension:0.3, yAxisID:'y2'
            }
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{ display:true, position:'top', labels:{font:{size:11},padding:10} },
            tooltip:{
              ...tooltipStyle(),
              callbacks:{
                label: ctx => {
                  if (ctx.datasetIndex===0) return ` ${ctx.parsed.y} km`;
                  // Show pace as MM:SS
                  const idx = ctx.dataIndex;
                  return paceLabels[idx] ? ` Pace: ${paceLabels[idx]} min/km` : '';
                }
              }
            }
          },
          scales:{
            x:{ grid:{color:C.grid}, ticks:{font:{size:10}} },
            y:{ grid:{color:C.grid}, ticks:{font:{size:10}}, title:{display:true,text:'km',font:{size:10}} },
            y2:{ position:'right', reverse:true, grid:{display:false},
                 ticks:{font:{size:10}, callback: v => {
                   const m=Math.floor(v); const s=Math.round((v-m)*60);
                   return `${m}:${s.toString().padStart(2,'0')}`;
                 }},
                 title:{display:true,text:'pace',font:{size:10}} }
          }
        }
      });
    }, 0);
  });

  if (!Object.keys(cardioDict).length) {
    container.innerHTML = `<div class="chart-card"><div class="chart-title">🏃 Cardio Progress</div>${noData()}</div>`;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function baseOptions(yLabel) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip: tooltipStyle() },
    scales:{
      x:{ grid:{color:C.grid}, ticks:{font:{size:10}} },
      y:{ grid:{color:C.grid}, ticks:{font:{size:10}},
          title:{display:!!yLabel, text:yLabel, font:{size:10}} }
    }
  };
}

function tooltipStyle() {
  return {
    backgroundColor:'#1e2026', borderColor:'#32323f', borderWidth:1,
    titleColor:'#ebebf0', bodyColor:'#a0a0b0', padding:10
  };
}

function hexAlpha(hex, alpha) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function noData() {
  return '<div class="no-data">Log more data to unlock this chart ✦</div>';
}
