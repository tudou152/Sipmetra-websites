(() => {
  const picker = document.querySelector('.language-picker');
  const trigger = picker.querySelector('summary');

  document.addEventListener('click', event => {
    if (picker.open && !picker.contains(event.target)) picker.open = false;
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker.open) {
      picker.open = false;
      trigger.focus();
    }
  });

  for (const link of picker.querySelectorAll('a')) {
    link.addEventListener('click', event => {
      link.hash = document.getElementById(location.hash.slice(1)) ? location.hash : '';
      picker.open = false;
      if (link.getAttribute('aria-current') === 'page') {
        event.preventDefault();
        trigger.focus();
      }
    });
  }
})();
