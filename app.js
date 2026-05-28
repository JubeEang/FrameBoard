const STORAGE_KEY = "frameboard-studio-project";

const state = {
  project: {
    title: "",
    client: "",
    version: "",
    format: "horizontal"
  },
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
  gridView: document.querySelector("#gridViewBtn"),
  listView: document.querySelector("#listViewBtn"),
  search: document.querySelector("#searchInput"),
  clear: document.querySelector("#clearBtn"),
  importBtn: document.querySelector("#importBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  exportStoryboard: document.querySelector("#exportStoryboardBtn"),
  importInput: document.querySelector("#importInput"),
  brainstormEditor: document.querySelector("#brainstormEditor"),
  blockFormat: document.querySelector("#blockFormatInput"),
  insertBrainstormImage: document.querySelector("#insertBrainstormImageBtn"),
  brainstormImageInput: document.querySelector("#brainstormImageInput"),
  exportBrainstorm: document.querySelector("#exportBrainstormBtn"),
  print: document.querySelector("#printBtn"),
  shotBoard: document.querySelector("#shotBoard"),
  emptyState: document.querySelector("#emptyState"),
  shotCount: document.querySelector("#shotCount"),
  saveState: document.querySelector("#saveState"),
  template: document.querySelector("#shotCardTemplate")
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadProject() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    state.project = { ...state.project, ...parsed.project };
    state.project.format = state.project.format === "vertical" ? "vertical" : "horizontal";
    state.shots = Array.isArray(parsed.shots) ? parsed.shots : [];
    state.brainstorm.html = sanitizeBrainstormHtml(parsed.brainstorm?.html || "");
    state.view = parsed.view === "list" ? "list" : "grid";
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveProject() {
  const payload = {
    project: state.project,
    shots: state.shots,
    brainstorm: state.brainstorm,
    view: state.view,
    exportedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  els.saveState.textContent = "Saved locally";
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
  document.body.dataset.format = state.project.format;
  if (els.brainstormEditor.innerHTML !== state.brainstorm.html) {
    els.brainstormEditor.innerHTML = state.brainstorm.html;
  }

  els.shotBoard.className = `shot-board ${state.view}-view`;
  els.gridView.classList.toggle("active", state.view === "grid");
  els.listView.classList.toggle("active", state.view === "list");

  const filtered = getFilteredShots();
  els.emptyState.hidden = state.shots.length > 0;
  els.shotCount.textContent = `${state.shots.length} ${state.shots.length === 1 ? "shot" : "shots"}`;
  els.shotBoard.replaceChildren(...filtered.map(renderShotCard));
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
  document.body.dataset.format = state.project.format;
  saveProject();
}

[els.projectTitle, els.client, els.version, els.format].forEach((input) => {
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

els.importBtn.addEventListener("click", () => els.importInput.click());

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text);
  state.project = { ...state.project, ...imported.project };
  state.project.format = state.project.format === "vertical" ? "vertical" : "horizontal";
  if (Array.isArray(imported.shots)) {
    state.shots = imported.shots;
  }
  if (imported.brainstorm) {
    state.brainstorm.html = sanitizeBrainstormHtml(imported.brainstorm.html || "");
  }
  state.view = imported.view === "list" ? "list" : "grid";
  state.query = "";
  els.search.value = "";
  saveProject();
  render();
  resetForm();
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

loadProject();
render();
resetForm();
