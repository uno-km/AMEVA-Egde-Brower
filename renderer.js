const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// UI DOM Elements
const masterUrlInput = document.getElementById('master-url');
const btnGo = document.getElementById('btn-go');
const btnReload = document.getElementById('btn-reload');
const btnLaunchGrid = document.getElementById('btn-launch-grid');
const btnRealignGrid = document.getElementById('btn-realign-grid');
const btnCloseAll = document.getElementById('btn-close-all');
const btnResetProfiles = document.getElementById('btn-reset-profiles');
const statusText = document.getElementById('status-text');

// Settings & Layout Elements
const controlPanel = document.getElementById('control-panel');
const btnSettingsToggle = document.getElementById('btn-settings-toggle');
const themeSelect = document.getElementById('theme-select');
const modeOnboardRadio = document.getElementById('mode-onboard');
const modeExternalRadio = document.getElementById('mode-external');
const browserTypeContainer = document.getElementById('browser-type-container');
const stealthModeContainer = document.getElementById('stealth-mode-container');
const browserEdgeRadio = document.getElementById('browser-edge');
const browserChromeRadio = document.getElementById('browser-chrome');
const zoomScaleInput = document.getElementById('zoom-scale');
const syncInputCheck = document.getElementById('sync-input');
const hostSlaveModeCheck = document.getElementById('host-slave-mode');
const hostSelectContainer = document.getElementById('host-select-container');
const hostSessionSelect = document.getElementById('host-session-select');
const antiFingerprintCheck = document.getElementById('anti-fingerprint');
const humanJitterCheck = document.getElementById('human-jitter');
const stealthModeCheck = document.getElementById('stealth-mode');
const muteAudioCheck = document.getElementById('mute-audio');
const layoutButtons = document.querySelectorAll('.layout-btn');
const customColsInput = document.getElementById('custom-cols');
const customRowsInput = document.getElementById('custom-rows');
const quickBookmarkButtons = document.querySelectorAll('.bookmark-btn');

// View Containers
const dashboardTitle = document.getElementById('dashboard-title');
const sessionCardsContainer = document.getElementById('session-cards-container');
const embeddedGridContainer = document.getElementById('embedded-grid-container');

// Constants & Settings
const MAX_SESSIONS = 6;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

const USER_AGENTS = {
  default: '',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
  macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
};

// Default User-Agent to avoid empty headers in webviews
const BASE_DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// State Store
const spawnedProcesses = {}; // sessionId -> childProcess (for External Mode)
const activeWebviews = {}; // sessionId -> webviewElement (for On-board Mode)
let activeLayout = '2x2';

// 1. Session Configurations State (Local Storage)
const defaultSessionStates = {};
for (let i = 1; i <= MAX_SESSIONS; i++) {
  defaultSessionStates[i] = { proxy: '', userAgent: 'default', lastKnownUrl: 'https://google.com' };
}
let sessionStates = JSON.parse(localStorage.getItem('ameva_session_states')) || defaultSessionStates;

// 2. Global Configuration State (Local Storage)
const defaultGlobalSettings = {
  theme: 'dark',
  executionMode: 'external',
  browserType: 'edge',
  zoomScale: 0.8,
  syncInput: true,
  hostSlaveMode: false,
  hostSession: '1',
  antiFingerprint: true,
  humanJitter: true,
  stealthMode: false,
  muteAudio: false,
  settingsPanelCollapsed: false
};
let globalSettings = JSON.parse(localStorage.getItem('ameva_global_settings')) || defaultGlobalSettings;

function saveSessionStates() {
  localStorage.setItem('ameva_session_states', JSON.stringify(sessionStates));
}

function syncSettingsToServer() {
  fetch('http://127.0.0.1:8080/update-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      syncInput: globalSettings.syncInput,
      hostSlaveMode: globalSettings.hostSlaveMode
    })
  }).catch(() => {});
}

function saveGlobalSettings() {
  localStorage.setItem('ameva_global_settings', JSON.stringify(globalSettings));
  syncSettingsToServer();
}

// Apply visual theme to document body
function applyTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-green', 'theme-transparent');
  document.body.classList.add(`theme-${theme}`);
}

// Check Browser Availability (External Mode)
function getBrowserPath(browserType) {
  if (browserType === 'edge') {
    return fs.existsSync(EDGE_PATH) ? EDGE_PATH : null;
  } else {
    for (const p of CHROME_PATHS) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
}

// Generate the preload script for webviews dynamically
function generatePreloadScript() {
  const preloadPath = path.join(__dirname, 'preload-dynamic.js');
  const preloadJsCode = `
(function() {
  const ua = navigator.userAgent;
  const matchSession = ua.match(/AMEVA_SESSION_(\\d+)/);
  if (!matchSession) return;
  
  const sessionId = parseInt(matchSession[1]);
  const isHost = ua.includes('AMEVA_HOST');
  const antiFingerprint = ua.includes('AMEVA_ANTIFP');
  const humanJitter = ua.includes('AMEVA_JITTER');
  const isSlave = ua.includes('AMEVA_SLAVE');
  
  console.log('[AMEVA Preload] Session ' + sessionId + ' preloaded. Host: ' + isHost + ', AntiFP: ' + antiFingerprint + ', Jitter: ' + humanJitter + ', Slave: ' + isSlave);

  // --- 1. Anti-Fingerprint / Canvas Spoofing ---
  if (antiFingerprint) {
    try {
      const spoofScriptBlock = \`
        const randomConcurrency = \${[2, 4, 6, 8, 12, 16][sessionId % 6]};
        const randomMemory = \${[4, 8, 16][sessionId % 3]};
        
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => randomConcurrency });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => randomMemory });
        
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, contextAttributes) {
          const ctx = originalGetContext.apply(this, arguments);
          if (type === '2d' && ctx) {
            const originalGetImageData = ctx.getImageData;
            ctx.getImageData = function(sx, sy, sw, sh) {
              const imageData = originalGetImageData.apply(this, arguments);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                data[i] = (data[i] + (\${sessionId} % 3)) % 256;
                data[i+1] = (data[i+1] + (\${sessionId} % 2)) % 256;
              }
              return imageData;
            };
          }
          return ctx;
        };

        if (typeof WebGLRenderingContext !== 'undefined') {
          const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37446) {
              return "ANGLE (NVIDIA, NVIDIA GeForce RTX 30" + (60 + \${sessionId} * 5) + " Ti Direct3D11 vs_5_0 ps_5_0)";
            }
            if (parameter === 37445) {
              return "Google Inc. (NVIDIA)";
            }
            return originalGetParameter.apply(this, arguments);
          }
        }
        console.log('[AMEVA Sync] Preload Anti-Fingerprint Active.');
      \`;
      const script = document.createElement('script');
      script.textContent = spoofScriptBlock;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch(e) {
      console.error('[Preload Anti-Fingerprint Error]', e);
    }
  }

  // --- 2. Synchronizer ---
  let isRemoteScroll = false;
  let scrollTimeout;

  const sse = new EventSource('http://127.0.0.1:8080/events?session=' + sessionId);

  sse.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      if (data.sender === sessionId) return;

      if (data.type === 'scroll') {
        if (isHost) return;
        isRemoteScroll = true;
        clearTimeout(scrollTimeout);
        
        const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
        const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
        
        window.scrollTo({
          left: data.percentX * maxScrollX,
          top: data.percentY * maxScrollY,
          behavior: humanJitter ? 'smooth' : 'auto'
        });

        scrollTimeout = setTimeout(function() {
          isRemoteScroll = false;
        }, humanJitter ? 800 : 150);
      } else if (data.type === 'click') {
        if (isHost) return;
        const triggerClick = function() {
          const jitterX = humanJitter ? (Math.random() - 0.5) * 10 : 0;
          const jitterY = humanJitter ? (Math.random() - 0.5) * 10 : 0;
          
          const clientX = data.x * window.innerWidth + jitterX;
          const clientY = data.y * window.innerHeight + jitterY;
          const elem = document.elementFromPoint(clientX, clientY);
          if (elem) {
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: clientX,
              clientY: clientY
            });
            elem.dispatchEvent(clickEvent);
            if (typeof elem.focus === 'function') {
              elem.focus();
            }
          }
        };

        if (humanJitter) {
          setTimeout(triggerClick, 50 + Math.random() * 200);
        } else {
          triggerClick();
        }
      } else if (data.type === 'keydown') {
        if (isHost) return;
        const triggerKey = function() {
          const activeElem = document.activeElement;
          const target = activeElem || document.body;

          const keyEvent = new KeyboardEvent('keydown', {
            key: data.key,
            code: data.code,
            keyCode: data.keyCode,
            ctrlKey: data.ctrlKey,
            altKey: data.altKey,
            shiftKey: data.shiftKey,
            metaKey: data.metaKey,
            bubbles: true,
            cancelable: true
          });
          target.dispatchEvent(keyEvent);

          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            if (data.key.length === 1 && !data.ctrlKey && !data.metaKey && !data.altKey) {
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              target.value = val.substring(0, start) + data.key + val.substring(end);
              target.selectionStart = target.selectionEnd = start + 1;
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (data.key === 'Backspace') {
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              if (start === end && start > 0) {
                target.value = val.substring(0, start - 1) + val.substring(end);
                target.selectionStart = target.selectionEnd = start - 1;
              } else if (start !== end) {
                target.value = val.substring(0, start) + val.substring(end);
                target.selectionStart = target.selectionEnd = start;
              }
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          const keyUpEvent = new KeyboardEvent('keyup', {
            key: data.key,
            code: data.code,
            keyCode: data.keyCode,
            ctrlKey: data.ctrlKey,
            altKey: data.altKey,
            shiftKey: data.shiftKey,
            metaKey: data.metaKey,
            bubbles: true,
            cancelable: true
          });
          target.dispatchEvent(keyUpEvent);
        };

        if (humanJitter) {
          setTimeout(triggerKey, 20 + Math.random() * 60);
        } else {
          triggerKey();
        }
      } else if (data.type === 'navigate') {
        window.location.href = data.url;
      } else if (data.type === 'reload') {
        window.location.reload();
      }
    } catch(err) {
      console.error('[Preload Sync Error]', err);
    }
  };

  // Only broadcast local events if this is NOT a slave (either we are host, or Host-Slave is off)
  const shouldBroadcast = !isSlave;

  if (shouldBroadcast) {
    window.addEventListener('scroll', function() {
      if (isRemoteScroll) return;

      const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
      
      const percentX = maxScrollX > 0 ? (window.scrollX / maxScrollX) : 0;
      const percentY = maxScrollY > 0 ? (window.scrollY / maxScrollY) : 0;

      fetch('http://127.0.0.1:8080/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'scroll',
          sender: sessionId,
          percentX: percentX,
          percentY: percentY
        })
      }).catch(function() {});
    });

    document.addEventListener('click', function(e) {
      if (!e.isTrusted) return;

      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;

      fetch('http://127.0.0.1:8080/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'click',
          sender: sessionId,
          x: x,
          y: y
        })
      }).catch(function() {});
    });

    document.addEventListener('keydown', function(e) {
      if (!e.isTrusted) return;

      fetch('http://127.0.0.1:8080/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'keydown',
          sender: sessionId,
          key: e.key,
          code: e.code,
          keyCode: e.keyCode,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey
        })
      }).catch(function() {});
    });
  }

  // URL Reporting
  let currentUrl = window.location.href;
  function reportStatus() {
    fetch('http://127.0.0.1:8080/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'status',
        sender: sessionId,
        url: window.location.href,
        title: document.title || window.location.hostname
      })
    }).catch(function() {});
  }

  window.addEventListener('load', reportStatus);
  setInterval(function() {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      reportStatus();
    }
  }, 1000);
  reportStatus();
})();
  `;
  fs.writeFileSync(preloadPath, preloadJsCode);
  return preloadPath;
}

// Generate the synchronization extension dynamically for each session (External Mode)
function prepareExtension(sessionId) {
  const baseExtDir = path.join(__dirname, 'profiles', 'extensions');
  const extDir = path.join(baseExtDir, `session-${sessionId}`);

  if (!fs.existsSync(baseExtDir)) {
    fs.mkdirSync(baseExtDir, { recursive: true });
  }
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true });
  }

  const manifest = {
    manifest_version: 3,
    name: `AMEVA Sync Session ${sessionId}`,
    version: "1.0",
    description: "Input mirroring content script dynamically created",
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content.js"],
        run_at: "document_start",
        all_frames: true
      }
    ]
  };

  const isHost = globalSettings.hostSlaveMode && parseInt(globalSettings.hostSession) === sessionId;
  const isSlave = globalSettings.hostSlaveMode && parseInt(globalSettings.hostSession) !== sessionId;

  // Build the script injection for Anti-fingerprinting
  let spoofScriptBlock = '';
  if (globalSettings.antiFingerprint) {
    spoofScriptBlock = `
      // 1. Spoof Navigator parameters
      const randomConcurrency = ${[2, 4, 6, 8, 12, 16][sessionId % 6]};
      const randomMemory = ${[4, 8, 16][sessionId % 3]};
      
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => randomConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => randomMemory });
      
      // 2. Canvas Fingerprint Spoofing (minor pixel perturbation)
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, contextAttributes) {
        const ctx = originalGetContext.apply(this, arguments);
        if (type === '2d' && ctx) {
          const originalGetImageData = ctx.getImageData;
          ctx.getImageData = function(sx, sy, sw, sh) {
            const imageData = originalGetImageData.apply(this, arguments);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              data[i] = (data[i] + (${sessionId} % 3)) % 256;
              data[i+1] = (data[i+1] + (${sessionId} % 2)) % 256;
            }
            return imageData;
          };
        }
        return ctx;
      };

      // 3. WebGL Vendor/Renderer Spoofing
      if (typeof WebGLRenderingContext !== 'undefined') {
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
            return "ANGLE (NVIDIA, NVIDIA GeForce RTX 30" + (60 + ${sessionId} * 5) + " Ti Direct3D11 vs_5_0 ps_5_0)";
          }
          if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
            return "Google Inc. (NVIDIA)";
          }
          return originalGetParameter.apply(this, arguments);
        }
      }
      console.log('[AMEVA Sync] Anti-Fingerprint Active on page context.');
    `;
  }

  // Click & Scroll handler block based on Human Jitter
  let scrollCode = '';
  let clickCode = '';
  let keyCode = '';
  if (globalSettings.humanJitter) {
    scrollCode = `
        if (${isHost}) return;
        isRemoteScroll = true;
        clearTimeout(scrollTimeout);
        
        const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
        const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
        
        // Eased smooth scrolling to emulate human wheel movement
        window.scrollTo({
          left: data.percentX * maxScrollX,
          top: data.percentY * maxScrollY,
          behavior: 'smooth'
        });

        scrollTimeout = setTimeout(function() {
          isRemoteScroll = false;
        }, 800);
    `;
    clickCode = `
        if (${isHost}) return;
        // Simulated delayed click with coordinate offset
        const delay = 50 + Math.random() * 200; // 50ms - 250ms
        const jitterX = (Math.random() - 0.5) * 10; // -5px to 5px
        const jitterY = (Math.random() - 0.5) * 10;
        
        setTimeout(function() {
          const clientX = data.x * window.innerWidth + jitterX;
          const clientY = data.y * window.innerHeight + jitterY;
          const elem = document.elementFromPoint(clientX, clientY);
          if (elem) {
            console.log('[AMEVA Sync] Human-like delayed click on: ', elem);
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: clientX,
              clientY: clientY
            });
            elem.dispatchEvent(clickEvent);
            if (typeof elem.focus === 'function') {
              elem.focus();
            }
          }
        }, delay);
    `;
    keyCode = `
        if (${isHost}) return;
        const delay = 20 + Math.random() * 60;
        setTimeout(function() {
          const activeElem = document.activeElement;
          const target = activeElem || document.body;
          
          const keyEvent = new KeyboardEvent('keydown', {
            key: data.key,
            code: data.code,
            keyCode: data.keyCode,
            ctrlKey: data.ctrlKey,
            altKey: data.altKey,
            shiftKey: data.shiftKey,
            metaKey: data.metaKey,
            bubbles: true,
            cancelable: true
          });
          target.dispatchEvent(keyEvent);

          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            if (data.key.length === 1 && !data.ctrlKey && !data.metaKey && !data.altKey) {
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              target.value = val.substring(0, start) + data.key + val.substring(end);
              target.selectionStart = target.selectionEnd = start + 1;
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (data.key === 'Backspace') {
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              if (start === end && start > 0) {
                target.value = val.substring(0, start - 1) + val.substring(end);
                target.selectionStart = target.selectionEnd = start - 1;
              } else if (start !== end) {
                target.value = val.substring(0, start) + val.substring(end);
                target.selectionStart = target.selectionEnd = start;
              }
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          const keyUpEvent = new KeyboardEvent('keyup', {
            key: data.key,
            code: data.code,
            keyCode: data.keyCode,
            ctrlKey: data.ctrlKey,
            altKey: data.altKey,
            shiftKey: data.shiftKey,
            metaKey: data.metaKey,
            bubbles: true,
            cancelable: true
          });
          target.dispatchEvent(keyUpEvent);
        }, delay);
    `;
  } else {
    scrollCode = `
        if (${isHost}) return;
        isRemoteScroll = true;
        clearTimeout(scrollTimeout);
        
        const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
        const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
        
        window.scrollTo({
          left: data.percentX * maxScrollX,
          top: data.percentY * maxScrollY,
          behavior: 'auto'
        });

        scrollTimeout = setTimeout(function() {
          isRemoteScroll = false;
        }, 150);
    `;
    clickCode = `
        if (${isHost}) return;
        const clientX = data.x * window.innerWidth;
        const clientY = data.y * window.innerHeight;
        const elem = document.elementFromPoint(clientX, clientY);
        if (elem) {
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: clientX,
            clientY: clientY
          });
          elem.dispatchEvent(clickEvent);
          if (typeof elem.focus === 'function') {
            elem.focus();
          }
        }
    `;
    keyCode = `
        if (${isHost}) return;
        const activeElem = document.activeElement;
        const target = activeElem || document.body;
        
        const keyEvent = new KeyboardEvent('keydown', {
          key: data.key,
          code: data.code,
          keyCode: data.keyCode,
          ctrlKey: data.ctrlKey,
          altKey: data.altKey,
          shiftKey: data.shiftKey,
          metaKey: data.metaKey,
          bubbles: true,
          cancelable: true
        });
        target.dispatchEvent(keyEvent);

        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          if (data.key.length === 1 && !data.ctrlKey && !data.metaKey && !data.altKey) {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            target.value = val.substring(0, start) + data.key + val.substring(end);
            target.selectionStart = target.selectionEnd = start + 1;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (data.key === 'Backspace') {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            if (start === end && start > 0) {
              target.value = val.substring(0, start - 1) + val.substring(end);
              target.selectionStart = target.selectionEnd = start - 1;
            } else if (start !== end) {
              target.value = val.substring(0, start) + val.substring(end);
              target.selectionStart = target.selectionEnd = start;
            }
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        const keyUpEvent = new KeyboardEvent('keyup', {
          key: data.key,
          code: data.code,
          keyCode: data.keyCode,
          ctrlKey: data.ctrlKey,
          altKey: data.altKey,
          shiftKey: data.shiftKey,
          metaKey: data.metaKey,
          bubbles: true,
          cancelable: true
        });
        target.dispatchEvent(keyUpEvent);
    `;
  }

  const contentJsCode = `
(function() {
  const sessionId = ${sessionId};
  console.log('[AMEVA Sync] Session ' + sessionId + ' script loaded.');

  // Inject anti-fingerprinting script in main page execution context
  if (${globalSettings.antiFingerprint}) {
    try {
      const script = document.createElement('script');
      script.textContent = \`(function() { ${spoofScriptBlock} })();\`;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch(e) {
      console.error('[Anti-Fingerprint Injection Error]', e);
    }
  }

  let isRemoteScroll = false;
  let scrollTimeout;

  // Connect to Local SSE broadcast server
  const sse = new EventSource('http://127.0.0.1:8080/events?session=' + sessionId);

  sse.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      if (data.sender === sessionId) return;

      if (data.type === 'scroll') {
        ${scrollCode}
      } else if (data.type === 'click') {
        ${clickCode}
      } else if (data.type === 'keydown') {
        ${keyCode}
      } else if (data.type === 'navigate') {
        console.log('[AMEVA Sync] Navigating to: ' + data.url);
        window.location.href = data.url;
      } else if (data.type === 'reload') {
        console.log('[AMEVA Sync] Reloading page.');
        window.location.reload();
      }
    } catch(err) {
      console.error('[AMEVA Sync Error]', err);
    }
  };

  // Only broadcast local events if this is NOT a slave (either we are host, or Host-Slave is off)
  const shouldBroadcast = ${!isSlave};

  if (shouldBroadcast) {
    window.addEventListener('scroll', function() {
      if (isRemoteScroll) return;

      const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
      
      const percentX = maxScrollX > 0 ? (window.scrollX / maxScrollX) : 0;
      const percentY = maxScrollY > 0 ? (window.scrollY / maxScrollY) : 0;

      fetch('http://127.0.0.1:8080/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'scroll',
          sender: sessionId,
          percentX: percentX,
          percentY: percentY
        })
      }).catch(function() {});
    });

    document.addEventListener('click', function(e) {
      if (!e.isTrusted) return; // ignore programmatical clicks

      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;

      fetch('http://127.0.0.1:8080/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'click',
          sender: sessionId,
          x: x,
          y: y
        })
      }).catch(function() {});
    });

    document.addEventListener('keydown', function(e) {
      if (!e.isTrusted) return;

      fetch('http://127.0.0.1:8080/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'keydown',
          sender: sessionId,
          key: e.key,
          code: e.code,
          keyCode: e.keyCode,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey
        })
      }).catch(function() {});
    });
  }

  // URL & Status Update Reporting
  let currentUrl = window.location.href;
  function reportStatus() {
    fetch('http://127.0.0.1:8080/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'status',
        sender: sessionId,
        url: window.location.href,
        title: document.title || window.location.hostname
      })
    }).catch(function() {});
  }

  window.addEventListener('load', reportStatus);
  setInterval(function() {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      reportStatus();
    }
  }, 1000);
  reportStatus();
})();
  `;

  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(extDir, 'content.js'), contentJsCode);
  return extDir;
}

// Establish SSE connection to update UI states in real time
function initSyncServerConnection() {
  const syncSse = new EventSource('http://127.0.0.1:8080/events?session=renderer');
  
  syncSse.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'status') {
        const id = data.sender;
        
        // Update URL display on card
        const urlDisplay = document.getElementById(`session-url-${id}`);
        if (urlDisplay) {
          urlDisplay.textContent = data.url;
          urlDisplay.title = data.url;
        }

        // Update URL display on webview header if in On-board Mode
        const webviewUrlText = document.getElementById(`webview-url-text-${id}`);
        if (webviewUrlText) {
          webviewUrlText.textContent = data.url;
          webviewUrlText.title = data.url;
        }
        
        // Save state locally
        if (sessionStates[id]) {
          sessionStates[id].lastKnownUrl = data.url;
          saveSessionStates();
        }
      }
    } catch (err) {
      console.error('[SSE Server Link Error]', err);
    }
  };
}

// Calculate grid window coordinates
function getGridPositions(cols, rows) {
  const startX = window.screen.availLeft || 0;
  const startY = window.screen.availTop || 0;
  const screenW = window.screen.availWidth;
  const screenH = window.screen.availHeight;

  const winW = Math.floor(screenW / cols);
  const winH = Math.floor(screenH / rows);

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: startX + c * winW,
        y: startY + r * winH,
        w: winW,
        h: winH
      });
    }
  }
  return positions;
}

// ==========================================================================
// 1. External Mode Spawning
// ==========================================================================
function launchBrowserWindow(sessionId, x, y, w, h, url) {
  if (spawnedProcesses[sessionId]) {
    closeBrowserWindow(sessionId);
  }

  const browserType = globalSettings.browserType;
  const browserPath = getBrowserPath(browserType);
  
  if (!browserPath) {
    alert(`[에러] ${browserType} 브라우저가 PC에 설치되어 있지 않거나 경로를 찾을 수 없습니다.`);
    return;
  }

  const profilePath = path.join(__dirname, 'profiles', `session-profile-${sessionId}`);
  if (!fs.existsSync(path.join(__dirname, 'profiles'))) {
    fs.mkdirSync(path.join(__dirname, 'profiles'), { recursive: true });
  }

  const extDir = prepareExtension(sessionId);

  const args = [
    `--user-data-dir=${profilePath}`,
    `--window-position=${globalSettings.stealthMode ? '9999,9999' : `${x},${y}`}`,
    `--window-size=${w},${h}`,
    '--no-first-run',
    '--no-default-browser-check'
  ];

  if (globalSettings.syncInput) {
    args.push(`--load-extension=${extDir}`);
  }

  if (globalSettings.muteAudio) {
    args.push('--mute-audio');
  }

  if (globalSettings.zoomScale) {
    args.push(`--force-device-scale-factor=${globalSettings.zoomScale}`);
  }

  const proxy = sessionStates[sessionId].proxy;
  if (proxy) {
    args.push(`--proxy-server=${proxy}`);
  }

  const uaKey = sessionStates[sessionId].userAgent;
  const uaString = USER_AGENTS[uaKey];
  if (uaString) {
    args.push(`--user-agent=${uaString}`);
  }

  // Prepend protocol if missing
  let targetUrl = url || 'https://google.com';
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  args.push(targetUrl);

  statusText.textContent = `Session ${sessionId} 외부 창 실행 중...`;

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: 'ignore'
  });

  child.on('exit', () => {
    delete spawnedProcesses[sessionId];
    updateSessionStatusUI(sessionId, false);
    
    const activeCount = Object.keys(spawnedProcesses).length;
    statusText.textContent = activeCount > 0 ? `${activeCount}개 외부 세션 켜짐` : 'Ready';
  });

  spawnedProcesses[sessionId] = child;
  updateSessionStatusUI(sessionId, true);
  child.unref();

  const activeCount = Object.keys(spawnedProcesses).length;
  statusText.textContent = `${activeCount}개 외부 세션 켜짐`;
}

function closeBrowserWindow(sessionId) {
  const child = spawnedProcesses[sessionId];
  if (child) {
    try {
      exec(`taskkill /F /T /PID ${child.pid}`);
    } catch (e) {
      console.warn(`Failed to terminate process PID ${child.pid}:`, e);
    }
    delete spawnedProcesses[sessionId];
  }
  updateSessionStatusUI(sessionId, false);
}

// ==========================================================================
// 2. On-board Mode Embedded Webviews
// ==========================================================================
function launchEmbeddedWebview(sessionId, url) {
  if (activeWebviews[sessionId]) {
    closeEmbeddedWebview(sessionId);
  }

  const webviewCell = document.createElement('div');
  webviewCell.className = 'webview-cell';
  webviewCell.id = `webview-cell-${sessionId}`;

  webviewCell.innerHTML = `
    <div class="webview-cell-header">
      <span><span class="title-dot"></span>Session ${sessionId} ${globalSettings.hostSlaveMode && parseInt(globalSettings.hostSession) === sessionId ? '(Host)' : ''}</span>
      <span class="cell-url-text" id="webview-url-text-${sessionId}">Loading...</span>
      <button class="small-btn" style="padding: 2px 6px;" id="btn-webview-reload-${sessionId}">🔄</button>
    </div>
    <webview id="webview-${sessionId}" partition="persist:session-profile-${sessionId}"></webview>
  `;

  embeddedGridContainer.appendChild(webviewCell);

  const webview = webviewCell.querySelector('webview');
  activeWebviews[sessionId] = webview;

  // Set Preload script path
  const preloadPath = generatePreloadScript();
  webview.setAttribute('preload', 'file://' + preloadPath);

  // Set custom user-agent containing session flags
  const isHost = globalSettings.hostSlaveMode && parseInt(globalSettings.hostSession) === sessionId;
  const isSlave = globalSettings.hostSlaveMode && parseInt(globalSettings.hostSession) !== sessionId;
  
  const uaKey = sessionStates[sessionId].userAgent;
  let baseUA = USER_AGENTS[uaKey] || BASE_DEFAULT_UA;
  
  // Inject tags to User-Agent
  let customUA = `${baseUA} AMEVA_SESSION_${sessionId}`;
  if (isHost) customUA += ' AMEVA_HOST';
  if (isSlave) customUA += ' AMEVA_SLAVE';
  if (globalSettings.antiFingerprint) customUA += ' AMEVA_ANTIFP';
  if (globalSettings.humanJitter) customUA += ' AMEVA_JITTER';

  webview.setAttribute('useragent', customUA);

  // Apply proxy if defined
  const proxy = sessionStates[sessionId].proxy;
  if (proxy) {
    webview.addEventListener('dom-ready', () => {
      webview.getWebContents().setProxy({ proxyRules: proxy }).then(() => {
        console.log(`[Proxy] Applied ${proxy} to Session ${sessionId} webview`);
      });
    });
  }

  // Prepend protocol
  let targetUrl = url || 'https://google.com';
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  webview.setAttribute('src', targetUrl);

  // Webview reload listener
  webviewCell.querySelector(`#btn-webview-reload-${sessionId}`).addEventListener('click', () => {
    webview.reload();
  });

  // Track active focus
  webview.addEventListener('focus', () => {
    document.querySelectorAll('.webview-cell').forEach(c => c.classList.remove('active-webview-cell'));
    webviewCell.classList.add('active-webview-cell');
  });

  // Update status
  updateSessionStatusUI(sessionId, true);
}

function closeEmbeddedWebview(sessionId) {
  const cell = document.getElementById(`webview-cell-${sessionId}`);
  if (cell) {
    cell.remove();
  }
  delete activeWebviews[sessionId];
  updateSessionStatusUI(sessionId, false);
}

// ==========================================================================
// 3. UI Helpers
// ==========================================================================
function updateSessionStatusUI(sessionId, isActive) {
  const card = document.getElementById(`session-card-${sessionId}`);
  const badge = document.getElementById(`session-badge-${sessionId}`);
  if (card && badge) {
    if (isActive) {
      card.classList.add('active-session');
      badge.textContent = 'Active';
      badge.style.color = 'var(--accent-cyan)';
    } else {
      card.classList.remove('active-session');
      badge.textContent = 'Closed';
      badge.style.color = 'var(--text-muted)';
    }
  }
}

// Render dynamic session cards
function renderSessionCards() {
  sessionCardsContainer.innerHTML = '';

  for (let i = 1; i <= MAX_SESSIONS; i++) {
    const state = sessionStates[i];
    const card = document.createElement('div');
    card.className = 'session-card';
    card.id = `session-card-${i}`;

    card.innerHTML = `
      <div class="card-header">
        <span class="session-title">
          <span class="status-dot"></span> Session ${i}
        </span>
        <span class="badge-status" id="session-badge-${i}" style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted);">Closed</span>
      </div>
      <div class="card-fields">
        <div class="card-field-row">
          <label>Proxy</label>
          <input type="text" class="card-input" id="session-proxy-${i}" placeholder="IP:Port" value="${state.proxy}">
        </div>
        <div class="card-field-row">
          <label>User Agent</label>
          <select class="card-select" id="session-ua-${i}">
            <option value="default" ${state.userAgent === 'default' ? 'selected' : ''}>Default (Edge/Chrome)</option>
            <option value="iphone" ${state.userAgent === 'iphone' ? 'selected' : ''}>Mobile (iPhone Safari)</option>
            <option value="android" ${state.userAgent === 'android' ? 'selected' : ''}>Mobile (Android Chrome)</option>
            <option value="macos" ${state.userAgent === 'macos' ? 'selected' : ''}>Desktop (macOS Chrome)</option>
            <option value="firefox" ${state.userAgent === 'firefox' ? 'selected' : ''}>Desktop (Win Firefox)</option>
          </select>
        </div>
      </div>
      <div class="card-url-display" id="session-url-${i}" title="${state.lastKnownUrl}">
        ${state.lastKnownUrl}
      </div>
      <div class="card-actions">
        <button class="small-btn launch" id="btn-single-launch-${i}">Launch</button>
        <button class="small-btn close" id="btn-single-close-${i}">Close</button>
      </div>
    `;

    sessionCardsContainer.appendChild(card);

    // Form Change listeners
    card.querySelector(`#session-proxy-${i}`).addEventListener('input', (e) => {
      sessionStates[i].proxy = e.target.value.trim();
      saveSessionStates();
    });

    card.querySelector(`#session-ua-${i}`).addEventListener('change', (e) => {
      sessionStates[i].userAgent = e.target.value;
      saveSessionStates();
    });

    card.querySelector(`#btn-single-launch-${i}`).addEventListener('click', () => {
      const currentUrl = sessionStates[i].lastKnownUrl || masterUrlInput.value.trim() || 'https://google.com';
      if (globalSettings.executionMode === 'onboard') {
        launchEmbeddedWebview(i, currentUrl);
      } else {
        const x = window.screen.availLeft + Math.floor(window.screen.availWidth / 4);
        const y = window.screen.availTop + Math.floor(window.screen.availHeight / 4);
        const w = Math.floor(window.screen.availWidth / 2);
        const h = Math.floor(window.screen.availHeight / 2);
        launchBrowserWindow(i, x, y, w, h, currentUrl);
      }
    });

    card.querySelector(`#btn-single-close-${i}`).addEventListener('click', () => {
      if (globalSettings.executionMode === 'onboard') {
        closeEmbeddedWebview(i);
      } else {
        closeBrowserWindow(i);
      }
    });
    
    // Set initial status UI
    const isActive = globalSettings.executionMode === 'onboard' ? !!activeWebviews[i] : !!spawnedProcesses[i];
    updateSessionStatusUI(i, isActive);
  }
}

// Master Controls Implementation
function syncNavigateAll() {
  let url = masterUrlInput.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  fetch('http://127.0.0.1:8080/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'navigate',
      sender: 'renderer',
      url: url
    })
  }).catch(() => {});
  
  statusText.textContent = `전체 세션 URL 이동 시도: ${url}`;
}

// Reload all active browsers
function syncReloadAll() {
  fetch('http://127.0.0.1:8080/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'reload',
      sender: 'renderer'
    })
  }).catch(() => {});
  
  statusText.textContent = '전체 세션 새로고침 신호 전송';
}

function launchGrid() {
  let cols = 2;
  let rows = 2;
  
  if (activeLayout === '1x1') { cols = 1; rows = 1; }
  else if (activeLayout === '1x2') { cols = 2; rows = 1; }
  else if (activeLayout === '2x2') { cols = 2; rows = 2; }
  else if (activeLayout === '3x2') { cols = 3; rows = 2; }
  else {
    cols = parseInt(customColsInput.value) || 2;
    rows = parseInt(customRowsInput.value) || 2;
  }

  const totalCount = cols * rows;
  const masterUrl = masterUrlInput.value.trim() || 'https://google.com';

  if (globalSettings.executionMode === 'onboard') {
    // On-board webview grid creation
    embeddedGridContainer.innerHTML = '';
    embeddedGridContainer.className = `layout-${activeLayout}`;
    
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      if (i <= totalCount) {
        const urlToLaunch = sessionStates[i].lastKnownUrl || masterUrl;
        launchEmbeddedWebview(i, urlToLaunch);
      } else {
        closeEmbeddedWebview(i);
      }
    }
  } else {
    // External native windows grid creation
    const positions = getGridPositions(cols, rows);
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      if (i <= totalCount) {
        const pos = positions[i - 1];
        const urlToLaunch = sessionStates[i].lastKnownUrl || masterUrl;
        launchBrowserWindow(i, pos.x, pos.y, pos.w, pos.h, urlToLaunch);
      } else {
        closeBrowserWindow(i);
      }
    }
  }
}

function realignGrid() {
  launchGrid(); // relaunching does positioning realignment automatically!
  statusText.textContent = '그리드 레이아웃 자동 정렬 완료';
}

function closeAllLaunched() {
  for (let i = 1; i <= MAX_SESSIONS; i++) {
    if (globalSettings.executionMode === 'onboard') {
      closeEmbeddedWebview(i);
    } else {
      closeBrowserWindow(i);
    }
  }
  statusText.textContent = '모든 세션 종료 완료';
}

function resetAllProfiles() {
  if (confirm('경고: 모든 세션 프로필 데이터(쿠키/캐시/로그인 정보)를 완전히 초기화하시겠습니까? 먼저 실행 중인 모든 브라우저를 닫습니다.')) {
    closeAllLaunched();
    
    // Give OS short time to release lock files
    setTimeout(() => {
      try {
        const profilesPath = path.join(__dirname, 'profiles');
        if (fs.existsSync(profilesPath)) {
          fs.rmSync(profilesPath, { recursive: true, force: true });
          alert('모든 프로필 캐시가 성공적으로 초기화되었습니다!');
          
          for (let i = 1; i <= MAX_SESSIONS; i++) {
            sessionStates[i].lastKnownUrl = 'https://google.com';
          }
          saveSessionStates();
          renderSessionCards();
          statusText.textContent = '프로필 캐시 완전 초기화 완료';
        }
      } catch (err) {
        console.error('Failed to reset profiles:', err);
        alert('일부 프로필 파일이 락(Lock) 상태이거나 삭제할 수 없습니다. 열려있는 세션이 완전히 꺼졌는지 확인해 주세요.');
      }
    }, 1500);
  }
}

// Toggle Visibility depending on On-board vs. External Mode
function toggleExecutionModeContainers() {
  if (globalSettings.executionMode === 'onboard') {
    // On-board mode
    sessionCardsContainer.style.display = 'none';
    embeddedGridContainer.style.display = 'grid';
    dashboardTitle.textContent = '📱 On-board Embedded Webviews Grid';
    
    // Hide external-only options in settings
    browserTypeContainer.style.display = 'none';
    stealthModeContainer.style.display = 'none';
  } else {
    // External Mode
    sessionCardsContainer.style.display = 'grid';
    embeddedGridContainer.style.display = 'none';
    dashboardTitle.textContent = '👥 Multi-Session Accounts Dashboard (새창)';
    
    // Show external-only options
    browserTypeContainer.style.display = 'block';
    stealthModeContainer.style.display = 'flex';
  }
}

// Load configurations from global state and update DOM
function loadSettingsDOM() {
  // Theme
  themeSelect.value = globalSettings.theme || 'dark';
  applyTheme(globalSettings.theme || 'dark');

  // Mode
  if (globalSettings.executionMode === 'onboard') {
    modeOnboardRadio.checked = true;
  } else {
    modeExternalRadio.checked = true;
  }
  toggleExecutionModeContainers();

  // Browser type
  if (globalSettings.browserType === 'edge') {
    browserEdgeRadio.checked = true;
  } else {
    browserChromeRadio.checked = true;
  }

  // Host-Slave sync
  hostSlaveModeCheck.checked = !!globalSettings.hostSlaveMode;
  hostSessionSelect.value = globalSettings.hostSession || '1';
  hostSelectContainer.style.display = globalSettings.hostSlaveMode ? 'block' : 'none';

  zoomScaleInput.value = globalSettings.zoomScale;
  syncInputCheck.checked = globalSettings.syncInput;
  antiFingerprintCheck.checked = !!globalSettings.antiFingerprint;
  humanJitterCheck.checked = !!globalSettings.humanJitter;
  stealthModeCheck.checked = !!globalSettings.stealthMode;
  muteAudioCheck.checked = globalSettings.muteAudio;

  // Sidebar collapse status
  if (globalSettings.settingsPanelCollapsed) {
    controlPanel.classList.add('collapsed');
  } else {
    controlPanel.classList.remove('collapsed');
  }
}

// Update settings state from DOM and save
function saveSettingsFromDOM() {
  globalSettings.theme = themeSelect.value;
  globalSettings.executionMode = modeOnboardRadio.checked ? 'onboard' : 'external';
  globalSettings.browserType = browserEdgeRadio.checked ? 'edge' : 'chrome';
  globalSettings.zoomScale = parseFloat(zoomScaleInput.value) || 0.8;
  globalSettings.syncInput = syncInputCheck.checked;
  globalSettings.hostSlaveMode = hostSlaveModeCheck.checked;
  globalSettings.hostSession = hostSessionSelect.value;
  globalSettings.antiFingerprint = antiFingerprintCheck.checked;
  globalSettings.humanJitter = humanJitterCheck.checked;
  globalSettings.stealthMode = stealthModeCheck.checked;
  globalSettings.muteAudio = muteAudioCheck.checked;
  globalSettings.settingsPanelCollapsed = controlPanel.classList.contains('collapsed');
  
  saveGlobalSettings();
}

// Listeners Setup
function initListeners() {
  // Collapsible Sidebar Toggle
  btnSettingsToggle.addEventListener('click', () => {
    controlPanel.classList.toggle('collapsed');
    saveSettingsFromDOM();
  });

  // Theme change
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
    saveSettingsFromDOM();
  });

  // Execution Mode toggle
  const onModeChange = () => {
    closeAllLaunched();
    saveSettingsFromDOM();
    toggleExecutionModeContainers();
    renderSessionCards();
  };
  modeOnboardRadio.addEventListener('change', onModeChange);
  modeExternalRadio.addEventListener('change', onModeChange);

  // Host-Slave mode toggle
  hostSlaveModeCheck.addEventListener('change', () => {
    hostSelectContainer.style.display = hostSlaveModeCheck.checked ? 'block' : 'none';
    saveSettingsFromDOM();
  });
  hostSessionSelect.addEventListener('change', saveSettingsFromDOM);

  // Master Address Bar Listeners
  masterUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const activeCount = globalSettings.executionMode === 'onboard' 
        ? Object.keys(activeWebviews).length 
        : Object.keys(spawnedProcesses).length;
      if (activeCount > 0) {
        syncNavigateAll();
      } else {
        launchGrid();
      }
    }
  });

  btnGo.addEventListener('click', syncNavigateAll);
  btnReload.addEventListener('click', syncReloadAll);

  // Global Settings Change Listener
  const bindSave = (elem) => elem.addEventListener('change', saveSettingsFromDOM);
  bindSave(browserEdgeRadio);
  bindSave(browserChromeRadio);
  bindSave(zoomScaleInput);
  bindSave(syncInputCheck);
  bindSave(antiFingerprintCheck);
  bindSave(humanJitterCheck);
  bindSave(stealthModeCheck);
  bindSave(muteAudioCheck);

  zoomScaleInput.addEventListener('input', saveSettingsFromDOM);

  // Quick Bookmarks Bindings
  quickBookmarkButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      masterUrlInput.value = url;
      
      const activeCount = globalSettings.executionMode === 'onboard' 
        ? Object.keys(activeWebviews).length 
        : Object.keys(spawnedProcesses).length;
      if (activeCount > 0) {
        syncNavigateAll();
      } else {
        launchGrid();
      }
    });
  });

  // Layout Buttons Bindings
  layoutButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      layoutButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLayout = btn.dataset.layout;
      
      // Update custom layout values if preset selected
      if (activeLayout === '1x1') { customColsInput.value = 1; customRowsInput.value = 1; }
      else if (activeLayout === '1x2') { customColsInput.value = 2; customRowsInput.value = 1; }
      else if (activeLayout === '2x2') { customColsInput.value = 2; customRowsInput.value = 2; }
      else if (activeLayout === '3x2') { customColsInput.value = 3; customRowsInput.value = 2; }
    });
  });

  customColsInput.addEventListener('input', () => {
    layoutButtons.forEach(b => b.classList.remove('active'));
    activeLayout = 'custom';
  });
  customRowsInput.addEventListener('input', () => {
    layoutButtons.forEach(b => b.classList.remove('active'));
    activeLayout = 'custom';
  });

  // Action Buttons Bindings
  btnLaunchGrid.addEventListener('click', launchGrid);
  btnRealignGrid.addEventListener('click', realignGrid);
  btnCloseAll.addEventListener('click', closeAllLaunched);
  btnResetProfiles.addEventListener('click', resetAllProfiles);
}

// Initializer
function init() {
  generatePreloadScript();
  loadSettingsDOM();
  syncSettingsToServer();
  renderSessionCards();
  initListeners();
  initSyncServerConnection();
}

window.addEventListener('DOMContentLoaded', init);
