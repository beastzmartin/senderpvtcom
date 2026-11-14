/**
 * Lead Intelligence & Prospecting Pro - Background Service Worker
 * Manifest V3 Architecture
 * Includes: Multi-Keyword Batch Scraper Engine, Real-time Cloud Sync, Website Email Hunter, and CSV/JSON Export
 */

const BACKEND_URL = 'https://taken-rough-hydrocodone-empirical.trycloudflare.com';
const API_BASE_URL = `${BACKEND_URL}/api`;

// In-memory job state
let activeScrapeJob = null;

// Ensure default settings exist on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['leadsBuffer', 'offlineQueue', 'scrapedLeads']);
  const updates = {
    apiUrl: BACKEND_URL
  };
  if (!data.leadsBuffer) updates.leadsBuffer = [];
  if (!data.offlineQueue) updates.offlineQueue = [];
  if (!data.scrapedLeads) updates.scrapedLeads = [];
  await chrome.storage.local.set(updates);

  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  console.log('[Service Worker] Lead Intelligence Extension active with backend:', BACKEND_URL);
});

// Periodic alarm for sync queue processing
chrome.alarms.create('sync_queue_heartbeat', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync_queue_heartbeat') {
    await processOfflineQueue();
  }
});

/**
 * Helper to get active configuration.
 * Backend URL is permanently locked to the live cloud endpoint and cannot be modified by users.
 */
async function getConfig() {
  const { token = null, user = null } = await chrome.storage.local.get([
    'token',
    'user'
  ]);
  return {
    apiUrl: API_BASE_URL,
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
 * Website Email & Social Scraper
 * Fetches website HTML to extract public email addresses and social links
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
    // All keywords finished
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
        // Ignored if no receiver is listening
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
          'token',
          'user',
          'leadsBuffer',
          'offlineQueue',
          'activeJob',
          'scrapedLeads'
        ]);

        await chrome.storage.local.set({ apiUrl: BACKEND_URL });

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
          apiUrl: BACKEND_URL,
          isAuthenticated: !!data.token,
          user: data.user || null,
          bufferCount: (data.leadsBuffer || []).length,
          offlineQueueCount: (data.offlineQueue || []).length,
          scrapedCount: (data.scrapedLeads || []).length,
          activeJob: activeScrapeJob || data.activeJob || null,
          currentTab
        });
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
        let { scrapedLeads = [], leadsBuffer = [] } = await chrome.storage.local.get([
          'scrapedLeads',
          'leadsBuffer'
        ]);

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
          const newBuffer = [...leadsBuffer, ...filteredLeads];

          await chrome.storage.local.set({
            scrapedLeads: newScraped,
            leadsBuffer: newBuffer
          });

          await chrome.action.setBadgeText({ text: String(newScraped.length) });

          // Direct cloud sync to SaaS backend
          syncLeadsToBackend(filteredLeads, jobId || (activeScrapeJob ? activeScrapeJob.id : null), source);

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
        await chrome.storage.local.set({ scrapedLeads: [], leadsBuffer: [] });
        await chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
        return;
      }

      if (type === 'GET_WORKSPACE_DATA') {
        const { scrapedLeads = [] } = await chrome.storage.local.get('scrapedLeads');
        sendResponse({
          success: true,
          leads: scrapedLeads,
          job: activeScrapeJob
        });
        return;
      }

      if (type === 'SET_SETTINGS') {
        await chrome.storage.local.set({ apiUrl: BACKEND_URL });
        sendResponse({ success: true, message: 'Endpoint permanently locked.' });
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
