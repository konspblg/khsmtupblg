/* ============================================================
   DASHBOARD LEGACY — KHS MTU 2018 / 2021 / 2023
   Dipanggil setelah DASHBOARD_CONFIG didefinisikan di HTML.

   DASHBOARD_CONFIG = {
     sheetId   : string   — Google Sheets ID
     gid       : string   — tab GID
     year      : number   — tahun (2018/2021/2023)
     title     : string   — judul halaman
     // Kolom (0-based index):
     jumlahIdx : number   — kolom Jumlah MTU
     statusIdx : number   — kolom Status Pasang (SUDAH/BELUM/BURSA)
     filterIdx : number|null — kolom filter SCM (null = tidak ada filter)
     filterVal : string|null — nilai filter (misal 'SCM')
     // Kolom tabel (semua kolom sebelum "Keterangan Pasang" + keterangan):
     tableUntilIdx : number — tampilkan kolom 0..tableUntilIdx di tabel
   }
============================================================ */

const SHEET_URL_LEGACY =
  `https://docs.google.com/spreadsheets/d/${DASHBOARD_CONFIG.sheetId}/gviz/tq?tqx=out:json&gid=${DASHBOARD_CONFIG.gid}`;

const ROWS_PER_PAGE_L = 25;

let allDataL = [], filteredDataL = [], columnsL = [], displayColumnsL = [];
let currentPageL = 1, sortColumnL = null, sortDirectionL = 'asc';
let tableModeL = 'total';

/* ============================================================
   FETCH & PARSE
============================================================ */
async function loadDataLegacy() {
  showLoading(true);
  try {
    const res = await fetch(SHEET_URL_LEGACY);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const j = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!j.table) throw new Error('Format tidak sesuai');

    parseDataLegacy(j.table);
    initDashboardLegacy();
    showLoading(false);
  } catch (err) {
    console.error(err);
    showLoading(false, err.message);
  }
}

function parseDataLegacy(table) {
  columnsL = table.cols.map((c, i) => c.label || c.id || `Kolom ${i + 1}`);

  let rows = table.rows.map(r => {
    const o = {};
    r.c.forEach((cell, i) => {
      let v = '';
      if (cell) {
        if (cell.f != null) v = cell.f;
        else if (cell.v != null) v = cell.v;
      }
      o[columnsL[i]] = v;
    });
    return o;
  }).filter(r => Object.values(r).some(v => v !== '' && v !== null));

  // Filter SCM kalau ada
  if (DASHBOARD_CONFIG.filterIdx != null) {
    const fcol = columnsL[DASHBOARD_CONFIG.filterIdx];
    const fval = (DASHBOARD_CONFIG.filterVal || '').toUpperCase();
    rows = rows.filter(r => String(r[fcol] || '').trim().toUpperCase() === fval);
  }

  allDataL = rows;
  filteredDataL = [...allDataL];

  // Kolom tampil di tabel: 0 sampai tableUntilIdx (inklusif)
  displayColumnsL = columnsL.slice(0, DASHBOARD_CONFIG.tableUntilIdx + 1);
}

/* ============================================================
   INIT
============================================================ */
function initDashboardLegacy() {
  populateFilterL();
  renderStatsL();
  renderTableL();
  attachListenersL();
  setupSidebar();
  setupScrollTopButtonL();
}

/* ============================================================
   STAT CARDS
   - Total MTU   : SUM kolom jumlahIdx (semua baris)
   - Terpasang   : SUM kolom jumlahIdx untuk baris STATUS = SUDAH
   - Belum       : SUM kolom jumlahIdx untuk baris STATUS = BELUM
   - Bursa       : SUM kolom jumlahIdx untuk baris STATUS = BURSA (hanya 2023)
============================================================ */
function getStats(data) {
  const jCol = columnsL[DASHBOARD_CONFIG.jumlahIdx];
  const sCol = columnsL[DASHBOARD_CONFIG.statusIdx];
  let total = 0, terpasang = 0, belum = 0, bursa = 0;
  data.forEach(r => {
    const n = toNumL(r[jCol]);
    total += n;
    const st = String(r[sCol] || '').trim().toLowerCase();
    if (st === 'sudah') terpasang += n;
    else if (st === 'bursa') bursa += n;
    else belum += n;
  });
  return { total, terpasang, belum, bursa };
}

function toNumL(v) {
  const n = parseFloat(String(v || '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function renderStatsL() {
  const stats = getStats(filteredDataL);

  document.getElementById('statTotal').textContent = stats.total.toLocaleString('id-ID');
  document.getElementById('statTerpasang').textContent = stats.terpasang.toLocaleString('id-ID');
  document.getElementById('statBelum').textContent = stats.belum.toLocaleString('id-ID');

  // Baris bursa hanya tampil untuk 2023
  const bursaWrap = document.getElementById('statBursaWrap');
  if (bursaWrap) {
    if (DASHBOARD_CONFIG.year === 2023) {
      bursaWrap.style.display = '';
      document.getElementById('statBursa').textContent = stats.bursa.toLocaleString('id-ID');
    } else {
      bursaWrap.style.display = 'none';
    }
  }
}

/* ============================================================
   TABLE MODE (Total / Terpasang / Belum)
============================================================ */
function getTableDataL() {
  const sCol = columnsL[DASHBOARD_CONFIG.statusIdx];
  const jCol = columnsL[DASHBOARD_CONFIG.jumlahIdx];

  if (tableModeL === 'terpasang') {
    return filteredDataL.filter(r =>
      String(r[sCol] || '').trim().toLowerCase() === 'sudah');
  }
  if (tableModeL === 'belum') {
    return filteredDataL.filter(r => {
      const st = String(r[sCol] || '').trim().toLowerCase();
      return st === 'belum' || st === 'bursa';
    });
  }
  return filteredDataL;
}

function updateToggleCountsL() {
  const stats = getStats(filteredDataL);
  document.getElementById('ttbCountTotalL').textContent = stats.total.toLocaleString('id-ID');
  document.getElementById('ttbCountTerpasangL').textContent = stats.terpasang.toLocaleString('id-ID');
  document.getElementById('ttbCountBelumL').textContent = (stats.belum + stats.bursa).toLocaleString('id-ID');
}

/* ============================================================
   FILTER (Gardu Induk + Jenis MTU + Status Pasang)
============================================================ */
let colGIL, colJenisMTUL, colStatusL;

function populateFilterL() {
  const lower = columnsL.map(c => String(c).toLowerCase());
  colGIL = findColL(lower, ['gardu induk', 'gi']);
  colJenisMTUL = findColL(lower, ['jenis mtu', 'jenis']);
  colStatusL = columnsL[DASHBOARD_CONFIG.statusIdx];

  fillSelectL('filterGIL', colGIL, 'Semua GI');
  fillSelectL('filterJenisMTUL', colJenisMTUL, 'Semua Jenis MTU');
  fillSelectL('filterStatusL', colStatusL, 'Semua Status');
}

function findColL(lower, keywords) {
  for (const kw of keywords) {
    const idx = lower.findIndex(c => c.includes(kw));
    if (idx !== -1) return columnsL[idx];
  }
  return null;
}

function fillSelectL(selectId, colName, defaultLabel) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="" class="default-opt">${defaultLabel}</option>`;
  if (!colName) { sel.disabled = true; return; }
  sel.disabled = false;
  sel.dataset.column = colName;
  const vals = [...new Set(allDataL.map(r => r[colName]).filter(v => v !== '' && v != null))]
    .sort((a, b) => String(a).localeCompare(String(b), 'id'));
  vals.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

function applyFiltersL() {
  const giVal = document.getElementById('filterGIL')?.value || '';
  const jenisMTUVal = document.getElementById('filterJenisMTUL')?.value || '';
  const statusVal = document.getElementById('filterStatusL')?.value || '';

  filteredDataL = allDataL.filter(r => {
    if (giVal && colGIL && r[colGIL] !== giVal) return false;
    if (jenisMTUVal && colJenisMTUL && r[colJenisMTUL] !== jenisMTUVal) return false;
    if (statusVal && r[colStatusL] !== statusVal) return false;
    return true;
  });

  currentPageL = 1;
  renderStatsL();
  renderTableL();
}

/* ============================================================
   TABEL
============================================================ */
function renderTableL() {
  const headerRow = document.getElementById('tableHeaderRowL');
  const tbody = document.getElementById('tableBodyL');

  // Header (render sekali)
  if (headerRow.children.length === 0) {
    displayColumnsL.forEach(col => {
      const th = document.createElement('th');
      th.innerHTML = `${col}<span class="sort-icon">↕</span>`;
      th.dataset.column = col;
      th.addEventListener('click', () => handleSortL(col));
      headerRow.appendChild(th);
    });
  }

  // Update sort icon
  Array.from(headerRow.children).forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.column === sortColumnL) {
      th.classList.add(sortDirectionL === 'asc' ? 'sort-asc' : 'sort-desc');
      icon.textContent = sortDirectionL === 'asc' ? '↑' : '↓';
    } else { icon.textContent = '↕'; }
  });

  // Update toggle counts
  updateToggleCountsL();

  const tableData = getTableDataL();
  const start = (currentPageL - 1) * ROWS_PER_PAGE_L;
  const end = start + ROWS_PER_PAGE_L;
  const pageData = tableData.slice(start, end);

  tbody.innerHTML = '';
  const sCol = colStatusL;

  pageData.forEach(row => {
    const tr = document.createElement('tr');
    const st = String(row[sCol] || '').trim().toLowerCase();
    if (st === 'bursa' || st === 'belum') tr.classList.add('highlight-warning');

    // Klik baris = highlight
    tr.addEventListener('click', () => {
      const was = tr.classList.contains('row-selected');
      tbody.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      if (!was) tr.classList.add('row-selected');
    });

    displayColumnsL.forEach(col => {
      const td = document.createElement('td');
      const val = row[col];
      td.textContent = (val === '' || val == null) ? '-' : val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const total = tableData.length;
  document.getElementById('tableInfoL').textContent =
    `Menampilkan ${total === 0 ? 0 : start + 1}-${Math.min(end, total)} dari ${total} data`;
  const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE_L));
  document.getElementById('paginationInfoL').textContent = `Halaman ${currentPageL} dari ${totalPages}`;
  document.getElementById('prevPageL').disabled = currentPageL === 1;
  document.getElementById('nextPageL').disabled = currentPageL >= totalPages;
}

function handleSortL(col) {
  if (sortColumnL === col) sortDirectionL = sortDirectionL === 'asc' ? 'desc' : 'asc';
  else { sortColumnL = col; sortDirectionL = 'asc'; }

  filteredDataL.sort((a, b) => {
    const va = a[col], vb = b[col];
    // Coba parse tanggal
    const da = parseIndoDateL(va), db = parseIndoDateL(vb);
    if (da !== null && db !== null) return sortDirectionL === 'asc' ? da - db : db - da;
    if (da !== null) return sortDirectionL === 'asc' ? -1 : 1;
    if (db !== null) return sortDirectionL === 'asc' ? 1 : -1;
    // Angka
    const na = parseFloat(String(va).replace(/[^\d.-]/g, ''));
    const nb = parseFloat(String(vb).replace(/[^\d.-]/g, ''));
    if (!isNaN(na) && !isNaN(nb)) return sortDirectionL === 'asc' ? na - nb : nb - na;
    // String
    const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
    return sortDirectionL === 'asc' ? sa.localeCompare(sb, 'id') : sb.localeCompare(sa, 'id');
  });

  currentPageL = 1;
  renderTableL();
}

/* ============================================================
   DATE PARSER (sama dengan dashboard.js utama)
============================================================ */
const ID_MONTHS_L = {
  jan:0, januari:0, feb:1, februari:1, mar:2, maret:2,
  apr:3, april:3, mei:4, jun:5, juni:5, jul:6, juli:6,
  agu:7, agt:7, ags:7, agustus:7, sep:8, sept:8, september:8,
  okt:9, oct:9, oktober:9, nov:10, november:10, des:11, dec:11, desember:11
};
function parseIndoDateL(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m1 = s.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2,4})/);
  if (m1) {
    const key = m1[2].toLowerCase().replace(/\./g, '');
    if (ID_MONTHS_L.hasOwnProperty(key)) {
      const y = parseInt(m1[3]); const yr = y < 100 ? 2000 + y : y;
      const d = new Date(yr, ID_MONTHS_L[key], parseInt(m1[1]));
      if (!isNaN(d)) return d.getTime();
    }
  }
  const m2 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m2) {
    const yr = parseInt(m2[3]); const y = yr < 100 ? 2000 + yr : yr;
    const d = new Date(y, parseInt(m2[2]) - 1, parseInt(m2[1]));
    if (!isNaN(d)) return d.getTime();
  }
  const m3 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m3) {
    const d = new Date(parseInt(m3[1]), parseInt(m3[2]) - 1, parseInt(m3[3]));
    if (!isNaN(d)) return d.getTime();
  }
  return null;
}

/* ============================================================
   COPY DATA
============================================================ */
function copyDataLegacy(btnEl) {
  const data = getTableDataL();
  const lines = [displayColumnsL.join('\t')];
  data.forEach(row => {
    lines.push(displayColumnsL.map(c => {
      const v = row[c];
      return (v == null || v === '') ? '' : String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    }).join('\t'));
  });
  const tsv = lines.join('\n');
  const show = () => {
    if (!btnEl) return;
    const orig = btnEl.innerHTML;
    btnEl.classList.add('copied'); btnEl.innerHTML = '✓ Tersalin';
    setTimeout(() => { btnEl.classList.remove('copied'); btnEl.innerHTML = orig; }, 2000);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(tsv).then(show).catch(() => fallbackCopyL(tsv, show));
  } else { fallbackCopyL(tsv, show); }
}
function fallbackCopyL(text, onDone) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); if (onDone) onDone(); } catch(e) {}
  document.body.removeChild(ta);
}

/* ============================================================
   LISTENERS
============================================================ */
function attachListenersL() {
  document.getElementById('filterGIL')?.addEventListener('change', applyFiltersL);
  document.getElementById('filterJenisMTUL')?.addEventListener('change', applyFiltersL);
  document.getElementById('filterStatusL')?.addEventListener('change', applyFiltersL);

  document.getElementById('resetFiltersL')?.addEventListener('click', () => {
    ['filterGIL','filterJenisMTUL','filterStatusL'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    applyFiltersL();
  });

  // Toggle tabel mode
  document.querySelectorAll('.table-toggle-btn-l').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === tableModeL) return;
      tableModeL = mode;
      document.querySelectorAll('.table-toggle-btn-l').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
      currentPageL = 1;
      renderTableL();
    });
  });

  document.getElementById('prevPageL')?.addEventListener('click', () => {
    if (currentPageL > 1) { currentPageL--; renderTableL(); }
  });
  document.getElementById('nextPageL')?.addEventListener('click', () => {
    const totalPages = Math.ceil(getTableDataL().length / ROWS_PER_PAGE_L);
    if (currentPageL < totalPages) { currentPageL++; renderTableL(); }
  });

  document.getElementById('refreshBtnL')?.addEventListener('click', loadDataLegacy);
  document.getElementById('copyTableBtnL')?.addEventListener('click', e => copyDataLegacy(e.currentTarget));
}

/* ============================================================
   SIDEBAR (sama persis dengan dashboard.js utama)
============================================================ */
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const openBtn = document.getElementById('hamburgerBtn');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  if (!sidebar || !backdrop || !openBtn) return;

  function open() {
    sidebar.classList.add('open');
    backdrop.classList.add('visible');
    sidebar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  function close() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('visible');
    sidebar.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  sidebar.querySelectorAll('.sidebar-link').forEach(a => {
    a.addEventListener('click', () => setTimeout(close, 50));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
  });
}

/* ============================================================
   DARK MODE
============================================================ */
const themeToggleLegacy = document.getElementById('themeToggle');
function applyThemeLegacy(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggleLegacy) themeToggleLegacy.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}
applyThemeLegacy(localStorage.getItem('theme') || 'light');
if (themeToggleLegacy) {
  themeToggleLegacy.addEventListener('click', () => {
    const next = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    applyThemeLegacy(next); localStorage.setItem('theme', next);
  });
}

/* ============================================================
   SCROLL TO TOP
============================================================ */
function setupScrollTopButtonL() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  let ticking = false;
  function update() {
    btn.classList.toggle('visible', window.scrollY > 300);
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  update();
}

/* ============================================================
   LOADING STATE
============================================================ */
function showLoading(isLoading, errMsg) {
  document.getElementById('loadingL').classList.toggle('hidden', !isLoading);
  document.getElementById('errorL').classList.toggle('hidden', isLoading || !errMsg);
  document.getElementById('dashboardL').classList.toggle('hidden', isLoading || !!errMsg);
  if (errMsg) document.getElementById('errorMsgL').textContent =
    `${errMsg}. Pastikan spreadsheet sudah di-share "Anyone with the link".`;
}

/* ============================================================
   START
============================================================ */
loadDataLegacy();
