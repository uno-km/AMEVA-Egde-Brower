# AMEVA Multi-Session Grid Browser - Exhaustive Claude Code Audit Prompt

이 프롬프트를 복사하여 **Claude Code**에 전송하십시오. 이 프롬프트는 모든 파일의 핵심 로직 코드 스니펫과 아키텍처 구조를 생략 없이 담고 있어, 코드에 대한 직접적이고 정교한 검수가 가능합니다.

```markdown
당신은 일렉트론(Electron), Chromium 아키텍처, 브라우저 핑거프린트 보안 우회(Anti-Detect), 그리고 OS 수준 입력 동기화 제어 분야의 세계 최고 권위자인 수석 시스템 아키텍트(Principal Software Engineer)입니다.

현재 개발 중인 **AMEVA Multi-Session Grid Browser**의 소스 코드를 전수조사하고, 우회 기능의 미흡함, 성능 병목, 메모리 누수, 그리고 로그인/인증 예외 사항 등을 철저히 감사(Audit)하기 위해 세부 코드를 제공합니다.

다음 소스 코드 구조와 핵심 로직 구현을 읽고 점검하여 완벽한 개선 리포트와 수정 패치 코드를 작성해 주십시오.

---

## 1. 파일별 핵심 구현 스크립트

### [A] main.js (핵심 부분)
이 메인 프로세스는 로컬 HTTP/SSE 동기화 서버를 구동하며, 웹뷰의 팝업 창을 탐지하여 가로챕니다. 또한 DNS Leak 및 WebRTC IP 누수 방지를 위한 Chromium 커맨드라인 스위치를 전역 주입합니다.

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
// DNS Leak 방지 (DOH) 및 WebRTC 로컬 인터페이스 누수 방지 스위치 강제 주입
app.commandLine.appendSwitch('dns-over-https-templates', 'https://chrome.cloudflare-dns.com/dns-query');
app.commandLine.appendSwitch('disable-webrtc-multiple-routes');

const path = require('path');
const http = require('http');

let mainWindow;
const clients = {}; // session_id -> http response object
let syncSettings = {
  syncInput: true,
  hostSlaveMode: false,
  hostSession: 1
};

// 동기화 HTTP & SSE 서버
const server = http.createServer((req, res) => {
  // CORS 및 라우팅 설정 생략...
  // /events (SSE 연결 등록): clients[sessionId] = res
  // /update-settings (설정 저장): syncSettings 업데이트
  // /broadcast (이벤트 배포):
  //   Control Event (scroll, click, keydown) 인 경우, hostSlaveMode가 켜져 있으면 
  //   sender가 hostSession 혹은 renderer 일 경우에만 브로드캐스트 수행. 그 외에는 차단(shouldBlock = true)
});

app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    // window.open() 팝업 요청을 가로채어 현재 창에 강제 로드
    contents.setWindowOpenHandler((details) => {
      contents.loadURL(details.url);
      return { action: 'deny' }; // 새 네이티브 윈도우 생성 거절
    });
  }
});
```

### [B] renderer.js (이벤트 수신 및 네이티브 클릭 시뮬레이션 부분)
이 렌더러 프로세스는 로컬 SSE 서버로부터 수신한 클릭 좌표를 가공하여, `webview.sendInputEvent`를 통해 OS 수준의 네이티브 이벤트를 하위 웹뷰에 주입합니다.

```javascript
function initSyncServerConnection() {
  const syncSse = new EventSource('http://127.0.0.1:8080/events?session=renderer');
  
  syncSse.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'status') {
        // UI 주소창 갱신 및 상태 동기화...
      } else if (data.type === 'click') {
        // 네이티브 마우스 입력 동기화 (Slave)
        const hostId = parseInt(globalSettings.hostSession);
        if (globalSettings.hostSlaveMode && parseInt(data.sender) === hostId) {
          for (let i = 1; i <= MAX_SESSIONS; i++) {
            if (i !== hostId && activeWebviews[i]) {
              const webview = activeWebviews[i];
              try {
                const rect = webview.getBoundingClientRect();
                const x = Math.round(data.x * rect.width);
                const y = Math.round(data.y * rect.height);
                
                // OS 마우스 이동 및 버튼 다운/업을 모사 (isTrusted = true 보장)
                webview.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
                webview.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
              } catch (e) {
                console.error('[Native Click Error]', e);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[SSE Server Link Error]', err);
    }
  };
}
```

### [C] renderer.js (세션별 Preload Script 동적 작성 부분)
각 웹뷰의 샌드박스 컨텍스트에 삽입될 프리로드 코드를 동적으로 파일로 생성합니다. 이 코드 안에는 캔버스 핑거프린팅 무력화 및 시스템 파라미터 변조(WebGL1/2, userAgentData, webdriver, chrome 등) 코드가 전역 주입됩니다.

```javascript
function generatePreloadScript(sessionId, isHost, isSlave) {
  const profilesDir = path.join(__dirname, 'profiles');
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }
  const preloadPath = path.join(profilesDir, `preload-session-${sessionId}.js`);
  
  const preloadJsCode = `
(function() {
  const sessionId = ${sessionId};
  const isHost = ${isHost};
  const isSlave = ${isSlave};
  const antiFingerprint = ${globalSettings.antiFingerprint};
  const humanJitter = ${globalSettings.humanJitter};
  
  // --- 1. 안티디텍트 우회 기술 구현부 ---
  if (antiFingerprint) {
    try {
      const spoofScriptBlock = \\\`
        const randomConcurrency = \\\${[2, 4, 6, 8, 12, 16][sessionId % 6]};
        const randomMemory = \\\${[4, 8, 16][sessionId % 3]};
        
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => randomConcurrency });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => randomMemory });
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // UserAgent Client Hints 모킹 (구글 봇 탐지 우회)
        if (navigator.userAgentData) {
          const mockUserAgentData = {
            brands: [
              { brand: 'Not_A Brand', version: '8' },
              { brand: 'Chromium', version: '120' },
              { brand: 'Google Chrome', version: '120' }
            ],
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: function(hints) {
              return Promise.resolve({
                brands: this.brands,
                mobile: this.mobile,
                platform: this.platform,
                platformVersion: '10.0.0',
                architecture: 'x86',
                bitness: '64',
                model: ''
              });
            }
          };
          Object.defineProperty(navigator, 'userAgentData', { get: () => mockUserAgentData });
        }

        // window.chrome 런타임 봇 탐지 회피
        if (!window.chrome) {
          window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {}
          };
        }

        // 2D Canvas getImageData 오버라이드
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, contextAttributes) {
          const ctx = originalGetContext.apply(this, arguments);
          if (type === '2d' && ctx) {
            const originalGetImageData = ctx.getImageData;
            ctx.getImageData = function(sx, sy, sw, sh) {
              const imageData = originalGetImageData.apply(this, arguments);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                data[i] = (data[i] + (\\\\${sessionId} % 3)) % 256;
                data[i+1] = (data[i+1] + (\\\\${sessionId} % 2)) % 256;
              }
              return imageData;
            };
          }
          return ctx;
        };

        // Canvas Image Export (toDataURL / toBlob) 무력화
        // 모서리에 1% 미만의 미세 알파 투명도 픽셀 사각형을 그려 해시를 독립화시킴
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          const ctx = this.getContext('2d');
          if (ctx) {
            const style = ctx.fillStyle;
            ctx.fillStyle = 'rgba(' + (\\\\${sessionId} % 3) + ',' + (\\\\${sessionId} % 2) + ',0,0.01)';
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = style;
          }
          return originalToDataURL.apply(this, arguments);
        };

        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
          const ctx = this.getContext('2d');
          if (ctx) {
            const style = ctx.fillStyle;
            ctx.fillStyle = 'rgba(' + (\\\\${sessionId} % 3) + ',' + (\\\\${sessionId} % 2) + ',0,0.01)';
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = style;
          }
          return originalToBlob.apply(this, [callback, ...args]);
        };

        // WebGL 1.0 및 2.0 그래픽 사양 모킹
        const spoofWebGL = (proto) => {
          const originalGetParameter = proto.getParameter;
          proto.getParameter = function(parameter) {
            if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
              return "ANGLE (NVIDIA, NVIDIA GeForce RTX 30" + (60 + \\\\${sessionId} * 5) + " Ti Direct3D11 vs_5_0 ps_5_0)";
            }
            if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
              return "Google Inc. (NVIDIA)";
            }
            return originalGetParameter.apply(this, arguments);
          };
        };
        if (typeof WebGLRenderingContext !== 'undefined') spoofWebGL(WebGLRenderingContext.prototype);
        if (typeof WebGL2RenderingContext !== 'undefined') spoofWebGL(WebGL2RenderingContext.prototype);
        console.log('[AMEVA Sync] Preload Anti-Fingerprint Active.');
      \\\`;
      const script = document.createElement('script');
      script.textContent = spoofScriptBlock;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch(e) {
      console.error('[Preload Anti-Fingerprint Error]', e);
    }
  }

  // --- 2. 스크롤 및 키보드 입력 수신 동기화 구현부 ---
  const sse = new EventSource('http://127.0.0.1:8080/events?session=' + sessionId);
  sse.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.sender === sessionId) return;

    if (data.type === 'scroll') {
      if (isHost) return;
      const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({
        left: data.percentX * maxScrollX,
        top: data.percentY * maxScrollY,
        behavior: humanJitter ? 'smooth' : 'auto'
      });
    } else if (data.type === 'keydown') {
      if (isHost) return;
      // 키보드 DOM 오버라이딩 & input/change 트리거 (생략)
    }
  };

  // 피드백 무한루프를 차단하기 위해, Slave 역할인 경우 이벤트 전송 리스너 미등록
  const shouldBroadcast = !isSlave;
  if (shouldBroadcast) {
    // scroll, click, keydown에 대해 'http://127.0.0.1:8080/broadcast' POST 전송 리스너 바인딩
  }
})();
  `;
  fs.writeFileSync(preloadPath, preloadJsCode);
  return preloadPath;
}
```

---

## 2. 코드 보안 감사(Audit) 및 개선 의뢰 항목

제시된 코드를 분석한 후 아래의 치명적 설계 한계와 예외 상황에 대응하기 위한 **구체적인 수정 제안 및 패치 코드**를 작성해 주십시오.

### ① 팝업 가로채기로 인한 OAuth 로그인 차단 예외 처리 (Critical)
* **상황**: 메인 프로세스(`main.js`)에서 `web-contents-created` 및 `setWindowOpenHandler`로 모든 웹뷰의 `window.open()` 팝업을 가로채어 현재 그리드 웹뷰 프레임(`loadURL`)으로 강제 주입하고 있습니다.
* **문제점**: 이 구조는 구글/네이버 등 간편 로그인(OAuth) 창의 작동을 불가능하게 만듭니다. OAuth 창은 일반적으로 독립된 임시 팝업 창을 띄운 뒤, 로그인이 성공하면 부모 창(`window.opener`)에 토큰을 전달하고 스스로 닫혀야(`window.close()`) 합니다. 현재 로직에서는 로그인 페이지가 동일 웹뷰 그리드 셀 내에 로드되므로 `window.opener`가 상실되고, 로그인 성공 후에도 창이 돌아오지 않아 인증 절차가 완전히 차단됩니다.
* **해결 의뢰**: 팝업 대상 URL을 분석하여, **구글/네이버/페이스북 등 OAuth 인증 팝업이거나 로그인이 필요한 특수 창의 경우**에는 `loadURL`로 가로채지 않고, **세션 쿠키 및 격리 파티션(partition)을 공유하는 독립된 새로운 BrowserWindow(네이티브 팝업창)를 안전하게 생성하여 띄워주도록** 메인 프로세스의 핸들러 코드를 개정해 주십시오.

### ② sendInputEvent 클릭 정밀도 및 화면 스케일 좌표 보정 (Bug)
* **상황**: 렌더러 프로세스(`renderer.js`)에서 Host 세션 마우스 클릭 시 `clientX` / `window.innerWidth` 비율(`data.x`, `data.y`)을 받아 Slave 웹뷰의 픽셀 좌표(`Math.round(data.x * rect.width)`)로 환산하여 `sendInputEvent`를 통해 네이티브 마우스 다운/업 이벤트를 주입합니다.
* **문제점**:
  1. 각 웹뷰의 **줌 배율(`zoomFactor`)**이 다를 경우(예: Host 80%, Slave 120%), 브라우저 내부 좌표계와 물리 픽셀 좌표계에 차이가 생겨 마우스 클릭 좌표가 심하게 엇나갑니다.
  2. 일렉트론 웹뷰의 CSS 패딩이나 보더 경계선 오프셋이 존재할 경우 `getBoundingClientRect()` 기준 좌표가 실제 뷰포트 내부 좌표와 오차가 발생할 수 있습니다.
* **해결 의뢰**: 줌 스케일링 배율(`zoomFactor`) 및 디바이스 픽셀 비율(DPR)을 완벽하게 계산식에 반영하여, **서로 다른 화면 배율 상태에서도 한 치의 오차 없이 정확한 링크와 버튼을 눌러내는 좌표 보정 수식 및 렌더러 측 코드 개선안**을 제시해 주십시오.

### ③ Canvas 지문 우회 안정성 검사 (Stealth Bypass Check)
* **상황**: `toDataURL` 및 `toBlob` 호출 시 2D 컨텍스트에서 임시로 알파 투명도가 들어간 `rgba` 색상을 칠하고 다시 원래 `fillStyle`로 복구합니다.
* **문제점**: 
  1. 만약 사이트가 캔버스 드로잉 도중 혹은 비동기 루틴에서 호출한 경우, 임시로 그린 `rgba(X,Y,0,0.01)` 사각형이 원래 그려져야 하는 2D 이미지의 픽셀 데이터를 파괴하거나 오염시킬 리스크가 존재합니까?
  2. 3D WebGL 및 WebGPU 콘텍스트를 사용하는 캔버스에서 `toDataURL`을 시도할 때, `getContext('2d')`를 호출하거나 색상을 칠하려고 하면 브라우저 에러(컨텍스트 충돌)가 발생합니까?
* **해결 의뢰**: 위 잠재적 오류를 완벽히 차단하고, 2D/3D 캔버스 모두에서 안전하게 컨텍스트 충돌 없이 해시값을 속이는 **안전한 Canvas 핑거프린트 우회 코드 보강안**을 제시해 주십시오.

### ④ 이벤트 리스너 메모리 누수 방지 (Resource Cleanup)
* **상황**: 그리드 레이아웃을 바꿀 때 기존 웹뷰들을 파괴하고 새 웹뷰들을 재생성합니다.
* **문제점**: 파괴된 웹뷰와 관련된 `EventSource` (SSE 서버 연결) 인스턴스와 수많은 비표준 자바스크립트 이벤트 리스너가 메모리상에서 온전히 해제되지 않고 누수되어 가비지 컬렉터(GC)의 수거 대상에서 제외될 위험이 큽니다.
* **해결 의뢰**: `closeEmbeddedWebview` 함수 및 레이아웃 재구성 시, **SSE 채널 연결을 명시적으로 끊고(`close()`) 돔에서 제거된 웹뷰에 묶여있던 모든 리스너와 참조 레퍼런스를 완벽하게 nullify하여 리소스를 완전히 소거하는 가이드 라인 코드**를 작성해 주십시오.

이 사항들에 대해 상세히 아키텍처 관점에서 해답을 제공하고, 개정해야 하는 코드 조각들을 완전한 형태로 작성해 제안해 주십시오.
```
