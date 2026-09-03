const TAB_COLORS = ['--tab-1', '--tab-2', '--tab-3', '--tab-4', '--tab-5', '--tab-6'];
const STORAGE_KEY = 'promptLedgerData';
const ALL_FOLDER_ID = '__all__';
const OVERLAY_IDS = ['promptModalOverlay', 'folderModalOverlay', 'confirmOverlay'];
const CLOSE_ANIM_MS = 150;

let state = {
  folders: [],
  prompts: [],
  activeFolderId: ALL_FOLDER_ID,
  searchQuery: '',
  editingPromptId: null,
  activeOverlayId: null,
  _confirmHandler: null
};

// ---------- Storage ----------
function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res[STORAGE_KEY] || { folders: [], prompts: [] });
    });
  });
}

function saveData() {
  chrome.storage.local.set({ [STORAGE_KEY]: { folders: state.folders, prompts: state.prompts } }, () => {
    if (chrome.runtime.lastError) {
      showToast('Save failed — storage limit reached');
    }
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function folderById(id) {
  return state.folders.find(f => f.id === id);
}

function folderColorVar(folderId) {
  const idx = state.folders.findIndex(f => f.id === folderId);
  const colorVar = TAB_COLORS[(idx < 0 ? 0 : idx) % TAB_COLORS.length];
  return `var(${colorVar})`;
}

// ---------- Rendering ----------
function render() {
  renderFolderRail();
  renderPromptList();
  renderBrandSub();
  renderFolderSelectOptions();
}

function renderBrandSub() {
  const sub = document.getElementById('brandSub');
  const count = state.prompts.length;
  sub.textContent = `${count} prompt${count === 1 ? '' : 's'} \u00b7 ${state.folders.length} client${state.folders.length === 1 ? '' : 's'}`;
}

function renderFolderRail() {
  const rail = document.getElementById('folderRail');
  rail.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.className = 'folder-chip' + (state.activeFolderId === ALL_FOLDER_ID ? ' active' : '');
  allChip.textContent = 'All';
  allChip.addEventListener('click', () => { state.activeFolderId = ALL_FOLDER_ID; render(); });
  rail.appendChild(allChip);

  state.folders.forEach((f, i) => {
    const colorVar = `var(${TAB_COLORS[i % TAB_COLORS.length]})`;
    const chip = document.createElement('button');
    chip.className = 'folder-chip' + (state.activeFolderId === f.id ? ' active' : '');
    chip.innerHTML = `<span class="dot" style="background:${colorVar}"></span>${escapeHtml(f.name)}`;
    chip.addEventListener('click', () => { state.activeFolderId = f.id; render(); });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openConfirm({
        title: `Delete "${f.name}"?`,
        body: 'Prompts saved in this folder will be deleted too. This can\u2019t be undone.',
        onConfirm: () => deleteFolder(f.id)
      });
    });
    rail.appendChild(chip);
  });

  const addChip = document.createElement('button');
  addChip.className = 'folder-chip folder-chip--add';
  addChip.innerHTML = '<svg width="11" height="11"><use href="#i-plus"/></svg> Client';
  addChip.title = 'New client folder';
  addChip.addEventListener('click', openFolderModal);
  rail.appendChild(addChip);
}

function filteredPrompts() {
  let list = state.prompts;
  if (state.activeFolderId !== ALL_FOLDER_ID) {
    list = list.filter(p => p.folderId === state.activeFolderId);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(p => p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
  }
  return list.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

function renderPromptList() {
  const listEl = document.getElementById('promptList');
  const emptyEl = document.getElementById('emptyState');
  const items = filteredPrompts();

  listEl.innerHTML = '';

  if (state.folders.length === 0 && state.prompts.length === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.querySelector('.empty-state__title').textContent = 'Nothing here yet';
    emptyEl.querySelector('.empty-state__body').textContent = 'Add a client folder, then save your first prompt into it.';
    return;
  }

  if (items.length === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.querySelector('.empty-state__title').textContent = state.searchQuery ? 'No matches' : 'No prompts yet';
    emptyEl.querySelector('.empty-state__body').textContent = state.searchQuery
      ? 'Try a different search term.'
      : 'Tap "New prompt" below to save one here.';
    return;
  }

  listEl.hidden = false;
  emptyEl.hidden = true;

  items.forEach((p, i) => {
    const folder = folderById(p.folderId);
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.style.animationDelay = `${Math.min(i, 6) * 40}ms`;
    card.innerHTML = `
      <div class="prompt-card__tab" style="--tab-color:${folder ? folderColorVar(folder.id) : 'var(--line-strong)'}"></div>
      <div class="prompt-card__body">
        <div class="prompt-card__head">
          <h3>${escapeHtml(p.title)}</h3>
          <span class="prompt-card__folder">${folder ? escapeHtml(folder.name) : 'Unsorted'}</span>
        </div>
        <p class="prompt-card__preview">${escapeHtml(p.text)}</p>
        <div class="prompt-card__actions">
          <button data-action="copy" title="Copy"><svg width="14" height="14"><use href="#i-copy"/></svg></button>
          <button data-action="download" title="Download .txt"><svg width="14" height="14"><use href="#i-download"/></svg></button>
          <button data-action="share" title="Copy as shareable text"><svg width="14" height="14"><use href="#i-share"/></svg></button>
          <button data-action="edit" title="Edit"><svg width="14" height="14"><use href="#i-edit"/></svg></button>
          <button data-action="delete" class="danger" title="Delete"><svg width="14" height="14"><use href="#i-trash"/></svg></button>
        </div>
      </div>
    `;
    card.querySelector('[data-action="copy"]').addEventListener('click', () => copyPrompt(p));
    card.querySelector('[data-action="download"]').addEventListener('click', () => downloadPrompt(p));
    card.querySelector('[data-action="share"]').addEventListener('click', () => sharePrompt(p));
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openPromptModal(p));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      openConfirm({
        title: `Delete "${p.title}"?`,
        body: 'This can\u2019t be undone.',
        onConfirm: () => deletePrompt(p.id)
      });
    });
    listEl.appendChild(card);
  });
}

function renderFolderSelectOptions() {
  const select = document.getElementById('promptFolderSelect');
  select.innerHTML = '';
  if (state.folders.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Add a client folder first';
    opt.value = '';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  state.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Toast ----------
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1600);
}

// ---------- Copy / download / share / export / import ----------
function copyPrompt(p) {
  navigator.clipboard.writeText(p.text).then(() => showToast('Copied to clipboard'));
}

function sharePrompt(p) {
  const folder = folderById(p.folderId);
  const block = `${p.title}${folder ? ' \u2014 ' + folder.name : ''}\n\n${p.text}`;
  navigator.clipboard.writeText(block).then(() => showToast('Share text copied'));
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeFileName(name) {
  return name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'prompt';
}

function downloadPrompt(p) {
  downloadBlob(`${safeFileName(p.title)}.txt`, p.text, 'text/plain');
  showToast('Downloaded');
}

function exportAll() {
  const payload = { exportedAt: new Date().toISOString(), folders: state.folders, prompts: state.prompts };
  downloadBlob('prompt-ledger-export.json', JSON.stringify(payload, null, 2), 'application/json');
  showToast('Exported all prompts');
}

function importFromJson(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    showToast('Import failed: invalid file');
    return;
  }
  const incomingFolders = Array.isArray(payload.folders) ? payload.folders : [];
  const incomingPrompts = Array.isArray(payload.prompts) ? payload.prompts : [];

  const folderIdMap = {};
  incomingFolders.forEach(f => {
    const existing = state.folders.find(sf => sf.name.toLowerCase() === (f.name || '').toLowerCase());
    if (existing) {
      folderIdMap[f.id] = existing.id;
    } else {
      const newId = uid();
      folderIdMap[f.id] = newId;
      state.folders.push({ id: newId, name: f.name || 'Imported', createdAt: Date.now() });
    }
  });

  let importedCount = 0;
  incomingPrompts.forEach(p => {
    state.prompts.push({
      id: uid(),
      folderId: folderIdMap[p.folderId] || null,
      title: p.title || 'Untitled prompt',
      text: p.text || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    importedCount++;
  });

  saveData();
  render();
  showToast(`Imported ${importedCount} prompt${importedCount === 1 ? '' : 's'}`);
}

// ---------- CRUD ----------
function deletePrompt(id) {
  state.prompts = state.prompts.filter(p => p.id !== id);
  saveData();
  render();
}

function deleteFolder(id) {
  state.prompts = state.prompts.filter(p => p.folderId !== id);
  state.folders = state.folders.filter(f => f.id !== id);
  if (state.activeFolderId === id) state.activeFolderId = ALL_FOLDER_ID;
  saveData();
  render();
}

// ---------- Modal manager (single source of truth — fixes the stacked-modal bug) ----------
function openOverlay(id) {
  OVERLAY_IDS.forEach(oid => {
    const el = document.getElementById(oid);
    el.classList.remove('closing');
    el.hidden = (oid !== id);
  });
  state.activeOverlayId = id;
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el.hidden) return;
  el.classList.add('closing');
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove('closing');
  }, CLOSE_ANIM_MS);
  if (state.activeOverlayId === id) state.activeOverlayId = null;
}

function closeActiveOverlay() {
  if (state.activeOverlayId) closeOverlay(state.activeOverlayId);
}

// ---------- Prompt modal ----------
function openPromptModal(existing) {
  state.editingPromptId = existing ? existing.id : null;
  document.getElementById('promptModalTitle').textContent = existing ? 'Edit prompt' : 'New prompt';
  document.getElementById('promptTitleInput').value = existing ? existing.title : '';
  document.getElementById('promptTextInput').value = existing ? existing.text : '';
  renderFolderSelectOptions();
  const select = document.getElementById('promptFolderSelect');
  if (existing) {
    select.value = existing.folderId;
  } else if (state.activeFolderId !== ALL_FOLDER_ID) {
    select.value = state.activeFolderId;
  }
  openOverlay('promptModalOverlay');
  document.getElementById('promptTitleInput').focus();
}

function savePromptFromModal() {
  const title = document.getElementById('promptTitleInput').value.trim();
  const text = document.getElementById('promptTextInput').value.trim();
  const folderId = document.getElementById('promptFolderSelect').value;

  if (!title || !text) { showToast('Add a title and prompt text'); return; }
  if (!folderId) { showToast('Choose or create a client folder'); return; }

  if (state.editingPromptId) {
    const p = state.prompts.find(x => x.id === state.editingPromptId);
    p.title = title; p.text = text; p.folderId = folderId; p.updatedAt = Date.now();
  } else {
    state.prompts.push({ id: uid(), folderId, title, text, createdAt: Date.now(), updatedAt: Date.now() });
  }

  saveData();
  closeOverlay('promptModalOverlay');
  render();
}

// ---------- Folder modal ----------
function openFolderModal() {
  document.getElementById('folderNameInput').value = '';
  openOverlay('folderModalOverlay');
  document.getElementById('folderNameInput').focus();
}

function saveFolderFromModal() {
  const name = document.getElementById('folderNameInput').value.trim();
  if (!name) { showToast('Enter a client name'); return; }
  const newFolder = { id: uid(), name, createdAt: Date.now() };
  state.folders.push(newFolder);
  state.activeFolderId = newFolder.id;
  saveData();
  closeOverlay('folderModalOverlay');
  render();
}

// ---------- Confirm modal ----------
function openConfirm({ title, body, onConfirm }) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').textContent = body;
  document.getElementById('confirmOkBtn').disabled = false;
  state._confirmHandler = onConfirm;
  openOverlay('confirmOverlay');
}

// ---------- Wire up ----------
function init() {
  loadData().then(data => {
    state.folders = data.folders || [];
    state.prompts = data.prompts || [];
    render();
  });

  document.getElementById('closePanelBtn').addEventListener('click', () => {
    window.close();
  });

  document.getElementById('addPromptBtn').addEventListener('click', () => openPromptModal(null));
  document.getElementById('cancelPromptBtn').addEventListener('click', () => closeOverlay('promptModalOverlay'));
  document.getElementById('closePromptModalBtn').addEventListener('click', () => closeOverlay('promptModalOverlay'));
  document.getElementById('savePromptBtn').addEventListener('click', savePromptFromModal);

  document.getElementById('cancelFolderBtn').addEventListener('click', () => closeOverlay('folderModalOverlay'));
  document.getElementById('closeFolderModalBtn').addEventListener('click', () => closeOverlay('folderModalOverlay'));
  document.getElementById('saveFolderBtn').addEventListener('click', saveFolderFromModal);
  document.getElementById('folderNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveFolderFromModal();
  });

  document.getElementById('confirmCancelBtn').addEventListener('click', () => closeOverlay('confirmOverlay'));
  document.getElementById('closeConfirmModalBtn').addEventListener('click', () => closeOverlay('confirmOverlay'));
  document.getElementById('confirmOkBtn').addEventListener('click', (e) => {
    if (e.currentTarget.disabled) return;
    e.currentTarget.disabled = true;
    const handler = state._confirmHandler;
    state._confirmHandler = null;
    if (handler) handler();
    closeOverlay('confirmOverlay');
  });

  // Backdrop click closes; clicking the modal card itself does not.
  OVERLAY_IDS.forEach(id => {
    const overlay = document.getElementById(id);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay(id);
    });
  });

  // Escape closes the active modal.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.activeOverlayId) closeActiveOverlay();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderPromptList();
  });

  const menuBtn = document.getElementById('menuBtn');
  const toolsMenu = document.getElementById('toolsMenu');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toolsMenu.hidden = !toolsMenu.hidden;
  });
  document.addEventListener('click', () => { toolsMenu.hidden = true; });
  toolsMenu.addEventListener('click', (e) => e.stopPropagation());

  document.getElementById('exportAllBtn').addEventListener('click', () => {
    exportAll();
    toolsMenu.hidden = true;
  });
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
    toolsMenu.hidden = true;
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importFromJson(reader.result);
    reader.readAsText(file);
    e.target.value = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
