# Lead Intelligence & Prospecting Pro - Browser Extension

Production-grade Chrome / Chromium extension for multi-source business lead extraction and real-time synchronization with your SaaS Dashboard.

## Key Capabilities

- **🚀 Power Extractor Pro (Multi-Keyword Batch Workspace)**:
  - Enter multiple search keywords separated by commas or newlines, or upload a `.txt` / `.csv` keyword file.
  - Automated batch crawling across keywords with anti-ban stealth jitter delays.
  - Smart deduplication (removes duplicate businesses by name and phone).
  - Phone validation filter (skips records without a phone number).
  - **Deep Email & Social Hunter**: Automatically fetches company websites in the background to scrape corporate emails and social media links (Instagram, Facebook, LinkedIn, Twitter/X).
  - Real-time streaming data table with instant search and filtering.
  - Instant **CSV & JSON Export**.
  - Direct background cloud synchronization to your central SaaS platform.
- **📍 Google Maps Dual-Engine Extractor**:
  - Intercepts raw internal Google Maps structured JSON for exact phone numbers, categories, ratings, reviews, and address components.
  - Resilient DOM parser fallback covering all modern Google Maps card layouts.
- **🌐 Website Lead Scanner**: Detects verified contact emails (`mailto:` and text patterns), direct phone numbers, addresses, social channels, and business metadata on any webpage.
- **☁️ Real-Time SaaS Dashboard Synchronization**: Automatically syncs extracted leads directly to your central SaaS database via authenticated API with instant WebSocket updates.
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

## How to Extract Leads

### Mode 1: Automated Multi-Keyword Power Workspace (Recommended)
1. Click the extension toolbar icon.
2. Click **⚡ Open Extractor Workspace** (or open `chrome-extension://<id>/workspace/index.html`).
3. Enter keywords (e.g. `Dentists in New York, Plumbers in Chicago, Real Estate in Miami`) or upload a keyword file.
4. Set your options:
   - Remove Duplicates (ON)
   - Skip Without Phone (ON)
   - Deep Email & Social Hunter (ON)
   - Limit per keyword (e.g. 50 leads)
5. Click **🚀 Start Scraping**.
6. The extension will automatically iterate through every keyword on Google Maps, stream leads live into your workspace table, and sync them directly to your SaaS database!
7. Click **⬇ Export CSV** or **⬇ Export JSON** at any time.

### Mode 2: Quick Single-Tab Scraper
1. Navigate to any Google Maps search or single place page.
2. Click the extension icon in your browser toolbar.
3. Select your lead quantity and click **Start Extraction**.
