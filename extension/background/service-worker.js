/**
 * Lead Intelligence & Prospecting Pro - Background Service Worker
 * Manifest V3 Architecture
 */

const DEFAULT_API_URL = 'http://localhost:3000';

// Ensure default settings exist on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['apiUrl', 'leadsBuffer', 'offlineQueue']);
  const updates = {};
  if (!data.apiUrl) updates.apiUrl = DEFAULT_API_URL;
  if (!data.leadsBuffer) updates.leadsBuffer = [];
  if (!data.offlineQueue) updates.offlineQueue = [];
  await chrome.storage.local.set(updates);

  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  console.log('[Service Worker] Lead Intelligence Extension installed successfully.');
});

// Periodic alarm for sync queue processing
chrome.alarms.create('sync_queue_heartbeat', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync_queue_heartbeat') {
    await processOfflineQueue();
  }
});

/**
 * Helper to get active configuration
 */
async function getConfig() {
  const { apiUrl = DEFAULT_API_URL, token = null, user = null } = await chrome.storage.local.get([
    'apiUrl',
    'token',
    'user'
  ]);
  const cleanApiUrl = apiUrl.replace(/\/+$/, '');
  return {
    apiUrl: cleanApiUrl.endsWith('/api') ? cleanApiUrl : `${cleanApiUrl}/api`,
    token,
    user
  };
}

/**
 * Authenticated API caller with timeout & error handling
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
  const timeoutId = setTimeout(() => controller.abort(), 15000);

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
      throw new Error(json.error || json.message || `Request failed (${res.status})`);
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Flush offline / buffered leads to SaaS Dashboard
 */
async function syncLeadsToBackend(leads, jobId = null, source = 'google_maps') {
  if (!leads || leads.length === 0) return { success: true, count: 0 };
  const config = await getConfig();

  if (!config.token) {
    // Save to offline queue for later when logged in
    const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
    await chrome.storage.local.set({ offlineQueue: [...offlineQueue, ...leads] });
    return { success: false, queued: true, message: 'Saved to local queue. Connect account to sync.' };
  }

  try {
    const res = await apiRequest('/extension/sync', {
      method: 'POST',
      body: JSON.stringify({ leads, jobId, source })
    });
    return res;
  } catch (err) {
    console.warn('[Sync Error] Storing leads to offline queue:', err.message);
    const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
    await chrome.storage.local.set({ offlineQueue: [...offlineQueue, ...leads] });
    return { success: false, queued: true, error: err.message };
  }
}

async function processOfflineQueue() {
  const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
  if (offlineQueue.length === 0) return;

  const config = await getConfig();
  if (!config.token) return;

  try {
    const batch = offlineQueue.slice(0, 50);
    const res = await apiRequest('/extension/sync', {
      method: 'POST',
      body: JSON.stringify({ leads: batch })
    });

    if (res.success) {
      const remaining = offlineQueue.slice(50);
      await chrome.storage.local.set({ offlineQueue: remaining });
      console.log(`[Offline Sync] Synced ${batch.length} leads. ${remaining.length} remaining.`);
    }
  } catch (err) {
    console.warn('[Offline Sync Heartbeat Failed]:', err.message);
  }
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

      if (type === 'AUTH_PAIR_TOKEN') {
        const { token } = payload;
        await chrome.storage.local.set({ token });
        try {
          const profileRes = await apiRequest('/extension/profile');
          if (profileRes.user) {
            await chrome.storage.local.set({ user: profileRes.user });
            await processOfflineQueue();
            sendResponse({ success: true, user: profileRes.user });
          } else {
            sendResponse({ success: false, error: 'Failed to retrieve user profile with this token.' });
          }
        } catch (err) {
          await chrome.storage.local.remove(['token', 'user']);
          sendResponse({ success: false, error: err.message });
        }
        return;
      }

      if (type === 'AUTH_LOGOUT') {
        await chrome.storage.local.remove(['token', 'user']);
        await chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
        return;
      }

      if (type === 'GET_STATE') {
        const data = await chrome.storage.local.get([
          'apiUrl',
          'token',
          'user',
          'leadsBuffer',
          'offlineQueue',
          'activeJob'
        ]);

        // Get active tab info
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
          apiUrl: data.apiUrl || DEFAULT_API_URL,
          isAuthenticated: !!data.token,
          user: data.user || null,
          bufferCount: (data.leadsBuffer || []).length,
          offlineQueueCount: (data.offlineQueue || []).length,
          activeJob: data.activeJob || null,
          currentTab
        });
        return;
      }

      if (type === 'LEADS_DISCOVERED') {
        const { leads = [], jobId = null, source = 'google_maps' } = payload;
        const { leadsBuffer = [] } = await chrome.storage.local.get('leadsBuffer');
        const newBuffer = [...leadsBuffer, ...leads];
        await chrome.storage.local.set({ leadsBuffer: newBuffer });

        // Update badge
        await chrome.action.setBadgeText({ text: String(newBuffer.length) });

        // Sync directly to backend
        const syncResult = await syncLeadsToBackend(leads, jobId, source);

        sendResponse({
          success: true,
          totalBuffered: newBuffer.length,
          syncResult
        });
        return;
      }

      if (type === 'CLEAR_BUFFER') {
        await chrome.storage.local.set({ leadsBuffer: [] });
        await chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
        return;
      }

      if (type === 'SET_SETTINGS') {
        const { apiUrl } = payload;
        if (apiUrl) {
          await chrome.storage.local.set({ apiUrl });
        }
        sendResponse({ success: true });
        return;
      }

      sendResponse({ success: false, error: `Unknown message type: ${type}` });
    } catch (error) {
      console.error('[Service Worker Message Handler Error]:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep response channel open for async execution
});

