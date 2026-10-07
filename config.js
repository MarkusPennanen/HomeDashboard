// Each entry: which module, where it goes, and its settings.
// Positions: top_left, top_center, top_right, middle_center,
//            bottom_left, bottom_center, bottom_right
window.MIRROR_CONFIG = {
  // Burn-in protection: nudges the layout by a few pixels now and then.
  // Set shiftEveryMs to 0 to disable.
  burnIn: {
    shiftEveryMs: 5 * 60 * 1000,    // every 5 min...
    shiftPx: 6,                     // ...by up to 6 px
  },

  modules: [
    { module: "clock",    position: "top_center",      config: { hour12: false, lat: 60.1699, lon: 24.9384 } },
    //{ module: "koi", position: "middle_center", config: { fish: 3, lilyPads: 0, width: "100%", height: "100%", fullScreen: false } },
    // Greeting (swap with the koi line above to bring it back):
    // { module: "greeting", position: "middle_center", config: { name: "" } },
    { module: "weather", position: "top_left", config: { lat: 60.2194, lon: 24.8135, city: "Leppävaara" } },
    { module: "calendar", position: "bottom_left", config: { weekNumbers: true, icsUrl: "/calendar.ics", maxEvents: 3 } },
    { module: "news", position: "bottom_center", config: {
        feed: "https://yle.fi/rss/uutiset/paauutiset",
        proxy: "/proxy?url=",   // needs serve.py; remove if you host elsewhere
        rotateMs: 15000,
    } },
    { module: "hsl", position: "top_right", header: "Lähdöt", overlay: true, config: {
        stops: ["HSL:2118404", "HSL:2118405", "HSL:2118280"],   // replace with your stop IDs
        departures: 3,
    } },
    { module: "todoist", position: "bottom_right", overlay: true, config: {
        project: "Todo",     // name of your Todoist project (or use filter: "today | overdue")
        maxTasks: 5,
    } },
    // Example data module, enable once you have a URL:
    { module: "example",  position: "top_right", header: "Example", config: { url: "" }, disabled: true },
  ],
};
