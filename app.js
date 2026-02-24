/* ==========================
   Estado + helpers
========================== */
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

const state = {
  rows: [],       // items SKU
  days: [],       // [{label, c0}] columna inicio para el día
  lines: [],      // ["LINEA001", ...]
  fileName: ""
};

const fmt  = (n) => (n ?? 0).toLocaleString("es-AR");
const norm = (s) => String(s ?? "").trim();

function toNum(v){
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\./g,"").replace(",",".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function shortDayLabel(dayString){
  const s = String(dayString || "");
  const m = s.match(/(\d{1,2})-([A-Za-z]+)-(\d{4})/);
  if(!m) return s.slice(0, 16);

  const dd = m[1].padStart(2,"0");
  const monName = m[2].toLowerCase();

  const map = {
    january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
    july:"07", august:"08", september:"09", october:"10", november:"11", december:"12"
  };
  const mm = map[monName] || "??";

  const wd = s.split(",")[0]?.trim()?.slice(0,3) || "";
  const wdMap = {Mon:"Lun",Tue:"Mar",Wed:"Mié",Thu:"Jue",Fri:"Vie",Sat:"Sáb",Sun:"Dom"};
  const wdEs = wdMap[wd] || wd;

  return `${wdEs} ${dd}/${mm}`;
}

/* ==========================
   Real por turno (localStorage)
========================== */
const LS_REAL = "plan_real_turnos_v1";
// { "<dayKey>|<linea>|<sku>": {T1:n, T2:n, T3:n} }
function loadRealMap(){
  try { return JSON.parse(localStorage.getItem(LS_REAL) || "{}"); }
  catch { return {}; }
}
function saveRealMap(map){
  localStorage.setItem(LS_REAL, JSON.stringify(map));
}
function makeItemKey(dayLabel, linea, sku){
  return `${dayLabel}|${linea}|${sku}`;
}

// % cumplimiento y clase
function pct(real, plan){
  plan = toNum(plan);
  real = toNum(real);
  if(plan <= 0) return null;
  return (real / plan) * 100;
}
function pctClass(p){
  if(p == null) return "";
  if(p >= 98 && p <= 110) return "ok";
  if(p >= 85) return "warn";
  return "bad";
}
function pctText(p){
  if(p == null) return "—";
  return `${p.toFixed(0)}%`;
}

/* ==========================
   Charts
========================== */
let chartDia = null;
let chartLinea = null;

function renderCharts(){
  const cDia = $("#chartDia");
  const cLin = $("#chartLinea");
  if(!cDia || !cLin) return;

  const dayLabels = state.days.map(d => shortDayLabel(d.label));
  const totalsByDay = state.days.map(d => {
    let sum = 0;
    for (const r of state.rows) sum += (r.byDay?.[d.label]?.Total || 0);
    return sum;
  });

  const totalsByLine = {};
  for (const r of state.rows){
    totalsByLine[r.linea] = (totalsByLine[r.linea] || 0) + (r.tarimasTotal || 0);
  }
  const lineLabels = Object.keys(totalsByLine);
  const lineValues = lineLabels.map(k => totalsByLine[k]);

  if(chartDia) chartDia.destroy();
  chartDia = new Chart(cDia, {
    type: "bar",
    data: { labels: dayLabels, datasets: [{ label: "Tarimas", data: totalsByDay }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,.75)" }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: "rgba(255,255,255,.75)" }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });

  if(chartLinea) chartLinea.destroy();
  chartLinea = new Chart(cLin, {
    type: "doughnut",
    data: { labels: lineLabels, datasets: [{ label: "Tarimas", data: lineValues }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "rgba(255,255,255,.82)" } }
      }
    }
  });
}

/* ==========================
   Filtros
========================== */
function renderFilters(){
  const sel = $("#fLinea");
  if(!sel) return;

  const cur = sel.value || "__ALL__";
  const lines = Array.from(new Set(state.rows.map(r => r.linea))).sort();
  state.lines = lines;

  sel.innerHTML = `<option value="__ALL__">Todas</option>` +
    lines.map(l => `<option value="${l}">${l}</option>`).join("");

  sel.value = lines.includes(cur) ? cur : "__ALL__";
}

function renderDayFilter(){
  const sel = $("#fDia");
  if(!sel) return;

  const cur = sel.value || "__ALL__";
  sel.innerHTML = [`<option value="__ALL__">Todos</option>`]
    .concat(state.days.map((d,i) => `<option value="${i}">${shortDayLabel(d.label)}</option>`))
    .join("");

  if(cur === "__ALL__") sel.value = "__ALL__";
  else{
    const idx = Number(cur);
    sel.value = Number.isFinite(idx) && idx >= 0 && idx < state.days.length ? String(idx) : "__ALL__";
  }
}

function passesFilter2(r){
  const fL = $("#fLinea")?.value ?? "__ALL__";
  const fD = $("#fDia")?.value ?? "__ALL__";
  const q  = norm($("#q")?.value).toLowerCase();

  if (fL !== "__ALL__" && r.linea !== fL) return false;

  if (q){
    const hay = `${r.linea} ${r.producto} ${r.sku}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (fD !== "__ALL__"){
    const idx = Number(fD);
    if (!Number.isFinite(idx) || idx < 0 || idx >= state.days.length) return false;

    const key = state.days[idx].label;
    const dd  = r.byDay?.[key];
    const sum = (dd?.T1||0) + (dd?.T2||0) + (dd?.T3||0) + (dd?.Total||0);
    if (sum <= 0) return false;
  }

  return true;
}

/* ==========================
   Vista principal (cards 3 columnas)
========================== */
function renderTurnoView(){
  const list = $("#turnoView");
  if(!list) return;

  const fD = $("#fDia")?.value ?? "__ALL__";
  const rows = state.rows.filter(passesFilter2);

  if(!rows.length){
    list.innerHTML = `<div class="card">No hay resultados para ese día / filtro.</div>`;
    return;
  }

  if(fD === "__ALL__"){
    list.innerHTML = `
      <div class="card">
        Seleccioná un <b>día</b> para ver los sabores por turno.
      </div>
    `;
    return;
  }

  const idx = Number(fD);
  const dayKey = state.days[idx]?.label;
  if(!dayKey){
    list.innerHTML = `<div class="card">Día inválido. Probá recargar el archivo.</div>`;
    return;
  }

  const getDay = (r) => r.byDay?.[dayKey] || {T1:0,T2:0,T3:0,Total:0};

  function startTurn(dd){
    const t1 = toNum(dd.T1), t2 = toNum(dd.T2), t3 = toNum(dd.T3);
    if (t1 > 0) return 1;
    if (t2 > 0) return 2;
    if (t3 > 0) return 3;
    return 9;
  }

  rows.sort((a,b)=>{
    if (a.linea !== b.linea) return a.linea.localeCompare(b.linea);

    const da = getDay(a);
    const db = getDay(b);
    const sa = startTurn(da);
    const sb = startTurn(db);
    if (sa !== sb) return sa - sb;

    const ta = toNum(da.Total ?? (toNum(da.T1)+toNum(da.T2)+toNum(da.T3)));
    const tb = toNum(db.Total ?? (toNum(db.T1)+toNum(db.T2)+toNum(db.T3)));
    if (tb !== ta) return tb - ta;

    return norm(a.producto).localeCompare(norm(b.producto));
  });

  const realMap = loadRealMap();
  const useAlt = rows.length >= 2;

  list.innerHTML = rows.map((r, i) => {

    const dd = getDay(r);
    const altClass = (useAlt && (i % 2 === 1)) ? "altBg" : "";

    const p1 = toNum(dd.T1), p2 = toNum(dd.T2), p3 = toNum(dd.T3);
    const pTot = toNum(dd.Total ?? (p1+p2+p3));

    const key = makeItemKey(dayKey, r.linea, r.sku);
    const keyEnc = encodeURIComponent(key);

    const real = realMap[key] || {T1:0,T2:0,T3:0};
    const r1 = toNum(real.T1), r2 = toNum(real.T2), r3 = toNum(real.T3);
    const rTot = r1+r2+r3;

    const c1 = pct(r1,p1), c2 = pct(r2,p2), c3 = pct(r3,p3);
    const cTot = pct(rTot, pTot);

    const safeTitle = norm(r.producto) || "(Sin descripción)";

    return `
      <article class="item open"
        data-k="${keyEnc}"
        data-p1="${p1}"
        data-p2="${p2}"
        data-p3="${p3}">

        <div class="itemTop ${altClass}">

          <div class="col">
            <div class="itemTitle">${safeTitle}</div>
            <div class="itemMeta">
              <b>${r.linea}</b> — SKU ${norm(r.sku)} — Día ${shortDayLabel(dayKey)}
            </div>

            <div class="pills" style="margin-top:10px;">
              <span class="pill strong">Plan día: ${fmt(pTot)}</span>
              <span class="pill">T1 ${fmt(p1)}</span>
              <span class="pill">T2 ${fmt(p2)}</span>
              <span class="pill">T3 ${fmt(p3)}</span>
            </div>
          </div>

          <div class="col">
            <div class="colTitle">Real (cajas)</div>
            <div class="miniTable">
              <div class="miniRow">
                <div class="badge">T1</div>
                <input class="inp realInp" inputmode="numeric" type="number" min="0"
                       data-sh="T1" value="${(real.T1 ?? "")}" placeholder="0" />
              </div>
              <div class="miniRow">
                <div class="badge">T2</div>
                <input class="inp realInp" inputmode="numeric" type="number" min="0"
                       data-sh="T2" value="${(real.T2 ?? "")}" placeholder="0" />
              </div>
              <div class="miniRow">
                <div class="badge">T3</div>
                <input class="inp realInp" inputmode="numeric" type="number" min="0"
                       data-sh="T3" value="${(real.T3 ?? "")}" placeholder="0" />
              </div>

              <div class="kpiPill" style="margin-top:6px;">
                <small>Total real</small>
                <div data-total-real>${fmt(rTot)}</div>
              </div>
            </div>
          </div>

          <div class="col">
            <div class="colTitle">Cumplimiento</div>
            <div class="miniTable">
              <div class="kpiPill ${pctClass(c1)}" data-pct-T1>
                <small>T1</small><div>${pctText(c1)}</div>
              </div>
              <div class="kpiPill ${pctClass(c2)}" data-pct-T2>
                <small>T2</small><div>${pctText(c2)}</div>
              </div>
              <div class="kpiPill ${pctClass(c3)}" data-pct-T3>
                <small>T3</small><div>${pctText(c3)}</div>
              </div>

              <div class="kpiPill ${pctClass(cTot)}" data-pct-total style="margin-top:6px;">
                <small>Total día</small><div>${pctText(cTot)}</div>
              </div>
            </div>
          </div>

        </div>
      </article>
    `;
  }).join("");

  // (tu código de listeners queda igual abajo)
}

/* ==========================
   KPIs + renderAll
========================== */
function renderKpis(){
  const k1 = $("#kpiTarimas"), k2 = $("#kpiSkus"), k3 = $("#kpiLineas"), sub = $("#subtitle");
  if(!k1 || !k2 || !k3 || !sub) return;

  const tarimasTotal = state.rows.reduce((a,r) => a + (r.tarimasTotal || 0), 0);
  const skus = state.rows.length;
  const lines = new Set(state.rows.map(r => r.linea)).size;

  k1.textContent = fmt(tarimasTotal);
  k2.textContent = fmt(skus);
  k3.textContent = fmt(lines);

  sub.textContent = state.fileName
    ? `${state.fileName} — ${skus} SKUs`
    : "Cargar Excel para convertir a dashboard";
}

function renderAll(){
  renderKpis();
  renderFilters();
  renderDayFilter();
  renderCharts();
  renderTurnoView();
}

/* ==========================
   Parser Excel (template AR01)
========================== */
function parseWorkbook(wb){
  const sheetName = wb.SheetNames.includes("Production Plan_1")
    ? "Production Plan_1"
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const headerRowIdx = matrix.findIndex(row => {
    const v = norm(row?.[0]).toLowerCase();
    return v === "línea" || v === "linea";
  });
  if(headerRowIdx < 0) throw new Error("No encontré la fila de encabezado 'Línea'.");

  const dateRowIdx = headerRowIdx - 1;
  if(dateRowIdx < 0) throw new Error("No encontré la fila de fechas (arriba de los encabezados).");

  const dateRow = matrix[dateRowIdx] || [];

  // Detecta columnas de día por texto tipo "Friday, 19-September-2025"
  const days = [];
  for(let c=0; c<dateRow.length; c++){
    const s = norm(dateRow[c]);
    if(!s) continue;
    if(/,\s*\d{1,2}-[A-Za-z]+-\d{4}/.test(s) || /\d{1,2}-[A-Za-z]+-\d{4}/.test(s)){
      days.push({ label: s, c0: c });
    }
  }
  if(!days.length) throw new Error("No pude detectar las columnas de fechas.");

  state.days = days;

  const rows = [];
  let currentLinea = "";

  for(let r=headerRowIdx+1; r<matrix.length; r++){
    const row = matrix[r] || [];

    const linea = norm(row[0]);
    const producto = norm(row[1]);
    const sku = row[2];
// ===============================
// Ignorar filas de resumen / separadores
// ===============================
const prodLower = producto.toLowerCase();
const lineaLower = linea.toLowerCase();

// 1) Totales
if (prodLower.includes("total (cajas") ||
    prodLower.includes("total cajas") ||
    prodLower === "total tarimas" ||
    prodLower.includes("total tarimas")) {
  continue;
}

// 2) Filas que solo repiten el nombre de la línea (separadores tipo "LINEA001")
if (!producto && (lineaLower.startsWith("linea") || lineaLower.startsWith("línea")) &&
    (sku == null || norm(sku) === "")) {
  continue;
}

// 3) Cualquier fila sin SKU real (ej: encabezados internos)
const skuStrTmp = norm(sku);
if (!skuStrTmp) {
  // si no hay sku, no es un sabor operable -> se ignora
  continue;
}

    const hasAny = linea || producto || (sku != null && norm(sku) !== "");
    if(!hasAny) continue;

    if(!producto && (sku == null || norm(sku) === "")){
      const tar = toNum(row[3]);
      const anyNums = tar > 0 || days.some(d => toNum(row[d.c0+3]) > 0 || toNum(row[d.c0]) > 0);
      if(!anyNums) break;
    }

    if(linea) currentLinea = linea;
    if(!currentLinea) continue;

    const tarimasTotal = toNum(row[3]);

    const byDay = {};
    for(const d of days){
      byDay[d.label] = {
        T1: toNum(row[d.c0 + 0]),
        T2: toNum(row[d.c0 + 1]),
        T3: toNum(row[d.c0 + 2]),
        Total: toNum(row[d.c0 + 3]),
      };
    }

    const skuStr = norm(sku);
if(!skuStr) continue; // sin SKU, no hay card de sabor

    rows.push({
      linea: currentLinea,
      producto,
      sku: skuStr || "",
      tarimasTotal,
      byDay
    });
  }

  if(!rows.length) throw new Error("No pude construir registros (0 filas).");

  state.rows = rows;
}

/* ==========================
   Eventos (únicos)
========================== */
const fLinea = $("#fLinea");
const fDia   = $("#fDia");
const q      = $("#q");
const file   = $("#file");
const btn    = $("#btnDemo");

// filtros
if (fLinea) fLinea.addEventListener("change", renderTurnoView);
if (fDia)   fDia.addEventListener("change", renderTurnoView);
if (q) q.addEventListener("input", () => {
  clearTimeout(window.__t);
  window.__t = setTimeout(renderTurnoView, 120);
});

// carga de Excel
if (file) file.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  try {
    state.fileName = f.name;
    const sub = $("#subtitle");
    if (sub) sub.textContent = "Leyendo Excel…";

    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });

    parseWorkbook(wb);
    renderAll();
  } catch (err) {
    console.error(err);
    alert(`No pude leer el archivo.\n${err.message || err}`);
  } finally {
    e.target.value = "";
  }
});

// reset
if (btn) btn.addEventListener("click", () => {
  state.rows = [];
  state.days = [];
  state.lines = [];
  state.fileName = "";

  $("#kpiTarimas") && ($("#kpiTarimas").textContent = "—");
  $("#kpiSkus") && ($("#kpiSkus").textContent = "—");
  $("#kpiLineas") && ($("#kpiLineas").textContent = "—");
  $("#subtitle") && ($("#subtitle").textContent = "Cargar Excel para convertir a dashboard");

  $("#turnoView") && ($("#turnoView").innerHTML = "");

  if (fLinea) fLinea.innerHTML = `<option value="__ALL__">Todas</option>`;
  if (fDia)   fDia.innerHTML   = `<option value="__ALL__">Todos</option>`;
  if (q) q.value = "";

  if(chartDia) { chartDia.destroy(); chartDia = null; }
  if(chartLinea){ chartLinea.destroy(); chartLinea = null; }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
