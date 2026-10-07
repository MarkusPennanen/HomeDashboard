# Dashboard

A MagicMirror-style information display for a browser, written in plain HTML, CSS and
JavaScript. No libraries, no build step. Meant to run full-screen on a Raspberry Pi.



Quick start

1. Open a terminal in the `Dashboard` folder.
2. Run `python3 serve.py` (needs only Python 3, nothing to install).
3. Open [http://localhost:8000](http://localhost:8000).

Opening `index.html` by double-clicking works for the clock, but not for news, calendar or
Todoist, which need `serve.py`.

If you see a black screen: keep the folder structure intact (`modules/` next to `index.html`)
and press F12 to read the console. The page also shows a message when no modules load.

## Files

```
index.html          page skeleton and the list of scripts to load
style.css           layout (7 regions) and the styles of most modules
core.js             module system (see "Writing your own module")
config.js           YOUR SETTINGS: which modules, where, with what options
burnin.js           burn-in protection (pixel shift)
serve.py            local web server and helper for feeds the browser may not fetch itself
modules/            one file per module
pi/                 Raspberry Pi auto-start (service + kiosk browser + installer)
secrets.txt.example template for your keys
secrets.txt         (you create) ALL your keys, tokens and secret addresses, in one place
```

## Keys and secrets: secrets.txt

Every key, token and secret address lives in one file, `secrets.txt`, next to `serve.py`.
Copy `secrets.txt.example` to `secrets.txt`, fill in what you use and delete the rest:

```
HSL\_API\_KEY=your-digitransit-key
TODOIST\_TOKEN=your-todoist-token
CALENDAR\_URL=https://calendar.google.com/calendar/ical/.../basic.ics
CALENDAR\_URL=https://calendar.google.com/calendar/ical/.../basic.ics
```

One `KEY=value` per line, no quotes needed, lines starting with `#` are ignored. `CALENDAR\_URL` may
repeat, one line per calendar. Restart `serve.py` after changing the file.

|Key|Used by|Where to get it|
|-|-|-|
|`HSL\_API\_KEY`|hsl|Free key from [https://digitransit.fi/en/developers/](https://digitransit.fi/en/developers/)|
|`TODOIST\_TOKEN`|todoist|Todoist → Settings → Integrations → Developer → API token|
|`CALENDAR\_URL`|calendar|Google Calendar → Settings → pick the calendar → Integrate calendar → Secret address in iCal format|

How it stays safe: `serve.py` reads the file and adds the keys to the requests itself, so they are never sent
to the browser and never appear in `config.js`. The file cannot be downloaded through the web server, and it is
in `.gitignore`. Never post it or share a screenshot of it. If a key leaks, create a new one at the provider.
Weather (FMI) and news (Yle) need no key.

Older layout: if you still have `calendar\_url.txt` or `todoist\_token.txt`, `serve.py` keeps reading them (and prints a
note at start-up), but move them into `secrets.txt` as `CALENDAR\_URL` and `TODOIST\_TOKEN`; the old files can then be deleted.

Adding a key for a new module: add a `NAME=` line to `secrets.txt`, read it in `serve.py` with `secret("NAME")` and
add a route that forwards the request with the key (look at `hsl()` for a small example).

## config.js

Everything you normally change is here.

```js
window.MIRROR\_CONFIG = {
  burnIn: { shiftEveryMs: 5 \* 60 \* 1000, shiftPx: 6 },
  modules: \[
    { module: "clock", position: "top\_left", config: { hour12: false } },
    // ...
  ],
};
```

Each entry in `modules` can have:

|Field|Meaning|
|-|-|
|`module`|Name of the module (the file in `modules/`). Required.|
|`position`|Where it goes: `top\_left`, `top\_center`, `top\_right`, `middle\_center`, `bottom\_left`, `bottom\_center`, `bottom\_right`. Required.|
|`config`|The module's own options (see each module below).|
|`header`|Small dim title above the module. The Todoist module uses the project name if you give none.|
|`overlay`|`true` takes the module out of the layout: it is pinned to the corner of its region and grows without pushing other modules (top regions grow downwards, bottom regions upwards). It paints above neighbouring regions, so a long list can cover what is next to it. Used by `hsl` and `todoist`.|
|`disabled`|`true` skips the module without deleting the entry.|

You can use the same module several times, for example two Todoist lists in different positions.
Two `overlay` modules in the same region sit on top of each other, so give them different positions.

If you edit `config.js`, reload the page (F5). Changes to `serve.py` or the secret files need a restart of `serve.py`.

### Burn-in protection

|Option|Default|Meaning|
|-|-|-|
|`burnIn.shiftEveryMs`|5 minutes|How often the whole layout is nudged. `0` turns it off.|
|`burnIn.shiftPx`|6|Largest nudge in pixels, in a random direction.|

To test it, type `BurnIn.shift()` in the browser console. Colour inversion was removed.

## Modules

### clock

Date, time, and sunrise and sunset under the time (small icon and `HH:mm`, no text). The sun
times are calculated from your coordinates, so no network is needed. In polar summer or
winter a missing time is simply not shown. The row follows the text alignment of the region
the clock is in. The clock carries its own styles (the `css` property in `modules/clock.js`).

|Option|Default|Meaning|
|-|-|-|
|`hour12`|`false`|12-hour clock.|
|`showSeconds`|`false`|Show seconds.|
|`showSun`|`true`|Show the sunrise and sunset row.|
|`lat`, `lon`|Helsinki|Your location (decimal degrees, east and north positive).|

### koi

An ink-wash koi pond seen from above, in black and white: koi swimming under lily pads, with
brush-stroke ripples. Drawn on a transparent canvas, so the black of the mirror is the dark
paper. It is taken out of the layout, so it never pushes other modules. It runs continuously, which also
helps against burn-in. Replaces the greeting (see below).

|Option|Default|Meaning|
|-|-|-|
|`fish`|6|Number of koi.|
|`speed`|1|Swim speed multiplier.|
|`lilyPads`|3|Number of lily pads (the first has a lotus flower).|
|`ripples`|`true`|Occasional ripples.|
|`waterTint`|`true`|Faint drifting mist over the water.|
|`fps`|30|Animation frame rate. Lower it (for example 20) if the Pi runs hot.|
|`width`, `height`|`"100%"`|Size of the pond, any CSS length (`"60vmin"`, `"500px"`). `"100%"` fills the middle region. It is centred in its region.|
|`fullScreen`|`false`|`true` spreads the pond over the whole screen, behind all other modules.|

The pond fades out softly at its edges. With `fullScreen: true`, a bright fish under small text can reduce readability; lower `fish` if so.

### greeting

"Huomenta / Hyvää päivää / Hyvää iltaa / Hyvää yötä" by time of day. Not used by default (the
koi pond took its place); to bring it back, enable the commented line in `config.js`.

|Option|Default|Meaning|
|-|-|-|
|`name`|`""`|Name added after the greeting.|

### weather

Current conditions and a forecast strip from the Finnish Meteorological Institute (FMI) open
data. No key needed. It uses the HARMONIE model (northern Europe), hourly values.

The request starts at the current time rounded down to the whole hour and ends `hoursAhead`
hours later. The large "now" reading is the first point (the start of the current hour). The strip shows every
`stepHours`-th hour after that.

|Option|Default|Meaning|
|-|-|-|
|`lat`, `lon`|Helsinki|Location of the forecast.|
|`city`|`"Helsinki"`|Name shown above the temperature (the data has no place name, so type it). `""` hides it.|
|`hoursAhead`|15|How far ahead to ask for.|
|`stepHours`|3|Hours between forecast columns.|
|`refreshMs`|15 minutes|Refresh interval.|
|`endpoint`|FMI WFS address|Only change if FMI moves it.|

Notes:

* FMI data is licensed CC BY 4.0, so credit the Finnish Meteorological Institute somewhere on your site.
* The module asks FMI directly from the browser. I could not confirm that FMI allows this; if the
console shows a CORS error, the module needs a proxy option (not built yet).
* Outside the HARMONIE area the module shows "Ei ennustetietoja tälle sijainnille".
* Failed requests are retried after 5, 10, 20, 40 and then every 60 seconds.

### calendar

A month calendar (weeks start on Monday, Finnish names, ISO week numbers, today in a white
circle) and, if you set `icsUrl`, events from Google Calendar or any iCal feed: a dot under
dates that have events and a list of upcoming events below the month.

|Option|Default|Meaning|
|-|-|-|
|`locale`|`"fi-FI"`|Language of month and weekday names.|
|`weekNumbers`|`true`|Week-number column.|
|`icsUrl`|`""`|Where to load events from. Use `"/calendar.ics"` (served by `serve.py`). Empty = plain calendar.|
|`maxEvents`|5|Events in the upcoming list.|
|`daysAhead`|30|How far ahead the list looks.|
|`refreshMs`|15 minutes|Refresh interval.|

Setting up Google Calendar: copy the **Secret address in iCal format** into `secrets.txt` as `CALENDAR\_URL=...`
(see "Keys and secrets"). The address is a secret: anyone with it can read the calendar.

Several calendars: add one `CALENDAR\_URL=` line per calendar; events are merged. Limits: events
do not show which calendar they came from, one failing address makes the whole feed fail (the last events stay
on screen), and an event that is in two calendars appears twice.

Supported: timed, all-day and multi-day events; recurring events (daily, weekly with weekdays,
monthly by date or like "last Friday", yearly; interval, count, until); deleted occurrences;
edited single occurrences; cancelled events are skipped. Not supported: rules with several
`BYMONTHDAY` values or `BYSETPOS` (only the first occurrence is shown). Times follow the Pi's time zone
(check `timedatectl` says `Europe/Helsinki`). Google's feed can lag a few minutes behind changes.

### news

One Yle headline at a time, swapping with a fade. Reads Yle's public RSS feed.

|Option|Default|Meaning|
|-|-|-|
|`feed`|`https://yle.fi/rss/uutiset/paauutiset`|RSS feed. Latest news: `https://yle.fi/rss/uutiset/tuoreimmat`. More feeds: [https://yle.fi/rss](https://yle.fi/rss).|
|`proxy`|`""`|Prefix that turns the feed address into a fetchable one. Use `"/proxy?url="` with `serve.py` (already set in `config.js`).|
|`maxItems`|10|How many headlines to rotate through.|
|`rotateMs`|15 seconds|Time per headline.|
|`refreshMs`|10 minutes|Feed refresh.|
|`sourceLabel`|`"Yle Uutiset"`|Small label above the headline.|

Yle blocks reading its feed straight from a browser page (CORS), which is why `serve.py` fetches it.
Yle's terms: show headlines only, each linking to its article on yle.fi (the headline is a link); no
copying of article text, no story photos, not in combination with paid services or ads.

### hsl

Departures from HSL stops, from the Digitransit API.

|Option|Default|Meaning|
|-|-|-|
|`stops`|`\[]`|Stop IDs such as `\["HSL:1140447", "HSL:1173429"]`. The `HSL:` prefix is required. Find IDs on reittiopas.hsl.fi (not the short code on the sign).|
|`departures`|6|Departures per stop.|
|`refreshMs`|30 seconds|Refresh interval.|
|`endpoint`|`"/hsl"`|Served by `serve.py`, which adds your key.|

The API key is `HSL\_API\_KEY` in `secrets.txt`. All stops are fetched in one request, one section per stop in the order listed. Times show as
"nyt", "7 min" or a clock time (an hour or more away). Bright = live-tracked, dim = timetable only.
`config.js` sets `overlay: true` so a long list does not push other modules.

Notes: the key is never in the browser; requests go through `serve.py`, so no CORS problems. Not built yet: filtering by line.

### todoist

The open tasks of one Todoist project, or of a Todoist filter. Read-only: it never changes anything in Todoist.

|Option|Default|Meaning|
|-|-|-|
|`project`|`""`|Name (or ID) of the project to show, for example `"Kauppa"`.|
|`filter`|`""`|A Todoist filter instead of a project, for example `"today \| overdue"` or `"#Kauppa \| #Työt"`.|
|`maxTasks`|8|Tasks shown; the rest appear as "+ N lisää".|
|`sort`|`"order"`|`"order"` (as Todoist returns them), `"due"` or `"priority"`.|
|`subtasks`|`false`|Also list subtasks (project mode).|
|`showDue`|`true`|Show due dates.|
|`refreshMs`|5 minutes|Refresh interval.|
|`endpoint`|`"/todoist"`|Served by `serve.py`.|

Setting up: put your API token in `secrets.txt` as `TODOIST\_TOKEN=...` (see "Keys and secrets").

Display: a dot per task (filled = urgent, thick ring = high, thin ring = medium, faint = normal),
due as "Tänään", "Huomenna", a weekday or a date, plus the time if set. Overdue is bright, and
recurring tasks have ↻. Links in titles show as plain text. The module is titled with the
project name unless you set `header`. Several lists: add the module several times.

The token stays on the server. `serve.py` only forwards three read-only calls (`tasks`, `tasks/filter`, `projects`).
Not confirmed against a real account yet; the task order within projects that have sections may differ from the app.

### example

A template for new data modules (disabled by default). See the next section.

## serve.py

Serves the project at [http://localhost:8000](http://localhost:8000) (this computer only) and fetches what the browser is
not allowed to fetch itself. The browser sees everything as coming from the same site, so no CORS problems.

|Address|What it does|
|-|-|
|`/proxy?url=...`|Fetches a public feed. Only hosts listed in `ALLOWED\_HOSTS` at the top of `serve.py` (`yle.fi`, `feeds.yle.fi`, `opendata.fmi.fi`).|
|`/calendar.ics`|Fetches the `CALENDAR\_URL` address(es) from `secrets.txt` and returns them as one feed.|
|`/todoist/tasks`, `/todoist/tasks/filter`, `/todoist/projects`|Read-only Todoist calls with `TODOIST\_TOKEN` added.|
|`/hsl` (POST)|Forwards an HSL GraphQL query to Digitransit with `HSL\_API\_KEY` added (queries up to 20 KB).|

Results are cached (5 minutes for feeds, 1 minute for Todoist). If the source is down, the last result is served.
`secrets.txt` is never served as a file. Change the port with `PORT` in
`serve.py` (and in `pi/kiosk.sh`).

## Raspberry Pi

Auto-start at boot, full-screen:

1. Copy the folder to the Pi, for example `/home/pi/mirror`, and run `bash pi/install.sh` in it.
It installs `serve.py` as a service (`mirror.service`) and adds `pi/kiosk.sh` (Chromium in kiosk mode) to the desktop autostart.
2. `sudo raspi-config` → System Options → Boot / Auto Login → **Desktop Autologin**.
3. `sudo raspi-config` → Display Options → Screen Blanking → **No**.
4. Reboot. In kiosk mode, Alt+F4 closes the browser.

Failed requests at boot (Wi-Fi not ready yet) are retried automatically, so data appears within seconds.

Timed outlet (on 06:00, off 22:00): shut the Pi down properly before the power is cut, so the SD card is not corrupted.
In `sudo crontab -e` add:

```
55 21 \* \* \* /sbin/shutdown -h now
```

The Pi starts by itself when power returns. Check `timedatectl` shows `Europe/Helsinki`, otherwise the
shutdown fires at the wrong hour. On a normal LCD, burn-in is rare; switching the screen off at night helps most.

## Writing your own module

Copy `modules/example.js`, rename it, add a `<script src="modules/yours.js">` line in `index.html`
(before `config.js`) and an entry in `config.js`.

```js
Mirror.register("yours", {
  defaults: { refreshMs: 600000 },     // overridden by config in config.js
  css: ".yours { color: red; }",       // optional: styles that belong to this module

  start() { this.every(this.config.refreshMs, this.refresh); },
  async refresh() {
    const json = await this.fetchJSON("https://...");
    if (json) { this.data = json; this.resetRetry(); } else { this.retry(this.refresh); }
    this.update();
  },
  render() {                            // return an element; called by update()
    return Mirror.el("div", "medium bright", "hello");
  },
});
```

Helpers available inside a module:

|Helper|Does|
|-|-|
|`this.config`|The merged settings (`defaults` + `config.js`).|
|`this.update()`|Re-draws the module by calling `render()`.|
|`this.every(ms, fn)`|Runs `fn` now and then every `ms`.|
|`this.fetchJSON(url, options)`|`fetch` that returns `null` on failure and logs the error.|
|`this.retry(fn)` / `this.resetRetry()`|Retry after a failure at 5, 10, 20, 40, then every 60 seconds; reset on success.|
|`this.header`|Header text (set from the entry, or by the module itself).|
|`Mirror.el(tag, className, text)`|Creates an element.|

Text sizes in `style.css`: `small`, `medium`, `large`, `xlarge`; colours: `dim` and `bright`.
Never put secrets (keys, tokens) in `config.js`; put them in `secrets.txt` and add a route to `serve.py` (see "Keys and secrets").

## Troubleshooting

|Problem|Likely cause|
|-|-|
|Black screen|Folder structure broken, or a script error: press F12.|
|News, calendar or Todoist show an error|`serve.py` not running, or you opened `index.html` as a file. Use [http://localhost:8000](http://localhost:8000).|
|"CORS policy" in the console|The source does not allow browser access; it must go through `serve.py`.|
|Calendar shows "Lisää CALENDAR\_URL..."|`secrets.txt` is missing or has no `CALENDAR\_URL=https://...` line.|
|Todoist "Tarkista TODOIST\_TOKEN..."|`TODOIST\_TOKEN` is missing from `secrets.txt` or wrong.|
|Todoist "Projektia ... ei löytynyt"|The project name in `config.js` does not match (case does not matter).|
|Departures "Tarkista HSL\_API\_KEY..."|`HSL\_API\_KEY` is missing from `secrets.txt` or wrong. Other errors: wrong stop IDs.|
|Wrong times|The Pi's time zone is not `Europe/Helsinki`.|
|Pond stutters or the Pi runs hot|Lower `fps` or `fish` in the koi config.|

## Changelog

Newest first. Every change to the project is added here.

* **2026-10-05** All keys now live in one file, `secrets.txt` (`HSL\_API\_KEY`, `TODOIST\_TOKEN`, `CALENDAR\_URL`). HSL now goes
through `serve.py` (new `/hsl` route), so its key is no longer in `config.js` and the `apiKey` option is gone from the hsl module.
The old `calendar\_url.txt` and `todoist\_token.txt` still work as a fallback.
* **2026-10-04** Added this README. Koi: comment about the water mist corrected.
* Earlier (in order): base layout and module system; clock, greeting, weather (FMI), news (Yle),
HSL departures; Finnish interface and city name in weather; `serve.py` with proxy; burn-in
protection (colour inversion later removed, pixel shift kept); retry with backoff and Raspberry Pi
auto-start; calendar with Google Calendar events; koi pond (then black-and-white ink style,
taken out of the layout, `fullScreen` option); `overlay` option for HSL; Todoist module; sunrise and sunset in the clock;
modules can carry their own `css`.

