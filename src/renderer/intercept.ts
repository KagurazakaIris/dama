window.addEventListener('DOMContentLoaded', async () => {
  const thumbnail = document.getElementById('thumbnail') as HTMLImageElement;
  const btnMosaic = document.getElementById('btn-mosaic')!;
  const btnSkip = document.getElementById('btn-skip')!;
  const countdown = document.getElementById('countdown')!;

  // Load thumbnail
  const imageBase64 = await window.damaAPI.getInterceptImage();
  if (imageBase64) {
    thumbnail.src = `data:image/png;base64,${imageBase64}`;
  }

  // Countdown
  let seconds = 10;
  const timer = setInterval(() => {
    seconds--;
    countdown.textContent = String(seconds);
    if (seconds <= 0) {
      clearInterval(timer);
      window.damaAPI.interceptAction('skip');
    }
  }, 1000);

  btnMosaic.addEventListener('click', () => {
    clearInterval(timer);
    window.damaAPI.interceptAction('mosaic');
  });

  btnSkip.addEventListener('click', () => {
    clearInterval(timer);
    window.damaAPI.interceptAction('skip');
  });
});
