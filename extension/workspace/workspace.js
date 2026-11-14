/**
 * Lead Intelligence Pro - Power Extractor Workspace Controller
 * Real-time Streaming Table, Multi-Keyword Batch Automation, Deep Enrichment, and Export
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const keywordsInput = document.getElementById('keywords-input');
  const btnClearKeywords = document.getElementById('btn-clear-keywords');
  const keywordsFileInput = document.getElementById('keywords-file');
  const btnSampleFile = document.getElementById('btn-sample-file');

  const toggleDuplicates = document.getElementById('toggle-duplicates');
  const toggleNoPhone = document.getElementById('toggle-no-phone');
  const toggleEmails = document.getElementById('toggle-emails');
  const selectLimit = document.getElementById('select-limit');
  const selectSpeed = document.getElementById('select-speed');

  const btnStartScraping = document.getElementById('btn-start-scraping');
  const btnPauseScraping = document.getElementById('btn-pause-scraping');
  const btnStopScraping = document.getElementById('btn-stop-scraping');

  const engineStatusPill = document.getElementById('engine-status-pill');
  const engineStatusDot = document.getElementById('engine-status-dot');
  const engineStatusText = document.getElementById('engine-status-text');
  const engineProgressText = document.getElementById('engine-progress-text');

  const statTotal = document.getElementById('stat-total');
  const statPhone = document.getElementById('stat-phone');
  const statEmail = document.getElementById('stat-email');
  const statWebsite = document.getElementById('stat-website');
  const statSynced = document.getElementById('stat-synced');

  const searchFilter = document.getElementById('search-filter');
  const tableCountBadge = document.getElementById('table-count-badge');
  const leadsTbody = document.getElementById('leads-tbody');
  const emptyState = document.getElementById('empty-state');

  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnClearData = document.getElementById('btn-clear-data');
  const btnOpenSaas = document.getElementById('btn-open-saas');

  // State
  let leadsList = [];
  let currentJob = null;
  let isPaused = false;

  // Initialize
  await loadWorkspaceState();

  async function loadWorkspaceState() {
    chrome.runtime.sendMessage({ type: 'GET_WORKSPACE_DATA' }, (res) => {
      if (res && res.success) {
        leadsList = res.leads || [];
        currentJob = res.job || null;
        renderTable();
        updateStats();
        updateJobControlsUI();
      }
    });
  }

  // Suggestion Chips
  document.querySelectorAll('.chip-btn').forEach((chip) => {
    chip.addEventListener('click', () => {
      const kw = chip.getAttribute('data-kw');
      const cur = keywordsInput.value.trim();
      keywordsInput.value = cur ? `${cur}, ${kw}` : kw;
    });
  });

  // Clear Keywords
  btnClearKeywords.addEventListener('click', () => {
    keywordsInput.value = '';
    keywordsFileInput.value = '';
  });

  // Sample File Download
  btnSampleFile.addEventListener('click', () => {
    const sample = 'Dentists in New York\nPlumbers in Chicago\nGyms in Los Angeles\nReal Estate Agencies in Miami\nAccountants in Houston';
    const blob = new Blob([sample], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_keywords.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Keyword File Upload
  keywordsFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text
        .split(/[\r\n,]+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 2);
      keywordsInput.value = lines.join(', ');
    };
    reader.readAsText(file);
  });

  // Start Batch Scraping
  btnStartScraping.addEventListener('click', () => {
    const raw = keywordsInput.value.trim();
    if (!raw) {
      alert('Please enter at least one keyword (e.g. "Gyms in Delhi") or upload a file.');
      return;
    }

    const keywords = raw
      .split(/[\r\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 1);

    if (keywords.length === 0) {
      alert('No valid keywords found.');
      return;
    }

    const payload = {
      keywords,
      limit: parseInt(selectLimit.value, 10),
      skipDuplicates: toggleDuplicates.checked,
      skipNoPhone: toggleNoPhone.checked,
      extractEmails: toggleEmails.checked,
      delaySeconds: parseInt(selectSpeed.value, 10)
    };

    btnStartScraping.disabled = true;
    btnStartScraping.textContent = 'Launching Runner...';

    chrome.runtime.sendMessage({ type: 'START_BATCH_JOB', payload }, (res) => {
      btnStartScraping.disabled = false;
      if (res && res.success) {
        currentJob = res.job;
        isPaused = false;
        updateJobControlsUI();
      } else {
        alert(res?.error || 'Failed to start batch job.');
      }
    });
  });

  // Pause Scraping
  btnPauseScraping.addEventListener('click', () => {
    if (!isPaused) {
      chrome.runtime.sendMessage({ type: 'PAUSE_BATCH_JOB' }, () => {
        isPaused = true;
        btnPauseScraping.textContent = '▶ Resume';
        btnPauseScraping.className = 'btn btn-primary';
        setEngineStatus('Paused', '#f59e0b', 'Extraction paused');
      });
    } else {
      chrome.runtime.sendMessage({ type: 'RESUME_BATCH_JOB' }, () => {
        isPaused = false;
        btnPauseScraping.textContent = '⏸ Pause';
        btnPauseScraping.className = 'btn btn-pause';
        setEngineStatus('Running', '#10b981', 'Automation active');
      });
    }
  });

  // Stop Scraping
  btnStopScraping.addEventListener('click', () => {
    if (confirm('Are you sure you want to stop the scraping job?')) {
      chrome.runtime.sendMessage({ type: 'STOP_BATCH_JOB' }, () => {
        currentJob = null;
        isPaused = false;
        updateJobControlsUI();
        setEngineStatus('Stopped', '#ef4444', 'Job cancelled');
      });
    }
  });

  // Open SaaS Dashboard
  btnOpenSaas.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://taken-rough-hydrocodone-empirical.trycloudflare.com' });
  });

  // Clear Data
  btnClearData.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all extracted leads?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_SCRAPED_LEADS' }, () => {
        leadsList = [];
        renderTable();
        updateStats();
      });
    }
  });

  // Export CSV
  btnExportCsv.addEventListener('click', () => {
    if (leadsList.length === 0) {
      alert('No leads to export.');
      return;
    }

    const headers = [
      'Category',
      'Business Name',
      'Phone Number',
      'Email Address',
      'Website',
      'Full Address',
      'Street',
      'City',
      'State',
      'Postal Code',
      'Rating',
      'Reviews Count',
      'Keyword',
      'Listing URL'
    ];

    const rows = leadsList.map((l) => [
      escapeCsv(l.category || 'Local Business'),
      escapeCsv(l.business_name || ''),
      escapeCsv(l.phone || ''),
      escapeCsv(l.email || ''),
      escapeCsv(l.website || ''),
      escapeCsv(l.address || ''),
      escapeCsv(l.street || ''),
      escapeCsv(l.city || ''),
      escapeCsv(l.state || ''),
      escapeCsv(l.postal_code || ''),
      l.rating || '',
      l.reviews_count || 0,
      escapeCsv(l.keyword || ''),
      escapeCsv(l.listing_url || '')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Export JSON
  btnExportJson.addEventListener('click', () => {
    if (leadsList.length === 0) {
      alert('No leads to export.');
      return;
    }
    const jsonContent = JSON.stringify(leadsList, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  // Filter Search Input
  searchFilter.addEventListener('input', () => {
    const q = searchFilter.value.toLowerCase().trim();
    const rows = leadsTbody.querySelectorAll('tr');
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // Update UI for Controls
  function updateJobControlsUI() {
    const isRunning = currentJob && currentJob.status === 'RUNNING';
    const isJobPaused = currentJob && currentJob.status === 'PAUSED';

    if (isRunning || isJobPaused) {
      btnStartScraping.style.display = 'none';
      btnPauseScraping.style.display = 'inline-flex';
      btnStopScraping.style.display = 'inline-flex';

      if (isJobPaused) {
        setEngineStatus('Paused', '#f59e0b', `Job paused on "${currentJob.keywords[currentJob.currentIndex] || ''}"`);
      } else {
        const kw = currentJob.keywords[currentJob.currentIndex] || '';
        setEngineStatus('Scraping', '#10b981', `Active: "${kw}" (${currentJob.currentIndex + 1}/${currentJob.keywords.length})`);
      }
    } else {
      btnStartScraping.style.display = 'inline-flex';
      btnStartScraping.textContent = '🚀 Start Scraping';
      btnPauseScraping.style.display = 'none';
      btnStopScraping.style.display = 'none';
      setEngineStatus('Ready', '#94a3b8', 'Engine ready for next task');
    }
  }

  function setEngineStatus(label, color, desc) {
    engineStatusText.textContent = label;
    engineStatusDot.style.background = color;
    engineStatusDot.style.boxShadow = color === '#10b981' ? '0 0 8px #10b981' : 'none';
    engineStatusPill.style.color = color;
    engineProgressText.textContent = desc;
  }

  // Render Table
  function renderTable() {
    leadsTbody.innerHTML = '';
    tableCountBadge.textContent = `${leadsList.length} Records`;

    if (leadsList.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    leadsList.forEach((lead, idx) => {
      appendTableRow(lead, idx + 1);
    });
  }

  function appendTableRow(lead, index) {
    emptyState.style.display = 'none';
    const tr = document.createElement('tr');
    tr.id = `row-${lead.place_id || index}`;

    const websiteLink = lead.website
      ? `<a href="${lead.website}" target="_blank" class="link-out" title="${lead.website}">${formatDomain(lead.website)} ↗</a>`
      : '<span style="color: var(--text-sub);">-</span>';

    const emailDisplay = lead.email
      ? `<span class="email-tag">${lead.email}</span>`
      : '<span style="color: var(--text-sub); font-size: 11px;">Scanning...</span>';

    const ratingDisplay = lead.rating
      ? `<span class="rating-badge">★ ${lead.rating} <span style="font-size: 10px; color: var(--text-sub); font-weight: normal;">(${lead.reviews_count || 0})</span></span>`
      : '<span style="color: var(--text-sub);">-</span>';

    tr.innerHTML = `
      <td style="color: var(--text-sub); font-weight: 600;">${index}</td>
      <td><span class="category-tag">${lead.category || 'Local Business'}</span></td>
      <td style="font-weight: 700; color: #ffffff;">${lead.business_name || 'Unnamed Place'}</td>
      <td><span class="phone-tag">${lead.phone || '-'}</span></td>
      <td>${emailDisplay}</td>
      <td>${websiteLink}</td>
      <td style="color: var(--text-sub); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lead.address || ''}">${lead.address || '-'}</td>
      <td>${ratingDisplay}</td>
      <td><span class="sync-badge">✓ Synced</span></td>
    `;

    leadsTbody.appendChild(tr);
    tableCountBadge.textContent = `${leadsList.length} Records`;
  }

  function formatDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace('www.', '');
    } catch {
      return 'Website';
    }
  }

  function updateStats() {
    statTotal.textContent = leadsList.length;
    statPhone.textContent = leadsList.filter((l) => !!l.phone).length;
    statEmail.textContent = leadsList.filter((l) => !!l.email).length;
    statWebsite.textContent = leadsList.filter((l) => !!l.website).length;
    statSynced.textContent = leadsList.length; // Synced directly to cloud
  }

  // Real-time Event Receiver from Background Service Worker
  chrome.runtime.onMessage.addListener((message) => {
    const { type, payload } = message;

    if (type === 'LEADS_STREAM') {
      const newLeads = payload.newLeads || [];
      newLeads.forEach((lead) => {
        leadsList.push(lead);
        appendTableRow(lead, leadsList.length);
      });
      updateStats();
    }

    if (type === 'LEAD_ENRICHED') {
      const updated = payload;
      const idx = leadsList.findIndex((l) => l.place_id === updated.place_id || l.business_name === updated.business_name);
      if (idx !== -1) {
        leadsList[idx] = updated;
        const row = document.getElementById(`row-${updated.place_id || (idx + 1)}`);
        if (row && updated.email) {
          const cells = row.querySelectorAll('td');
          if (cells[4]) {
            cells[4].innerHTML = `<span class="email-tag">${updated.email}</span>`;
          }
        }
        updateStats();
      }
    }

    if (type === 'KEYWORD_STARTED') {
      const { keyword, index, totalKeywords } = payload;
      setEngineStatus('Scraping', '#10b981', `Active: "${keyword}" (${index + 1}/${totalKeywords})`);
    }

    if (type === 'JOB_STATUS_CHANGED') {
      currentJob = payload;
      updateJobControlsUI();
    }
  });
});

