/*
 * HSL departures via the Digitransit routing API (GraphQL).
 * Needs a free API key (https://digitransit.fi/en/developers/), set as HSL_API_KEY in
 * secrets.txt. Requests go through serve.py, which adds the key, so it never reaches the browser.
 * Find stop IDs at https://reittiopas.hsl.fi (click a stop; the code in the URL
 * is the ID) or via the stops query in Digitransit's GraphiQL.
 */
Mirror.register("hsl", {
  defaults: {
    stops: [],              // e.g. ["HSL:1140447"]; the HSL: prefix is required
    departures: 6,          // per stop
    refreshMs: 30 * 1000,
    endpoint: "/hsl",       // served by serve.py
  },

  data: null,
  error: null,

  start() { this.every(this.config.refreshMs, this.refresh); },

  async refresh() {
    const { stops, departures, endpoint } = this.config;
    if (!stops.length) { this.error = "Lisää pysäkit config.js-tiedostoon"; return this.update(); }

    // One aliased query field per stop, so it is a single request
    const fields = stops.map((id, i) => `
      s${i}: stop(id: ${JSON.stringify(id)}) {
        name
        code
        stoptimesWithoutPatterns(numberOfDepartures: ${departures}) {
          serviceDay
          realtimeDeparture
          realtime
          headsign
          trip { route { shortName } }
        }
      }`).join("");

    let json = null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{${fields}}` }),
      });
      if (res.status === 401 || res.status === 403) {          // no key, or the key was refused
        this.error = "Tarkista HSL_API_KEY secrets.txt-tiedostossa";
        return this.update();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
    } catch (err) {
      console.error("[hsl] fetch failed:", err);
    }

    if (!json || json.errors || !json.data) {
      this.error = "Lähtöjen lataus epäonnistui";
      this.retry(this.refresh);
      return this.update();
    }
    this.error = null;
    this.resetRetry();
    this.data = stops.map((_, i) => json.data[`s${i}`]).filter(Boolean);
    this.update();
  },

  // "now" under a minute, "7 min" under an hour, otherwise a clock time
  formatWhen(epochSeconds) {
    const mins = Math.round((epochSeconds * 1000 - Date.now()) / 60000);
    if (mins <= 0) return "nyt";
    if (mins < 60) return `${mins} min`;
    return new Date(epochSeconds * 1000).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", hour12: false });
  },

  render() {
    const box = document.createElement("div");
    if (this.error) { box.append(Mirror.el("div", "small dim", this.error)); return box; }
    if (!this.data) { box.append(Mirror.el("div", "small dim", "Ladataan lähtöjä…")); return box; }

    this.data.forEach(stop => {
      box.append(Mirror.el("div", "small dim", stop.code ? `${stop.name} (${stop.code})` : stop.name));
      const table = Mirror.el("table", "departures");
      stop.stoptimesWithoutPatterns.forEach(st => {
        const tr = document.createElement("tr");
        const when = this.formatWhen(st.serviceDay + st.realtimeDeparture);
        tr.append(
          Mirror.el("td", "line bright", st.trip.route.shortName),
          Mirror.el("td", "dest", st.headsign || ""),
          Mirror.el("td", st.realtime ? "when bright" : "when dim", when),
        );
        table.append(tr);
      });
      box.append(table);
    });
    return box;
  },
});
