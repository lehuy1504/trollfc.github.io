/* ==========================
   DOM
========================== */
const input = document.getElementById("sheetInput");
const preview = document.getElementById("preview");
const btnLoad = document.getElementById("btnLoad");
const btnReset = document.getElementById("btnReset");
const btnLoadExist = document.getElementById("btnLoadExist");
const btnSort = document.getElementById("btnSort");
const btnDraw = document.getElementById("btnDraw");

/* ==========================
   GLOBAL CACHE
========================== */
let gColumns = [];
let gRows = [];
let gDataRows = [];
let gSortDesc = true;

/* ==========================
   UTILS
========================== */
function extractSheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/* ===== FORMAT DATE (GViz SAFE) ===== */
function formatGvizDate(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return value.toLocaleString("vi-VN");
  }

  if (typeof value === "string") {
    const match = value.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (match) {
      const [, y, m, d, h, min, s] = match.map(Number);
      return new Date(y, m, d, h, min, s).toLocaleString("vi-VN");
    }
  }

  return value;
}

/* ==========================
   LOAD DATA
========================== */
async function loadSheetData(loadExist) {
  const sheetId = loadExist
    ? "1Boa0Y5WqqQmxG9qNmNM4j5K_daIwQ9OiUxgE501-mbg"
    : extractSheetId(input.value.trim());

  if (!sheetId) {
    alert("❌ Link Google Sheets không hợp lệ");
    return;
  }

  preview.classList.remove("empty");
  preview.textContent = "⏳ Đang tải dữ liệu...";

  const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed");

    const text = await res.text();
    const json = JSON.parse(
      text.replace(/^[\s\S]*?\(/, "").replace(/\);\s*$/, "")
    );

    gColumns = json.table.cols.map(c => c.label || "");
    gRows = json.table.rows || [];
    gDataRows = buildDataRows(gColumns, gRows);

    renderTable(gDataRows);
  } catch (err) {
    preview.innerHTML = "❌ Không thể đọc dữ liệu từ Google Sheets";
    console.error(err);
  }
}

/* ==========================
   BUILD DATA ROWS + AVG
========================== */
function buildDataRows(columns, rows) {
  const rowCount = rows.length;
  const colCount = columns.length;
  const result = [];

  for (let c = 2; c < colCount; c++) {
    let sum = 0;
    let count = 0;
    const values = [];

    for (let r = 0; r < rowCount; r++) {
      const cell = rows[r].c?.[c];
      values.push(cell);

      if (cell && typeof cell.v === "number") {
        sum += cell.v;
        count++;
      }
    }

    result.push({
      label: columns[c] || "",
      values,
      avg: count > 0 ? sum / count : 0
    });
  }

  return result;
}

/* ==========================
   RENDER TABLE
========================== */
function renderTable(dataRows) {
  if (!dataRows.length) {
    preview.innerHTML = "⚠ Sheet không có dữ liệu";
    return;
  }

  const rowCount = gRows.length;
  let html = `<table class="data-table"><thead><tr>`;

  // Header
  html += `<th>STT</th>`;
  html += `<th></th>`;

  for (let r = 0; r < rowCount; r++) {
    const cell = gRows[r].c?.[1];
    html += `<th>${cell && cell.v != null ? cell.v : ""}</th>`;
  }

  html += `<th>Điểm trung bình</th>`;
  html += `</tr></thead><tbody>`;

  // Body
  dataRows.forEach((row, index) => {
    html += `<tr>`;
    html += `<td class="stt-cell">${index + 1}</td>`;
    html += `<td class="row-header">${row.label}</td>`;

    row.values.forEach(cell => {
      html += `<td>${cell && cell.v != null ? formatGvizDate(cell.v) : ""}</td>`;
    });

    html += `<td class="avg-cell">${row.avg ? row.avg.toFixed(2) : ""}</td>`;
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  preview.innerHTML = html;
}

/* ==========================
   SORT
========================== */
function sortByAverage() {
  if (!gDataRows.length) return;

  gSortDesc = !gSortDesc;
  gDataRows.sort((a, b) =>
    gSortDesc ? b.avg - a.avg : a.avg - b.avg
  );

  btnSort.textContent = gSortDesc
    ? "🔽 Điểm trung bình giảm dần"
    : "🔼 Điểm trung bình tăng dần";

  // ✅ LƯU DANH SÁCH ĐÃ SẮP XẾP
  localStorage.setItem(
    "personList",
    JSON.stringify(gDataRows)
  );

  renderTable(gDataRows);
}

/* ==========================
   RESET
========================== */
function resetData() {
  input.value = "";
  preview.classList.add("empty");
  preview.innerHTML = `
    <p>
      Chưa có dữ liệu<br>
      Hãy nhập link Google Sheets và bấm “Nhập dữ liệu”
    </p>
  `;
}

btnDraw.addEventListener("click", () => {
  const list = JSON.parse(localStorage.getItem("personList"));

  if (!list || !list.length) {
    alert("⚠️ Chưa có danh sách đã sắp xếp");
    return;
  }

  window.location.href = "draw/";
});


/* ==========================
   EVENTS
========================== */
btnLoad.addEventListener("click", () => loadSheetData(false));
btnLoadExist.addEventListener("click", () => loadSheetData(true));
btnReset.addEventListener("click", resetData);
btnSort.addEventListener("click", sortByAverage);
