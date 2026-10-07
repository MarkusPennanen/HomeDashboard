/*
 * Month calendar with optional Google Calendar (or any iCal) events.
 * Events are loaded from icsUrl (served by serve.py from CALENDAR_URL in secrets.txt,
 * so the secret calendar address never reaches the browser).
 * Supports timed, all-day and recurring events (DAILY/WEEKLY/MONTHLY/YEARLY,
 * INTERVAL, COUNT, UNTIL, BYDAY, EXDATE, edited single occurrences).
 */
Mirror.register("calendar", {
  defaults: {
    locale: "fi-FI",
    weekNumbers: true,         // ISO week numbers in the left column
    icsUrl: "",                // e.g. "/calendar.ics"; empty = plain calendar, no events
    maxEvents: 5,              // upcoming events listed under the month
    daysAhead: 30,
    refreshMs: 15 * 60 * 1000,
  },

  shownDay: null,
  raw: null,           // parsed events
  eventsError: null,
  fmts: {},            // cached Intl formatters per time zone

  start() {
    this.every(60 * 1000, this.checkDay);
    if (this.config.icsUrl) this.every(this.config.refreshMs, this.refresh);
  },

  checkDay() { if (this.dayKey() !== this.shownDay) this.update(); },
  dayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; },

  async refresh() {
    try {
      const res = await fetch(this.config.icsUrl);
      if (res.status === 404) {
        this.eventsError = "Lisää CALENDAR_URL secrets.txt-tiedostoon";
        return this.update();                       // not a network problem: no retry
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      this.raw = this.parseICS(await res.text());
      this.eventsError = null;
      this.resetRetry();
    } catch (err) {
      console.error("[calendar] fetch failed:", err);
      if (!this.raw) this.eventsError = "Kalenterin lataus epäonnistui";
      this.retry(this.refresh);
    }
    this.update();
  },

  /* ---------- iCal parsing ---------- */

  parseICS(text) {
    const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);   // unfold continuation lines
    const events = [];
    let cur = null, inAlarm = false;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
      if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; inAlarm = false; continue; }
      if (!cur) continue;
      if (line === "BEGIN:VALARM") { inAlarm = true; continue; }
      if (line === "END:VALARM") { inAlarm = false; continue; }
      if (inAlarm) continue;
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...paramParts] = line.slice(0, i).split(";");
      const value = line.slice(i + 1);
      const params = {};
      paramParts.forEach(p => { const [k, v] = p.split("="); params[k] = v; });
      switch (name) {
        case "SUMMARY": cur.title = value.replace(/\\([,;nN\\])/g, (_, c) => (c === "n" || c === "N") ? " " : c); break;
        case "DTSTART": cur.start = this.parseDate(value, params); break;
        case "DTEND": cur.end = this.parseDate(value, params); break;
        case "RRULE": cur.rrule = value; break;
        case "EXDATE": value.split(",").forEach(v => { const p = this.parseDate(v, params); if (p) cur.exdates.push(p.date.getTime()); }); break;
        case "RECURRENCE-ID": cur.recId = this.parseDate(value, params); break;
        case "UID": cur.uid = value; break;
        case "STATUS": cur.status = value; break;
      }
    }
    return events.filter(e => e.start && e.status !== "CANCELLED");
  },

  parseDate(v, params) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const p = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), allDay: m[4] === undefined };
    p.tz = m[7] ? "UTC" : (params.TZID || null);
    p.date = this.toInstant(p);
    return p;
  },

  // Wall-clock parts (+ time zone) -> real moment in time
  toInstant(p) {
    if (p.allDay || !p.tz) return new Date(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    if (p.tz === "UTC") return new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s));
    try {
      const guess = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
      let t = guess - this.tzOffset(guess, p.tz);
      t = guess - this.tzOffset(t, p.tz);        // second pass handles daylight-saving edges
      return new Date(t);
    } catch (e) {                                  // unknown zone name: treat as local time
      return new Date(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    }
  },

  tzOffset(ts, tz) {
    const f = this.fmts[tz] ||= new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    const o = {};
    f.formatToParts(new Date(ts)).forEach(x => { o[x.type] = +x.value; });
    return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - ts;
  },

  /* ---------- recurrence ---------- */

  // Start times of every occurrence up to `to` (filtering by window is done by the caller)
  expand(e, to) {
    const rule = {};
    e.rrule.split(";").forEach(kv => { const [k, v] = kv.split("="); rule[k] = v; });
    const interval = +(rule.INTERVAL || 1);
    const count = rule.COUNT ? +rule.COUNT : Infinity;
    const until = rule.UNTIL ? this.parseDate(rule.UNTIL, {}) : null;
    const untilTs = until ? until.date.getTime() + (until.allDay ? 86400000 : 0) : Infinity;
    const DAY = 86400000, s = e.start;
    const base = Date.UTC(s.y, s.mo - 1, s.d);
    const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const byday = rule.BYDAY ? rule.BYDAY.split(",") : null;
    const result = []; let n = 0, guard = 0;

    const add = utcMid => {                        // false = stop generating
      if (utcMid < base) return true;
      const d = new Date(utcMid);
      const inst = this.toInstant({ ...s, y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() });
      if (n >= count || inst.getTime() > untilTs || inst >= to) return false;
      n++; result.push(inst); return true;
    };

    switch (rule.FREQ) {
      case "DAILY":
        for (let k = 0; guard++ < 20000; k++) if (!add(base + k * interval * DAY)) break;
        break;
      case "WEEKLY": {
        const days = (byday || [Object.keys(WD)[new Date(base).getUTCDay()]])
          .map(x => WD[x.slice(-2)]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * DAY;
        outer: for (let k = 0; guard++ < 20000; k++)
          for (const w of days) if (!add(monday + (k * interval * 7 + (w + 6) % 7) * DAY)) break outer;
        break;
      }
      case "MONTHLY":
        for (let k = 0; guard++ < 5000; k++) {
          const idx = s.mo - 1 + k * interval, y = s.y + Math.floor(idx / 12), m = ((idx % 12) + 12) % 12;
          let utc = null;
          if (byday && /^[+-]?\d/.test(byday[0])) utc = this.nthWeekday(y, m, byday[0], WD);
          else { const t = Date.UTC(y, m, s.d); if (new Date(t).getUTCMonth() === m) utc = t; }
          if (utc !== null && !add(utc)) break;
        }
        break;
      case "YEARLY":
        for (let k = 0; guard++ < 500; k++) {
          const t = Date.UTC(s.y + k * interval, s.mo - 1, s.d);
          if (new Date(t).getUTCMonth() === s.mo - 1 && !add(t)) break;
        }
        break;
      default: add(base);                         // unsupported rule: show first occurrence only
    }
    return result;
  },

  nthWeekday(y, m, spec, WD) {                     // "2TU" = 2nd Tuesday, "-1FR" = last Friday
    const n = parseInt(spec, 10), day = WD[spec.slice(-2)];
    let d;
    if (n > 0) d = 1 + ((day - new Date(Date.UTC(y, m, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
    else { const last = new Date(Date.UTC(y, m + 1, 0)); d = last.getUTCDate() - ((last.getUTCDay() - day + 7) % 7) + (n + 1) * 7; }
    const t = Date.UTC(y, m, d);
    return new Date(t).getUTCMonth() === m ? t : null;
  },

  // All occurrences overlapping [from, to)
  occurrences(from, to) {
    const events = this.raw || [], out = [];
    const replaced = {};                           // uid -> start times replaced by an edited copy
    events.forEach(e => { if (e.recId && e.uid) (replaced[e.uid] ||= new Set()).add(e.recId.date.getTime()); });

    for (const e of events) {
      const days = e.end ? Math.max(1, Math.round((e.end.date - e.start.date) / 86400000)) : 1;
      const ms = e.end ? e.end.date - e.start.date : 0;
      const push = s => {
        const end = e.start.allDay ? new Date(s.getFullYear(), s.getMonth(), s.getDate() + days) : new Date(s.getTime() + ms);
        if (s < to && (end > from || s >= from)) out.push({ start: s, end, allDay: e.start.allDay, title: e.title || "(ei otsikkoa)" });
      };
      if (!e.rrule || e.recId) { push(e.start.date); continue; }
      for (const s of this.expand(e, to)) {
        const ts = s.getTime();
        if (e.exdates.includes(ts) || replaced[e.uid]?.has(ts)) continue;
        push(s);
      }
    }
    return out.sort((a, b) => a.start - b.start);
  },

  /* ---------- display ---------- */

  isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - jan1) / 86400000 + 1) / 7);
  },

  keyOf(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; },

  render() {
    const { locale, weekNumbers, daysAhead, maxEvents } = this.config;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), DAY = 86400000;
    this.shownDay = this.dayKey();

    const offset = (new Date(y, m, 1).getDay() + 6) % 7;        // blanks before the 1st (Monday = 0)
    const weeks = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7);
    const gridStart = new Date(y, m, 1 - offset), gridEnd = new Date(y, m, 1 - offset + weeks * 7);
    const today0 = new Date(y, m, now.getDate());

    // Events for the grid dots and the upcoming list
    let occ = [];
    const busy = new Set();
    if (this.raw) {
      const listEnd = new Date(now.getTime() + daysAhead * DAY);
      occ = this.occurrences(gridStart < today0 ? gridStart : today0, gridEnd > listEnd ? gridEnd : listEnd);
      occ.forEach(o => {
        const last = new Date(o.end.getTime() - (o.end > o.start ? 1 : 0));
        for (let d = new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate()); d <= last; d.setDate(d.getDate() + 1)) busy.add(this.keyOf(d));
      });
    }

    const title = now.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const box = document.createElement("div");
    box.append(Mirror.el("div", "medium bright cal-title", title[0].toUpperCase() + title.slice(1)));

    const table = Mirror.el("table", "calendar-grid");
    const head = document.createElement("tr");
    if (weekNumbers) head.append(Mirror.el("th", "dim", ""));
    for (let i = 0; i < 7; i++) {      // 1 Jan 2024 was a Monday
      head.append(Mirror.el("th", "dim", new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" })));
    }
    table.append(head);

    for (let w = 0; w < weeks; w++) {
      const tr = document.createElement("tr");
      const first = new Date(y, m, 1 - offset + w * 7);
      if (weekNumbers) tr.append(Mirror.el("td", "cal-week dim", String(this.isoWeek(new Date(first.getFullYear(), first.getMonth(), first.getDate() + 3)))));
      for (let d = 0; d < 7; d++) {
        const day = new Date(y, m, 1 - offset + w * 7 + d);
        let cls = day.getMonth() !== m ? "cal-other" : day.getDate() === now.getDate() ? "cal-today" : "bright";
        if (busy.has(this.keyOf(day))) cls += " has-event";
        tr.append(Mirror.el("td", cls, String(day.getDate())));
      }
      table.append(tr);
    }
    box.append(table);

    if (this.config.icsUrl) box.append(this.renderList(occ, now, today0));
    return box;
  },

  renderList(occ, now, today0) {
    const { locale, maxEvents, daysAhead } = this.config, DAY = 86400000;
    const list = Mirror.el("div", "cal-events");
    if (this.eventsError && !this.raw) { list.append(Mirror.el("div", "small dim", this.eventsError)); return list; }
    if (!this.raw) { list.append(Mirror.el("div", "small dim", "Ladataan kalenteria…")); return list; }

    const horizon = now.getTime() + daysAhead * DAY;
    const upcoming = occ.filter(o => o.end > now && o.start.getTime() < horizon).slice(0, maxEvents);
    if (!upcoming.length) { list.append(Mirror.el("div", "small dim", "Ei tulevia tapahtumia")); return list; }

    upcoming.forEach(o => {
      const shown = o.start < today0 ? today0 : o.start;                       // multi-day events count from today
      const diff = Math.round((new Date(shown.getFullYear(), shown.getMonth(), shown.getDate()) - today0) / DAY);
      const label = diff <= 0 ? "Tänään" : diff === 1 ? "Huomenna"
        : shown.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "numeric" });
      const time = o.allDay ? "" : " " + o.start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
      const row = Mirror.el("div", "cal-event");
      row.append(Mirror.el("span", "cal-when dim", label + time), Mirror.el("span", "cal-event-title bright", o.title));
      list.append(row);
    });
    return list;
  },
});
