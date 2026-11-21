const STORAGE_KEY = "frameboard-studio-project";
const PROJECTS_KEY = "frameboard-studio-projects";

const defaultProject = () => ({
  title: "",
  client: "",
  version: "",
  format: "horizontal",
  printProfile: "client"
});

const state = {
  projects: [],
  currentProjectId: null,
  project: defaultProject(),
  shots: [],
  brainstorm: {
    html: ""
  },
  editingId: null,
  draftImage: "",
  view: "grid",
  query: ""
};

const els = {
  homeScreen: document.querySelector("#homeScreen"),
  workspaceShell: document.querySelector("#workspaceShell"),
  projectList: document.querySelector("#projectList"),
  homeEmptyState: document.querySelector("#homeEmptyState"),
  newProject: document.querySelector("#newProjectBtn"),
  clearAll: document.querySelector("#clearAllBtn"),
  trashBtn: document.querySelector("#trashBtn"),
  trashPanel: document.querySelector("#trashPanel"),
  trashList: document.querySelector("#trashList"),
  closeTrash: document.querySelector("#closeTrashBtn"),
  storageNote: document.querySelector("#storageNote"),
  backHome: document.querySelector("#backHomeBtn"),
  form: document.querySelector("#shotForm"),
  formTitle: document.querySelector("#formTitle"),
  imageInput: document.querySelector("#imageInput"),
  imageDrop: document.querySelector(".image-drop"),
  imagePreview: document.querySelector("#imagePreview"),
  imagePrompt: document.querySelector("#imagePrompt"),
  title: document.querySelector("#titleInput"),
  shotType: document.querySelector("#shotTypeInput"),
  angle: document.querySelector("#angleInput"),
  movement: document.querySelector("#movementInput"),
  duration: document.querySelector("#durationInput"),
  location: document.querySelector("#locationInput"),
  time: document.querySelector("#timeInput"),
  action: document.querySelector("#actionInput"),
  notes: document.querySelector("#notesInput"),
  saveShot: document.querySelector("#saveShotBtn"),
  deleteShot: document.querySelector("#deleteShotBtn"),
  resetForm: document.querySelector("#resetFormBtn"),
  projectTitle: document.querySelector("#projectTitleInput"),
  client: document.querySelector("#clientInput"),
  version: document.querySelector("#versionInput"),
  format: document.querySelector("#formatInput"),
  printProfile: document.querySelector("#printProfileInput"),
  gridView: document.querySelector("#gridViewBtn"),
  listView: document.querySelector("#listViewBtn"),
  tableView: document.querySelector("#tableViewBtn"),
  search: document.querySelector("#searchInput"),
  clear: document.querySelector("#clearBtn"),
  importBtn: document.querySelector("#importBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  exportStoryboard: document.querySelector("#exportStoryboardBtn"),
  exportCsv: document.querySelector("#exportCsvBtn"),
  importInput: document.querySelector("#importInput"),
  brainstormEditor: document.querySelector("#brainstormEditor"),
  blockFormat: document.querySelector("#blockFormatInput"),
  insertBrainstormImage: document.querySelector("#insertBrainstormImageBtn"),
  brainstormImageInput: document.querySelector("#brainstormImageInput"),
  exportBrainstorm: document.querySelector("#exportBrainstormBtn"),
  print: document.querySelector("#printBtn"),
  shotBoard: document.querySelector("#shotBoard"),
  shotTableWrap: document.querySelector("#shotTableWrap"),
  shotTableBody: document.querySelector("#shotTableBody"),
  emptyState: document.querySelector("#emptyState"),
  shotCount: document.querySelector("#shotCount"),
  saveState: document.querySelector("#saveState"),
  template: document.querySelector("#shotCardTemplate")
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Storage: shared cloud board (Supabase) or this browser (IndexedDB)
// ---------------------------------------------------------------------------

const CLOUD = (() => {
  const config = window.FRAMEBOARD_CONFIG || {};
  const url = String(config.supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(config.supabaseKey || "").trim();
  if (!url || !key) return null;
  return { url, key, bucket: String(config.imageBucket || "frameboard-images").trim() };
})();

const IDB_NAME = "frameboard-studio";
const IDB_STORE = "kv";
const IDB_KEY = "projects";
const MIGRATED_KEY = "frameboard-cloud-migrated-v2";
const POLL_MS = 4000;

let storageReady = false;
let cloudMode = false;
let cloudUnreachable = false;
let persistTimer = null;
let persisting = false;
let persistAgain = false;
let polling = false;
let migrationPending = false;
let syncFailing = false;
let lastLocalEdit = 0;
const BUSY_MS = 5000;
const synced = new Map();

function cloudHeaders(extra = {}) {
  const headers = { apikey: CLOUD.key, ...extra };
  if (CLOUD.key.startsWith("eyJ")) headers.Authorization = `Bearer ${CLOUD.key}`;
  return headers;
}

async function cloudFetch(path, options = {}) {
  const response = await fetch(`${CLOUD.url}${path}`, {
    ...options,
    headers: cloudHeaders(options.headers || {})
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`${response.status} ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return response;
}

async function detectCloud() {
  if (!CLOUD) return null;
  try {
    const response = await cloudFetch("/rest/v1/projects?select=id,rev,record");
    return await response.json();
  } catch (error) {
    console.warn("Frameboard: shared storage unavailable", error);
    cloudUnreachable = true;
    return null;
  }
}

function openIdb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbRequest(mode, run) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, mode);
    const request = run(tx.objectStore(IDB_STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function readLegacyLocalStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
    if (Array.isArray(stored) && stored.length) return stored;
    const oldSingle = localStorage.getItem(STORAGE_KEY);
    if (oldSingle) return [{ ...JSON.parse(oldSingle), id: uid(), createdAt: new Date().toISOString() }];
  } catch {
    // ignore unreadable data
  }
  return [];
}

async function readStoredProjects() {
  try {
    const stored = await idbRequest("readonly", (store) => store.get(IDB_KEY));
    if (Array.isArray(stored)) return stored;
  } catch (error) {
    console.warn("Frameboard: IndexedDB read failed", error);
  }
  return readLegacyLocalStorage();
}

async function writeStoredProjects() {
  const records = JSON.parse(JSON.stringify(state.projects));
  try {
    await idbRequest("readwrite", (store) => store.put(records, IDB_KEY));
  } catch (error) {
    console.warn("Frameboard: IndexedDB write failed, using localStorage", error);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(records));
  }
}

async function clearStoredProjects() {
  try {
    await idbRequest("readwrite", (store) => store.delete(IDB_KEY));
  } catch {
    // ignore
  }
  localStorage.removeItem(PROJECTS_KEY);
  localStorage.removeItem(STORAGE_KEY);
}

async function loadProjects() {
  const rows = await detectCloud();
  if (rows) {
    cloudMode = true;
    document.body.dataset.storage = "cloud";
    state.projects = rows.map((row) => {
      const record = normalizeProjectRecord({ ...row.record, id: row.id });
      synced.set(row.id, { rev: row.rev, updatedAt: record.updatedAt, syncedAt: Date.now() });
      return record;
    });
    await offerLocalMigration(new Set(rows.map((row) => row.id)));
    window.setInterval(cloudPoll, POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) cloudPoll();
    });
  } else {
    document.body.dataset.storage = "local";
    const stored = await readStoredProjects();
    state.projects = stored.map(normalizeProjectRecord);
  }
  updateStorageUi();
}

async function offerLocalMigration(remoteIds) {
  if (localStorage.getItem(MIGRATED_KEY)) return;
  const local = (await readStoredProjects()).filter((record) => record && !remoteIds.has(record.id));
  if (!local.length) return;
  const plural = local.length === 1 ? "board" : "boards";
  const copy = confirm(
    `This browser has ${local.length} ${plural} saved from the old local-only version.\n\nCopy ${local.length === 1 ? "it" : "them"} to the shared board so everyone with the link can see ${local.length === 1 ? "it" : "them"}?`
  );
  if (!copy) {
    localStorage.setItem(MIGRATED_KEY, "declined");
    return;
  }
  migrationPending = true;
  local.forEach((record) => state.projects.unshift(normalizeProjectRecord(record)));
  schedulePersist();
}

function updateStorageUi() {
  const note = els.storageNote;
  note.classList.remove("is-warning");
  if (cloudMode) {
    note.textContent = "Shared board: anyone with this link can view and edit these projects. Changes sync automatically.";
    note.hidden = false;
  } else if (cloudUnreachable) {
    note.textContent = "Couldn't reach the shared board, so you're working in this browser only. Changes made now won't be shared. Reload to try again.";
    note.classList.add("is-warning");
    note.hidden = false;
  } else {
    note.textContent = "Projects are saved in this browser only.";
    note.hidden = false;
  }
  els.clearAll.hidden = cloudMode;
  els.trashBtn.hidden = !cloudMode;
  setSaveState(cloudMode ? "Synced" : "Saved locally");
}

function setSaveState(text) {
  els.saveState.textContent = text;
}

function isDirty(record) {
  const info = synced.get(record.id);
  return !info || info.updatedAt !== record.updatedAt;
}

function schedulePersist() {
  if (cloudMode) setSaveState("Saving…");
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    runPersist();
  }, cloudMode ? 700 : 250);
}

async function runPersist() {
  if (persisting) {
    persistAgain = true;
    return;
  }
  persisting = true;
  try {
    if (cloudMode) {
      await cloudPush();
      if (migrationPending) {
        migrationPending = false;
        localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
      }
      if (!persistTimer) setSaveState("Synced");
      if (syncFailing) {
        syncFailing = false;
        updateStorageUi();
      }
    } else {
      await writeStoredProjects();
      setSaveState("Saved locally");
    }
  } catch (error) {
    console.warn("Frameboard: save failed", error);
    setSaveState(cloudMode ? "Not saved: retrying…" : "Save failed");
    if (cloudMode && !syncFailing) {
      syncFailing = true;
      els.storageNote.textContent = `Changes aren't reaching the shared board (${String(error.message).slice(0, 140)}). Keep this tab open: it retries every few seconds.`;
      els.storageNote.classList.add("is-warning");
    }
    if (cloudMode && !persistTimer) {
      persistTimer = window.setTimeout(() => {
        persistTimer = null;
        runPersist();
      }, 5000);
    }
  } finally {
    persisting = false;
    if (persistAgain) {
      persistAgain = false;
      runPersist();
    }
  }
}

function serializeRecord(record) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    project: record.project,
    shots: record.shots,
    brainstorm: record.brainstorm,
    view: record.view
  };
}

async function cloudPush() {
  for (const record of state.projects.filter(isDirty)) {
    const stamp = record.updatedAt;
    await externalizeImages(record);
    const response = await cloudFetch("/rest/v1/projects?on_conflict=id&select=rev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({ id: record.id, record: serializeRecord(record) })
    });
    const [row] = await response.json();
    synced.set(record.id, { rev: row?.rev ?? 0, updatedAt: stamp, syncedAt: Date.now() });
  }

  const localIds = new Set(state.projects.map((record) => record.id));
  for (const id of [...synced.keys()]) {
    if (localIds.has(id)) continue;
    await cloudFetch(`/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    synced.delete(id);
  }
}

function userIsBusyIn(record) {
  if (!record || record.id !== state.currentProjectId) return false;
  if (Date.now() - lastLocalEdit > BUSY_MS) return false;
  const active = document.activeElement;
  return Boolean(active && (els.brainstormEditor.contains(active) || active.closest?.(".project-bar")));
}

async function cloudPoll() {
  if (!cloudMode || document.hidden || polling || persisting || persistTimer) return;
  polling = true;
  const pollStart = Date.now();
  try {
    const rows = await (await cloudFetch("/rest/v1/projects?select=id,rev")).json();
    if (persisting || persistTimer) return;
    const remote = new Map(rows.map((row) => [row.id, row.rev]));

    let removed = false;
    for (const [id, info] of [...synced]) {
      if (remote.has(id) || info.syncedAt >= pollStart) continue;
      const record = state.projects.find((item) => item.id === id);
      if (record && isDirty(record)) continue;
      synced.delete(id);
      state.projects = state.projects.filter((item) => item.id !== id);
      removed = true;
      if (state.currentProjectId === id) {
        showHome();
        alert("This project was deleted by someone else. You can restore it from \"Recently deleted\".");
      }
    }

    const changed = rows.filter((row) => synced.get(row.id)?.rev !== row.rev).map((row) => row.id);
    if (changed.length) {
      const list = changed.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",");
      const fresh = await (await cloudFetch(`/rest/v1/projects?select=id,rev,record&id=in.(${encodeURIComponent(list)})`)).json();
      if (persisting || persistTimer) return;
      for (const row of fresh) {
        const local = state.projects.find((item) => item.id === row.id);
        if (local && isDirty(local)) continue;
        if (userIsBusyIn(local)) continue;
        applyRemoteRecord(row);
      }
    }

    if (removed || changed.length) renderHome();
  } catch (error) {
    console.warn("Frameboard: poll failed", error);
  } finally {
    polling = false;
  }
}

function applyRemoteRecord(row) {
  const record = normalizeProjectRecord({ ...row.record, id: row.id });
  const index = state.projects.findIndex((item) => item.id === row.id);
  if (index >= 0) state.projects[index] = record;
  else state.projects.unshift(record);
  synced.set(row.id, { rev: row.rev, updatedAt: record.updatedAt, syncedAt: Date.now() });

  if (state.currentProjectId === row.id) {
    state.project = { ...record.project };
    state.shots = [...record.shots];
    state.brainstorm = { html: record.brainstorm.html };
    state.view = record.view;
    render();
  }
}

// --- Images -----------------------------------------------------------------

function publicImageBase() {
  return `${CLOUD.url}/storage/v1/object/public/${CLOUD.bucket}/`;
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = (header.match(/^data:([^;]+)/) || [])[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobName(blob) {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[blob.type] || "jpg";
  let hash;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } else {
    hash = uid().replace(/[^a-z0-9]/gi, "");
  }
  return `${hash}.${ext}`;
}

const uploadedImages = new Map();

async function uploadDataUrl(dataUrl) {
  if (uploadedImages.has(dataUrl)) return uploadedImages.get(dataUrl);
  const blob = dataUrlToBlob(dataUrl);
  const name = await blobName(blob);
  try {
    await cloudFetch(`/storage/v1/object/${CLOUD.bucket}/${name}`, {
      method: "POST",
      headers: { "Content-Type": blob.type, "Cache-Control": "31536000" },
      body: blob
    });
  } catch (error) {
    const duplicate = (error.status === 400 || error.status === 409) && /duplicate|already exists/i.test(error.body || "");
    if (!duplicate) throw error;
  }
  const url = `${publicImageBase()}${name}`;
  uploadedImages.set(dataUrl, url);
  return url;
}

async function externalizeImages(record) {
  const isCurrent = record.id === state.currentProjectId;

  for (const shot of record.shots) {
    if (!shot.image?.startsWith("data:")) continue;
    const dataUrl = shot.image;
    const url = await uploadDataUrl(dataUrl);
    shot.image = url;
    if (isCurrent) {
      state.shots.forEach((item) => {
        if (item.image === dataUrl) item.image = url;
      });
      if (state.draftImage === dataUrl) state.draftImage = url;
    }
  }

  const html = record.brainstorm?.html || "";
  if (!html.includes("data:image")) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const img of template.content.querySelectorAll('img[src^="data:"]')) {
    const dataUrl = img.getAttribute("src");
    const url = await uploadDataUrl(dataUrl);
    img.setAttribute("src", url);
    if (isCurrent) {
      // Swap in place in the live editor so the cursor isn't lost.
      els.brainstormEditor.querySelectorAll("img").forEach((live) => {
        if (live.getAttribute("src") === dataUrl) live.setAttribute("src", url);
      });
    }
  }
  record.brainstorm = { html: template.innerHTML };
  if (isCurrent) state.brainstorm.html = sanitizeBrainstormHtml(els.brainstormEditor.innerHTML);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function inlineImagesInText(text) {
  if (!CLOUD) return text;
  const base = publicImageBase();
  const pattern = new RegExp(`${base.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}[A-Za-z0-9._-]+`, "g");
  const urls = [...new Set(text.match(pattern) || [])];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const dataUrl = await blobToDataUrl(await response.blob());
      text = text.split(url).join(dataUrl);
    } catch {
      // leave the link in place
    }
  }
  return text;
}

// --- Recently deleted -------------------------------------------------------

async function openTrash() {
  els.trashPanel.hidden = false;
  els.trashList.innerHTML = "<li>Loading…</li>";
  try {
    const rows = await (await cloudFetch("/rest/v1/trash?select=id,project_id,record,deleted_at&order=deleted_at.desc&limit=50")).json();
    if (!rows.length) {
      els.trashList.innerHTML = "<li>Nothing deleted recently.</li>";
      return;
    }
    els.trashList.replaceChildren(...rows.map(renderTrashRow));
  } catch (error) {
    els.trashList.innerHTML = `<li>Couldn't load deleted projects (${escapeHtml(error.message.slice(0, 120))}).</li>`;
  }
}

function renderTrashRow(row) {
  const item = document.createElement("li");
  const project = row.record?.project || {};
  const shots = Array.isArray(row.record?.shots) ? row.record.shots.length : 0;
  const when = new Date(row.deleted_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  item.innerHTML = `
    <div>
      <strong>${escapeHtml(project.title || "Untitled project")}</strong>
      <div class="trash-meta">${escapeHtml(project.client || "No client")} · ${shots} ${shots === 1 ? "shot" : "shots"} · Deleted ${escapeHtml(when)}</div>
    </div>
    <button class="primary" type="button">Restore</button>
  `;
  const button = item.querySelector("button");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Restoring…";
    try {
      await restoreFromTrash(row);
      item.remove();
      if (!els.trashList.children.length) els.trashList.innerHTML = "<li>Nothing deleted recently.</li>";
    } catch (error) {
      button.disabled = false;
      button.textContent = "Restore";
      alert(`Couldn't restore: ${error.message.slice(0, 200)}`);
    }
  });
  return item;
}

async function restoreFromTrash(row) {
  const record = normalizeProjectRecord({ ...row.record, id: row.project_id, updatedAt: new Date().toISOString() });
  const response = await cloudFetch("/rest/v1/projects?on_conflict=id&select=id,rev,record", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({ id: record.id, record: serializeRecord(record) })
  });
  const [saved] = await response.json();
  await cloudFetch(`/rest/v1/trash?id=eq.${encodeURIComponent(row.id)}`, { method: "DELETE" });
  applyRemoteRecord(saved);
  renderHome();
}

window.addEventListener("beforeunload", (event) => {
  if (!cloudMode) return;
  if (persistTimer || persisting || state.projects.some(isDirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function normalizeProjectRecord(record) {
  const project = { ...defaultProject(), ...record.project };
  project.format = project.format === "vertical" ? "vertical" : "horizontal";
  project.printProfile = project.printProfile === "internal" ? "internal" : "client";
  return {
    id: record.id || uid(),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    project,
    shots: Array.isArray(record.shots) ? record.shots.filter(Boolean).map(normalizeShot) : [],
    brainstorm: {
      html: sanitizeBrainstormHtml(record.brainstorm?.html || "")
    },
    view: ["grid", "list", "table"].includes(record.view) ? record.view : "grid"
  };
}

function safeImageSrc(value) {
  const src = String(value || "");
  if (/^data:image\//i.test(src) || /^https:\/\//i.test(src)) return src;
  return CLOUD && src.startsWith(publicImageBase()) ? src : "";
}

function normalizeShot(shot) {
  return { ...shot, id: shot.id || uid(), image: safeImageSrc(shot.image) };
}

function currentProjectRecord() {
  return state.projects.find((project) => project.id === state.currentProjectId);
}

function saveProjects() {
  schedulePersist();
}

function saveProject() {
  const record = currentProjectRecord();
  if (!record) return;

  const before = JSON.stringify([record.project, record.shots, record.brainstorm, record.view]);
  const after = JSON.stringify([state.project, state.shots, state.brainstorm, state.view]);
  if (before === after) return;

  lastLocalEdit = Date.now();
  record.project = { ...state.project };
  record.shots = state.shots.map((shot) => ({ ...shot }));
  record.brainstorm = { ...state.brainstorm };
  record.view = state.view;
  record.updatedAt = new Date().toISOString();
  schedulePersist();
}

function openProject(id) {
  const record = state.projects.find((project) => project.id === id);
  if (!record) return;

  state.currentProjectId = id;
  state.project = { ...record.project };
  state.shots = [...record.shots];
  state.brainstorm = { html: sanitizeBrainstormHtml(record.brainstorm?.html || "") };
  state.view = ["grid", "list", "table"].includes(record.view) ? record.view : "grid";
  state.query = "";
  els.search.value = "";
  els.homeScreen.hidden = true;
  els.workspaceShell.hidden = false;
  els.exportBtn.hidden = false;
  els.print.hidden = false;
  render();
  resetForm();
}

function showHome() {
  state.currentProjectId = null;
  els.workspaceShell.hidden = true;
  els.homeScreen.hidden = false;
  els.exportBtn.hidden = true;
  els.print.hidden = true;
  renderHome();
}

function createProject() {
  const record = normalizeProjectRecord({
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    project: { ...defaultProject(), title: "Untitled project", version: "v1" },
    shots: [],
    brainstorm: { html: "" },
    view: "grid"
  });
  state.projects.unshift(record);
  saveProjects();
  openProject(record.id);
}

function deleteProject(id) {
  const record = state.projects.find((project) => project.id === id);
  if (!record) return;
  const name = record.project.title || "Untitled project";
  const message = cloudMode
    ? `Delete "${name}" for everyone? You can restore it from "Recently deleted".`
    : `Delete "${name}"? This cannot be undone.`;
  if (!confirm(message)) return;
  state.projects = state.projects.filter((project) => project.id !== id);
  saveProjects();
  if (state.currentProjectId === id) showHome();
  renderHome();
}

function serializeForm() {
  return {
    id: state.editingId || uid(),
    image: state.draftImage,
    title: els.title.value.trim(),
    shotType: els.shotType.value,
    angle: els.angle.value,
    movement: els.movement.value.trim(),
    duration: els.duration.value.trim(),
    location: els.location.value.trim(),
    time: els.time.value.trim(),
    action: els.action.value.trim(),
    notes: els.notes.value.trim()
  };
}

function resetForm() {
  state.editingId = null;
  state.draftImage = "";
  els.form.reset();
  els.shotType.value = "Wide";
  els.angle.value = "Eye level";
  els.formTitle.textContent = "New shot";
  els.saveShot.textContent = "Add shot";
  els.deleteShot.hidden = true;
  updateImagePreview();
}

function editShot(id) {
  const shot = state.shots.find((item) => item.id === id);
  if (!shot) return;

  state.editingId = shot.id;
  state.draftImage = shot.image || "";
  els.formTitle.textContent = `Edit shot ${state.shots.indexOf(shot) + 1}`;
  els.saveShot.textContent = "Update shot";
  els.deleteShot.hidden = false;
  els.title.value = shot.title || "";
  els.shotType.value = shot.shotType || "Wide";
  els.angle.value = shot.angle || "Eye level";
  els.movement.value = shot.movement || "";
  els.duration.value = shot.duration || "";
  els.location.value = shot.location || "";
  els.time.value = shot.time || "";
  els.action.value = shot.action || "";
  els.notes.value = shot.notes || "";
  updateImagePreview();
  els.title.focus();
}

function updateImagePreview() {
  const hasImage = Boolean(state.draftImage);
  els.imageDrop.classList.toggle("has-image", hasImage);
  els.imagePreview.src = state.draftImage;
  els.imagePreview.alt = hasImage ? "Selected shot reference" : "";
  els.imagePrompt.textContent = hasImage ? "Replace image" : "Drop or upload reference image";
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function getFilteredShots() {
  const query = state.query.toLowerCase();
  if (!query) return state.shots;
  return state.shots.filter((shot) =>
    [
      shot.title,
      shot.shotType,
      shot.angle,
      shot.movement,
      shot.duration,
      shot.location,
      shot.time,
      shot.action,
      shot.notes
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
}

function spec(label, value) {
  if (!value) return "";
  return `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}

function sanitizeBrainstormHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}

function saveBrainstorm() {
  state.brainstorm.html = sanitizeBrainstormHtml(els.brainstormEditor.innerHTML);
  saveProject();
}

function insertBrainstormHtml(html) {
  els.brainstormEditor.focus();
  document.execCommand("insertHTML", false, html);
  saveBrainstorm();
}

function projectFilename(label) {
  return `${state.project.title || label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || label;
}

function projectPayload(include) {
  const payload = {
    project: state.project,
    exportedAt: new Date().toISOString(),
    exportType: include
  };

  if (include === "full" || include === "storyboard") {
    payload.shots = state.shots;
    payload.view = state.view;
  }

  if (include === "full" || include === "brainstorm") {
    payload.brainstorm = {
      html: sanitizeBrainstormHtml(els.brainstormEditor.innerHTML)
    };
  }

  return payload;
}

async function exportJson(include, suffix) {
  const filename = `${projectFilename("frameboard")}-${suffix}.json`;
  const text = await inlineImagesInText(JSON.stringify(projectPayload(include), null, 2));
  downloadFile(filename, text, "application/json");
}

function csvCell(value) {
  const text = String(value || "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportShotListCsv() {
  const headers = [
    "Shot #",
    "Title",
    "Shot type",
    "Angle",
    "Movement",
    "Duration",
    "Location",
    "Time",
    "Action",
    "Director notes"
  ];
  const rows = state.shots.map((shot, index) => [
    String(index + 1).padStart(2, "0"),
    shot.title,
    shot.shotType,
    shot.angle,
    shot.movement,
    shot.duration,
    shot.location,
    shot.time,
    shot.action,
    shot.notes
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile(`${projectFilename("shot-list")}-shot-list.csv`, csv, "text/csv");
}

async function exportBrainstormHtml() {
  const title = escapeHtml(state.project.title || "Frameboard brainstorm");
  const content = await inlineImagesInText(sanitizeBrainstormHtml(state.brainstorm.html || els.brainstormEditor.innerHTML));
  const documentHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { color: #172026; font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
    img { max-width: 100%; border-radius: 8px; }
    mark { background: #ffe58a; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content || "<p>No brainstorm notes yet.</p>"}
</body>
</html>`;
  downloadFile(`${projectFilename("brainstorm")}-notes.html`, documentHtml, "text/html");
}

function render() {
  els.projectTitle.value = state.project.title;
  els.client.value = state.project.client;
  els.version.value = state.project.version;
  els.format.value = state.project.format;
  els.printProfile.value = state.project.printProfile;
  document.body.dataset.format = state.project.format;
  document.body.dataset.printProfile = state.project.printProfile;
  if (els.brainstormEditor.innerHTML !== state.brainstorm.html) {
    els.brainstormEditor.innerHTML = state.brainstorm.html;
  }

  els.shotBoard.className = `shot-board ${state.view}-view`;
  els.gridView.classList.toggle("active", state.view === "grid");
  els.listView.classList.toggle("active", state.view === "list");
  els.tableView.classList.toggle("active", state.view === "table");

  const filtered = getFilteredShots();
  els.emptyState.hidden = state.shots.length > 0;
  els.shotCount.textContent = `${state.shots.length} ${state.shots.length === 1 ? "shot" : "shots"}`;
  els.shotBoard.hidden = state.view === "table";
  els.shotTableWrap.hidden = state.view !== "table";
  els.shotBoard.replaceChildren(...filtered.map(renderShotCard));
  renderShotTable(filtered);
}

function renderShotTable(shots) {
  const rows = shots.map((shot) => {
    const index = state.shots.indexOf(shot);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${String(index + 1).padStart(2, "0")}</td>
      <td><button type="button" class="table-edit-button">${escapeHtml(shot.title || "Untitled shot")}</button></td>
      <td>${escapeHtml(shot.shotType || "")}</td>
      <td>${escapeHtml(shot.angle || "")}</td>
      <td>${escapeHtml(shot.movement || "")}</td>
      <td>${escapeHtml(shot.duration || "")}</td>
      <td>${escapeHtml(shot.location || "")}</td>
      <td>${escapeHtml(shot.time || "")}</td>
      <td>${escapeHtml(shot.action || "")}</td>
      <td>${escapeHtml(shot.notes || "")}</td>
    `;
    row.querySelector(".table-edit-button").addEventListener("click", () => editShot(shot.id));
    return row;
  });
  els.shotTableBody.replaceChildren(...rows);
}

function renderHome() {
  els.homeEmptyState.hidden = !storageReady || state.projects.length > 0;
  const sorted = [...state.projects].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const cards = sorted.map((record) => {
    const card = document.createElement("article");
    card.className = "project-card";
    const updated = new Date(record.updatedAt).toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    card.innerHTML = `
      <button class="project-card-main" type="button">
        <span class="project-card-title">${escapeHtml(record.project.title || "Untitled project")}</span>
        <span class="project-card-meta">${escapeHtml(record.project.client || "No client")} · ${record.shots.length} ${record.shots.length === 1 ? "shot" : "shots"}</span>
        <span class="project-card-meta">${escapeHtml(record.project.version || "No version")} · ${record.project.format === "vertical" ? "Vertical 9:16" : "Horizontal 16:9"} · Updated ${updated}</span>
      </button>
      <button class="ghost project-delete" type="button">Delete</button>
    `;
    card.querySelector(".project-card-main").addEventListener("click", () => openProject(record.id));
    card.querySelector(".project-delete").addEventListener("click", () => deleteProject(record.id));
    return card;
  });
  els.projectList.replaceChildren(...cards);
}

function renderShotCard(shot) {
  const index = state.shots.indexOf(shot);
  const node = els.template.content.firstElementChild.cloneNode(true);
  const imageButton = node.querySelector(".shot-image-button");
  const image = node.querySelector(".shot-image");

  node.dataset.id = shot.id;
  node.querySelector(".shot-number").textContent = String(index + 1).padStart(2, "0");
  node.querySelector("h3").textContent = shot.title || "Untitled shot";

  if (shot.image) {
    imageButton.classList.add("has-image");
    image.src = shot.image;
    image.alt = `${shot.title || "Shot"} reference`;
  }

  node.querySelector(".shot-specs").innerHTML = [
    spec("Type", shot.shotType),
    spec("Angle", shot.angle),
    spec("Move", shot.movement),
    spec("Duration", shot.duration),
    spec("Location", shot.location),
    spec("Time", shot.time)
  ].join("");

  node.querySelector(".shot-action").textContent = shot.action ? `Action: ${shot.action}` : "";
  node.querySelector(".shot-notes").textContent = shot.notes ? `Notes: ${shot.notes}` : "";

  imageButton.addEventListener("click", () => editShot(shot.id));
  node.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleShotAction(button.dataset.action, shot.id));
  });

  return node;
}

function handleShotAction(action, id) {
  const index = state.shots.findIndex((shot) => shot.id === id);
  if (index < 0) return;

  if (action === "edit") {
    editShot(id);
    return;
  }

  if (action === "up" && index > 0) {
    [state.shots[index - 1], state.shots[index]] = [state.shots[index], state.shots[index - 1]];
  }

  if (action === "down" && index < state.shots.length - 1) {
    [state.shots[index + 1], state.shots[index]] = [state.shots[index], state.shots[index + 1]];
  }

  if (action === "duplicate") {
    const copy = { ...state.shots[index], id: uid(), title: `${state.shots[index].title} copy` };
    state.shots.splice(index + 1, 0, copy);
  }

  saveProject();
  render();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const shot = serializeForm();
  if (!shot.title) return;

  const existingIndex = state.shots.findIndex((item) => item.id === shot.id);
  if (existingIndex >= 0) {
    state.shots[existingIndex] = shot;
  } else {
    state.shots.push(shot);
  }

  saveProject();
  render();
  resetForm();
});

els.deleteShot.addEventListener("click", () => {
  if (!state.editingId) return;
  state.shots = state.shots.filter((shot) => shot.id !== state.editingId);
  saveProject();
  render();
  resetForm();
});

els.resetForm.addEventListener("click", resetForm);

els.newProject.addEventListener("click", createProject);

els.backHome.addEventListener("click", () => {
  saveProject();
  showHome();
});

els.clearAll.addEventListener("click", () => {
  const confirmed = confirm("Clear all projects and saved content from this browser? This cannot be undone.");
  if (!confirmed) return;
  state.projects = [];
  state.currentProjectId = null;
  window.clearTimeout(persistTimer);
  persistTimer = null;
  clearStoredProjects();
  state.project = defaultProject();
  state.shots = [];
  state.brainstorm = { html: "" };
  resetForm();
  showHome();
});

els.imageInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.draftImage = await resizeImage(file);
  updateImagePreview();
  event.target.value = "";
});

["dragenter", "dragover"].forEach((name) => {
  els.imageDrop.addEventListener(name, (event) => {
    event.preventDefault();
    els.imageDrop.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  els.imageDrop.addEventListener(name, () => els.imageDrop.classList.remove("is-dragging"));
});

els.imageDrop.addEventListener("drop", async (event) => {
  event.preventDefault();
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (!file) return;
  state.draftImage = await resizeImage(file);
  updateImagePreview();
});

function saveProjectMeta() {
  state.project.title = els.projectTitle.value;
  state.project.client = els.client.value;
  state.project.version = els.version.value;
  state.project.format = els.format.value;
  state.project.printProfile = els.printProfile.value;
  document.body.dataset.format = state.project.format;
  document.body.dataset.printProfile = state.project.printProfile;
  saveProject();
}

[els.projectTitle, els.client, els.version, els.format, els.printProfile].forEach((input) => {
  input.addEventListener("input", saveProjectMeta);
  input.addEventListener("change", saveProjectMeta);
});

els.gridView.addEventListener("click", () => {
  state.view = "grid";
  saveProject();
  render();
});

els.listView.addEventListener("click", () => {
  state.view = "list";
  saveProject();
  render();
});

els.tableView.addEventListener("click", () => {
  state.view = "table";
  saveProject();
  render();
});

els.search.addEventListener("input", () => {
  state.query = els.search.value.trim();
  render();
});

els.clear.addEventListener("click", () => {
  const confirmed = confirm("Clear all shots from this board?");
  if (!confirmed) return;
  state.shots = [];
  resetForm();
  saveProject();
  render();
});

els.exportBtn.addEventListener("click", () => {
  exportJson("full", "full-project");
});

els.exportStoryboard.addEventListener("click", () => {
  exportJson("storyboard", "storyboard");
});

els.exportCsv.addEventListener("click", exportShotListCsv);

els.importBtn.addEventListener("click", () => els.importInput.click());

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = "";
  let imported;
  try {
    imported = JSON.parse(await file.text());
  } catch {
    alert("That file isn't a valid Frameboard JSON export.");
    return;
  }
  const record = normalizeProjectRecord({
    ...imported,
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  state.projects.unshift(record);
  saveProjects();
  openProject(record.id);
  event.target.value = "";
});

els.print.addEventListener("click", () => window.print());

els.brainstormEditor.addEventListener("input", saveBrainstorm);

els.brainstormEditor.addEventListener("paste", async (event) => {
  const imageFiles = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    window.setTimeout(saveBrainstorm, 0);
    return;
  }

  event.preventDefault();
  for (const file of imageFiles) {
    const image = await resizeImage(file);
    insertBrainstormHtml(`<img src="${image}" alt="Pasted brainstorm reference">`);
  }
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    const command = button.dataset.command;
    if (command === "highlight") {
      document.execCommand("backColor", false, "#ffe58a");
    } else {
      document.execCommand(command, false, null);
    }
    saveBrainstorm();
  });
});

els.blockFormat.addEventListener("change", () => {
  document.execCommand("formatBlock", false, els.blockFormat.value);
  els.brainstormEditor.focus();
  saveBrainstorm();
});

els.insertBrainstormImage.addEventListener("click", () => els.brainstormImageInput.click());

els.brainstormImageInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const image = await resizeImage(file);
  insertBrainstormHtml(`<img src="${image}" alt="Brainstorm reference">`);
  event.target.value = "";
});

els.exportBrainstorm.addEventListener("click", () => {
  state.brainstorm.html = sanitizeBrainstormHtml(els.brainstormEditor.innerHTML);
  saveProject();
  exportBrainstormHtml();
});

els.trashBtn.addEventListener("click", () => {
  if (els.trashPanel.hidden) openTrash();
  else els.trashPanel.hidden = true;
});

els.closeTrash.addEventListener("click", () => {
  els.trashPanel.hidden = true;
});

showHome();
resetForm();
loadProjects().finally(() => {
  storageReady = true;
  renderHome();
});
