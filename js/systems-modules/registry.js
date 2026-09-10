// MaMuSBoaRD — registro de módulos específicos de RPG
window.MAMUS_RPG_MODULES = window.MAMUS_RPG_MODULES || {
  registry: {},
  register(tipo, api) { this.registry[tipo] = api; },
  get(tipo) { return this.registry[String(tipo || '').toLowerCase()] || null; },
  getCurrent() { return this.get(window.MAMUS_STATE?.system?.current?.configuracao?.tipo); }
};
