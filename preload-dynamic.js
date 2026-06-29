
(function() {
  const ua = navigator.userAgent;
  const matchSession = ua.match(/AMEVA_SESSION_(\d+)/);
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
      const spoofScriptBlock = `
        const randomConcurrency = ${[2, 4, 6, 8, 12, 16][sessionId % 6]};
        const randomMemory = ${[4, 8, 16][sessionId % 3]};
        
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
                data[i] = (data[i] + (${sessionId} % 3)) % 256;
                data[i+1] = (data[i+1] + (${sessionId} % 2)) % 256;
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
              return "ANGLE (NVIDIA, NVIDIA GeForce RTX 30" + (60 + ${sessionId} * 5) + " Ti Direct3D11 vs_5_0 ps_5_0)";
            }
            if (parameter === 37445) {
              return "Google Inc. (NVIDIA)";
            }
            return originalGetParameter.apply(this, arguments);
          }
        }
        console.log('[AMEVA Sync] Preload Anti-Fingerprint Active.');
      `;
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
  