const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;

// --- HTTP / SSE Server for Sync & Event Broadcast ---
const clients = {}; // session_id -> http response object

let syncSettings = {
  syncInput: true,
  hostSlaveMode: false,
  hostSession: 1
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // SSE Endpoint
  if (req.url.startsWith('/events')) {
    const urlObj = new URL(req.url, 'http://localhost');
    const sessionId = urlObj.searchParams.get('session');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    clients[sessionId] = res;

    // Send initial ping/connection success
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    req.on('close', () => {
      delete clients[sessionId];
    });
    return;
  }

  // Update Settings Endpoint
  if (req.url === '/update-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        syncSettings = { ...syncSettings, ...data };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: syncSettings }));
      } catch (err) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  // Broadcast / State Update Endpoint
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        const sender = eventData.sender;

        // Filter: control events are blocked if sync is disabled or host-slave is off
        const isControlEvent = ['scroll', 'click', 'keydown'].includes(eventData.type);
        let shouldBlock = false;
        
        if (isControlEvent) {
          if (!syncSettings.syncInput) {
            shouldBlock = true;
          } else if (syncSettings.hostSlaveMode) {
            // Host-Slave 모드인 경우, 마스터(renderer)가 아니면서 현재 hostSession이 아닌 세션의 이벤트는 차단
            if (sender !== 'renderer' && String(sender) !== String(syncSettings.hostSession)) {
              shouldBlock = true;
            }
          } else {
            // Host-Slave 모드가 비활성화 상태이면 제어 이벤트 차단
            shouldBlock = true;
          }
        }

        if (!shouldBlock) {
          // Broadcast to all clients (excluding sender if needed, but renderer should get everything)
          Object.keys(clients).forEach(id => {
            // If the sender is a session, don't send back to it. But always send to 'renderer'.
            if (id === 'renderer' || id !== String(sender)) {
              clients[id].write(`data: ${JSON.stringify(eventData)}\n\n`);
            }
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// Start server on local interface
server.listen(8080, '127.0.0.1', () => {
  console.log('Sync server listening on http://127.0.0.1:8080');
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "AMEVA Multi-Session Launcher",
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true // Enable webviews for On-board Mode
    }
  });

  mainWindow.loadFile('index.html');
  
  // Open devtools in development if needed
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

