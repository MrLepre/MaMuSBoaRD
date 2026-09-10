// MaMuSBoaRD — módulo específico World Trigger
// Marco 8 — RPG Modules v1

let wtRecalculoVisibilidadeAgendado = false;

let worldTriggerEstado = {
  meuSquad: '', bagworm: false, chameleon: false, triggersAtivos: [], scans: {}, tokens: {}, squadNpcs: [],
  campoVisaoCelulas: 8, mapaTatico: { paredes: {}, coberturas: {} }, ultimaSincronizacaoTatica: 0
};

function obterConfiguracaoSistemaAtualWT() {
  const bruto = MAMUS_STATE.system.current?.configuracao;
  if (!bruto) return null;
  if (typeof bruto === 'object') return bruto;
  if (typeof bruto === 'string') {
    try { return JSON.parse(bruto); } catch (err) { return null; }
  }
  return null;
}

function worldTriggerAtivo() {
  const cfg = obterConfiguracaoSistemaAtualWT();
  const nome = String(MAMUS_STATE.system.current?.nome || '').trim().toLowerCase();

  // Compatibilidade com sistemas salvos antes da implantação do campo
  // configuracao.tipo. O nome do sistema continua sendo uma identificação
  // segura para esta ativação enquanto a campanha estiver vinculada a ele.
  if (cfg?.tipo === 'world_trigger') return true;
  if (nome.includes('world trigger')) return true;

  // Também reconhece uma configuração que tenha os módulos característicos
  // do sistema, mesmo que o tipo tenha sido perdido em uma migração antiga.
  const mod = cfg?.modulos || {};
  return !!(mod.trion?.ativo && mod.triggers?.ativo && mod.radar?.ativo);
}

function carregarEstadoWorldTrigger() {
  if (!worldTriggerAtivo()) {
    worldTriggerEstado = { meuSquad:'', bagworm:false, chameleon:false, triggersAtivos:[], scans:{}, tokens:{}, squadNpcs:[], campoVisaoCelulas:8, mapaTatico:{paredes:{},coberturas:{}} };
    return;
  }
  try {
    const chave = `wt_estado_${obterCampanhaIdAtual() || 'sem-campanha'}`;
    const salvo = JSON.parse(localStorage.getItem(chave) || '{}');
    worldTriggerEstado = {
      meuSquad: String(salvo.meuSquad || ''),
      bagworm: !!salvo.bagworm,
      chameleon: !!salvo.chameleon,
      triggersAtivos: Array.isArray(salvo.triggersAtivos) ? salvo.triggersAtivos.map(String) : [],
      scans: salvo.scans || {},
      tokens: {},
      squadNpcs: Array.isArray(salvo.squadNpcs) ? salvo.squadNpcs.map((n,i)=>({ ...n, indice:i, bagwormAtivo:!!n.bagwormAtivo, chameleonAtivo:!!n.chameleonAtivo })) : [],
      campoVisaoCelulas: Math.max(3, Math.min(20, Number(salvo.campoVisaoCelulas) || 8)),
      mapaTatico: normalizarMapaTaticoWT(salvo.mapaTatico)
    };
  } catch (err) {
    worldTriggerEstado = { meuSquad:'', bagworm:false, chameleon:false, triggersAtivos:[], scans:{}, tokens:{}, squadNpcs:[], campoVisaoCelulas:8, mapaTatico:{paredes:{},coberturas:{}} };
  }
}

function salvarEstadoWorldTrigger() {
  if (!worldTriggerAtivo()) return;
  try {
    const chave = `wt_estado_${obterCampanhaIdAtual() || 'sem-campanha'}`;
    localStorage.setItem(chave, JSON.stringify({
      meuSquad: worldTriggerEstado.meuSquad,
      bagworm: worldTriggerEstado.bagworm,
      chameleon: worldTriggerEstado.chameleon,
      triggersAtivos: worldTriggerEstado.triggersAtivos,
      scans: worldTriggerEstado.scans,
      squadNpcs: (worldTriggerEstado.squadNpcs || []).map(n=>({ indice:n.indice, bagwormAtivo:!!n.bagwormAtivo, chameleonAtivo:!!n.chameleonAtivo })),
      campoVisaoCelulas: worldTriggerEstado.campoVisaoCelulas,
      mapaTatico: worldTriggerEstado.mapaTatico || {paredes:{}, coberturas:{}}
    }));
  } catch (err) {}
}

function obterMeuNickWT() {
  return document.getElementById('user-nick-display')?.innerText || document.getElementById('auth-nick')?.value || 'Jogador';
}

function normalizarSquadWT(valor) {
  return String(valor || '').trim().toLowerCase();
}

function obterCoordenadasTokenWT(token) {
  if (!token) return null;
  const x = Number(token?.dataset?.tokenX ?? token?.x ?? token?.style?.left?.replace('%',''));
  const y = Number(token?.dataset?.tokenY ?? token?.y ?? token?.style?.top?.replace('%',''));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function ehTokenDoMeuSquad(token) {
  if (!worldTriggerAtivo()) return false;
  const squad = normalizarSquadWT(token?.dataset?.tokenSquad ?? token?.squad);
  const meuSquad = normalizarSquadWT(worldTriggerEstado.meuSquad);
  return !!meuSquad && !!squad && squad === meuSquad;
}

function obterTokensDoMeuSquadWT() {
  const meuSquad = normalizarSquadWT(worldTriggerEstado.meuSquad);
  if (!meuSquad) return [];
  return Object.values(worldTriggerEstado.tokens || {}).filter(t => normalizarSquadWT(t?.squad) === meuSquad);
}

function obterMeuTokenWT() {
  const nick = obterMeuNickWT().trim().toLowerCase();
  const dom = Array.from(document.querySelectorAll('.vtt-token')).find(t => String(t.dataset.tokenNome || '').trim().toLowerCase() === nick);
  if (dom) return dom;
  const encontrado = Object.values(worldTriggerEstado.tokens || {}).find(t => String(t.nome || '').trim().toLowerCase() === nick);
  return encontrado || null;
}


function normalizarMapaTaticoWT(mapa) {
  const src = mapa && typeof mapa === 'object' ? mapa : {};
  const normalizar = (obj) => {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v) out[String(k)] = { tipo: String(v.tipo || 'parede'), atualizadoEm: Number(v.atualizadoEm || Date.now()) };
    });
    return out;
  };
  return { paredes: normalizar(src.paredes), coberturas: normalizar(src.coberturas) };
}

function obterMapaTaticoWT() {
  if (!worldTriggerEstado.mapaTatico) worldTriggerEstado.mapaTatico = { paredes:{}, coberturas:{} };
  return worldTriggerEstado.mapaTatico;
}

function obterDimensoesGradeWT() {
  const scaler = document.getElementById('vtt-mapa-scaler');
  if (!scaler) return null;
  const largura = scaler.clientWidth || scaler.getBoundingClientRect().width;
  const altura = scaler.clientHeight || scaler.getBoundingClientRect().height;
  if (!largura || !altura) return null;
  return { largura, altura, cols: Math.max(1, Math.ceil(largura / MAMUS_STATE.tabletop.gridSize)), rows: Math.max(1, Math.ceil(altura / MAMUS_STATE.tabletop.gridSize)) };
}

function obterCelulaMapaWT(xPct, yPct) {
  const d = obterDimensoesGradeWT();
  if (!d) return null;
  const x = Math.max(0, Math.min(99.999, Number(xPct) || 0)) / 100 * d.largura;
  const y = Math.max(0, Math.min(99.999, Number(yPct) || 0)) / 100 * d.altura;
  return { cx: Math.floor(x / MAMUS_STATE.tabletop.gridSize), cy: Math.floor(y / MAMUS_STATE.tabletop.gridSize) };
}

function chaveCelulaWT(cx, cy) { return `${Math.max(0, Math.floor(cx))}:${Math.max(0, Math.floor(cy))}`; }

function obterCelulaDeTokenWT(token) {
  const p = obterCoordenadasTokenWT(token);
  return p ? obterCelulaMapaWT(p.x, p.y) : null;
}

function existeParedeWT(cx, cy) {
  const k = chaveCelulaWT(cx, cy);
  return !!obterMapaTaticoWT().paredes[k];
}

function existeCoberturaWT(cx, cy) {
  const k = chaveCelulaWT(cx, cy);
  return !!obterMapaTaticoWT().coberturas[k];
}

function linhaVisadaBloqueadaWT(a, b) {
  if (!a || !b) return true;
  let x0 = Math.floor(a.cx), y0 = Math.floor(a.cy);
  const x1 = Math.floor(b.cx), y1 = Math.floor(b.cy);
  const dx = Math.abs(x1-x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1-y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (!(x0 === a.cx && y0 === a.cy) && !(x0 === b.cx && y0 === b.cy) && existeParedeWT(x0, y0)) return true;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return false;
}

function alvoTemCoberturaWT(alvo) {
  const c = obterCelulaDeTokenWT(alvo);
  return !!c && existeCoberturaWT(c.cx, c.cy);
}

function calcularDistanciaCelulasWT(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(b.cx-a.cx, b.cy-a.cy);
}

function tokenEstaNoCampoDeVisaoComLoSWT(alvo) {
  if (!alvo || !worldTriggerAtivo()) return false;
  const alvoPos = obterCoordenadasTokenWT(alvo);
  const alvoCel = alvoPos ? obterCelulaMapaWT(alvoPos.x, alvoPos.y) : null;
  if (!alvoCel) return false;
  const aliados = obterTokensDoMeuSquadWT().slice();
  const meu = obterMeuTokenWT();
  if (!aliados.length && meu) aliados.push(meu);
  const raio = Math.max(3, Math.min(20, Number(worldTriggerEstado.campoVisaoCelulas)||8));
  return aliados.some(aliado => {
    const p = obterCoordenadasTokenWT(aliado);
    const c = p ? obterCelulaMapaWT(p.x, p.y) : null;
    if (!c || calcularDistanciaCelulasWT(c, alvoCel) > raio) return false;
    return !linhaVisadaBloqueadaWT(c, alvoCel);
  });
}

function obterNivelInformacaoWT(token) {
  if (!token) return 'desconhecido';
  if (ehTokenDoMeuSquad(token)) return 'aliado';
  const scan = worldTriggerEstado.scans?.[token.id];
  if (scan?.analisado) return 'analisado';
  if (tokenEstaNoCampoDeVisaoComLoSWT(token)) return 'identificado';
  if (scan) return 'aproximado';
  if (!tokenEstaOcultoNoRadar(token)) return 'detectado';
  return 'desconhecido';
}

function serializarMapaTaticoWT() {
  return JSON.parse(JSON.stringify(obterMapaTaticoWT()));
}

function transmitirMapaTaticoWT() {
  if (!canalMesa || !obterCampanhaIdAtual()) return;
  canalMesa.send({ type:'broadcast', event:'wt_mapa_tatico', payload:{ campanha_id:obterCampanhaIdAtual(), mapaTatico:serializarMapaTaticoWT(), enviadoEm:Date.now() } });
  persistirMapaTaticoSupabaseWT();
}

async function persistirMapaTaticoSupabaseWT() {
  if (!supabaseClient || !ehMestreDaCampanhaAtual() || !obterCampanhaIdAtual()) return;
  try {
    await supabaseClient.from('mapas').update({ dados_taticos: serializarMapaTaticoWT() }).eq('campanha_id', obterCampanhaIdAtual());
  } catch (err) { console.warn('Mapa tático: coluna dados_taticos ainda não disponível ou atualização falhou.', err); }
}

async function carregarMapaTaticoSupabaseWT() {
  if (!supabaseClient || !obterCampanhaIdAtual()) return;
  try {
    const {data,error}=await supabaseClient.from('mapas').select('dados_taticos').eq('campanha_id',obterCampanhaIdAtual()).limit(1).maybeSingle();
    if (!error && data?.dados_taticos) {
      worldTriggerEstado.mapaTatico=normalizarMapaTaticoWT(data.dados_taticos);
      salvarEstadoWorldTrigger();
      renderizarObstaculosMapaWT();
      agendarRecalculoVisibilidadeWT();
    }
  } catch(err){ console.warn('Não foi possível carregar a geometria tática persistida.',err); }
}

function alternarEdicaoMapaTaticoWT() {
  if (!ehMestreDaCampanhaAtual()) return;
  const el=document.getElementById('wt-edicao-tatica');
  if (el) el.classList.toggle('ativo');
  const canvas=document.getElementById('vtt-canvas');
  if(canvas) canvas.dataset.taticaEditando=el?.classList.contains('ativo')?'true':'false';
  mostrarPopup(el?.classList.contains('ativo') ? '🧱 Edição tática ativada: clique nas células do mapa.' : '🧱 Edição tática desativada.');
}

function definirFerramentaMapaTaticoWT(tipo) {
  const host=document.getElementById('wt-edicao-tatica');
  if(!host) return;
  host.dataset.ferramenta=tipo;
  host.querySelectorAll('[data-ferramenta]').forEach(b=>b.classList.toggle('ativo',b.dataset.ferramenta===tipo));
}

function editarCelulaMapaTaticoWT(event) {
  if (!ehMestreDaCampanhaAtual()) return;
  const host=document.getElementById('wt-edicao-tatica');
  if (!host?.classList.contains('ativo')) return;
  const alvo=event.target.closest('#vtt-mapa-scaler');
  if (!alvo || event.target.closest('.vtt-token')) return;
  const rect=alvo.getBoundingClientRect();
  if(!rect.width || !rect.height) return;
  const x=((event.clientX-rect.left)/rect.width)*100;
  const y=((event.clientY-rect.top)/rect.height)*100;
  const c=obterCelulaMapaWT(x,y); if(!c) return;
  const k=chaveCelulaWT(c.cx,c.cy);
  const mapa=obterMapaTaticoWT();
  const ferramenta=host.dataset.ferramenta||'parede';
  if(ferramenta==='apagar'){ delete mapa.paredes[k]; delete mapa.coberturas[k]; }
  else if(ferramenta==='parede'){ mapa.paredes[k]={tipo:'parede',atualizadoEm:Date.now()}; delete mapa.coberturas[k]; }
  else if(ferramenta==='cobertura'){ mapa.coberturas[k]={tipo:'cobertura',atualizadoEm:Date.now()}; delete mapa.paredes[k]; }
  salvarEstadoWorldTrigger(); renderizarObstaculosMapaWT(); agendarRecalculoVisibilidadeWT(); transmitirMapaTaticoWT();
  event.preventDefault();
}

function limparMapaTaticoWT() {
  if(!ehMestreDaCampanhaAtual()) return;
  worldTriggerEstado.mapaTatico={paredes:{},coberturas:{}};
  salvarEstadoWorldTrigger(); renderizarObstaculosMapaWT(); agendarRecalculoVisibilidadeWT(); transmitirMapaTaticoWT();
  mostrarPopup('🧹 Geometria tática limpa.');
}

function renderizarObstaculosMapaWT() {
  const camada=document.getElementById('vtt-obstaculos-camada');
  const d=obterDimensoesGradeWT();
  if(!camada || !d || !worldTriggerAtivo()) return;
  const mapa=obterMapaTaticoWT();
  const cells=[];
  const add=(obj,tipo)=>Object.keys(obj||{}).forEach(k=>{
    const [cx,cy]=k.split(':').map(Number); if(!Number.isFinite(cx)||!Number.isFinite(cy)) return;
    const left=(cx*MAMUS_STATE.tabletop.gridSize/d.largura)*100, top=(cy*MAMUS_STATE.tabletop.gridSize/d.altura)*100;
    const w=(MAMUS_STATE.tabletop.gridSize/d.largura)*100, h=(MAMUS_STATE.tabletop.gridSize/d.altura)*100;
    cells.push(`<div class="wt-obstaculo ${tipo}" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%;"></div>`);
  });
  add(mapa.paredes,'parede'); add(mapa.coberturas,'cobertura');
  camada.innerHTML=cells.join('');
}

function renderizarControlesMapaTaticoWT() {
  if(!ehMestreDaCampanhaAtual()) return '';
  return `<div id="wt-edicao-tatica" data-ferramenta="parede" class="wt-edicao-tatica">
    <strong>🧱 Geometria tática</strong>
    <button type="button" data-ferramenta="parede" class="ativo" onclick="definirFerramentaMapaTaticoWT('parede')">🧱 Parede</button>
    <button type="button" data-ferramenta="cobertura" onclick="definirFerramentaMapaTaticoWT('cobertura')">🛡️ Cobertura</button>
    <button type="button" data-ferramenta="apagar" onclick="definirFerramentaMapaTaticoWT('apagar')">🧽 Apagar</button>
    <button type="button" onclick="limparMapaTaticoWT()">🗑️ Limpar</button>
    <button type="button" onclick="alternarEdicaoMapaTaticoWT()">✏️ Editar</button>
  </div>`;
}

function obterRaioCampoVisaoWT() {
  const scaler = document.getElementById('vtt-mapa-scaler');
  const largura = scaler?.clientWidth || scaler?.offsetWidth || 1000;
  const celulas = Math.max(3, Math.min(20, Number(worldTriggerEstado.campoVisaoCelulas) || 8));
  // O mapa usa coordenadas percentuais; convertemos a quantidade de casas
  // para o mesmo espaço para que o FOV acompanhe a escala do mapa.
  return Math.max(1, (celulas * MAMUS_STATE.tabletop.gridSize / largura) * 100);
}

function tokenEstaNoCampoDeVisaoWT(alvo) {
  if (!alvo || !worldTriggerAtivo()) return false;
  const alvoPos = obterCoordenadasTokenWT(alvo);
  if (!alvoPos) return false;

  // A visibilidade do World Trigger é compartilhada pelo Squad: se qualquer
  // agente aliado tiver o inimigo dentro do próprio FOV, o Squad o enxerga.
  const aliados = obterTokensDoMeuSquadWT();
  const meuToken = obterMeuTokenWT();
  if (!aliados.length && meuToken) aliados.push(meuToken);
  const raio = obterRaioCampoVisaoWT();

  return tokenEstaNoCampoDeVisaoComLoSWT(alvo);
}

function tokenFoiEscaneadoWT(token) {
  const id = typeof token === 'string' ? token : token?.id || token?.dataset?.tokenId;
  return !!id && !!worldTriggerEstado.scans?.[id];
}

function tokenEstaOcultoNoRadar(token) {
  if (!worldTriggerAtivo()) return false;
  if (ehMestreDaCampanhaAtual()) return false;
  // Bagworm remove do radar. Chameleon só pode ser encontrado pelo Scan.
  if (token?.dataset) {
    if (token.dataset.tokenChameleon === 'true') return false;
    if (token.dataset.tokenBagworm === 'true') return true;
    return false;
  }
  if (token?.chameleon) return false;
  if (token?.bagworm) return true;
  return false;
}

function tokenVisivelParaMim(token) {
  if (!worldTriggerAtivo() || ehMestreDaCampanhaAtual()) return true;
  const nome = String(token?.dataset?.tokenNome || token?.nome || '').trim().toLowerCase();
  if (nome === obterMeuNickWT().trim().toLowerCase()) return true;
  if (ehTokenDoMeuSquad(token)) return true;

  // Chameleon é invisibilidade total: FOV normal não o revela. Só o Scan.
  if ((token?.dataset?.tokenChameleon === 'true') || token?.chameleon) {
    return tokenFoiEscaneadoWT(token);
  }

  // Bagworm remove do radar, mas não vence a visão direta: dentro do FOV ele
  // aparece normalmente; fora do FOV permanece oculto.
  if ((token?.dataset?.tokenBagworm === 'true') || token?.bagworm) {
    return tokenEstaNoCampoDeVisaoWT(token) || tokenFoiEscaneadoWT(token);
  }

  // O campo de visão passa a ser a regra normal para inimigos.
  return tokenEstaNoCampoDeVisaoComLoSWT(token);
}

function atualizarVisibilidadeTodosTokensWT() {
  if (!worldTriggerAtivo()) return;
  document.querySelectorAll('.vtt-token').forEach(token => aplicarVisibilidadeTokenWT(token));
  atualizarRadarWorldTrigger();
  renderizarFovWorldTrigger();
}

function agendarRecalculoVisibilidadeWT() {
  if (!worldTriggerAtivo() || wtRecalculoVisibilidadeAgendado) return;
  wtRecalculoVisibilidadeAgendado = true;
  requestAnimationFrame(() => {
    wtRecalculoVisibilidadeAgendado = false;
    atualizarVisibilidadeTodosTokensWT();
  });
}

function atualizarRadarWorldTrigger() {
  const painel = document.getElementById('wt-radar-lista');
  const contador = document.getElementById('wt-radar-contador');
  if (!painel) return;
  const elementos = Object.values(worldTriggerEstado.tokens || {});
  const visiveis = elementos.filter(t => {
    if (!t) return false;
    if (ehMestreDaCampanhaAtual()) return true;
    return !tokenEstaOcultoNoRadar(t);
  });
  if (contador) contador.textContent = `${visiveis.length} detectado${visiveis.length === 1 ? '' : 's'}`;
  if (!visiveis.length) {
    painel.innerHTML = '<div class="wt-radar-vazio">Nenhum sinal detectado.</div>';
    return;
  }
  painel.innerHTML = visiveis.map(t => {
    const aliado = ehTokenDoMeuSquad(t);
    const escNome = escaparHTML(t.nome || 'Agente');
    const escSquad = escaparHTML(t.squad || 'Sem Squad');
    const tipo = aliado ? '🟦 Aliado' : '🔴 Sinal inimigo';
    const scan = worldTriggerEstado.scans[t.id];
    const info = obterNivelInformacaoWT(t);
    const fov = !aliado && tokenEstaNoCampoDeVisaoComLoSWT(t);
    const modo = aliado ? '👥 Aliado' : (info==='analisado' ? '🧠 Analysis' : info==='identificado' ? '👁️ Visão exata' : info==='aproximado' ? '📡 Posição aproximada' : info==='detectado' ? '📡 Detectado' : '❓ Desconhecido');
    const detalhe = scan ? `Trion ${scan.trion ?? '?'} · ${scan.padrao || 'posição aproximada'}` : (fov ? 'Posição exata' : 'Posição aproximada · radar');
    return `<div class="wt-radar-item"><strong>${tipo}</strong><span>${escNome} · ${escSquad}</span><small>${escaparHTML(detalhe)}${fov && alvoTemCoberturaWT(t) ? ' · 🛡️ cobertura' : ''}</small></div>`;
  }).join('');
}

function renderizarFovWorldTrigger() {
  const camada = document.getElementById('vtt-fov-camada');
  if (!camada || !worldTriggerAtivo()) return;
  if (ehMestreDaCampanhaAtual()) {
    camada.innerHTML = '<div class="wt-fov-mestre">👁️ Visão tática do Mestre</div>';
    return;
  }
  const raio = obterRaioCampoVisaoWT();
  const aliados = obterTokensDoMeuSquadWT();
  const domTokens = Array.from(document.querySelectorAll('.vtt-token'));
  const pontos = aliados.map(t => ({x:Number(t.x), y:Number(t.y)})).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pontos.length) {
    const meu = domTokens.find(t => String(t.dataset.tokenNome || '').trim().toLowerCase() === obterMeuNickWT().trim().toLowerCase());
    const p = obterCoordenadasTokenWT(meu);
    if (p) pontos.push(p);
  }
  camada.innerHTML = pontos.map(p => `<div class="wt-fov-circulo" style="left:${p.x}%;top:${p.y}%;width:${raio*2}%;height:${raio*2}%;"></div>`).join('');
  renderizarObstaculosMapaWT();
}

function normalizarSquadNPCsFichaWT(dados){
  const lista = Array.isArray(dados?.wt_squad_npcs) ? dados.wt_squad_npcs : [];
  return [0,1,2].map(i=>{
    const n = lista[i] || {};
    const lados = n.trigger_lados || n.wt_trigger_lados || {};
    const ativos = Array.isArray(n.triggers_ativos) ? n.triggers_ativos.map(String).filter(Boolean) : [];
    const principal = Array.isArray(lados.principal) ? lados.principal.map(String).filter(Boolean) : [];
    const secundario = Array.isArray(lados.secundario) ? lados.secundario.map(String).filter(Boolean) : [];
    const unicos = [...new Set([...ativos,...principal,...secundario])];
    return {
      indice:i,
      nome:String(n.nome||`NPC ${i+1}`),
      funcao:String(n.funcao||''),
      trion:Number(n.trion)||0,
      hpMax:Number(n.hp_max)||50,
      imagem:String(n.imagem||n.imagem_url||''),
      triggers_ativos:unicos,
      trigger_lados:{principal,secundario},
      bagwormAtivo:!!n.bagworm_ativo,
      chameleonAtivo:!!n.chameleon_ativo
    };
  });
}
function sincronizarSquadNPCsEstadoWT(dados){
  if(!worldTriggerAtivo()) return [];
  const defs=normalizarSquadNPCsFichaWT(dados);
  const runtime=Array.isArray(worldTriggerEstado.squadNpcs)?worldTriggerEstado.squadNpcs:[];
  worldTriggerEstado.squadNpcs=defs.map((n,i)=>({
    ...n,
    bagwormAtivo: runtime[i]?.bagwormAtivo ?? n.bagwormAtivo,
    chameleonAtivo: runtime[i]?.chameleonAtivo ?? n.chameleonAtivo
  }));
  salvarEstadoWorldTrigger();
  return worldTriggerEstado.squadNpcs;
}
function obterSquadNPCsWorldTrigger(){
  if((worldTriggerEstado.squadNpcs||[]).length===3) return worldTriggerEstado.squadNpcs;
  if(Array.isArray(MAMUS_STATE.character.current?.wt_squad_npcs) && MAMUS_STATE.character.current.wt_squad_npcs.length===3) return sincronizarSquadNPCsEstadoWT(MAMUS_STATE.character.current);
  return [];
}
function normalizarTriggersFichaWT(dados){
  if(!dados) return [];
  if(Array.isArray(dados.wt_triggers_ativos)) return dados.wt_triggers_ativos.map(String).filter(Boolean);
  if(typeof dados.wt_triggers_ativos==='string') return dados.wt_triggers_ativos.split(/[,;\n|]+/).map(x=>x.trim()).filter(Boolean);
  if(typeof dados.triggers_equipados==='string') return dados.triggers_equipados.split(/[,;\n|]+/).map(x=>x.trim()).filter(Boolean);
  return [];
}
async function carregarTriggersDaFichaWorldTrigger(){
  if(!worldTriggerAtivo() || !supabaseClient) return [];
  const atuais=normalizarTriggersFichaWT(MAMUS_STATE.character.current);
  if(atuais.length){
    worldTriggerEstado.triggersAtivos=atuais;
    sincronizarSquadNPCsEstadoWT(MAMUS_STATE.character.current);
    salvarEstadoWorldTrigger();
    return atuais;
  }
  try{
    const {data}=await supabaseClient.auth.getSession();
    const uid=data?.session?.user?.id;
    if(!uid || !obterCampanhaIdAtual()) return [];
    const {data:ficha,error}=await supabaseClient.from('fichas').select('dados_ficha').eq('user_id',uid).eq('campanha_id',obterCampanhaIdAtual()).maybeSingle();
    if(error || !ficha?.dados_ficha) return [];
    const triggers=normalizarTriggersFichaWT(ficha.dados_ficha);
    if(triggers.length) MAMUS_STATE.character.current=ficha.dados_ficha;
    worldTriggerEstado.triggersAtivos=triggers;
    sincronizarSquadNPCsEstadoWT(ficha.dados_ficha);
    salvarEstadoWorldTrigger();
    return triggers;
  }catch(err){ console.warn('Não foi possível carregar os Triggers da ficha:',err); return []; }
}
const ARSENAL_WORLD_TRIGGER_FALLBACK=[
  {nome:'Kogetsu',categoria:'Atacante',custoBase:1},
  {nome:'Scorpion',categoria:'Atacante',custoBase:1},
  {nome:'Raygust',categoria:'Atacante',custoBase:1},
  {nome:'Asteroid',categoria:'Artilheiro',custo:1,efeito:'Dano bruto puro'},
  {nome:'Hound',categoria:'Artilheiro',custo:2,efeito:'Projéteis seguem o alvo'},
  {nome:'Viper',categoria:'Artilheiro',custo:'2–3',efeito:'Trajetória definida pelo jogador'},
  {nome:'Meteor',categoria:'Artilheiro',custo:3,efeito:'Dano em área'},
  {nome:'Lightning',categoria:'Sniper',custo:2,efeito:'Tiro rápido, difícil de evitar'},
  {nome:'Egret',categoria:'Sniper',custo:3,efeito:'Tiro equilibrado'},
  {nome:'Ibis',categoria:'Sniper',custo:4,efeito:'Destruição massiva'},
  {nome:'Shield',categoria:'Opcional',custo:'1–2',efeito:'Cria barreira de Trion'},
  {nome:'Bagworm',categoria:'Opcional',custo:'1 por turno',efeito:'Remove usuário do radar'},
  {nome:'Chameleon',categoria:'Opcional',custo:'2 por turno',efeito:'Invisibilidade total'},
  {nome:'Spider',categoria:'Opcional',custo:2,efeito:'Cria fios no cenário'},
  {nome:'Lead Bullet',categoria:'Opcional',custo:3,efeito:'Projétil que pesa o alvo'},
  {nome:'Thruster',categoria:'Opcional',custo:2,efeito:'Impulso de movimento'},
  {nome:'Bail Out',categoria:'Especial',custo:'especial',efeito:'Retirada automática do combate'}
];
function obterDefinicaoTriggerWT(nome){
  const cfg=obterConfiguracaoSistemaAtualWT()||{};
  const a=cfg.arsenal||cfg.especial?.arsenal||{};
  const todos=[...(a.atacantes||[]),...(a.armeiros||[]),...(a.snipers||[]),...(a.opcionais||[])];
  const lista=todos.length?todos:ARSENAL_WORLD_TRIGGER_FALLBACK;
  return lista.find(t=>String(t.nome||'').toLowerCase()===String(nome||'').toLowerCase())||null;
}
function renderizarTriggersAtivosNoMapa(){
  const triggers=worldTriggerEstado.triggersAtivos||[];
  if(!triggers.length) return `<div class="wt-sem-triggers">⚠️ Nenhum Trigger equipado na ficha. Abra sua ficha e selecione seus Triggers.</div>`;
  return `<div class="wt-triggers-mapa"><strong>⚔️ Triggers da sua ficha</strong><div class="wt-triggers-mapa-lista">${triggers.map(nome=>{
    const t=obterDefinicaoTriggerWT(nome); const custo=t?.custo??t?.custoBase??'—';
    const n=escaparHTML(nome);
    if(String(nome).toLowerCase()==='bagworm') return `<button type="button" class="wt-trigger-btn ${worldTriggerEstado.bagworm?'ativo':''}" onclick="alternarBagwormWorldTrigger()">👻 ${n}${worldTriggerEstado.bagworm?' · ATIVO':''}</button>`;
    if(String(nome).toLowerCase()==='chameleon') return `<button type="button" class="wt-trigger-btn ${worldTriggerEstado.chameleon?'ativo':''}" onclick="alternarChameleonWorldTrigger()">🫥 ${n}${worldTriggerEstado.chameleon?' · ATIVO':''}</button>`;
    return `<button type="button" class="wt-trigger-btn" onclick="usarTriggerWorldTrigger('${n}')">⚔️ ${n}<small>Custo ${escaparHTML(custo)}</small></button>`;
  }).join('')}</div></div>`;
}
function usarTriggerWorldTrigger(nome){
  if(!worldTriggerAtivo()) return;
  if(!(worldTriggerEstado.triggersAtivos||[]).some(x=>String(x).toLowerCase()===String(nome).toLowerCase())) return mostrarPopup('⚠️ Esse Trigger não está equipado na sua ficha.');
  const t=obterDefinicaoTriggerWT(nome); const custo=t?.custo??t?.custoBase??'—';
  mostrarPopup(`⚔️ ${nome} está equipado. Custo: ${custo}. A mecânica específica desse Trigger será aplicada pelo módulo de combate.`);
}

function renderizarSquadNPCsNoMapaWT(){
  const npcs=obterSquadNPCsWorldTrigger();
  if(!npcs.length) return '';
  return `<div class="wt-squad-roster"><div class="wt-squad-roster-head"><strong>👥 Seu Squad — 3 NPCs</strong><small>Você controla os três agentes junto com o seu personagem.</small></div><div class="wt-squad-roster-grid">${npcs.map((n,i)=>{
    const bag=n.triggers_ativos.some(x=>x.toLowerCase()==='bagworm');
    const cham=n.triggers_ativos.some(x=>x.toLowerCase()==='chameleon');
    return `<div class="wt-npc-card"><div><strong>${escaparHTML(n.nome||`NPC ${i+1}`)}</strong><small>${escaparHTML(n.funcao||'Função não definida')} · Trion ${escaparHTML(n.trion||'?')}</small></div><div class="wt-npc-actions">${bag?`<button type="button" class="${n.bagwormAtivo?'ativo':''}" onclick="alternarBagwormNPCWorldTrigger(${i})">👻 ${n.bagwormAtivo?'ON':'OFF'}</button>`:''}${cham?`<button type="button" class="${n.chameleonAtivo?'ativo':''}" onclick="alternarChameleonNPCWorldTrigger(${i})">🫥 ${n.chameleonAtivo?'ON':'OFF'}</button>`:''}<button type="button" onclick="usarTriggerNPCWorldTrigger(${i})">⚔️ Triggers</button></div></div>`;
  }).join('')}</div></div>`;
}
function atualizarTokenNPCWorldTrigger(indice){
  const n=obterSquadNPCsWorldTrigger()[indice];
  if(!n) return;
  const nick=obterMeuNickWT(); const base=normalizarIdTokenWT(nick); const id=`token_${base}_npc_${indice+1}`;
  const token=document.getElementById(id);
  if(!token) return;
  token.dataset.tokenBagworm=String(!!n.bagwormAtivo);
  token.dataset.tokenChameleon=String(!!n.chameleonAtivo);
  token.dataset.tokenTriggers=JSON.stringify(n.triggers_ativos||[]);
  token.dataset.tokenTrion=String(n.trion||'');
  registrarTokenNoRadarWT(id,n.nome,parseFloat(token.style.left)||0,parseFloat(token.style.top)||0,worldTriggerEstado.meuSquad,!!n.bagwormAtivo,!!n.chameleonAtivo,n.trion||null,n.triggers_ativos||[]);
  aplicarVisibilidadeTokenWT(token);
  transmitirMovimentoToken(token,parseFloat(token.style.left)||0,parseFloat(token.style.top)||0);
  agendarPersistenciaToken(token, true);
}
function alternarBagwormNPCWorldTrigger(indice){
  const n=obterSquadNPCsWorldTrigger()[indice]; if(!n)return;
  if(!n.triggers_ativos.some(x=>x.toLowerCase()==='bagworm'))return mostrarPopup('⚠️ Esse NPC não possui Bagworm equipado.');
  n.bagwormAtivo=!n.bagwormAtivo; salvarEstadoWorldTrigger(); atualizarTokenNPCWorldTrigger(indice); renderizarPainelWTSeNecessario(); mostrarPopup(`👻 ${n.nome}: Bagworm ${n.bagwormAtivo?'ativado':'desativado'}.`);
}
function alternarChameleonNPCWorldTrigger(indice){
  const n=obterSquadNPCsWorldTrigger()[indice]; if(!n)return;
  if(!n.triggers_ativos.some(x=>x.toLowerCase()==='chameleon'))return mostrarPopup('⚠️ Esse NPC não possui Chameleon equipado.');
  n.chameleonAtivo=!n.chameleonAtivo; salvarEstadoWorldTrigger(); atualizarTokenNPCWorldTrigger(indice); renderizarPainelWTSeNecessario(); mostrarPopup(`🫥 ${n.nome}: Chameleon ${n.chameleonAtivo?'ativado':'desativado'}.`);
}
function usarTriggerNPCWorldTrigger(indice){
  const n=obterSquadNPCsWorldTrigger()[indice]; if(!n)return;
  const nomes=(n.triggers_ativos||[]).join(', ')||'nenhum';
  mostrarPopup(`⚔️ ${n.nome}: ${nomes}`);
}
function normalizarIdTokenWT(valor){ return String(valor||'jogador').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'') || 'jogador'; }
function obterPosicaoFormacaoNPCWT(indice, baseX, baseY){
  const offsets=[[0,0],[6,0],[0,6],[6,6]];
  const o=offsets[indice+1]||[6,6];
  return {x:Math.max(2,Math.min(98,baseX+o[0])),y:Math.max(2,Math.min(98,baseY+o[1]))};
}
function sincronizarTokensSquadWorldTrigger(baseX=10,baseY=10,tamanho=45){
  if(!worldTriggerAtivo()) return;
  const fichaNpcs=Array.isArray(MAMUS_STATE.character.current?.wt_squad_npcs)?MAMUS_STATE.character.current.wt_squad_npcs:[];
  if(fichaNpcs.length!==3) return;
  const npcs=obterSquadNPCsWorldTrigger(); if(npcs.length!==3)return;
  const nick=obterMeuNickWT(); const base=normalizarIdTokenWT(nick);
  npcs.forEach((n,i)=>{
    const pos=obterPosicaoFormacaoNPCWT(i,baseX,baseY);
    const id=`token_${base}_npc_${i+1}`;
    criarElementoToken(id,n.nome,pos.x,pos.y,tamanho,n.imagem||'',Number(n.hpMax)||50,Number(n.hpMax)||50,true,{ownerNick:nick,squad:worldTriggerEstado.meuSquad,bagworm:!!n.bagwormAtivo,chameleon:!!n.chameleonAtivo,trion:n.trion||null,triggers:n.triggers_ativos||[],tipo:'npc_squad',npcIndex:i,ownerUserId:window.usuarioAtualId||''});
    const npcToken = document.getElementById(id); if(npcToken) agendarPersistenciaToken(npcToken, true);
    if(canalMesa) canalMesa.send({type:'broadcast',event:'vtt_mover_token',payload:{id,nome:n.nome,x:pos.x,y:pos.y,tamanho,imagem:n.imagem||'',hpAtual:Number(n.hpMax)||50,hpMax:Number(n.hpMax)||50,campanha_id:obterCampanhaIdAtual(),squad:worldTriggerEstado.meuSquad||'',bagworm:!!n.bagwormAtivo,chameleon:!!n.chameleonAtivo,trion:n.trion||null,triggers:n.triggers_ativos||[],ownerNick:nick,ownerUserId:window.usuarioAtualId||'',tipo:'npc_squad',npcIndex:i}});
  });
}
function renderizarPainelWorldTrigger() {
  if (!worldTriggerAtivo()) return '';
  return `
    <div class="wt-mesa-painel" id="wt-mesa-painel">
      <div class="wt-mesa-cabecalho">
        <div><strong>🌐 World Trigger</strong><small>Campo tático</small></div>
        <span id="wt-radar-contador">0 detectados</span>
      </div>
      <div class="wt-mesa-controles">
        <label>Squad <input id="wt-meu-squad" type="text" maxlength="40" placeholder="Ex.: A-01" value="${escaparHTML(worldTriggerEstado.meuSquad || '')}"></label>
        <button type="button" onclick="salvarSquadWorldTrigger()">💾 Squad</button>
        <button type="button" onclick="scanWorldTrigger()">📡 Scan</button>
        <button type="button" onclick="analysisWorldTrigger()">🔎 Analysis</button>
        ${renderizarControlesMapaTaticoWT()}<label class="wt-fov-controle">👁️ FOV <input id="wt-fov-range" type="range" min="3" max="20" step="1" value="${worldTriggerEstado.campoVisaoCelulas || 8}" oninput="alterarCampoVisaoWorldTrigger(this.value)"> <span id="wt-fov-label">${worldTriggerEstado.campoVisaoCelulas || 8}c</span></label>
      </div>
      ${renderizarTriggersAtivosNoMapa()}
      ${renderizarSquadNPCsNoMapaWT()}
      <div class="wt-radar-lista" id="wt-radar-lista"><div class="wt-radar-vazio">Aguardando sinais...</div></div>
    </div>`;
}

function salvarSquadWorldTrigger() {
  const input = document.getElementById('wt-meu-squad');
  worldTriggerEstado.meuSquad = String(input?.value || '').trim();
  salvarEstadoWorldTrigger();
  atualizarVisibilidadeTodosTokensWT();
  mostrarPopup(worldTriggerEstado.meuSquad ? `👥 Squad definido: ${worldTriggerEstado.meuSquad}` : '👥 Squad removido.');
}

function alterarCampoVisaoWorldTrigger(valor) {
  if (!worldTriggerAtivo()) return;
  worldTriggerEstado.campoVisaoCelulas = Math.max(3, Math.min(20, Number(valor) || 8));
  const label = document.getElementById('wt-fov-label');
  if (label) label.textContent = `${worldTriggerEstado.campoVisaoCelulas}c`;
  salvarEstadoWorldTrigger();
  atualizarVisibilidadeTodosTokensWT();
}

function alternarBagwormWorldTrigger() {
  if (!worldTriggerAtivo()) return;
  if (!(worldTriggerEstado.triggersAtivos || []).some(x => String(x).toLowerCase() === 'bagworm')) return mostrarPopup('⚠️ Bagworm não está equipado na sua ficha.');
  worldTriggerEstado.bagworm = !worldTriggerEstado.bagworm;
  salvarEstadoWorldTrigger();
  atualizarEstadoTokenProprioWT();
  renderizarPainelWTSeNecessario();
  mostrarPopup(worldTriggerEstado.bagworm ? '👻 Bagworm ativado: você saiu do radar.' : '👻 Bagworm desativado.');
}

function alternarChameleonWorldTrigger() {
  if (!worldTriggerAtivo()) return;
  if (!(worldTriggerEstado.triggersAtivos || []).some(x => String(x).toLowerCase() === 'chameleon')) return mostrarPopup('⚠️ Chameleon não está equipado na sua ficha.');
  worldTriggerEstado.chameleon = !worldTriggerEstado.chameleon;
  salvarEstadoWorldTrigger();
  atualizarEstadoTokenProprioWT();
  renderizarPainelWTSeNecessario();
  mostrarPopup(worldTriggerEstado.chameleon ? '🫥 Chameleon ativado: você ficou invisível.' : '🫥 Chameleon desativado.');
}

function atualizarEstadoTokenProprioWT() {
  if (!worldTriggerAtivo()) return;
  const nick = obterMeuNickWT().trim().toLowerCase();
  document.querySelectorAll('.vtt-token').forEach(token => {
    const nome = String(token.dataset.tokenNome || '').trim().toLowerCase();
    if (nome !== nick) return;
    token.dataset.tokenSquad = worldTriggerEstado.meuSquad;
    token.dataset.tokenBagworm = String(!!worldTriggerEstado.bagworm);
    token.dataset.tokenChameleon = String(!!worldTriggerEstado.chameleon);
    token.dataset.tokenX = token.style.left.replace('%','');
    token.dataset.tokenY = token.style.top.replace('%','');
    registrarTokenNoRadarWT(token.dataset.tokenId, token.dataset.tokenNome, parseFloat(token.style.left) || 0, parseFloat(token.style.top) || 0, token.dataset.tokenSquad, token.dataset.tokenBagworm === 'true', token.dataset.tokenChameleon === 'true', token.dataset.tokenTrion || null, (() => { try { return JSON.parse(token.dataset.tokenTriggers || '[]'); } catch (err) { return []; } })());
    aplicarVisibilidadeTokenWT(token);
    transmitirMovimentoToken(token, parseFloat(token.style.left) || 0, parseFloat(token.style.top) || 0);
  });
}

function aplicarVisibilidadeTokenWT(token) {
  if (!token || !worldTriggerAtivo()) return;
  const oculto = !tokenVisivelParaMim(token);
  token.style.visibility = oculto ? 'hidden' : 'visible';
  token.style.opacity = oculto ? '0' : '1';
  token.style.pointerEvents = oculto ? 'none' : 'auto';
}

function registrarTokenNoRadarWT(id, nome, x, y, squad, bagworm, chameleon, trionAtual = null, triggers = []) {
  if (!worldTriggerAtivo()) return;
  worldTriggerEstado.tokens[id] = { id, nome, x, y, squad: squad || '', bagworm: !!bagworm, chameleon: !!chameleon, trion: trionAtual, triggers: Array.isArray(triggers) ? triggers : [] };
  agendarRecalculoVisibilidadeWT();
}

function scanWorldTrigger() {
  if (!worldTriggerAtivo()) return;
  const candidatos = Object.values(worldTriggerEstado.tokens || {}).filter(t => !ehTokenDoMeuSquad(t));
  if (!candidatos.length) return mostrarPopup('📡 Scan: nenhum inimigo detectável na mesa.');

  // O Scan é a exceção que quebra o Chameleon e pode localizar um Bagworm
  // mesmo fora do campo de visão. A descoberta é local ao operador que fez o Scan.
  const ocultos = candidatos.filter(t => tokenEstaOcultoNoRadar(t));
  const alvo = (ocultos.length ? ocultos : candidatos)[Math.floor(Math.random() * (ocultos.length ? ocultos : candidatos).length)];
  worldTriggerEstado.scans[alvo.id] = { trion: alvo.trion ?? '?', padrao: 'posição aproximada', momento: Date.now() };
  salvarEstadoWorldTrigger();
  atualizarVisibilidadeTodosTokensWT();
  mostrarPopup(`📡 Scan encontrou ${alvo.nome || 'um inimigo'} em posição aproximada.`);
  tocarSom('ping');
}

function analysisWorldTrigger() {
  if (!worldTriggerAtivo()) return;
  const candidatos = Object.values(worldTriggerEstado.tokens || {}).filter(t => !ehTokenDoMeuSquad(t));
  if (!candidatos.length) return mostrarPopup('🔎 Analysis: nenhum alvo disponível.');
  const alvo = candidatos.find(t => worldTriggerEstado.scans[t.id]) || candidatos[0];
  const trion = alvo.trion ?? '?';
  worldTriggerEstado.scans[alvo.id] = { ...(worldTriggerEstado.scans[alvo.id] || {}), trion, padrao: 'combate identificado', analisado: true, momento: Date.now() };
  salvarEstadoWorldTrigger();
  atualizarVisibilidadeTodosTokensWT();
  mostrarPopup(`🔎 Analysis: ${alvo.nome || 'alvo'} · Trion ${trion} · padrão de combate identificado.`);
}

function renderizarPainelWTSeNecessario() {
  const host = document.getElementById('wt-mesa-painel-host');
  if (host) host.innerHTML = renderizarPainelWorldTrigger();
  atualizarRadarWorldTrigger();
}

// --- FEEDBACK SONORO E TÁTIL (sem arquivos externos) ---


window.MAMUS_WT_MODULE = {
  getState: () => worldTriggerEstado,
  applyTacticalMap: (mapaTatico) => {
    if (!mapaTatico) return;
    worldTriggerEstado.mapaTatico = normalizarMapaTaticoWT(mapaTatico);
    worldTriggerEstado.ultimaSincronizacaoTatica = Date.now();
    renderizarObstaculosMapaWT();
    agendarRecalculoVisibilidadeWT();
  },
  onFichaUpdated: (dados) => {
    if (!worldTriggerAtivo()) return;
    worldTriggerEstado.triggersAtivos = normalizarTriggersFichaWT(dados);
    sincronizarSquadNPCsEstadoWT(dados);
    atualizarVisibilidadeTodosTokensWT();
  },
  isActive: () => worldTriggerAtivo(),
  persist: () => salvarEstadoWorldTrigger()
};

window.MAMUS_RPG_MODULES?.register('world_trigger', window.MAMUS_WT_MODULE);
