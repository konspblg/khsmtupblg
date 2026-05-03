const SHEET_ID = '1n2rFEUf5O02qZuUqEK9WqID5nC9CGObcokTN2qZ8Sps';
const GID = '1351233736';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;
const ROWS_PER_PAGE = 25;

let allData = [], filteredData = [], columns = [];
let displayColumns = [];
let currentPage = 1, sortColumn = null, sortDirection = 'asc';
let barChart = null, pieChart = null;

// Mode toggle untuk tabel data detail: 'total' | 'terpasang' | 'belum'
let tableMode = 'total';

// Filter Status (dari pie chart Status Survey) — tidak ada dropdown di card filter,
// jadi disimpan di state sendiri; ikut applyFilters seperti filter lainnya
let statusFilterValue = '';

// State modal: simpan konteks supaya saat toggle mode di modal,
// kita bisa re-filter dari dataset yang sama
let modalContext = {
  baseData: [],   // data hasil filter kategori (tanpa mode terpasang/belum)
  title: '',
  mode: 'total'   // 'total' | 'terpasang' | 'belum'
};

let colLinkBA;

let colULTG, colGI, colPenyedia, colMaterial, colPabrikan, colAHI;
let colJumlah, colTerpasang, colBelum, colStatus, colUPT, colBay;

async function loadData() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('error').classList.add('hidden');
  document.getElementById('dashboard').classList.add('hidden');

  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const json = JSON.parse(text.substring(jsonStart, jsonEnd));
    if (!json.table) throw new Error('Format data tidak sesuai');

    parseSheetData(json.table);
    detectImportantColumns();
    buildDisplayColumns();

    if (colMaterial) {
      allData = allData.filter(r => {
        const m = String(r[colMaterial] || '').toUpperCase();
        return !m.includes('SF6');
      });
      filteredData = [...allData];
    }

    initDashboard();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
  } catch (err) {
    console.error('Error:', err);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('errorMessage').textContent =
      `${err.message}. Pastikan spreadsheet sudah di-share "Anyone with the link".`;
  }
}

function parseSheetData(table) {
  columns = table.cols.map((col, i) => col.label || col.id || `Kolom ${i+1}`);
  allData = table.rows.map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      let val = '';
      if (cell) {
        if (cell.f !== undefined && cell.f !== null) val = cell.f;
        else if (cell.v !== undefined && cell.v !== null) val = cell.v;
      }
      obj[columns[i]] = val;
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== '' && v !== null));
  filteredData = [...allData];
}

function findColumn(keywords) {
  const lower = columns.map(c => c.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex(c => c.includes(kw.toLowerCase()));
    if (idx !== -1) return columns[idx];
  }
  return null;
}

function detectImportantColumns() {
  colULTG = findColumn(['ultg']);
  colUPT = findColumn(['upt']);
  colGI = findColumn(['gardu induk', 'gi']);
  colBay = findColumn(['bay']);
  colPenyedia = findColumn(['penyedia pasang', 'penyedia jasa']);
  colMaterial = columns[7] || null;   // kolom H
  colPabrikan = columns[1] || null;   // kolom B
  colAHI = findColumn(['ahi']);
  colJumlah = findColumn(['jumlah mtu', 'jumlah']);
  colTerpasang = findColumn(['terpasang', 'sudah']);
  colBelum = findColumn(['belum terpasang', 'belum', 'sisa']);
  colStatus = findColumn(['status', 'keterangan']);
  colLinkBA = findColumn(['link ba', 'link', 'url']);
}

function buildDisplayColumns() {
  let cols = columns.filter(c => c !== colUPT && c !== colPabrikan);
  if (colPabrikan) {
    if (colBay) {
      const bayIdx = cols.indexOf(colBay);
      if (bayIdx !== -1) cols.splice(bayIdx + 1, 0, colPabrikan);
      else cols.unshift(colPabrikan);
    } else {
      cols.unshift(colPabrikan);
    }
  }
  displayColumns = cols;
}

function initDashboard() {
  populateAllFilters();
  renderStats();
  renderCharts();
  renderTable();
  attachListeners();
  setupAxisLockedScroll();
  setupScrollTopButton();
  setupModal();
}

function getUniqueValues(data, col) {
  if (!col) return [];
  return [...new Set(data.map(r => r[col]).filter(v => v !== '' && v !== null && v !== undefined))]
    .sort((a, b) => String(a).localeCompare(String(b), 'id'));
}

function populateSelect(selectId, values, defaultLabel, currentValue) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '';
  // Opsi default — di-bold via class
  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = defaultLabel;
  defOpt.className = 'default-opt';
  sel.appendChild(defOpt);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  sel.value = (currentValue && values.includes(currentValue)) ? currentValue : '';
}

function getScopeForLevel(level) {
  let scope = allData;
  const ultgVal = document.getElementById('filterULTG').value;
  const giVal = document.getElementById('filterGI').value;
  const penyediaVal = document.getElementById('filterPenyedia').value;
  const materialVal = document.getElementById('filterMaterial').value;
  const pabrikanVal = document.getElementById('filterPabrikan').value;
  if (level >= 1 && ultgVal && colULTG) scope = scope.filter(r => r[colULTG] === ultgVal);
  if (level >= 2 && giVal && colGI) scope = scope.filter(r => r[colGI] === giVal);
  if (level >= 3 && penyediaVal && colPenyedia) scope = scope.filter(r => r[colPenyedia] === penyediaVal);
  if (level >= 4 && materialVal && colMaterial) scope = scope.filter(r => r[colMaterial] === materialVal);
  if (level >= 5 && pabrikanVal && colPabrikan) scope = scope.filter(r => r[colPabrikan] === pabrikanVal);
  return scope;
}

function populateULTG() {
  const sel = document.getElementById('filterULTG');
  populateSelect('filterULTG', getUniqueValues(allData, colULTG), 'Semua ULTG', sel.value);
  sel.disabled = !colULTG;
}
function populateGI() {
  const sel = document.getElementById('filterGI');
  populateSelect('filterGI', getUniqueValues(getScopeForLevel(1), colGI), 'Semua GI', sel.value);
  sel.disabled = !colGI;
}
function populatePenyedia() {
  const sel = document.getElementById('filterPenyedia');
  populateSelect('filterPenyedia', getUniqueValues(getScopeForLevel(2), colPenyedia), 'Semua Penyedia', sel.value);
  sel.disabled = !colPenyedia;
}
function populateMaterial() {
  const sel = document.getElementById('filterMaterial');
  populateSelect('filterMaterial', getUniqueValues(getScopeForLevel(3), colMaterial), 'Semua Material', sel.value);
  sel.disabled = !colMaterial;
}
function populatePabrikan() {
  const sel = document.getElementById('filterPabrikan');
  populateSelect('filterPabrikan', getUniqueValues(getScopeForLevel(4), colPabrikan), 'Semua Pabrikan', sel.value);
  sel.disabled = !colPabrikan;
}
function populateAHI() {
  const sel = document.getElementById('filterAHI');
  populateSelect('filterAHI', getUniqueValues(getScopeForLevel(5), colAHI), 'Semua AHI', sel.value);
  sel.disabled = !colAHI;
}
function populateAllFilters() {
  populateULTG(); populateGI(); populatePenyedia(); populateMaterial(); populatePabrikan(); populateAHI();
}

function renderStats() {
  const sumJumlah = sumColumn(colJumlah);
  const sumPasang = sumColumn(colTerpasang);
  const sumBelum = sumColumn(colBelum);
  document.getElementById('statsGrid').innerHTML = `
    ${colJumlah ? `<div class="stat-card primary"><div class="label">JUMLAH MTU</div><div class="value">${sumJumlah.toLocaleString('id-ID')}</div></div>` : ''}
    ${colTerpasang ? `<div class="stat-card success"><div class="label">SUDAH TERPASANG</div><div class="value">${sumPasang.toLocaleString('id-ID')}</div></div>` : ''}
    ${colBelum ? `<div class="stat-card warning"><div class="label">BELUM TERPASANG</div><div class="value">${sumBelum.toLocaleString('id-ID')}</div></div>` : ''}
  `;
}

function sumColumn(col) {
  if (!col) return 0;
  return filteredData.reduce((sum, r) => {
    const v = parseFloat(String(r[col]).replace(/[^\d.-]/g, ''));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

function renderCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#f1f5f9' : '#1a1f36';
  const gridColor = isDark ? '#334155' : '#e5e7eb';
  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  // ===== BAR CHART: 3 mode =====
  const barMode = window.barMode || 'status';
  let barLabels, barDatasets, barLegend = false;

  if (barMode === 'status') {
    // Mode 1: 3 batang berdampingan — Total Jumlah, Terpasang, Belum
    const totalJumlah = sumColumn(colJumlah);
    const totalPasang = sumColumn(colTerpasang);
    const totalBelum = sumColumn(colBelum);
    barLabels = ['Jumlah MTU', 'Sudah Terpasang', 'Belum Terpasang'];
    barDatasets = [{
      label: 'Jumlah',
      data: [totalJumlah, totalPasang, totalBelum],
      backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b'],
      borderRadius: 6
    }];
  } else {
    // Mode 2 & 3: GROUPED bar — per kategori, 3 batang (Jumlah / Terpasang / Belum)
    const groupCol = (barMode === 'material') ? colMaterial : colPenyedia;
    const grouped = sumMultiByGroup(groupCol, [
      { label: 'Jumlah MTU', col: colJumlah },
      { label: 'Sudah Terpasang', col: colTerpasang },
      { label: 'Belum Terpasang', col: colBelum }
    ]);
    barLabels = grouped.labels;
    barDatasets = [
      { label: 'Jumlah MTU', data: grouped.series[0].data, backgroundColor: '#3b82f6', borderRadius: 4 },
      { label: 'Sudah Terpasang', data: grouped.series[1].data, backgroundColor: '#22c55e', borderRadius: 4 },
      { label: 'Belum Terpasang', data: grouped.series[2].data, backgroundColor: '#f59e0b', borderRadius: 4 }
    ];
    barLegend = true;
  }

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
    type: 'bar',
    data: { labels: barLabels, datasets: barDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: {
        legend: {
          display: barLegend,
          position: 'top',
          labels: { boxWidth: 12, padding: 8, font: { size: 11 } }
        },
        title: { display: false },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          color: textColor,
          font: { size: 10, weight: '600' },
          formatter: (v) => {
            const num = Number(v) || 0;
            return num.toLocaleString('id-ID');
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0 } },
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, autoSkip: false, font: { size: 10 } } }
      }
    },
    plugins: [ChartDataLabels]
  });

  // Pie chart: tergantung mode aktif (status survey / AHI)
  const pieMode = window.pieMode || 'status';
  let pieCol, pieData, pieColors;
  const defaultPalette = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];

  if (pieMode === 'ahi' && colAHI) {
    pieCol = colAHI;
    pieData = countByColumn(pieCol);
    // Warna khusus AHI: critical=merah, poor=oranye, fair=kuning, good=hijau
    pieColors = Object.keys(pieData).map(label => {
      const lc = String(label).toLowerCase();
      if (lc.includes('critical')) return '#dc2626';      // merah
      if (lc.includes('poor')) return '#f97316';          // oranye
      if (lc.includes('fair')) return '#facc15';          // kuning
      if (lc.includes('good')) return '#16a34a';          // hijau
      return '#94a3b8';                                    // abu untuk lain
    });
  } else {
    pieCol = colStatus || colPenyedia || displayColumns[1] || displayColumns[0];
    pieData = countByColumn(pieCol);
    pieColors = defaultPalette;
  }

  if (pieChart) pieChart.destroy();
  const pieValues = Object.values(pieData);
  const pieTotal = pieValues.reduce((a, b) => a + b, 0);

  pieChart = new Chart(document.getElementById('pieChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(pieData),
      datasets: [{
        data: pieValues,
        backgroundColor: pieColors,
        borderWidth: 2, borderColor: isDark ? '#1e293b' : '#fff'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
        datalabels: {
          display: true,
          color: '#fff',
          font: { size: 11, weight: '700' },
          textStrokeColor: 'rgba(0,0,0,0.5)',
          textStrokeWidth: 2,
          formatter: (v) => {
            const num = Number(v) || 0;
            const pct = pieTotal > 0 ? Math.round((num / pieTotal) * 100) : 0;
            // Slice sangat kecil: tampilkan angka saja (tanpa %), agar muat
            if (pct < 4) return String(num);
            return `${num}\n(${pct}%)`;
          },
          textAlign: 'center'
        }
      }
    },
    plugins: [ChartDataLabels]
  });

  // Render filter di atas chart
  renderBarFilter();
  renderPieFilter();
}

/* ============================================================
   CHART FILTER — di atas chart (dropdown + tombol search)
   - Dropdown: pilih kategori untuk filter chart (sinkron dengan
     filter di card filter untuk Material/Penyedia/AHI; untuk
     Status pakai state lokal statusFilterValue)
   - Tombol search: buka modal data sesuai pilihan dropdown
============================================================ */
function renderBarFilter() {
  const wrap = document.getElementById('barFilter');
  const sel = document.getElementById('barFilterSelect');
  if (!wrap || !sel) return;

  const mode = window.barMode || 'status';
  // Mode "Status" tidak punya filter chart
  if (mode === 'status') {
    wrap.classList.add('hidden-filter');
    return;
  }
  wrap.classList.remove('hidden-filter');

  const groupCol = (mode === 'material') ? colMaterial : colPenyedia;
  const defaultLabel = (mode === 'material') ? 'Semua Material' : 'Semua Penyedia';

  // Sinkron value ke dropdown filter atas (Material/Penyedia)
  const linkedSelectId = (mode === 'material') ? 'filterMaterial' : 'filterPenyedia';
  const linkedVal = document.getElementById(linkedSelectId).value;

  // Populasi opsi: pakai data hasil cascading dari card filter
  // (samaan dengan dropdown Material/Penyedia di atas)
  const scope = (mode === 'material') ? getScopeForLevel(3) : getScopeForLevel(2);
  const values = getUniqueValues(scope, groupCol);

  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = ''; def.textContent = defaultLabel;
  def.className = 'default-opt';
  sel.appendChild(def);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  sel.value = (linkedVal && values.includes(linkedVal)) ? linkedVal : '';
}

function renderPieFilter() {
  const wrap = document.getElementById('pieFilter');
  const sel = document.getElementById('pieFilterSelect');
  if (!wrap || !sel) return;

  const mode = window.pieMode || 'status';
  wrap.classList.remove('hidden-filter');

  if (mode === 'ahi') {
    // Sinkron dengan dropdown AHI di card filter
    const linkedVal = document.getElementById('filterAHI').value;
    const scope = getScopeForLevel(6);
    const values = getUniqueValues(scope, colAHI);

    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = 'Semua AHI';
    def.className = 'default-opt';
    sel.appendChild(def);
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = (linkedVal && values.includes(linkedVal)) ? linkedVal : '';
  } else {
    // Status Survey — pakai statusFilterValue (tidak ada dropdown di card filter)
    if (!colStatus) {
      wrap.classList.add('hidden-filter');
      return;
    }
    const values = getUniqueValues(allData, colStatus);

    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = 'Semua Status';
    def.className = 'default-opt';
    sel.appendChild(def);
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = statusFilterValue || '';
  }
}

/* ============================================================
   COPY DATA AS TSV (Tab-Separated Values).
   TSV bisa langsung di-paste ke Excel/Google Sheets dan otomatis
   terbagi per kolom. Lebih reliabel dari CSV karena data sering
   mengandung koma.
============================================================ */
function copyDataAsTSV(data, btnEl) {
  const cols = displayColumns;
  const lines = [];
  // Header
  lines.push(cols.join('\t'));
  // Body
  data.forEach(row => {
    const cells = cols.map(c => {
      let v = row[c];
      if (v === null || v === undefined) return '';
      // Bersihkan tab & newline supaya tidak merusak format TSV
      return String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    });
    lines.push(cells.join('\t'));
  });
  const tsv = lines.join('\n');

  const showCopied = () => {
    if (!btnEl) return;
    const original = btnEl.innerHTML;
    btnEl.classList.add('copied');
    btnEl.innerHTML = '✓ Tersalin';
    setTimeout(() => {
      btnEl.classList.remove('copied');
      btnEl.innerHTML = original;
    }, 2000);
  };

  // Pakai Clipboard API kalau tersedia, fallback ke textarea trick
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsv).then(showCopied).catch(() => fallbackCopy(tsv, showCopied));
  } else {
    fallbackCopy(tsv, showCopied);
  }
}

function fallbackCopy(text, onDone) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (onDone) onDone();
  } catch (e) {
    console.error('Copy failed:', e);
  }
  document.body.removeChild(ta);
}

function countByColumn(col) {
  if (!col) return {};
  const counts = {};
  filteredData.forEach(r => {
    const v = r[col];
    if (v !== '' && v !== null && v !== undefined) counts[v] = (counts[v] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 10));
}

/* SUM beberapa kolom numerik (valueCols) per groupCol.
   Mengembalikan { labels: [...], series: [{label, data}, ...] }
   Top 10 group berdasarkan total kolom pertama (mis. Jumlah MTU). */
function sumMultiByGroup(groupCol, valueCols) {
  const out = { labels: [], series: valueCols.map(c => ({ label: c.label, col: c.col, data: [] })) };
  if (!groupCol) return out;

  const sums = {};
  filteredData.forEach(r => {
    const k = r[groupCol];
    if (k === '' || k === null || k === undefined) return;
    if (!sums[k]) sums[k] = valueCols.map(() => 0);
    valueCols.forEach((vc, i) => {
      const v = parseFloat(String(r[vc.col] || '').replace(/[^\d.-]/g, ''));
      if (!isNaN(v)) sums[k][i] += v;
    });
  });

  // Urutkan berdasarkan kolom pertama (biasanya Jumlah MTU) descending
  const sorted = Object.entries(sums)
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, 10);

  out.labels = sorted.map(e => e[0]);
  sorted.forEach(([_, vals]) => {
    vals.forEach((v, i) => out.series[i].data.push(v));
  });
  return out;
}

function sumByGroup(groupCol, valueCol) {
  if (!groupCol || !valueCol) return {};
  const sums = {};
  filteredData.forEach(r => {
    const k = r[groupCol];
    if (k === '' || k === null || k === undefined) return;
    const v = parseFloat(String(r[valueCol]).replace(/[^\d.-]/g, ''));
    if (!isNaN(v)) sums[k] = (sums[k] || 0) + v;
  });
  return Object.fromEntries(Object.entries(sums).sort((a,b) => b[1] - a[1]).slice(0, 10));
}

/* Filter data tabel sesuai tableMode aktif:
   - total: semua data filtered
   - terpasang: hanya yang Sudah Terpasang > 0
   - belum: hanya yang Belum Terpasang > 0 */
function getTableData() {
  if (tableMode === 'terpasang' && colTerpasang) {
    return filteredData.filter(r => {
      const v = parseFloat(String(r[colTerpasang] || '').replace(/[^\d.-]/g, ''));
      return !isNaN(v) && v > 0;
    });
  }
  if (tableMode === 'belum' && colBelum) {
    return filteredData.filter(r => {
      const v = parseFloat(String(r[colBelum] || '').replace(/[^\d.-]/g, ''));
      return !isNaN(v) && v > 0;
    });
  }
  return filteredData;
}

/* Update angka di tiap toggle button.
   Angka = SUM nilai kolom (Jumlah/Terpasang/Belum), konsisten dengan stat cards di atas */
function updateTableToggleCounts() {
  const sumJumlah = sumColumn(colJumlah);
  const sumTerpasang = sumColumn(colTerpasang);
  const sumBelum = sumColumn(colBelum);
  document.getElementById('ttbCountTotal').textContent = sumJumlah.toLocaleString('id-ID');
  document.getElementById('ttbCountTerpasang').textContent = sumTerpasang.toLocaleString('id-ID');
  document.getElementById('ttbCountBelum').textContent = sumBelum.toLocaleString('id-ID');
}

function renderTable() {
  const headerRow = document.getElementById('tableHeaderRow');
  const tbody = document.getElementById('tableBody');

  if (headerRow.children.length === 0) {
    displayColumns.forEach(col => {
      const th = document.createElement('th');
      th.innerHTML = `${col}<span class="sort-icon">↕</span>`;
      th.dataset.column = col;
      th.addEventListener('click', () => handleSort(col));
      headerRow.appendChild(th);
    });
  }
  Array.from(headerRow.children).forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.column === sortColumn) {
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      icon.textContent = sortDirection === 'asc' ? '↑' : '↓';
    } else { icon.textContent = '↕'; }
  });

  // Update count di setiap toggle button
  updateTableToggleCounts();

  // Data tabel: difilter berdasarkan tableMode
  const tableData = getTableData();

  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;
  const pageData = tableData.slice(start, end);

  tbody.innerHTML = '';
  pageData.forEach(row => {
    const tr = document.createElement('tr');

    tr.addEventListener('click', () => {
      const wasSelected = tr.classList.contains('row-selected');
      tbody.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      if (!wasSelected) tr.classList.add('row-selected');
    });

    if (colStatus && row[colStatus]) {
      const sv = String(row[colStatus]).toLowerCase();
      if (sv.includes('kritis') || sv.includes('masalah') || sv.includes('telat') || sv.includes('terlambat') || sv.includes('gagal')) {
        tr.classList.add('highlight-danger');
      }
    }
    if (colBelum && row[colBelum]) {
      const bv = parseFloat(String(row[colBelum]).replace(/[^\d.-]/g, ''));
      if (bv > 0 && !tr.classList.contains('highlight-danger')) tr.classList.add('highlight-warning');
    }

    displayColumns.forEach(col => {
      const td = document.createElement('td');
      const val = row[col];
      // Kolom Link BA: jadikan hyperlink kalau isinya URL
      if (col === colLinkBA && val && /^https?:\/\//i.test(String(val).trim())) {
        const a = document.createElement('a');
        a.href = String(val).trim();
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'cell-link';
        a.textContent = 'Buka BA ↗';
        a.addEventListener('click', (e) => e.stopPropagation()); // jangan trigger row click
        td.appendChild(a);
      } else {
        td.textContent = (val === '' || val === null || val === undefined) ? '-' : val;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  document.getElementById('tableInfo').textContent =
    `Menampilkan ${tableData.length === 0 ? 0 : start + 1}-${Math.min(end, tableData.length)} dari ${tableData.length} data`;
  const totalPages = Math.max(1, Math.ceil(tableData.length / ROWS_PER_PAGE));
  document.getElementById('paginationInfo').textContent = `Halaman ${currentPage} dari ${totalPages}`;
  document.getElementById('prevPage').disabled = currentPage === 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

/* Parse berbagai format tanggal Indonesia/internasional ke timestamp.
   Mendukung: "5 Jan 2025", "5 Januari 2025", "5/1/2025", "05-01-2025",
   "2025-01-05", "5 Jan 2025 14:30", dll. Return null kalau gagal parse. */
const ID_MONTHS = {
  jan: 0, januari: 0, feb: 1, februari: 1, mar: 2, maret: 2,
  apr: 3, april: 3, mei: 4, jun: 5, juni: 5, jul: 6, juli: 6,
  agu: 7, agt: 7, ags: 7, agustus: 7, sep: 8, sept: 8, september: 8,
  okt: 9, oct: 9, oktober: 9, nov: 10, november: 10, des: 11, dec: 11, desember: 11
};
function parseIndoDate(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim();
  if (!s) return null;

  // Format "DD MMM YYYY" atau "DD MMMM YYYY" (Indonesia)
  const reIndo = /^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2,4})/;
  const mIndo = s.match(reIndo);
  if (mIndo) {
    const d = parseInt(mIndo[1], 10);
    const mKey = mIndo[2].toLowerCase().replace(/\./g, '');
    const y = parseInt(mIndo[3], 10);
    if (ID_MONTHS.hasOwnProperty(mKey)) {
      const year = y < 100 ? 2000 + y : y;
      const dt = new Date(year, ID_MONTHS[mKey], d);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
  }

  // Format "DD/MM/YYYY" atau "DD-MM-YYYY"
  const reDmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;
  const mDmy = s.match(reDmy);
  if (mDmy) {
    const d = parseInt(mDmy[1], 10);
    const mo = parseInt(mDmy[2], 10) - 1;
    const y = parseInt(mDmy[3], 10);
    const year = y < 100 ? 2000 + y : y;
    const dt = new Date(year, mo, d);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  // Format ISO YYYY-MM-DD
  const reIso = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  const mIso = s.match(reIso);
  if (mIso) {
    const dt = new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10));
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  // Fallback: coba Date.parse
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function handleSort(col) {
  if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  else { sortColumn = col; sortDirection = 'asc'; }
  filteredData.sort((a, b) => {
    const va = a[col], vb = b[col];

    // 1) Coba parse sebagai tanggal lengkap (dd-mm-yyyy)
    const da = parseIndoDate(va);
    const db = parseIndoDate(vb);
    if (da !== null && db !== null) {
      return sortDirection === 'asc' ? da - db : db - da;
    }
    if (da !== null) return sortDirection === 'asc' ? -1 : 1;
    if (db !== null) return sortDirection === 'asc' ? 1 : -1;

    // 2) Coba sebagai angka
    const na = parseFloat(String(va).replace(/[^\d.-]/g, ''));
    const nb = parseFloat(String(vb).replace(/[^\d.-]/g, ''));
    if (!isNaN(na) && !isNaN(nb) && String(va).match(/\d/) && String(vb).match(/\d/)) {
      return sortDirection === 'asc' ? na - nb : nb - na;
    }

    // 3) Fallback: string compare
    const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
    if (sa < sb) return sortDirection === 'asc' ? -1 : 1;
    if (sa > sb) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  currentPage = 1;
  renderTable();
}

function applyFilters() {
  const ultgVal = document.getElementById('filterULTG').value;
  const giVal = document.getElementById('filterGI').value;
  const penyediaVal = document.getElementById('filterPenyedia').value;
  const materialVal = document.getElementById('filterMaterial').value;
  const pabrikanVal = document.getElementById('filterPabrikan').value;
  const ahiVal = document.getElementById('filterAHI').value;

  filteredData = allData.filter(row => {
    if (ultgVal && colULTG && row[colULTG] !== ultgVal) return false;
    if (giVal && colGI && row[colGI] !== giVal) return false;
    if (penyediaVal && colPenyedia && row[colPenyedia] !== penyediaVal) return false;
    if (materialVal && colMaterial && row[colMaterial] !== materialVal) return false;
    if (pabrikanVal && colPabrikan && row[colPabrikan] !== pabrikanVal) return false;
    if (ahiVal && colAHI && row[colAHI] !== ahiVal) return false;
    if (statusFilterValue && colStatus && row[colStatus] !== statusFilterValue) return false;
    return true;
  });

  currentPage = 1;
  renderStats();
  renderCharts();
  renderTable();
}

function attachListeners() {
  document.getElementById('filterULTG').addEventListener('change', () => {
    ['filterGI','filterPenyedia','filterMaterial','filterPabrikan','filterAHI'].forEach(id => document.getElementById(id).value = '');
    populateGI(); populatePenyedia(); populateMaterial(); populatePabrikan(); populateAHI();
    applyFilters();
  });
  document.getElementById('filterGI').addEventListener('change', () => {
    ['filterPenyedia','filterMaterial','filterPabrikan','filterAHI'].forEach(id => document.getElementById(id).value = '');
    populatePenyedia(); populateMaterial(); populatePabrikan(); populateAHI();
    applyFilters();
  });
  document.getElementById('filterPenyedia').addEventListener('change', () => {
    ['filterMaterial','filterPabrikan','filterAHI'].forEach(id => document.getElementById(id).value = '');
    populateMaterial(); populatePabrikan(); populateAHI();
    applyFilters();
  });
  document.getElementById('filterMaterial').addEventListener('change', () => {
    ['filterPabrikan','filterAHI'].forEach(id => document.getElementById(id).value = '');
    populatePabrikan(); populateAHI();
    applyFilters();
  });
  document.getElementById('filterPabrikan').addEventListener('change', () => {
    document.getElementById('filterAHI').value = '';
    populateAHI();
    applyFilters();
  });
  document.getElementById('filterAHI').addEventListener('change', applyFilters);

  document.getElementById('resetFilters').addEventListener('click', () => {
    ['filterULTG','filterGI','filterPenyedia','filterMaterial','filterPabrikan','filterAHI']
      .forEach(id => document.getElementById(id).value = '');
    statusFilterValue = '';
    populateAllFilters();
    applyFilters();
  });

  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTable(); }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);
    if (currentPage < totalPages) { currentPage++; renderTable(); }
  });
  document.getElementById('refreshBtn').addEventListener('click', loadData);

  // Pie chart mode toggle (Status Survey / AHI)
  window.pieMode = 'status';
  document.querySelectorAll('.pie-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === window.pieMode) return;
      window.pieMode = mode;
      document.querySelectorAll('.pie-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      renderCharts();
    });
  });

  // Bar chart mode toggle (Status / Per Material / Per Penyedia)
  window.barMode = 'status';
  document.querySelectorAll('.bar-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === window.barMode) return;
      window.barMode = mode;
      document.querySelectorAll('.bar-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      renderCharts();
    });
  });

  // Toggle filter tabel (Total MTU / Sudah Terpasang / Belum Terpasang)
  document.querySelectorAll('.table-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === tableMode) return;
      tableMode = mode;
      document.querySelectorAll('.table-toggle-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
      currentPage = 1;
      renderTable();
    });
  });

  // Tombol Copy di card Data Detail
  const copyBtn = document.getElementById('copyTableBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      copyDataAsTSV(getTableData(), e.currentTarget);
    });
  }

  // ===== Filter di atas BAR chart =====
  // Dropdown bar — sinkron ke filter Material / Penyedia di card filter atas
  document.getElementById('barFilterSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    const mode = window.barMode || 'status';
    if (mode === 'material') {
      const linked = document.getElementById('filterMaterial');
      linked.value = val;
      linked.dispatchEvent(new Event('change'));
    } else if (mode === 'penyedia') {
      const linked = document.getElementById('filterPenyedia');
      linked.value = val;
      linked.dispatchEvent(new Event('change'));
    }
  });

  // Tombol search bar — buka modal sesuai pilihan
  document.getElementById('barFilterSearch').addEventListener('click', () => {
    const mode = window.barMode || 'status';
    if (mode === 'status') return;

    const sel = document.getElementById('barFilterSelect');
    const val = sel.value;
    const groupCol = (mode === 'material') ? colMaterial : colPenyedia;
    const modeLabel = (mode === 'material') ? 'Material' : 'Penyedia Jasa Pasang';

    let baseData, title;
    if (val) {
      baseData = filteredData.filter(r => String(r[groupCol] || '') === String(val));
      title = `Detail: ${modeLabel} — ${val}`;
    } else {
      baseData = [...filteredData];
      title = `Detail: Semua ${modeLabel}`;
    }
    openModal(title, baseData);
  });

  // ===== Filter di atas PIE chart =====
  document.getElementById('pieFilterSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    const mode = window.pieMode || 'status';
    if (mode === 'ahi') {
      // Sinkron ke filter AHI di card filter
      const linked = document.getElementById('filterAHI');
      linked.value = val;
      linked.dispatchEvent(new Event('change'));
    } else {
      // Status — pakai state lokal
      statusFilterValue = val;
      applyFilters();
    }
  });

  // Tombol search pie — buka modal sesuai pilihan
  document.getElementById('pieFilterSearch').addEventListener('click', () => {
    const mode = window.pieMode || 'status';
    const sel = document.getElementById('pieFilterSelect');
    const val = sel.value;
    const groupCol = (mode === 'ahi') ? colAHI : colStatus;
    const modeLabel = (mode === 'ahi') ? 'AHI' : 'Status Survey';

    let baseData, title;
    if (val) {
      baseData = filteredData.filter(r => String(r[groupCol] || '') === String(val));
      title = `Detail: ${modeLabel} — ${val}`;
    } else {
      baseData = [...filteredData];
      title = `Detail: Semua ${modeLabel}`;
    }
    openModal(title, baseData);
  });
}

/* Pakai native scroll browser — paling halus di HP */
function setupAxisLockedScroll() {
  // dikosongkan, biarkan browser handle scroll natively
}

/* Scroll-to-top button — muncul setelah scroll > 300px */
function setupScrollTopButton() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  const SHOW_THRESHOLD = 300; // px
  let ticking = false;

  function update() {
    if (window.scrollY > SHOW_THRESHOLD) btn.classList.add('visible');
    else btn.classList.remove('visible');
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  update();
}

/* ============================================================
   MODAL DRILLDOWN
   Klik tombol kategori → buka modal dengan baseData yang difilter
   sesuai kategori. Toggle mode di modal mempersempit lagi.
============================================================ */
function applyModalMode(baseData) {
  if (modalContext.mode === 'terpasang' && colTerpasang) {
    return baseData.filter(r => {
      const v = parseFloat(String(r[colTerpasang] || '').replace(/[^\d.-]/g, ''));
      return !isNaN(v) && v > 0;
    });
  }
  if (modalContext.mode === 'belum' && colBelum) {
    return baseData.filter(r => {
      const v = parseFloat(String(r[colBelum] || '').replace(/[^\d.-]/g, ''));
      return !isNaN(v) && v > 0;
    });
  }
  return baseData;
}

function sumColumnIn(data, col) {
  if (!col) return 0;
  return data.reduce((s, r) => {
    const v = parseFloat(String(r[col] || '').replace(/[^\d.-]/g, ''));
    return s + (isNaN(v) ? 0 : v);
  }, 0);
}

function updateModalToggleCounts() {
  const base = modalContext.baseData;
  const sumJ = sumColumnIn(base, colJumlah);
  const sumT = sumColumnIn(base, colTerpasang);
  const sumB = sumColumnIn(base, colBelum);
  document.getElementById('modalCountTotal').textContent = sumJ.toLocaleString('id-ID');
  document.getElementById('modalCountTerpasang').textContent = sumT.toLocaleString('id-ID');
  document.getElementById('modalCountBelum').textContent = sumB.toLocaleString('id-ID');
}

function renderModalTable() {
  const data = applyModalMode(modalContext.baseData);
  const headerRow = document.getElementById('modalTableHeader');
  const tbody = document.getElementById('modalTableBody');
  const emptyEl = document.getElementById('modalEmpty');
  const scrollEl = document.getElementById('modalTableScroll');

  document.getElementById('modalInfo').textContent = `${data.length} data`;

  // Header
  headerRow.innerHTML = '';
  displayColumns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  });

  tbody.innerHTML = '';
  if (data.length === 0) {
    emptyEl.classList.remove('hidden');
    scrollEl.style.display = 'none';
  } else {
    emptyEl.classList.add('hidden');
    scrollEl.style.display = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      displayColumns.forEach(col => {
        const td = document.createElement('td');
        const val = row[col];
        if (col === colLinkBA && val && /^https?:\/\//i.test(String(val).trim())) {
          const a = document.createElement('a');
          a.href = String(val).trim();
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'cell-link';
          a.textContent = 'Buka BA ↗';
          td.appendChild(a);
        } else {
          td.textContent = (val === '' || val === null || val === undefined) ? '-' : val;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  updateModalToggleCounts();
  scrollEl.scrollTop = 0;
  scrollEl.scrollLeft = 0;
}

function openModal(title, baseData) {
  modalContext.baseData = baseData;
  modalContext.title = title;
  modalContext.mode = 'total';

  document.getElementById('modalTitle').textContent = title;

  // Reset toggle ke "Total MTU"
  document.querySelectorAll('.modal-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === 'total'));

  renderModalTable();

  const backdrop = document.getElementById('modalBackdrop');
  document.body.classList.add('modal-open');
  backdrop.classList.add('visible');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.remove('visible');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function setupModal() {
  const backdrop = document.getElementById('modalBackdrop');
  const closeBtn = document.getElementById('modalCloseBtn');

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  closeBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('visible')) closeModal();
  });

  // Toggle mode di modal
  document.querySelectorAll('.modal-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === modalContext.mode) return;
      modalContext.mode = mode;
      document.querySelectorAll('.modal-toggle-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
      renderModalTable();
    });
  });

  // Copy data modal
  document.getElementById('modalCopyBtn').addEventListener('click', (e) => {
    const data = applyModalMode(modalContext.baseData);
    copyDataAsTSV(data, e.currentTarget);
  });
}
applyTheme(localStorage.getItem('theme') || 'light');
themeToggle.addEventListener('click', () => {
  const next = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('theme', next);
  if (allData.length) renderCharts();
});
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

/* ============================================================
   SIDEBAR — hamburger toggle, klik di luar / Esc untuk tutup
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
  // Klik link di sidebar → tutup (sebelum navigasi)
  sidebar.querySelectorAll('.sidebar-link').forEach(a => {
    a.addEventListener('click', () => setTimeout(close, 50));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
  });
}

setupSidebar();
loadData();
