/* IronLog — App Logic v4 */

let activeSessionId = null;
let exercises = [];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const today = new Date().toISOString().split('T')[0];
  ['session-date','bw-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  const key = storageKey();
  const stored = localStorage.getItem(key);
  if (stored) activeSessionId = parseInt(stored);

  await loadExercises();
  updateActiveUI();
  if (activeSessionId) {
    await loadCurrentSets();
    await loadCurrentCardio();
  }

  // Live pace preview
  ['cardio-distance','cardio-duration'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updatePacePreview);
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ['session','history','bodyweight','forge'].forEach(t => {
    document.getElementById('view-'+t)?.classList.toggle('active', t===tab);
    document.getElementById('tab-'+t)?.classList.toggle('active', t===tab);
  });
  if (tab==='history')    loadHistory();
  if (tab==='bodyweight') loadBodyWeight();
  if (tab==='forge')      loadForge();
}

function switchPanel(panel) {
  document.getElementById('panel-lift').style.display   = panel==='lift'   ? '' : 'none';
  document.getElementById('panel-cardio').style.display = panel==='cardio' ? '' : 'none';
  document.getElementById('ptab-lift').classList.toggle('active',   panel==='lift');
  document.getElementById('ptab-cardio').classList.toggle('active', panel==='cardio');
}

// ── Modals ────────────────────────────────────────────────────────────────────
function closeModal(e,id) { if(e.target===e.currentTarget) closeModalById(id); }
function closeModalById(id) { document.getElementById(id).classList.remove('open'); }
function openExerciseModal() { document.getElementById('exercise-modal').classList.add('open'); }
function openEndModal() { document.getElementById('end-modal').classList.add('open'); }

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `show ${type}`;
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.className='', 2400);
}

// ── Exercises ─────────────────────────────────────────────────────────────────
async function loadExercises() {
  exercises = await fetch('/api/exercises').then(r=>r.json());
  const sel = document.getElementById('exercise-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select exercise —</option>';
  exercises.forEach(e => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.name + (e.muscle_group ? ` (${e.muscle_group})` : '');
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

async function saveExercise() {
  const name = document.getElementById('new-ex-name').value.trim();
  const errEl = document.getElementById('ex-error');
  if (!name) { errEl.textContent='Name required'; errEl.style.display='block'; return; }
  const res = await fetch('/api/exercises', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name,
      muscle_group: document.getElementById('new-ex-muscle').value.trim(),
      equipment:    document.getElementById('new-ex-equip').value.trim() })
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent=data.error||'Failed'; errEl.style.display='block'; return; }
  errEl.style.display='none';
  ['new-ex-name','new-ex-muscle','new-ex-equip'].forEach(id=>document.getElementById(id).value='');
  closeModalById('exercise-modal');
  await loadExercises();
  const sel = document.getElementById('exercise-select');
  for (const o of sel.options) if (o.text.startsWith(name)) { sel.value=o.value; break; }
  toast('Exercise added!');
}

// ── Session ───────────────────────────────────────────────────────────────────
function storageKey() {
  return `activeSession_${document.querySelector('.user-badge')?.textContent.trim()}`;
}

async function startSession() {
  const res = await fetch('/api/sessions', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      date:  document.getElementById('session-date').value,
      notes: document.getElementById('session-notes').value.trim()
    })
  });
  const data = await res.json();
  activeSessionId = data.id;
  localStorage.setItem(storageKey(), activeSessionId);
  updateActiveUI();
  toast('Session started! 💪');
}

function openEndModal() {
  document.getElementById('end-modal').classList.add('open');
}

async function endSession() {
  const cal = parseFloat(document.getElementById('end-calories').value)||null;
  await fetch(`/api/sessions/${activeSessionId}/end`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ calories_burned: cal })
  });
  activeSessionId = null;
  localStorage.removeItem(storageKey());
  closeModalById('end-modal');
  updateActiveUI();
  document.getElementById('current-sets').innerHTML = '';
  document.getElementById('current-cardio').innerHTML = '';
  document.getElementById('end-calories').value = '';
  toast(cal ? `Session saved! 🔥 ${Math.round(cal)} kcal burned` : 'Session saved!');
}

function updateActiveUI() {
  const banner  = document.getElementById('active-banner');
  const startCard = document.getElementById('start-card');
  const panels  = document.getElementById('session-panels');
  if (activeSessionId) {
    banner.classList.add('show');
    startCard.style.display = 'none';
    panels.style.display = '';
    document.getElementById('session-label').textContent = `Session #${activeSessionId}`;
  } else {
    banner.classList.remove('show');
    startCard.style.display = '';
    panels.style.display = 'none';
  }
}

// ── Sets ──────────────────────────────────────────────────────────────────────
async function logSet() {
  if (!activeSessionId) { toast('Start a session first!','error'); return; }
  const exId = document.getElementById('exercise-select').value;
  if (!exId) { toast('Select an exercise!','error'); return; }
  await fetch('/api/sets', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      session_id:   activeSessionId,
      exercise_id:  parseInt(exId),
      set_number:   parseInt(document.getElementById('set-number').value)||1,
      reps:         parseInt(document.getElementById('set-reps').value)||null,
      weight_kg:    parseFloat(document.getElementById('set-weight').value)||null,
      rest_seconds: parseInt(document.getElementById('set-rest').value)||null,
      rpe:          parseFloat(document.getElementById('set-rpe').value)||null,
      notes:        document.getElementById('set-notes').value.trim()
    })
  });
  document.getElementById('set-number').value = parseInt(document.getElementById('set-number').value)+1;
  document.getElementById('set-notes').value = '';
  await loadCurrentSets();
  toast('Set logged! 🔥');
}

async function deleteSet(id) {
  await fetch(`/api/sets/${id}`,{method:'DELETE'});
  await loadCurrentSets();
}

async function loadCurrentSets() {
  if (!activeSessionId) return;
  const s = await fetch(`/api/sessions/${activeSessionId}`).then(r=>r.json());
  renderSets(s.sets, 'current-sets', true);
}

function renderSets(sets, containerId, deletable=false) {
  const c = document.getElementById(containerId);
  if (!sets||!sets.length) { c.innerHTML=''; return; }
  const groups = {};
  sets.forEach(s => {
    if (!groups[s.exercise_name]) groups[s.exercise_name]={muscle:s.muscle_group,sets:[]};
    groups[s.exercise_name].sets.push(s);
  });
  let html = '<div class="card"><div class="card-header"><div class="card-title">Strength</div></div>';
  for (const [name,g] of Object.entries(groups)) {
    html += `<div class="exercise-group"><div class="exercise-group-name">${name}${g.muscle?`<span class="muscle-tag">${g.muscle}</span>`:''}</div>`;
    g.sets.forEach(s => {
      const main = [s.reps?`${s.reps} reps`:null, s.weight_kg?`@ ${s.weight_kg} kg`:null].filter(Boolean).join(' ');
      const sub  = [s.rpe?`RPE ${s.rpe}`:null, s.rest_seconds?`${s.rest_seconds}s rest`:null, s.notes||null].filter(Boolean).join(' · ');
      html += `<div class="set-row"><div class="set-badge">${s.set_number}</div><div class="set-info"><div class="set-main">${main||'—'}</div>${sub?`<div class="set-sub">${sub}</div>`:''}</div>${deletable?`<button class="btn-danger" onclick="deleteSet(${s.id})">✕</button>`:''}</div>`;
    });
    html += '</div>';
  }
  html += '</div>';
  c.innerHTML = html;
}

// ── Cardio ────────────────────────────────────────────────────────────────────
const CARDIO_ICONS = {running:'🏃',walking:'🚶',cycling:'🚴',rowing:'🚣',swimming:'🏊',other:'⚡'};

function updatePacePreview() {
  const dist = parseFloat(document.getElementById('cardio-distance').value);
  const dur  = parseFloat(document.getElementById('cardio-duration').value);
  const el   = document.getElementById('pace-preview');
  if (dist && dur && dist > 0) {
    const pace = dur/dist;
    const min  = Math.floor(pace);
    const sec  = Math.round((pace-min)*60);
    el.textContent = `Pace: ${min}:${sec.toString().padStart(2,'0')} min/km`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function logCardio() {
  if (!activeSessionId) { toast('Start a session first!','error'); return; }
  const dist = parseFloat(document.getElementById('cardio-distance').value)||null;
  const dur  = parseFloat(document.getElementById('cardio-duration').value)||null;
  if (!dist && !dur) { toast('Enter distance or duration!','error'); return; }
  const res = await fetch('/api/cardio', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      session_id:    activeSessionId,
      activity_type: document.getElementById('cardio-type').value,
      distance_km:   dist,
      duration_min:  dur,
      avg_heart_rate:parseInt(document.getElementById('cardio-hr').value)||null,
      elevation_m:   parseFloat(document.getElementById('cardio-elevation').value)||null,
      notes:         document.getElementById('cardio-notes').value.trim()
    })
  });
  const data = await res.json();
  ['cardio-distance','cardio-duration','cardio-hr','cardio-elevation','cardio-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pace-preview').style.display='none';
  await loadCurrentCardio();
  const paceStr = data.avg_pace_min_km ? ` · ${data.avg_pace_min_km.toFixed(2)} min/km` : '';
  toast(`Cardio logged!${paceStr}`);
}

async function deleteCardio(id) {
  await fetch(`/api/cardio/${id}`,{method:'DELETE'});
  await loadCurrentCardio();
}

async function loadCurrentCardio() {
  if (!activeSessionId) return;
  const s = await fetch(`/api/sessions/${activeSessionId}`).then(r=>r.json());
  renderCardio(s.cardio, 'current-cardio', true);
}

function renderCardio(entries, containerId, deletable=false) {
  const c = document.getElementById(containerId);
  if (!entries||!entries.length) { c.innerHTML=''; return; }
  let html = '<div class="card"><div class="card-header"><div class="card-title">Cardio</div></div>';
  entries.forEach(e => {
    const pace = e.avg_pace_min_km ? (() => {
      const m = Math.floor(e.avg_pace_min_km);
      const s = Math.round((e.avg_pace_min_km-m)*60);
      return `${m}:${s.toString().padStart(2,'0')} min/km`;
    })() : null;
    const stats = [
      e.distance_km   ? `<span class="cardio-stat"><strong>${e.distance_km}km</strong></span>` : '',
      e.duration_min  ? `<span class="cardio-stat"><strong>${e.duration_min}min</strong></span>` : '',
      pace            ? `<span class="cardio-stat"><strong>${pace}</strong></span>` : '',
      e.avg_heart_rate? `<span class="cardio-stat"><strong>${e.avg_heart_rate}</strong> bpm</span>` : '',
      e.elevation_m   ? `<span class="cardio-stat"><strong>${e.elevation_m}m</strong> elev</span>` : '',
    ].filter(Boolean).join('');
    html += `<div class="set-row" style="align-items:flex-start">
      <div class="set-badge" style="font-size:16px">${CARDIO_ICONS[e.activity_type]||'⚡'}</div>
      <div class="set-info">
        <div class="set-main" style="text-transform:capitalize">${e.activity_type}</div>
        <div class="cardio-stats" style="margin-top:4px">${stats}</div>
        ${e.notes?`<div class="set-sub">${e.notes}</div>`:''}
      </div>
      ${deletable?`<button class="btn-danger" onclick="deleteCardio(${e.id})">✕</button>`:''}
    </div>`;
  });
  html += '</div>';
  c.innerHTML = html;
}

// ── History ────────────────────────────────────────────────────────────────────
async function loadHistory() {
  const sessions = await fetch('/api/sessions').then(r=>r.json());
  const c = document.getElementById('history-list');
  if (!sessions.length) {
    c.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No sessions yet.</div></div>';
    return;
  }
  c.innerHTML = sessions.map(s => `
    <div class="session-card" onclick="openSession(${s.id})">
      <div class="session-date">${formatDate(s.session_date)}</div>
      <div class="session-chips">
        ${s.total_sets?`<span class="chip chip-green">${s.total_sets} sets</span>`:''}
        ${s.total_volume?`<span class="chip chip-blue">${Math.round(s.total_volume).toLocaleString()} kg vol</span>`:''}
        ${s.total_cardio?`<span class="chip chip-cardio">${s.total_cardio} cardio</span>`:''}
        ${s.calories_burned?`<span class="chip chip-cal">🔥 ${Math.round(s.calories_burned)} kcal</span>`:''}
      </div>
      ${s.notes?`<div class="session-note">📝 ${s.notes}</div>`:''}
    </div>`).join('');
}

async function openSession(id) {
  const s = await fetch(`/api/sessions/${id}`).then(r=>r.json());
  document.getElementById('modal-title').textContent = formatDate(s.session_date);
  let html = '';
  if (s.calories_burned) html += `<div class="cal-badge">🔥 ${Math.round(s.calories_burned)} kcal burned</div>`;
  if (s.notes) html += `<p style="color:var(--muted);font-size:13px;margin-bottom:14px">📝 ${s.notes}</p>`;

  // Strength
  if (s.sets?.length) {
    const groups = {};
    s.sets.forEach(x => {
      if (!groups[x.exercise_name]) groups[x.exercise_name]={muscle:x.muscle_group,sets:[]};
      groups[x.exercise_name].sets.push(x);
    });
    html += '<div style="margin-bottom:12px"><div class="card-title" style="margin-bottom:10px">🏋️ Strength</div>';
    for (const [name,g] of Object.entries(groups)) {
      html += `<div class="exercise-group"><div class="exercise-group-name">${name}${g.muscle?`<span class="muscle-tag">${g.muscle}</span>`:''}</div>`;
      g.sets.forEach(x => {
        const main = [x.reps?`${x.reps} reps`:null,x.weight_kg?`@ ${x.weight_kg} kg`:null].filter(Boolean).join(' ');
        const sub  = [x.rpe?`RPE ${x.rpe}`:null,x.rest_seconds?`${x.rest_seconds}s rest`:null,x.notes||null].filter(Boolean).join(' · ');
        html += `<div class="set-row"><div class="set-badge">${x.set_number}</div><div class="set-info"><div class="set-main">${main||'—'}</div>${sub?`<div class="set-sub">${sub}</div>`:''}</div></div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // Cardio
  if (s.cardio?.length) {
    html += '<div class="card-title" style="margin-bottom:10px">🏃 Cardio</div>';
    s.cardio.forEach(e => {
      const pace = e.avg_pace_min_km ? (() => {
        const m=Math.floor(e.avg_pace_min_km); const sc=Math.round((e.avg_pace_min_km-m)*60);
        return `${m}:${sc.toString().padStart(2,'0')} min/km`;
      })() : null;
      html += `<div class="set-row" style="align-items:flex-start">
        <div class="set-badge" style="font-size:16px">${CARDIO_ICONS[e.activity_type]||'⚡'}</div>
        <div class="set-info">
          <div class="set-main" style="text-transform:capitalize">${e.activity_type}</div>
          <div class="cardio-stats" style="margin-top:4px">
            ${e.distance_km?`<span class="cardio-stat"><strong>${e.distance_km}km</strong></span>`:''}
            ${e.duration_min?`<span class="cardio-stat"><strong>${e.duration_min}min</strong></span>`:''}
            ${pace?`<span class="cardio-stat"><strong>${pace}</strong></span>`:''}
            ${e.avg_heart_rate?`<span class="cardio-stat"><strong>${e.avg_heart_rate}</strong> bpm</span>`:''}
          </div>
        </div>
      </div>`;
    });
  }

  if (!s.sets?.length && !s.cardio?.length)
    html = '<div class="empty-state"><div class="empty-text">Nothing logged in this session.</div></div>';

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('session-modal').classList.add('open');
}

// ── Body Weight ────────────────────────────────────────────────────────────────
async function logBodyWeight() {
  const w = parseFloat(document.getElementById('bw-weight').value);
  if (!w) { toast('Enter a weight!','error'); return; }
  await fetch('/api/bodyweight', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({weight_kg:w, date:document.getElementById('bw-date').value, notes:document.getElementById('bw-notes').value.trim()})
  });
  document.getElementById('bw-weight').value='';
  document.getElementById('bw-notes').value='';
  await loadBodyWeight();
  toast('Weight saved! ⚖️');
}

async function loadBodyWeight() {
  const entries = await fetch('/api/bodyweight').then(r=>r.json());
  const c = document.getElementById('bw-list');
  if (!entries.length) { c.innerHTML='<div class="empty-state"><div class="empty-icon">⚖️</div><div class="empty-text">No entries yet.</div></div>'; return; }
  c.innerHTML = entries.map(e=>`
    <div class="bw-row">
      <div><div class="bw-weight">${e.weight_kg}<span class="bw-unit">kg</span></div>${e.notes?`<div class="bw-note">${e.notes}</div>`:''}</div>
      <div class="bw-date">${formatDate(e.logged_at)}</div>
    </div>`).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(d) {
  const dt = new Date((d||'').includes('T') ? d : d+'T00:00:00');
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}

init();
