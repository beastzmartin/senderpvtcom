/**
 * Lead Intelligence & Prospecting Pro - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const connectionPill = document.getElementById('connection-pill');
  const btnSettings = document.getElementById('btn-settings');
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

  // Main elements
  const userDisplayName = document.getElementById('user-display-name');
  const userPlanBadge = document.getElementById('user-plan-badge');
  const userWalletBadge = document.getElementById('user-wallet-badge');
  const userQuotaVal = document.getElementById('user-quota-val');
  const tabTypeBadge = document.getElementById('tab-type-badge');
  const tabTypeText = document.getElementById('tab-type-text');
  const tabDomainText = document.getElementById('tab-domain-text');

  // Panels
  const panelGmaps = document.getElementById('panel-gmaps');
  const panelWebsite = document.getElementById('panel-website');
  const panelUnsupported = document.getElementById('panel-unsupported');

  // Google Maps elements
  const mapsMaxCount = document.getElementById('maps-max-count');
  const mapsProgressBox = document.getElementById('maps-progress-box');
  const mapsProgressCount = document.getElementById('maps-progress-count');
  const mapsProgressFill = document.getElementById('maps-progress-fill');
  const btnMapsStart = document.getElementById('btn-maps-start');
  const btnMapsPause = document.getElementById('btn-maps-pause');
  const btnMapsResume = document.getElementById('btn-maps-resume');
  const btnMapsStop = document.getElementById('btn-maps-stop');

  // Website elements
  const btnScanWeb = document.getElementById('btn-scan-web');
  const webPreviewBox = document.getElementById('web-preview-box');
  const webPreviewName = document.getElementById('web-preview-name');
  const webPreviewEmail = document.getElementById('web-preview-email');
  const webPreviewPhone = document.getElementById('web-preview-phone');
  const webPreviewSocials = document.getElementById('web-preview-socials');
  const btnSaveWebLead = document.getElementById('btn-save-web-lead');

  // Sync & Footer
  const syncBufferCount = document.getElementById('sync-buffer-count');
  const syncStatusMsg = document.getElementById('sync-status-msg');
  const btnSyncNow = document.getElementById('btn-sync-now');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnLogout = document.getElementById('btn-logout');

  let currentTab = null;
  let scannedWebLead = null;
  let srvState = null;

  // Open settings
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

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

  // Submit Token Pair
  btnSubmitToken.addEventListener('click', async () => {
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

  // Submit Account Login
  btnSubmitLogin.addEventListener('click', async () => {
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
    const targetUrl = srvState?.apiUrl ? srvState.apiUrl.replace(/\/api\/?$/, '') : 'http://localhost:3000';
    chrome.tabs.create({ url: targetUrl });
  });

  // Sync now
  btnSyncNow.addEventListener('click', () => {
    btnSyncNow.textContent = 'Syncing...';
    chrome.runtime.sendMessage({ type: 'SYNC_QUEUE' }, () => {
      btnSyncNow.textContent = 'Sync Now';
      updateBufferUI(0);
      syncStatusMsg.textContent = 'All leads up to date!';
    });
  });

  function updateBufferUI(count) {
    syncBufferCount.textContent = `${count} lead${count === 1 ? '' : 's'}`;
  }

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
      const dailyLimit = u.daily_extraction_limit || 500;
      userQuotaVal.textContent = `${extractedToday} / ${dailyLimit}`;

      updateBufferUI(state.bufferCount || 0);

      // Tab context detection
      if (!currentTab || !currentTab.url) {
        showUnsupportedTab();
        return;
      }

      try {
        const urlObj = new URL(currentTab.url);
        tabDomainText.textContent = urlObj.hostname;

        if (state.currentTab.isGoogleMaps) {
          showGoogleMapsPanel();
        } else if (urlObj.protocol.startsWith('http')) {
          showWebsitePanel(urlObj.hostname);
        } else {
          showUnsupportedTab();
        }
      } catch {
        showUnsupportedTab();
      }
    });
  }

  function showUnsupportedTab() {
    tabTypeText.textContent = 'System Page';
    tabTypeBadge.style.color = '#94a3b8';
    panelGmaps.classList.add('hidden');
    panelWebsite.classList.add('hidden');
    panelUnsupported.classList.remove('hidden');
  }

  function showGoogleMapsPanel() {
    tabTypeText.textContent = 'Google Maps Active';
    tabTypeBadge.style.color = '#059669';
    panelGmaps.classList.remove('hidden');
    panelWebsite.classList.add('hidden');
    panelUnsupported.classList.add('hidden');

    // Query status from content script
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'GET_MAPS_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.isExtracting) {
          setMapsExtractingState(true, res.isPaused, res.count, res.maxLeads);
        }
      });
    }
  }

  function setMapsExtractingState(isRunning, isPaused, count = 0, max = 50) {
    if (isRunning) {
      btnMapsStart.classList.add('hidden');
      mapsProgressBox.classList.remove('hidden');
      btnMapsStop.classList.remove('hidden');

      if (isPaused) {
        btnMapsPause.classList.add('hidden');
        btnMapsResume.classList.remove('hidden');
      } else {
        btnMapsPause.classList.remove('hidden');
        btnMapsResume.classList.add('hidden');
      }

      mapsProgressCount.textContent = `${count} / ${max}`;
      const pct = Math.min(100, Math.round((count / max) * 100));
      mapsProgressFill.style.width = `${pct}%`;
    } else {
      btnMapsStart.classList.remove('hidden');
      btnMapsPause.classList.add('hidden');
      btnMapsResume.classList.add('hidden');
      btnMapsStop.classList.add('hidden');
      mapsProgressBox.classList.add('hidden');
    }
  }

  // Google Maps Actions
  btnMapsStart.addEventListener('click', () => {
    const count = parseInt(mapsMaxCount.value, 10) || 50;
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'START_MAPS_EXTRACTION', payload: { count } }, (res) => {
        if (chrome.runtime.lastError) {
          alert('Please refresh the Google Maps page to enable extraction script.');
          return;
        }
        setMapsExtractingState(true, false, 0, count);
      });
    }
  });

  btnMapsPause.addEventListener('click', () => {
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'PAUSE_MAPS_EXTRACTION' }, () => {
        setMapsExtractingState(true, true);
      });
    }
  });

  btnMapsResume.addEventListener('click', () => {
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'RESUME_MAPS_EXTRACTION' }, () => {
        setMapsExtractingState(true, false);
      });
    }
  });

  btnMapsStop.addEventListener('click', () => {
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'STOP_MAPS_EXTRACTION' }, () => {
        setMapsExtractingState(false, false);
      });
    }
  });

  // Website Panel Actions
  function showWebsitePanel(hostname) {
    tabTypeText.textContent = 'Website Scanner';
    tabTypeBadge.style.color = '#3b82f6';
    panelWebsite.classList.remove('hidden');
    panelGmaps.classList.add('hidden');
    panelUnsupported.classList.add('hidden');
  }

  btnScanWeb.addEventListener('click', () => {
    if (!currentTab?.id) return;
    btnScanWeb.textContent = 'Scanning Page...';

    chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_WEBSITE' }, (res) => {
      btnScanWeb.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Scan & Extract Contacts
      `;

      if (chrome.runtime.lastError || !res?.data) {
        alert('Could not inspect page. Please refresh the page and try again.');
        return;
      }

      scannedWebLead = res.data;
      webPreviewName.textContent = scannedWebLead.business_name || 'Unknown Company';
      webPreviewEmail.textContent = scannedWebLead.email || 'None found';
      webPreviewPhone.textContent = scannedWebLead.phone || 'None found';

      const socialCount = Object.values(scannedWebLead.social_profiles || {}).filter(Boolean).length;
      webPreviewSocials.textContent = `${socialCount} social channel${socialCount === 1 ? '' : 's'}`;

      webPreviewBox.classList.remove('hidden');
    });
  });

  btnSaveWebLead.addEventListener('click', () => {
    if (!scannedWebLead) return;
    btnSaveWebLead.textContent = 'Saving...';
    btnSaveWebLead.disabled = true;

    chrome.runtime.sendMessage(
      {
        type: 'LEADS_DISCOVERED',
        payload: {
          leads: [scannedWebLead],
          source: 'website_extractor'
        }
      },
      (res) => {
        btnSaveWebLead.textContent = '✓ Saved to Dashboard!';
        btnSaveWebLead.classList.remove('btn-success');
        btnSaveWebLead.classList.add('btn-secondary');

        // Trigger toast on page
        if (currentTab?.id) {
          chrome.tabs.sendMessage(currentTab.id, {
            action: 'SHOW_TOAST',
            payload: { text: `Lead "${scannedWebLead.business_name}" saved to SaaS dashboard!` }
          });
        }

        setTimeout(() => {
          btnSaveWebLead.textContent = 'Save to SaaS Dashboard';
          btnSaveWebLead.disabled = false;
          btnSaveWebLead.classList.add('btn-success');
          btnSaveWebLead.classList.remove('btn-secondary');
        }, 2000);
      }
    );
  });

  // Start initialization
  init();
});

