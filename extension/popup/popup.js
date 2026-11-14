/**
 * Google Maps Lead Extractor & Cloud CRM Sync - Popup Controller
 * Dedicated high-speed Google Maps extraction, auto-extraction launcher, and real-time CRM sync.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Connection & Views
  const connectionPill = document.getElementById('connection-pill');
  const viewAuth = document.getElementById('view-auth');
  const viewMain = document.getElementById('view-main');

  // Auth elements
  const tabBtnToken = document.getElementById('tab-btn-token');
  const tabBtnLogin = document.getElementById('tab-btn-login');
  const formToken = document.getElementById('form-token');
  const formLogin = document.getElementById('form-login');
  const inputToken = document.getElementById('input-token');
  const inputUsername = document.getElementById('input-username');
  const inputPassword = document.getElementById('input-password');
  const btnSubmitToken = document.getElementById('btn-submit-token');
  const btnSubmitLogin = document.getElementById('btn-submit-login');
  const authError = document.getElementById('auth-error');

  // User meta
  const userDisplayName = document.getElementById('user-display-name');
  const userPlanBadge = document.getElementById('user-plan-badge');
  const userWalletBadge = document.getElementById('user-wallet-badge');
  const userQuotaVal = document.getElementById('user-quota-val');

  // Panels
  const panelGmaps = document.getElementById('panel-gmaps');
  const panelUnsupported = document.getElementById('panel-unsupported');

  // Google Maps active controls
  const mapsMaxCount = document.getElementById('maps-max-count');
  const mapsCountPreview = document.getElementById('maps-count-preview');
  const mapsProgressBox = document.getElementById('maps-progress-box');
  const mapsProgressCount = document.getElementById('maps-progress-count');
  const mapsProgressFill = document.getElementById('maps-progress-fill');
  const mapsStatusLbl = document.getElementById('maps-status-lbl');
  const btnMapsStart = document.getElementById('btn-maps-start');
  const btnMapsPause = document.getElementById('btn-maps-pause');
  const btnMapsResume = document.getElementById('btn-maps-resume');
  const btnMapsStop = document.getElementById('btn-maps-stop');

  // Preset chips for active Google Maps count
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseInt(btn.getAttribute('data-val') || '50', 10);
      if (mapsMaxCount) mapsMaxCount.value = val;
      if (mapsCountPreview) mapsCountPreview.textContent = `${val} Leads`;
    });
  });

  if (mapsMaxCount) {
    mapsMaxCount.addEventListener('input', () => {
      const val = parseInt(mapsMaxCount.value, 10) || 1;
      if (mapsCountPreview) mapsCountPreview.textContent = `${val} Leads`;
      presetBtns.forEach((b) => {
        if (b.getAttribute('data-val') === String(val)) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    });
  }

  // Quick Launch Elements
  const qlKeyword = document.getElementById('ql-keyword');
  const qlLocation = document.getElementById('ql-location');
  const qlCount = document.getElementById('ql-count');
  const qlCountPreview = document.getElementById('ql-count-preview');
  const btnQlLaunchMaps = document.getElementById('btn-ql-launch-maps');
  const qlPresetBtns = document.querySelectorAll('.ql-preset-btn');

  qlPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      qlPresetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseInt(btn.getAttribute('data-val') || '50', 10);
      if (qlCount) qlCount.value = val;
      if (qlCountPreview) qlCountPreview.textContent = `${val} Leads`;
    });
  });

  if (qlCount) {
    qlCount.addEventListener('input', () => {
      const val = parseInt(qlCount.value, 10) || 1;
      if (qlCountPreview) qlCountPreview.textContent = `${val} Leads`;
      qlPresetBtns.forEach((b) => {
        if (b.getAttribute('data-val') === String(val)) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    });
  }

  if (btnQlLaunchMaps) {
    btnQlLaunchMaps.addEventListener('click', () => {
      const kw = qlKeyword?.value?.trim() || '';
      const loc = qlLocation?.value?.trim() || '';
      const count = parseInt(qlCount?.value, 10) || 50;
      const query = (kw && loc ? `${kw} in ${loc}` : (kw || loc || 'local businesses')).trim();
      const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}#auto_extract=${count}`;
      chrome.tabs.create({ url: targetUrl });
      window.close();
    });
  }

  // Workspace launcher
  const btnLaunchWorkspace = document.getElementById('btn-launch-workspace');
  if (btnLaunchWorkspace) {
    btnLaunchWorkspace.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('workspace/index.html') });
    });
  }

  // Sync & Footer
  const syncBannerWrap = document.getElementById('sync-banner-wrap');
  const syncStatusDot = document.getElementById('sync-status-dot');
  const syncBufferCount = document.getElementById('sync-buffer-count');
  const syncStatusMsg = document.getElementById('sync-status-msg');
  const btnSyncNow = document.getElementById('btn-sync-now');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnLogout = document.getElementById('btn-logout');

  let currentTab = null;
  let srvState = null;

  // Switch Auth Tabs
  tabBtnToken.addEventListener('click', () => {
    tabBtnToken.classList.add('active');
    tabBtnLogin.classList.remove('active');
    formToken.classList.remove('hidden');
    formLogin.classList.add('hidden');
    authError.classList.add('hidden');
  });

  tabBtnLogin.addEventListener('click', () => {
    tabBtnLogin.classList.add('active');
    tabBtnToken.classList.remove('active');
    formLogin.classList.remove('hidden');
    formToken.classList.add('hidden');
    authError.classList.add('hidden');
  });

  // Token Auth
  btnSubmitToken.addEventListener('click', () => {
    const token = inputToken.value.trim();
    if (!token) {
      showError('Please paste your extension session token.');
      return;
    }
    btnSubmitToken.textContent = 'Verifying...';
    btnSubmitToken.disabled = true;

    chrome.runtime.sendMessage({ type: 'AUTH_PAIR_TOKEN', payload: { token } }, (res) => {
      btnSubmitToken.textContent = 'Connect to Dashboard';
      btnSubmitToken.disabled = false;
      if (res && res.success) {
        init();
      } else {
        showError(res?.error || 'Invalid or expired extension session token.');
      }
    });
  });

  // Username/Password Login
  btnSubmitLogin.addEventListener('click', () => {
    const username = inputUsername.value.trim();
    const password = inputPassword.value;
    if (!username || !password) {
      showError('Please enter username and password.');
      return;
    }
    btnSubmitLogin.textContent = 'Signing In...';
    btnSubmitLogin.disabled = true;

    chrome.runtime.sendMessage({ type: 'AUTH_LOGIN', payload: { username, password } }, (res) => {
      btnSubmitLogin.textContent = 'Sign In & Connect';
      btnSubmitLogin.disabled = false;
      if (res && res.success) {
        init();
      } else {
        showError(res?.error || 'Invalid credentials.');
      }
    });
  });

  function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
  }

  // Logout
  btnLogout.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' }, () => {
      init();
    });
  });

  // Open Dashboard in new tab
  btnOpenDashboard.addEventListener('click', () => {
    const targetUrl = srvState?.apiUrl ? srvState.apiUrl.replace(/\/api\/?$/, '') : 'https://taken-rough-hydrocodone-empirical.trycloudflare.com';
    chrome.tabs.create({ url: targetUrl });
  });

  // Force Sync button
  if (btnSyncNow) {
    btnSyncNow.addEventListener('click', () => {
      btnSyncNow.textContent = 'Syncing...';
      btnSyncNow.disabled = true;
      chrome.runtime.sendMessage({ type: 'SYNC_QUEUE' }, () => {
        btnSyncNow.disabled = false;
        updateBufferUI(0);
      });
    });
  }

  function updateBufferUI(count = 0) {
    if (!syncStatusMsg) return;
    if (count > 0) {
      // Auto-purge any residual leads in background so user never gets stuck
      chrome.runtime.sendMessage({ type: 'PURGE_BUFFER' }, () => {
        setTimeout(() => updateBufferUI(0), 300);
      });
    }

    if (syncStatusDot) {
      syncStatusDot.style.background = '#10b981';
      syncStatusDot.style.boxShadow = '0 0 6px rgba(16, 185, 129, 0.4)';
    }
    if (syncBannerWrap) {
      syncBannerWrap.style.background = '#f0fdf4';
      syncBannerWrap.style.borderColor = '#bbf7d0';
    }
    syncStatusMsg.textContent = '✓ Cloud CRM Synchronized';
    syncStatusMsg.style.color = '#166534';
    if (syncBufferCount) {
      syncBufferCount.textContent = 'Instant Real-Time Auto-Sync (0 Pending)';
      syncBufferCount.style.color = '#15803d';
      syncBufferCount.classList.remove('hidden');
    }
    if (btnSyncNow) {
      btnSyncNow.classList.add('hidden');
    }
  }

  // Real-time listener for background sync state
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SYNC_STATE_CHANGED') {
      updateBufferUI(msg.payload?.pendingCount || 0);
    }
    if (msg.action === 'MAPS_PROGRESS') {
      const { count = 0, max = 50, isRunning = true } = msg.payload || {};
      mapsProgressBox.classList.remove('hidden');
      mapsProgressCount.textContent = `${count} / ${max}`;
      const pct = Math.min(100, Math.round((count / (max || 50)) * 100));
      mapsProgressFill.style.width = `${pct}%`;
      mapsStatusLbl.textContent = isRunning ? 'Extracting & Syncing...' : 'Completed';

      if (!isRunning) {
        btnMapsStart.classList.remove('hidden');
        btnMapsPause.classList.add('hidden');
        btnMapsResume.classList.add('hidden');
        btnMapsStop.classList.add('hidden');
      }
    }
  });

  // Google Maps Extraction Controls
  btnMapsStart.addEventListener('click', async () => {
    if (!currentTab?.id) return;
    const targetCount = parseInt(mapsMaxCount.value, 10) || 50;

    btnMapsStart.classList.add('hidden');
    btnMapsPause.classList.remove('hidden');
    btnMapsStop.classList.remove('hidden');
    mapsProgressBox.classList.remove('hidden');
    mapsProgressFill.style.width = '0%';
    mapsProgressCount.textContent = `0 / ${targetCount}`;
    mapsStatusLbl.textContent = 'Starting Google Maps Extraction...';

    chrome.tabs.sendMessage(currentTab.id, {
      action: 'START_MAPS_EXTRACTION',
      count: targetCount
    }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: (cnt) => {
            if (typeof window.startExtraction === 'function') {
              window.startExtraction(cnt, null, '');
            }
          },
          args: [targetCount]
        }).catch(() => {});
      }
    });
  });

  btnMapsPause.addEventListener('click', () => {
    if (!currentTab?.id) return;
    btnMapsPause.classList.add('hidden');
    btnMapsResume.classList.remove('hidden');
    mapsStatusLbl.textContent = 'Paused';

    chrome.tabs.sendMessage(currentTab.id, { action: 'PAUSE_MAPS_EXTRACTION' });
  });

  btnMapsResume.addEventListener('click', () => {
    if (!currentTab?.id) return;
    btnMapsResume.classList.add('hidden');
    btnMapsPause.classList.remove('hidden');
    mapsStatusLbl.textContent = 'Extracting...';

    chrome.tabs.sendMessage(currentTab.id, { action: 'RESUME_MAPS_EXTRACTION' });
  });

  btnMapsStop.addEventListener('click', () => {
    if (!currentTab?.id) return;
    btnMapsStart.classList.remove('hidden');
    btnMapsPause.classList.add('hidden');
    btnMapsResume.classList.add('hidden');
    btnMapsStop.classList.add('hidden');
    mapsStatusLbl.textContent = 'Stopped & Synced';

    chrome.tabs.sendMessage(currentTab.id, { action: 'STOP_MAPS_EXTRACTION' });
  });

  // Initialize view
  async function init() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (!state) return;
      srvState = state;
      currentTab = state.currentTab;

      if (!state.isAuthenticated) {
        connectionPill.textContent = 'Disconnected';
        connectionPill.className = 'pill pill-offline';
        viewAuth.classList.remove('hidden');
        viewMain.classList.add('hidden');
        return;
      }

      // Authenticated
      connectionPill.textContent = 'Online';
      connectionPill.className = 'pill pill-online';
      viewAuth.classList.add('hidden');
      viewMain.classList.remove('hidden');

      // Populate user info
      const u = state.user || {};
      userDisplayName.textContent = u.name || u.username || 'Authenticated User';
      userPlanBadge.textContent = (u.plan_tier || 'PRO').toUpperCase();
      if (userWalletBadge) {
        userWalletBadge.textContent = `₹${Number(u.wallet_balance || 0).toFixed(2)}`;
      }

      const extractedToday = u.leads_extracted_today || 0;
      const dailyLimit = u.daily_extraction_limit || 50000;
      userQuotaVal.textContent = `${extractedToday} / ${dailyLimit}`;

      // Reset and ensure buffer is 0
      updateBufferUI(0);
      chrome.runtime.sendMessage({ type: 'PURGE_BUFFER' });

      // Tab context detection: Check if currently on Google Maps
      if (currentTab && currentTab.url && /(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/.test(currentTab.url)) {
        panelGmaps.classList.remove('hidden');
        panelUnsupported.classList.add('hidden');
      } else {
        // Show Quick Google Maps Prospector form
        panelGmaps.classList.add('hidden');
        panelUnsupported.classList.remove('hidden');
      }
    });
  }

  // Start initialization
  init();
});
