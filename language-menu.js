(() => {
  const scrollKey = 'sipmetra.language-scroll';
  const root = document.documentElement;
  const sections = () => [...document.querySelectorAll(
    '.hero-content, .prototype-section, .hero-preview, .feature, .policy section'
  )];
  const readingLine = () => Number.parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;

  function takeScrollPosition() {
    try {
      const pending = sessionStorage.getItem(scrollKey);
      if (!pending) return null;
      sessionStorage.removeItem(scrollKey);
      const position = JSON.parse(pending);
      return position?.path === location.pathname ? position : null;
    } catch {
      return null;
    }
  }

  function rememberScrollPosition(path) {
    const y = Math.max(0, window.scrollY);
    const position = { path, y };
    if (y > 0) {
      if (document.querySelector('footer').getBoundingClientRect().top < window.innerHeight) {
        position.bottomGap = Math.max(0, root.scrollHeight - window.innerHeight - y);
      } else {
        const line = readingLine();
        const bounds = sections().map(section => section.getBoundingClientRect());
        const index = bounds.findLastIndex(rect => rect.top <= line);
        if (index !== -1) {
          position.section = index;
          position.offset = line - bounds[index].top;
        }
      }
    }
    sessionStorage.setItem(scrollKey, JSON.stringify(position));
  }

  function restoreScrollPosition(position) {
    let top = position.y;
    if (position.bottomGap !== undefined) {
      top = root.scrollHeight - window.innerHeight - position.bottomGap;
    } else if (position.section !== undefined) {
      const section = sections()[position.section];
      if (section) {
        const rect = section.getBoundingClientRect();
        top = window.scrollY + rect.top + Math.min(position.offset, rect.height) - readingLine();
      }
    }
    window.scrollTo({ top, behavior: 'instant' });
  }

  const pending = takeScrollPosition();
  // Restore after layout, before the translated page is first shown.
  if (pending) root.style.visibility = 'hidden';

  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.querySelector('.language-picker');
    const trigger = picker.querySelector('summary');
    if (pending) {
      try {
        restoreScrollPosition(pending);
      } finally {
        root.style.removeProperty('visibility');
      }
      trigger.focus({ preventScroll: true });
    }

    document.addEventListener('click', event => {
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && picker.open) {
        picker.open = false;
        trigger.focus({ preventScroll: true });
      }
    });

    for (const link of picker.querySelectorAll('a')) {
      link.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        picker.open = false;
        if (link.getAttribute('aria-current') === 'page') {
          event.preventDefault();
          trigger.focus({ preventScroll: true });
          return;
        }
        try {
          rememberScrollPosition(link.pathname);
          link.hash = '';
        } catch {
          link.hash = document.getElementById(location.hash.slice(1)) ? location.hash : '';
        }
      });
    }
  }, { once: true });
})();
