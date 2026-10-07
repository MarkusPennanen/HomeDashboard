Mirror.register("clock", {
  defaults: {
    hour12: false,
    showSeconds: false,
    showSun: true,       // sunrise and sunset under the time
    lat: 60.1699,        // your location, used to calculate sunrise and sunset (no network needed)
    lon: 24.9384,
  },

  // The clock's own styles. The sun row inherits the region's text alignment, so it stays
  // left, centred or right under the time, whichever region the clock is placed in.
  css: `
    .clock .sun { margin-top: 1.2vmin; font-size: 2.3vmin; font-variant-numeric: tabular-nums; }
    .clock .sun-item { display: inline-flex; align-items: center; gap: .7vmin; }
    .clock .sun-item + .sun-item { margin-left: 2.5vmin; }
    .clock .sun svg { width: 2.6vmin; height: 2.6vmin; flex: none; }
  `,

  sunDay: null,

  start() {
    // Update every second; only touches the text, not the whole DOM
    this.every(1000, this.tick);
  },

  tick() {
    const d = new Date();
    const opts = { hour: "2-digit", minute: "2-digit", hour12: this.config.hour12 };
    if (this.config.showSeconds) opts.second = "2-digit";
    this.timeEl.textContent = d.toLocaleTimeString("fi-FI", opts);
    this.dateEl.textContent = d.toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long" });
    if (this.config.showSun && this.sunDay !== d.toDateString()) this.updateSun(d);   // once a day
  },

  render() {
    const box = document.createElement("div");
    this.dateEl = Mirror.el("div", "medium dim");
    this.timeEl = Mirror.el("div", "xlarge bright");
    this.sunEl = Mirror.el("div", "sun dim");
    box.append(this.dateEl, this.timeEl, this.sunEl);
    return box;
  },

  /* ---------- sunrise and sunset ---------- */

  updateSun(d) {
    this.sunDay = d.toDateString();
    const { rise, set } = this.sunTimes(d, this.config.lat, this.config.lon);
    this.sunEl.replaceChildren();
    if (rise) this.sunEl.append(this.sunItem("rise", rise));
    if (set) this.sunEl.append(this.sunItem("set", set));     // in polar summer or winter one or both are missing
  },

  sunItem(kind, date) {
    const hh = String(date.getHours()).padStart(2, "0"), mm = String(date.getMinutes()).padStart(2, "0");
    const item = Mirror.el("span", "sun-item");
    item.append(this.icon(kind), document.createTextNode(`${hh}:${mm}`));
    return item;
  },

  // Small line icon: a half sun on the horizon with an arrow up (rise) or down (set)
  icon(kind) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS(NS, "path");
    const arrow = kind === "rise" ? "M9 6l3-3 3 3" : "M9 6l3 3 3-3";
    path.setAttribute("d", `M3 19h18 M7 19a5 5 0 0 1 10 0 M12 3v6 ${arrow}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  },

  // Sunrise equation (as on Wikipedia): accurate to about a minute. lon is east-positive.
  sunTimes(day, lat, lon) {
    const rad = Math.PI / 180;
    const jdNoon = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12) / 86400000 + 2440587.5;
    const n = Math.ceil(jdNoon - 2451545.0 + 0.0008);
    const jStar = n - lon / 360;
    const M = (357.5291 + 0.98560028 * jStar) % 360;
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const lambda = (M + C + 180 + 102.9372) % 360;
    const transit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
    const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
    if (cosH > 1 || cosH < -1) return { rise: null, set: null };    // sun never rises (or never sets) today
    const H = Math.acos(cosH) / rad;
    const toDate = jd => new Date((jd - 2440587.5) * 86400000);
    return { rise: toDate(transit - H / 360), set: toDate(transit + H / 360) };
  },
});
