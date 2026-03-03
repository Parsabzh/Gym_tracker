/* IronLog — Templates */

let tplExercises = []; // exercises staged for new template creation

// ── Load & render template list ───────────────────────────────────────────────
async function loadTemplates() {
  const list = await fetch('/api/templates').then(r=>r.json());
  const c = document.getElementById('template-list');
  if (!list.length) {
    c.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-text">No templates yet.<br>Finish a session and tap <strong>"Save as Template"</strong>,<br>or create one from scratch.</div>
    </div>`;
    return;
  }
  c.innerHTML = list.map(t => `
    <div class="template-card" onclick="openTemplate(${t.id})">
      <div class="tpl-name">${t.name}</div>
      <div class="tpl-meta">
        ${t.exercise_count ? `<span class="chip chip-green">${t.exercise_count} exercise${t.exercise_count>1?'s':''}</span>` : ''}
        ${t.cardio_count   ? `<span class="chip chip-cardio">${t.cardio_count} cardio</span>` : ''}
      </div>
      ${t.notes ? `<div class="tpl-notes">${t.notes}</div>` : ''}
    </div>`).join('');
}

// ── Open template detail modal ────────────────────────────────────────────────
async function openTemplate(id) {
  const t = await fetch(`/api/templates/${id}`).then(r=>r.json());
  document.getElementById('tpl-modal-title').textContent = t.name;

  const CARDIO_ICONS = {running:'🏃',walking:'🚶',cycling:'🚴',rowing:'🚣',swimming:'🏊',other:'⚡'};
  let html = '';
  if (t.notes) html += `<p style="color:var(--muted);font-size:13px;margin-bottom:14px">${t.notes}</p>`;

  if (t.exercises.length) {
    html += '<div class="card-title" style="margin-bottom:10px">🏋️ Exercises</div>';
    t.exercises.forEach((e,i) => {
      const targets = [
        e.target_sets   ? `${e.target_sets} sets`       : null,
        e.target_reps   ? `${e.target_reps} reps`       : null,
        e.target_weight_kg ? `@ ${e.target_weight_kg}kg` : null,
      ].filter(Boolean).join(' · ');
      html += `<div class="set-row">
        <div class="set-badge">${i+1}</div>
        <div class="set-info">
          <div class="set-main">${e.exercise_name}</div>
          ${e.muscle_group ? `<div class="set-sub">${e.muscle_group}${targets?' · '+targets:''}</div>` : (targets?`<div class="set-sub">${targets}</div>`:'')}
        </div>
      </div>`;
    });
  }

  if (t.cardio.length) {
    html += '<div class="card-title" style="margin-top:14px;margin-bottom:10px">🏃 Cardio</div>';
    t.cardio.forEach(c => {
      const info = [
        c.target_distance_km  ? `${c.target_distance_km}km` : null,
        c.target_duration_min ? `${c.target_duration_min}min` : null,
      ].filter(Boolean).join(' · ');
      html += `<div class="set-row">
        <div class="set-badge" style="font-size:16px">${CARDIO_ICONS[c.activity_type]||'⚡'}</div>
        <div class="set-info">
          <div class="set-main" style="text-transform:capitalize">${c.activity_type}</div>
          ${info?`<div class="set-sub">${info}</div>`:''}
        </div>
      </div>`;
    });
  }

  html += `
    <div style="margin-top:20px;display:flex;gap:8px">
      <button class="btn-primary" style="flex:1" onclick="startFromTemplate(${id})">▶ Start Session</button>
      <button class="btn-danger"  style="padding:10px 16px" onclick="deleteTemplate(${id})">🗑</button>
    </div>`;

  document.getElementById('tpl-modal-body').innerHTML = html;
  document.getElementById('template-modal').classList.add('open');
}

// ── Start session from template ───────────────────────────────────────────────
async function startFromTemplate(tid) {
  closeModalById('template-modal');
  // Switch to session tab and start a session
  switchTab('session');

  // Start a blank session
  const res = await fetch('/api/sessions', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ date: new Date().toISOString().split('T')[0], notes: '' })
  });
  const data = await res.json();
  activeSessionId = data.id;
  localStorage.setItem(storageKey(), activeSessionId);
  updateActiveUI();

  // Pre-populate the exercise dropdown with first exercise from template
  const t = await fetch(`/api/templates/${tid}`).then(r=>r.json());
  if (t.exercises.length) {
    const sel = document.getElementById('exercise-select');
    sel.value = t.exercises[0].exercise_id;
  }

  toast(`Session started from "${t.name}" 💪`);
}

// ── Delete template ───────────────────────────────────────────────────────────
async function deleteTemplate(id) {
  await fetch(`/api/templates/${id}`, {method:'DELETE'});
  closeModalById('template-modal');
  loadTemplates();
  toast('Template deleted.');
}

// ── Create template from scratch modal ───────────────────────────────────────
function openCreateTemplateModal() {
  tplExercises = [];
  document.getElementById('new-tpl-name').value  = '';
  document.getElementById('new-tpl-notes').value = '';
  document.getElementById('new-tpl-exercises').innerHTML = '';
  document.getElementById('new-tpl-error').style.display = 'none';

  // Populate exercise select
  const sel = document.getElementById('new-tpl-ex-select');
  sel.innerHTML = '<option value="">— Add exercise —</option>';
  exercises.forEach(e => {
    const o = document.createElement('option');
    o.value = e.id; o.textContent = e.name + (e.muscle_group?` (${e.muscle_group})`:'');
    sel.appendChild(o);
  });

  document.getElementById('create-template-modal').classList.add('open');
}

function addTplExercise() {
  const sel = document.getElementById('new-tpl-ex-select');
  const id  = parseInt(sel.value);
  if (!id) return;
  if (tplExercises.find(e=>e.exercise_id===id)) {
    document.getElementById('new-tpl-error').textContent='Already added.';
    document.getElementById('new-tpl-error').style.display='block';
    return;
  }
  document.getElementById('new-tpl-error').style.display='none';
  const name = sel.options[sel.selectedIndex].text;
  tplExercises.push({ exercise_id: id, name });
  renderTplExercises();
  sel.value = '';
}

function removeTplExercise(id) {
  tplExercises = tplExercises.filter(e=>e.exercise_id!==id);
  renderTplExercises();
}

function renderTplExercises() {
  const c = document.getElementById('new-tpl-exercises');
  if (!tplExercises.length) { c.innerHTML=''; return; }
  c.innerHTML = tplExercises.map((e,i) => `
    <div class="set-row">
      <div class="set-badge">${i+1}</div>
      <div class="set-info">
        <div class="set-main" style="font-size:14px">${e.name}</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <input type="number" placeholder="sets" min="1"
            class="form-input text-center" style="width:60px;padding:4px 6px;font-size:12px"
            onchange="tplExercises[${i}].target_sets=parseInt(this.value)||null">
          <input type="number" placeholder="reps" min="1"
            class="form-input text-center" style="width:60px;padding:4px 6px;font-size:12px"
            onchange="tplExercises[${i}].target_reps=parseInt(this.value)||null">
          <input type="number" placeholder="kg" step="0.5"
            class="form-input text-center" style="width:70px;padding:4px 6px;font-size:12px"
            onchange="tplExercises[${i}].target_weight_kg=parseFloat(this.value)||null">
        </div>
      </div>
      <button class="btn-danger" onclick="removeTplExercise(${e.exercise_id})">✕</button>
    </div>`).join('');
}

async function createTemplate() {
  const name = document.getElementById('new-tpl-name').value.trim();
  const errEl = document.getElementById('new-tpl-error');
  if (!name) { errEl.textContent='Name required'; errEl.style.display='block'; return; }

  const res = await fetch('/api/templates', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      name, notes: document.getElementById('new-tpl-notes').value.trim(),
      exercises: tplExercises, cardio: []
    })
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent=data.error||'Failed'; errEl.style.display='block'; return; }
  closeModalById('create-template-modal');
  loadTemplates();
  toast('Template created! 📋');
}
