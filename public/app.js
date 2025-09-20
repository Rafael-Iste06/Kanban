// app.js
// Kanban client: load/save whole state to /api/state
const API = '/api/state';
let state = { boards: [], ui: { openBoardId: null }, meta: {} };
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 800; // ms

// DOM refs
const boardsListEl = document.getElementById('boards-list');
const boardTitleEl = document.getElementById('board-title');
const columnsContainer = document.getElementById('columns-container');
const newBoardBtn = document.getElementById('new-board-btn');
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file');
const searchInput = document.getElementById('search-input');
const saveStatus = document.getElementById('save-status');
const filterLabels = document.getElementById('filter-labels');

// modal elements
const modal = document.getElementById('task-modal');
const closeModalBtn = document.getElementById('close-modal');
const taskTitleInput = document.getElementById('task-title');
const taskDescInput = document.getElementById('task-desc');
const taskDueInput = document.getElementById('task-due');
const taskLabelsInput = document.getElementById('task-labels');
const commentsEl = document.getElementById('comments');
const commentAddInput = document.getElementById('comment-add');
const addCommentBtn = document.getElementById('add-comment');
const saveTaskBtn = document.getElementById('save-task');
const deleteTaskBtn = document.getElementById('delete-task');
const advanceTaskBtn = document.getElementById('advance-task-btn'); // remplace archiveTaskBtn


let currentEditing = { boardId: null, colId: null, taskId: null };

// helpers
const uid = (p='id') => `${p}-${Math.random().toString(36).slice(2,9)}`;

// ---------------- FETCH / SAVE ----------------
async function fetchState() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Fetch failed');
    state = await res.json();
    if (!state.ui) state.ui = {};
    if (!state.ui.openBoardId && state.boards && state.boards[0]) {
      state.ui.openBoardId = state.boards[0].id;
    }
    renderAll();
  } catch (err) {
    console.warn('Fetch échoué, fallback localStorage', err);
    const local = localStorage.getItem('kanban_state');
    state = local ? JSON.parse(local) : { boards: [], ui: {} };
    renderAll();
  }
}

function scheduleSave() {
  saveStatus.textContent = 'Waiting for save...';
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveState(), AUTO_SAVE_DELAY);
}

async function saveState() {
  try {
    localStorage.setItem('kanban_state', JSON.stringify(state));
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error('Save failed');
    saveStatus.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.warn('Save failed', err);
    saveStatus.textContent = 'Save failed (offline)';
  }
}

// ---------------- RENDER ----------------
function renderAll() {
  renderBoardsList();
  renderBoard(state.ui.openBoardId);
  populateFilterLabels();
}

function renderBoardsList() {
  boardsListEl.innerHTML = '';
  (state.boards || []).forEach(b => {
    const el = document.createElement('div');
    el.className = 'board-item' + (state.ui.openBoardId === b.id ? ' active' : '');
    el.innerHTML = `<span>${b.title}</span>
      <div>
        <button data-id="${b.id}" class="rename-board-btn">✎</button>
        <button data-id="${b.id}" class="del-board-btn">🗑</button>
      </div>`;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('rename-board-btn') || e.target.classList.contains('del-board-btn')) return;
      state.ui.openBoardId = b.id;
      renderAll();
    });
    boardsListEl.appendChild(el);

    el.querySelector('.rename-board-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      const newTitle = prompt('Rename the board', b.title);
      if (newTitle) { b.title = newTitle; scheduleSave(); renderAll(); }
    });
    el.querySelector('.del-board-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm('Delete this board ?')) return;
      state.boards = state.boards.filter(x => x.id !== b.id);
      state.ui.openBoardId = state.boards[0]?.id || null;
      scheduleSave(); renderAll();
    });
  });
}

function renderBoard(boardId) {
  const board = (state.boards || []).find(b => b.id === boardId);
  if (!board) {
    boardTitleEl.textContent = 'No board';
    columnsContainer.innerHTML = '';
    return;
  }

  boardTitleEl.textContent = board.title;
  columnsContainer.innerHTML = '';

  board.columns.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.colId = col.id;
    colEl.innerHTML = `
      <h3>${col.title}</h3>
      <button class="add-task">＋ Add Task</button>
      <div class="tasks" data-col="${col.id}"></div>
    `;

    const tasksEl = colEl.querySelector('.tasks');

    // bouton "Add Task"
    colEl.querySelector('.add-task').addEventListener('click', () => {
      const t = { 
        id: uid('t'), 
        title: 'New Task', 
        description: '', 
        labels: [], 
        dueDate: null, 
        comments: [] 
      };
      col.tasks.unshift(t);
      scheduleSave(); renderAll();
      openTaskModal(board.id, col.id, t.id);
    });

    // créer la ligne d’insertion
    let insertLine = document.createElement('div');
    insertLine.className = 'insert-line';
    insertLine.style.display = 'none';
    tasksEl.appendChild(insertLine);

    // affichage des tâches
    col.tasks.forEach(task => {
      if (task.archived) return;
      const tEl = document.createElement('div');
      tEl.className = 'task';
      tEl.draggable = true;
      tEl.dataset.taskId = task.id;
      tEl.innerHTML = `<strong>${task.title}</strong>
        <div class="meta">${(task.labels || []).join(', ')} ${task.dueDate ? '• ' + task.dueDate : ''}</div>`;
      tEl.addEventListener('click', () => openTaskModal(board.id, col.id, task.id));

      // dragstart
      tEl.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', task.id);
        colEl.dataset.dragging = 'true';
      });

      tEl.addEventListener('dragend', () => {
        colEl.dataset.dragging = 'false';
        insertLine.style.display = 'none';
      });

      // dragover pour positionner la ligne d’insertion
      tEl.addEventListener('dragover', ev => {
        ev.preventDefault();
        if (colEl.dataset.dragging !== 'true') return;
        insertLine.style.display = 'block';
        const rect = tEl.getBoundingClientRect();
        if ((ev.clientY - rect.top) < rect.height / 2) {
          tasksEl.insertBefore(insertLine, tEl); // avant la tâche
        } else {
          tasksEl.insertBefore(insertLine, tEl.nextSibling); // après la tâche
        }
      });

      tasksEl.appendChild(tEl);
    });


tasksEl.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  const draggedTaskId = ev.dataTransfer.getData('text/plain');
  const draggedTaskCol = col.tasks.find(t => t.id === draggedTaskId);
  if (draggedTaskCol) {
    ev.dataTransfer.dropEffect = 'move'; // same column → move
  } else {
    ev.dataTransfer.dropEffect = 'none'; // other column → forbidden
  }
});


    // dragover sur la zone vide
    tasksEl.addEventListener('dragover', ev => {
      ev.preventDefault();
      if (col.tasks.length === 0) {
        insertLine.style.display = 'block';
      }
    });

    tasksEl.addEventListener('drop', ev => {
      ev.preventDefault();
      const draggedTaskId = ev.dataTransfer.getData('text/plain');
      if (!draggedTaskId) return;

      const draggedIndex = col.tasks.findIndex(t => t.id === draggedTaskId);
      if (draggedIndex === -1) return;
      const draggedTask = col.tasks.splice(draggedIndex, 1)[0];

      // déterminer l’index où insérer
      let targetIndex;
      if (!insertLine.nextSibling) {
        targetIndex = col.tasks.length; // fin
      } else {
        const nextTaskEl = insertLine.nextSibling.closest('.task');
        targetIndex = col.tasks.findIndex(t => t.id === nextTaskEl.dataset.taskId);
      }

      col.tasks.splice(targetIndex, 0, draggedTask);
      insertLine.style.display = 'none';
      scheduleSave();
      renderAll();
    });

    columnsContainer.appendChild(colEl);
  });
}






// ---------------- MODAL ----------------
function openTaskModal(boardId, colId, taskId) {
  const b = state.boards.find(x=>x.id===boardId);
  const c = b.columns.find(x=>x.id===colId);
  const t = c.tasks.find(x=>x.id===taskId);
  currentEditing = { boardId, colId, taskId };
  modal.classList.remove('hidden');
  taskTitleInput.value = t.title || '';
  taskDescInput.value = t.description || '';
  taskDueInput.value = t.dueDate || '';
  taskLabelsInput.value = (t.labels || []).join(', ');
  renderComments(t);
  // montrer/cacher le bouton avancer
  if (c.title === "DONE") {
    advanceTaskBtn.style.display = "none";
  } else {
    advanceTaskBtn.style.display = "inline-block";
    advanceTaskBtn.textContent = `Move to ${getNextColName(c.title)}`;
  }
}

function getNextColName(current) {
  const order = ["TODO","WIP","ON CHECK","DONE"];
  const idx = order.indexOf(current);
  return order[idx+1] || "";
}
function closeModal() { modal.classList.add('hidden'); currentEditing = { boardId:null, colId:null, taskId:null }; }
closeModalBtn.addEventListener('click', closeModal);

function renderComments(task) {
  commentsEl.innerHTML = '';
  (task.comments || []).forEach(c => {
    const li = document.createElement('li');

    const spanText = document.createElement('span');
    spanText.className = 'comment-text';
    spanText.textContent = c.text;

    const spanTime = document.createElement('span');
    spanTime.className = 'comment-time';
    spanTime.textContent = new Date(c.when).toLocaleString();

    li.appendChild(spanText);
    li.appendChild(spanTime);

    commentsEl.appendChild(li);
  });

  // scroll vers le bas
  commentsEl.scrollTop = commentsEl.scrollHeight;
}


// Ajout d'un écouteur sur l'input pour Enter
commentAddInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // empêche le saut de ligne
    addCommentBtn.click(); // déclenche l'ajout
  }
});


// modal buttons
addCommentBtn.addEventListener('click', ()=>{
  const t = getCurrentTask(); if (!t) return;
  const txt = commentAddInput.value.trim(); if (!txt) return;
  t.comments.push({ text: txt, when: new Date().toISOString()});
  commentAddInput.value='';
  commentAddInput.focus();   // ✅ remet le focus automatiquement
  renderComments(t); 
  scheduleSave();
});
saveTaskBtn.addEventListener('click', ()=>{
  const t = getCurrentTask(); if (!t) return;
  t.title = taskTitleInput.value.trim() || t.title;
  t.description = taskDescInput.value;
  t.dueDate = taskDueInput.value || null;
  t.labels = taskLabelsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
  scheduleSave(); closeModal(); renderAll();
});
deleteTaskBtn.addEventListener('click', ()=>{
  if (!confirm('Delete the task ?')) return;
  const { boardId, colId, taskId } = currentEditing;
  const b = state.boards.find(x=>x.id===boardId);
  const c = b.columns.find(x=>x.id===colId);
  c.tasks = c.tasks.filter(t=>t.id!==taskId);
  scheduleSave(); closeModal(); renderAll();
});
advanceTaskBtn.addEventListener('click', ()=>{
  const { boardId, colId, taskId } = currentEditing;
  const b = state.boards.find(x=>x.id===boardId);
  const c = b.columns.find(x=>x.id===colId);
  const task = c.tasks.find(t=>t.id===taskId);

  const order = ["TODO","WIP","ON CHECK","DONE"];
  const currentIndex = order.indexOf(c.title);
  if (currentIndex === -1 || currentIndex === order.length-1) return; // déjà DONE

  const nextColTitle = order[currentIndex+1];
  const nextCol = b.columns.find(col => col.title === nextColTitle);
  if (!nextCol) return;
  c.tasks = c.tasks.filter(t=>t.id!==taskId);
  nextCol.tasks.unshift(task);
  scheduleSave(); closeModal(); renderAll();
});

function getCurrentTask() {
  const { boardId, colId, taskId } = currentEditing;
  if (!boardId || !colId || !taskId) return null;
  const b = state.boards.find(x=>x.id===boardId);
  const c = b.columns.find(x=>x.id===colId);
  return c.tasks.find(t=>t.id===taskId);
}

// ---------------- CONTROLS ----------------
newBoardBtn.addEventListener('click', ()=>{
  const title = prompt('Title of the new board');
  if (!title) return;
  const defaultCols = [
    { id: uid('col'), title: 'TODO', tasks: [] },
    { id: uid('col'), title: 'WIP', tasks: [] },
    { id: uid('col'), title: 'ON CHECK', tasks: [] },
    { id: uid('col'), title: 'DONE', tasks: [] },
  ];
  const b = { id: uid('board'), title, columns: defaultCols };
  state.boards.push(b);
  state.ui.openBoardId = b.id;
  scheduleSave(); renderAll();
});

saveBtn.addEventListener('click', ()=> saveState());

exportBtn.addEventListener('click', ()=> {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'kanban-export.json'; a.click(); URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', ()=> importFileInput.click());
importFileInput.addEventListener('change', (e)=>{
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (obj && obj.boards) {
        if (confirm('Import replace the current state. Continue ?')) {
          state = obj; scheduleSave(); renderAll();
        }
      } else alert('Invalid JSON file');
    } catch (err) { alert('Unable to read'); }
  };
  reader.readAsText(f);
});

searchInput.addEventListener('input', (e)=> {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderAll(); return; }
  renderSearch(q);
});
function renderSearch(q) {
  const board = state.boards.find(b => b.id === state.ui.openBoardId);
  if (!board) return;
  boardTitleEl.textContent = `${board.title} • Search: "${q}"`;
  columnsContainer.innerHTML = '';
  board.columns.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.innerHTML = `<h3>${col.title}</h3><div class="tasks"></div>`;
    const tasksEl = colEl.querySelector('.tasks');
    col.tasks.forEach(task => {
      const str = `${task.title} ${task.description || ''} ${(task.labels||[]).join(' ')}`.toLowerCase();
      if (str.includes(q)) {
        const tEl = document.createElement('div'); tEl.className='task'; tEl.textContent = task.title;
        tEl.addEventListener('click', ()=> openTaskModal(state.ui.openBoardId, col.id, task.id));
        tasksEl.appendChild(tEl);
      }
    });
    columnsContainer.appendChild(colEl);
  });
}

// label filter
function populateFilterLabels() {
  const labels = new Set();
  state.boards.forEach(b => b.columns.forEach(c => c.tasks.forEach(t => (t.labels||[]).forEach(l=>labels.add(l)))));
  filterLabels.innerHTML = '<option value="">Filter label</option>';
  Array.from(labels).forEach(l => {
    const o = document.createElement('option'); o.value = l; o.textContent = l; filterLabels.appendChild(o);
  });
}
filterLabels.addEventListener('change', ()=> {
  const label = filterLabels.value;
  if (!label) return renderAll();
  const board = state.boards.find(b => b.id === state.ui.openBoardId);
  if (!board) return;
  columnsContainer.innerHTML = '';
  board.columns.forEach(col => {
    const colEl = document.createElement('div'); colEl.className='column';
    colEl.innerHTML = `<h3>${col.title}</h3><div class="tasks"></div>`;
    const tasksEl = colEl.querySelector('.tasks');
    col.tasks.forEach(task => { if ((task.labels||[]).includes(label)) {
      const tEl = document.createElement('div'); tEl.className='task'; tEl.textContent = task.title;
      tEl.addEventListener('click', ()=> openTaskModal(board.id, col.id, task.id));
      tasksEl.appendChild(tEl);
    }});
    columnsContainer.appendChild(colEl);
  });
});

// init
document.addEventListener('DOMContentLoaded', ()=> {
  fetchState();
  window.addEventListener('keydown', (e)=> {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); saveState(); }
  });
});
