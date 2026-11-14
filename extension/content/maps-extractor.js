/**
 * Lead Intelligence & Prospecting Pro - Advanced Google Maps Extractor
 * Dual-Engine Extraction: Network API Interception + Resilient Multi-Selector DOM Scraper
 * With Deep Address Parsing, Website Email Scraper Hook & Multi-Keyword Batch Automation
 */

(function () {
  if (window.__G_MAPS_EXTRACTOR_INITIALIZED) return;
  window.__G_MAPS_EXTRACTOR_INITIALIZED = true;

  console.log('[Maps Extractor Pro] Content script initialized on Google Maps.');

  let isExtracting = false;
  let isPaused = false;
  let currentKeyword = '';
  let maxLeads = 50;
  let leadsCollected = 0;
  let currentJobId = null;
  let extractedKeys = new Set();
  let hudContainer = null;
  let scrollAttemptsWithoutNewData = 0;

  // Inject Page-World Network Interceptor for raw structured JSON extraction
  function injectInterceptor() {
    try {
      if (document.getElementById('__gmap_interceptor_script')) return;
      const s = document.createElement('script');
      s.id = '__gmap_interceptor_script';
      s.src = chrome.runtime.getURL('content/interceptData.js');
      s.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }
  injectInterceptor();

  /**
   * Floating In-Page Status HUD
   */
  function createHud() {
    if (document.getElementById('gmaps-extractor-hud')) {
      hudContainer = document.getElementById('gmaps-extractor-hud');
      return;
    }

    hudContainer = document.createElement('div');
    hudContainer.id = 'gmaps-extractor-hud';
    hudContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      width: 310px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
      backdrop-filter: blur(12px);
      transition: all 0.2s ease;
    `;

    hudContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 10px; height: 10px; border-radius: 50%; background: #10b981;" id="hud-status-dot"></div>
          <span style="font-weight: 700; font-size: 13px; color: #ffffff;">Power Extractor Pro</span>
        </div>
        <span id="hud-status-text" style="font-size: 11px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.15); padding: 2px 8px; border-radius: 999px;">Ready</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8; font-size: 11px;" id="hud-keyword-label">Active: Direct</span>
        <span style="font-size: 17px; font-weight: 800; color: #34d399;" id="hud-count">0 / 50</span>
      </div>

      <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 999px; overflow: hidden;">
        <div id="hud-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #10b981, #06b6d4); transition: width 0.3s ease;"></div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button id="hud-btn-pause" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.05); color: #e2e8f0; font-weight: 600; font-size: 11px; cursor: pointer;">Pause</button>
        <button id="hud-btn-stop" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; font-size: 11px; cursor: pointer;">Stop & Finish</button>
      </div>
    `;

    document.body.appendChild(hudContainer);

    document.getElementById('hud-btn-pause').addEventListener('click', () => {
      if (isPaused) {
        resumeExtraction();
      } else {
        pauseExtraction();
      }
    });

    document.getElementById('hud-btn-stop').addEventListener('click', () => {
      stopExtraction();
    });
  }

  function updateHud(statusText, isRunning, count, max, keyword = '') {
    if (!hudContainer) createHud();
    const statusDot = document.getElementById('hud-status-dot');
    const statusLabel = document.getElementById('hud-status-text');
    const countLabel = document.getElementById('hud-count');
    const progressBar = document.getElementById('hud-progress-bar');
    const pauseBtn = document.getElementById('hud-btn-pause');
    const kwLabel = document.getElementById('hud-keyword-label');

    if (statusLabel) statusLabel.textContent = statusText;
    if (countLabel) countLabel.textContent = `${count} / ${max || 'All'}`;
    if (kwLabel && keyword) kwLabel.textContent = `Keyword: ${keyword.substring(0, 22)}`;

    const targetMax = max || 100;
    const percent = Math.min(100, Math.round((count / targetMax) * 100));
    if (progressBar) progressBar.style.width = `${percent}%`;

    if (statusDot) {
      statusDot.style.background = isRunning ? '#10b981' : isPaused ? '#f59e0b' : '#94a3b8';
    }

    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    }
  }

  /**
   * Helper: Parse structured raw JSON data intercepted from Google Maps internal /search XHR
   */
  function parseInterceptedResponse() {
    const container = document.getElementById('searchAPIResponseData');
    if (!container || !container.innerText) return [];
    let clean = container.innerText.trim();
    if (!clean) return [];

    try {
      if (clean.startsWith('/*-secure-')) clean = clean.replace('/*-secure-', '').trim();
      if (clean.startsWith(")]}'")) clean = clean.substring(4).trim();

      let parsed = null;
      try {
        parsed = JSON.parse(clean);
      } catch {
        try {
          const sub = JSON.parse(clean.slice(0, -6));
          if (sub && sub.d) {
            parsed = JSON.parse(sub.d.substr(4));
          }
        } catch {}
      }

      if (!parsed) return [];

      let rawItems = [];
      if (Array.isArray(parsed) && parsed[64] && Array.isArray(parsed[64])) {
        rawItems = parsed[64];
      } else if (Array.isArray(parsed[0]) && Array.isArray(parsed[0][1])) {
        rawItems = parsed[0][1];
      } else if (parsed.d && Array.isArray(parsed.d)) {
        rawItems = parsed.d;
      }

      const results = [];
      for (const item of rawItems) {
        if (!item) continue;
        let o = item;
        if (Array.isArray(item) && item.length === 15 && item[14]) o = item[14];
        if (Array.isArray(item) && (item.length === 2 || item.length === 15) && item[1]) o = item[1];

        if (o && typeof o === 'object') {
          const name = String(o[11] || o[14] || '').replace(/[\",\']/g, ' ').trim();
          const fullAddress = String(o[39] || o[2] || '').trim();
          const website = (o[7] && o[7][0]) ? o[7][0] : null;
          const phone = (o[178] && o[178][0] && o[178][0][0]) ? o[178][0][0] : null;
          const rating = (o[4] && o[4][7]) ? parseFloat(o[4][7]) : null;
          const reviewsCount = (o[4] && (o[4][8] || (o[4][3] && o[4][3][1]))) ? parseInt(o[4][8] || o[4][3][1], 10) : 0;
          const category = (o[13] && o[13][0]) ? o[13][0] : 'Local Business';

          if (name && name.length >= 2) {
            const dedupKey = `${name.toLowerCase()}::${(phone || fullAddress).toLowerCase()}`;
            if (!extractedKeys.has(dedupKey)) {
              extractedKeys.add(dedupKey);

              const addressParts = parseAddressComponents(fullAddress);

              results.push({
                business_name: name,
                category: category || 'Local Business',
                phone: phone || null,
                website: website || null,
                address: fullAddress || null,
                street: addressParts.street,
                city: addressParts.city,
                state: addressParts.state,
                postal_code: addressParts.zip,
                rating: !isNaN(rating) ? rating : null,
                reviews_count: reviewsCount || 0,
                operating_status: 'Operational',
                place_id: o[9] || `gmap_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                listing_url: window.location.href,
                source: 'google_maps',
                source_url: window.location.href,
                keyword: currentKeyword || ''
              });
            }
          }
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Helper: Parse street, city, state, zip from full address string
   */
  function parseAddressComponents(fullAddress) {
    if (!fullAddress) return { street: '', city: '', state: '', zip: '' };
    const parts = fullAddress.split(',').map((p) => p.trim());
    let street = '';
    let city = '';
    let state = '';
    let zip = '';

    if (parts.length >= 3) {
      street = parts[0];
      city = parts[parts.length - 2];
      const stateZip = parts[parts.length - 1];
      const zipMatch = stateZip.match(/\b\d{4,6}\b/);
      if (zipMatch) {
        zip = zipMatch[0];
        state = stateZip.replace(zip, '').trim();
      } else {
        state = stateZip;
      }
    } else if (parts.length === 2) {
      street = parts[0];
      city = parts[1];
    } else {
      street = fullAddress;
    }

    return { street, city, state, zip };
  }

  /**
   * Helper: Resilient Multi-Selector DOM Scraper for visible place cards
   */
  function parseVisibleListings() {
    const rawItems = document.querySelectorAll('div.Nv2PK, div.THOPZb, a.hfpxzc, div[jsaction*="mouseover:pane"]');
    const leads = [];

    rawItems.forEach((item) => {
      try {
        const parentCard = item.closest('div.Nv2PK') || item.closest('div.THOPZb') || item;
        const linkEl = parentCard.querySelector('a.hfpxzc') || (item.tagName === 'A' ? item : null);
        const listingUrl = linkEl ? linkEl.getAttribute('href') : null;

        // Name
        const nameEl =
          parentCard.querySelector('div.qBF1Pd') ||
          parentCard.querySelector('div.fontHeadlineSmall') ||
          parentCard.querySelector('.fontHeadlineSmall');
        const name = nameEl ? nameEl.textContent.trim() : (linkEl ? linkEl.getAttribute('aria-label') : null);

        if (!name || name.length < 2 || name === 'Google Maps') return;

        // Ratings & reviews
        let rating = null;
        let reviewsCount = 0;
        const ratingEl = parentCard.querySelector('span.MW4etd');
        if (ratingEl) {
          rating = parseFloat(ratingEl.textContent.trim());
        } else {
          const ariaEl = parentCard.querySelector('span[aria-label*="star"], span[aria-label*="review"]');
          if (ariaEl) {
            const m = ariaEl.getAttribute('aria-label').match(/([0-9.]+)\s*stars?/);
            if (m) rating = parseFloat(m[1]);
          }
        }

        const reviewsEl = parentCard.querySelector('span.UY7F9');
        if (reviewsEl) {
          const cleanCount = reviewsEl.textContent.replace(/[(),]/g, '').trim();
          reviewsCount = parseInt(cleanCount, 10) || 0;
        }

        // Details extraction from secondary info blocks
        let category = 'Local Business';
        let address = '';
        let phone = null;
        let operatingStatus = 'Operational';

        const textBlocks = parentCard.querySelectorAll('div.W4Efsd');
        textBlocks.forEach((block) => {
          const text = block.textContent.trim();
          if (!text) return;

          // Phone detection
          const phoneMatch = text.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/);
          if (phoneMatch && !phone) {
            phone = phoneMatch[0].trim();
          }

          if (text.includes('·')) {
            const parts = text.split('·').map((p) => p.trim());
            if (parts[0] && parts[0].length < 40 && (!category || category === 'Local Business')) {
              category = parts[0];
            }
            for (let i = 1; i < parts.length; i++) {
              const p = parts[i];
              if (!p.includes('Open') && !p.includes('Closed') && !p.includes('+') && !p.match(/\d{5,}/)) {
                if (!address && p.length > 3) address = p;
              }
            }
          } else if (!address && text.length > 4 && !text.includes('Open') && !text.includes('Closed')) {
            address = text;
          }

          if (text.includes('Open') || text.includes('Closed')) {
            operatingStatus = text.includes('Open') ? 'Open' : 'Closed';
          }
        });

        // Website
        let website = null;
        const webEl = parentCard.querySelector('a[data-value="Website"], a.lcr4fd, a[aria-label*="website" i]');
        if (webEl) {
          website = webEl.getAttribute('href');
        }

        // Deduplication key
        const dedupKey = `${name.toLowerCase()}::${(phone || address).toLowerCase()}`;
        if (extractedKeys.has(dedupKey)) return;
        extractedKeys.add(dedupKey);

        const addressParts = parseAddressComponents(address);

        leads.push({
          business_name: name,
          category,
          phone,
          website,
          address: address || null,
          street: addressParts.street,
          city: addressParts.city,
          state: addressParts.state,
          postal_code: addressParts.zip,
          rating: !isNaN(rating) ? rating : null,
          reviews_count: reviewsCount,
          operating_status: operatingStatus,
          place_id: `gmap_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          listing_url: listingUrl || window.location.href,
          source: 'google_maps',
          source_url: window.location.href,
          keyword: currentKeyword || ''
        });
      } catch (err) {}
    });

    return leads;
  }

  /**
   * Helper: Parse single place detail card if Google Maps opened directly on a business
   */
  function parseSinglePlaceDetail() {
    try {
      const nameEl = document.querySelector('h1.DUwDvf') || document.querySelector('h1.fontHeadlineLarge');
      if (!nameEl) return null;
      const name = nameEl.textContent.trim();
      if (!name || name === 'Google Maps') return null;

      // Category
      const catEl = document.querySelector('button.DkEaL') || document.querySelector('button[jsaction*="category"]');
      const category = catEl ? catEl.textContent.trim() : 'Local Business';

      // Address
      const addrEl = document.querySelector('button[data-item-id="address"]') || document.querySelector('div[data-item-id="address"]');
      const address = addrEl ? addrEl.textContent.trim() : '';

      // Website
      const webEl = document.querySelector('a[data-item-id="authority"]') || document.querySelector('a[aria-label*="Website"]');
      const website = webEl ? webEl.getAttribute('href') : null;

      // Phone
      const phoneEl = document.querySelector('button[data-item-id*="phone"]') || document.querySelector('button[aria-label*="Phone"]');
      let phone = null;
      if (phoneEl) {
        const pMatch = phoneEl.textContent.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/);
        if (pMatch) phone = pMatch[0].trim();
      }

      // Rating & Reviews
      let rating = null;
      let reviewsCount = 0;
      const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
      if (ratingEl) {
        rating = parseFloat(ratingEl.textContent.trim());
      }
      const reviewsEl = document.querySelector('div.F7nice span[aria-label*="reviews"]') || document.querySelector('span[aria-label*="reviews"]');
      if (reviewsEl) {
        const clean = reviewsEl.textContent.replace(/[(),]/g, '').trim();
        reviewsCount = parseInt(clean, 10) || 0;
      }

      const dedupKey = `${name.toLowerCase()}::${(phone || address).toLowerCase()}`;
      if (extractedKeys.has(dedupKey)) return null;
      extractedKeys.add(dedupKey);

      const addressParts = parseAddressComponents(address);

      return {
        business_name: name,
        category: category,
        phone: phone,
        website: website,
        address: address || null,
        street: addressParts.street,
        city: addressParts.city,
        state: addressParts.state,
        postal_code: addressParts.zip,
        rating: !isNaN(rating) ? rating : null,
        reviews_count: reviewsCount || 0,
        operating_status: 'Operational',
        place_id: `gmap_single_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        listing_url: window.location.href,
        source: 'google_maps',
        source_url: window.location.href,
        keyword: currentKeyword || ''
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Find results feed container for auto-scrolling
   */
  function findFeedContainer() {
    const selectors = [
      'div[role="feed"]',
      'div.m6QErb[aria-label]',
      'div.m6QErb.DxyBCb',
      'div.m6QErb'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > 300) {
        return el;
      }
    }
    return null;
  }

  /**
   * Extraction loop with auto-scrolling, batch delivery, and keyword completion trigger
   */
  async function runExtractionLoop() {
    createHud();
    scrollAttemptsWithoutNewData = 0;

    while (isExtracting && (maxLeads === 0 || leadsCollected < maxLeads)) {
      if (isPaused) {
        updateHud('Paused', false, leadsCollected, maxLeads, currentKeyword);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      updateHud('Extracting...', true, leadsCollected, maxLeads, currentKeyword);

      // Combine intercepted raw results with DOM parsed items and single place card
      const intercepted = parseInterceptedResponse();
      const visible = parseVisibleListings();
      const single = parseSinglePlaceDetail();
      const combined = [...intercepted, ...visible];
      if (single) combined.push(single);

      if (combined.length > 0) {
        leadsCollected += combined.length;
        scrollAttemptsWithoutNewData = 0;
        updateHud('Syncing...', true, leadsCollected, maxLeads, currentKeyword);

        // Dispatch to background service worker
        try {
          chrome.runtime.sendMessage({
            type: 'LEADS_DISCOVERED',
            payload: {
              leads: combined,
              jobId: currentJobId,
              source: 'google_maps',
              keyword: currentKeyword
            }
          });
        } catch (e) {
          console.warn('[Maps Extractor] Dispatch error:', e);
        }
      } else {
        scrollAttemptsWithoutNewData++;
      }

      // Check target count reached
      if (maxLeads > 0 && leadsCollected >= maxLeads) {
        break;
      }

      // If scrolled several times without any new listings, we reached end of results
      // If we haven't collected any leads yet, give it up to 15 attempts while page renders
      const maxScrollAttempts = leadsCollected === 0 ? 15 : 7;
      if (scrollAttemptsWithoutNewData >= maxScrollAttempts) {
        console.log('[Maps Extractor] Reached end of search feed or maximum scroll threshold.');
        break;
      }

      // Smooth scroll the feed container
      const feed = findFeedContainer();
      if (feed) {
        feed.scrollBy({ top: 500 + Math.floor(Math.random() * 250), behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 500, behavior: 'smooth' });
      }

      // Humanized jitter delay (900ms - 1600ms)
      const delay = 900 + Math.floor(Math.random() * 700);
      await new Promise((r) => setTimeout(r, delay));
    }

    // Finished current keyword / task
    isExtracting = false;
    updateHud('Completed', false, leadsCollected, maxLeads, currentKeyword);

    // Notify background runner that this keyword has finished
    try {
      chrome.runtime.sendMessage({
        type: 'KEYWORD_SCRAPE_FINISHED',
        payload: {
          keyword: currentKeyword,
          count: leadsCollected,
          jobId: currentJobId
        }
      });
    } catch (e) {}
  }

  function startExtraction(targetCount = 50, jobId = null, keyword = '') {
    maxLeads = targetCount;
    currentJobId = jobId;
    currentKeyword = keyword || '';
    leadsCollected = 0;
    isExtracting = true;
    isPaused = false;
    extractedKeys.clear();
    runExtractionLoop();
  }

  function pauseExtraction() {
    isPaused = true;
    updateHud('Paused', false, leadsCollected, maxLeads, currentKeyword);
  }

  function resumeExtraction() {
    isPaused = false;
    updateHud('Extracting...', true, leadsCollected, maxLeads, currentKeyword);
  }

  function stopExtraction() {
    isExtracting = false;
    isPaused = false;
    updateHud('Stopped', false, leadsCollected, maxLeads, currentKeyword);
    try {
      chrome.runtime.sendMessage({
        type: 'SCRAPE_JOB_CANCELLED',
        payload: { keyword: currentKeyword, count: leadsCollected }
      });
    } catch (e) {}
  }

  // Automation: Search a specific keyword directly on Google Maps
  function executeKeywordSearch(keyword) {
    const input = document.querySelector('#searchboxinput, input[name="q"], #UGojuc');
    if (input) {
      input.value = keyword;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      setTimeout(() => {
        const searchBtn = document.querySelector('#searchbox-searchbutton, button[aria-label="Search"], button.nhreHg');
        if (searchBtn) {
          searchBtn.click();
        } else {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
      }, 500);
    } else {
      // If searchbox not found, navigate via URL
      window.location.href = `https://www.google.com/maps/search/${encodeURIComponent(keyword)}`;
    }
  }

  // Listen for control commands
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, payload } = message;

    if (action === 'START_MAPS_EXTRACTION') {
      startExtraction(payload?.count || 50, payload?.jobId || null, payload?.keyword || '');
      sendResponse({ success: true, count: leadsCollected });
      return true;
    }

    if (action === 'EXECUTE_KEYWORD_SEARCH') {
      executeKeywordSearch(payload?.keyword || '');
      sendResponse({ success: true });
      return true;
    }

    if (action === 'PAUSE_MAPS_EXTRACTION') {
      pauseExtraction();
      sendResponse({ success: true });
      return true;
    }

    if (action === 'RESUME_MAPS_EXTRACTION') {
      resumeExtraction();
      sendResponse({ success: true });
      return true;
    }

    if (action === 'STOP_MAPS_EXTRACTION') {
      stopExtraction();
      sendResponse({ success: true, count: leadsCollected });
      return true;
    }

    if (action === 'GET_MAPS_STATUS') {
      sendResponse({
        isExtracting,
        isPaused,
        count: leadsCollected,
        maxLeads,
        keyword: currentKeyword
      });
      return true;
    }
  });

  /**
   * Auto-Start Execution when URL has #auto_extract or ?auto_extract
   * Enables one-click launch from SaaS Dashboard and Extension
   */
  function checkUrlAutoExtract() {
    try {
      const hashStr = window.location.hash || '';
      const searchStr = window.location.search || '';
      const combined = hashStr + '&' + searchStr;

      if (combined.includes('auto_extract')) {
        console.log('[Maps Extractor Pro] Detected auto_extract parameter. Preparing automatic extraction...');

        let count = 50;
        const countMatch = combined.match(/auto_extract=(\d+)/);
        if (countMatch) {
          count = parseInt(countMatch[1], 10);
        }

        let jobId = null;
        const jobMatch = combined.match(/job_id=([a-zA-Z0-9_-]+)/);
        if (jobMatch) {
          jobId = jobMatch[1];
        }

        // Adaptive polling: check every 600ms for feed or place cards to appear, up to 10 attempts
        let attempts = 0;
        const checkTimer = setInterval(() => {
          attempts++;
          const feed = findFeedContainer();
          const hasCards = document.querySelector('div.Nv2PK, div.THOPZb, a.hfpxzc, h1.DUwDvf');
          if (feed || hasCards || attempts >= 8) {
            clearInterval(checkTimer);
            if (!isExtracting) {
              console.log(`[Maps Extractor Pro] Launching auto-extraction: ${count} target leads, job ${jobId}`);
              startExtraction(count, jobId, '');
            }
          }
        }, 600);
      }
    } catch (err) {
      console.warn('[Maps Extractor Pro] Auto-extract check error:', err);
    }
  }

  // Run on load and hashchange
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    checkUrlAutoExtract();
  } else {
    window.addEventListener('DOMContentLoaded', checkUrlAutoExtract);
  }
  window.addEventListener('hashchange', checkUrlAutoExtract);
})();
