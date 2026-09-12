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

  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let connectionGeneration = 0;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    clearReconnectTimer();
    if (!client) return;

    const generation = connectionGeneration;
    const delay = Math.min(30000, 1500 * Math.pow(2, Math.min(reconnectAttempt, 5)));
    reconnectAttempt += 1;

    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (!client || generation !== connectionGeneration) return;

      try {
        if (channel) {
          await client.removeChannel(channel);
        }
      } catch (err) {
        console.warn('[MaMuS Realtime] erro ao remover canal antes da reconexão:', err);
      }

      channel = null;
      updateConnection('connecting', 'Reconectando à Távola...');

      try {
        await connect(client, true);
      } catch (err) {
        console.error('[MaMuS Realtime] falha na reconexão:', err);
        updateConnection('offline', 'Sincronização indisponível');
        scheduleReconnect();
      }
    }, delay);
  }

  async function connect(supabase, force = false) {
    if (!supabase) {
      client = null;
      channel = null;
      updateConnection('offline', 'Modo local — Supabase indisponível.');
      return null;
    }

    if (channel && !force) return channel;

    client = supabase;
    connectionGeneration += 1;
    const generation = connectionGeneration;
    clearReconnectTimer();

    if (channel) {
      try { await client.removeChannel(channel); } catch (_) {}
      channel = null;
    }

    reconnectAttempt = 0;
    updateConnection('connecting', 'Conectando à Távola...');

    try {
      const nextChannel = client.channel(CHANNEL_NAME, {
        config: {
          broadcast: { ack: true, self: false }
        }
      });

      channel = nextChannel;
      registerHandlers(nextChannel);

      let settled = false;
      const subscriptionTimeout = setTimeout(() => {
        if (settled || generation !== connectionGeneration) return;
        console.warn('[MaMuS Realtime] timeout aguardando SUBSCRIBED.');
        updateConnection('offline', 'Sincronização indisponível');
        scheduleReconnect();
      }, 12000);

      nextChannel.subscribe((status, err) => {
        if (generation !== connectionGeneration) return;

        console.info('[MaMuS Realtime] status:', status, err || '');

        if (status === 'SUBSCRIBED') {
          settled = true;
          clearTimeout(subscriptionTimeout);
          reconnectAttempt = 0;
          updateConnection('online', 'Távola sincronizada');
          return;
        }

        if (status === 'CHANNEL_ERROR') {
          settled = true;
          clearTimeout(subscriptionTimeout);
          updateConnection('offline', 'Erro na sincronização');
          if (err) console.error('[MaMuS Realtime] CHANNEL_ERROR:', err);
          scheduleReconnect();
          return;
        }

        if (status === 'TIMED_OUT') {
          settled = true;
          clearTimeout(subscriptionTimeout);
          updateConnection('offline', 'Tempo de conexão esgotado');
          scheduleReconnect();
          return;
        }

        if (status === 'CLOSED') {
          settled = true;
          clearTimeout(subscriptionTimeout);
          updateConnection('offline', 'Távola desconectada');
          scheduleReconnect();
        }
      });

      return nextChannel;
    } catch (err) {
      channel = null;
      updateConnection('offline', 'Erro de conexão');
      console.error('[MaMuS Realtime] erro ao conectar:', err);
      scheduleReconnect();
      return null;
    }
  }

  function send(event, payload) {
    if (!channel) return Promise.resolve(null);
    return channel.send({ type: 'broadcast', event, payload });
  }

  async function disconnect() {
    clearReconnectTimer();
    connectionGeneration += 1;
    reconnectAttempt = 0;

    const currentChannel = channel;
    const currentClient = client;
    channel = null;
    client = null;

    if (currentChannel && currentClient) {
      try {
        await currentClient.removeChannel(currentChannel);
      } catch (err) {
        console.warn('[MaMuS Realtime] erro ao desconectar:', err);
      }
    }

    updateConnection('offline', 'Távola desconectada');
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
