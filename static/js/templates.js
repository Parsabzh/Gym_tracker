/* IronLog — Templates v2 */

let tplExercises = [];

// ── Load & render template list ───────────────────────────────────────────────
async function loadTemplates() {
  const list = await fetch('/api/templates').then(r => r.json());
  const c = document.getElementById('template-list');
  if (!list.length) {
    c.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-text">No templates yet.<br>End a session and tap <strong>"Save as Template"</strong>,<br>or create one from scratch above.</div>
    </div>`;
    return;
  }
  c.innerHTML = list.map(t => `
    <div class="template-card" onclick="openTemplate(${t.id})">
      <div class="tpl-name">${t.name}</div>
      <div class="tpl-meta">
        ${t.exercise_count ? `<span class="chip chip-green">${t.exercise_count} exercise${t.exercise_count > 1 ? 's' : ''}</span>` : ''}
        ${t.cardio_count   ? `<span class="chip chip-cardio">${t.cardio_count} cardio</span>` : ''}
        ${t.last_used      ? `<span class="chip" style="background:rgba(200,241,53,.06);color:var(--muted)">Last: ${formatDate(t.last_used)}</span>` : '<span class="chip" style="background:rgba(255,255,255,.04);color:var(--muted)">Never used</span>'}
      </div>
      ${t.notes ? `<div class="tpl-notes">${t.notes}</div>` : ''}
    </div>`).join('');
}

// ── Open template detail / preview modal ──────────────────────────────────────
async function openTemplate(id) {
  const t = await fetch(`/api/templates/${id}`).then(r => r.json());
  document.getElementById('tpl-modal-title').textContent = t.name;

  const ICONS = { running:'🏃', walking:'🚶', cycling:'🚴', rowing:'🚣', swimming:'🏊', other:'⚡' };
  let html = '';
  if (t.notes) html += `<p style="color:var(--muted);font-size:13px;margin-bottom:14px">${t.notes}</p>`;

  if (t.exercises.length) {
    const srcLabel = t.has_history
      ? '<span class="tpl-history-badge">🕐 Last session numbers</span>'
      : '<span class="tpl-history-badge tpl-history-new">📋 Template targets</span>';
    html += `<div class="card-title" style="margin-bottom:4px">🏋️ Exercises</div>
      <div style="margin-bottom:12px">${srcLabel}</div>`;

    t.exercises.forEach((e, i) => {
      // Show last-session sets if available, else targets
      let setsHtml = '';
      if (e.last_sets && e.last_sets.length) {
        setsHtml = `<table class="hist-table" style="margin-top:6px">
          <thead><tr><th>Set</th><th>Reps</th><th>kg</th><th>RPE</th></tr></thead>
          <tbody>` +
          e.last_sets.map(s => `<tr>
            <td class="set-num">${s.set_number}</td>
            <td>${s.reps != null ? `<strong>${s.reps}</strong>` : '—'}</td>
            <td>${s.weight_kg != null ? `<strong>${s.weight_kg}</strong>` : '—'}</td>
            <td>${s.rpe != null ? s.rpe : '—'}</td>
          </tr>`).join('') +
          `</tbody></table>`;
      } else {
        const targets = [
          e.target_sets      ? `${e.target_sets} sets`       : null,
          e.target_reps      ? `${e.target_reps} reps`       : null,
          e.target_weight_kg ? `@ ${e.target_weight_kg} kg`  : null,
        ].filter(Boolean).join(' · ');
        setsHtml = targets ? `<div class="set-sub" style="margin-top:3px">${targets}</div>` : '';
      }

      html += `
        <div class="tpl-ex-preview">
          <div class="tpl-ex-preview-name">
            <span class="set-badge" style="display:inline-flex;margin-right:8px">${i + 1}</span>
            ${e.exercise_name}
            ${e.muscle_group ? `<span class="muscle-tag">${e.muscle_group}</span>` : ''}
          </div>
          ${setsHtml}
        </div>`;
    });
  }

  if (t.cardio.length) {
    html += '<div class="card-title" style="margin-top:16px;margin-bottom:12px">🏃 Cardio</div>';
    t.cardio.forEach(c => {
      const info = [
        c.target_distance_km  ? `${c.target_distance_km} km`  : null,
        c.target_duration_min ? `${c.target_duration_min} min` : null,
      ].filter(Boolean).join(' · ');
      html += `
        <div class="set-row">
          <div class="set-badge" style="font-size:16px">${ICONS[c.activity_type] || '⚡'}</div>
          <div class="set-info">
            <div class="set-main" style="text-transform:capitalize">${c.activity_type}</div>
            ${info ? `<div class="set-sub">${info}</div>` : ''}
          </div>
        </div>`;
    });
  }

  html += `
    <div class="divider"></div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1" onclick="startFromTemplate(${id})">▶ Start Session</button>
      <button class="btn-danger btn-icon" onclick="confirmDeleteTemplate(${id})" title="Delete">🗑</button>
    </div>`;

  document.getElementById('tpl-modal-body').innerHTML = html;
  document.getElementById('template-modal').classList.add('open');
}

// ── Start session FROM template — pre-fills with LAST SESSION actuals ────────
async function startFromTemplate(tid) {
  closeModalById('template-modal');
  switchTab('session');

  // Create a new session linked to this template
  const startRes = await fetch(`/api/templates/${tid}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }
  });
  const startData = await startRes.json();
  activeSessionId = startData.session_id;
  localStorage.setItem(storageKey(), activeSessionId);
  updateActiveUI();

  // Load template — exercises include last_sets (actual numbers from last time)
  const t = await fetch(`/api/templates/${tid}`).then(r => r.json());

  for (const ex of t.exercises) {
    // Use last-session sets if available, otherwise fall back to template targets
    const setsToLog = ex.last_sets && ex.last_sets.length > 0
      ? ex.last_sets                          // ← real numbers from last workout
      : buildFallbackSets(ex);                // ← template targets if no history

    for (const s of setsToLog) {
      await fetch('/api/sets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id:  activeSessionId,
          exercise_id: ex.exercise_id,
          set_number:  s.set_number,
          reps:        s.reps      || null,
          weight_kg:   s.weight_kg || null,
          rpe:         s.rpe       || null,
          notes:       ''
        })
      });
    }
  }

  // Pre-select first exercise in the dropdown
  if (t.exercises.length) {
    const firstEx = t.exercises[0];
    document.getElementById('exercise-select').value = String(firstEx.exercise_id);
    const lastSetNum = firstEx.last_sets?.length || firstEx.target_sets || 1;
    document.getElementById('set-number').value = lastSetNum + 1;
  }

  await loadCurrentSets();

  const src = t.has_history ? 'last session numbers' : 'template targets';
  toast(`"${t.name}" loaded with ${src} — edit & confirm each set 💪`);
}

// Build fallback set list from template targets when no history exists
function buildFallbackSets(ex) {
  const count = ex.target_sets || 1;
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    reps:       ex.target_reps       || null,
    weight_kg:  ex.target_weight_kg  || null,
    rpe:        null
  }));
}

// ── Delete template ───────────────────────────────────────────────────────────
function confirmDeleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  deleteTemplate(id);
}

async function deleteTemplate(id) {
  await fetch(`/api/templates/${id}`, { method: 'DELETE' });
  closeModalById('template-modal');
  loadTemplates();
  toast('Template deleted.');
}

// ── Create template from scratch ──────────────────────────────────────────────
function openCreateTemplateModal() {
  tplExercises = [];
  document.getElementById('new-tpl-name').value  = '';
  document.getElementById('new-tpl-notes').value = '';
  document.getElementById('new-tpl-exercises').innerHTML = '';
  document.getElementById('new-tpl-error').style.display = 'none';

  const sel = document.getElementById('new-tpl-ex-select');
  sel.innerHTML = '<option value="">— Add exercise —</option>';
  exercises.forEach(e => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.name + (e.muscle_group ? ` (${e.muscle_group})` : '');
    sel.appendChild(o);
  });

  document.getElementById('create-template-modal').classList.add('open');
}

function addTplExercise() {
  const sel = document.getElementById('new-tpl-ex-select');
  const id  = parseInt(sel.value);
  const errEl = document.getElementById('new-tpl-error');
  if (!id) return;
  if (tplExercises.find(e => e.exercise_id === id)) {
    errEl.textContent = 'Already added.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  tplExercises.push({ exercise_id: id, name: sel.options[sel.selectedIndex].text });
  renderTplExercises();
  sel.value = '';
}

function removeTplExercise(id) {
  tplExercises = tplExercises.filter(e => e.exercise_id !== id);
  renderTplExercises();
}

function renderTplExercises() {
  const c = document.getElementById('new-tpl-exercises');
  if (!tplExercises.length) { c.innerHTML = ''; return; }
  c.innerHTML = tplExercises.map((e, i) => `
    <div class="set-row" style="align-items:flex-start">
      <div class="set-badge" style="margin-top:4px">${i + 1}</div>
      <div class="set-info">
        <div class="set-main" style="font-size:14px;margin-bottom:6px">${e.name}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px">SETS</div>
            <input type="number" placeholder="—" min="1" value="${e.target_sets || ''}"
              class="form-input text-center" style="width:56px;padding:6px 4px;font-size:13px"
              oninput="tplExercises[${i}].target_sets=parseInt(this.value)||null">
          </div>
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px">REPS</div>
            <input type="number" placeholder="—" min="1" value="${e.target_reps || ''}"
              class="form-input text-center" style="width:56px;padding:6px 4px;font-size:13px"
              oninput="tplExercises[${i}].target_reps=parseInt(this.value)||null">
          </div>
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px">KG</div>
            <input type="number" placeholder="—" step="0.5" value="${e.target_weight_kg || ''}"
              class="form-input text-center" style="width:70px;padding:6px 4px;font-size:13px"
              oninput="tplExercises[${i}].target_weight_kg=parseFloat(this.value)||null">
          </div>
        </div>
      </div>
      <button class="btn-danger btn-icon" onclick="removeTplExercise(${e.exercise_id})" style="margin-top:4px">✕</button>
    </div>`).join('');
}

async function createTemplate() {
  const name  = document.getElementById('new-tpl-name').value.trim();
  const errEl = document.getElementById('new-tpl-error');
  if (!name) { errEl.textContent = 'Name required'; errEl.style.display = 'block'; return; }

  const res = await fetch('/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      notes:     document.getElementById('new-tpl-notes').value.trim(),
      exercises: tplExercises,
      cardio:    []
    })
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed'; errEl.style.display = 'block'; return; }
  closeModalById('create-template-modal');
  loadTemplates();
  toast('Template created! 📋');
}

// ── Inline custom exercise creation inside template modal ─────────────────────
function toggleTplNewEx() {
  const form = document.getElementById('tpl-new-ex-form');
  const isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'block' : 'none';
  if (isHidden) document.getElementById('tpl-ex-name').focus();
}

async function createAndAddTplExercise() {
  const name   = document.getElementById('tpl-ex-name').value.trim();
  const errEl  = document.getElementById('tpl-ex-error');
  if (!name) { errEl.textContent = 'Name required'; errEl.style.display = 'block'; return; }

  // Create the exercise via existing API
  const res  = await fetch('/api/exercises', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      muscle_group: document.getElementById('tpl-ex-muscle').value.trim(),
      equipment:    document.getElementById('tpl-ex-equip').value.trim()
    })
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed'; errEl.style.display = 'block'; return; }

  // Refresh global exercises list so it appears everywhere
  await loadExercises();

  // Add to template exercise list immediately
  if (tplExercises.find(e => e.exercise_id === data.id)) {
    errEl.textContent = 'Already added to this template.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  tplExercises.push({ exercise_id: data.id, name });
  renderTplExercises();

  // Also refresh the dropdown so it shows the new exercise
  const sel = document.getElementById('new-tpl-ex-select');
  const opt = document.createElement('option');
  opt.value = data.id; opt.textContent = name;
  sel.appendChild(opt);

  // Clear & collapse the inline form
  ['tpl-ex-name','tpl-ex-muscle','tpl-ex-equip'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tpl-new-ex-form').style.display = 'none';

  toast(`"${name}" created and added! ✓`);
}
