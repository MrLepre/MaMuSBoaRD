// ==========================================
// MaMuSBoaRD - CHARACTERS / FICHAS
// Marco 6 - domínio de personagens e fichas
// ==========================================
(function (global) {
  'use strict';

  const state = global.MAMUS_STATE;

  function supabase() { return global.MAMUS_SUPABASE || null; }
  function fichaAtual() { return state.character.current; }
  function setFicha(valor) { state.character.current = valor; return valor; }
  function campanhaAtual() { return state.campaign.current; }
  function sistemaAtual() { return state.system.current; }
  function userIdAtual() { return global.usuarioAtualId || state.auth.user?.id || null; }

// --- FICHA DO PERSONAGEM ---
function importarArquivoJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      MAMUS_STATE.character.current = JSON.parse(e.target.result);
      MAMUS_STATE.character.lastSavedAt = null;
      MAMUS_STATE.character.saveStatus = 'nao_salva';
      renderizarFichaNaTela(MAMUS_STATE.character.current);
      renderizarCentralCampanha();
      mostrarPopup('📄 Ficha JSON lida com sucesso! Clique em "Salvar na Nuvem".');
    } catch (err) {
      alert('Arquivo JSON inválido.');
    }
  };
  reader.readAsText(file);
}

async function salvarFichaNoSupabase(userIdDestino = null) {
  if (!supabase()) return alert('Supabase não conectado.');

  const { data: { session } } = await supabase().auth.getSession();
  if (!session) return alert('Você precisa estar logado para salvar sua ficha!');
  if (!MAMUS_STATE.character.current) return alert('Nenhuma ficha carregada para salvar.');

  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return alert('Selecione uma campanha antes de salvar a ficha.');

  const nomeChar = MAMUS_STATE.character.current.nome || MAMUS_STATE.character.current.personagem_nome || 'Personagem';
  const idDestino = userIdDestino || session.user.id;
  const ehEdicaoMestre = Boolean(ehMestreDaCampanhaAtual() && userIdDestino && userIdDestino !== session.user.id);
  const agora = new Date().toISOString();

  /*
   * IMPORTANTE:
   * Não usamos mais upsert com onConflict aqui.
   * O banco possui histórico de versões antigas da tabela `fichas` e algumas
   * instalações podem ainda ter constraints UNIQUE legadas em `user_id`.
   * O fluxo explícito SELECT -> UPDATE/INSERT é mais tolerante a esse cenário
   * e evita que o PostgREST dependa de uma constraint específica para resolver
   * o conflito.
   */
  const consultaExistente = await supabase()
    .from('fichas')
    .select('id')
    .eq('user_id', idDestino)
    .eq('campanha_id', campanhaId)
    .maybeSingle();

  if (consultaExistente.error) {
    console.error('Erro ao localizar ficha antes de salvar:', consultaExistente.error);
    mostrarPopup('❌ Não foi possível localizar sua ficha: ' + consultaExistente.error.message);
    return;
  }

  let resultado;

  if (consultaExistente.data?.id) {
    // Ficha desta campanha já existe: atualizamos exatamente aquela linha.
    resultado = await supabase()
      .from('fichas')
      .update({
        nome_personagem: nomeChar,
        dados_ficha: MAMUS_STATE.character.current,
        updated_at: agora
      })
      .eq('id', consultaExistente.data.id)
      .eq('campanha_id', campanhaId)
      .select('id')
      .single();
  } else {
    // Primeira ficha deste jogador nesta campanha.
    resultado = await supabase()
      .from('fichas')
      .insert({
        user_id: idDestino,
        nome_personagem: nomeChar,
        dados_ficha: MAMUS_STATE.character.current,
        updated_at: agora,
        campanha_id: campanhaId
      })
      .select('id')
      .single();

    /*
     * Se uma instalação antiga ainda possuir UNIQUE(user_id), o INSERT acima
     * continuará sendo bloqueado pelo banco. Nesse caso mostramos uma mensagem
     * específica em vez de um erro genérico/"duplicate key".
     */
    if (resultado.error && /duplicate key|unique constraint|violates unique/i.test(resultado.error.message || '')) {
      console.error('Constraint UNIQUE legada detectada em fichas:', resultado.error);
      mostrarPopup('❌ O Supabase ainda possui uma regra UNIQUE antiga em fichas. Execute o SQL de correção de fichas no projeto e tente novamente.');
      return;
    }
  }

  if (resultado.error) {
    console.error('Erro ao salvar ficha:', resultado.error);
    mostrarPopup('❌ Erro ao salvar: ' + resultado.error.message);
    return;
  }

  MAMUS_STATE.character.lastSavedAt = agora;
  MAMUS_STATE.character.saveStatus = 'salva';
  centralAdicionarAtividade('👤', `${nomeChar} atualizou a ficha`, ehEdicaoMestre ? 'Mestre' : 'Meu personagem');
  renderizarCentralCampanha();
  mostrarPopup(
    ehEdicaoMestre
      ? '👑 Ficha do jogador atualizada pelo Mestre!'
      : '💾 Ficha salva na nuvem com sucesso!'
  );
}

async function carregarFichaDoUsuario(userId) {
  if (!supabase()) return;
  const { data, error } = await supabase()
    .from('fichas')
    .select('*')
    .eq('user_id', userId)
    .eq('campanha_id', obterCampanhaIdAtual())
    .maybeSingle();

  if (error) {
    console.warn('Aviso ao carregar ficha:', error.message);
    return;
  }

  if (data && data.dados_ficha) {
    MAMUS_STATE.character.current = data.dados_ficha;
    MAMUS_STATE.character.lastSavedAt = data.updated_at || null;
    MAMUS_STATE.character.saveStatus = 'salva';
    renderizarFichaNaTela(MAMUS_STATE.character.current);
    renderizarCentralCampanha();
    if (worldTriggerAtivo()) { worldTriggerEstado.triggersAtivos = normalizarTriggersFichaWT(MAMUS_STATE.character.current); sincronizarSquadNPCsEstadoWT(MAMUS_STATE.character.current); salvarEstadoWorldTrigger(); renderizarPainelWTSeNecessario(); }
  }
}

function escaparHTML(valor) {
  return String(valor ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderizarFichaNaTela(dados) {
  const container = document.getElementById('container-ficha-carregada');
  if (!container) return;
  const nome = dados?.nome || dados?.personagem_nome || 'Sem Nome';
  const nivel = dados?.nivel || 1;
  const xp = dados?.xp_atual ?? 0;
  const sistemaTipo = MAMUS_STATE.system.current?.configuracao?.tipo;
  const resumoContexto = sistemaTipo === 'sobreviventes_fronteira'
    ? `<p><strong>Classe:</strong> ${escaparHTML(dados?.classe || '-')} &nbsp;|&nbsp; <strong>Raça:</strong> ${escaparHTML(dados?.raca || '-')} &nbsp;|&nbsp; <strong>Grau:</strong> ${escaparHTML(dados?.grau_linhagem || 1)}</p>`
    : sistemaTipo === 'olimpia_pangeia'
    ? `<p><strong>Classe:</strong> ${escaparHTML(dados?.classe || '-')} &nbsp;|&nbsp; <strong>Raça:</strong> ${escaparHTML(dados?.raca || '-')} &nbsp;|&nbsp; <strong>Reino:</strong> ${escaparHTML(dados?.reino || '-')}</p>`
    : `<p><strong>Tipo Humano:</strong> ${escaparHTML(dados?.tipo_humano || dados?.raca || '-')} &nbsp;|&nbsp; <strong>Antecedente:</strong> ${escaparHTML(dados?.antecedente || '-')}</p>`;
  container.innerHTML = `
    <div style="background:linear-gradient(135deg,#10141f,#161b2c);padding:1rem;border-radius:6px;border:1px solid #d4af37;">
      <h3 style="color:#f3d075;font-family:Cinzel,serif;">${escaparHTML(nome)}</h3>
      <p><strong>Nível:</strong> ${escaparHTML(nivel)} &nbsp;|&nbsp; <strong>XP:</strong> ${escaparHTML(xp)}</p>
      ${resumoContexto}
      <p style="color:#a8a8b3;">Ficha carregada. Abra a ficha completa para visualizar todos os campos e detalhes.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button onclick="abrirFichaAtualCompleta()">📖 Abrir Ficha Completa</button>
        <button onclick="abrirEditorFichaAtual()" style="background:#315d36;color:#dfffe3;border:1px solid #7fd88b;">✏️ Editar Ficha</button>
      </div>
    </div>`;
}

function ehFichaLegadaAtual() {
  return MAMUS_STATE.system.current?.configuracao?.tipo === 'legado' || MAMUS_STATE.system.current?.configuracao?.ficha === 'ficha-editor.html';
}

function abrirCriadorFicha() {
  const modal = document.getElementById('modal-criador-ficha');
  const iframe = document.getElementById('iframe-criador-ficha');
  if (!modal || !iframe) return;
  if (!MAMUS_STATE.campaign.current) return mostrarPopup('❌ Selecione uma campanha antes de criar a ficha.');
  if (!MAMUS_STATE.system.current) return mostrarPopup('❌ Esta campanha está sem um sistema RPG vinculado.');
  if (ehFichaLegadaAtual()) {
    iframe.src = 'ficha-editor.html?modo=criacao&t=' + Date.now();
  } else {
    const arquivo = MAMUS_STATE.system.current?.configuracao?.tipo === 'elarion' ? 'ficha-elarion.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'eter_brasas' ? 'ficha-eter-brasas.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noctavell' ? 'ficha-noctavell.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'olimpia_pangeia' ? 'ficha-olimpia.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'sobreviventes_fronteira' ? 'ficha-sobreviventes.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noites_em_tokyo' ? 'ficha-noites-em-tokyo.html' : 'ficha-generica.html')))));
    abrirFichaGenericaNoIframe(iframe, arquivo + '?modo=criacao&sistema=' + encodeURIComponent(MAMUS_STATE.system.current.id) + '&t=' + Date.now(), MAMUS_STATE.system.current, null, 'criacao');
  }
  const titulo = document.querySelector('#modal-criador-ficha .modal-ficha-cabecalho h2');
  if (titulo) titulo.textContent = `⚔️ Criar Nova Ficha — ${MAMUS_STATE.system.current?.nome || 'Sistema RPG'}`;
  modal.style.display = 'flex';
}

function abrirEditorFichaAtual() {
  if (!MAMUS_STATE.character.current) return mostrarPopup('❌ Nenhuma ficha carregada para editar.');
  const modal = document.getElementById('modal-criador-ficha');
  const iframe = document.getElementById('iframe-criador-ficha');
  if (!modal || !iframe) return;
  if (ehFichaLegadaAtual()) {
    iframe.src = 'ficha-editor.html?modo=edicao&t=' + Date.now();
    iframe.addEventListener('load', function carregarEdicaoLegadaUmaVez() {
      iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-ficha', dados: MAMUS_STATE.character.current, modo: 'edicao', userId: null }, window.location.origin);
    }, { once: true });
  } else {
    const arquivo = MAMUS_STATE.system.current?.configuracao?.tipo === 'eter_brasas' ? 'ficha-eter-brasas.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noctavell' ? 'ficha-noctavell.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'olimpia_pangeia' ? 'ficha-olimpia.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'sobreviventes_fronteira' ? 'ficha-sobreviventes.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noites_em_tokyo' ? 'ficha-noites-em-tokyo.html' : 'ficha-generica.html'))));
    abrirFichaGenericaNoIframe(iframe, arquivo + '?modo=edicao&sistema=' + encodeURIComponent(MAMUS_STATE.system.current.id) + '&t=' + Date.now(), MAMUS_STATE.system.current, MAMUS_STATE.character.current, 'edicao');
  }
  modal.style.display = 'flex';
}

function abrirEditorFicha(dados, userId = null) {
  if (!dados) return mostrarPopup('❌ Dados da ficha não encontrados.');
  const modal = document.getElementById('modal-criador-ficha');
  const iframe = document.getElementById('iframe-criador-ficha');
  if (!modal || !iframe) return;

  MAMUS_STATE.character.editingUserId = userId;
  if (ehFichaLegadaAtual()) {
    iframe.src = 'ficha-editor.html?modo=edicao&t=' + Date.now();
    iframe.addEventListener('load', function carregarEdicaoUmaVez() {
      iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-ficha', dados, modo: 'edicao', userId }, window.location.origin);
    }, { once: true });
  } else {
    const arquivo = MAMUS_STATE.system.current?.configuracao?.tipo === 'eter_brasas' ? 'ficha-eter-brasas.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noctavell' ? 'ficha-noctavell.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'olimpia_pangeia' ? 'ficha-olimpia.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'sobreviventes_fronteira' ? 'ficha-sobreviventes.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noites_em_tokyo' ? 'ficha-noites-em-tokyo.html' : 'ficha-generica.html'))));
    abrirFichaGenericaNoIframe(iframe, arquivo + '?modo=edicao&sistema=' + encodeURIComponent(MAMUS_STATE.system.current.id) + '&t=' + Date.now(), MAMUS_STATE.system.current, dados, 'edicao');
  }
  modal.style.display = 'flex';
}

function fecharCriadorFicha() {
  const modal = document.getElementById('modal-criador-ficha');
  const iframe = document.getElementById('iframe-criador-ficha');
  if (modal) modal.style.display = 'none';
  if (iframe) iframe.src = 'about:blank';
}

function abrirFichaCompletaNoIframe(dados) {
  const conteudoModal = document.getElementById('modal-conteudo-ficha');
  if (!conteudoModal) return;
  const tipo = MAMUS_STATE.system.current?.configuracao?.tipo;
  const arquivo = tipo === 'elarion' ? 'ficha-elarion.html' : (tipo === 'eter_brasas' ? 'ficha-eter-brasas.html' : (tipo === 'noctavell' ? 'ficha-noctavell.html' : (tipo === 'olimpia_pangeia' ? 'ficha-olimpia.html' : (tipo === 'sobreviventes_fronteira' ? 'ficha-sobreviventes.html' : (tipo === 'noites_em_tokyo' ? 'ficha-noites-em-tokyo.html' : 'ficha-editor.html')))));
  const src = arquivo === 'ficha-editor.html' ? `${arquivo}?modo=visualizacao&t=${Date.now()}` : `${arquivo}?modo=visualizacao&sistema=${encodeURIComponent(MAMUS_STATE.system.current?.id||'')}&t=${Date.now()}`;
  conteudoModal.innerHTML = `<iframe id="iframe-ficha-visualizacao" title="Ficha completa do personagem" src="${src}"></iframe>`;
  const iframe = document.getElementById('iframe-ficha-visualizacao');
  iframe.addEventListener('load', () => {
    iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-sistema', sistema: MAMUS_STATE.system.current }, window.location.origin);
    iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-ficha', dados: dados, modo: 'visualizacao' }, window.location.origin);
  }, { once: true });
}

function abrirFichaAtualCompleta() {
  if (!MAMUS_STATE.character.current) return mostrarPopup('❌ Nenhuma ficha carregada.');
  const tituloElem = document.getElementById('modal-titulo-personagem');
  if (tituloElem) tituloElem.innerText = MAMUS_STATE.character.current.nome || MAMUS_STATE.character.current.personagem_nome || 'Ficha do Cavaleiro';
  abrirFichaCompletaNoIframe(MAMUS_STATE.character.current);
  const modal = document.getElementById('modal-ficha-grupo');
  if (modal) modal.style.display = 'flex';
}


// --- FICHAS DO GRUPO ---
async function carregarFichasDoGrupo() {
  if (!supabase()) return;
  const lista = document.getElementById('lista-fichas-grupo');
  if (!lista) return;
  lista.innerHTML = '<p style="color: #a8a8b3;">Carregando fichas dos cavaleiros...</p>';

  const { data: { session } } = await supabase().auth.getSession();
  const meuUserId = session?.user?.id || null;

  const { data, error } = await supabase()
    .from('fichas')
    .select('*')
    .eq('campanha_id', obterCampanhaIdAtual());

  if (error || !data || data.length === 0) {
    lista.innerHTML = '<p style="color: #a8a8b3;">Nenhuma ficha encontrada no grupo.</p>';
    return;
  }

  lista.innerHTML = '';
  
  data.forEach((item) => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #202024; padding: 1rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #29292e; margin-bottom: 8px;';
    
    const infoDiv = document.createElement('div');
    const nomeCavaleiro = item.nome_personagem || 'Cavaleiro Desconhecido';
    infoDiv.innerHTML = `<strong style="color: #fff; font-size: 1.1rem;">${escaparHTML(nomeCavaleiro)}</strong>`;
    
    const acoesDiv = document.createElement('div');
    acoesDiv.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';

    const botaoVer = document.createElement('button');
    botaoVer.innerText = 'Ver Ficha';
    botaoVer.style.cssText = 'background: #8257e5; color: #fff; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-weight: bold;';
    botaoVer.onclick = () => {
      abrirFichaGrupo(item.dados_ficha);
    };
    acoesDiv.appendChild(botaoVer);

    if ((meuUserId && item.user_id === meuUserId) || ehMestreDaCampanhaAtual()) {
      const botaoEditar = document.createElement('button');
      botaoEditar.innerText = ehMestreDaCampanhaAtual() && item.user_id !== meuUserId ? '👑 Editar como Mestre' : '✏️ Editar';
      botaoEditar.style.cssText = 'background: #315d36; color: #dfffe3; border: 1px solid #7fd88b; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-weight: bold;';
      botaoEditar.onclick = () => {
        abrirEditorFicha(item.dados_ficha, item.user_id);
      };
      acoesDiv.appendChild(botaoEditar);
    }

    if (ehMestreDaCampanhaAtual()) {
      const botaoExcluir = document.createElement('button');
      botaoExcluir.innerText = '🗑️ Apagar';
      botaoExcluir.style.cssText = 'background:#4a2020; color:#ffd7d7; border:1px solid #9b4b4b; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-weight:bold;';
      botaoExcluir.onclick = () => excluirFichaDoGrupo(item.id, nomeCavaleiro);
      acoesDiv.appendChild(botaoExcluir);
    }

    card.appendChild(infoDiv);
    card.appendChild(acoesDiv);
    lista.appendChild(card);
  });
}

async function excluirFichaDoGrupo(fichaId, nomePersonagem = 'esta ficha') {
  if (!ehMestreDaCampanhaAtual() || !supabase()) return mostrarPopup('❌ Apenas o Mestre pode apagar fichas.');
  if (!fichaId) return mostrarPopup('❌ ID da ficha não encontrado.');
  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return mostrarPopup('❌ Selecione uma campanha antes de apagar a ficha.');
  if (!confirm(`Apagar a ficha de "${String(nomePersonagem).replace(/"/g, '\"')}" desta campanha?\n\nOs dados da ficha serão removidos da nuvem.`)) return;

  const { error } = await supabase()
    .from('fichas')
    .delete()
    .eq('id', fichaId)
    .eq('campanha_id', campanhaId);

  if (error) {
    console.error('Erro ao apagar ficha:', error);
    return mostrarPopup('❌ Não foi possível apagar a ficha: ' + error.message);
  }

  if (MAMUS_STATE.character.current && (MAMUS_STATE.character.current.nome === nomePersonagem || MAMUS_STATE.character.current.personagem_nome === nomePersonagem)) {
    MAMUS_STATE.character.current = null;
    const container = document.getElementById('container-ficha-carregada');
    if (container) container.innerHTML = '<p class="texto-vazio">A ficha foi removida pelo Mestre.</p>';
  }

  tocarSom('success');
  mostrarPopup('🗑️ Ficha apagada da campanha.');
  await carregarFichasDoGrupo();
  if (typeof carregarFichaDoUsuario === 'function') {
    const session = (await supabase().auth.getSession()).data.session;
    if (session?.user?.id) await carregarFichaDoUsuario(session.user.id);
  }
}

function abrirFichaGrupo(dados) {
  if (!dados) return mostrarPopup('❌ Dados da ficha não encontrados.');
  const tituloElem = document.getElementById('modal-titulo-personagem');
  if (tituloElem) tituloElem.innerText = dados.nome || dados.personagem_nome || 'Ficha do Cavaleiro';
  abrirFichaCompletaNoIframe(dados);
  const modalGrupo = document.getElementById('modal-ficha-grupo');
  if (modalGrupo) modalGrupo.style.display = 'flex';
}


function fecharModalFichaGrupo() {
  const modalGrupo = document.getElementById('modal-ficha-grupo');
  if (modalGrupo) modalGrupo.style.display = 'none';
}


  // API pública do domínio. Mantemos os nomes legados para compatibilidade
  // com os onclicks existentes e com os módulos que ainda estão em transição.
  global.MAMUS_CHARACTERS = Object.freeze({
    get: fichaAtual,
    set: setFicha,
    salvar: salvarFichaNoSupabase,
    carregar: carregarFichaDoUsuario,
    importar: importarArquivoJSON,
    abrirCriador: abrirCriadorFicha,
    fecharCriador: fecharCriadorFicha,
    abrirEditorAtual: abrirEditorFichaAtual,
    abrirEditor: abrirEditorFicha,
    abrirFichaCompleta: abrirFichaAtualCompleta,
    carregarGrupo: carregarFichasDoGrupo,
    excluirGrupo: excluirFichaDoGrupo,
    abrirGrupo: abrirFichaGrupo,
    fecharGrupo: fecharModalFichaGrupo
  });

  global.salvarFichaNoSupabase = salvarFichaNoSupabase;
  global.carregarFichaDoUsuario = carregarFichaDoUsuario;
  global.importarArquivoJSON = importarArquivoJSON;
  global.abrirCriadorFicha = abrirCriadorFicha;
  global.fecharCriadorFicha = fecharCriadorFicha;
  global.abrirFichaAtualCompleta = abrirFichaAtualCompleta;
  global.abrirEditorFichaAtual = abrirEditorFichaAtual;
  global.abrirEditorFicha = abrirEditorFicha;
  global.carregarFichasDoGrupo = carregarFichasDoGrupo;
  global.excluirFichaDoGrupo = excluirFichaDoGrupo;
  global.abrirFichaGrupo = abrirFichaGrupo;
  global.fecharModalFichaGrupo = fecharModalFichaGrupo;
  global.escaparHTML = escaparHTML;
  global.renderizarFichaNaTela = renderizarFichaNaTela;

  // A mensagem de criação/edição pertence ao domínio de fichas, não ao app shell.
  global.addEventListener('message', async (event) => {
    if (event.origin !== global.location.origin) return;
    if (!event.data || event.data.type !== 'cronicas-camelot-ficha-pronta') return;
    if (!event.data.dados) return;

    const foiEdicao = event.data.modo === 'edicao';
    setFicha(event.data.dados);
    global.MAMUS_WT_HOOKS?.onFichaUpdated?.(event.data.dados);
    if (foiEdicao && event.data.userId) state.character.editingUserId = event.data.userId;
    state.character.saveStatus = 'salvando';
    global.renderizarFichaNaTela(event.data.dados);
    global.renderizarCentralCampanha();
    fecharCriadorFicha();

    const nome = event.data.dados.nome || event.data.dados.personagem_nome || 'Personagem';
    global.mostrarPopup(foiEdicao ? `💾 Ficha de ${nome} atualizada!` : `⚔️ Ficha de ${nome} criada na mesa!`);

    const client = supabase();
    if (client) {
      const { data: { session } } = await client.auth.getSession();
      if (session) await salvarFichaNoSupabase(state.character.editingUserId);
    }
  });
})(window);
