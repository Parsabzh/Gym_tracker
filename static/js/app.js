/* IronLog — App Logic */

let activeSessionId = null;
let exercises = [];

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('session-date').value = today;
  document.getElementById('bw-date').value = today;

  // Restore active session per user (stored with username key)
  const username = document.querySelector('.user-badge')?.textContent.trim();
  const storageKey = `activeSession_${username}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) activeSessionId = parseInt(stored);

  await loadExercises();
  updateActiveUI();
  if (activeSessionId) await loadCurrentSets();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ['workout','history','bodyweight'].forEach(t => {
    document.getElementById('view-'+t).classList.toggle('active', t===tab);
    document.getElementById('tab-'+t).classList.toggle('active', t===tab);
  });
  if (tab === 'history')    loadHistory();
  if (tab === 'bodyweight') loadBodyWeight();
}

// ── Modals ────────────────────────────────────────────────────────────────────
function closeModal(event, id) {
  if (event.target === event.currentTarget) closeModalById(id);
}
function closeModalById(id) {
  document.getElementById(id).classList.remove('open');
}
function openExerciseModal() {
  document.getElementById('exercise-modal').classList.add('open');
}

// ── Exercises ─────────────────────────────────────────────────────────────────
async function loadExercises() {
  exercises = await fetch('/api/exercises').then(r => r.json());
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
  const name  = document.getElementById('new-ex-name').value.trim();
  const errEl = document.getElementById('ex-error');
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }

  const res = await fetch('/api/exercises', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      muscle_group: document.getElementById('new-ex-muscle').value.trim(),
      equipment:    document.getElementById('new-ex-equip').value.trim(),
    })
  });
  const data = await res.json();

  if (!res.ok) {
    errEl.textContent = data.error || 'Failed to add exercise.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  document.getElementById('new-ex-name').value   = '';
  document.getElementById('new-ex-muscle').value = '';
  document.getElementById('new-ex-equip').value  = '';
  closeModalById('exercise-modal');

  await loadExercises();
  // Auto-select the new exercise
  const sel = document.getElementById('exercise-select');
  for (const o of sel.options) {
    if (o.text.startsWith(name)) { sel.value = o.value; break; }
  }
  toast('Exercise added!');
}

// ── Sessions ──────────────────────────────────────────────────────────────────
function getStorageKey() {
  const username = document.querySelector('.user-badge')?.textContent.trim();
  return `activeSession_${username}`;
}

async function startSession() {
  const date  = document.getElementById('session-date').value;
  const notes = document.getElementById('session-notes').value.trim();
  const res   = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, notes })
  });
  const data = await res.json();
  activeSessionId = data.id;
  localStorage.setItem(getStorageKey(), activeSessionId);
  updateActiveUI();
  toast('Session started! 💪');
}

function endSession() {
  activeSessionId = null;
  localStorage.removeItem(getStorageKey());
  updateActiveUI();
  document.getElementById('current-sets').innerHTML = '';
  toast('Session ended!');
}

function updateActiveUI() {
  const banner  = document.getElementById('active-banner');
  const logCard = document.getElementById('log-card');
  if (activeSessionId) {
    banner.classList.add('show');
    logCard.style.display = 'block';
    document.getElementById('session-label').textContent = `Session #${activeSessionId}`;
  } else {
    banner.classList.remove('show');
    logCard.style.display = 'none';
  }
}

// ── Sets ──────────────────────────────────────────────────────────────────────
async function logSet() {
  if (!activeSessionId) { toast('Start a session first!', 'error'); return; }
  const exerciseId = document.getElementById('exercise-select').value;
  if (!exerciseId)  { toast('Select an exercise!', 'error'); return; }

  const payload = {
    session_id:   activeSessionId,
    exercise_id:  parseInt(exerciseId),
    set_number:   parseInt(document.getElementById('set-number').value) || 1,
    reps:         parseInt(document.getElementById('set-reps').value)   || null,
    weight_kg:    parseFloat(document.getElementById('set-weight').value) || null,
    rest_seconds: parseInt(document.getElementById('set-rest').value)   || null,
    rpe:          parseFloat(document.getElementById('set-rpe').value)  || null,
    notes:        document.getElementById('set-notes').value.trim(),
  };

  await fetch('/api/sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Auto-increment set number
  document.getElementById('set-number').value =
    parseInt(document.getElementById('set-number').value) + 1;
  document.getElementById('set-notes').value = '';

  await loadCurrentSets();
  toast('Set logged! 🔥');
}

async function deleteSet(id) {
  await fetch(`/api/sets/${id}`, { method: 'DELETE' });
  await loadCurrentSets();
}

async function loadCurrentSets() {
  if (!activeSessionId) return;
  const session = await fetch(`/api/sessions/${activeSessionId}`).then(r => r.json());
  renderCurrentSets(session.sets);
}

function renderCurrentSets(sets) {
  const container = document.getElementById('current-sets');
  if (!sets || !sets.length) { container.innerHTML = ''; return; }

  const groups = groupByExercise(sets);
  let html = '<div class="card"><div class="card-header"><div class="card-title">Current Session</div></div>';
  for (const [name, g] of Object.entries(groups)) {
    html += `<div class="exercise-group">
      <div class="exercise-group-name">
        ${name}
        ${g.muscle ? `<span class="muscle-tag">${g.muscle}</span>` : ''}
      </div>`;
    g.sets.forEach(s => {
      const main = [
        s.reps    ? `${s.reps} reps`       : null,
        s.weight_kg ? `@ ${s.weight_kg} kg` : null,
      ].filter(Boolean).join(' ');
      const sub = [
        s.rpe          ? `RPE ${s.rpe}`            : null,
        s.rest_seconds ? `${s.rest_seconds}s rest`  : null,
        s.notes        ? s.notes                    : null,
      ].filter(Boolean).join(' · ');
      html += `<div class="set-row">
        <div class="set-badge">${s.set_number}</div>
        <div class="set-info">
          <div class="set-main">${main || '—'}</div>
          ${sub ? `<div class="set-sub">${sub}</div>` : ''}
        </div>
        <button class="btn-danger" onclick="deleteSet(${s.id})">✕</button>
      </div>`;
    });
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

// ── History ────────────────────────────────────────────────────────────────────
async function loadHistory() {
  const sessions = await fetch('/api/sessions').then(r => r.json());
  const container = document.getElementById('history-list');

  if (!sessions.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-text">No sessions yet.<br>Start your first workout!</div>
    </div>`;
    return;
  }

  container.innerHTML = sessions.map(s => `
    <div class="session-card" onclick="openSession(${s.id})">
      <div class="session-date">${formatDate(s.session_date)}</div>
      <div class="session-chips">
        <span class="chip chip-green">${s.total_sets} sets</span>
        ${s.total_volume ? `<span class="chip chip-blue">${Math.round(s.total_volume).toLocaleString()} kg vol</span>` : ''}
        <span class="chip chip-gray">#${s.id}</span>
      </div>
      ${s.notes ? `<div class="session-note">📝 ${s.notes}</div>` : ''}
    </div>
  `).join('');
}

async function openSession(id) {
  const session = await fetch(`/api/sessions/${id}`).then(r => r.json());
  document.getElementById('modal-title').textContent = formatDate(session.session_date);

  const groups = groupByExercise(session.sets);
  let html = '';
  if (session.notes) html += `<p style="color:var(--muted);font-size:13px;margin-bottom:14px">📝 ${session.notes}</p>`;

  for (const [name, g] of Object.entries(groups)) {
    html += `<div class="exercise-group">
      <div class="exercise-group-name">
        ${name}
        ${g.muscle ? `<span class="muscle-tag">${g.muscle}</span>` : ''}
      </div>`;
    g.sets.forEach(s => {
      const main = [
        s.reps      ? `${s.reps} reps`       : null,
        s.weight_kg ? `@ ${s.weight_kg} kg`  : null,
      ].filter(Boolean).join(' ');
      const sub = [
        s.rpe          ? `RPE ${s.rpe}`           : null,
        s.rest_seconds ? `${s.rest_seconds}s rest` : null,
        s.notes        ? s.notes                   : null,
      ].filter(Boolean).join(' · ');
      html += `<div class="set-row">
        <div class="set-badge">${s.set_number}</div>
        <div class="set-info">
          <div class="set-main">${main || '—'}</div>
          ${sub ? `<div class="set-sub">${sub}</div>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  }

  if (!session.sets.length) {
    html = '<div class="empty-state"><div class="empty-text">No sets logged in this session.</div></div>';
  }

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('session-modal').classList.add('open');
}

// ── Body Weight ────────────────────────────────────────────────────────────────
async function logBodyWeight() {
  const weight = parseFloat(document.getElementById('bw-weight').value);
  if (!weight) { toast('Enter a weight!', 'error'); return; }

  await fetch('/api/bodyweight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weight_kg: weight,
      date:  document.getElementById('bw-date').value,
      notes: document.getElementById('bw-notes').value.trim(),
    })
  });

  document.getElementById('bw-weight').value = '';
  document.getElementById('bw-notes').value  = '';
  await loadBodyWeight();
  toast('Weight saved! ⚖️');
}

async function loadBodyWeight() {
  const entries = await fetch('/api/bodyweight').then(r => r.json());
  const container = document.getElementById('bw-list');

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚖️</div>
      <div class="empty-text">No entries yet.</div>
    </div>`;
    return;
  }

  container.innerHTML = entries.map(e => `
    <div class="bw-row">
      <div>
        <div class="bw-weight">${e.weight_kg}<span class="bw-unit">kg</span></div>
        ${e.notes ? `<div class="bw-note">${e.notes}</div>` : ''}
      </div>
      <div class="bw-date">${formatDate(e.logged_at)}</div>
    </div>
  `).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function groupByExercise(sets) {
  const groups = {};
  (sets || []).forEach(s => {
    if (!groups[s.exercise_name]) groups[s.exercise_name] = { muscle: s.muscle_group, sets: [] };
    groups[s.exercise_name].sets.push(s);
  });
  return groups;
}

// Init on load
init();
