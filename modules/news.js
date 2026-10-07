/*
 * News headlines from Yle's public RSS feeds, rotating on a timer.
 * Yle's RSS terms: show headlines only, each linking to its article on yle.fi;
 * no photos, no copying article text. See https://yle.fi/a/20-10008922
 */
Mirror.register("news", {
  defaults: {
    feed: "https://yle.fi/rss/uutiset/paauutiset", // main headlines, Finnish
    // Latest news (everything): https://yle.fi/rss/uutiset/tuoreimmat
    // Other feeds are listed at https://yle.fi/rss
    proxy: "",            // CORS proxy prefix; the feed URL is appended, URL-encoded.
                          // e.g. "https://api.allorigins.win/raw?url=" or your own Worker
    maxItems: 10,
    rotateMs: 15 * 1000,
    refreshMs: 10 * 60 * 1000,
    sourceLabel: "Yle Uutiset",
  },

  items: [],
  index: 0,
  error: null,

  start() {
    this.every(this.config.refreshMs, this.refresh);
    this.timers.push(setInterval(() => this.next(), this.config.rotateMs));
  },

  async refresh() {
    const { feed, proxy, maxItems } = this.config;
    try {
      const url = proxy ? proxy + encodeURIComponent(feed) : feed;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
      const items = [...xml.querySelectorAll("item")].slice(0, maxItems).map(i => ({
        title: i.querySelector("title")?.textContent.trim(),
        link: i.querySelector("link")?.textContent.trim(),
      })).filter(i => i.title && i.link);
      if (!items.length) throw new Error("no items in feed");
      this.items = items;
      this.index = Math.min(this.index, items.length - 1);
      this.error = null;
      this.resetRetry();
    } catch (err) {
      console.error("[news] fetch failed:", err);
      if (!this.items.length) this.error = "Uutisten lataus epäonnistui";
      this.retry(this.refresh);
    }
    this.update();
  },

  next() {
    if (this.items.length < 2) return;
    this.index = (this.index + 1) % this.items.length;
    this.update();
  },

  render() {
    const box = Mirror.el("div", "news fade");
    if (this.error) { box.append(Mirror.el("div", "small dim", this.error)); return box; }
    if (!this.items.length) { box.append(Mirror.el("div", "small dim", "Ladataan uutisia…")); return box; }

    const item = this.items[this.index];
    const a = Mirror.el("a", "medium bright headline", item.title);
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener";
    box.append(Mirror.el("div", "small dim", this.config.sourceLabel), a);
    return box;
  },
});
