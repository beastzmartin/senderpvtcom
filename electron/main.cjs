const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const http = require('http');
const { fork } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let currentPort = 3000;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Finds an open/ephemeral port or falls back to preferred port
 */
function findFreePort(preferredPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      // Preferred port busy, find ephemeral port
      const ephemeralServer = net.createServer();
      ephemeralServer.unref();
      ephemeralServer.listen(0, '127.0.0.1', () => {
        const port = ephemeralServer.address().port;
        ephemeralServer.close(() => resolve(port));
      });
    });

    server.listen(preferredPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Polls the backend health check until it responds
 */
function waitForBackendReady(port, maxAttempts = 30) {
  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.warn('[Electron] Backend health check timeout reached. Opening window anyway.');
          resolve(false);
        }
      });
      req.end();
    }, 500);
  });
}

/**
 * Spawns the embedded Express backend inside a background child process
 */
function startBackend(port) {
  // Point persistent data and sessions to user data directory (C:\Users\<user>\AppData\Roaming or ~/Library/Application Support)
  const userDataDir = app.getPath('userData');
  process.env.USER_DATA_PATH = userDataDir;
  process.env.PORT = String(port);
  process.env.DESKTOP_PORT = String(port);

  let backendScript;
  if (app.isPackaged) {
    backendScript = path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'dist', 'index.js');
    if (!require('fs').existsSync(backendScript)) {
      backendScript = path.join(__dirname, '..', 'backend', 'dist', 'index.js');
    }
  } else {
    backendScript = path.join(__dirname, '..', 'backend', 'dist', 'index.js');
  }

  console.log(`[Electron] Starting embedded backend on port ${port}...`);
  console.log(`[Electron] User data directory: ${userDataDir}`);
  console.log(`[Electron] Backend entry script: ${backendScript}`);

  try {
    backendProcess = fork(backendScript, [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(port),
        DESKTOP_PORT: String(port),
        USER_DATA_PATH: userDataDir,
        NODE_ENV: isDev ? 'development' : 'production'
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });

    backendProcess.on('error', (err) => {
      console.error('[Electron] Backend child process error:', err);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Electron] Backend process exited (code=${code}, signal=${signal})`);
    });
  } catch (err) {
    console.error('[Electron] Failed to fork backend process:', err);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'WhatsApp Messaging & Extractor CRM Suite (Desktop Edition)',
    backgroundColor: '#0f172a',
    show: false, // Don't show until ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false // Seamless local socket & media requests
    }
  });

  // Handle external links (WhatsApp chats, web links) in external system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (isDev && process.env.VITE_DEV_SERVER === 'true') {
    console.log('[Electron] Loading Vite Dev Server at http://localhost:5173...');
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      console.log('[Electron] Fallback to embedded backend URL...');
      mainWindow.loadURL(`http://127.0.0.1:${currentPort}`);
    });
  } else {
    // In production, the embedded Express backend serves the compiled Vite app from frontend/dist
    console.log(`[Electron] Loading embedded desktop application from http://127.0.0.1:${currentPort}...`);
    mainWindow.loadURL(`http://127.0.0.1:${currentPort}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('desktop:openExternal', async (_, url) => {
  if (url) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('desktop:getVersion', () => app.getVersion());
ipcMain.handle('desktop:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('desktop:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.handle('desktop:close', () => mainWindow && mainWindow.close());

// App Lifecycle
app.whenReady().then(async () => {
  currentPort = await findFreePort(3000);
  process.env.DESKTOP_PORT = String(currentPort);

  // If in dev and developer is running backend separately (npm run dev), check if backend is already on 3000
  if (isDev) {
    const isAlreadyRunning = await new Promise((res) => {
      const testReq = http.get('http://127.0.0.1:3000/health', (r) => {
        if (r.statusCode === 200) res(true);
        else res(false);
      });
      testReq.on('error', () => res(false));
      testReq.end();
    });

    if (isAlreadyRunning) {
      console.log('[Electron] Detected external backend already running on port 3000. Reusing it.');
      currentPort = 3000;
      process.env.DESKTOP_PORT = '3000';
    } else {
      startBackend(currentPort);
      await waitForBackendReady(currentPort);
    }
  } else {
    startBackend(currentPort);
    await waitForBackendReady(currentPort);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function cleanupBackend() {
  if (backendProcess) {
    console.log('[Electron] Terminating embedded backend child process...');
    try {
      backendProcess.kill('SIGTERM');
    } catch {}
    backendProcess = null;
  }
}

app.on('window-all-closed', () => {
  cleanupBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  cleanupBackend();
});

app.on('before-quit', () => {
  cleanupBackend();
});
