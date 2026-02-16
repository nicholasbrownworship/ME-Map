/* Middle-earth — War of Influence
   - Loads a PNG map from assets/Map_of_Middle-Earth.png
   - Draws region overlays from data/regions.json
   - Stores campaign state in localStorage (export/import supported)
*/

const STORAGE_KEY = "me_war_of_influence_v1";
const MAP_PATH = "assets/Map_of_Middle-Earth.png";

let regions = [];
let state = null;
let selectedId = null;

const $ = (sel) => document.querySelector(sel);

function clampInfluence(n){
  n = Math.round(n);
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  // keep it in 25 increments
  const steps = [0,25,50,75,100];
  let best = steps[0], bestDist = Infinity;
  for (const s of steps){
    const dist = Math.abs(n - s);
    if (dist < bestDist){ bestDist = dist; best = s; }
  }
  return best;
}

async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

function defaultState(regions){
  const influence = {};
  const notes = {};
  for (const r of regions){
    influence[r.id] = r.defaultInfluence ?? 0;
    notes[r.id] = { bonus100: r.bonus100 ?? "", bonus50: r.bonus50 ?? "" };
  }
  return { version: 1, influence, notes, log: [] };
}

function loadState(regions){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState(regions);

  try{
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return defaultState(regions);

    obj.influence = obj.influence || {};
    obj.notes = obj.notes || {};
    obj.log = Array.isArray(obj.log) ? obj.log : [];

    for (const r of regions){
      if (typeof obj.influence[r.id] !== "number") obj.influence[r.id] = r.defaultInfluence ?? 0;

      if (!obj.notes[r.id]) obj.notes[r.id] = { bonus100: r.bonus100 ?? "", bonus50: r.bonus50 ?? "" };
      if (typeof obj.notes[r.id].bonus100 !== "string") obj.notes[r.id].bonus100 = "";
      if (typeof obj.notes[r.id].bonus50 !== "string") obj.notes[r.id].bonus50 = "";
    }
    return obj;
  }catch{
    return defaultState(regions);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function badgeClass(inf){
  if (inf >= 100) return "good";
  if (inf >= 50) return "warn";
  return "";
}
function influenceLabel(inf){ return `${inf}%`; }

function setStatus(text){
  $("#statusPill").textContent = text;
}

function logEvent(text){
  state.log.unshift({ when: new Date().toISOString(), text });
  state.log = state.log.slice(0, 200);
  saveState();
  renderLog();
}

function renderLog(){
  const host = $("#log");
  host.innerHTML = "";

  for (const e of state.log){
    const div = document.createElement("div");
    div.className = "logItem";

    const top = document.createElement("div");
    top.className = "logTop";

    const what = document.createElement("div");
    what.className = "logWhat";
    what.textContent = e.text;

    const when = document.createElement("div");
    when.className = "logWhen";
    when.textContent = new Date(e.when).toLocaleString();

    top.appendChild(what);
    top.appendChild(when);
    div.appendChild(top);
    host.appendChild(div);
  }
}

function renderRegionList(filter=""){
  const host = $("#regionList");
  host.innerHTML = "";

  const q = filter.trim().toLowerCase();
  const list = regions
    .filter(r => !q || r.name.toLowerCase().includes(q) || (r.tags||[]).some(t => t.toLowerCase().includes(q)))
    .sort((a,b)=>a.name.localeCompare(b.name));

  for (const r of list){
    const inf = state.influence[r.id] ?? 0;

    const row = document.createElement("div");
    row.className = "regionItem" + (selectedId === r.id ? " active" : "");
    row.dataset.id = r.id;

    const left = document.createElement("div");
    left.innerHTML = `<div style="font-weight:900">${r.name}</div><div class="muted">${r.short ?? ""}</div>`;

    const badge = document.createElement("div");
    badge.className = `badge ${badgeClass(inf)}`;
    badge.textContent = influenceLabel(inf);

    row.appendChild(left);
    row.appendChild(badge);

    row.addEventListener("click", () => selectRegion(r.id, "list"));

    host.appendChild(row);
  }
}

function clearOverlayActive(){
  document.querySelectorAll(".regionShape.active").forEach(el => el.classList.remove("active"));
}

function syncOverlayInfluence(){
  for (const r of regions){
    const el = document.querySelector(`.regionShape[data-id="${r.id}"]`);
    if (!el) continue;

    const inf = state.influence[r.id] ?? 0;
    el.setAttribute("data-influence", String(inf >= 100 ? 100 : inf >= 50 ? 50 : 0));
  }
}

function selectRegion(id){
  selectedId = id;

  clearOverlayActive();
  const overlayEl = document.querySelector(`.regionShape[data-id="${id}"]`);
  if (overlayEl) overlayEl.classList.add("active");

  const r = regions.find(x=>x.id===id);
  const inf = state.influence[id] ?? 0;

  $("#selName").textContent = r ? r.name : "—";
  $("#selDesc").textContent = r ? (r.description || r.short || "") : "—";
  $("#selInfluence").textContent = influenceLabel(inf);

  const n = state.notes[id] || { bonus100:"", bonus50:"" };
  $("#selBonus").value = n.bonus100 || "";
  $("#selFoothold").value = n.bonus50 || "";

  setStatus(r ? `Selected: ${r.name}` : "No region selected");

  renderRegionList($("#regionSearch").value || "");
}

function updateInfluence(id, next){
  const r = regions.find(x=>x.id===id);
  if (!r) return;

  const prev = state.influence[id] ?? 0;
  const clamped = clampInfluence(next);

  state.influence[id] = clamped;

  saveState();
  syncOverlayInfluence();
  selectRegion(id);

  if (clamped !== prev){
    logEvent(`${r.name}: ${prev}% → ${clamped}%`);
  }
}

function setupButtons(){
  $("#btnPlus").addEventListener("click", ()=>{
    if (!selectedId) return;
    updateInfluence(selectedId, (state.influence[selectedId] ?? 0) + 25);
  });

  $("#btnMinus").addEventListener("click", ()=>{
    if (!selectedId) return;
    updateInfluence(selectedId, (state.influence[selectedId] ?? 0) - 25);
  });

  $("#btnSet50").addEventListener("click", ()=>{
    if (!selectedId) return;
    updateInfluence(selectedId, 50);
  });

  $("#btnSet100").addEventListener("click", ()=>{
    if (!selectedId) return;
    updateInfluence(selectedId, 100);
  });

  $("#btnSaveNotes").addEventListener("click", ()=>{
    if (!selectedId) return;
    state.notes[selectedId] = {
      bonus100: $("#selBonus").value || "",
      bonus50: $("#selFoothold").value || ""
    };
    saveState();
    $("#saveMsg").textContent = "Saved.";
    setTimeout(()=>$("#saveMsg").textContent="", 1200);
  });

  $("#btnClearLog").addEventListener("click", ()=>{
    state.log = [];
    saveState();
    renderLog();
  });

  $("#btnReset").addEventListener("click", ()=>{
    state = defaultState(regions);
    saveState();

    selectedId = null;
    syncOverlayInfluence();
    renderRegionList("");
    renderLog();

    $("#selName").textContent = "—";
    $("#selDesc").textContent = "Click a region on the map or from the list.";
    $("#selInfluence").textContent = "—";
    $("#selBonus").value = "";
    $("#selFoothold").value = "";

    setStatus("No region selected");
  });

  $("#btnExport").addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "middle-earth-campaign-state.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  });

  $("#btnImport").addEventListener("click", ()=> $("#importFile").click());

  $("#importFile").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if (!file) return;

    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object") throw new Error("Invalid JSON");

      // Build a sane baseline, then merge imported on top.
      const sane = defaultState(regions);
      sane.influence = { ...sane.influence, ...(obj.influence || {}) };
      sane.notes = { ...sane.notes, ...(obj.notes || {}) };
      sane.log = Array.isArray(obj.log) ? obj.log : [];

      state = sane;
      saveState();

      syncOverlayInfluence();
      renderRegionList($("#regionSearch").value||"");
      renderLog();

      if (selectedId) selectRegion(selectedId);
      logEvent("Imported campaign state");
    }catch(err){
      alert("Import failed: " + (err?.message || String(err)));
    }finally{
      e.target.value = "";
    }
  });

  $("#regionSearch").addEventListener("input", (e)=>{
    renderRegionList(e.target.value || "");
  });
}

/** Load PNG map, set overlay viewBox to match image pixel dimensions */
async function loadMapImage(){
  const hint = $("#hint");
  const host = $("#mapSvgHost");

  host.innerHTML = "";

  const img = new Image();
  img.alt = "Middle-earth map";
  img.src = MAP_PATH;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";
  img.style.display = "block";

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(`Failed to load map image at ${MAP_PATH}`));
  });

  host.appendChild(img);

  const overlay = $("#overlay");
  overlay.setAttribute("viewBox", `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
  overlay.setAttribute("preserveAspectRatio", "xMidYMid meet");

  hint.style.display = "none";
  return overlay;
}

function drawOverlay(overlay){
  overlay.innerHTML = "";

  for (const r of regions){
    const isPoly = r.shape?.type === "polygon";
    const shape = document.createElementNS("http://www.w3.org/2000/svg", isPoly ? "polygon" : "rect");

    shape.classList.add("regionShape");
    shape.dataset.id = r.id;

    const inf = state.influence[r.id] ?? 0;
    shape.setAttribute("data-influence", String(inf >= 100 ? 100 : inf >= 50 ? 50 : 0));

    if (isPoly){
      shape.setAttribute(
        "points",
        (r.shape.points || []).map(p => `${p[0]},${p[1]}`).join(" ")
      );
    }else{
      const b = r.shape?.bbox || r.bbox;
      if (!b) continue;
      shape.setAttribute("x", b[0]);
      shape.setAttribute("y", b[1]);
      shape.setAttribute("width", b[2]);
      shape.setAttribute("height", b[3]);
      shape.setAttribute("rx", 8);
      shape.setAttribute("ry", 8);
    }

    shape.addEventListener("click", (e)=>{
      e.stopPropagation();
      selectRegion(r.id);
    });

    overlay.appendChild(shape);
  }

  // click empty map to clear selection
  overlay.addEventListener("click", ()=>{
    selectedId = null;
    clearOverlayActive();
    renderRegionList($("#regionSearch").value || "");

    $("#selName").textContent = "—";
    $("#selDesc").textContent = "Click a region on the map or from the list.";
    $("#selInfluence").textContent = "—";
    $("#selBonus").value = "";
    $("#selFoothold").value = "";

    setStatus("No region selected");
  });
}

async function init(){
  regions = await loadJSON("data/regions.json");
  state = loadState(regions);
  saveState();

  setupButtons();
  renderRegionList("");
  renderLog();

  const overlay = await loadMapImage();
  if (!overlay) return;

  drawOverlay(overlay);
  syncOverlayInfluence();
}

init().catch(err=>{
  console.error(err);
  alert("Startup error: " + (err?.message || String(err)));
});
