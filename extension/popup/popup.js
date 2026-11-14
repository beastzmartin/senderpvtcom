/**
 * Lead Intelligence & Prospecting Pro - Automated Popup Controller
 * Automatic Page Inspection, Auto-Scan, Auto-Sync & Robust Manifest V3 Fallback
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
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
  const mapsCountPreview = document.getElementById('maps-count-preview');
  const mapsProgressBox = document.getElementById('maps-progress-box');
  const mapsProgressCount = document.getElementById('maps-progress-count');
  const mapsProgressFill = document.getElementById('maps-progress-fill');
  const mapsStatusLbl = document.getElementById('maps-status-lbl');
  const btnMapsStart = document.getElementById('btn-maps-start');
  const btnMapsPause = document.getElementById('btn-maps-pause');
  const btnMapsResume = document.getElementById('btn-maps-resume');
  const btnMapsStop = document.getElementById('btn-maps-stop');

  // Preset chips for Google Maps custom count
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

  // Website elements
  const btnScanWeb = document.getElementById('btn-scan-web');
  const webPreviewBox = document.getElementById('web-preview-box');
  const webPreviewName = document.getElementById('web-preview-name');
  const webPreviewEmail = document.getElementById('web-preview-email');
  const webPreviewPhone = document.getElementById('web-preview-phone');
  const webPreviewSocials = document.getElementById('web-preview-socials');
  const webPreviewAddress = document.getElementById('web-preview-address');
  const webPreviewStatus = document.getElementById('web-preview-status');
  const chkAutoSync = document.getElementById('chk-auto-sync');
  const btnSaveWebLead = document.getElementById('btn-save-web-lead');

  // Sync & Footer
  const syncStatusDot = document.getElementById('sync-status-dot');
  const syncBufferCount = document.getElementById('sync-buffer-count');
  const syncStatusMsg = document.getElementById('sync-status-msg');
  const btnSyncNow = document.getElementById('btn-sync-now');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnLogout = document.getElementById('btn-logout');
  const btnLaunchWorkspace = document.getElementById('btn-launch-workspace');

  if (btnLaunchWorkspace) {
    btnLaunchWorkspace.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('workspace/index.html') });
    });
  }

  let currentTab = null;
  let scannedWebLead = null;
  let srvState = null;

  // Restore auto-sync user preference
  const pref = await chrome.storage.local.get('autoSyncEnabled');
  if (chkAutoSync) {
    chkAutoSync.checked = pref.autoSyncEnabled !== false;
    chkAutoSync.addEventListener('change', () => {
      chrome.storage.local.set({ autoSyncEnabled: chkAutoSync.checked });
    });
  }

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
    const targetUrl = srvState?.apiUrl ? srvState.apiUrl.replace(/\/api\/?$/, '') : 'https://taken-rough-hydrocodone-empirical.trycloudflare.com';
    chrome.tabs.create({ url: targetUrl });
  });

  // Sync now
  btnSyncNow.addEventListener('click', () => {
    btnSyncNow.textContent = 'Syncing...';
    btnSyncNow.disabled = true;
    chrome.runtime.sendMessage({ type: 'SYNC_QUEUE' }, (res) => {
      btnSyncNow.disabled = false;
      if (res && res.success) {
        updateBufferUI(0);
      } else {
        btnSyncNow.textContent = 'Retry Sync';
      }
    });
  });

  function updateBufferUI(count) {
    if (!syncStatusMsg) return;
    if (count > 0) {
      if (syncStatusDot) syncStatusDot.style.background = '#f59e0b';
      syncStatusMsg.textContent = 'Pending Cloud Sync';
      syncStatusMsg.style.color = '#b45309';
      if (syncBufferCount) {
        syncBufferCount.textContent = `${count} lead${count === 1 ? '' : 's'} waiting to upload`;
        syncBufferCount.classList.remove('hidden');
      }
      if (btnSyncNow) {
        btnSyncNow.classList.remove('hidden');
        btnSyncNow.textContent = 'Sync Now';
      }
    } else {
      if (syncStatusDot) syncStatusDot.style.background = '#10b981';
      syncStatusMsg.textContent = '✓ All leads synced to Cloud CRM';
      syncStatusMsg.style.color = '#047857';
      if (syncBufferCount) {
        syncBufferCount.textContent = '';
        syncBufferCount.classList.add('hidden');
      }
      if (btnSyncNow) {
        btnSyncNow.classList.add('hidden');
      }
    }
  }

  // Real-time listener for background sync state
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SYNC_STATE_CHANGED') {
      updateBufferUI(msg.payload?.pendingCount || 0);
    }
  });

  /**
   * Self-contained in-page scanner function injected directly into any tab
   * Bypasses content script messaging limitations entirely
   */
  function inPageScanner() {
    function isValidEmail(email) {
      if (!email || email.length < 5 || email.length > 80) return false;
      const lower = email.toLowerCase().trim();
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.svg') || lower.endsWith('.webp') || lower.endsWith('.gif')) return false;
      const blacklisted = ['domain.com', 'example.com', 'yourname@', 'sentry.io', 'wixpress.com', 'email@', 'user@'];
      if (blacklisted.some((bl) => lower.includes(bl))) return false;
      return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(lower);
    }

    function cleanPhone(raw) {
      if (!raw) return null;
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) return null;
      return raw.trim().replace(/\s+/g, ' ');
    }

    // 1. Business Name
    let businessName = '';
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (ogSite && ogSite.content) businessName = ogSite.content.trim();

    if (!businessName) {
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of ldScripts) {
        try {
          const d = JSON.parse(s.textContent || '{}');
          if (d.name && (d['@type'] === 'Organization' || d['@type'] === 'LocalBusiness' || d['@type'] === 'Corporation')) {
            businessName = d.name.trim();
            break;
          }
        } catch {}
      }
    }

    if (!businessName && document.title) {
      let t = document.title.split(/[|\-–—:]/)[0].trim();
      t = t.replace(/^(home|welcome to|official site|about us|contact us)\s*/i, '').trim();
      if (t.length > 1 && t.length < 60) businessName = t;
    }

    if (!businessName) {
      const host = window.location.hostname.replace(/^www\./i, '').split('.')[0];
      businessName = host.charAt(0).toUpperCase() + host.slice(1);
    }

    // 2. Emails
    const emailsSet = new Set();
    document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
      const em = (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
      if (isValidEmail(em)) emailsSet.add(em.toLowerCase());
    });

    const bodyText = document.body ? document.body.innerText : '';
    const regexEmails = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    regexEmails.forEach((em) => {
      if (isValidEmail(em)) emailsSet.add(em.toLowerCase());
    });

    // 3. Phones
    const phonesSet = new Set();
    document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
      const p = cleanPhone((a.getAttribute('href') || '').replace(/^tel:/i, '').trim());
      if (p) phonesSet.add(p);
    });

    const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
    const blocks = document.querySelectorAll('footer, header, address, [class*="contact" i], [id*="contact" i], [class*="footer" i]');
    blocks.forEach((b) => {
      const matches = (b.innerText || '').match(phoneRegex) || [];
      matches.forEach((m) => {
        const p = cleanPhone(m);
        if (p) phonesSet.add(p);
      });
    });

    // 4. Social Links
    const socials = {};
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (href.includes('linkedin.com/company/') || href.includes('linkedin.com/in/')) socials.linkedin = href;
      else if (href.includes('facebook.com/') && !href.includes('sharer')) socials.facebook = href;
      else if (href.includes('instagram.com/')) socials.instagram = href;
      else if ((href.includes('twitter.com/') || href.includes('x.com/')) && !href.includes('intent/tweet')) socials.twitter = href;
      else if (href.includes('youtube.com/') && !href.includes('watch')) socials.youtube = href;
      else if (href.includes('wa.me/') || href.includes('whatsapp.com')) socials.whatsapp = href;
    });

    // 5. Address
    let address = '';
    const addrTag = document.querySelector('address');
    if (addrTag && addrTag.innerText.trim().length > 5) {
      address = addrTag.innerText.replace(/\s+/g, ' ').trim();
    }

    // 6. Description
    const descMeta = document.querySelector('meta[name="description"], meta[property="og:description"]');
    const description = descMeta ? descMeta.getAttribute('content') : '';

    return {
      business_name: businessName,
      website: window.location.origin,
      source_url: window.location.href,
      email: Array.from(emailsSet)[0] || null,
      emails: Array.from(emailsSet),
      phone: Array.from(phonesSet)[0] || null,
      phones: Array.from(phonesSet),
      social_profiles: socials,
      address: address || null,
      company_description: description || null,
      source: 'website_extractor'
    };
  }

  /**
   * Automatic Website Scanner - runs immediately when popup is opened on any website
   */
  async function autoScanWebsite(tabId) {
    if (!tabId) return;

    if (webPreviewStatus) webPreviewStatus.textContent = 'Auto-Scanning';
    if (webPreviewName) webPreviewName.textContent = 'Analyzing page structure...';
    if (webPreviewEmail) webPreviewEmail.textContent = 'Scanning emails...';
    if (webPreviewPhone) webPreviewPhone.textContent = 'Scanning phones...';

    let leadData = null;

    // Step 1: Try messaging existing content script
    try {
      leadData = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'SCAN_WEBSITE' }, (res) => {
          if (chrome.runtime.lastError || !res?.data) {
            resolve(null);
          } else {
            resolve(res.data);
          }
        });
      });
    } catch {
      leadData = null;
    }

    // Step 2: Robust Fallback via chrome.scripting.executeScript
    if (!leadData) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageScanner
        });
        leadData = results?.[0]?.result || null;
      } catch (scriptErr) {
        console.warn('[Popup] Dynamic inPageScanner execution:', scriptErr);
      }
    }

    if (!leadData) {
      if (webPreviewStatus) webPreviewStatus.textContent = 'Ready';
      if (webPreviewName) webPreviewName.textContent = 'Click to scan this page';
      if (webPreviewEmail) webPreviewEmail.textContent = 'None detected';
      if (webPreviewPhone) webPreviewPhone.textContent = 'None detected';
      return;
    }

    scannedWebLead = leadData;
    if (webPreviewStatus) webPreviewStatus.textContent = 'Discovered';
    if (webPreviewName) webPreviewName.textContent = scannedWebLead.business_name || 'Business Found';
    if (webPreviewEmail) webPreviewEmail.textContent = scannedWebLead.email || 'None found';
    if (webPreviewPhone) webPreviewPhone.textContent = scannedWebLead.phone || 'None found';
    if (webPreviewAddress) webPreviewAddress.textContent = scannedWebLead.address || 'None detected';

    const socialCount = Object.values(scannedWebLead.social_profiles || {}).filter(Boolean).length;
    if (webPreviewSocials) webPreviewSocials.textContent = `${socialCount} social channel${socialCount === 1 ? '' : 's'}`;

    // Auto-Sync to CRM if enabled
    const shouldAutoSync = chkAutoSync ? chkAutoSync.checked : true;
    if (shouldAutoSync && (scannedWebLead.business_name || scannedWebLead.email || scannedWebLead.phone)) {
      triggerSaveWebLead(true);
    }
  }

  function triggerSaveWebLead(isAuto = false) {
    if (!scannedWebLead) return;

    if (!isAuto) {
      btnSaveWebLead.textContent = 'Saving...';
      btnSaveWebLead.disabled = true;
    } else {
      if (webPreviewStatus) webPreviewStatus.textContent = 'Auto-Syncing...';
    }

    chrome.runtime.sendMessage(
      {
        type: 'LEADS_DISCOVERED',
        payload: {
          leads: [scannedWebLead],
          source: 'website_extractor'
        }
      },
      (res) => {
        if (webPreviewStatus) webPreviewStatus.textContent = '✓ Saved in CRM';
        btnSaveWebLead.textContent = '✓ Saved to Dashboard!';
        btnSaveWebLead.classList.remove('btn-success');
        btnSaveWebLead.classList.add('btn-secondary');

        // Trigger in-page toast notification
        if (currentTab?.id) {
          try {
            chrome.tabs.sendMessage(currentTab.id, {
              action: 'SHOW_TOAST',
              payload: { text: `Lead "${scannedWebLead.business_name}" saved to SaaS dashboard!` }
            });
          } catch {}
        }

        setTimeout(() => {
          btnSaveWebLead.textContent = '✓ Save to SaaS Dashboard';
          btnSaveWebLead.disabled = false;
          btnSaveWebLead.classList.add('btn-success');
          btnSaveWebLead.classList.remove('btn-secondary');
        }, 2500);
      }
    );
  }

  btnSaveWebLead.addEventListener('click', () => {
    triggerSaveWebLead(false);
  });

  btnScanWeb.addEventListener('click', () => {
    if (currentTab?.id) {
      autoScanWebsite(currentTab.id);
    }
  });

  /**
   * Ensure Google Maps extractor script is loaded in tab
   */
  async function ensureGoogleMapsInjected(tabId) {
    if (!tabId) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/maps-extractor.js']
      });
    } catch (e) {
      console.warn('[Popup] Maps script inject:', e);
    }
  }

  // Google Maps start extraction
  btnMapsStart.addEventListener('click', async () => {
    const count = parseInt(mapsMaxCount.value, 10) || 50;
    if (!currentTab?.id) return;

    btnMapsStart.textContent = 'Initializing...';
    await ensureGoogleMapsInjected(currentTab.id);

    chrome.tabs.sendMessage(currentTab.id, { action: 'START_MAPS_EXTRACTION', payload: { count } }, (res) => {
      btnMapsStart.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Start Automatic Extraction
      `;
      setMapsExtractingState(true, false, 0, count);
    });
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

  function setMapsExtractingState(isRunning, isPaused, count = 0, max = 50) {
    if (isRunning) {
      btnMapsStart.classList.add('hidden');
      mapsProgressBox.classList.remove('hidden');
      btnMapsStop.classList.remove('hidden');

      if (isPaused) {
        btnMapsPause.classList.add('hidden');
        btnMapsResume.classList.remove('hidden');
        if (mapsStatusLbl) mapsStatusLbl.textContent = 'Paused';
      } else {
        btnMapsPause.classList.remove('hidden');
        btnMapsResume.classList.add('hidden');
        if (mapsStatusLbl) mapsStatusLbl.textContent = 'Extracting...';
      }

      mapsProgressCount.textContent = `${count} / ${max}`;
      const pct = Math.min(100, Math.round((count / max) * 100));
      mapsProgressFill.style.width = `${pct}%`;
    } else {
      btnMapsStart.classList.remove('hidden');
      mapsProgressBox.classList.add('hidden');
      btnMapsStop.classList.add('hidden');
      btnMapsPause.classList.add('hidden');
      btnMapsResume.classList.add('hidden');
    }
  }

  function showGoogleMapsPanel() {
    tabTypeText.textContent = 'Google Maps Active';
    tabTypeBadge.style.color = '#059669';
    panelGmaps.classList.remove('hidden');
    panelWebsite.classList.add('hidden');
    panelUnsupported.classList.add('hidden');

    if (currentTab?.id) {
      ensureGoogleMapsInjected(currentTab.id);
      chrome.tabs.sendMessage(currentTab.id, { action: 'GET_MAPS_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.isExtracting) {
          setMapsExtractingState(true, res.isPaused, res.count, res.maxLeads);
        }
      });
    }
  }

  function showWebsitePanel(hostname) {
    tabTypeText.textContent = 'Website Scanner';
    tabTypeBadge.style.color = '#3b82f6';
    panelWebsite.classList.remove('hidden');
    panelGmaps.classList.add('hidden');
    panelUnsupported.classList.add('hidden');

    // Automatically scan the page immediately upon opening!
    if (currentTab?.id) {
      autoScanWebsite(currentTab.id);
    }
  }

  function showUnsupportedTab() {
    tabTypeText.textContent = 'System Page';
    tabTypeBadge.style.color = '#94a3b8';
    panelGmaps.classList.add('hidden');
    panelWebsite.classList.add('hidden');
    panelUnsupported.classList.remove('hidden');
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

  // Start initialization
  init();
});
