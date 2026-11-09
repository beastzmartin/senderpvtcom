# WhatsApp Messenger Pro (Localhost + Real WhatsApp Connection)

A complete, production-quality, full-stack WhatsApp messaging application that runs locally on your computer and connects to your real WhatsApp account via multi-device authentication. Supports addressing to both **International Phone Numbers** and **WhatsApp LID Privacy Identifiers** (e.g. `7757465940199@lid`).

---

## 🌟 Key Features

1. **Real WhatsApp Multi-Device Connection**
   - Connects to your real WhatsApp account using dynamic QR code generation.
   - Live status tracking: `Connected`, `Connecting`, `Disconnected`, `Reconnecting`.
   - Auto-reconnection with exponential backoff on transient network interruptions.
   - Clean session logout and credential clearing on request.
   - Real-time events over **Socket.IO**.
   - **Never simulates connections or fake message delivery.**

2. **WhatsApp LID Messaging Support (Critical Feature)**
   - First-class support for WhatsApp Privacy Identifiers such as `7757465940199@lid`.
   - Automatic `@lid` detection from recipient input.
   - Dedicated `sendMessageToLid(lid, message)` service and API endpoint.
   - Never alters or treats the numeric portion of a LID as a phone number.
   - Retains the exact `@lid` address verbatim in SQLite database records.

3. **Bulk WhatsApp LID Dispatcher**
   - High-throughput batch message sender addressing multiple WhatsApp LIDs.
   - Configurable delay intervals (e.g. 1.0s - 5.0s) for anti-rate-limit and account safety.
   - Templating variables: `{lid}`, `{index}`, `{total}`.
   - Live real-time progress bar and delivery event stream via Socket.IO (`bulk:progress`).
   - One-click loading from extracted community members, contacts, or raw text lists.
   - Downloadable CSV delivery report.

4. **WhatsApp Community & Group Member Extractor**
   - Discovers all participating WhatsApp Groups and Communities.
   - Distinguishes between `Community`, `Announcement Channels`, and `LID Addressing Mode` groups.
   - Extracts masked member identities where phone numbers are private and only LIDs are exposed.
   - Displays full breakdown: total participants, phone-addressed members, and LID-addressed members.
   - One-click actions: "Bulk LID Message", "Save All to Contacts", and "Export Members to CSV".

5. **International Phone Number Messaging**
   - Country code selector with live search and dial codes (`+91`, `+1`, `+44`, `+971`, etc.).
   - Normalization into international standard E.164.
   - Built-in destination availability checking (`onWhatsApp`).
   - Dedicated `sendMessageToPhone(phoneNumber, message)` service and API endpoint.

4. **WhatsApp-Style Conversations View**
   - Real-time conversation thread list with unread counter badges.
   - Filter conversations by `All`, `Phone`, `LID`, or `Unread`.
   - Outgoing and incoming message bubbles with timestamps and delivery tick indicators:
     - 🕒 Pending transmission
     - ✓ Sent by WhatsApp provider
     - ✓✓ Delivered to recipient device
     - ✓✓ Read by recipient (double blue check)
     - ⚠️ Transmission failed (with explicit error log)
   - Real-time incoming message reception via WebSocket (`message:received`).

5. **Contacts Management & CSV Import**
   - Add, edit, delete contacts with support for saving **Phone Number**, **WhatsApp LID**, or **both**.
   - Instant search across name, phone number, and LID.
   - One-click "Chat with Contact" shortcut.
   - Bulk CSV Import with sample template download and validation reports.

6. **Interactive Dashboard & Telemetry**
   - Real-time metrics: Total Sent, Total Received, Active Conversations, Failed Messages.
   - Quick Message Sender widget on dashboard.
   - Live stream of recent message logs and delivery receipts.

---

## 🛠️ Technology Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons
- **Backend**: Node.js + Express (ESM) + TypeScript
- **Database**: SQLite via `better-sqlite3` (synchronous, robust, WAL mode enabled)
- **Real-Time Layer**: Socket.IO
- **WhatsApp Integration Engine**: `@whiskeysockets/baileys` (Multi-Device Web socket protocol)
- **QR Engine**: `qrcode` (real-time Base64 Data URL generation)

---

## 🗄️ Database Architecture

The SQLite database is stored locally at `server/data/whatsapp_messenger.db` and is auto-initialized on first run:

| Table | Purpose |
|---|---|
| `users` | Admin dashboard accounts with scrypt password hashing |
| `whatsapp_sessions` | Multi-device connection state, phone, JID, LID, platform, timestamps |
| `contacts` | Address book storing contact names, phones, LIDs, notes |
| `conversations` | Grouped chat threads indexed by recipient address (`@s.whatsapp.net` or `@lid`) |
| `messages` | Full log of messages with direction, status, provider message ID, provider response JSON, error details, and timestamps |
| `message_status_logs` | Audit trail of message status transitions (`pending` → `sent` → `delivered` → `read` / `failed`) |
| `application_settings` | Key-value application configurations |

---

## 🚀 Quick Start (Localhost Deployment)

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ or v22+ recommended)
- **npm**: v9.0.0 or higher
- A smartphone with an active **WhatsApp** account

### 2. Installation
Clone the repository and install all dependencies:

```bash
# Clone the repository
cd pvtSender

# Install root, backend, and frontend dependencies
npm run install:all
```

### 3. Environment Configuration
An `.env` file is already created from `.env.example`:

```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=whatsapp-sender-super-secret-jwt-key-change-in-prod
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
RATE_LIMIT_MAX=1000
```

### 4. Start the Application
Run the single startup command:

```bash
npm run dev
```

This concurrently starts:
- **Backend API & Socket Server**: `http://localhost:3000`
- **Frontend Dashboard**: `http://localhost:5173`

Open your browser to:
👉 **[http://localhost:5173](http://localhost:5173)**

Default dashboard login credentials:
- **Username**: `admin`
- **Password**: `admin123`

---

## 📲 How to Connect WhatsApp

1. Open `http://localhost:5173` and log in.
2. Click the **WhatsApp Status Badge** or **Connect WhatsApp** button.
3. The dynamic QR code modal will open.
4. On your mobile phone:
   - Open **WhatsApp**.
   - Tap **Settings** (iOS) or **Menu ⋮** (Android).
   - Select **Linked Devices** → **Link a Device**.
   - Point your camera at the QR code displayed on screen.
5. Once scanned, the connection will transition to **Connected** instantly without page reload. Your phone number, account name, and platform will display on the dashboard.

---

## 📡 REST API Documentation

### WhatsApp Connection Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/whatsapp/status` | Returns current connection status, account info, and QR availability |
| `GET` | `/api/whatsapp/qr` | Returns live QR code data URL and expiration countdown |
| `POST` | `/api/whatsapp/connect` | Triggers provider connection initialization |
| `POST` | `/api/whatsapp/disconnect` | Closes socket and clears session credentials |
| `GET` | `/api/whatsapp/check-number?phone=+919876543210` | Validates if phone number is registered on WhatsApp |

### Messaging Endpoints

#### 1. Send by Phone Number
`POST /api/messages/send-phone`
```json
{
  "phoneNumber": "+919876543210",
  "message": "Hello from localhost WhatsApp Messenger!"
}
```

#### 2. Send by WhatsApp LID (Privacy Address)
`POST /api/messages/send-lid`
```json
{
  "lid": "7757465940199@lid",
  "message": "Hello to WhatsApp LID destination!"
}
```

#### 3. Bulk WhatsApp LID Dispatcher
`POST /api/messages/bulk-lid`
```json
{
  "lids": [
    "7757465940199@lid",
    "8819204910294@lid"
  ],
  "message": "Hello {lid}! Announcement update...",
  "delayMs": 1500
}
```

#### 4. Unified Dispatcher
`POST /api/messages/send`
```json
{
  "recipient": "7757465940199@lid",
  "message": "Unified message routing",
  "identifierType": "lid"
}
```

#### 5. List Messages
`GET /api/messages?conversationId=<id>&limit=50&offset=0`

### Community & Group Extractor Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/groups` | Lists all participating WhatsApp groups, communities and announcement channels |
| `GET` | `/api/groups/:id/members` | Extracts full member participant list with masked LIDs, phone numbers, and roles |
| `POST` | `/api/groups/:id/export-contacts` | Automatically imports extracted group/community members into local contacts directory |

### Contacts Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/contacts?search=rahul` | Search and list contacts |
| `POST` | `/api/contacts` | Create contact with phone, LID, or both |
| `PUT` | `/api/contacts/:id` | Update contact |
| `DELETE` | `/api/contacts/:id` | Delete contact |
| `POST` | `/api/contacts/import` | Import contacts from CSV payload |

### Dashboard Telemetry
`GET /api/dashboard/stats`

---

## ⚡ Socket.IO Real-Time Events

| Event | Direction | Payload Description |
|---|---|---|
| `whatsapp:status` | Server → Client | `{ status: "connected" \| "connecting" ..., accountInfo }` |
| `whatsapp:qr` | Server → Client | `{ qr, qrDataUrl, generatedAt, expiresInSeconds }` |
| `whatsapp:connected` | Server → Client | `{ accountInfo: { name, phone, jid, lid, platform } }` |
| `whatsapp:disconnected` | Server → Client | `{}` |
| `message:received` | Server → Client | Full incoming message object from real WhatsApp user |
| `message:sent` | Server → Client | Dispatched outgoing message record |
| `message:failed` | Server → Client | Failed transmission record with error details |
| `message:status` | Server → Client | Receipt updates: `{ providerMessageId, status: "delivered" \| "read" }` |
| `conversation:updated`| Server → Client | Conversation thread refresh notification |

---

## 🧪 Automated Verification Suite

Run the included verification test suite at any time:

```bash
cd server
npm run test:verify
```

Or run via tsx directly:
```bash
cd server
npx tsx tests/verify.ts
```

This verifies:
- SQLite schema integrity and 7 tables.
- Scrypt password hashing and JWT authentication.
- Contact service creation with Phone, LID, and Dual addresses.
- CSV parsing and bulk contact loading.
- Automatic `@lid` detection vs phone detection.
- Unsimulated provider validation for both phone and LID dispatch.
- Dashboard telemetry generation.

---

## 🔒 Security Best Practices Implemented

- **Session Security**: WhatsApp authentication state is stored in `server/data/sessions/baileys_default` with private filesystem permissions and never sent across the network.
- **No Token Leaks**: Frontend never receives private encryption keys or Signal session pre-keys.
- **Rate Limiting**: `express-rate-limit` guards against brute-force attempts on `/api/auth/login` and API floods.
- **CORS Protection**: CORS strictly allows `http://localhost:5173` and `http://127.0.0.1:5173`.
- **Input Validation**: Phone numbers are validated against international E.164 rules, and LIDs are checked for proper numeric + `@lid` formatting.

---

## ❓ Troubleshooting Guide

1. **QR code expired before scanning?**
   - Click "Refresh now" on the QR modal or click "Connect WhatsApp". WhatsApp rotates QR keys every 60 seconds.
2. **Disconnected unexpectedly?**
   - If WhatsApp is disconnected from your phone's Linked Devices list, the server detects `DisconnectReason.loggedOut`, resets the session folder, and allows you to scan a fresh QR code immediately.
3. **Sending to an invalid LID address?**
   - WhatsApp LIDs require real accounts that have established Multi-Device keys. If an unknown or unroutable LID is contacted, the server returns an explicit error: `"WhatsApp provider failed to dispatch to LID address"`, preserving the failure in `message_status_logs`.
4. **Port 3000 or 5173 already in use?**
   - You can change `PORT=3001` in `.env` and `server.port: 5174` in `client/vite.config.ts`.

