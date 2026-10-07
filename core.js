/*
 * Mirror core. A module is a plain object registered with Mirror.register().
 *
 *   Mirror.register("name", {
 *     defaults: { ... },                // overridden by config.js
 *     css: "...",                       // optional styles, added to the page automatically
 *     start()   { },                    // called once, after DOM is ready
 *     render()  { return HTMLElement }, // build the module's content
 *     // inside any method: this.config, this.update(), this.every(ms, fn), this.fetchJSON(url)
 *   });
 */
const Mirror = (() => {
  const registry = {};
  const instances = [];

  function register(name, definition) {
    registry[name] = definition;
    if (definition.css) {                       // optional: styles that belong to the module itself
      const style = document.createElement("style");
      style.dataset.module = name;
      style.textContent = definition.css;
      document.head.append(style);
    }
  }

  function create(entry) {
    const def = registry[entry.module];
    if (!def) { console.warn(`Tuntematon moduuli: ${entry.module}`); return null; }

    const inst = Object.assign(Object.create(null), def, {
      name: entry.module,
      config: Object.assign({}, def.defaults, entry.config),
      timers: [],
      wrapper: document.createElement("div"),

      // Retry a failed fetch with backoff: 5s, 10s, 20s, 40s, then every 60s
      retry(fn) {
        const n = this.retryCount = (this.retryCount || 0) + 1;
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => fn.call(this), Math.min(5000 * 2 ** (n - 1), 60000));
      },
      resetRetry() { this.retryCount = 0; clearTimeout(this.retryTimer); },

      // Re-render this module in place
      update() {
        const content = this.render();
        this.wrapper.replaceChildren(this.header ? headerEl(this.header) : "", content);
      },
      // Run fn now and then every ms; timers are tracked for cleanup
      every(ms, fn) { fn.call(this); this.timers.push(setInterval(() => fn.call(this), ms)); },
      // JSON fetch with error handling; returns null on failure
      async fetchJSON(url, options) {
        try {
          const res = await fetch(url, options);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return await res.json();
        } catch (err) { console.error(`[${this.name}] fetch failed:`, err); return null; }
      },
    });

    inst.header = entry.header || null;
    inst.wrapper.className = `module ${entry.module}`;
    if (entry.overlay) inst.wrapper.classList.add("overlay");   // out of the layout flow: grows without pushing other modules
    return inst;
  }

  function headerEl(text) {
    const h = document.createElement("div");
    h.className = "module-header";
    h.textContent = text;
    return h;
  }

  // Helper for modules: el("div", "large bright", "text")
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function start() {
    (window.MIRROR_CONFIG?.modules || []).forEach(entry => {
      if (entry.disabled) return;
      const inst = create(entry);
      if (!inst) return;
      const region = document.querySelector(`.${entry.position}`);
      if (!region) { console.warn(`Tuntematon sijainti: ${entry.position}`); return; }
      region.appendChild(inst.wrapper);
      if (entry.overlay) region.style.zIndex = 2;   // overlay modules paint above neighbouring regions
      instances.push(inst);
      inst.update();
      inst.start?.();
    });
    if (!instances.length) {
      showProblem("Moduuleja ei ladattu. Tarkista, että modules/-kansio on index.html:n vieressä, ja avaa selaimen konsoli (F12) lisätietoja varten.");
    }
  }

  // Visible message so a broken setup never looks like a plain black screen
  function showProblem(text) {
    const box = document.querySelector(".middle_center") || document.body;
    box.append(el("div", "small", text));
  }

  return { register, start, el, instances, showProblem };
})();
