/*
 * Template for a new module. Copy this file, rename it, and add a <script> tag
 * to index.html plus an entry in config.js.
 *
 * Typical data module (weather, bus timetable):
 *   1. start() calls this.every(interval, this.refresh)
 *   2. refresh() fetches JSON, stores it on this.data, then calls this.update()
 *   3. render() builds DOM from this.data (handle the "no data yet" case)
 */
Mirror.register("example", {
  defaults: {
    url: "",              // API endpoint
    refreshMs: 10 * 60 * 1000,
  },

  data: null,

  start() { this.every(this.config.refreshMs, this.refresh); },

  async refresh() {
    if (!this.config.url) return;
    const json = await this.fetchJSON(this.config.url);
    if (json) { this.data = json; this.update(); }
  },

  render() {
    if (!this.data) return Mirror.el("div", "small dim", "Odotetaan tietoja…");
    return Mirror.el("pre", "small", JSON.stringify(this.data, null, 2));
  },
});
