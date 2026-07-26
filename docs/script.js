/**
 * AMEVA Multi-Session Browser Launcher Live Simulator Script
 * Controls interactive demo simulations, terminal logs, sync movements
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const simUrlInput = document.getElementById('sim-url');
  const simBtnGo = document.getElementById('sim-btn-go');
  const simBtnReload = document.getElementById('sim-btn-reload');
  const simBtnTheme = document.getElementById('sim-btn-theme');
  const simThemeSelect = document.getElementById('sim-theme-select');
  const simHostSlaveCheckbox = document.getElementById('sim-host-slave');
  const simAntiFpCheckbox = document.getElementById('sim-anti-fp');
  const simJitterCheckbox = document.getElementById('sim-jitter');
  const simStealthCheckbox = document.getElementById('sim-stealth');
  const simBtnPlay = document.getElementById('sim-btn-play');
  const simBtnRealign = document.getElementById('sim-btn-realign');
  const simLogsContainer = document.getElementById('sim-logs');
  const mockLauncher = document.querySelector('.app-launcher-mockup');
  
  // Browsers inside grid
  const browserWins = document.querySelectorAll('.mock-browser-win');
  const simPages = document.querySelectorAll('.sim-page');
  const simBuyBtns = document.querySelectorAll('.sim-buy-btn');
  
  // Virtual Cursors
  const cursorHost = document.getElementById('cursor-host');
  const cursorSlaves = {
    2: document.getElementById('cursor-slave-2'),
    3: document.getElementById('cursor-slave-3'),
    4: document.getElementById('cursor-slave-4')
  };

  let demoInterval = null;
  let isDemoPlaying = false;

  // Init default cursor positions
  resetCursors();

  // 1. Terminal Logger Helper
  function logMessage(text, type = 'info') {
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const line = document.createElement('div');
    line.className = 'term-line';
    
    if (type === 'blue') line.classList.add('highlight-blue');
    else if (type === 'green') line.classList.add('highlight-green');
    else if (type === 'purple') line.classList.add('highlight-purple');
    
    line.innerHTML = `[${time}] ${text}`;
    simLogsContainer.appendChild(line);
    
    // Auto Scroll to bottom
    simLogsContainer.scrollTop = simLogsContainer.scrollHeight;
    
    // Keep last 15 lines only
    while (simLogsContainer.childElementCount > 15) {
      simLogsContainer.removeChild(simLogsContainer.firstChild);
    }
  }

  // 2. Reset Cursors Helper
  function resetCursors() {
    cursorHost.style.left = '50%';
    cursorHost.style.top = '50%';
    cursorHost.style.opacity = '0';
    Object.values(cursorSlaves).forEach(cursor => {
      cursor.style.left = '50%';
      cursor.style.top = '50%';
      cursor.style.opacity = '0';
    });
  }

  // 3. Theme Toggle & Select Sync
  function changeTheme(themeName) {
    mockLauncher.classList.remove('theme-matrix', 'theme-glass');
    if (themeName === 'matrix') {
      mockLauncher.classList.add('theme-matrix');
      logMessage('Visual Theme updated to [Matrix Green]', 'green');
    } else if (themeName === 'glass') {
      mockLauncher.classList.add('theme-glass');
      logMessage('Visual Theme updated to [Aero Glass]', 'blue');
    } else {
      logMessage('Visual Theme updated to [Dark Cyber]', 'info');
    }
    simThemeSelect.value = themeName;
  }

  simThemeSelect.addEventListener('change', (e) => {
    changeTheme(e.target.value);
  });

  simBtnTheme.addEventListener('click', () => {
    const themes = ['cyber', 'matrix', 'glass'];
    const currentIdx = themes.indexOf(simThemeSelect.value);
    const nextIdx = (currentIdx + 1) % themes.length;
    changeTheme(themes[nextIdx]);
  });

  // 4. Manual Settings Toggles
  simHostSlaveCheckbox.addEventListener('change', (e) => {
    const active = e.target.checked;
    logMessage(`Host-Slave Event Sync: ${active ? 'ENABLED' : 'DISABLED'}`, active ? 'blue' : 'info');
    document.querySelector('.session-sync-indicator').style.display = active ? 'flex' : 'none';
  });

  simAntiFpCheckbox.addEventListener('change', (e) => {
    const active = e.target.checked;
    logMessage(`Anti-Fingerprint Spoofing: ${active ? 'ACTIVE' : 'INACTIVE'}`, active ? 'green' : 'info');
  });

  simJitterCheckbox.addEventListener('change', (e) => {
    const active = e.target.checked;
    logMessage(`Human Jitter Evasion: ${active ? 'ACTIVE' : 'INACTIVE'}`, active ? 'purple' : 'info');
  });

  simStealthCheckbox.addEventListener('change', (e) => {
    const active = e.target.checked;
    logMessage(`Stealth Evasion Mode: ${active ? 'SHIELDED' : 'UNSHIELDED'}`, active ? 'purple' : 'info');
    
    browserWins.forEach(win => {
      if (win.classList.contains('is-slave')) {
        if (active) win.classList.add('stealth');
        else win.classList.remove('stealth');
      }
    });
  });

  // Re-align Grid action
  simBtnRealign.addEventListener('click', () => {
    logMessage('Re-calculating window geometry coordinates...', 'info');
    setTimeout(() => {
      logMessage('Desktop Grid Layout realigned: 2x2 matrix grid set.', 'green');
    }, 400);
  });

  // 5. Automatic / Manual Go URL Load
  function loadUrl(url) {
    logMessage(`Navigating all active sessions to: https://${url}`, 'blue');
    
    // Simulate Loading State on webviews
    simPages.forEach(page => {
      page.style.opacity = '0.3';
    });

    setTimeout(() => {
      simPages.forEach((page, idx) => {
        page.style.opacity = '1';
        // Reset buy buttons in views
        simBuyBtns[idx].classList.remove('clicked');
        simBuyBtns[idx].textContent = 'Add to Cart';
      });
      logMessage(`Session #1 (Host): Loaded https://${url} [200 OK]`, 'green');
      logMessage(`Session #2 (Slave): Loaded https://${url} via Proxy [200 OK]`, 'green');
      logMessage(`Session #3 (Slave): Loaded https://${url} via Proxy [200 OK]`, 'green');
      logMessage(`Session #4 (Slave): Loaded https://${url} via Proxy [200 OK]`, 'green');
    }, 800);
  }

  simBtnGo.addEventListener('click', () => {
    loadUrl(simUrlInput.value);
  });
  simBtnReload.addEventListener('click', () => {
    loadUrl(simUrlInput.value);
  });

  // 6. Demo Timeline Sequencer
  function runDemoStep(step) {
    if (!isDemoPlaying) return;

    switch(step) {
      case 0:
        logMessage('시나리오 데모 시작: 주소창 타이핑 시뮬레이션...', 'info');
        simUrlInput.value = '';
        let urlStr = 'cybermall.com/product/m4';
        let charIdx = 0;
        
        const typing = setInterval(() => {
          if (!isDemoPlaying) { clearInterval(typing); return; }
          simUrlInput.value += urlStr[charIdx];
          charIdx++;
          if (charIdx >= urlStr.length) {
            clearInterval(typing);
            setTimeout(() => runDemoStep(1), 500);
          }
        }, 60);
        break;

      case 1:
        simBtnGo.style.transform = 'scale(0.95)';
        setTimeout(() => {
          simBtnGo.style.transform = 'scale(1)';
        }, 150);
        loadUrl('cybermall.com/product/m4');
        setTimeout(() => runDemoStep(2), 1500);
        break;

      case 2:
        logMessage('호스트 마우스 이동: 상품 이미지 분석 영역 진입', 'info');
        cursorHost.style.opacity = '1';
        cursorHost.style.left = '25%';
        cursorHost.style.top = '30%';

        // Slave Cursors follow with randomized jitter offset
        setTimeout(() => {
          if (!isDemoPlaying) return;
          const hostSlaveSync = simHostSlaveCheckbox.checked;
          const humanJitter = simJitterCheckbox.checked;
          
          Object.entries(cursorSlaves).forEach(([id, cursor]) => {
            cursor.style.opacity = hostSlaveSync ? '0.7' : '0';
            const offsetLeft = humanJitter ? (Math.random() * 10 - 5) : 0;
            const offsetTop = humanJitter ? (Math.random() * 10 - 5) : 0;
            cursor.style.left = `calc(25% + ${offsetLeft}px)`;
            cursor.style.top = `calc(30% + ${offsetTop}px)`;
          });
          
          if (hostSlaveSync) {
            logMessage('Sync Broadcast: Host MouseMove event pushed to all slaves.', 'blue');
          }
        }, 200);

        setTimeout(() => runDemoStep(3), 1500);
        break;

      case 3:
        logMessage('호스트 스크롤 동작 발생 -> 슬레이브 뷰포트 스크롤 동기화', 'info');
        // Scroll down page
        simPages.forEach(page => {
          page.style.transform = 'translateY(-100px)';
        });
        
        cursorHost.style.top = '60%';
        setTimeout(() => {
          if (!isDemoPlaying) return;
          const hostSlaveSync = simHostSlaveCheckbox.checked;
          const humanJitter = simJitterCheckbox.checked;
          Object.entries(cursorSlaves).forEach(([id, cursor]) => {
            if (hostSlaveSync) {
              const offsetTop = humanJitter ? (Math.random() * 14 - 7) : 0;
              cursor.style.top = `calc(60% + ${offsetTop}px)`;
            }
          });
          if (hostSlaveSync) {
            logMessage('Sync Broadcast: Scroll event synchronized across 4 grids.', 'blue');
          }
        }, 150);

        setTimeout(() => runDemoStep(4), 1800);
        break;

      case 4:
        logMessage('호스트 마우스 클릭 준비: [Add to Cart] 버튼 타겟팅', 'info');
        cursorHost.style.left = '65%';
        cursorHost.style.top = '58%';

        setTimeout(() => {
          if (!isDemoPlaying) return;
          const hostSlaveSync = simHostSlaveCheckbox.checked;
          const humanJitter = simJitterCheckbox.checked;
          Object.entries(cursorSlaves).forEach(([id, cursor]) => {
            cursor.style.opacity = hostSlaveSync ? '0.7' : '0';
            const offsetLeft = humanJitter ? (Math.random() * 8 - 4) : 0;
            const offsetTop = humanJitter ? (Math.random() * 8 - 4) : 0;
            cursor.style.left = `calc(65% + ${offsetLeft}px)`;
            cursor.style.top = `calc(58% + ${offsetTop}px)`;
          });
        }, 250);

        setTimeout(() => runDemoStep(5), 1500);
        break;

      case 5:
        logMessage('호스트 클릭 실행 -> 슬레이브 세션 동시 클릭 격발', 'info');
        
        // Host click animation
        simBuyBtns[0].classList.add('clicked');
        simBuyBtns[0].textContent = 'Success ✓';
        
        // Simulating ripple / click pulse effect on Host cursor
        cursorHost.style.transform = 'translate(-50%, -50%) scale(1.5)';
        setTimeout(() => {
          cursorHost.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 200);

        setTimeout(() => {
          if (!isDemoPlaying) return;
          const hostSlaveSync = simHostSlaveCheckbox.checked;
          
          if (hostSlaveSync) {
            // Slaves click
            for (let i = 1; i < simBuyBtns.length; i++) {
              if (simStealthCheckbox.checked) continue; // Stealth mode blocks GUI rendering
              simBuyBtns[i].classList.add('clicked');
              simBuyBtns[i].textContent = 'Success ✓';
              cursorSlaves[i + 1].style.transform = 'translate(-50%, -50%) scale(1.5)';
            }
            setTimeout(() => {
              Object.values(cursorSlaves).forEach(c => c.style.transform = 'translate(-50%, -50%) scale(1)');
            }, 200);
            
            logMessage('Sync Broadcast: Host CLICK event propagated safely.', 'green');
            logMessage('Bypass Result: 4 Multi-Accounts checkout bypass complete.', 'green');
          } else {
            logMessage('Sync Blocked: Host-Slave Sync is disabled. Slaves ignored click.', 'purple');
          }
        }, 300); // 0.3s delay represents Human Sync Propagation

        setTimeout(() => runDemoStep(6), 2500);
        break;

      case 6:
        logMessage('시나리오 완료. 5초 후 시나리오 재순환...', 'green');
        
        // Fade out cursors
        setTimeout(() => {
          cursorHost.style.opacity = '0';
          Object.values(cursorSlaves).forEach(c => c.style.opacity = '0');
        }, 1000);

        // Scroll back to top
        setTimeout(() => {
          simPages.forEach(page => {
            page.style.transform = 'translateY(0)';
          });
        }, 2000);

        // Repeat
        demoInterval = setTimeout(() => {
          if (isDemoPlaying) runDemoStep(0);
        }, 5000);
        break;
    }
  }

  // 7. Toggle Auto Demo Play / Pause
  function toggleDemo() {
    if (isDemoPlaying) {
      // Pause
      isDemoPlaying = false;
      clearTimeout(demoInterval);
      simBtnPlay.innerHTML = '<i class="fas fa-play"></i> 자동 데모 재생';
      simBtnPlay.classList.remove('playing');
      logMessage('데모 자동 재생이 중지되었습니다.', 'info');
      resetCursors();
    } else {
      // Play
      isDemoPlaying = true;
      simBtnPlay.innerHTML = '<i class="fas fa-pause"></i> 데모 일시중지';
      simBtnPlay.classList.add('playing');
      runDemoStep(0);
    }
  }

  simBtnPlay.addEventListener('click', toggleDemo);

  // Auto-play demo on page load after a brief delay
  setTimeout(() => {
    toggleDemo();
  }, 1200);
});
