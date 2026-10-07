Mirror.register("greeting", {
  defaults: { name: "" },

  start() { this.every(60 * 1000, this.update); },

  render() {
    const h = new Date().getHours();
    const part = h < 5 ? "Hyvää yötä" : h < 12 ? "Huomenta" : h < 18 ? "Hyvää päivää" : "Hyvää iltaa";
    const text = this.config.name ? `${part}, ${this.config.name}` : part;
    return Mirror.el("div", "large", text);
  },
});
