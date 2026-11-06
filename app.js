const STORAGE_KEY = "vademecum.medicines.v1";
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const fields = [
  ["Grupo farmacológico", "pharmacologicalGroup"],
  ["Presentación", "presentation"],
  ["Mecanismo de acción", "mechanism"],
  ["Indicaciones", "indications"],
  ["Dosis en adultos", "adultDose"],
  ["Dosis pediátrica", "pediatricDose"],
  ["Cuidados de enfermería", "nursingCare"],
  ["Efectos secundarios", "sideEffects"],
  ["RAM · Reacciones adversas medicamentosas", "adverseReactions"],
];

const list = document.querySelector("#medicine-list");
const searchInput = document.querySelector("#search-input");
const groupFilter = document.querySelector("#group-filter");
const form = document.querySelector("#medicine-form");
const dialog = document.querySelector("#medicine-dialog");
const detailDialog = document.querySelector("#detail-dialog");
const detailContent = document.querySelector("#detail-content");
const photoInput = document.querySelector("#photo-input");
const photoPreview = document.querySelector("#photo-preview");
const photoPlaceholder = document.querySelector("#photo-placeholder");
const photoError = document.querySelector("#photo-error");
const removePhotoButton = document.querySelector("#remove-photo");
const formError = document.querySelector("#form-error");
let toastTimer;
let activeView = "search";
let returnView = "search";
let deletedCatalogIds = new Set();
const catalog = window.VADEMECUM_CATALOG;
let medicines = loadMedicines();
let editingId = null;
let photoData = "";

function loadMedicines() {
  if (!Array.isArray(catalog)) {
    console.error("No se pudo cargar el catálogo de medicamentos de medicamentos.js.");
    showToast("No se pudo cargar el catálogo inicial de medicamentos.", true);
  }
  const initialCatalog = Array.isArray(catalog) ? catalog : [];
  let savedMedicines = [];
  let needsCleanup = false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        savedMedicines = parsed;
      } else if (parsed && parsed.version === 2 && Array.isArray(parsed.medicines) && Array.isArray(parsed.deletedCatalogIds)) {
        savedMedicines = parsed.medicines;
        deletedCatalogIds = new Set(parsed.deletedCatalogIds.filter((id) => typeof id === "string"));
      } else {
        throw new Error("El formato guardado no es válido.");
      }
    }
    needsCleanup = savedMedicines.some((medicine) =>
      medicine && ("sourceName" in medicine || "sourceDose" in medicine || "source" in medicine),
    );
    savedMedicines = savedMedicines.filter((item) =>
      item && typeof item.id === "string" && typeof item.genericName === "string",
    );
  } catch (error) {
    console.error("No se pudo leer el vademécum local:", error);
    showToast("No se pudo leer la información guardada. Revisa el almacenamiento del navegador.", true);
  }
  if (needsCleanup) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        medicines: savedMedicines.map(cleanMedicine),
        deletedCatalogIds: [...deletedCatalogIds],
      }));
    } catch (error) {
      console.error("No se pudo actualizar la información guardada:", error);
      showToast("No se pudo actualizar la información guardada en el navegador.", true);
    }
  }
  const catalogIds = new Set(initialCatalog.map((medicine) => medicine.id));
  const savedById = new Map(savedMedicines
    .filter((medicine) => !catalogIds.has(medicine.id) || medicine.updatedAt)
    .map((medicine) => [medicine.id, cleanMedicine(medicine)]));
  return [
    ...initialCatalog
      .filter((medicine) => !deletedCatalogIds.has(medicine.id))
      .map((medicine) => cleanMedicine({ ...medicine, ...savedById.get(medicine.id) })),
    ...savedMedicines.filter((medicine) => !catalogIds.has(medicine.id)).map(cleanMedicine),
  ];
}

function cleanMedicine(medicine) {
  const { sourceName, sourceDose, source, ...clean } = medicine;
  return clean;
}

function saveMedicines(nextMedicines, nextDeletedCatalogIds = deletedCatalogIds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      medicines: nextMedicines.map(cleanMedicine),
      deletedCatalogIds: [...nextDeletedCatalogIds],
    }));
    medicines = nextMedicines;
    deletedCatalogIds = nextDeletedCatalogIds;
    return true;
  } catch (error) {
    console.error("No se pudo guardar el vademécum:", error);
    showToast("No se pudo guardar. El almacenamiento del navegador puede estar lleno.", true);
    return false;
  }
}

const SUPABASE_URL = "https://brtnrhhbhvgbvdhxwdxk.supabase.co";
const SUPABASE_KEY = "sb_publishable_lbNZmDP6xsFYmmVUCcGGjg_Xxkvtlhg";
const REMOTE_TABLE = `${SUPABASE_URL}/rest/v1/medicamentos`;
const FIELD_MAP = {
  id: "id",
  genericName: "generic_name",
  brandName: "brand_name",
  pharmacologicalGroup: "pharmacological_group",
  presentation: "presentation",
  mechanism: "mechanism",
  indications: "indications",
  adultDose: "adult_dose",
  pediatricDose: "pediatric_dose",
  nursingCare: "nursing_care",
  sideEffects: "side_effects",
  adverseReactions: "adverse_reactions",
  photo: "photo",
  updatedAt: "updated_at",
};
let remoteActive = false;
const SESSION_KEY = "vademecum.session.v1";
let session = null;

function loadSession() {
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    session = null;
  }
}

function storeSession(data) {
  session = data ? {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in,
    email: data.user?.email ?? session?.email ?? "",
  } : null;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function authRequest(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("auth");
  return response.json();
}

async function ensureSession() {
  if (!session) return;
  if (session.expires_at - 60 > Date.now() / 1000) return;
  try {
    storeSession(await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
  } catch {
    storeSession(null);
  }
}

function isAuthed() {
  return Boolean(session);
}

function updateAuthUi() {
  const authed = isAuthed();
  for (const button of document.querySelectorAll('.menu-button[data-view="add"], .menu-button[data-view="edit"]')) {
    button.hidden = !authed;
  }
  const authButton = document.querySelector("#auth-button");
  authButton.textContent = authed ? "Cerrar sesión" : "Iniciar sesión";
  authButton.title = authed ? session.email : "";
  if (!authed && (activeView === "edit" || activeView === "add")) setView("search");
  else render();
}

function toRow(medicine) {
  return Object.fromEntries(Object.entries(FIELD_MAP).map(([key, column]) => [column, medicine[key] || (key === "updatedAt" ? new Date().toISOString() : "")]));
}

function fromRow(row) {
  return Object.fromEntries(Object.entries(FIELD_MAP).map(([key, column]) => [key, row[column] ?? ""]));
}

async function remoteRequest(path, options = {}) {
  await ensureSession();
  const response = await fetch(`${REMOTE_TABLE}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function initRemote() {
  try {
    let rows = await remoteRequest("?select=*&order=generic_name.asc");
    if (rows.length === 0 && Array.isArray(catalog) && catalog.length) {
      await remoteRequest("", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(medicines.map(toRow)),
      });
      rows = await remoteRequest("?select=*&order=generic_name.asc");
    }
    medicines = rows.map(fromRow);
    remoteActive = true;
    render();
  } catch (error) {
    console.error("No se pudo conectar con la base de datos:", error);
    showToast("Sin conexión a la base de datos: se usan los datos locales.", true);
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase("es");
  const selectedGroup = groupFilter.value;
  const editingMode = activeView === "edit";
  const filtered = medicines.filter((medicine) => {
    const searchable = [
      medicine.genericName, medicine.brandName,
      medicine.pharmacologicalGroup, medicine.presentation,
      medicine.indications, medicine.mechanism, medicine.adultDose,
      medicine.pediatricDose, medicine.nursingCare, medicine.sideEffects,
      medicine.adverseReactions,
    ].join(" ").toLocaleLowerCase("es");
    return searchable.includes(query) && (!selectedGroup || medicine.pharmacologicalGroup === selectedGroup);
  });

  const groups = [...new Set(medicines.map((medicine) => medicine.pharmacologicalGroup).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "es"));
  const currentGroup = groupFilter.value;
  document.querySelector("#group-options").innerHTML = groups
    .map((group) => `<option value="${escapeHtml(group)}"></option>`)
    .join("");
  groupFilter.innerHTML = '<option value="">Todos los grupos</option>' + groups
    .map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`)
    .join("");
  groupFilter.value = groups.includes(currentGroup) ? currentGroup : "";
  document.querySelector("#result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "ficha" : "fichas"}`;
  document.querySelector("#list-eyebrow").textContent = editingMode ? "Edición" : selectedGroup ? "Grupo farmacológico" : "Consulta";
  document.querySelector("#list-title").textContent = editingMode ? "Editar medicamentos" : selectedGroup || "Medicamentos";
  list.classList.toggle("edit-mode", editingMode);

  if (!filtered.length) {
    const isSearching = query.length > 0;
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-symbol" aria-hidden="true">${isSearching ? "⌕" : "+"}</span>
        <h3>${isSearching || selectedGroup ? "No encontramos resultados" : editingMode ? "No hay medicamentos para editar" : "No hay medicamentos"}</h3>
        <p>${isSearching || selectedGroup ? "Prueba con otro nombre o grupo farmacológico." : "Usa el menú Agregar para crear una ficha."}</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((medicine) => {
    const image = medicine.photo
      ? `<img src="${escapeHtml(medicine.photo)}" alt="">`
      : '<span class="pill-icon" aria-hidden="true">◒</span>';
    const brand = medicine.brandName
      ? escapeHtml(medicine.brandName)
      : "Sin nombre comercial";
    const tags = [
      medicine.pharmacologicalGroup ? `<span class="tag tag-group">${escapeHtml(medicine.pharmacologicalGroup)}</span>` : "",
      medicine.presentation ? `<span class="tag">${escapeHtml(medicine.presentation)}</span>` : "",
    ].filter(Boolean).join("");
    return `
      <article class="medicine-card">
        <div class="medicine-thumb">${image}</div>
        <div class="medicine-info">
          <h3>${escapeHtml(medicine.genericName)}</h3>
          <p class="medicine-brand">${brand}</p>
          <div class="medicine-tags">${tags}</div>
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" data-action="view" data-id="${escapeHtml(medicine.id)}" aria-label="Ver ${escapeHtml(medicine.genericName)}" title="Ver ficha">↗</button>
          ${editingMode ? `<button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(medicine.id)}" aria-label="Editar ${escapeHtml(medicine.genericName)}" title="Editar">✎</button>
          <button class="icon-button delete-button" type="button" data-action="delete" data-id="${escapeHtml(medicine.id)}" aria-label="Eliminar ${escapeHtml(medicine.genericName)}" title="Eliminar">×</button>` : ""}
        </div>
      </article>`;
  }).join("");
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("error-toast", isError);
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3500);
}

function resetPhoto() {
  photoData = "";
  photoInput.value = "";
  photoPreview.removeAttribute("src");
  photoPreview.hidden = true;
  photoPlaceholder.hidden = false;
  removePhotoButton.hidden = true;
  photoError.textContent = "";
}

function setPhoto(data) {
  photoData = data;
  photoPreview.src = data;
  photoPreview.hidden = false;
  photoPlaceholder.hidden = true;
  removePhotoButton.hidden = false;
}

function setView(view) {
  if (!isAuthed() && view !== "search") view = "search";
  activeView = view;
  for (const button of document.querySelectorAll(".menu-button")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  document.querySelector("#page-description").textContent = view === "edit"
    ? "Selecciona un medicamento para consultar, editar o quitar su ficha."
    : "Encuentra medicamentos por nombre o grupo farmacológico.";
  render();
}

function openForm(medicine = null, viewAfterClose = activeView === "edit" ? "edit" : "search") {
  if (!isAuthed()) return;
  returnView = viewAfterClose;
  form.reset();
  formError.textContent = "";
  resetPhoto();
  editingId = medicine?.id ?? null;
  setView("add");
  document.querySelector("#dialog-title").textContent = editingId ? "Editar medicamento" : "Agregar medicamento";
  if (medicine) {
    for (const [name, value] of Object.entries(medicine)) {
      if (name in form.elements && name !== "photo") form.elements[name].value = value ?? "";
    }
    if (medicine.photo) setPhoto(medicine.photo);
  }
  dialog.showModal();
  form.elements.genericName.focus();
}

function showDetails(medicine) {
  const image = medicine.photo
    ? `<img src="${escapeHtml(medicine.photo)}" alt="Foto de ${escapeHtml(medicine.genericName)}">`
    : '<span aria-hidden="true">◒</span>';
  const sections = fields.map(([label, key]) => `
    <section class="detail-section">
      <h3>${escapeHtml(label)}</h3>
      <p>${medicine[key] ? escapeHtml(medicine[key]) : "Sin información registrada."}</p>
    </section>`).join("");
  detailContent.innerHTML = `
    <div class="detail-content">
      <div class="detail-top">
        <div class="detail-photo">${image}</div>
        <div class="detail-title-wrap">
          <p class="eyebrow">Ficha farmacológica</p>
          <h2 id="detail-title">${escapeHtml(medicine.genericName)}</h2>
          <p>${medicine.brandName ? escapeHtml(medicine.brandName) : "Sin nombre comercial registrado"}</p>
        </div>
        <button class="icon-button detail-close" type="button" data-action="close-detail" aria-label="Cerrar ficha">×</button>
      </div>
      <div class="detail-grid">${sections}</div>
      <div class="detail-footer">
        <button class="button button-quiet" type="button" data-action="close-detail">Cerrar</button>
        ${isAuthed() ? `<button class="button button-primary" type="button" data-action="edit-detail" data-id="${escapeHtml(medicine.id)}">Editar ficha</button>` : ""}
      </div>
    </div>`;
  detailDialog.showModal();
}

for (const button of document.querySelectorAll(".menu-button[data-view]")) {
  button.addEventListener("click", () => {
    if (button.dataset.view === "add") {
      openForm(null, "search");
      return;
    }
    if (dialog.open) dialog.close();
    setView(button.dataset.view);
    if (button.dataset.view === "search") {
      searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
      searchInput.focus({ preventScroll: true });
    }
  });
}
document.querySelector("#close-dialog").addEventListener("click", () => {
  dialog.close();
  setView(returnView);
});
document.querySelector("#cancel-button").addEventListener("click", () => {
  dialog.close();
  setView(returnView);
});
searchInput.addEventListener("input", render);
groupFilter.addEventListener("change", render);
dialog.addEventListener("close", () => {
  if (activeView === "add") setView(returnView);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && detailDialog.open) detailDialog.close();
});

photoInput.addEventListener("change", () => {
  photoError.textContent = "";
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!allowedImageTypes.has(file.type)) {
    photoInput.value = "";
    photoError.textContent = "Selecciona una imagen JPG, PNG o WebP.";
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    photoInput.value = "";
    photoError.textContent = "La imagen supera el límite de 2 MB.";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result === "string") setPhoto(reader.result);
  });
  reader.addEventListener("error", () => {
    photoError.textContent = "No se pudo leer la imagen. Intenta con otro archivo.";
  });
  reader.readAsDataURL(file);
});

removePhotoButton.addEventListener("click", resetPhoto);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAuthed()) return;
  formError.textContent = "";
  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());
  const genericName = String(data.genericName ?? "").trim();
  if (!genericName) {
    formError.textContent = "El nombre genérico es obligatorio.";
    form.elements.genericName.focus();
    return;
  }

  const medicine = {
    id: editingId ?? crypto.randomUUID(),
    genericName,
    brandName: String(data.brandName ?? "").trim(),
    pharmacologicalGroup: String(data.pharmacologicalGroup ?? "").trim(),
    presentation: String(data.presentation ?? "").trim(),
    mechanism: String(data.mechanism ?? "").trim(),
    indications: String(data.indications ?? "").trim(),
    adultDose: String(data.adultDose ?? "").trim(),
    pediatricDose: String(data.pediatricDose ?? "").trim(),
    nursingCare: String(data.nursingCare ?? "").trim(),
    sideEffects: String(data.sideEffects ?? "").trim(),
    adverseReactions: String(data.adverseReactions ?? "").trim(),
    photo: photoData,
    updatedAt: new Date().toISOString(),
  };
  const wasEditing = Boolean(editingId);
  const nextMedicines = editingId
    ? medicines.map((item) => item.id === editingId ? medicine : item)
    : [medicine, ...medicines];

  if (remoteActive) {
    try {
      await remoteRequest("", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([toRow(medicine)]),
      });
      medicines = nextMedicines;
    } catch (error) {
      console.error("No se pudo guardar en la base de datos:", error);
      formError.textContent = "No se pudo guardar en la base de datos. Intenta de nuevo.";
      return;
    }
  } else if (!saveMedicines(nextMedicines)) return;
  dialog.close();
  setView(wasEditing ? returnView : "search");
  showToast(wasEditing ? "Ficha actualizada." : "Medicamento agregado.");
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const medicine = medicines.find((item) => item.id === button.dataset.id);
  if (!medicine) return;
  if (button.dataset.action === "view") showDetails(medicine);
  if (button.dataset.action === "edit") openForm(medicine, activeView);
  if (button.dataset.action === "delete" && isAuthed()) {
    const confirmed = window.confirm(`¿Eliminar la ficha de ${medicine.genericName}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    if (remoteActive) {
      try {
        await remoteRequest(`?id=eq.${encodeURIComponent(medicine.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        medicines = medicines.filter((item) => item.id !== medicine.id);
        render();
        showToast("Ficha eliminada.");
      } catch (error) {
        console.error("No se pudo eliminar en la base de datos:", error);
        showToast("No se pudo eliminar en la base de datos.", true);
      }
      return;
    }
    const nextDeletedCatalogIds = new Set(deletedCatalogIds);
    if (medicine.id.startsWith("catalog-")) nextDeletedCatalogIds.add(medicine.id);
    if (saveMedicines(medicines.filter((item) => item.id !== medicine.id), nextDeletedCatalogIds)) {
      render();
      showToast("Ficha eliminada.");
    }
  }
});

detailContent.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "close-detail") {
    detailDialog.close();
    return;
  }
  if (button.dataset.action === "edit-detail") {
    const medicine = medicines.find((item) => item.id === button.dataset.id);
    detailDialog.close();
    if (medicine) openForm(medicine, activeView);
  }
});

const loginDialog = document.querySelector("#login-dialog");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");

document.querySelector("#auth-button").addEventListener("click", () => {
  if (isAuthed()) {
    storeSession(null);
    if (dialog.open) dialog.close();
    updateAuthUi();
    showToast("Sesión cerrada.");
    return;
  }
  loginForm.reset();
  loginError.textContent = "";
  loginDialog.showModal();
  loginForm.elements.email.focus();
});
document.querySelector("#login-cancel").addEventListener("click", () => loginDialog.close());
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  try {
    storeSession(await authRequest("token?grant_type=password", {
      email: loginForm.elements.email.value.trim(),
      password: loginForm.elements.password.value,
    }));
    loginDialog.close();
    updateAuthUi();
    showToast("Sesión iniciada.");
  } catch {
    loginError.textContent = "Correo o contraseña incorrectos.";
  }
});

groupFilter.value = "";
loadSession();
setView("search");
updateAuthUi();
ensureSession().then(updateAuthUi);
initRemote();
