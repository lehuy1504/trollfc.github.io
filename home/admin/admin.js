/* =============================================
   CONFIG
   SHA-256 của mật khẩu admin. Mặc định: "admin"
   Đổi: tính sha256("mật-khẩu-mới") rồi thay hash bên dưới
============================================= */
const ADMIN_HASH = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";

/* =============================================
   STATE
============================================= */
let sheetData = []; // mảng 2 chiều: [row][col]
let headers = [];   // dòng đầu tiên của sheet

/* =============================================
   SHA-256
============================================= */
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* =============================================
   GATE – XÁC THỰC MẬT KHẨU
============================================= */
const gateInput  = document.getElementById("gateInput");
const gateError  = document.getElementById("gateError");
const gateSubmit = document.getElementById("gateSubmit");
const gateToggle = document.getElementById("gateToggle");

async function checkGate() {
  const hash = await sha256(gateInput.value.trim());
  if (hash === ADMIN_HASH) {
    document.getElementById("gate").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    loadSetup();
  } else {
    gateError.textContent = "❌ Mật khẩu không đúng";
    setTimeout(() => { gateError.textContent = ""; }, 2000);
  }
}

gateSubmit.addEventListener("click", checkGate);
gateInput.addEventListener("keydown", e => { if (e.key === "Enter") checkGate(); });
gateToggle.addEventListener("click", function () {
  const hidden = gateInput.type === "password";
  gateInput.type = hidden ? "text" : "password";
  this.textContent = hidden ? "🙈" : "🙉";
});

/* =============================================
   SETUP – LƯU / TẢI CÀI ĐẶT
============================================= */
function loadSetup() {
  document.getElementById("scriptUrl").value   = localStorage.getItem("adminScriptUrl")   || "";
  document.getElementById("scriptToken").value = localStorage.getItem("adminScriptToken") || "";
}

document.getElementById("btnSaveSetup").addEventListener("click", () => {
  const url   = document.getElementById("scriptUrl").value.trim();
  const token = document.getElementById("scriptToken").value.trim();
  localStorage.setItem("adminScriptUrl",   url);
  localStorage.setItem("adminScriptToken", token);
  showStatus("✅ Đã lưu cài đặt!", "success");
});

/* =============================================
   API – GỌI APPS SCRIPT
============================================= */
async function api(params) {
  const url   = localStorage.getItem("adminScriptUrl");
  const token = localStorage.getItem("adminScriptToken");

  if (!url || !token) {
    showStatus("⚠️ Chưa nhập Apps Script URL và token — hãy lưu cài đặt trước", "error");
    return null;
  }

  try {
    const fullUrl = new URL(url);
    fullUrl.searchParams.set("token", token);
    for (const [k, v] of Object.entries(params)) {
      fullUrl.searchParams.set(k, String(v));
    }

    const res = await fetch(fullUrl.toString(), { redirect: "follow", credentials: "omit" });
    return await res.json();
  } catch (err) {
    showStatus("❌ Lỗi kết nối: " + err.message, "error");
    return null;
  }
}

/* =============================================
   TẢI DỮ LIỆU
============================================= */
document.getElementById("btnLoad").addEventListener("click", loadData);

async function loadData() {
  showStatus("⏳ Đang tải dữ liệu...", "info");
  const result = await api({ action: "read" });

  if (!result) return;
  if (!result.ok) {
    showStatus("❌ " + (result.error || "Lỗi không xác định"), "error");
    return;
  }

  sheetData = result.data || [];
  headers   = sheetData[0] || [];
  renderTable();

  const count = Math.max(0, sheetData.length - 1);
  showStatus(`✅ Đã tải ${count} dòng dữ liệu`, "success");
}

/* =============================================
   RENDER TABLE
============================================= */
function renderTable() {
  const container = document.getElementById("dataContainer");
  const badge     = document.getElementById("rowCount");

  if (sheetData.length <= 1) {
    container.innerHTML = `<p class="empty-msg">Sheet chưa có dữ liệu chấm điểm nào.</p>`;
    badge.style.display = "none";
    return;
  }

  const dataRows = sheetData.slice(1);
  badge.textContent = dataRows.length + " dòng";
  badge.style.display = "inline";

  let html = `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th class="stt">STT</th>
          ${headers.map(h => `<th>${escHtml(String(h))}</th>`).join("")}
          <th>Xóa</th>
        </tr></thead>
        <tbody>
  `;

  dataRows.forEach((row, rIdx) => {
    const sheetRow = rIdx + 2; // 1-based, bỏ qua header
    html += `<tr>`;
    html += `<td class="stt">${rIdx + 1}</td>`;

    row.forEach((cell, cIdx) => {
      const sheetCol = cIdx + 1;
      const isTimestamp = cIdx === 0;

      if (isTimestamp) {
        html += `<td class="ts-cell">${escHtml(String(cell ?? ""))}</td>`;
      } else {
        html += `<td
          class="editable"
          contenteditable="true"
          data-row="${sheetRow}"
          data-col="${sheetCol}"
          data-original="${escAttr(String(cell ?? ""))}"
        >${escHtml(String(cell ?? ""))}</td>`;
      }
    });

    html += `<td><button class="btn-del" data-row="${sheetRow}">−</button></td>`;
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;

  // Gắn event: lưu khi blur
  container.querySelectorAll(".editable").forEach(cell => {
    cell.addEventListener("blur",    handleCellBlur);
    cell.addEventListener("keydown", handleCellKeydown);
  });

  // Gắn event: xóa dòng
  container.querySelectorAll(".btn-del").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteRow(parseInt(btn.dataset.row)));
  });
}

/* =============================================
   CHỈNH SỬA Ô
============================================= */
async function handleCellBlur(e) {
  const cell   = e.target;
  const newVal = cell.textContent.trim();
  const oldVal = cell.dataset.original;

  if (newVal === oldVal) return;

  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);

  cell.classList.add("saving");
  const result = await api({ action: "update_cell", row, col, value: newVal });
  cell.classList.remove("saving");

  if (result?.ok) {
    cell.dataset.original = newVal;
    cell.classList.add("saved");
    setTimeout(() => cell.classList.remove("saved"), 1500);
    sheetData[row - 1][col - 1] = newVal;
  } else {
    cell.textContent = oldVal;
    showStatus("❌ Lỗi khi lưu ô dữ liệu", "error");
  }
}

function handleCellKeydown(e) {
  const cell = e.target;
  if (e.key === "Enter") {
    e.preventDefault();
    cell.blur();
  }
  if (e.key === "Escape") {
    cell.textContent = cell.dataset.original;
    cell.blur();
  }
}

/* =============================================
   XÓA DÒNG
============================================= */
async function handleDeleteRow(sheetRow) {
  const label = sheetRow - 1;
  if (!confirm(`Xóa dòng số ${label}?`)) return;

  showStatus("⏳ Đang xóa...", "info");
  const result = await api({ action: "delete_row", row: sheetRow });

  if (result?.ok) {
    showStatus("✅ Đã xóa dòng " + label, "success");
    await loadData();
  } else {
    showStatus("❌ Lỗi khi xóa dòng: " + (result?.error || ""), "error");
  }
}

/* =============================================
   XÓA TOÀN BỘ
============================================= */
document.getElementById("btnClear").addEventListener("click", async () => {
  if (!confirm("⚠️ Xóa TOÀN BỘ dữ liệu trong sheet?\nHành động này KHÔNG THỂ hoàn tác!")) return;
  if (!confirm("Xác nhận lần 2: xóa hết dữ liệu?")) return;

  showStatus("⏳ Đang xóa...", "info");
  const result = await api({ action: "clear" });

  if (result?.ok) {
    sheetData = [headers];
    renderTable();
    showStatus("✅ Đã xóa toàn bộ dữ liệu", "success");
  } else {
    showStatus("❌ Lỗi: " + (result?.error || ""), "error");
  }
});

/* =============================================
   THÊM DÒNG THỦ CÔNG
============================================= */
document.getElementById("btnAddRow").addEventListener("click", () => {
  buildAddForm();
  document.getElementById("addModal").style.display = "flex";
});

document.getElementById("btnCancelAdd").addEventListener("click", () => {
  document.getElementById("addModal").style.display = "none";
});

window.addEventListener("click", e => {
  const modal = document.getElementById("addModal");
  if (e.target === modal) modal.style.display = "none";
});

function buildAddForm() {
  const form = document.getElementById("addForm");

  if (!headers.length) {
    form.innerHTML = `<p style="color:#888;font-size:14px">Hãy tải dữ liệu trước để biết cột.</p>`;
    return;
  }

  // headers[0] = Timestamp (bỏ qua, tự sinh), headers[1] = tên người chấm, [2+] = tên cầu thủ
  const fields = headers.slice(1);
  form.innerHTML = fields.map((h, i) => `
    <div class="form-field">
      <label>${escHtml(String(h))}</label>
      <input
        class="add-input"
        type="${i === 0 ? "text" : "number"}"
        placeholder="${escAttr(String(h))}"
        ${i > 0 ? 'min="0" max="10" step="0.5"' : ""}
      />
    </div>
  `).join("");
}

document.getElementById("btnConfirmAdd").addEventListener("click", async () => {
  const inputs = document.querySelectorAll("#addForm .add-input");
  const values = [...inputs].map(inp => inp.value.trim());

  if (!values[0]) {
    alert("Nhập tên người chấm điểm!");
    return;
  }

  showStatus("⏳ Đang thêm...", "info");
  const result = await api({ action: "add_row", values: JSON.stringify(values) });

  if (result?.ok) {
    document.getElementById("addModal").style.display = "none";
    showStatus("✅ Đã thêm dòng mới", "success");
    await loadData();
  } else {
    showStatus("❌ Lỗi khi thêm: " + (result?.error || ""), "error");
  }
});

/* =============================================
   QUẢN LÝ FORM
============================================= */
let formItems = [];

document.getElementById("btnLoadForm").addEventListener("click", loadForm);

function rebuildIndices() {
  formItems.forEach((item, i) => { item.index = i; });
}

async function loadForm() {
  showStatus("⏳ Đang tải form...", "info");
  const result = await api({ action: "get_form" });

  if (!result?.ok) {
    showStatus("❌ " + (result?.error || "Không tải được form"), "error");
    return;
  }

  formItems = result.items || [];
  renderFormItems();
  showStatus(`✅ Đã tải ${formItems.length} câu hỏi`, "success");
}

function renderFormItems() {
  const container = document.getElementById("formContainer");

  if (!formItems.length) {
    container.innerHTML = `<p class="empty-msg">Form không có câu hỏi nào.</p>`;
    return;
  }

  const players = formItems.filter(i => i.index > 0);

  let html = `<div class="form-items-list">
    <div class="select-bar">
      <label class="select-all-label">
        <input type="checkbox" id="checkAll"/> Chọn tất cả
      </label>
      <button id="btnDeleteSelected" class="btn danger small" disabled>🗑 Xóa đã chọn (0)</button>
    </div>`;

  // Dòng đầu: tên người chấm — khoá
  const nameItem = formItems[0];
  html += `
    <div class="form-item locked">
      <span style="width:15px"></span>
      <span class="lock-icon">🔒</span>
      <span class="item-title">${escHtml(nameItem.title)}</span>
      <span class="item-badge">Tên người chấm — không đổi</span>
    </div>`;

  // Các cầu thủ
  players.forEach(item => {
    html += `
      <div class="form-item" data-index="${item.index}">
        <input type="checkbox" class="item-check" data-index="${item.index}"/>
        <input
          class="item-input"
          type="text"
          value="${escAttr(item.title)}"
          data-index="${item.index}"
          data-original="${escAttr(item.title)}"
          placeholder="Tên cầu thủ..."
        />
        <button class="btn-save-item btn ghost small" data-index="${item.index}">💾</button>
        <button class="btn-del-item btn danger small" data-index="${item.index}">🗑</button>
      </div>`;
  });

  html += `</div>`;
  container.innerHTML = html;

  // Chọn tất cả
  const checkAll = container.querySelector("#checkAll");
  const btnDeleteSelected = container.querySelector("#btnDeleteSelected");

  function updateDeleteBtn() {
    const checked = container.querySelectorAll(".item-check:checked");
    btnDeleteSelected.disabled = checked.length === 0;
    btnDeleteSelected.textContent = `🗑 Xóa đã chọn (${checked.length})`;
    checkAll.indeterminate = checked.length > 0 && checked.length < players.length;
    checkAll.checked = checked.length === players.length && players.length > 0;
  }

  checkAll.addEventListener("change", () => {
    container.querySelectorAll(".item-check").forEach(cb => {
      cb.checked = checkAll.checked;
      cb.closest(".form-item").classList.toggle("selected", checkAll.checked);
    });
    updateDeleteBtn();
  });

  container.querySelectorAll(".item-check").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.closest(".form-item").classList.toggle("selected", cb.checked);
      updateDeleteBtn();
    });
  });

  // Xóa nhiều — optimistic update
  btnDeleteSelected.addEventListener("click", async () => {
    const checked = [...container.querySelectorAll(".item-check:checked")];
    const indices = checked.map(cb => parseInt(cb.dataset.index));
    const names   = indices.map(idx => formItems.find(i => i.index === idx)?.title).join(", ");

    if (!confirm(`Xóa ${indices.length} cầu thủ:\n${names}?`)) return;

    const originalIndices = [...indices]; // lưu trước khi rebuild

    // Cập nhật UI ngay, không chờ server
    formItems = formItems.filter(i => !indices.includes(i.index));
    rebuildIndices();
    renderFormItems();
    showStatus(`⏳ Đang xóa ${originalIndices.length} cầu thủ...`, "info");

    const result = await api({ action: "delete_questions", indices: JSON.stringify(originalIndices) });
    if (result?.ok) {
      showStatus(`✅ Đã xóa ${originalIndices.length} cầu thủ`, "success");
    } else {
      showStatus("❌ batch delete lỗi: " + JSON.stringify(result), "error");
      await loadForm();
    }
  });

  // Lưu từng ô
  container.querySelectorAll(".btn-save-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx   = parseInt(btn.dataset.index);
      const input = container.querySelector(`.item-input[data-index="${idx}"]`);
      handleUpdateQuestion(idx, input.value.trim());
    });
  });

  // Xóa từng ô
  container.querySelectorAll(".btn-del-item").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteQuestion(parseInt(btn.dataset.index)));
  });

  // Enter để lưu
  container.querySelectorAll(".item-input").forEach(input => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") handleUpdateQuestion(parseInt(input.dataset.index), input.value.trim());
    });
  });
}

async function handleUpdateQuestion(index, newTitle) {
  if (!newTitle) return;

  showStatus("⏳ Đang cập nhật...", "info");
  const result = await api({ action: "update_question", index, title: newTitle });

  if (result?.ok) {
    const item = formItems.find(i => i.index === index);
    if (item) item.title = newTitle;
    const input = document.querySelector(`.item-input[data-index="${index}"]`);
    if (input) {
      input.dataset.original = newTitle;
      input.classList.add("saved");
      setTimeout(() => input.classList.remove("saved"), 1500);
    }
    showStatus(`✅ Đã đổi tên thành "${newTitle}"`, "success");
  } else {
    showStatus("❌ Lỗi: " + (result?.error || ""), "error");
  }
}

async function handleDeleteQuestion(index) {
  const item = formItems.find(i => i.index === index);
  if (!confirm(`Xóa cầu thủ "${item?.title}" khỏi form?`)) return;

  // Cập nhật UI ngay
  formItems = formItems.filter(i => i.index !== index);
  rebuildIndices();
  renderFormItems();
  showStatus(`⏳ Đang xóa "${item?.title}"...`, "info");

  const originalIndex = item.index; // lưu trước khi rebuild
  const result = await api({ action: "delete_questions", indices: JSON.stringify([originalIndex]) });
  if (result?.ok) {
    showStatus(`✅ Đã xóa "${item?.title}"`, "success");
  } else {
    showStatus("❌ delete lỗi: " + JSON.stringify(result), "error");
    await loadForm();
  }
}

// Thêm cầu thủ mới
document.getElementById("btnAddPlayer").addEventListener("click", () => {
  document.getElementById("addPlayerRow").style.display = "flex";
  document.getElementById("newPlayerInput").focus();
});

document.getElementById("btnCancelPlayer").addEventListener("click", () => {
  document.getElementById("addPlayerRow").style.display = "none";
  document.getElementById("newPlayerInput").value = "";
});

document.getElementById("btnConfirmPlayer").addEventListener("click", handleAddPlayer);
document.getElementById("newPlayerInput").addEventListener("keydown", e => {
  if (e.key === "Enter")  handleAddPlayer();
  if (e.key === "Escape") document.getElementById("btnCancelPlayer").click();
});

async function handleAddPlayer() {
  const input = document.getElementById("newPlayerInput");
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  // Ẩn form nhập ngay
  input.value = "";
  document.getElementById("addPlayerRow").style.display = "none";
  showStatus(`⏳ Đang thêm "${name}"...`, "info");

  const result = await api({ action: "add_question", title: name });
  if (result?.ok) {
    showStatus(`✅ Đã thêm "${name}"`, "success");
    await loadForm(); // cần reload để lấy ID mới
  } else {
    showStatus("❌ Lỗi: " + (result?.error || ""), "error");
  }
}

/* =============================================
   HƯỚNG DẪN + COPY SCRIPT
============================================= */
document.getElementById("btnToggleGuide").addEventListener("click", function () {
  const content = document.getElementById("guideContent");
  const hidden  = content.style.display === "none";
  content.style.display = hidden ? "block" : "none";
  this.textContent = hidden ? "▲ Ẩn" : "▼ Xem";
});

document.getElementById("btnCopyScript").addEventListener("click", function () {
  const code = document.getElementById("scriptCode").textContent;
  navigator.clipboard.writeText(code).then(() => {
    this.textContent = "✅ Đã copy!";
    setTimeout(() => { this.textContent = "📋 Copy code"; }, 2500);
  });
});

/* =============================================
   UTILS
============================================= */
function showStatus(msg, type = "info") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className   = "status " + type;
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
