# Lead Intelligence & Prospecting Pro - Browser Extension

Production-grade Chrome / Chromium extension for multi-source business lead extraction and real-time synchronization with your SaaS Dashboard.

## Key Capabilities
- **Google Maps Lead Extractor**: Extracts business name, category, rating, reviews count, phone numbers, addresses, websites, and coordinates with smart scroll and anti-ban jitter delays.
- **Website Lead Scanner**: Detects verified contact emails (`mailto:` and text patterns), direct phone numbers, addresses, social channels (LinkedIn, Twitter, Facebook, Instagram, YouTube, GitHub), and business metadata on any webpage.
- **Real-Time SaaS Dashboard Synchronization**: Automatically syncs extracted leads directly to your central SaaS database via authenticated API with instant WebSocket updates.
- **Offline Sync Queue**: Resilient queue that preserves extracted records when disconnected and flushes them automatically upon reconnection.
- **Interactive In-Page HUD**: Floating controls on Google Maps to monitor live extraction progress and pause/stop on the fly.

---

## Installation Guide (Unpacked Extension)

1. Open your Chromium-based browser (Google Chrome, Brave, Microsoft Edge, Arc, etc.).
2. Navigate to `chrome://extensions/` in your address bar.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button.
5. Select the `extension` folder located inside this project:
   ```
   /Users/muzammil/Documents/pvtSender/extension
   ```
6. The extension icon will appear in your browser toolbar!

---

## Connecting to Your Account

1. Open the extension popup by clicking its toolbar icon.
2. Choose your preferred connection method:
   - **Method A (One-Click API Token Pair - Recommended)**:
     - Open your SaaS Dashboard, go to **Lead Intelligence CRM** -> Click **Connect Extension**.
     - Copy your personal Extension Session Token with 1 click.
     - Paste it into the extension popup and click **Connect to Dashboard**.
   - **Method B (Account Login)**:
     - Switch to the "Account Login" tab, enter your SaaS username/email and password, and click **Sign In & Connect**.

---

## How to Extract Leads

### From Google Maps:
1. Navigate to [Google Maps](https://maps.google.com).
2. Search for any business type and location (e.g., `Digital Marketing Agencies in Mumbai` or `Dental Clinics in New York`).
3. Open the extension popup, choose your target lead quantity (e.g. 50 leads), and click **Start Extraction**.
4. The extension will automatically scroll through results, extract full contact details, and synchronize them live to your SaaS dashboard!

### From Any Business Website:
1. Open any company's official website.
2. Open the extension popup and click **Scan & Extract Contacts**.
3. Review the detected contact email, phone, and social profiles.
4. Click **Save to SaaS Dashboard** to sync immediately.
