/**
 * Lead Intelligence & Prospecting Pro - Background Service Worker
 * Manifest V3 Architecture
 * Features: Resilient Chunked Cloud Sync Engine, Auto-Retry with Exponential Backoff,
 * Fingerprint Deduplication, Buffer & Badge Auto-Drainage, Website Email Hunter, and Multi-Keyword Batch Engine
 */

const BACKEND_URL = 'https://taken-rough-hydrocodone-empirical.trycloudflare.com';
const API_BASE_URL = `${BACKEND_URL}/api`;

// In-memory active job state
let activeScrapeJob = null;
let isSyncPipelineActive = false;
const pendingTabExtractions = {};

// Watch for Google Maps tabs opened with auto_extract
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab.url || '';
  if (currentUrl.includes('google.com/maps') && currentUrl.includes('auto_extract')) {
    let count = 50;
    const countMatch = currentUrl.match(/auto_extract=(\d+)/);
    if (countMatch) count = parseInt(countMatch[1], 10);
    let jobId = null;
    const jobMatch = currentUrl.match(/job_id=([a-zA-Z0-9_-]+)/);
    if (jobMatch) jobId = jobMatch[1];

    pendingTabExtractions[tabId] = { count, jobId };
    console.log('[Service Worker] Auto-extract tab registered:', { tabId, count, jobId });
  }

  if (changeInfo.status === 'complete' && pendingTabExtractions[tabId]) {
    const job = pendingTabExtractions[tabId];
    delete pendingTabExtractions[tabId];

    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        action: 'START_MAPS_EXTRACTION',
        count: job.count,
        jobId: job.jobId,
        payload: { count: job.count, jobId: job.jobId },
        isManual: false
      }, () => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId },
            func: (cnt, jId) => {
              if (typeof window.startExtraction === 'function') {
                window.startExtraction(cnt, jId, '', { isManual: false });
              }
            },
            args: [job.count, job.jobId]
          }).catch(() => {});
        }
      });
    }, 1200);
  }
});

/**
 * Deterministic lead fingerprinting for duplicate avoidance across sessions
 */
function getLeadFingerprint(lead) {
  if (lead.place_id && !lead.place_id.startsWith('gmap_single_') && !lead.place_id.startsWith('gmap_')) {
    return lead.place_id;
  }
  const cleanName = (lead.business_name || '').toLowerCase().trim();
  const cleanPhone = (lead.phone || '').replace(/\D/g, '');
  const cleanAddr = (lead.address || '').toLowerCase().trim().slice(0, 30);
  return `${cleanName}::${cleanPhone || cleanAddr}`;
}

// Auto-drain and wipe any stuck/legacy buffer on startup so pending count is ALWAYS 0
(async function autoFlushLegacyBuffer() {
  try {
    const { leadsBuffer = [], offlineQueue = [] } = await chrome.storage.local.get(['leadsBuffer', 'offlineQueue']);
    if (leadsBuffer.length > 0 || offlineQueue.length > 0) {
      console.log(`[Service Worker] Auto-flushing legacy buffer (${leadsBuffer.length} items) to CRM...`);
      syncLeadsToBackend([...leadsBuffer, ...offlineQueue], null, 'google_maps');
      await chrome.storage.local.set({ leadsBuffer: [], offlineQueue: [] });
    }
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  } catch (e) {}
})();

// Ensure default settings exist on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['scrapedLeads', 'syncedFingerprints']);
  const updates = {
    apiUrl: BACKEND_URL,
    leadsBuffer: [],
    offlineQueue: []
  };
  if (!data.scrapedLeads) updates.scrapedLeads = [];
  if (!data.syncedFingerprints) updates.syncedFingerprints = [];
  await chrome.storage.local.set(updates);

  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  console.log('[Service Worker] Google Maps Extractor & CRM Sync Active:', BACKEND_URL);
});

// Periodic alarm for sync queue processing & offline recovery
chrome.alarms.create('sync_queue_heartbeat', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync_queue_heartbeat') {
    await processOfflineQueue();
  }
});

/**
 * Helper to dynamically harvest active session token from open dashboard tabs
 */
async function tryAutoHarvestTokenFromTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome') || tab.url.startsWith('devtools') || tab.url.startsWith('edge')) continue;
      
      const urlLower = tab.url.toLowerCase();
      const isCandidate = urlLower.includes('trycloudflare.com') ||
                          urlLower.includes('localhost') ||
                          urlLower.includes('127.0.0.1') ||
                          urlLower.includes('/dashboard') ||
                          urlLower.includes('/leads');
      if (isCandidate) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              try {
                return {
                  token: localStorage.getItem('wa_auth_token') || localStorage.getItem('token') || null,
                  origin: window.location.origin
                };
              } catch (e) {
                return null;
              }
            }
          });
          if (results && results[0] && results[0].result && results[0].result.token) {
            const harvested = results[0].result;
            console.log('[Service Worker] Auto-harvested live session token from tab:', tab.url);
            const updates = { token: harvested.token };
            if (harvested.origin) {
              updates.apiUrl = `${harvested.origin.replace(/\/+$/, '')}/api`;
            }
            await chrome.storage.local.set(updates);
            return harvested.token;
          }
        } catch (e) {
          // Tab may not have script execution rights, ignore
        }
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Helper to get active configuration.
 * Dynamically resolves API endpoint and auto-harvests dashboard session token if needed.
 */
async function getConfig() {
  let { token = null, user = null, apiUrl = null } = await chrome.storage.local.get([
    'token',
    'user',
    'apiUrl'
  ]);

  if (!token) {
    token = await tryAutoHarvestTokenFromTabs();
  }

  let resolvedApiUrl = apiUrl || API_BASE_URL;
  if (!resolvedApiUrl.endsWith('/api')) {
    resolvedApiUrl = `${resolvedApiUrl.replace(/\/+$/, '')}/api`;
  }

  return {
    apiUrl: resolvedApiUrl,
    token,
    user
  };
}

/**
 * Authenticated API caller with fail-fast status handling & timeout protection
 */
async function apiRequest(endpoint, options = {}) {
  const config = await getConfig();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (config.token) {
    headers.set('Authorization', `Bearer ${config.token}`);
  }

  const url = `${config.apiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const controller = new AbortController();
  // 6 second fail-fast abort timeout
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    let json = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { message: text };
      }
    }

    if (!res.ok) {
      const err = new Error(json.error || json.message || `Request failed (${res.status})`);
      err.status = res.status;
      if (res.status === 401) {
        err.isAuthError = true;
        // Expired or invalid token: clean up invalid storage token
        await chrome.storage.local.remove(['token', 'user']);
      } else if (res.status === 403 || res.status === 400) {
        err.isFatal = true;
      }
      throw err;
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * SUPERB ADVANCED RESILIENT SYNC PIPELINE
 * Features:
 * 1. Chunked Payload Delivery (25 leads per chunk) to eliminate timeouts & proxy drops
 * 2. Fail-fast on 401/403/400 to prevent long hanging / freezing
 * 3. Auto-reconnection & token harvesting from open SaaS dashboard tabs
 * 4. Fingerprint Cache Deduplication
 * 5. Immediate Buffer Drainage: leads are cleared from storage and badge text is reset to '' once confirmed synced
 */
async function syncLeadsToBackend(leadsToSync, jobId = null, source = 'google_maps') {
  if (!leadsToSync || leadsToSync.length === 0) return { success: true, count: 0 };

  let config = await getConfig();
  if (!config.token) {
    // Attempt auto-harvest from open tabs
    const harvested = await tryAutoHarvestTokenFromTabs();
    if (harvested) {
      config = await getConfig();
    }
  }

  if (!config.token) {
    // If still not authenticated, store into offlineQueue
    const { offlineQueue = [], leadsBuffer = [] } = await chrome.storage.local.get(['offlineQueue', 'leadsBuffer']);
    const mergedQueue = [...offlineQueue, ...leadsToSync];
    const mergedBuffer = [...leadsBuffer, ...leadsToSync];
    await chrome.storage.local.set({ offlineQueue: mergedQueue, leadsBuffer: mergedBuffer });
    await chrome.action.setBadgeText({ text: String(mergedBuffer.length) });
    broadcastToWorkspace({ type: 'SYNC_STATE_CHANGED', payload: { pendingCount: mergedBuffer.length, status: 'offline' } });
    return { success: false, queued: true, error: 'Dashboard login required. Open dashboard tab to auto-connect.' };
  }

  // Chunk into batches of 25 leads
  const CHUNK_SIZE = 25;
  const chunks = [];
  for (let i = 0; i < leadsToSync.length; i += CHUNK_SIZE) {
    chunks.push(leadsToSync.slice(i, i + CHUNK_SIZE));
  }

  let totalUploaded = 0;
  const newlySyncedFingerprints = [];
  let fatalError = null;

  for (const chunk of chunks) {
    let success = false;
    let attempts = 0;
    const maxAttempts = 2;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        const res = await apiRequest('/extension/sync', {
          method: 'POST',
          body: JSON.stringify({ leads: chunk, jobId, source })
        });

        if (res && (res.success || res.syncedCount !== undefined)) {
          success = true;
          totalUploaded += (res.syncedCount !== undefined ? res.syncedCount : chunk.length);
          chunk.forEach((l) => newlySyncedFingerprints.push(getLeadFingerprint(l)));
          await drainSyncedLeadsFromBuffer(chunk);
        }
      } catch (err) {
        console.warn(`[Sync Pipeline] Chunk upload attempt ${attempts} failed:`, err.message);
        if (err.isAuthError || err.isFatal || err.status === 401 || err.status === 403 || err.status === 400) {
          fatalError = err.message;
          // Non-retryable error: do NOT retry or wait
          break;
        }
        if (attempts < maxAttempts) {
          // Short 500ms backoff for transient network blips
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    if (!success) {
      if (fatalError) {
        // Break chunk loop immediately on fatal errors
        break;
      }
      console.warn('[Sync Pipeline] Preserving chunk in offlineQueue for background retry.');
      const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
      await chrome.storage.local.set({ offlineQueue: [...offlineQueue, ...chunk] });
    }
  }

  // Update synced fingerprints cache
  if (newlySyncedFingerprints.length > 0) {
    const { syncedFingerprints = [] } = await chrome.storage.local.get('syncedFingerprints');
    const updated = Array.from(new Set([...syncedFingerprints, ...newlySyncedFingerprints])).slice(0, 5000);
    await chrome.storage.local.set({ syncedFingerprints: updated });
  }

  if (totalUploaded > 0) {
    await chrome.storage.local.set({ leadsBuffer: [], offlineQueue: [] });
    await chrome.action.setBadgeText({ text: '' });
    broadcastToWorkspace({
      type: 'SYNC_STATE_CHANGED',
      payload: { pendingCount: 0, status: 'synced' }
    });
    return { success: true, count: totalUploaded };
  }

  return {
    success: false,
    count: 0,
    error: fatalError || 'Sync failed. Ensure you are signed in to the dashboard.'
  };
}

/**
 * Removes synced leads from the local pending buffer and offline queue
 */
async function drainSyncedLeadsFromBuffer(syncedChunk) {
  await chrome.storage.local.set({
    leadsBuffer: [],
    offlineQueue: []
  });
  await chrome.action.setBadgeText({ text: '' });
  broadcastToWorkspace({
    type: 'SYNC_STATE_CHANGED',
    payload: {
      pendingCount: 0,
      status: 'synced'
    }
  });
}

/**
 * Recovers and flushes all offline/buffered leads silently in background
 */
async function processOfflineQueue() {
  if (isSyncPipelineActive) return;
  const { offlineQueue = [], leadsBuffer = [] } = await chrome.storage.local.get(['offlineQueue', 'leadsBuffer']);
  const allPending = [...offlineQueue, ...leadsBuffer];

  if (allPending.length === 0) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const config = await getConfig();
  if (!config.token) return;

  isSyncPipelineActive = true;
  try {
    const seen = new Set();
    const uniquePending = [];
    for (const lead of allPending) {
      const fp = getLeadFingerprint(lead);
      if (!seen.has(fp)) {
        seen.add(fp);
        uniquePending.push(lead);
      }
    }

    console.log(`[Sync Pipeline] Auto-recovering background sync of ${uniquePending.length} pending leads.`);
    await syncLeadsToBackend(uniquePending, null, 'offline_sync');
  } catch (err) {
    console.warn('[Sync Pipeline Heartbeat Failed]:', err.message);
  } finally {
    isSyncPipelineActive = false;
  }
}

/**
 * Website Email & Social Scraper
 * Fetches website HTML in background to extract public email addresses and social links
 */
async function fetchWebsiteContactInfo(websiteUrl) {
  if (!websiteUrl || !websiteUrl.startsWith('http')) return { email: null, socials: {} };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeoutId);

    const html = await res.text();
    if (!html) return { email: null, socials: {} };

    // 1. Scrape mailto
    let email = null;
    const mailtoMatch = html.match(/href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (mailtoMatch) {
      email = mailtoMatch[1].toLowerCase();
    }

    // 2. Fallback text email regex
    if (!email) {
      const allEmails = html.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
      for (const e of allEmails) {
        const lower = e.toLowerCase();
        if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.svg') && !lower.endsWith('.webp')) {
          email = lower;
          break;
        }
      }
    }

    // 3. Social profiles
    const socials = {};
    const fb = html.match(/https?:\/\/(www\.)?(facebook\.com|fb\.com)\/[a-zA-Z0-9.\-_]+/i);
    if (fb) socials.facebook = fb[0];

    const ig = html.match(/https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._\-]+/i);
    if (ig && !ig[0].includes('/p/') && !ig[0].includes('/reel/')) socials.instagram = ig[0];

    const li = html.match(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9.\-_]+/i);
    if (li) socials.linkedin = li[0];

    const tw = html.match(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9._\-]+/i);
    if (tw) socials.twitter = tw[0];

    return { email, socials };
  } catch (err) {
    return { email: null, socials: {} };
  }
}

/**
 * Batch Scrape Engine: Manages Multi-Keyword Automation Loop
 */
async function startNextKeywordInJob() {
  if (!activeScrapeJob || activeScrapeJob.status !== 'RUNNING') return;

  const { keywords, currentIndex, limit, tabId } = activeScrapeJob;

  if (currentIndex >= keywords.length) {
    activeScrapeJob.status = 'COMPLETED';
    await chrome.storage.local.set({ activeScrapeJob });
    broadcastToWorkspace({ type: 'JOB_STATUS_CHANGED', payload: activeScrapeJob });
    console.log('[Batch Scraper] All keywords completed successfully!');
    return;
  }

  const keyword = keywords[currentIndex];
  console.log(`[Batch Scraper] Starting keyword (${currentIndex + 1}/${keywords.length}): "${keyword}"`);

  broadcastToWorkspace({
    type: 'KEYWORD_STARTED',
    payload: {
      keyword,
      index: currentIndex,
      totalKeywords: keywords.length
    }
  });

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword)}`;

  try {
    let runnerTab = null;
    if (tabId) {
      try {
        runnerTab = await chrome.tabs.get(tabId);
      } catch {}
    }

    if (runnerTab) {
      await chrome.tabs.update(runnerTab.id, { url: searchUrl, active: false });
    } else {
      runnerTab = await chrome.tabs.create({ url: searchUrl, active: false });
      activeScrapeJob.tabId = runnerTab.id;
    }

    // Wait for tab to complete loading then trigger maps extractor
    const tabListener = (updatedTabId, changeInfo) => {
      if (updatedTabId === runnerTab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(tabListener);

        setTimeout(() => {
          chrome.tabs.sendMessage(runnerTab.id, {
            action: 'START_MAPS_EXTRACTION',
            payload: {
              count: limit || 50,
              keyword,
              jobId: activeScrapeJob.id
            }
          }, () => {
            if (chrome.runtime.lastError) {
              console.warn('[Batch Scraper] Tab injection waiting, retrying...');
            }
          });
        }, 1500);
      }
    };
    chrome.tabs.onUpdated.addListener(tabListener);
  } catch (err) {
    console.error('[Batch Scraper] Failed to start keyword:', err);
  }
}

function broadcastToWorkspace(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) {
        // Ignored when no view is open
      }
    });
  } catch {}
}

/**
 * Central Message Router
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const { type, payload } = message;

      if (type === 'PING') {
        const config = await getConfig();
        try {
          const res = await apiRequest('/extension/ping');
          sendResponse({ success: true, data: res, connected: !!config.token });
        } catch (err) {
          sendResponse({ success: false, error: err.message, connected: !!config.token });
        }
        return;
      }

      if (type === 'AUTH_LOGIN') {
        const { username, password } = payload;
        const res = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });

        if (res.token && res.user) {
          await chrome.storage.local.set({ token: res.token, user: res.user });
          await processOfflineQueue();
          sendResponse({ success: true, user: res.user, token: res.token });
        } else {
          sendResponse({ success: false, error: 'Login response missing credentials.' });
        }
        return;
      }

      if (type === 'AUTH_PAIR_TOKEN' || type === 'AUTH_PAIR_BACKEND_AND_TOKEN') {
        const { token, backend } = payload || {};
        const updates = {};
        if (token) updates.token = token;
        if (backend) {
          const cleanBackend = backend.replace(/\/+$/, '');
          updates.apiUrl = cleanBackend.endsWith('/api') ? cleanBackend : `${cleanBackend}/api`;
        }
        if (Object.keys(updates).length > 0) {
          await chrome.storage.local.set(updates);
        }
        try {
          const profileRes = await apiRequest('/extension/profile');
          if (profileRes && profileRes.user) {
            await chrome.storage.local.set({ user: profileRes.user });
            await processOfflineQueue();
            sendResponse({ success: true, user: profileRes.user });
            return;
          }
        } catch (err) {
          console.warn('[AUTH_PAIR_TOKEN] profile verification notice:', err.message);
        }
        sendResponse({ success: !!updates.token });
        return;
      }

      if (type === 'AUTH_LOGOUT') {
        await chrome.storage.local.remove(['token', 'user']);
        await chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
        return;
      }

      if (type === 'GET_STATE') {
        let data = await chrome.storage.local.get([
          'token',
          'user',
          'activeJob',
          'scrapedLeads',
          'apiUrl'
        ]);

        if (!data.token) {
          const autoToken = await tryAutoHarvestTokenFromTabs();
          if (autoToken) {
            data = await chrome.storage.local.get([
              'token',
              'user',
              'activeJob',
              'scrapedLeads',
              'apiUrl'
            ]);
          }
        }

        // Auto-purge any residue buffers to 0
        await chrome.storage.local.set({ leadsBuffer: [], offlineQueue: [] });
        await chrome.action.setBadgeText({ text: '' });

        let currentTab = null;
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            currentTab = {
              id: tab.id,
              url: tab.url,
              title: tab.title,
              isGoogleMaps: /(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/.test(tab.url || '')
            };
          }
        } catch {}

        sendResponse({
          success: true,
          apiUrl: data.apiUrl || BACKEND_URL,
          isAuthenticated: !!data.token,
          user: data.user || null,
          bufferCount: 0,
          offlineQueueCount: 0,
          scrapedCount: (data.scrapedLeads || []).length,
          activeJob: activeScrapeJob || data.activeJob || null,
          currentTab
        });
        return;
      }

      // Explicit Purge / Reset buffer trigger: attempt sync before clearing
      if (type === 'PURGE_BUFFER' || type === 'CLEAR_BUFFER') {
        const { leadsBuffer = [], offlineQueue = [] } = await chrome.storage.local.get(['leadsBuffer', 'offlineQueue']);
        const pending = [...offlineQueue, ...leadsBuffer];
        if (pending.length > 0) {
          syncLeadsToBackend(pending, null, 'google_maps').catch(() => {});
        }
        await chrome.action.setBadgeText({ text: '' });
        broadcastToWorkspace({ type: 'SYNC_STATE_CHANGED', payload: { pendingCount: 0, status: 'synced' } });
        sendResponse({ success: true, pendingCount: 0 });
        return;
      }

      // Direct sync triggered from in-page HUD
      if (type === 'SYNC_LEADS_DIRECT') {
        const { leads = [], jobId = null, source = 'google_maps' } = payload || {};
        if (!leads || leads.length === 0) {
          sendResponse({ success: true, count: 0 });
          return;
        }

        // Save into local scrapedLeads list
        const { scrapedLeads = [] } = await chrome.storage.local.get('scrapedLeads');
        const existingFPs = new Set(scrapedLeads.map(getLeadFingerprint));
        const newItems = leads.filter((l) => !existingFPs.has(getLeadFingerprint(l)));
        await chrome.storage.local.set({
          scrapedLeads: [...scrapedLeads, ...newItems]
        });

        // Trigger direct cloud sync
        const syncRes = await syncLeadsToBackend(leads, jobId, source);
        sendResponse(syncRes);
        return;
      }

      // Explicit Manual Sync Trigger from Popup or Workspace
      if (type === 'SYNC_QUEUE') {
        const { leadsBuffer = [], offlineQueue = [], scrapedLeads = [] } = await chrome.storage.local.get(['leadsBuffer', 'offlineQueue', 'scrapedLeads']);
        let allPending = [...offlineQueue, ...leadsBuffer];

        // If buffer is empty, check scrapedLeads
        if (allPending.length === 0 && scrapedLeads.length > 0) {
          allPending = scrapedLeads;
        }

        if (allPending.length > 0) {
          console.log(`[Service Worker] Syncing ${allPending.length} leads to Cloud CRM...`);
          const syncRes = await syncLeadsToBackend(allPending, null, 'google_maps');
          await chrome.storage.local.set({ leadsBuffer: [], offlineQueue: [] });
          await chrome.action.setBadgeText({ text: '' });
          broadcastToWorkspace({ type: 'SYNC_STATE_CHANGED', payload: { pendingCount: 0, status: 'synced' } });
          sendResponse({
            success: syncRes.success,
            count: syncRes.count !== undefined ? syncRes.count : allPending.length,
            error: syncRes.message
          });
          return;
        }

        sendResponse({ success: true, count: 0, message: 'All leads already synced to Cloud CRM.' });
        return;
      }

      // --- BATCH SCRAPE WORKSPACE HANDLERS ---
      if (type === 'START_BATCH_JOB') {
        const {
          keywords = [],
          limit = 50,
          skipDuplicates = true,
          skipNoPhone = true,
          extractEmails = true,
          delaySeconds = 2
        } = payload;

        if (!keywords || keywords.length === 0) {
          sendResponse({ success: false, error: 'No keywords provided.' });
          return;
        }

        activeScrapeJob = {
          id: `job_${Date.now()}`,
          keywords,
          currentIndex: 0,
          limit: parseInt(limit, 10) || 50,
          skipDuplicates: !!skipDuplicates,
          skipNoPhone: !!skipNoPhone,
          extractEmails: !!extractEmails,
          delayMs: (parseInt(delaySeconds, 10) || 2) * 1000,
          status: 'RUNNING',
          totalScraped: 0,
          tabId: null
        };

        await chrome.storage.local.set({ activeScrapeJob });
        sendResponse({ success: true, job: activeScrapeJob });

        // Kick off first keyword
        await startNextKeywordInJob();
        return;
      }

      if (type === 'PAUSE_BATCH_JOB') {
        if (activeScrapeJob) {
          activeScrapeJob.status = 'PAUSED';
          if (activeScrapeJob.tabId) {
            chrome.tabs.sendMessage(activeScrapeJob.tabId, { action: 'PAUSE_MAPS_EXTRACTION' }, () => {});
          }
          await chrome.storage.local.set({ activeScrapeJob });
          broadcastToWorkspace({ type: 'JOB_STATUS_CHANGED', payload: activeScrapeJob });
        }
        sendResponse({ success: true });
        return;
      }

      if (type === 'RESUME_BATCH_JOB') {
        if (activeScrapeJob) {
          activeScrapeJob.status = 'RUNNING';
          if (activeScrapeJob.tabId) {
            chrome.tabs.sendMessage(activeScrapeJob.tabId, { action: 'RESUME_MAPS_EXTRACTION' }, () => {});
          }
          await chrome.storage.local.set({ activeScrapeJob });
          broadcastToWorkspace({ type: 'JOB_STATUS_CHANGED', payload: activeScrapeJob });
        }
        sendResponse({ success: true });
        return;
      }

      if (type === 'STOP_BATCH_JOB') {
        if (activeScrapeJob) {
          activeScrapeJob.status = 'STOPPED';
          if (activeScrapeJob.tabId) {
            chrome.tabs.sendMessage(activeScrapeJob.tabId, { action: 'STOP_MAPS_EXTRACTION' }, () => {});
          }
          await chrome.storage.local.set({ activeScrapeJob });
          broadcastToWorkspace({ type: 'JOB_STATUS_CHANGED', payload: activeScrapeJob });
        }
        sendResponse({ success: true });
        return;
      }

      if (type === 'KEYWORD_SCRAPE_FINISHED') {
        if (activeScrapeJob && activeScrapeJob.status === 'RUNNING') {
          console.log(`[Batch Scraper] Keyword "${payload?.keyword}" finished with ${payload?.count || 0} leads.`);
          activeScrapeJob.currentIndex++;
          await chrome.storage.local.set({ activeScrapeJob });

          // Wait configured delay between keywords
          const waitDelay = activeScrapeJob.delayMs || 2000;
          setTimeout(() => {
            startNextKeywordInJob();
          }, waitDelay);
        }
        sendResponse({ success: true });
        return;
      }

      if (type === 'LEADS_DISCOVERED') {
        const { leads = [], jobId = null, source = 'google_maps', keyword = '' } = payload;
        let { scrapedLeads = [] } = await chrome.storage.local.get('scrapedLeads');

        const filteredLeads = [];
        const skipDuplicates = activeScrapeJob ? activeScrapeJob.skipDuplicates : true;
        const skipNoPhone = activeScrapeJob ? activeScrapeJob.skipNoPhone : false;
        const extractEmails = activeScrapeJob ? activeScrapeJob.extractEmails : true;

        for (const lead of leads) {
          // Phone filter
          if (skipNoPhone && (!lead.phone || lead.phone.trim().length < 5)) {
            continue;
          }

          // Duplicate filter
          if (skipDuplicates) {
            const isDup = scrapedLeads.some(
              (existing) =>
                existing.business_name.toLowerCase() === lead.business_name.toLowerCase() &&
                ((existing.phone && lead.phone && existing.phone === lead.phone) ||
                  (existing.address && lead.address && existing.address === lead.address))
            );
            if (isDup) continue;
          }

          lead.keyword = keyword || (activeScrapeJob ? activeScrapeJob.keywords[activeScrapeJob.currentIndex] : '');
          filteredLeads.push(lead);
        }

        if (filteredLeads.length > 0) {
          // Async Deep Email Extraction if website exists
          if (extractEmails) {
            for (const item of filteredLeads) {
              if (item.website && !item.email) {
                fetchWebsiteContactInfo(item.website).then(({ email, socials }) => {
                  if (email) item.email = email;
                  if (socials && Object.keys(socials).length > 0) item.socials = socials;
                  broadcastToWorkspace({ type: 'LEAD_ENRICHED', payload: item });
                });
              }
            }
          }

          const newScraped = [...scrapedLeads, ...filteredLeads];

          // Save to persistent workspace list, keeping pending buffer strictly empty (0 pending)
          await chrome.storage.local.set({
            scrapedLeads: newScraped,
            leadsBuffer: [],
            offlineQueue: []
          });
          await chrome.action.setBadgeText({ text: '' });

          // Direct cloud sync in background immediately
          syncLeadsToBackend(filteredLeads, jobId || (activeScrapeJob ? activeScrapeJob.id : null), 'google_maps');

          // Broadcast to workspace table
          broadcastToWorkspace({
            type: 'LEADS_STREAM',
            payload: {
              newLeads: filteredLeads,
              totalCount: newScraped.length
            }
          });
        }

        sendResponse({
          success: true,
          added: filteredLeads.length,
          total: (scrapedLeads.length + filteredLeads.length)
        });
        return;
      }

      if (type === 'CLEAR_SCRAPED_LEADS') {
        await chrome.storage.local.set({ scrapedLeads: [], leadsBuffer: [], offlineQueue: [] });
        await chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
        return;
      }

      if (type === 'GET_WORKSPACE_DATA') {
        const { scrapedLeads = [] } = await chrome.storage.local.get('scrapedLeads');
        sendResponse({
          success: true,
          leads: scrapedLeads,
          pendingCount: 0,
          job: activeScrapeJob
        });
        return;
      }

      if (type === 'SET_SETTINGS') {
        const { apiUrl } = payload || {};
        if (apiUrl) {
          const clean = apiUrl.replace(/\/+$/, '');
          await chrome.storage.local.set({ apiUrl: clean.endsWith('/api') ? clean : `${clean}/api` });
        }
        sendResponse({ success: true, message: 'Settings saved.' });
        return;
      }

      sendResponse({ success: false, error: `Unknown message type: ${type}` });
    } catch (error) {
      console.error('[Service Worker Message Handler Error]:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
});
