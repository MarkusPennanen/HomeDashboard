/*
 * Weather from FMI (Finnish Meteorological Institute) open data.
 * No API key needed. Uses the HARMONIE forecast model, hourly, for a lat/lon.
 * Data licence: CC BY 4.0 (credit "Finnish Meteorological Institute").
 */
Mirror.register("weather", {
  defaults: {
    lat: 60.1699,           // Helsinki
    lon: 24.9384,
    city: "Helsinki",       // shown above the temperature; "" hides it
    hoursAhead: 15,         // how far the forecast strip reaches
    stepHours: 3,           // spacing between forecast columns
    refreshMs: 15 * 60 * 1000,
    endpoint: "https://opendata.fmi.fi/wfs",
  },

  data: null,
  error: null,

  // FMI WeatherSymbol3 codes -> [emoji, label]
  symbols: {
    1: ["☀️", "Selkeää"], 2: ["⛅", "Puolipilvistä"], 3: ["☁️", "Pilvistä"],
    21: ["🌦️", "Heikkoja sadekuuroja"], 22: ["🌧️", "Sadekuuroja"], 23: ["🌧️", "Voimakkaita sadekuuroja"],
    31: ["🌦️", "Heikkoa vesisadetta"], 32: ["🌧️", "Vesisadetta"], 33: ["🌧️", "Voimakasta vesisadetta"],
    41: ["🌨️", "Heikkoja lumikuuroja"], 42: ["🌨️", "Lumikuuroja"], 43: ["🌨️", "Voimakkaita lumikuuroja"],
    51: ["🌨️", "Heikkoa lumisadetta"], 52: ["❄️", "Lumisadetta"], 53: ["❄️", "Voimakasta lumisadetta"],
    61: ["⛈️", "Ukkosta"], 62: ["⛈️", "Ukkoskuuroja"], 63: ["⛈️", "Ukkosta"], 64: ["⛈️", "Voimakasta ukkosta"],
    71: ["🌨️", "Heikkoja räntäkuuroja"], 72: ["🌨️", "Räntäkuuroja"], 73: ["🌨️", "Voimakkaita räntäkuuroja"],
    81: ["🌧️", "Heikkoa räntää"], 82: ["🌧️", "Räntää"], 83: ["🌧️", "Voimakasta räntää"],
    91: ["🌫️", "Utua"], 92: ["🌫️", "Sumua"],
  },

  start() { this.every(this.config.refreshMs, this.refresh); },

  async refresh() {
    const { lat, lon, hoursAhead, endpoint } = this.config;
    const start = new Date(); start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + hoursAhead * 3600e3);

    const params = new URLSearchParams({
      service: "WFS", version: "2.0.0", request: "getFeature",
      storedquery_id: "fmi::forecast::harmonie::surface::point::simple",
      latlon: `${lat},${lon}`,
      parameters: "Temperature,WindSpeedMS,Precipitation1h,WeatherSymbol3",
      timestep: "60",
      starttime: start.toISOString().replace(/\.\d+Z$/, "Z"),
      endtime: end.toISOString().replace(/\.\d+Z$/, "Z"),
    });

    try {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
      this.data = this.parse(xml);
      this.resetRetry();
      this.error = this.data.length ? null : "Ei ennustetietoja tälle sijainnille";
    } catch (err) {
      console.error("[weather] fetch failed:", err);
      this.error = "Säätä ei voitu ladata";
      this.retry(this.refresh);
    }
    this.update();
  },

  // XML rows (time, parameter, value) -> [{time, Temperature, WindSpeedMS, ...}] sorted by time
  parse(xml) {
    const NS = "http://xml.fmi.fi/schema/wfs/2.0";
    const byTime = {};
    for (const row of xml.getElementsByTagNameNS(NS, "BsWfsElement")) {
      const text = tag => row.getElementsByTagNameNS(NS, tag)[0]?.textContent;
      const time = text("Time"), name = text("ParameterName"), value = parseFloat(text("ParameterValue"));
      if (!time || !name) continue;
      (byTime[time] ||= { time: new Date(time) })[name] = Number.isNaN(value) ? null : value;
    }
    return Object.values(byTime).sort((a, b) => a.time - b.time);
  },

  symbol(code) { return this.symbols[Math.round(code)] || ["", ""]; },
  temp(v) { return v == null ? "–" : `${Math.round(v)}°`; },

  render() {
    const box = document.createElement("div");
    if (this.error) { box.append(Mirror.el("div", "small dim", this.error)); return box; }
    if (!this.data) { box.append(Mirror.el("div", "small dim", "Ladataan säätä…")); return box; }

    if (this.config.city) box.append(Mirror.el("div", "medium dim", this.config.city));

    const now = this.data[0];
    const [icon, label] = this.symbol(now.WeatherSymbol3);

    const current = Mirror.el("div", "wx-now");
    current.append(
      Mirror.el("span", "wx-icon", icon),
      Mirror.el("span", "xlarge bright", this.temp(now.Temperature)),
    );
    const details = [label];
    if (now.WindSpeedMS != null) details.push(`${Math.round(now.WindSpeedMS)} m/s`);
    box.append(current, Mirror.el("div", "small dim", details.filter(Boolean).join(", ")));

    const strip = Mirror.el("div", "wx-strip");
    this.data.slice(1).filter((_, i) => (i + 1) % this.config.stepHours === 0).forEach(h => {
      const col = Mirror.el("div", "wx-col");
      col.append(
        Mirror.el("div", "small dim", h.time.toLocaleTimeString("fi-FI", { hour: "2-digit", hour12: false })),
        Mirror.el("div", "medium", this.symbol(h.WeatherSymbol3)[0]),
        Mirror.el("div", "small bright", this.temp(h.Temperature)),
      );
      strip.append(col);
    });
    box.append(strip);
    return box;
  },
});
