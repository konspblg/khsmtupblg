/* ============================================================
   OVERVIEW PAGE — KHS MTU
   - Fetch ringkasan dari 4 sheet tahun (2018, 2021, 2023, 2024)
   - Tampilkan total keseluruhan + breakdown per tahun
   - Sidebar, dark mode, refresh, scroll-to-top
============================================================ */

const SHEET_ID = '1n2rFEUf5O02qZuUqEK9WqID5nC9CGObcokTN2qZ8Sps';

// Konfigurasi tiap tahun.
//   gid          : tab id Google Sheets
//   page         : file HTML dashboard tahun (untuk tombol klik kartu)
//   countMode    : cara hitung Total/Sudah/Belum:
//                    'unit'    = pakai kolom JML/JUMLAH MTU sebagai angka
//                    'row'     = anggap tiap baris = 1 unit (untuk 2018)
//   statusCol    : keyword nama kolom status (untuk 2018/2021/2023)
//   sumCols      : keyword 3 kolom angka [Jumlah, Terpasang, Belum] (untuk 2024)
const YEAR_CONFIG = [
  {
    year: 2018,
    gid: '1663287907',
    page: '2018.html',
    // Kolom O (idx 14) = JML MTU, Kolom P (idx 15) = STATUS PASANG
    jumlahColIdx: 14,
    statusColIdx: 15,
    mode: '2018'
  },
  {
    year: 2021,
    gid: '561512309',
    page: '2021.html',
    // Kolom I (idx 8) = JML MTU, Kolom Q (idx 16) = STATUS PASANG
    jumlahColIdx: 8,
    statusColIdx: 16,
    mode: '2021'
  },
  {
    year: 2023,
    gid: '1740942727',
    page: '2023.html',
    // Kolom D (idx 3) = STATUS MTU (filter SCM), Kolom L (idx 11) = JML MTU,
    // Kolom T (idx 19) = STATUS PASANG (SUDAH/BELUM/BURSA)
    filterColIdx: 3,
    filterVal: 'SCM',
    jumlahColIdx: 11,
    statusColIdx: 19,
    mode: '2023'
  },
  {
    year: 2024,
    gid: '1351233736',
    page: '2024.html',
    // Kolom H (idx 7) = Material (exclude SF6)
    // Pakai auto-detect nama kolom seperti di dashboard.js
    jumlahCol: ['jumlah mtu', 'jumlah'],
    terpasangCol: ['sudah terpasang', 'terpasang'],
    belumCol: ['belum terpasang', 'sisa'],
    excludeMaterialIdx: 7,
    excludeMaterial: ['SF6'],
  },
  {
    year: 2026,
    gid: '416928234',
    page: '2026.html',
    jumlahCol: ['jumlah mtu', 'jumlah'],
    terpasangCol: ['sudah terpasang', 'terpasang'],
    belumCol: ['belum terpasang', 'sisa'],
    excludeMaterialIdx: 7,
    excludeMaterial: ['SF6'],
    mode: '2024'
  }
];

// State
let yearStats = {}; // { 2018: {total, terpasang, belum, error?}, ... }

/* ============================================================
   FETCH GVIZ — sama mekanisme dengan dashboard.js
============================================================ */
async function fetchSheet(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}') + 1;
  const json = JSON.parse(text.substring(start, end));
  if (!json.table) throw new Error('Format data tidak sesuai');
  return json.table;
}

function parseTable(table) {
  const cols = table.cols.map((c, i) => c.label || c.id || `Kolom ${i+1}`);
  const rows = table.rows.map(r => {
    const o = {};
    r.c.forEach((cell, i) => {
      let v = '';
      if (cell) {
        if (cell.f !== undefined && cell.f !== null) v = cell.f;
        else if (cell.v !== undefined && cell.v !== null) v = cell.v;
      }
      o[cols[i]] = v;
    });
    return o;
  }).filter(r => Object.values(r).some(v => v !== '' && v !== null));
  return { cols, rows };
}

function findCol(cols, keywords) {
  const lower = cols.map(c => String(c).toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex(c => c.includes(kw.toLowerCase()));
    if (idx !== -1) return cols[idx];
  }
  return null;
}

function toNum(v) {
  const n = parseFloat(String(v || '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function isTerpasang(v) {
  return String(v || '').trim().toLowerCase() === 'sudah';
}
function isBursa(v) {
  return String(v || '').trim().toLowerCase() === 'bursa';
}

/* ============================================================
   HITUNG STATS PER TAHUN
============================================================ */
function computeStats(config, parsed) {
  const { cols, rows } = parsed;

  // ── 2018 ──────────────────────────────────────────────────
  // Kolom O (idx 14) = JML MTU → SUM
  // Kolom P (idx 15) = STATUS PASANG → SUDAH / BELUM
  if (config.mode === '2018') {
    const jmlCol = cols[config.jumlahColIdx];
    const statusCol = cols[config.statusColIdx];
    let total = 0, terpasang = 0, belum = 0;
    rows.forEach(r => {
      const n = toNum(r[jmlCol]);
      total += n;
      if (isTerpasang(r[statusCol])) terpasang += n;
      else belum += n;
    });
    return { total, terpasang, belum, bursa: 0 };
  }

  // ── 2021 ──────────────────────────────────────────────────
  // Kolom I (idx 8) = JML MTU → SUM
  // Kolom Q (idx 16) = STATUS PASANG → SUDAH / BELUM
  if (config.mode === '2021') {
    const jmlCol = cols[config.jumlahColIdx];
    const statusCol = cols[config.statusColIdx];
    let total = 0, terpasang = 0, belum = 0;
    rows.forEach(r => {
      const n = toNum(r[jmlCol]);
      total += n;
      if (isTerpasang(r[statusCol])) terpasang += n;
      else belum += n;
    });
    return { total, terpasang, belum, bursa: 0 };
  }

  // ── 2023 ──────────────────────────────────────────────────
  // Kolom D (idx 3) = STATUS MTU → filter hanya "SCM"
  // Kolom K (idx 10) = JML MTU → SUM
  // Kolom T (idx 19) = STATUS PASANG → SUDAH / BELUM / BURSA
  // Baris non-SCM dihitung tersendiri sebagai "bursa"
  if (config.mode === '2023') {
    const filterCol = cols[config.filterColIdx];
    const jmlCol = cols[config.jumlahColIdx];
    const statusCol = cols[config.statusColIdx];

    let total = 0, terpasang = 0, belum = 0, bursa = 0;
    rows.forEach(r => {
      const isScm = String(r[filterCol] || '').trim().toUpperCase() === 'SCM';
      const n = toNum(r[jmlCol]);
      if (!isScm) {
        bursa += n; // baris non-SCM dihitung sebagai bursa
        return;
      }
      total += n;
      const st = String(r[statusCol] || '').trim().toLowerCase();
      if (st === 'sudah') terpasang += n;
      else if (st === 'bursa') bursa += n;
      else belum += n;
    });
    return { total, terpasang, belum, bursa };
  }

  // ── 2024 ──────────────────────────────────────────────────
  // SUM kolom Jumlah/Terpasang/Belum (auto-detect nama)
  // Exclude material SF6
  let data = rows;
  const matCol = cols[config.excludeMaterialIdx];
  if (matCol && config.excludeMaterial) {
    data = data.filter(r => {
      const m = String(r[matCol] || '').toUpperCase();
      return !config.excludeMaterial.some(ex => m.includes(ex));
    });
  }
  const colJumlah = findCol(cols, config.jumlahCol);
  const colTerpasang = findCol(cols, config.terpasangCol);
  const colBelum = findCol(cols, config.belumCol);
  const sum = col => col ? data.reduce((s, r) => s + toNum(r[col]), 0) : 0;
  return {
    total: sum(colJumlah),
    terpasang: sum(colTerpasang),
    belum: sum(colBelum),
    bursa: 0
  };
}

/* ============================================================
   RENDER UI
============================================================ */
function renderYearCards() {
  const grid = document.getElementById('yearGrid');
  grid.innerHTML = '';

  YEAR_CONFIG.forEach(cfg => {
    const stat = yearStats[cfg.year];
    const a = document.createElement('a');
    a.href = cfg.page;
    a.className = 'year-card';
    a.setAttribute('aria-label', `Buka dashboard MTU ${cfg.year}`);

    let body;
    if (!stat) {
      body = `<div class="year-card-loading">Memuat data...</div>`;
    } else if (stat.error) {
      body = `<div class="year-card-loading">⚠️ ${stat.error}</div>`;
    } else {
      const bursaRow = cfg.mode === '2023'
        ? `<div class="year-card-stat bursa">
             <span class="stat-label">Belum Terpasang (Bursa)</span>
             <span class="stat-value">${stat.bursa.toLocaleString('id-ID')}</span>
           </div>`
        : '';

      body = `
        <div class="year-card-stats">
          <div class="year-card-stat">
            <span class="stat-label">Total MTU</span>
            <span class="stat-value">${stat.total.toLocaleString('id-ID')}</span>
          </div>
          <div class="year-card-stat success">
            <span class="stat-label">Sudah Terpasang</span>
            <span class="stat-value">${stat.terpasang.toLocaleString('id-ID')}</span>
          </div>
          <div class="year-card-stat warning">
            <span class="stat-label">Belum Terpasang</span>
            <span class="stat-value">${stat.belum.toLocaleString('id-ID')}</span>
          </div>
          ${bursaRow}
        </div>`;
    }

    a.innerHTML = `
      <div class="year-card-header">
        <div class="year-card-year">MTU ${cfg.year}</div>
        <div class="year-card-arrow">→</div>
      </div>
      ${body}
    `;
    grid.appendChild(a);
  });
}

function renderGrandTotals() {
  const all = Object.values(yearStats).filter(s => s && !s.error);
  const total = all.reduce((s, x) => s + x.total, 0);
  const terpasang = all.reduce((s, x) => s + x.terpasang, 0);
  const belum = all.reduce((s, x) => s + x.belum, 0);
  // Bursa tidak masuk ke grand total belum terpasang (ditampilkan terpisah di card tahun)

  const totalEl = document.getElementById('grandTotal');
  const terpasangEl = document.getElementById('grandTerpasang');
  const belumEl = document.getElementById('grandBelum');

  if (all.length === 0) {
    [totalEl, terpasangEl, belumEl].forEach(el => {
      el.textContent = '—';
      el.classList.remove('is-loading');
    });
    return;
  }

  totalEl.textContent = total.toLocaleString('id-ID');
  terpasangEl.textContent = terpasang.toLocaleString('id-ID');
  belumEl.textContent = belum.toLocaleString('id-ID');
  [totalEl, terpasangEl, belumEl].forEach(el => el.classList.remove('is-loading'));
}

/* ============================================================
   LOAD ALL
   Fetch paralel untuk semua tahun, render begitu satu tahun selesai
============================================================ */
async function loadOne(cfg) {
  try {
    const table = await fetchSheet(cfg.gid);
    const parsed = parseTable(table);
    const stat = computeStats(cfg, parsed);
    yearStats[cfg.year] = stat;
  } catch (err) {
    console.error(`Error loading ${cfg.year}:`, err);
    yearStats[cfg.year] = { total: 0, terpasang: 0, belum: 0, error: 'Gagal memuat' };
  }
  renderYearCards();
  renderGrandTotals();
}

function loadAll() {
  // Reset state & UI
  yearStats = {};
  ['grandTotal','grandTerpasang','grandBelum'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = 'Memuat...';
    el.classList.add('is-loading');
  });
  renderYearCards();
  YEAR_CONFIG.forEach(cfg => loadOne(cfg));
}

/* ============================================================
   SIDEBAR
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
  });
}

/* ============================================================
   DARK MODE TOGGLE
============================================================ */
const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) themeToggle.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}
applyTheme(localStorage.getItem('theme') || 'light');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });
}

/* ============================================================
   SCROLL TO TOP
============================================================ */
function setupScrollTopButton() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  const SHOW = 300;
  let ticking = false;
  function update() {
    if (window.scrollY > SHOW) btn.classList.add('visible');
    else btn.classList.remove('visible');
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  update();
}

/* ============================================================
   REFRESH BUTTON
============================================================ */
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) refreshBtn.addEventListener('click', loadAll);

/* ============================================================
   START
============================================================ */
setupSidebar();
setupScrollTopButton();
loadAll();
