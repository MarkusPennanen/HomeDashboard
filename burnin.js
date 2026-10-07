/*
 * Burn-in protection: every few minutes the whole layout is nudged by a few
 * pixels in a random direction, so text never sits on exactly the same pixels.
 * Configured via MIRROR_CONFIG.burnIn in config.js. Set shiftEveryMs to 0 to turn off.
 * Test from the browser console: BurnIn.shift()
 */
const BurnIn = (() => {
  const cfg = Object.assign({ shiftEveryMs: 5 * 60 * 1000, shiftPx: 6 }, window.MIRROR_CONFIG?.burnIn);
  const mirror = document.querySelector(".mirror");

  function shift() {
    const r = () => Math.round((Math.random() * 2 - 1) * cfg.shiftPx);
    mirror.style.transform = `translate(${r()}px, ${r()}px)`;
  }

  if (cfg.shiftEveryMs > 0 && cfg.shiftPx > 0) setInterval(shift, cfg.shiftEveryMs);

  return { shift };
})();
