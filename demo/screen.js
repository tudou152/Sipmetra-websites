(() => {
  const screen = document.querySelector('.prototype-screen');
  const frame = screen.querySelector('iframe');
  const english = document.documentElement.lang === 'en';
  const labels = english
    ? { record: 'Record water', stats: 'Statistics', settings: 'Settings', close: 'Close panel', achieved: 'Goal reached', fullscreen: 'Enter Full Screen', exitFullscreen: 'Exit Full Screen' }
    : { record: '记录饮水', stats: '统计洞察', settings: '设置', close: '收起面板', achieved: '已达标', fullscreen: '全屏显示', exitFullscreen: '退出全屏' };

  screen.insertAdjacentHTML('beforeend', `
    <div class="prototype-menu-bar">
      <strong>Sipmetra</strong>
      <div class="prototype-menu-items">
        <button type="button" class="prototype-status" data-view="record" aria-label="${labels.record}" disabled>
          <span class="prototype-status-drop" aria-hidden="true"></span>
          <span class="prototype-percent">–</span>
          <span class="prototype-countdown" hidden></span>
        </button>
        <time class="prototype-clock"></time>
      </div>
    </div>
    <div class="prototype-dock" role="group" aria-label="Dock">
      <button type="button" data-view="record" aria-label="${labels.record}" title="${labels.record}" disabled>
        <img class="prototype-dock-app" src="assets/sipmetra.png" alt="" width="34" height="34">
      </button>
      <button type="button" data-view="stats" aria-label="${labels.stats}" title="${labels.stats}" disabled>
        <span class="prototype-dock-tile prototype-dock-stats"><img src="demo/desktop-assets/statistics.png" alt="" width="21" height="17"></span>
      </button>
      <button type="button" data-view="settings" aria-label="${labels.settings}" title="${labels.settings}" disabled>
        <span class="prototype-dock-tile prototype-dock-settings"><img src="demo/desktop-assets/settings.png" alt="" width="22" height="22"></span>
      </button>
    </div>
    <button type="button" class="prototype-fullscreen" aria-label="${labels.fullscreen}" title="${labels.fullscreen}">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path class="fullscreen-enter" d="M3 7V3h4m6 0h4v4m0 6v4h-4m-6 0H3v-4"/>
        <path class="fullscreen-exit" d="M7 3v4H3m14 0h-4V3m0 14v-4h4M3 13h4v4"/>
      </svg>
    </button>`);

  const status = screen.querySelector('.prototype-status');
  const percent = screen.querySelector('.prototype-percent');
  const countdown = screen.querySelector('.prototype-countdown');
  const clock = screen.querySelector('.prototype-clock');
  const dock = screen.querySelector('.prototype-dock');
  const dockButtons = [...dock.querySelectorAll('button')];
  const fullscreenButton = screen.querySelector('.prototype-fullscreen');
  const actions = [status, ...dockButtons];
  const timeFormat = new Intl.DateTimeFormat(document.documentElement.lang, {
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  let panel;
  let requestedView;

  function panelIsOpen() {
    return panel.open && panel.opening?.open !== false;
  }

  function renderMenuBar() {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = timeFormat.format(now);
    if (!panel) return;

    const reached = panel.total >= panel.goal;
    const paused = reached && !panel.reminderOptions.afterGoal;
    const seconds = Math.ceil(panel.remaining);
    const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const next = paused ? labels.achieved : panel.sampleMinutes === null ? '–' : duration;
    const style = panel.generalOptions.menuBarStyle;
    percent.textContent = `${Math.round(panel.total / panel.goal * 100)}%`;
    percent.hidden = style === 'iconOnly';
    countdown.hidden = style !== 'full';
    countdown.textContent = next;
    status.toggleAttribute('data-achieved', reached);
    status.toggleAttribute('data-colored', !panel.generalOptions.monochromeMenuBar);
    const details = countdown.hidden ? percent.textContent : `${percent.textContent}, ${next}`;
    const expanded = panelIsOpen();
    status.setAttribute('aria-label', `${expanded ? labels.close : labels.record}, ${details}`);
    status.setAttribute('aria-expanded', String(expanded));
  }

  function showRequestedView() {
    if (!requestedView || panel.motion?.pouring || panel.hold) return;
    const view = requestedView;
    requestedView = null;
    if (!panelIsOpen()) panel.openPanel();
    if (panel.page === view) return;
    if (view === 'settings') panel.openDailySettings();
    else panel.toggleMemory(view === 'stats');
  }

  function syncDesktop() {
    showRequestedView();
    for (const button of dockButtons) {
      const expanded = panelIsOpen() && panel.page === button.dataset.view;
      button.setAttribute('aria-expanded', String(expanded));
    }
    renderMenuBar();
  }

  function connectPanel() {
    const existing = frame.contentDocument?.querySelector('notch-hydro-demo');
    if (!existing || existing === panel || typeof existing.openPanel !== 'function') return;
    panel = existing;
    panel.addEventListener('hydro-change', syncDesktop);
    panel.addEventListener('hydro-preferences-change', syncDesktop);
    frame.contentWindow.addEventListener('keydown', exitViewportOnEscape, true);
    for (const button of actions) button.disabled = false;
    syncDesktop();
  }

  for (const button of actions) button.addEventListener('click', () => {
    if (panelIsOpen() && (button === status || panel.page === button.dataset.view)) {
      requestedView = null;
      panel.closePanel();
      return;
    }
    requestedView = button.dataset.view;
    showRequestedView();
  });
  frame.addEventListener('load', connectPanel);
  connectPanel();
  renderMenuBar();
  setInterval(renderMenuBar, 1000);

  const background = [];
  const recordingWidth = 369;
  // The tallest panel reaches 560px when positioned below the notch.
  const maxPanelBottom = 560;

  function fitScreen() {
    const { width, height } = screen.getBoundingClientRect();
    const panelRatio = Number.parseFloat(getComputedStyle(screen).getPropertyValue('--prototype-panel-ratio'));
    const dockTop = dock.offsetTop;
    const availableHeight = Math.max(0, Math.min(height, dockTop) - 12);
    const scale = Math.min(width * panelRatio / recordingWidth, availableHeight / maxPanelBottom);
    screen.style.setProperty('--prototype-scale', scale);
  }

  function renderFullscreen() {
    const active = document.fullscreenElement === screen || screen.hasAttribute('data-viewport-fullscreen');
    const label = active ? labels.exitFullscreen : labels.fullscreen;
    fullscreenButton.toggleAttribute('data-expanded', active);
    fullscreenButton.setAttribute('aria-label', label);
    fullscreenButton.title = label;
    fitScreen();
  }

  function setViewportFullscreen(active) {
    screen.toggleAttribute('data-viewport-fullscreen', active);
    document.documentElement.classList.toggle('prototype-viewport-fullscreen', active);
    if (active) {
      for (let element = screen; element !== document.body; element = element.parentElement) {
        for (const sibling of element.parentElement.children) {
          if (sibling === element || !(sibling instanceof HTMLElement) || sibling.inert) continue;
          sibling.inert = true;
          background.push(sibling);
        }
      }
    } else {
      for (const element of background.splice(0)) element.inert = false;
    }
    renderFullscreen();
    fullscreenButton.focus({ preventScroll: true });
  }

  function exitViewportOnEscape(event) {
    if (event.key !== 'Escape' || !screen.hasAttribute('data-viewport-fullscreen')) return;
    event.preventDefault();
    setViewportFullscreen(false);
  }

  fullscreenButton.addEventListener('click', async () => {
    if (screen.hasAttribute('data-viewport-fullscreen')) {
      setViewportFullscreen(false);
    } else if (document.fullscreenElement === screen) {
      await document.exitFullscreen();
    } else if (!document.fullscreenEnabled || !screen.requestFullscreen) {
      setViewportFullscreen(true);
    } else {
      try {
        await screen.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        setViewportFullscreen(true);
      }
    }
  });

  window.addEventListener('keydown', exitViewportOnEscape, true);
  document.addEventListener('fullscreenchange', renderFullscreen);

  fitScreen();
  new ResizeObserver(fitScreen).observe(screen);
})();
