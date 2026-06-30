# AMEVA Multi-Session Grid Browser — Claude Code 전수조사 프롬프트 (완전판)

Claude Code에 이 전체 내용을 그대로 복사해서 붙여넣으십시오.

---

```markdown
당신은 Electron, Chromium 내부 아키텍처, Anti-Detect 브라우저 우회 기법, 그리고 OS 수준 입력 동기화 시스템 분야의 최고 수준 보안 엔지니어입니다.

아래는 현재 개발 중인 **AMEVA Multi-Session Grid Browser** 프로젝트의 모든 핵심 파일 코드입니다. 이 코드들을 전수조사하고, 잠재적인 버그, 보안 우회 누락, 메모리 누수, 인증 흐름 파괴, 클릭 정밀도 오차 등을 빠짐없이 찾아 수정 제안 및 완전한 패치 코드를 작성해 주십시오.

---

## ★ 사전 공지: 이미 발견된 버그 목록 (이것들은 이미 수정됨)

다음은 이미 발견 및 수정된 버그입니다. 다시 지적할 필요 없으며, 아직 수정되지 않은 추가적인 문제를 탐색하십시오:

1. OAuth 팝업(`accounts.google.com` 등)을 `contents.loadURL()`로 가로채어 같은 웹뷰에 로드 → `window.opener` 소실로 로그인 플로우 파괴 **[수정됨: URL 패턴 감지 후 실제 BrowserWindow 팝업 생성으로 분기]**
2. `closeEmbeddedWebview()`가 웹뷰 DOM만 제거하고 내부 SSE `EventSource`는 `close()` 미호출 → 메모리 누수 **[수정됨: `window.__ameva_sse.close()` executeScript 주입]**
3. `sendInputEvent`의 클릭 좌표 계산 시 줌 배율(`zoomFactor`) 미반영으로 좌표 엇나감 **[수정됨: `rawX / zoomFactor` 보정 수식 적용]**
4. `toDataURL`/`toBlob` 오버라이드에서 WebGL 캔버스에 `getContext('2d')`를 호출해 Context 충돌 에러 발생 **[수정됨: `this._webgl` 플래그로 2D/3D 캔버스 구분]**
5. External Mode(`content.js`)의 AntiFingerprint 블록에 WebGL2, `navigator.webdriver`, `userAgentData`, `window.chrome` 우회 코드 완전 누락 **[수정됨: 동일한 스텔스 블록 삽입]**

---

## 1. 전체 파일 코드

### [A] main.js (170줄 전체)

```javascript
const { app, BrowserWindow, ipcMain, session } = require('electron');
app.commandLine.appendSwitch('dns-over-https-templates', 'https://chrome.cloudflare-dns.com/dns-query');
app.commandLine.appendSwitch('disable-webrtc-multiple-routes');

const path = require('path');
const http = require('http');

let mainWindow;
const clients = {}; // session_id -> SSE http.ServerResponse

let syncSettings = {
  syncInput: true,
  hostSlaveMode: false,
  hostSession: 1
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // [SSE] /events?session=<id> — 클라이언트 SSE 연결 등록
  if (req.url.startsWith('/events')) {
    const urlObj = new URL(req.url, 'http://localhost');
    const sessionId = urlObj.searchParams.get('session');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    clients[sessionId] = res;
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
    req.on('close', () => { delete clients[sessionId]; });
    return;
  }

  // [POST] /update-settings — syncSettings 갱신
  if (req.url === '/update-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        syncSettings = { ...syncSettings, ...JSON.parse(body) };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }

  // [POST] /broadcast — 이벤트 배포 (Host-Slave 필터링 포함)
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        const sender = eventData.sender;
        const isControlEvent = ['scroll', 'click', 'keydown'].includes(eventData.type);
        let shouldBlock = false;
        if (isControlEvent) {
          if (!syncSettings.syncInput) {
            shouldBlock = true;
          } else if (syncSettings.hostSlaveMode) {
            // Host-Slave 모드: hostSession 또는 renderer(내부 클릭 처리자)의 이벤트만 통과
            if (sender !== 'renderer' && String(sender) !== String(syncSettings.hostSession)) {
              shouldBlock = true; // Slave가 자체 전송한 이벤트를 다시 배포하는 루프 차단
            }
          } else {
            shouldBlock = true; // Host-Slave 모드 꺼진 상태에서 제어 이벤트 차단
          }
        }
        if (!shouldBlock) {
          Object.keys(clients).forEach(id => {
            if (id === 'renderer' || id !== String(sender)) {
              clients[id].write(`data: ${JSON.stringify(eventData)}\n\n`);
            }
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(8080, '127.0.0.1');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: 'AMEVA Multi-Session Launcher',
    webPreferences: {
      nodeIntegration: true,     // ★ 보안 위험 — renderer에서 fs, path, child_process 등 노드 API 직접 사용 중
      contextIsolation: false,   // ★ 보안 위험 — contextIsolation 꺼져 있어 XSS 시 노드 풀 접근 가능
      webviewTag: true
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// OAuth 인증 팝업 URL 패턴 — 이 URL에 해당하는 팝업은 실제 BrowserWindow를 생성
const OAUTH_URL_PATTERNS = [
  /accounts\.google\.com/i, /oauth2\.googleapis\.com/i,
  /nid\.naver\.com/i, /auth\.kakao\.com/i,
  /facebook\.com\/dialog\/oauth/i, /login\.microsoftonline\.com/i,
  /appleid\.apple\.com/i, /github\.com\/login\/oauth/i,
  /api\.twitter\.com\/oauth/i, /\/oauth/i, /\/auth\/callback/i, /\/login\?/i
];

app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler((details) => {
      const url = details.url;
      const isOAuth = OAUTH_URL_PATTERNS.some(p => p.test(url));
      if (isOAuth) {
        // OAuth 팝업: 세션 공유하는 실제 BrowserWindow 생성
        const parentPartition = contents.session.persist ? contents.session : null;
        const popup = new BrowserWindow({
          width: 500, height: 700, title: 'Login',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            session: parentPartition || session.defaultSession
          }
        });
        popup.loadURL(url);
        return { action: 'deny' };
      }
      // 일반 팝업: 같은 웹뷰에 강제 로드
      contents.loadURL(url);
      return { action: 'deny' };
    });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

### [B] renderer.js — 핵심 함수들 (전체 1774줄 중 중요 구간)

#### B-1. generatePreloadScript() — On-board 모드 웹뷰에 삽입되는 프리로드 스크립트 동적 생성

```javascript
function generatePreloadScript(sessionId, isHost, isSlave) {
  const preloadJsCode = `
(function() {
  const sessionId = ${sessionId};
  const isHost = ${isHost};
  const isSlave = ${isSlave};
  const antiFingerprint = ${globalSettings.antiFingerprint};
  const humanJitter = ${globalSettings.humanJitter};

  // ─── Anti-Fingerprint 스텔스 블록 ───
  if (antiFingerprint) {
    try {
      const spoofScriptBlock = \`
        // CPU / RAM 위조
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${[2,4,6,8,12,16][sessionId%6]} });
        Object.defineProperty(navigator, 'deviceMemory',        { get: () => ${[4,8,16][sessionId%3]} });
        Object.defineProperty(navigator, 'webdriver',           { get: () => false });

        // UserAgent Client Hints 위조
        if (navigator.userAgentData) {
          Object.defineProperty(navigator, 'userAgentData', { get: () => ({
            brands: [{ brand:'Not_A Brand',version:'8'},{ brand:'Chromium',version:'120'},{ brand:'Google Chrome',version:'120'}],
            mobile: false, platform: 'Windows',
            getHighEntropyValues: () => Promise.resolve({
              brands: this.brands, mobile: false, platform: 'Windows',
              platformVersion: '10.0.0', architecture: 'x86', bitness: '64', model: ''
            })
          }), configurable: true });
        }

        // window.chrome 런타임 더미
        if (!window.chrome) window.chrome = { runtime:{}, loadTimes:function(){}, csi:function(){} };

        // Canvas getContext 추적 + getImageData 픽셀 노이즈
        const _gc = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attrs) {
          const ctx = _gc.apply(this, arguments);
          if ((type==='webgl'||type==='webgl2'||type==='experimental-webgl')) this._webgl = true;
          if (type === '2d' && ctx) {
            this.__ctx2d = ctx;
            const _gid = ctx.getImageData;
            ctx.getImageData = function(sx,sy,sw,sh) {
              const img = _gid.apply(this, arguments);
              for (let i=0;i<img.data.length;i+=4) {
                img.data[i]   = (img.data[i]   + (${sessionId}%3)) % 256;
                img.data[i+1] = (img.data[i+1] + (${sessionId}%2)) % 256;
              }
              return img;
            };
          }
          return ctx;
        };

        // toDataURL / toBlob — WebGL 캔버스 충돌 방지 처리
        const _tdURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          if (this.__ctx2d && !this._webgl) {
            const s=this.__ctx2d.fillStyle;
            this.__ctx2d.fillStyle='rgba(${sessionId%3},${sessionId%2},0,0.004)';
            this.__ctx2d.fillRect(0,0,1,1);
            this.__ctx2d.fillStyle=s;
          }
          return _tdURL.apply(this,arguments);
        };
        const _tBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function(cb,...a) {
          if (this.__ctx2d && !this._webgl) {
            const s=this.__ctx2d.fillStyle;
            this.__ctx2d.fillStyle='rgba(${sessionId%3},${sessionId%2},0,0.004)';
            this.__ctx2d.fillRect(0,0,1,1);
            this.__ctx2d.fillStyle=s;
          }
          return _tBlob.apply(this,[cb,...a]);
        };

        // WebGL 1.0 & 2.0 GPU 스펙 위조
        const _spoof = (proto) => {
          const _orig = proto.getParameter;
          proto.getParameter = function(p) {
            if (p===37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 30${60+sessionId*5} Ti Direct3D11 vs_5_0 ps_5_0)';
            if (p===37445) return 'Google Inc. (NVIDIA)';
            return _orig.apply(this,arguments);
          };
        };
        if (typeof WebGLRenderingContext!=='undefined') _spoof(WebGLRenderingContext.prototype);
        if (typeof WebGL2RenderingContext!=='undefined') _spoof(WebGL2RenderingContext.prototype);
      \`;
      const s = document.createElement('script');
      s.textContent = spoofScriptBlock;
      (document.head||document.documentElement).appendChild(s);
      s.remove();
    } catch(e) { console.error('[AntiFingerprint Error]', e); }
  }

  // ─── SSE 동기화 연결 (window.__ameva_sse로 노출 → 웹뷰 닫힐 때 close() 가능) ───
  const sse = new EventSource('http://127.0.0.1:8080/events?session=' + sessionId);
  window.__ameva_sse = sse;

  sse.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.sender === sessionId) return;

    if (data.type === 'scroll' && !isHost) {
      const mX = document.documentElement.scrollWidth - window.innerWidth;
      const mY = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ left: data.percentX*mX, top: data.percentY*mY, behavior: humanJitter?'smooth':'auto' });
    } else if (data.type === 'keydown' && !isHost) {
      // 키보드 이벤트 DOM 재현 + INPUT/TEXTAREA value 직접 수정
      // ... (실제 구현 존재)
    } else if (data.type === 'navigate') {
      window.location.href = data.url;
    } else if (data.type === 'reload') {
      window.location.reload();
    }
  };

  // Slave인 경우 이벤트를 서버로 전송하는 리스너 등록하지 않음 (무한 루프 차단)
  const shouldBroadcast = !isSlave;
  if (shouldBroadcast) {
    // scroll, click, keydown 이벤트를 127.0.0.1:8080/broadcast로 POST 전송
    // click은 isTrusted 체크하여 프로그래매틱 클릭 재전송 방지
    window.addEventListener('scroll', /* ... */);
    document.addEventListener('click', (e) => { if (!e.isTrusted) return; /* broadcast */ });
    document.addEventListener('keydown', (e) => { if (!e.isTrusted) return; /* broadcast */ });
  }

  // 1초마다 URL 변경 감지 → status 이벤트 서버로 보고
  setInterval(() => { /* reportStatus() */ }, 1000);
})();
  `;
  fs.writeFileSync(preloadPath, preloadJsCode);
  return preloadPath;
}
```

#### B-2. prepareExtension() — External Mode 브라우저 확장 content.js 동적 생성

```javascript
// ★ External Mode에서 각 외부 브라우저에 로드되는 크롬 확장의 content.js를 동적으로 빌드
// antiFingerprint 블록: navigator 조작, canvas, WebGL1+2, userAgentData, webdriver, window.chrome 위조 포함
// 클릭 동기화: humanJitter 옵션에 따라 setTimeout(50~250ms) + ±5px 랜덤 오프셋 지터 적용
// ★★ 주의: External Mode의 클릭은 new MouseEvent('click') 기반 JS 디스패치임 (isTrusted=false 발생)
//           On-board 모드처럼 sendInputEvent를 쓸 수 없음. 외부 브라우저를 탭 수준에서 제어하는
//           Electron API가 없기 때문에 이 구조상 한계는 해결 불가.
//           해결책은 External Mode 대신 On-board Embedded Mode를 사용하는 것임.
function prepareExtension(sessionId) {
  // manifest v3 기반
  // content_scripts: all_urls, run_at: document_start, all_frames: true
  // shouldBroadcast = true (서버 측에서 Host 필터링)
  return extDir;
}
```

#### B-3. launchBrowserWindow() — External Mode 브라우저 프로세스 실행

```javascript
const args = [
  `--user-data-dir=${profilePath}`,
  `--window-size=${w},${h}`,
  '--no-first-run',
  '--disable-webrtc-multiple-routes',
  '--dns-over-https-templates=https://chrome.cloudflare-dns.com/dns-query',
  // 브라우저 타입에 따라 --inprivate 또는 --incognito 추가
  // globalSettings.syncInput이면 --load-extension=<extDir> 추가
  // proxy 있으면 --proxy-server=<proxy> 추가
  // userAgent 있으면 --user-agent=<ua> 추가
  // zoom 있으면 --force-device-scale-factor=<zoom> 추가
];
```

#### B-4. launchEmbeddedWebview() — On-board 모드 웹뷰 생성

```javascript
function launchEmbeddedWebview(sessionId, url) {
  // webview 생성 및 DOM 삽입
  // partition="session-profile-{sessionId}" (persist: 없음 → 인메모리 세션, 앱 재시작 시 로그인 날아감)
  // WebRTC IP 정책 설정:
  session.fromPartition(`session-profile-${sessionId}`).setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  // 프리로드 스크립트 동적 생성 후 webview.setAttribute('preload', path) 
  // 프록시 적용: webview.getWebContents().setProxy({ proxyRules: proxy })
  // zoom 적용: webview.setZoomFactor(zoom) on dom-ready
}
```

#### B-5. closeEmbeddedWebview() — 웹뷰 닫기 및 리소스 정리

```javascript
function closeEmbeddedWebview(sessionId) {
  const wv = activeWebviews[sessionId];
  if (wv) {
    // 웹뷰 내부의 SSE EventSource를 window.__ameva_sse.close()로 명시적 종료
    wv.executeScript({ code: 'if (window.__ameva_sse) { window.__ameva_sse.close(); }' }).catch(() => {});
  }
  // DOM에서 webview-cell 제거
  // activeWebviews[sessionId] 참조 삭제
}
```

#### B-6. initSyncServerConnection() — 렌더러의 SSE 수신 + 네이티브 클릭 주입

```javascript
function initSyncServerConnection() {
  const syncSse = new EventSource('http://127.0.0.1:8080/events?session=renderer');

  syncSse.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'status') {
      // URL 주소창 UI 갱신 + localStorage sessionStates 저장
    } else if (data.type === 'click') {
      // 네이티브 마우스 클릭을 Slave 웹뷰에 주입
      const hostId = parseInt(globalSettings.hostSession);
      if (globalSettings.hostSlaveMode && data.sender === hostId) {
        for (let i = 1; i <= MAX_SESSIONS; i++) {
          if (i !== hostId && activeWebviews[i]) {
            const rect = activeWebviews[i].getBoundingClientRect();
            // ★ 줌 배율 보정: sendInputEvent는 물리 픽셀 기준이므로 zoomFactor로 나눔
            const zoomFactor = sessionZoomStates[i] || 1.0;
            const x = Math.round((data.x * rect.width) / zoomFactor);
            const y = Math.round((data.y * rect.height) / zoomFactor);
            // mouseDown + mouseUp = isTrusted:true 판정
            activeWebviews[i].sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
            activeWebviews[i].sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
          }
        }
      }
    }
  };
}
```

#### B-7. resetAllProfiles() — 전체 세션 초기화

```javascript
function resetAllProfiles() {
  // 모든 창 닫기
  closeAllLaunched();
  setTimeout(() => {
    // Electron 인메모리 파티션 완전 소거 (On-board 모드 세션 잔재 제거)
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      session.fromPartition(`session-profile-${i}`).clearStorageData();
    }
    // 디스크 profiles/ 폴더 삭제 (External Mode 캐시)
    fs.rmSync(path.join(__dirname, 'profiles'), { recursive: true, force: true });
  }, 1500);
}
```

---

## 2. 감사 의뢰 사항 (이미 수정된 항목 외의 추가 분석 필요 사항)

아래의 추가적인 보안/아키텍처/성능 상의 문제를 분석하고 완전한 수정 코드를 제시해 주십시오.

### ① BrowserWindow의 nodeIntegration:true + contextIsolation:false 보안 위험 (Critical Architecture)
- `main.js`의 `createWindow()`에서 `nodeIntegration: true`, `contextIsolation: false`로 메인 윈도우가 생성됩니다.
- `renderer.js`가 직접 `fs`, `path`, `child_process.spawn/exec`을 사용하기 때문에 이 설정이 불가피한 상황이나, 만약 임베디드 웹뷰 내에서 XSS가 발생하고 그것이 부모 렌더러 컨텍스트에 접근 가능해진다면 전체 OS 수준의 파일 시스템 접근이 뚫립니다.
- `nodeIntegration`을 `false`로 유지하면서 IPC(`ipcMain`/`ipcRenderer`) + `contextBridge`를 통해 필요한 노드 기능만 안전하게 노출하는 구조로 전환하는 방법과 그 비용/이득을 분석해 주십시오.

### ② External Mode 클릭 동기화의 근본적 한계 (Architecture Gap)
- External Mode에서 Slave 클릭 동기화는 `new MouseEvent('click')` JS 디스패치로 구현되어 있어 `isTrusted=false`입니다. Cloudflare, Google, Kakao 등 고보안 사이트는 `isTrusted=false` 이벤트를 완전히 무시합니다.
- Electron에서 외부 독립 프로세스 브라우저(Edge/Chrome)의 특정 탭을 제어하는 OS 레벨 API(윈도우 메시지, SendInput, AutoHotKey DLL 등)를 Python/Node.js 바인딩을 통해 우회하는 방법이 현실적으로 존재합니까? 구체적인 구현 방법과 위험성을 제시해 주십시오.

### ③ SSE 서버의 클라이언트 연결 유실 감지 누락 (Reliability)
- `main.js`의 SSE 서버에서 `req.on('close')`로 연결 종료를 감지하고 `clients[sessionId]`를 삭제하지만, 네트워크 순단이나 웹뷰 crash로 인한 비정상 종료 시 half-open 연결이 `clients` 맵에 좀비로 남아 있을 수 있습니다.
- 주기적인 heartbeat ping (`data: ping\n\n`)을 서버에서 발송하고 클라이언트가 일정 시간 응답이 없으면 연결을 강제 삭제하는 heartbeat 메커니즘 구현 코드를 작성해 주십시오.

### ④ navigator.languages 및 Permissions API 미스매치 탐지 우회 누락 (Stealth Gap)
- 현재 프리로드 스크립트에 `navigator.languages`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `Permissions.query({ name: 'notifications' })` 반환값에 대한 위조가 없습니다.
- Electron 기반 브라우저는 기본적으로 `navigator.languages`가 `['en-US']` 또는 시스템 언어를 반환하며, 시간대 역시 시스템 시간대를 그대로 노출합니다. 세션별로 언어 및 시간대를 다르게 설정하지 않으면 동일한 기기에서 여러 세션이 돌아가고 있음이 탐지될 수 있습니다.
- 각 세션마다 `navigator.languages`를 다른 값으로 위조하고, Permissions API 쿼리 결과를 `prompt` 상태로 고정하는 프리로드 스크립트 추가 코드를 작성해 주십시오.

### ⑤ 레이아웃 변경 시 복수의 SSE `initSyncServerConnection` 중복 생성 위험 (Memory Leak)
- 현재 `initSyncServerConnection()`이 앱 초기화 시 한 번만 호출되는지, 아니면 레이아웃 변경 또는 재시작 때마다 중복 호출되는지 확인이 필요합니다.
- `syncSse`가 전역으로 관리되지 않아 기존 SSE가 close 되지 않고 새 SSE가 추가로 연결되는 누수 패턴이 존재하는지 검토하고, 방지 코드를 제시해 주십시오.

모든 항목에 대해 완전한 수정 코드 또는 구체적인 보강 방안을 작성해 주십시오.
```
