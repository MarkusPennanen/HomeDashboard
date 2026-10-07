/*
 * Ink-wash koi pond seen from above, in black and white. Koi swim slowly
 * under ink-wash lily pads, with the odd brush-stroke ripple. Light ink on a
 * transparent canvas, so the black of the mirror acts as the dark paper.
 * Pure canvas, no libraries.
 */
Mirror.register("koi", {
  defaults: {
    fish: 6,
    speed: 1,          // swim speed multiplier
    lilyPads: 3,       // the first one carries a flower
    ripples: true,
    waterTint: true,   // faint drifting ink-wash mist over the water
    fps: 30,           // lower (e.g. 20) if the Pi runs hot
    width: "100%",     // size of the pond: "100%" = the whole middle region (as a CSS length,
    height: "100%",    // e.g. "60vmin", "500px", it is centred in the region)
    fullScreen: false, // true = spread over the whole screen, behind all other modules
  },

  // Ink varieties: wash of the body, ink colours of the blotches, fin wash
  varieties: [
    { base: "#dcdcdc", patches: ["#111111", "#111111", "#6b6b6b"], fin: "#e6e6e6" },   // pale with dark ink
    { base: "#f4f4f4", patches: ["#2a2a2a", "#8a8a8a"], fin: "#fafafa" },               // almost white
    { base: "#9c9c9c", patches: ["#f2f2f2", "#1a1a1a"], fin: "#c4c4c4" },               // grey with white
    { base: "#c2c2c2", patches: ["#0c0c0c"], fin: "#d8d8d8" },                          // one big blot
    { base: "#7e7e7e", patches: ["#e8e8e8", "#4a4a4a"], fin: "#a8a8a8" },               // dark wash
    { base: "#e9e9e9", patches: ["#1c1c1c", "#1c1c1c", "#9a9a9a"], fin: "#f0f0f0" },   // sanke-like
  ],
  widths: [0.7, 0.95, 1, 1, 0.95, 0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.12],

  W: 0, H: 0, fishList: [], ripples: [], pads: [], mist: [], last: 0, nextRipple: 0,

  render() {
    const wrap = Mirror.el("div", "koi-pond");
    this.canvas = document.createElement("canvas");
    wrap.append(this.canvas);
    return wrap;
  },

  start() {
    this.wrapper.style.width = this.config.width;
    this.wrapper.style.height = this.config.height;
    if (this.config.fullScreen) {                   // lift out of its region, behind everything
      this.wrapper.classList.add("koi-full");
      document.querySelector(".mirror").prepend(this.wrapper);
    }
    this.ctx = this.canvas.getContext("2d");
    this.measure();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.measure()).observe(this.canvas);
    else window.addEventListener("resize", () => this.measure());
    this.loopBound = ts => this.loop(ts);
    requestAnimationFrame(this.loopBound);
  },

  measure() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const changed = Math.abs(r.width - this.W) > this.W * 0.05 || Math.abs(r.height - this.H) > this.H * 0.05;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = r.width; this.H = r.height;
    if (changed || !this.fishList.length) this.populate();
  },

  populate() {
    const { fish, lilyPads } = this.config;
    this.unit = Math.min(this.W, this.H);
    this.fishList = Array.from({ length: fish }, (_, i) => this.makeFish(i));
    this.mist = [0, 1].map(i => ({ ph: i * 3.1, r: this.unit * (0.55 + i * 0.15) }));
    this.pads = Array.from({ length: lilyPads }, (_, i) => {
      const a = (i / Math.max(lilyPads, 1)) * Math.PI * 2 + Math.random();
      return {
        x: this.W / 2 + Math.cos(a) * this.W * 0.3, y: this.H / 2 + Math.sin(a) * this.H * 0.3,
        r: this.unit * (0.07 + Math.random() * 0.04), rot: Math.random() * 6.28,
        ph: Math.random() * 6.28, flower: i === 0,
      };
    });
  },

  makeFish(i) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const v = this.varieties[Math.floor(Math.random() * this.varieties.length)];
    const len = this.unit * 0.21 * rnd(0.8, 1.25), n = this.widths.length;
    const heading = rnd(0, 6.28);
    const x = this.W / 2 + rnd(-0.3, 0.3) * this.W, y = this.H / 2 + rnd(-0.3, 0.3) * this.H;
    const seg = len / (n - 1);
    const patches = Array.from({ length: Math.floor(rnd(3, 6)) }, () => ({
      idx: rnd(0.2, 8), off: rnd(-0.5, 0.5), r: rnd(0.5, 1.0), color: v.patches[Math.floor(Math.random() * v.patches.length)],
      blobs: Array.from({ length: 3 }, () => ({ dx: rnd(-0.3, 0.3), dy: rnd(-0.25, 0.25), s: rnd(0.65, 1.1) })),
    }));
    return {
      x, y, heading, len, seg, v, patches, t: rnd(0, 100), phase: rnd(0, 6.28),
      turn: 0, turnTarget: 0, nextTurn: 0, speed: 0, speedTarget: 1, nextSpeed: 0,
      pts: Array.from({ length: n }, (_, k) => ({ x: x - Math.cos(heading) * seg * k, y: y - Math.sin(heading) * seg * k })),
    };
  },

  loop(ts) {
    requestAnimationFrame(this.loopBound);
    const step = 1000 / this.config.fps;
    if (ts - this.last < step - 1) return;
    const dt = Math.min((ts - this.last) / 16.667, 4);
    this.last = ts;
    if (!this.W) { this.measure(); return; }
    this.step(dt, ts);
    this.draw();
  },

  /* ---------- simulation ---------- */

  step(dt, ts) {
    const cx = this.W / 2, cy = this.H / 2, rx = this.W * 0.42, ry = this.H * 0.42;
    const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

    for (const f of this.fishList) {
      f.t += dt;
      if (f.t > f.nextTurn) { f.turnTarget = (Math.random() - 0.5) * 0.03; f.nextTurn = f.t + 90 + Math.random() * 200; }
      if (f.t > f.nextSpeed) { f.speedTarget = 0.5 + Math.random() * 0.9; f.nextSpeed = f.t + 150 + Math.random() * 300; }
      f.turn += (f.turnTarget - f.turn) * 0.02 * dt;
      f.speed += (f.speedTarget - f.speed) * 0.02 * dt;

      // stay inside the pond (an ellipse), turn back gently
      const d = Math.hypot((f.x - cx) / rx, (f.y - cy) / ry);
      if (d > 0.8) {
        const diff = angleDiff(Math.atan2(cy - f.y, cx - f.x), f.heading);
        f.heading += Math.max(-1, Math.min(1, diff)) * Math.min(1, (d - 0.8) * 6) * 0.05 * dt;
      }
      // keep apart from other fish
      for (const o of this.fishList) {
        if (o === f) continue;
        const dx = f.x - o.x, dy = f.y - o.y, dist = Math.hypot(dx, dy);
        if (dist < f.len * 0.7 && dist > 0.01) {
          const diff = angleDiff(Math.atan2(dy, dx), f.heading);
          f.heading += Math.max(-1, Math.min(1, diff)) * 0.03 * dt * (1 - dist / (f.len * 0.7));
        }
      }
      f.heading += f.turn * dt;

      // swim: the head sways, the body follows behind it
      const v = this.unit * 0.0009 * f.speed * this.config.speed * dt;
      f.phase += dt * (0.07 + f.speed * 0.07);
      const sway = Math.sin(f.phase) * 0.35;
      f.x += Math.cos(f.heading + sway * 0.5) * v;
      f.y += Math.sin(f.heading + sway * 0.5) * v;
      f.pts[0].x = f.x; f.pts[0].y = f.y;
      for (let i = 1; i < f.pts.length; i++) {
        const p = f.pts[i], q = f.pts[i - 1];
        const dx = p.x - q.x, dy = p.y - q.y, dist = Math.hypot(dx, dy) || 1;
        p.x = q.x + (dx / dist) * f.seg; p.y = q.y + (dy / dist) * f.seg;
      }
    }

    // ripples
    if (this.config.ripples) {
      if (ts > this.nextRipple) {
        this.ripples.push({ x: this.W * (0.2 + Math.random() * 0.6), y: this.H * (0.2 + Math.random() * 0.6), r: 2, a0: Math.random() * 6.28, max: this.unit * (0.09 + Math.random() * 0.07) });
        this.nextRipple = ts + 3000 + Math.random() * 6000;
      }
      this.ripples.forEach(r => { r.r += 0.35 * dt; });
      this.ripples = this.ripples.filter(r => r.r < r.max);
    }
    this.pads.forEach(p => { p.ph += 0.004 * dt; p.rot += 0.0005 * dt; });
    this.mist.forEach(m => { m.ph += 0.0015 * dt; });
  },

  /* ---------- drawing ---------- */

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // faint drifting ink wash on the water
    if (this.config.waterTint) {
      this.mist.forEach(m => {
        const x = this.W / 2 + Math.cos(m.ph) * this.W * 0.12, y = this.H / 2 + Math.sin(m.ph * 1.3) * this.H * 0.1;
        const g = ctx.createRadialGradient(x, y, 0, x, y, m.r);
        g.addColorStop(0, "rgba(255,255,255,0.04)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);
      });
    }

    this.fishList.forEach(f => this.drawFish(f));

    // ripples as open brush-stroke circles (like an ensō)
    ctx.lineCap = "round";
    this.ripples.forEach(r => {
      const a = 1 - r.r / r.max;
      ctx.strokeStyle = `rgba(240,240,240,${(a * 0.4).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, r.a0, r.a0 + 5.0); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * 0.62, r.a0 + 2.5, r.a0 + 2.5 + 4.2); ctx.stroke();
    });

    this.pads.forEach(p => this.drawPad(p));
  },

  // Smooth curve through points (quadratic curves via midpoints)
  curveThrough(ctx, pts) {
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  },

  // Body outline at a given width scale (wider scales make the soft wash edges)
  bodyPath(pts, tan, hw, scale) {
    const ctx = this.ctx, n = pts.length;
    const L = pts.map((p, i) => ({ x: p.x - tan[i].y * hw * scale * this.widths[i], y: p.y + tan[i].x * hw * scale * this.widths[i] }));
    const R = pts.map((p, i) => ({ x: p.x + tan[i].y * hw * scale * this.widths[i], y: p.y - tan[i].x * hw * scale * this.widths[i] }));
    const nose = { x: pts[0].x + tan[0].x * hw * 0.9 * scale, y: pts[0].y + tan[0].y * hw * 0.9 * scale };
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    this.curveThrough(ctx, L);
    ctx.lineTo(R[n - 1].x, R[n - 1].y);
    this.curveThrough(ctx, R.slice().reverse());
    ctx.quadraticCurveTo(nose.x, nose.y, L[0].x, L[0].y);
    ctx.closePath();
  },

  drawFish(f) {
    const ctx = this.ctx, pts = f.pts, n = pts.length, hw = f.len * 0.1;

    // direction (tangent) at each point of the spine, pointing towards the head
    const tan = pts.map((p, i) => {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    });

    ctx.save();
    ctx.lineCap = "round";

    // tail fin: a thin wash with a few brush-stroke rays, waving with the body
    const tail = pts[n - 1], td = tan[n - 1], fl = f.len * 0.28, fw = f.len * 0.12;
    const nx = -td.y, ny = td.x, sw = Math.sin(f.phase - 1.5) * fw * 0.6;
    const tipL = { x: tail.x - td.x * fl + nx * (fw + sw), y: tail.y - td.y * fl + ny * (fw + sw) };
    const tipR = { x: tail.x - td.x * fl - nx * (fw - sw), y: tail.y - td.y * fl - ny * (fw - sw) };
    const notch = { x: tail.x - td.x * fl * 0.55 + nx * sw * 0.5, y: tail.y - td.y * fl * 0.55 + ny * sw * 0.5 };
    ctx.fillStyle = f.v.fin; ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.quadraticCurveTo(tail.x - td.x * fl * 0.4 + nx * fw * 1.1, tail.y - td.y * fl * 0.4 + ny * fw * 1.1, tipL.x, tipL.y);
    ctx.quadraticCurveTo((tipL.x + notch.x) / 2 - td.x * fl * 0.1, (tipL.y + notch.y) / 2 - td.y * fl * 0.1, notch.x, notch.y);
    ctx.quadraticCurveTo((tipR.x + notch.x) / 2 - td.x * fl * 0.1, (tipR.y + notch.y) / 2 - td.y * fl * 0.1, tipR.x, tipR.y);
    ctx.quadraticCurveTo(tail.x - td.x * fl * 0.4 - nx * fw * 1.1, tail.y - td.y * fl * 0.4 - ny * fw * 1.1, tail.x, tail.y);
    ctx.fill();
    ctx.strokeStyle = f.v.fin; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    [tipL, notch, tipR].forEach((tip, k) => {
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.quadraticCurveTo((tail.x + tip.x) / 2 + nx * (k - 1) * fw * 0.3, (tail.y + tip.y) / 2 + ny * (k - 1) * fw * 0.3, tip.x, tip.y);
      ctx.stroke();
    });

    // pectoral fins, flapping gently
    ctx.fillStyle = f.v.fin; ctx.globalAlpha = 0.3;
    [-1, 1].forEach(side => {
      const p = pts[2], t = tan[2];
      const ang = Math.atan2(t.y, t.x) + Math.PI + side * (0.9 + Math.sin(f.phase * 2 + side) * 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x + t.y * side * hw * 1.1 - t.x * hw * 0.6, p.y - t.x * side * hw * 1.1 - t.y * hw * 0.6, f.len * 0.1, f.len * 0.035, ang, 0, 6.283);
      ctx.fill();
    });

    // body: layered washes, wide and faint first, so the edge looks like soaked ink
    ctx.fillStyle = f.v.base;
    [[1.22, 0.12], [1.11, 0.2], [1.0, 0.88]].forEach(([scale, alpha]) => {
      ctx.globalAlpha = alpha;
      this.bodyPath(pts, tan, hw, scale);
      ctx.fill();
    });

    // ink blotches, clipped to the body; each is three overlapping spots so the edge bleeds
    this.bodyPath(pts, tan, hw, 1.0);
    ctx.save();
    ctx.clip();
    f.patches.forEach(pt => {
      const i = Math.min(Math.floor(pt.idx), n - 2), k = pt.idx - i;
      const x = pts[i].x + (pts[i + 1].x - pts[i].x) * k, y = pts[i].y + (pts[i + 1].y - pts[i].y) * k;
      const t = tan[i], w = hw * this.widths[i], ang = Math.atan2(t.y, t.x);
      ctx.fillStyle = pt.color; ctx.globalAlpha = 0.6;
      pt.blobs.forEach(b => {
        const ox = t.x * b.dx * w * 3 + t.y * (pt.off * 2 + b.dy) * w;
        const oy = t.y * b.dx * w * 3 - t.x * (pt.off * 2 + b.dy) * w;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, w * pt.r * 1.7 * b.s, w * pt.r * b.s, ang, 0, 6.283);
        ctx.fill();
      });
    });
    ctx.restore();

    // one brush stroke down the back, and a pale edge line
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = Math.max(1, hw * 0.28); ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(pts[1].x, pts[1].y);
    for (let i = 2; i < n - 2; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    ctx.stroke();
    this.bodyPath(pts, tan, hw, 1.0);
    ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 0.8;
    ctx.stroke();

    // eyes
    ctx.fillStyle = "#0a0a0a";
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.arc(pts[0].x + tan[0].x * hw * 0.15 + tan[0].y * side * hw * 0.5, pts[0].y + tan[0].y * hw * 0.15 - tan[0].x * side * hw * 0.5, f.len * 0.012, 0, 6.283);
      ctx.fill();
    });
    ctx.restore();
  },

  drawPad(p) {
    const ctx = this.ctx, x = p.x + Math.sin(p.ph) * 6, y = p.y + Math.cos(p.ph * 0.8) * 4;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(p.rot);
    ctx.lineCap = "round";
    // soft wash, built up in two layers
    [[1.07, 0.05], [1, 0.11]].forEach(([s, a]) => {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.r * s, 0.22, 6.283 - 0.22); ctx.closePath();
      ctx.fillStyle = `rgba(215,215,215,${a})`; ctx.fill();
    });
    // one confident brush outline
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0.22, 6.283 - 0.22);
    ctx.strokeStyle = "rgba(240,240,240,0.42)"; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = "rgba(240,240,240,0.14)"; ctx.lineWidth = 1;     // veins
    for (let a = 0.9; a < 6.2; a += 1.1) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * p.r * 0.9, Math.sin(a) * p.r * 0.9); ctx.stroke(); }
    if (p.flower) {                                                  // lotus: outlined petals
      ctx.strokeStyle = "rgba(250,250,250,0.8)"; ctx.fillStyle = "rgba(250,250,250,0.18)"; ctx.lineWidth = 1.1;
      for (let k = 0; k < 8; k++) {
        ctx.save(); ctx.rotate((k / 8) * 6.283);
        ctx.beginPath(); ctx.ellipse(p.r * 0.2, 0, p.r * 0.2, p.r * 0.085, 0, 0, 6.283);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.08, 0, 6.283); ctx.fillStyle = "rgba(250,250,250,0.9)"; ctx.fill();
    }
    ctx.restore();
  },
});
