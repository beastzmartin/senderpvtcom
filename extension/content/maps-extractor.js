/**
 * Google Maps Lead Extractor - Content Script
 * Extracts business listings, ratings, reviews, phones, addresses, and websites
 */

(function () {
  if (window.__G_MAPS_EXTRACTOR_LOADED) return;
  window.__G_MAPS_EXTRACTOR_LOADED = true;

  console.log('[Maps Extractor] Content script initialized on Google Maps.');

  let isExtracting = false;
  let isPaused = false;
  let extractedPlaceIds = new Set();
  let maxLeads = 50;
  let currentJobId = null;
  let leadsCollected = 0;
  let hudContainer = null;

  /**
   * Floating HUD on the Google Maps page
   */
  function createHud() {
    if (document.getElementById('gmaps-extractor-hud')) return;

    hudContainer = document.createElement('div');
    hudContainer.id = 'gmaps-extractor-hud';
    hudContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      width: 290px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
      transition: all 0.2s ease;
    `;

    hudContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 10px; height: 10px; border-radius: 50%; background: #10b981;" id="hud-status-dot"></div>
          <span style="font-weight: 700; font-size: 13px; color: #0f172a;">Lead Intelligence Pro</span>
        </div>
        <span id="hud-status-text" style="font-size: 11px; font-weight: 600; color: #10b981; background: #ecfdf5; padding: 2px 8px; border-radius: 999px;">Ready</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="color: #64748b; font-size: 12px;">Extracted Leads:</span>
        <span style="font-size: 18px; font-weight: 800; color: #059669;" id="hud-count">0 / 50</span>
      </div>

      <div style="width: 100%; height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden;">
        <div id="hud-progress-bar" style="height: 100%; width: 0%; background: #10b981; transition: width 0.3s ease;"></div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button id="hud-btn-pause" style="flex: 1; padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; font-weight: 600; font-size: 11px; cursor: pointer;">Pause</button>
        <button id="hud-btn-stop" style="flex: 1; padding: 6px 10px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; font-size: 11px; cursor: pointer;">Stop & Sync</button>
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

  function updateHud(statusText, isRunning, count, max) {
    if (!hudContainer) createHud();
    const statusDot = document.getElementById('hud-status-dot');
    const statusLabel = document.getElementById('hud-status-text');
    const countLabel = document.getElementById('hud-count');
    const progressBar = document.getElementById('hud-progress-bar');
    const pauseBtn = document.getElementById('hud-btn-pause');

    if (statusLabel) statusLabel.textContent = statusText;
    if (countLabel) countLabel.textContent = `${count} / ${max}`;

    const percent = Math.min(100, Math.round((count / max) * 100));
    if (progressBar) progressBar.style.width = `${percent}%`;

    if (statusDot) {
      statusDot.style.background = isRunning ? '#10b981' : isPaused ? '#f59e0b' : '#94a3b8';
    }

    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    }
  }

  /**
   * Extract from a single place details page if opened directly
   */
  function parseSinglePlaceDetail() {
    const titleEl = document.querySelector('h1.DUwDvf, h1.fontHeadlineLarge, h1');
    if (!titleEl) return [];
    const name = titleEl.textContent.trim();
    if (!name || name === 'Google Maps' || name.length < 2) return [];

    const placeId = `gmap_single_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (extractedPlaceIds.has(placeId)) return [];

    let rating = null;
    let reviewsCount = 0;
    const ratingEl = document.querySelector('div.F7nice > span > span[aria-hidden="true"], span.ceNzKf');
    if (ratingEl) rating = parseFloat(ratingEl.textContent.trim()) || null;

    const reviewsEl = document.querySelector('div.F7nice > span:nth-child(2) > span > span, button[jsaction*="review"]');
    if (reviewsEl) {
      const match = reviewsEl.textContent.replace(/[(),]/g, '').match(/\d+/);
      if (match) reviewsCount = parseInt(match[0], 10);
    }

    let category = 'Local Business';
    const catBtn = document.querySelector('button[jsaction*="category"], div.fontBodyMedium button.DkEaL');
    if (catBtn) category = catBtn.textContent.trim();

    let address = null;
    const addrBtn = document.querySelector('button[data-item-id="address"] div.fontBodyMedium, button[aria-label*="Address:" i], [data-tooltip*="Copy address" i]');
    if (addrBtn) address = addrBtn.textContent.trim();

    let phone = null;
    const phoneBtn = document.querySelector('button[data-item-id*="phone:"] div.fontBodyMedium, button[aria-label*="Phone:" i], [data-tooltip*="Copy phone number" i]');
    if (phoneBtn) phone = phoneBtn.textContent.trim();

    let website = null;
    const webBtn = document.querySelector('a[data-item-id="authority"], a[aria-label*="Website:" i]');
    if (webBtn) website = webBtn.getAttribute('href');

    let latitude = null;
    let longitude = null;
    const coordMatch = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      latitude = parseFloat(coordMatch[1]);
      longitude = parseFloat(coordMatch[2]);
    }

    extractedPlaceIds.add(placeId);

    return [{
      business_name: name,
      category,
      phone,
      website,
      address,
      rating,
      reviews_count: reviewsCount,
      operating_status: 'Operational',
      place_id: placeId,
      listing_url: window.location.href,
      latitude,
      longitude,
      source: 'google_maps',
      source_url: window.location.href
    }];
  }

  /**
   * Find results scrollable feed container in Google Maps
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
   * Extract business listings from currently visible feed items
   */
  function parseVisibleListings() {
    // If on a single place view
    if (window.location.href.includes('/place/')) {
      const single = parseSinglePlaceDetail();
      if (single.length > 0) return single;
    }

    const rawItems = document.querySelectorAll('div.Nv2PK, div.THOPZb, a.hfpxzc');
    const newLeads = [];

    rawItems.forEach((item) => {
      try {
        let parentCard = item.closest('div.Nv2PK') || item.closest('div.THOPZb') || item;
        let linkEl = parentCard.querySelector('a.hfpxzc') || (item.tagName === 'A' ? item : null);

        let listingUrl = linkEl ? linkEl.getAttribute('href') : null;
        let placeId = linkEl ? (linkEl.getAttribute('data-cid') || linkEl.getAttribute('data-id')) : null;

        if (!placeId && listingUrl) {
          const match = listingUrl.match(/!1s([^!]+)!/);
          if (match) placeId = match[1];
        }

        // Business Name
        let nameEl =
          parentCard.querySelector('div.qBF1Pd') ||
          parentCard.querySelector('div.fontHeadlineSmall') ||
          parentCard.querySelector('.fontHeadlineSmall');
        let name = nameEl ? nameEl.textContent.trim() : (linkEl ? linkEl.getAttribute('aria-label') : null);

        if (!name || name.length < 2) return;

        // Fallback placeId using name
        if (!placeId) {
          placeId = `gmap_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        }

        if (extractedPlaceIds.has(placeId)) return;
        extractedPlaceIds.add(placeId);

        // Rating and reviews
        let rating = null;
        let reviewsCount = 0;
        const ratingEl = parentCard.querySelector('span.MW4etd');
        if (ratingEl) {
          rating = parseFloat(ratingEl.textContent.trim());
        } else {
          const ariaRatingEl = parentCard.querySelector('span[aria-label*="star"], span[aria-label*="review"]');
          if (ariaRatingEl) {
            const m = ariaRatingEl.getAttribute('aria-label').match(/([0-9.]+)\s*stars?/);
            if (m) rating = parseFloat(m[1]);
          }
        }

        const reviewsEl = parentCard.querySelector('span.UY7F9');
        if (reviewsEl) {
          const cleanCount = reviewsEl.textContent.replace(/[(),]/g, '').trim();
          reviewsCount = parseInt(cleanCount, 10) || 0;
        }

        // Subtitle / category & address line
        let category = 'Local Business';
        let address = '';
        let phone = null;
        let operatingStatus = 'Operational';

        const textBlocks = parentCard.querySelectorAll('div.W4Efsd');
        textBlocks.forEach((block) => {
          const text = block.textContent.trim();
          if (!text) return;

          // Check for phone number
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

        // Website link
        let website = null;
        const websiteEl = parentCard.querySelector('a[data-value="Website"], a.lcr4fd, a[aria-label*="website" i]');
        if (websiteEl) {
          website = websiteEl.getAttribute('href');
        }

        // Coordinates from URL
        let latitude = null;
        let longitude = null;
        if (listingUrl) {
          const coordMatch = listingUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
          if (coordMatch) {
            latitude = parseFloat(coordMatch[1]);
            longitude = parseFloat(coordMatch[2]);
          }
        }

        newLeads.push({
          business_name: name,
          category: category,
          phone: phone,
          website: website,
          address: address || null,
          rating: !isNaN(rating) ? rating : null,
          reviews_count: reviewsCount,
          operating_status: operatingStatus,
          place_id: placeId,
          listing_url: listingUrl,
          latitude: latitude,
          longitude: longitude,
          source: 'google_maps',
          source_url: window.location.href
        });
      } catch (err) {
        // Continue parsing subsequent cards
      }
    });

    return newLeads;
  }

  /**
   * Main extraction loop with gentle scrolling & anti-ban jitter
   */
  async function runExtractionLoop() {
    createHud();

    while (isExtracting && leadsCollected < maxLeads) {
      if (isPaused) {
        updateHud('Paused', false, leadsCollected, maxLeads);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      updateHud('Extracting...', true, leadsCollected, maxLeads);

      const batch = parseVisibleListings();
      if (batch.length > 0) {
        leadsCollected += batch.length;
        updateHud('Syncing...', true, leadsCollected, maxLeads);

        // Send to service worker
        try {
          chrome.runtime.sendMessage({
            type: 'LEADS_DISCOVERED',
            payload: {
              leads: batch,
              jobId: currentJobId,
              source: 'google_maps'
            }
          });
        } catch (e) {
          console.warn('[Maps Extractor] Dispatched message error:', e);
        }
      }

      if (leadsCollected >= maxLeads) {
        break;
      }

      // Smooth scroll the feed container
      const feed = findFeedContainer();
      if (feed) {
        feed.scrollBy({ top: 400 + Math.floor(Math.random() * 200), behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 400, behavior: 'smooth' });
      }

      // Jitter delay between 900ms and 1500ms
      const delay = 900 + Math.floor(Math.random() * 600);
      await new Promise((r) => setTimeout(r, delay));
    }

    // Finished
    isExtracting = false;
    updateHud('Completed!', false, leadsCollected, maxLeads);
    setTimeout(() => {
      if (hudContainer && !isExtracting) {
        hudContainer.style.opacity = '0.9';
      }
    }, 4000);
  }

  function startExtraction(targetCount = 50, jobId = null) {
    maxLeads = targetCount;
    currentJobId = jobId;
    isExtracting = true;
    isPaused = false;
    runExtractionLoop();
  }

  function pauseExtraction() {
    isPaused = true;
    updateHud('Paused', false, leadsCollected, maxLeads);
  }

  function resumeExtraction() {
    isPaused = false;
    updateHud('Extracting...', true, leadsCollected, maxLeads);
  }

  function stopExtraction() {
    isExtracting = false;
    isPaused = false;
    updateHud('Stopped', false, leadsCollected, maxLeads);
  }

  // Listen to commands from popup / background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, payload } = message;

    if (action === 'START_MAPS_EXTRACTION') {
      startExtraction(payload?.count || 50, payload?.jobId || null);
      sendResponse({ success: true, count: leadsCollected });
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
        maxLeads
      });
      return true;
    }
  });
})();

