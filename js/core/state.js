/**
 * MaMuSBoaRD - Estado central da aplicação
 *
 * Marco 1 da refatoração arquitetural.
 *
 * IMPORTANTE:
 * - Este estado começa como uma camada de transição.
 * - O código legado de app.js continua funcionando.
 * - Não mover regras de negócio para este arquivo.
 * - A migração das variáveis legadas acontecerá por domínio, em etapas.
 */
(function (global) {
  'use strict';

  const existing = global.MAMUS_STATE;

  const state = existing || {
    app: {
      version: 'marco-1-core-state-v1',
      initialized: false,
      bootedAt: null
    },

    auth: {
      user: null,
      session: null
    },

    campaign: {
      current: null,
      available: [],
      memberIds: []
    },

    system: {
      current: null
    },

    character: {
      current: null,
      editingUserId: null,
      saveStatus: 'sem_ficha',
      lastSavedAt: null
    },

    tabletop: {
      gridAtivo: false,
      zoom: 100,
      gridSize: 40,
      panX: 0,
      panY: 0,
      movementUnlocked: false,
      immersive: false,
      lastInteractedToken: null,
      tokensLoadedCampaignId: null
    },

    session: {
      current: null,
      diary: null,
      campaigns: []
    },

    ui: {
      currentTab: 'inicio',
      sidebarCollapsed: false,
      immersiveMap: false
    },

    realtime: {
      connected: false,
      status: 'disconnected',
      channel: null
    },

    social: {
      profile: null,
      friends: [],
      friendRequests: [],
      discovery: [],
      searchResults: [],
      loading: false
    }
  };

  function set(path, value) {
    const parts = String(path).split('.');
    let target = state;

    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }

    target[parts[parts.length - 1]] = value;
    return value;
  }

  function get(path, fallback = undefined) {
    const parts = String(path).split('.');
    let value = state;

    for (const part of parts) {
      if (value == null || !(part in value)) return fallback;
      value = value[part];
    }

    return value;
  }

  function reset() {
    state.auth.user = null;
    state.auth.session = null;
    state.campaign.current = null;
    state.campaign.available = [];
    state.campaign.memberIds = [];
    state.system.current = null;
    state.character.current = null;
    state.character.editingUserId = null;
    state.character.saveStatus = 'sem_ficha';
    state.character.lastSavedAt = null;
    state.tabletop.gridAtivo = false;
    state.tabletop.zoom = 100;
    state.tabletop.gridSize = 40;
    state.tabletop.panX = 0;
    state.tabletop.panY = 0;
    state.tabletop.movementUnlocked = false;
    state.tabletop.immersive = false;
    state.tabletop.lastInteractedToken = null;
    state.tabletop.tokensLoadedCampaignId = null;
    state.session.current = null;
    state.session.diary = null;
    state.session.campaigns = [];
    state.realtime.connected = false;
    state.realtime.channel = null;
    state.social.profile = null;
    state.social.friends = [];
    state.social.friendRequests = [];
    state.social.discovery = [];
    state.social.searchResults = [];
    state.social.loading = false;
  }

  global.MAMUS_STATE = state;
  global.MAMUS_STATE_API = Object.freeze({
    get,
    set,
    reset
  });
})(window);
