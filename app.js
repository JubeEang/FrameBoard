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

function normalizeProjectRecord(record) {
  const project = { ...defaultProject(), ...record.project };
  project.format = project.format === "vertical" ? "vertical" : "horizontal";
  project.printProfile = project.printProfile === "internal" ? "internal" : "client";
  return {
    id: record.id || uid(),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    project,
    shots: Array.isArray(record.shots) ? record.shots : [],
    brainstorm: {
      html: sanitizeBrainstormHtml(record.brainstorm?.html || "")
    },
    view: ["grid", "list", "table"].includes(record.view) ? record.view : "grid"
  };
}

function currentProjectRecord() {
  return state.projects.find((project) => project.id === state.currentProjectId);
}

function loadProjects() {
  try {
    const storedProjects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
    state.projects = Array.isArray(storedProjects) ? storedProjects.map(normalizeProjectRecord) : [];
  } catch {
    state.projects = [];
    localStorage.removeItem(PROJECTS_KEY);
  }

  const oldStored = localStorage.getItem(STORAGE_KEY);
  if (!state.projects.length && oldStored) {
    try {
      const parsed = JSON.parse(oldStored);
      state.projects = [normalizeProjectRecord({ ...parsed, id: uid(), createdAt: new Date().toISOString() })];
      saveProjects();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function saveProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(state.projects));
}

function saveProject() {
  const record = currentProjectRecord();
  if (!record) return;

  record.project = { ...state.project };
  record.shots = state.shots;
  record.brainstorm = { ...state.brainstorm };
  record.view = state.view;
  record.updatedAt = new Date().toISOString();
  saveProjects();
  renderHome();
  els.saveState.textContent = "Saved locally";
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
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
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

function exportJson(include, suffix) {
  const filename = `${projectFilename("frameboard")}-${suffix}.json`;
  downloadFile(filename, JSON.stringify(projectPayload(include), null, 2), "application/json");
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

function exportBrainstormHtml() {
  const title = escapeHtml(state.project.title || "Frameboard brainstorm");
  const content = sanitizeBrainstormHtml(state.brainstorm.html || els.brainstormEditor.innerHTML);
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
  els.homeEmptyState.hidden = state.projects.length > 0;
  const cards = state.projects.map((record) => {
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
  localStorage.removeItem(PROJECTS_KEY);
  localStorage.removeItem(STORAGE_KEY);
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
  const text = await file.text();
  const imported = JSON.parse(text);
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

loadProjects();
renderHome();
showHome();
resetForm();
