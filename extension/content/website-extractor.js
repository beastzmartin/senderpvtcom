/**
 * Website Lead Extractor - Content Script
 * Extracts public business contacts, emails, phone numbers, and social links from web pages
 */

(function () {
  if (window.__WEBSITE_EXTRACTOR_LOADED) return;
  window.__WEBSITE_EXTRACTOR_LOADED = true;

  console.log('[Website Extractor] Content script initialized on', window.location.hostname);

  /**
   * Parse company name from metadata or headings
   */
  function extractBusinessName() {
    // 1. OpenGraph site_name
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    if (ogSiteName && ogSiteName.getAttribute('content')) {
      return ogSiteName.getAttribute('content').trim();
    }

    // 2. Schema.org JSON-LD
    const ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldJsonScripts) {
      try {
        const data = JSON.parse(script.textContent || '{}');
        if (data.name && (data['@type'] === 'Organization' || data['@type'] === 'LocalBusiness' || data['@type'] === 'Corporation')) {
          return data.name.trim();
        }
      } catch {}
    }

    // 3. Clean Title tag
    if (document.title) {
      let title = document.title.split(/[|\-–—:]/)[0].trim();
      title = title.replace(/^(home|welcome to|official site|about us|contact us)\s*/i, '').trim();
      if (title.length > 2 && title.length < 50) return title;
    }

    // 4. Fallback: Hostname capitalization
    const host = window.location.hostname.replace(/^www\./i, '').split('.')[0];
    return host.charAt(0).toUpperCase() + host.slice(1);
  }

  /**
   * Parse emails from mailto links and page text
   */
  function extractEmails() {
    const found = new Set();

    // 1. mailto: links (highest confidence)
    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
    mailtoLinks.forEach((a) => {
      const href = a.getAttribute('href') || '';
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
      if (isValidEmail(email)) found.add(email);
    });

    // 2. Regex scan in text
    const text = document.body ? document.body.innerText : '';
    const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    const matches = text.match(emailRegex) || [];

    for (const em of matches) {
      const email = em.toLowerCase().trim();
      if (isValidEmail(email)) found.add(email);
    }

    return Array.from(found);
  }

  function isValidEmail(email) {
    if (!email || email.length < 5 || email.length > 80) return false;
    const blacklisted = ['domain.com', 'example.com', 'yourname@', 'sentry.io', 'wixpress.com'];
    if (blacklisted.some((bl) => email.includes(bl))) return false;
    if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.svg') || email.endsWith('.webp') || email.endsWith('.gif')) {
      return false;
    }
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  }

  /**
   * Parse phones from tel links and page text
   */
  function extractPhones() {
    const found = new Set();

    // 1. tel: links (highest confidence)
    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    telLinks.forEach((a) => {
      const raw = (a.getAttribute('href') || '').replace(/^tel:/i, '').trim();
      const cleaned = cleanPhoneString(raw);
      if (cleaned) found.add(cleaned);
    });

    // 2. Scan contact / footer blocks
    const contactBlocks = document.querySelectorAll('footer, div[class*="contact" i], div[id*="contact" i], div[class*="footer" i]');
    const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;

    contactBlocks.forEach((block) => {
      const text = block.innerText || '';
      const matches = text.match(phoneRegex) || [];
      for (const m of matches) {
        const cleaned = cleanPhoneString(m);
        if (cleaned) found.add(cleaned);
      }
    });

    return Array.from(found);
  }

  function cleanPhoneString(raw) {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    return trimmed;
  }

  /**
   * Extract social media profile links
   */
  function extractSocialLinks() {
    const socials = {};
    const links = document.querySelectorAll('a[href]');

    links.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (href.includes('linkedin.com/company/') || href.includes('linkedin.com/in/')) {
        if (!socials.linkedin) socials.linkedin = href;
      } else if (href.includes('facebook.com/') && !href.includes('sharer')) {
        if (!socials.facebook) socials.facebook = href;
      } else if (href.includes('instagram.com/')) {
        if (!socials.instagram) socials.instagram = href;
      } else if ((href.includes('twitter.com/') || href.includes('x.com/')) && !href.includes('intent/tweet')) {
        if (!socials.twitter) socials.twitter = href;
      } else if (href.includes('youtube.com/') && !href.includes('watch')) {
        if (!socials.youtube) socials.youtube = href;
      } else if (href.includes('github.com/')) {
        if (!socials.github) socials.github = href;
      }
    });

    return socials;
  }

  /**
   * Extract address
   */
  function extractAddress() {
    // Schema.org
    const ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldJsonScripts) {
      try {
        const data = JSON.parse(script.textContent || '{}');
        if (data.address) {
          if (typeof data.address === 'string') return data.address;
          if (data.address.streetAddress) {
            return `${data.address.streetAddress}, ${data.address.addressLocality || ''} ${data.address.addressCountry || ''}`.trim();
          }
        }
      } catch {}
    }

    const addrTag = document.querySelector('address');
    if (addrTag && addrTag.innerText.trim().length > 5) {
      return addrTag.innerText.replace(/\s+/g, ' ').trim();
    }

    return null;
  }

  /**
   * Scan current page
   */
  function scanCurrentPage() {
    const businessName = extractBusinessName();
    const emails = extractEmails();
    const phones = extractPhones();
    const socials = extractSocialLinks();
    const address = extractAddress();

    const descMeta = document.querySelector('meta[name="description"], meta[property="og:description"]');
    const description = descMeta ? descMeta.getAttribute('content') : null;

    return {
      business_name: businessName,
      website: window.location.origin,
      source_url: window.location.href,
      email: emails[0] || null,
      emails: emails,
      phone: phones[0] || null,
      phones: phones,
      social_profiles: socials,
      address: address,
      company_description: description,
      source: 'website_extractor'
    };
  }

  function showInPageToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 9999999;
      background: ${type === 'success' ? '#059669' : '#0f172a'};
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(-10px);
    `;

    toast.innerHTML = `<span>✓</span><span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Runtime listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'SCAN_WEBSITE') {
      const data = scanCurrentPage();
      sendResponse({ success: true, data });
      return true;
    }

    if (message.action === 'SHOW_TOAST') {
      showInPageToast(message.payload?.text || 'Lead synchronized to dashboard!');
      sendResponse({ success: true });
      return true;
    }
  });
})();

