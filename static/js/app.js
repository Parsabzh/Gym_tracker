/* IronLog — App Logic v5 */

let activeSessionId = null;
let exercises = [];
const CARDIO_ICONS = { running:'🏃', walking:'🚶', cycling:'🚴', rowing:'🚣', swimming:'🏊', other:'⚡' };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const today = new Date().toISOString().split('T')[0];
  ['session-date','bw-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  const stored = localStorage.getItem(storageKey());
  if (stored) activeSessionId = parseInt(stored);

  await loadExercises();
  updateActiveUI();
  if (activeSessionId) {
    await loadCurrentSets();
    await loadCurrentCardio();
  }

  ['cardio-distance','cardio-duration'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', updatePacePreview)
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function storageKey() {
  return `activeSession_${document.querySelector('.user-badge')?.textContent.trim()}`;
}

function formatDate(d) {
  const dt = new Date((d||'').includes('T') ? d : d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function fmtPace(v) {
  if (!v) return null;
  const m = Math.floor(v), s = Math.round((v - m) * 60);
  return `${m}:${s.toString().padStart(2,'0')} /km`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `show ${type}`;
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.className = '', 2600);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ['session','templates','history','bodyweight','forge'].forEach(t => {
    document.getElementById('view-' + t)?.classList.toggle('active', t === tab);
    document.getElementById('tab-' + t)?.classList.toggle('active',  t === tab);
  });
  if (tab === 'history')    loadHistory();
  if (tab === 'templates')  loadTemplates();
  if (tab === 'bodyweight') loadBodyWeight();
  if (tab === 'forge')      loadForge();
}

function switchPanel(panel) {
  document.getElementById('panel-lift').style.display   = panel === 'lift'   ? '' : 'none';
  document.getElementById('panel-cardio').style.display = panel === 'cardio' ? '' : 'none';
  document.getElementById('ptab-lift').classList.toggle('active',   panel === 'lift');
  document.getElementById('ptab-cardio').classList.toggle('active', panel === 'cardio');
}

// ── Modals ────────────────────────────────────────────────────────────────────
function closeModal(e, id)  { if (e.target === e.currentTarget) closeModalById(id); }
function closeModalById(id) { document.getElementById(id).classList.remove('open'); }
function openExerciseModal(){ document.getElementById('exercise-modal').classList.add('open'); }

function openEndModal() {
  // Reset template section each time
  const inp = document.getElementById('template-name-input');
  const msg = document.getElementById('template-save-msg');
  if (inp) inp.value = '';
  if (msg) { msg.textContent = ''; msg.style.display = 'none'; }
  document.getElementById('end-modal').classList.add('open');
}

// ── Exercises ─────────────────────────────────────────────────────────────────
async function loadExercises() {
  exercises = await fetch('/api/exercises').then(r => r.json());
  const sel  = document.getElementById('exercise-select');
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
  const name  = document.getElementById('new-ex-name').value.trim();
  const errEl = document.getElementById('ex-error');
  if (!name) { errEl.textContent = 'Name required'; errEl.style.display = 'block'; return; }
  const res  = await fetch('/api/exercises', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      muscle_group: document.getElementById('new-ex-muscle').value.trim(),
      equipment:    document.getElementById('new-ex-equip').value.trim()
    })
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  ['new-ex-name','new-ex-muscle','new-ex-equip'].forEach(id => document.getElementById(id).value = '');
  closeModalById('exercise-modal');
  await loadExercises();
  for (const o of document.getElementById('exercise-select').options)
    if (o.text.startsWith(name)) { document.getElementById('exercise-select').value = o.value; break; }
  toast('Exercise added!');
}

// ── Session lifecycle ─────────────────────────────────────────────────────────
async function startSession() {
  const res  = await fetch('/api/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
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

async function endSession() {
  const cal = parseFloat(document.getElementById('end-calories').value) || null;
  await fetch(`/api/sessions/${activeSessionId}/end`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calories_burned: cal })
  });
  activeSessionId = null;
  localStorage.removeItem(storageKey());
  closeModalById('end-modal');
  updateActiveUI();
  document.getElementById('current-sets').innerHTML   = '';
  document.getElementById('current-cardio').innerHTML = '';
  document.getElementById('end-calories').value       = '';
  toast(cal ? `Session saved! 🔥 ${Math.round(cal)} kcal` : 'Session saved!');
}

function updateActiveUI() {
  const hasSid = !!activeSessionId;
  document.getElementById('active-banner').classList.toggle('show', hasSid);
  document.getElementById('start-card').style.display    = hasSid ? 'none' : '';
  document.getElementById('session-panels').style.display = hasSid ? '' : 'none';
  if (hasSid)
    document.getElementById('session-label').textContent = `Session #${activeSessionId}`;
}

// ── Save current session as template (called from End Session modal) ───────────
async function saveAsTemplate() {
  const name  = document.getElementById('template-name-input').value.trim();
  const msg   = document.getElementById('template-save-msg');
  if (!name) {
    msg.style.cssText = 'display:block;color:#ff7a5c';
    msg.textContent   = 'Enter a name first.';
    return;
  }
  if (!activeSessionId) return;

  const res  = await fetch(`/api/templates/from-session/${activeSessionId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (data.ok) {
    msg.style.cssText = 'display:block;color:var(--accent)';
    msg.textContent   = `✓ Saved as "${name}"`;
    document.getElementById('template-name-input').value = '';
  } else {
    msg.style.cssText = 'display:block;color:#ff7a5c';
    msg.textContent   = data.error || 'Failed.';
  }
}

// ── LIVE SESSION: Log set ─────────────────────────────────────────────────────
async function logSet() {
  if (!activeSessionId) { toast('Start a session first!', 'error'); return; }
  const exId = document.getElementById('exercise-select').value;
  if (!exId) { toast('Select an exercise!', 'error'); return; }

  await fetch('/api/sets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id:   activeSessionId,
      exercise_id:  parseInt(exId),
      set_number:   parseInt(document.getElementById('set-number').value)  || 1,
      reps:         parseInt(document.getElementById('set-reps').value)    || null,
      weight_kg:    parseFloat(document.getElementById('set-weight').value) || null,
      rest_seconds: parseInt(document.getElementById('set-rest').value)    || null,
      rpe:          parseFloat(document.getElementById('set-rpe').value)   || null,
      notes:        document.getElementById('set-notes').value.trim()
    })
  });
  // Auto-increment set number, clear notes
  document.getElementById('set-number').value = (parseInt(document.getElementById('set-number').value) || 1) + 1;
  document.getElementById('set-notes').value  = '';
  await loadCurrentSets();
  toast('Set logged! 🔥');
}

// ── LIVE SESSION: Edit an existing set inline ──────────────────────────────────
async function updateSet(id) {
  const reps   = parseInt(document.getElementById(`edit-reps-${id}`).value)    || null;
  const weight = parseFloat(document.getElementById(`edit-weight-${id}`).value) || null;
  const rpe    = parseFloat(document.getElementById(`edit-rpe-${id}`).value)   || null;

  await fetch(`/api/sets/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reps, weight_kg: weight, rpe })
  });
  await loadCurrentSets();
  toast('Set updated ✓');
}

async function deleteSet(id) {
  await fetch(`/api/sets/${id}`, { method: 'DELETE' });
  await loadCurrentSets();
}

async function loadCurrentSets() {
  if (!activeSessionId) return;
  const s = await fetch(`/api/sessions/${activeSessionId}`).then(r => r.json());
  renderLiveSets(s.sets);
}

// Renders the live session sets as EDITABLE rows (reps/weight/rpe inline inputs)
function renderLiveSets(sets) {
  const c = document.getElementById('current-sets');
  if (!sets || !sets.length) { c.innerHTML = ''; return; }

  // Group by exercise
  const groups = {};
  sets.forEach(s => {
    if (!groups[s.exercise_name])
      groups[s.exercise_name] = { muscle: s.muscle_group, sets: [] };
    groups[s.exercise_name].sets.push(s);
  });

  let html = '';
  for (const [name, g] of Object.entries(groups)) {
    html += `<div class="card">
      <div class="card-header">
        <div class="card-title">${name}</div>
        ${g.muscle ? `<span class="muscle-tag">${g.muscle}</span>` : ''}
      </div>
      <table class="set-table">
        <thead><tr>
          <th>Set</th><th>Reps</th><th>kg</th><th>RPE</th><th></th>
        </tr></thead>
        <tbody>`;
    g.sets.forEach(s => {
      html += `<tr>
        <td class="set-num">${s.set_number}</td>
        <td><input type="number" id="edit-reps-${s.id}"   class="set-input" value="${s.reps ?? ''}"      placeholder="—" min="1"></td>
        <td><input type="number" id="edit-weight-${s.id}" class="set-input" value="${s.weight_kg ?? ''}" placeholder="—" step="0.5"></td>
        <td><input type="number" id="edit-rpe-${s.id}"    class="set-input" value="${s.rpe ?? ''}"       placeholder="—" min="1" max="10" step="0.5"></td>
        <td class="set-actions">
          <button class="btn-save-set"  onclick="updateSet(${s.id})"  title="Save">✓</button>
          <button class="btn-del-set"   onclick="deleteSet(${s.id})"  title="Delete">✕</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }
  c.innerHTML = html;
}

// ── Cardio ────────────────────────────────────────────────────────────────────
function updatePacePreview() {
  const dist = parseFloat(document.getElementById('cardio-distance').value);
  const dur  = parseFloat(document.getElementById('cardio-duration').value);
  const el   = document.getElementById('pace-preview');
  if (dist > 0 && dur > 0) {
    el.textContent = `Pace: ${fmtPace(dur / dist)}`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function logCardio() {
  if (!activeSessionId) { toast('Start a session first!', 'error'); return; }
  const dist = parseFloat(document.getElementById('cardio-distance').value) || null;
  const dur  = parseFloat(document.getElementById('cardio-duration').value) || null;
  if (!dist && !dur) { toast('Enter distance or duration!', 'error'); return; }

  const res  = await fetch('/api/cardio', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id:    activeSessionId,
      activity_type: document.getElementById('cardio-type').value,
      distance_km:   dist,
      duration_min:  dur,
      avg_heart_rate:parseInt(document.getElementById('cardio-hr').value)      || null,
      elevation_m:   parseFloat(document.getElementById('cardio-elevation').value) || null,
      notes:         document.getElementById('cardio-notes').value.trim()
    })
  });
  const data = await res.json();
  ['cardio-distance','cardio-duration','cardio-hr','cardio-elevation','cardio-notes']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('pace-preview').style.display = 'none';
  await loadCurrentCardio();
  toast(`Cardio logged! ${data.avg_pace_min_km ? fmtPace(data.avg_pace_min_km) : ''}`);
}

async function deleteCardio(id) {
  await fetch(`/api/cardio/${id}`, { method: 'DELETE' });
  await loadCurrentCardio();
}

async function loadCurrentCardio() {
  if (!activeSessionId) return;
  const s = await fetch(`/api/sessions/${activeSessionId}`).then(r => r.json());
  renderCardio(s.cardio, 'current-cardio', true);
}

function renderCardio(entries, containerId, deletable = false) {
  const c = document.getElementById(containerId);
  if (!entries || !entries.length) { c.innerHTML = ''; return; }

  let html = '<div class="card"><div class="card-header"><div class="card-title">Cardio</div></div>';
  entries.forEach(e => {
    const stats = [
      e.distance_km    ? `<span class="cardio-stat"><strong>${e.distance_km} km</strong></span>`       : '',
      e.duration_min   ? `<span class="cardio-stat"><strong>${e.duration_min} min</strong></span>`     : '',
      e.avg_pace_min_km? `<span class="cardio-stat"><strong>${fmtPace(e.avg_pace_min_km)}</strong></span>` : '',
      e.avg_heart_rate ? `<span class="cardio-stat"><strong>${e.avg_heart_rate} bpm</strong></span>`   : '',
      e.elevation_m    ? `<span class="cardio-stat"><strong>${e.elevation_m} m</strong> elev</span>`   : '',
    ].filter(Boolean).join('');
    html += `<div class="set-row" style="align-items:flex-start">
      <div class="set-badge" style="font-size:16px">${CARDIO_ICONS[e.activity_type] || '⚡'}</div>
      <div class="set-info">
        <div class="set-main" style="text-transform:capitalize">${e.activity_type}</div>
        <div class="cardio-stats" style="margin-top:4px">${stats}</div>
        ${e.notes ? `<div class="set-sub">${e.notes}</div>` : ''}
      </div>
      ${deletable ? `<button class="btn-danger" onclick="deleteCardio(${e.id})">✕</button>` : ''}
    </div>`;
  });
  html += '</div>';
  c.innerHTML = html;
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const sessions = await fetch('/api/sessions').then(r => r.json());
  const c = document.getElementById('history-list');
  if (!sessions.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No sessions yet.</div></div>';
    return;
  }
  c.innerHTML = sessions.map(s => `
    <div class="session-card" onclick="openSession(${s.id})">
      <div class="session-date">${formatDate(s.session_date)}</div>
      <div class="session-chips">
        ${s.total_sets    ? `<span class="chip chip-green">${s.total_sets} sets</span>` : ''}
        ${s.total_volume  ? `<span class="chip chip-blue">${Math.round(s.total_volume).toLocaleString()} kg</span>` : ''}
        ${s.total_cardio  ? `<span class="chip chip-cardio">${s.total_cardio} cardio</span>` : ''}
        ${s.calories_burned ? `<span class="chip chip-cal">🔥 ${Math.round(s.calories_burned)} kcal</span>` : ''}
      </div>
      ${s.notes ? `<div class="session-note">📝 ${s.notes}</div>` : ''}
    </div>`).join('');
}

async function openSession(id) {
  const s = await fetch(`/api/sessions/${id}`).then(r => r.json());
  document.getElementById('modal-title').textContent = formatDate(s.session_date);
  let html = '';

  if (s.calories_burned)
    html += `<div class="cal-badge">🔥 ${Math.round(s.calories_burned)} kcal burned</div>`;
  if (s.notes)
    html += `<p style="color:var(--muted);font-size:13px;margin-bottom:14px">📝 ${s.notes}</p>`;

  // ── Strength: per-exercise table with every set ────────────────────────────
  if (s.sets?.length) {
    const groups = {};
    s.sets.forEach(x => {
      if (!groups[x.exercise_name])
        groups[x.exercise_name] = { muscle: x.muscle_group, sets: [] };
      groups[x.exercise_name].sets.push(x);
    });

    html += '<div class="history-section-title">🏋️ Strength</div>';
    for (const [name, g] of Object.entries(groups)) {
      html += `<div class="hist-exercise">
        <div class="hist-ex-name">${name}${g.muscle ? `<span class="muscle-tag">${g.muscle}</span>` : ''}</div>
        <table class="hist-table">
          <thead><tr><th>Set</th><th>Reps</th><th>Weight</th><th>RPE</th></tr></thead>
          <tbody>`;
      g.sets.forEach(x => {
        html += `<tr>
          <td class="set-num">${x.set_number}</td>
          <td>${x.reps   != null ? `<strong>${x.reps}</strong>` : '—'}</td>
          <td>${x.weight_kg != null ? `<strong>${x.weight_kg} kg</strong>` : '—'}</td>
          <td>${x.rpe    != null ? x.rpe : '—'}</td>
        </tr>`;
        if (x.notes)
          html += `<tr><td colspan="4" class="hist-note">${x.notes}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }
  }

  // ── Cardio ─────────────────────────────────────────────────────────────────
  if (s.cardio?.length) {
    html += '<div class="history-section-title" style="margin-top:16px">🏃 Cardio</div>';
    s.cardio.forEach(e => {
      html += `<div class="hist-exercise">
        <div class="hist-ex-name" style="text-transform:capitalize">
          ${CARDIO_ICONS[e.activity_type] || '⚡'} ${e.activity_type}
        </div>
        <table class="hist-table">
          <thead><tr><th>Distance</th><th>Duration</th><th>Pace</th><th>HR</th></tr></thead>
          <tbody><tr>
            <td>${e.distance_km  != null ? `<strong>${e.distance_km} km</strong>` : '—'}</td>
            <td>${e.duration_min != null ? `<strong>${e.duration_min} min</strong>` : '—'}</td>
            <td>${e.avg_pace_min_km ? `<strong>${fmtPace(e.avg_pace_min_km)}</strong>` : '—'}</td>
            <td>${e.avg_heart_rate  ? `${e.avg_heart_rate} bpm` : '—'}</td>
          </tr></tbody>
        </table>
      </div>`;
    });
  }

  if (!s.sets?.length && !s.cardio?.length)
    html = '<div class="empty-state"><div class="empty-text">Nothing logged.</div></div>';

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('session-modal').classList.add('open');
}

// ── Body Weight ───────────────────────────────────────────────────────────────
async function logBodyWeight() {
  const w = parseFloat(document.getElementById('bw-weight').value);
  if (!w) { toast('Enter a weight!', 'error'); return; }
  await fetch('/api/bodyweight', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weight_kg: w,
      date:  document.getElementById('bw-date').value,
      notes: document.getElementById('bw-notes').value.trim()
    })
  });
  document.getElementById('bw-weight').value = '';
  document.getElementById('bw-notes').value  = '';
  await loadBodyWeight();
  toast('Weight saved! ⚖️');
}

async function loadBodyWeight() {
  const entries = await fetch('/api/bodyweight').then(r => r.json());
  const c = document.getElementById('bw-list');
  if (!entries.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">⚖️</div><div class="empty-text">No entries yet.</div></div>';
    return;
  }
  c.innerHTML = entries.map(e => `
    <div class="bw-row">
      <div>
        <div class="bw-weight">${e.weight_kg}<span class="bw-unit"> kg</span></div>
        ${e.notes ? `<div class="bw-note">${e.notes}</div>` : ''}
      </div>
      <div class="bw-date">${formatDate(e.logged_at)}</div>
    </div>`).join('');
}

init();
