/*
 * MaMuSBoaRD — Systems Module
 * Marco 5: extração do gerenciamento de sistemas do app.js.
 * Não altera o schema do Supabase; usa o cliente central e preserva a API legada.
 */
(function (global) {
  'use strict';

  const API = {
    async load() {
      const sb = global.MAMUS_SUPABASE;
      if (!sb) return [];

      const lista = document.getElementById('lista-sistemas');
      if (!lista) return [];

      const user = global.MAMUS_STATE?.auth?.user;
      if (user && global.usuarioAutenticado?.()) {
        const ensure = [
          'garantirSistemaElarion',
          'garantirSistemaEterBrasas',
          'garantirSistemaNoctavell',
          'garantirSistemaNoitesEmTokyo',
          'garantirSistemaOlimpia',
          'garantirSistemaSobreviventes'
        ];
        for (const nome of ensure) {
          if (typeof global[nome] === 'function') await global[nome]();
        }
      }

      const { data, error } = await sb.from('sistemas')
        .select('id,nome,descricao,configuracao,criado_por,created_at')
        .order('created_at', { ascending: true });

      if (error) {
        lista.innerHTML = '<div class="estado-galeria">Não foi possível carregar os sistemas.</div>';
        console.error('Erro ao carregar sistemas:', error);
        return [];
      }

      render(data || []);
      return data || [];
    },

    async select(id) {
      const sb = global.MAMUS_SUPABASE;
      if (!sb || !id) return null;
      const { data, error } = await sb.from('sistemas').select('*').eq('id', id).single();
      if (error || !data) {
        global.mostrarPopup?.('❌ Sistema não encontrado.');
        return null;
      }
      if (global.MAMUS_STATE?.system) global.MAMUS_STATE.system.current = data;
      return data;
    },

    async edit(id) {
      const sb = global.MAMUS_SUPABASE;
      if (!sb || !id) return;
      const { data, error } = await sb.from('sistemas').select('*').eq('id', id).single();
      if (error || !data) return;

      const userId = global.MAMUS_STATE?.auth?.user?.id || global.usuarioAtualId;
      if (data.criado_por !== userId && !global.ehMestreGlobal?.()) {
        return global.mostrarPopup?.('❌ Você só pode editar sistemas que criou.');
      }

      const idEl = document.getElementById('sistema-editando-id');
      const title = document.getElementById('titulo-editor-sistema');
      const nome = document.getElementById('novo-sistema-nome');
      const descricao = document.getElementById('novo-sistema-descricao');
      const painel = document.getElementById('painel-novo-sistema');
      if (idEl) idEl.value = data.id;
      if (title) title.textContent = '⚒️ Editar sistema';
      if (nome) nome.value = data.nome || '';
      if (descricao) descricao.value = data.descricao || '';
      global.iniciarBuilderSistema?.(data.configuracao || {});

      const tema = data.configuracao?.tema || {};
      const primary = document.getElementById('sistema-cor-primaria');
      const fundo = document.getElementById('sistema-cor-fundo');
      const painelCor = document.getElementById('sistema-cor-painel');
      if (primary) primary.value = tema.corPrimaria || '#c5a059';
      if (fundo) fundo.value = tema.corFundo || '#080a0f';
      if (painelCor) painelCor.value = tema.corPainel || '#151821';
      if (painel) painel.style.display = 'block';
      nome?.focus();
    },

    async openSheet(id) {
      const data = await this.select(id);
      if (!data) return;

      const modal = document.getElementById('modal-criador-ficha');
      const iframe = document.getElementById('iframe-criador-ficha');
      if (!modal || !iframe) return;

      const tipo = data.configuracao?.tipo;
      const src = {
        legado: 'ficha-editor.html',
        elarion: 'ficha-elarion.html',
        eter_brasas: 'ficha-eter-brasas.html',
        noctavell: 'ficha-noctavell.html',
        olimpia_pangeia: 'ficha-olimpia.html',
        noites_em_tokyo: 'ficha-noites-em-tokyo.html',
        sobreviventes_fronteira: 'ficha-sobreviventes.html'
      }[tipo] || 'ficha-generica.html';

      const url = `${src}?modo=criacao&sistema=${encodeURIComponent(id)}&t=${Date.now()}`;
      if (tipo === 'legado') iframe.src = `${src}?modo=criacao&t=${Date.now()}`;
      else if (typeof global.abrirFichaGenericaNoIframe === 'function') {
        global.abrirFichaGenericaNoIframe(iframe, url, data, null, 'criacao');
      } else {
        iframe.src = url;
      }

      const titulo = document.querySelector('#modal-criador-ficha .modal-ficha-cabecalho h2');
      if (titulo) titulo.textContent = `⚔️ Ficha — ${data.nome}`;
      modal.style.display = 'flex';
    }
  };

  function render(sistemas) {
    const lista = document.getElementById('lista-sistemas');
    if (!lista) return;
    lista.innerHTML = '';

    sistemas.forEach((s) => {
      const card = document.createElement('article');
      const cfg = s.configuracao || {};
      card.className = 'card-sistema' + (cfg.tipo === 'legado' ? ' legado' : '');
      const modulos = {
        world_trigger: ['🔋 Trion','👥 Squads','📡 Radar','👻 Stealth','🏆 Rank Wars'],
        elarion: ['💎 Joias ilimitadas','🧤 Luvas','✨ Inspiração','❤️ Fadiga','🎲 2d10'],
        eter_brasas: ['🎲 2d10','✨ Técnica Única','🏰 Reinos','🏛️ Guildas','📖 Bestiário','🗓️ Calendário'],
        noctavell: ['🎲 Dado do Véu','📜 Pactos','👁️ Entidades','🧠 Sanidade','🔐 Nome Verdadeiro'],
        olimpia_pangeia: ['🏛️ Pangeia','⚔️ Classes','✨ Passiva + 3 Habilidades + Ultimate','💎 Jóias','📈 XP dobrando'],
        sobreviventes_fronteira: ['🧱 Grau de Linhagem','⚔️ Combate letal','🌀 Ciclos temporais','🌌 Órbitas','✨ Moldagem de Mana'],
        noites_em_tokyo: ['🩸 Ghouls','🧬 Kagunes','🔬 RC / Kakuja','⚔️ CCG / Quinques','🌙 Fome / Sanidade']
      }[cfg.tipo];
      const resumo = modulos?.join(' · ') || [
        `${(cfg.dados || []).length} dados`,
        `${(cfg.atributos || []).length} atributos`,
        `${(cfg.recursos || []).length} recursos`,
        `${(cfg.pericias || []).length} perícias`
      ].join(' · ');
      const safe = global.escaparHTML || ((v) => String(v ?? ''));
      const userId = global.MAMUS_STATE?.auth?.user?.id || global.usuarioAtualId;
      const podeEditar = s.criado_por === userId || global.ehMestreGlobal?.();

      card.innerHTML = `<div class="card-sistema-topo"><div><h3>⚙️ ${safe(s.nome)}</h3><p>${safe(s.descricao || 'Sem descrição.')}</p><div class="card-sistema-meta">${safe(resumo)}</div></div>${cfg.tipo === 'legado' ? '<span class="badge-legado">LEGADO</span>' : ''}</div><div class="card-sistema-acoes"><button class="btn-sistema-acao" data-sistema-acao="ficha" data-id="${safe(s.id)}">📖 Abrir Ficha</button>${podeEditar ? `<button class="btn-sistema-acao" data-sistema-acao="editar" data-id="${safe(s.id)}">✏️ Editar</button>` : ''}</div>`;
      lista.appendChild(card);
    });

    lista.querySelectorAll('[data-sistema-acao]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (button.dataset.sistemaAcao === 'editar') API.edit(id);
        else API.openSheet(id);
      });
    });
  }

  global.MAMUS_SYSTEMS = API;
  global.carregarSistemas = API.load;
  global.editarSistema = API.edit;
  global.abrirFichaDoSistema = API.openSheet;
})(window);
