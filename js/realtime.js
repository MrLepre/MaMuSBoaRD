/**
 * MaMuSBoaRD - Realtime
 *
 * Responsável apenas pelo canal Supabase Realtime da mesa.
 * Os handlers continuam sendo resolvidos em window para manter compatibilidade
 * com o app legado e com os módulos/HTML atuais.
 */
(function (global) {
  'use strict';

  const CHANNEL_NAME = 'sala-rpg-geral';
  let channel = null;
  let client = null;

  function getCampaignId() {
    try {
      return typeof global.obterCampanhaIdAtual === 'function'
        ? global.obterCampanhaIdAtual()
        : null;
    } catch (_) {
      return null;
    }
  }

  function isCurrentCampaign(payload) {
    const data = payload?.payload || {};
    const campaignId = data.campanha_id;
    return !campaignId || !getCampaignId() || campaignId === getCampaignId();
  }

  function call(name, ...args) {
    const fn = global[name];
    if (typeof fn !== 'function') return undefined;
    try {
      return fn(...args);
    } catch (err) {
      console.error(`[MaMuS Realtime] erro em ${name}:`, err);
      return undefined;
    }
  }

  function updateConnection(status, text) {
    call('atualizarStatusConexao', status, text);
    try {
      global.MAMUS_STATE_API?.set('realtime.connected', status === 'online');
      global.MAMUS_STATE_API?.set('realtime.channel', channel ? CHANNEL_NAME : null);
    } catch (_) {}
  }

  function registerHandlers(target) {
    target
      .on('broadcast', { event: 'novo_mapa' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        call('exibirMapaNaTela', data.url);
        call('centralAdicionarAtividade', '🗺️', 'O Mestre atualizou o mapa da campanha');
        setTimeout(() => call('carregarTokensCampanha', true), 120);
        call('mostrarPopup', '🗺️ O Mestre atualizou o Mapa de Batalha!');
      })
      .on('broadcast', { event: 'wt_mapa_tatico' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        if (!data.mapaTatico) return;
        call('aplicarMapaTaticoRecebidoRealtime', data.mapaTatico);
      })
      .on('broadcast', { event: 'vtt_zoom' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        call('aplicarZoomRecebidoRealtime', data.zoom, data.panX || 0, data.panY || 0);
      })
      .on('broadcast', { event: 'sessao_atualizada' }, async (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        await call('carregarSessaoAtual');
        call('centralAdicionarAtividade', data.status === 'aberta' ? '🎬' : '📕', `Sessão ${data.numero || ''} ${data.status === 'aberta' ? 'iniciada' : 'atualizada'}`, data.nome || '');
        call('renderizarCentralCampanha');
        const tab = call('obterAbaAtualRealtime') || global.MAMUS_STATE?.ui?.currentTab;
        if (tab === 'inicio') call('carregarResumoCentralCampanha', true);
        if (tab === 'diario') call('carregarDiarioAtual');
        if (tab === 'sessoes' && call('ehMestreDaCampanhaAtual')) call('carregarSessoesCampanha');
      })
      .on('broadcast', { event: 'nova_rolagem' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        call('registrarRolagemHistorico', data.descricao, data.resultado, true);
        call('centralAdicionarAtividade', '🎲', String(data.descricao || 'Nova rolagem'), String(data.resultado ?? ''));
      })
      .on('broadcast', { event: 'galeria_mostrar_imagem' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        if (data.url) call('abrirImagemMestre', data.url, data.nome || 'Imagem da campanha', data.pasta || 'Geral', true);
      })
      .on('broadcast', { event: 'galeria_fechar_imagem' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        call('fecharImagemMestre', true);
      })
      .on('broadcast', { event: 'vtt_ping' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        call('criarEfeitoPing', data.x, data.y);
      })
      .on('broadcast', { event: 'economia_atualizada' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const tab = call('obterAbaAtualRealtime') || global.MAMUS_STATE?.ui?.currentTab;
        if (tab === 'economia') call('carregarEconomiaAtual', true);
      })
      .on('broadcast', { event: 'jornal_atualizado' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        const tab = call('obterAbaAtualRealtime') || global.MAMUS_STATE?.ui?.currentTab;
        if (tab === 'jornais') call('carregarJornaisAtual', true);
        if (tab === 'inicio') {
          call('centralAdicionarAtividade', '📰', 'Novo jornal publicado');
          call('carregarResumoCentralCampanha', true);
        }
      })
      .on('broadcast', { event: 'calendario_atualizado' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        call('aplicarCalendarioRecebidoRealtime', data.ano, data.dia_do_ano);
      })
      .on('broadcast', { event: 'vtt_mover_token' }, (message) => {
        if (!isCurrentCampaign(message)) return;
        const data = message.payload || {};
        call(
          'criarElementoToken',
          data.id,
          data.nome,
          data.x,
          data.y,
          data.tamanho || 45,
          data.imagemStoragePath ? '' : (data.imagem || ''),
          data.hpAtual ?? 50,
          data.hpMax ?? 50,
          (String(data.ownerNick || data.nome || '').trim().toLowerCase() === String(call('obterMeuNickWT') || '').trim().toLowerCase()) || !!call('ehMestreDaCampanhaAtual'),
          {
            ownerNick: data.ownerNick || '',
            ownerUserId: data.ownerUserId || '',
            tipo: data.tipo || '',
            npcIndex: data.npcIndex,
            squad: data.squad || '',
            bagworm: !!data.bagworm,
            chameleon: !!data.chameleon,
            trion: data.trion ?? null,
            triggers: Array.isArray(data.triggers) ? data.triggers : [],
            imagemStoragePath: data.imagemStoragePath || '',
            imagemBucket: data.imagemBucket || '',
            imagemPublico: data.imagemPublico !== false
          }
        );
        const token = document.getElementById(data.id);
        if (token && data.imagemStoragePath) {
          call('aplicarImagemStorageAoToken', token, data.imagemStoragePath, data.imagemBucket || '', data.imagemPublico !== false, data.imagem || '');
        }
      });
  }

  async function connect(supabase) {
    if (!supabase) {
      updateConnection('offline', 'Modo local — Supabase indisponível.');
      return null;
    }

    if (channel) return channel;

    client = supabase;
    try {
      channel = client.channel(CHANNEL_NAME);
      registerHandlers(channel);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') updateConnection('online', 'Távola sincronizada');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') updateConnection('offline', 'Sincronização indisponível');
      });
      return channel;
    } catch (err) {
      channel = null;
      updateConnection('offline', 'Erro de conexão');
      console.error('[MaMuS Realtime] erro ao conectar:', err);
      return null;
    }
  }

  function send(event, payload) {
    if (!channel) return Promise.resolve(null);
    return channel.send({ type: 'broadcast', event, payload });
  }

  async function disconnect() {
    if (!channel || !client) return;
    try { await client.removeChannel(channel); } catch (err) { console.warn('[MaMuS Realtime] erro ao desconectar:', err); }
    channel = null;
    client = null;
  }

  global.MAMUS_REALTIME = Object.freeze({
    channelName: CHANNEL_NAME,
    connect,
    disconnect,
    send,
    getChannel: () => channel,
    isCurrentCampaign
  });
})(window);
