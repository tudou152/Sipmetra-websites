const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const recordingPreviews = [];

for (const media of document.querySelectorAll('.recording-media')) {
  const video = media.querySelector('video');
  const toggle = media.querySelector('.recording-toggle');
  if (!video.canPlayType('video/mp4')) continue;

  const updateToggle = () => {
    toggle.toggleAttribute('data-playing', !video.paused);
    toggle.setAttribute('aria-label', video.paused ? toggle.dataset.playLabel : toggle.dataset.pauseLabel);
  };

  toggle.addEventListener('click', () => {
    if (video.paused) video.play().catch(updateToggle);
    else video.pause();
  });
  video.addEventListener('play', updateToggle);
  video.addEventListener('pause', updateToggle);
  video.controls = false;
  toggle.hidden = false;
  recordingPreviews.push(video);
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const { intersectionRatio, target: video } of entries) {
      if (intersectionRatio < 0.45) continue;
      observer.unobserve(video);
      if (!reducedMotion.matches && video.paused && video.currentTime === 0) {
        video.play().catch(() => {});
      }
    }
  }, { threshold: 0.45 });

  recordingPreviews.forEach((video) => observer.observe(video));
}

reducedMotion.addEventListener('change', ({ matches }) => {
  if (matches) recordingPreviews.forEach((video) => video.pause());
});
