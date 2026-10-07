/*
 * Todoist task list (API v1). Shows the open tasks of one project, or of a
 * Todoist filter such as "today | overdue". Requests go through serve.py, which
 * adds your personal API token (TODOIST_TOKEN in secrets.txt, never sent to the browser).
 * Read-only: nothing is ever changed in Todoist.
 */
Mirror.register("todoist", {
  defaults: {
    project: "",          // name (or ID) of the project to show, e.g. "Kauppa"
    filter: "",           // OR a Todoist filter, e.g. "today | overdue" (used instead of project)
    maxTasks: 8,
    sort: "order",        // "order" = as Todoist returns them, "due", or "priority"
    subtasks: false,      // also list subtasks (project mode only)
    showDue: true,
    refreshMs: 5 * 60 * 1000,
    endpoint: "/todoist", // served by serve.py
  },

  tasks: null,
  projectId: null,
  error: null,

  start() { this.every(this.config.refreshMs, this.refresh); },

  /* ---------- API ---------- */

  async api(path, params) {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${this.config.endpoint}/${path}${q ? "?" + q : ""}`);
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  },

  // Fetch every page of a list endpoint (follows next_cursor, at most 5 pages)
  async list(path, params = {}) {
    let all = [], cursor = null;
    for (let i = 0; i < 5; i++) {
      const page = await this.api(path, { ...params, limit: 50, ...(cursor ? { cursor } : {}) });
      all = all.concat(Array.isArray(page) ? page : page.results || []);
      cursor = page.next_cursor;
      if (!cursor) break;
    }
    return all;
  },

  async findProject() {
    const want = this.config.project.trim();
    if (!want) throw Object.assign(new Error("no project"), { code: "noconfig" });
    const projects = await this.list("projects");
    const p = projects.find(x => x.name.toLowerCase() === want.toLowerCase()) || projects.find(x => x.id === want);
    if (!p) throw Object.assign(new Error("project not found"), { code: "noproject" });
    this.projectId = p.id;
    if (!this.header) this.header = p.name;          // title the module with the project's name
  },

  async refresh() {
    const { filter } = this.config;
    try {
      let tasks;
      if (filter) {
        tasks = await this.list("tasks/filter", { query: filter });
      } else {
        if (!this.projectId) await this.findProject();
        tasks = await this.list("tasks", { project_id: this.projectId });
      }
      this.tasks = tasks;
      this.error = null;
      this.resetRetry();
    } catch (err) {
      console.error("[todoist] failed:", err);
      if (err.status === 401 || err.status === 403) this.error = "Tarkista TODOIST_TOKEN secrets.txt-tiedostossa";
      else if (err.code === "noconfig") this.error = "Aseta project tai filter config.js-tiedostoon";
      else if (err.code === "noproject") this.error = `Projektia "${this.config.project}" ei löytynyt`;
      else {
        if (!this.tasks) this.error = "Todoistin lataus epäonnistui";
        this.retry(this.refresh);                    // network trouble: try again soon
      }
    }
    this.update();
  },

  /* ---------- display ---------- */

  sorted(tasks) {
    const { sort, subtasks, filter } = this.config;
    const list = (subtasks || filter) ? tasks.slice() : tasks.filter(t => !t.parent_id);
    const due = t => (t.due && t.due.date) || "9999";
    if (sort === "due") list.sort((a, b) => due(a).localeCompare(due(b)) || b.priority - a.priority);
    else if (sort === "priority") list.sort((a, b) => b.priority - a.priority || due(a).localeCompare(due(b)));
    return list;
  },

  formatDue(due) {
    if (!due || !due.date) return null;
    const s = due.date, hasTime = s.length > 10;
    const d = hasTime ? new Date(s) : new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    if (isNaN(d)) return null;
    const now = new Date();
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const L = "fi-FI";
    const label = diff === 0 ? "Tänään" : diff === 1 ? "Huomenna" : diff === -1 ? "Eilen"
      : diff < 0 ? d.toLocaleDateString(L, { day: "numeric", month: "numeric" })
      : diff < 7 ? d.toLocaleDateString(L, { weekday: "short" })
      : d.toLocaleDateString(L, { weekday: "short", day: "numeric", month: "numeric" });
    const time = hasTime ? " " + d.toLocaleTimeString(L, { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    return { text: label + time + (due.is_recurring ? " ↻" : ""), overdue: hasTime ? d < now : diff < 0 };
  },

  render() {
    const box = Mirror.el("div", "todo");
    if (this.error) { box.append(Mirror.el("div", "small dim", this.error)); return box; }
    if (!this.tasks) { box.append(Mirror.el("div", "small dim", "Ladataan tehtäviä…")); return box; }

    const list = this.sorted(this.tasks), max = this.config.maxTasks;
    if (!list.length) { box.append(Mirror.el("div", "small dim", "Ei tehtäviä")); return box; }

    list.slice(0, max).forEach(t => {
      const row = Mirror.el("div", "todo-row");
      const title = (t.content || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");   // [text](link) -> text
      row.append(Mirror.el("span", `todo-dot p${t.priority || 1}`), Mirror.el("span", "todo-text bright", title));
      const due = this.config.showDue && this.formatDue(t.due);
      if (due) row.append(Mirror.el("span", `todo-due ${due.overdue ? "bright" : "dim"}`, due.text));
      box.append(row);
    });
    if (list.length > max) box.append(Mirror.el("div", "small dim", `+ ${list.length - max} lisää`));
    return box;
  },
});
