// ==========================================
// MaMuSBoaRD - APP.JS
// ==========================================

const SUPABASE_URL = 'https://rolrbrtpqbchyxmjmvzr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mJmJfELKk4O1HCTzoKxDdw_EWaiv4j1';

let supabaseClient = window.MAMUS_SUPABASE || null;
let dadosFichaAtual = null;
let fichaEditandoUserId = null;
let canalMesa = null;
let gridAtivo = false;
let vttZoom = 100;
let vttGridTamanho = 40;

// Variáveis de controle de Posição (Pan) e Cadeado do Mapa
let vttPanX = 0;
let vttPanY = 0;
let vttMovimentoLivre = false;
let mapaModoImersivo = false;
let audioContext = null;
let ultimoTokenInteragido = null;
let abasCarregadas = { mapa: false, galeria: false };

let centralResumoCache = { campanhaId: null, atualizadoEm: 0, dados: null };
let fichaUltimoSalvamento = null;
let fichaStatusCentral = 'sem_ficha';
let pastaGaleriaAtual = 'Todas';
let dadosGaleriaAtual = [];
let imagemMestreAberta = false;




// MaMuSBoaRD possui dois níveis de autoridade:
// 1) Mestre global (administrador da plataforma).
// 2) Mestre local (criador/responsável por uma campanha).
// O Mestre global atual é o usuário MrLepre. A função de Mestre de campanha
// continua sendo contextual: Kise, Guss ou qualquer outro usuário pode ser
// Mestre somente nas campanhas em que for o responsável.
const MASTER_GLOBAL_USER_ID = '74205e44-2c46-42ff-8ad7-4bf1881fc6af';
const MASTER_GLOBAL_EMAIL = 'mrlepre@rpg.local';
window.MASTER_GLOBAL_EMAIL = MASTER_GLOBAL_EMAIL;

function usuarioAutenticado() {
  return !!window.usuarioAtualId;
}

function ehMestreGlobal() {
  return !!window.usuarioAtualId && window.usuarioAtualId === MASTER_GLOBAL_USER_ID;
}

function ehMestreDaCampanhaAtual() {
  return ehMestreGlobal() || !!(window.usuarioAtualId && MAMUS_STATE.campaign.current?.mestre_id === window.usuarioAtualId);
}

function usuarioEhMestreDaCampanha(campanhaId) {
  if (!window.usuarioAtualId || !campanhaId) return false;
  if (ehMestreGlobal()) return true;
  const campanha = MAMUS_STATE.campaign.available.find(c => c.id === campanhaId);
  return !!(campanha && campanha.mestre_id === window.usuarioAtualId);
}

window.MAMUS_AUTH_HOOKS = {
  onUserSignedIn: async (user) => {
    atualizarInterfaceAuth(user);
    await carregarCampanhasDoUsuario(user.id);
    carregarFichaDoUsuario(user.id);
  },
  onUserSignedOut: async () => {
    dadosFichaAtual = null;
    fichaUltimoSalvamento = null;
    fichaStatusCentral = 'sem_ficha';
    limparEstadoPersistenciaTokens();
    document.getElementById('vtt-tokens-camada')?.replaceChildren();
    MAMUS_STATE.campaign.current = null;
    MAMUS_STATE.system.current = null;
    atualizarInterfaceAuth(null);
    atualizarInterfacePapelCampanha();
    aplicarTemaMesa();
    atualizarVisibilidadeAcoesRapidas();
    centralResumoCache = { campanhaId: null, atualizadoEm: 0, dados: null };
    renderizarCentralCampanha();
    garantirAbasEconomiaJornaisVisiveis();
    MAMUS_STATE.campaign.available = [];
    MAMUS_STATE.session.current = null; diarioAtual = null; diarioImagens = []; sessoesCampanha = [];
    atualizarContextoCampanha();
    renderizarListaCampanhas();
    const containerFicha = document.getElementById('container-ficha-carregada');
    if (containerFicha) containerFicha.innerHTML = '<p style=\"color: #a8a8b3;\">Faça login para visualizar sua ficha.</p>';
    mostrarPopup('Desconectado.');
  }
};

function atualizarInterfacePapelCampanha() {
  const ehMestre = ehMestreDaCampanhaAtual();
  const btnAbaSessoes = document.getElementById('btn-aba-sessoes');
  const painelMapaMestre = document.getElementById('painel-mapa-mestre');
  const painelUploadMestre = document.getElementById('painel-upload-mestre');
  const painelGaleriaMestre = document.getElementById('painel-galeria-mestre');
  if (btnAbaSessoes) btnAbaSessoes.style.display = ehMestre ? 'inline-flex' : 'none';
  if (painelMapaMestre) painelMapaMestre.style.display = ehMestre ? 'block' : 'none';
  if (painelUploadMestre) painelUploadMestre.style.display = ehMestre ? 'block' : 'none';
  if (painelGaleriaMestre) painelGaleriaMestre.style.display = ehMestre ? 'block' : 'none';
}

let diarioAtual = null;
let diarioImagens = [];
let sessoesCampanha = [];
let centralAtividades = [];
const centralAtividadesMaximas = 20;
let tokensCarregadosCampanhaId = null;
let carregandoTokensCampanhaId = null;
const timersPersistenciaTokens = new Map();

// --- WORLD TRIGGER: estado tático local (Squad / Radar / Stealth) ---
let wtRecalculoVisibilidadeAgendado = false;

let worldTriggerEstado = {
  meuSquad: '',
  bagworm: false,
  chameleon: false,
  triggersAtivos: [],
  scans: {},
  tokens: {},
  squadNpcs: [],
  campoVisaoCelulas: 8,
  mapaTatico: { paredes: {}, coberturas: {} },
  ultimaSincronizacaoTatica: 0
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
  return { largura, altura, cols: Math.max(1, Math.ceil(largura / vttGridTamanho)), rows: Math.max(1, Math.ceil(altura / vttGridTamanho)) };
}

function obterCelulaMapaWT(xPct, yPct) {
  const d = obterDimensoesGradeWT();
  if (!d) return null;
  const x = Math.max(0, Math.min(99.999, Number(xPct) || 0)) / 100 * d.largura;
  const y = Math.max(0, Math.min(99.999, Number(yPct) || 0)) / 100 * d.altura;
  return { cx: Math.floor(x / vttGridTamanho), cy: Math.floor(y / vttGridTamanho) };
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
    const left=(cx*vttGridTamanho/d.largura)*100, top=(cy*vttGridTamanho/d.altura)*100;
    const w=(vttGridTamanho/d.largura)*100, h=(vttGridTamanho/d.altura)*100;
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
  return Math.max(1, (celulas * vttGridTamanho / largura) * 100);
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
  if(Array.isArray(dadosFichaAtual?.wt_squad_npcs) && dadosFichaAtual.wt_squad_npcs.length===3) return sincronizarSquadNPCsEstadoWT(dadosFichaAtual);
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
  const atuais=normalizarTriggersFichaWT(dadosFichaAtual);
  if(atuais.length){
    worldTriggerEstado.triggersAtivos=atuais;
    sincronizarSquadNPCsEstadoWT(dadosFichaAtual);
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
    if(triggers.length) dadosFichaAtual=ficha.dados_ficha;
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
  const fichaNpcs=Array.isArray(dadosFichaAtual?.wt_squad_npcs)?dadosFichaAtual.wt_squad_npcs:[];
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
function tocarSom(tipo = 'click') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();

    const config = {
      click: { freq: 520, duration: 0.045, volume: 0.025, wave: 'sine' },
      success: { freq: 740, duration: 0.11, volume: 0.035, wave: 'triangle' },
      dice: { freq: 180, duration: 0.12, volume: 0.04, wave: 'square' },
      critical: { freq: 980, duration: 0.18, volume: 0.045, wave: 'triangle' },
      ping: { freq: 620, duration: 0.08, volume: 0.03, wave: 'sine' }
    }[tipo] || { freq: 520, duration: 0.05, volume: 0.025, wave: 'sine' };

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = config.wave;
    osc.frequency.setValueAtTime(config.freq, now);
    if (tipo === 'dice') osc.frequency.exponentialRampToValueAtTime(90, now + config.duration);
    if (tipo === 'critical') osc.frequency.exponentialRampToValueAtTime(1250, now + config.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(config.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + config.duration + 0.01);
  } catch (err) {
    // Áudio é apenas um aprimoramento; nunca deve quebrar a mesa.
  }
}

function vibrarPadrao(padrao = [18]) {
  try {
    if (navigator.vibrate) navigator.vibrate(padrao);
  } catch (err) {}
}

function atualizarStatusConexao(estado, texto) {
  const status = document.getElementById('status-conexao');
  const label = document.getElementById('status-conexao-texto');
  if (!status) return;
  status.classList.remove('online', 'offline');
  if (estado === 'online') status.classList.add('online');
  if (estado === 'offline') status.classList.add('offline');
  if (label) label.textContent = texto;
}

// Inicialização segura
try {
  supabaseClient = window.MAMUS_SUPABASE || window.MAMUS_SUPABASE_BOOT?.inicializar?.() || null;
  if (supabaseClient) window.MAMUS_SUPABASE = supabaseClient;
} catch (err) {
  console.error('Erro ao inicializar Supabase:', err);
}

function obterAbaAtualRealtime() {
  return MAMUS_STATE.ui.currentTab;
}

function aplicarMapaTaticoRecebidoRealtime(mapaTatico) {
  if (!mapaTatico) return;
  worldTriggerEstado.mapaTatico = normalizarMapaTaticoWT(mapaTatico);
  worldTriggerEstado.ultimaSincronizacaoTatica = Date.now();
  salvarEstadoWorldTrigger();
  renderizarObstaculosMapaWT();
  agendarRecalculoVisibilidadeWT();
}

window.obterAbaAtualRealtime = obterAbaAtualRealtime;
window.aplicarMapaTaticoRecebidoRealtime = aplicarMapaTaticoRecebidoRealtime;

function aplicarZoomRecebidoRealtime(zoom, panX, panY) {
  vttZoom = zoom;
  vttPanX = panX || 0;
  vttPanY = panY || 0;
  atualizarTransformMapaVTT();
}

function aplicarCalendarioRecebidoRealtime(ano, diaDoAno) {
  calendarioDados = {
    ano: Math.max(1, Number(ano) || 1),
    dia: Math.max(1, Math.min(365, Number(diaDoAno) || 1))
  };
  centralAdicionarAtividade('🗓️', `Calendário avançou para o dia ${calendarioDados.dia}`, `Ano ${calendarioDados.ano}`);
  calendarioCarregadoCampanha = obterCampanhaIdAtual();
  renderizarCalendario();
}

window.aplicarZoomRecebidoRealtime = aplicarZoomRecebidoRealtime;
window.aplicarCalendarioRecebidoRealtime = aplicarCalendarioRecebidoRealtime;

document.addEventListener('DOMContentLoaded', async () => {
  restaurarEstadoSidebar();
  inicializarInteracoesMobile();
  document.getElementById('diario-arquivos')?.addEventListener('change', adicionarImagensDiario);
  let timerAutoSaveDiario=null;
  ['diario-titulo','diario-conteudo'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{ if(!sessaoEhEditavel()) return; clearTimeout(timerAutoSaveDiario); timerAutoSaveDiario=setTimeout(()=>salvarDiarioAtual(false),1800); }));
  window.addEventListener('resize', () => {
    if (worldTriggerAtivo()) atualizarVisibilidadeTodosTokensWT();
  });
  document.body.style.overflowX = 'hidden';
  document.body.style.touchAction = 'pan-y';
  atualizarVisibilidadeAcoesRapidas();
  atualizarGruposNavegacao();
  renderizarCentralCampanha();
  setInterval(() => { if (MAMUS_STATE.ui.currentTab === 'inicio' && MAMUS_STATE.campaign.current) renderizarAtividadesCentral(); }, 60000);

  if (!supabaseClient) {
    supabaseClient = window.MAMUS_SUPABASE || window.MAMUS_SUPABASE_BOOT?.inicializar?.() || null;
  }
  if (supabaseClient) window.MAMUS_SUPABASE = supabaseClient;

  atualizarStatusConexao(supabaseClient ? 'online' : 'offline', supabaseClient ? 'Conectando à Távola...' : 'Modo local — Supabase indisponível.');
  garantirAbasEconomiaJornaisVisiveis();

  try {
    const abaSalva = localStorage.getItem('cronicas_camelot_aba');
    if (['inicio', 'ficha', 'grupo', 'mapa', 'rolagens', 'galeria', 'economia', 'jornais', 'calendario', 'diario', 'sessoes'].includes(abaSalva)) {
      mudarAba(abaSalva, abaSalva === 'rolagens' ? { __restauracaoAbaSalva: true } : undefined);
    }
  } catch (err) {}

  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      MAMUS_STATE.auth.session = session || null;
      MAMUS_STATE.auth.user = session?.user || null;
      atualizarInterfaceAuth(session?.user || null);
      garantirAbasEconomiaJornaisVisiveis();

      if (session?.user) {
        // Garante que o sistema Elarion exista antes de carregar a lista de Sistemas.
        // A versão anterior possuía a função de criação, mas nunca a executava.
        if (usuarioAutenticado()) await garantirSistemaElarion();
        await carregarCampanhasDoUsuario(session.user.id);
        carregarFichaDoUsuario(session.user.id);
      }

      // Se a aba restaurada precisar de dados remotos, carregue somente agora
      // que o Supabase está pronto.
      if (MAMUS_STATE.ui.currentTab === 'mapa' && !abasCarregadas.mapa) {
        abasCarregadas.mapa = true;
        carregarMapaAtual();
      }
      if (MAMUS_STATE.ui.currentTab === 'galeria' && !abasCarregadas.galeria) {
        abasCarregadas.galeria = true;
        carregarGaleria();
      }

      canalMesa = await globalThis.MAMUS_REALTIME?.connect(supabaseClient) || null;

      // Mapa e galeria agora carregam sob demanda, quando o jogador abre a aba.
      // Isso reduz consultas e trabalho inicial sem alterar o conteúdo dessas abas.
    } catch (err) {
      atualizarStatusConexao('offline', 'Erro de conexão');
      console.error('Erro na sessão/conexão:', err);
    }
  }
});

document.addEventListener('click', (event) => {
  const alvo = event.target.closest('button');
  if (alvo && !alvo.disabled) {
    tocarSom('click');
    vibrarPadrao([10]);
  }
});

// Botões de dados usam listeners próprios e estritos.
// Isso evita que um clique/toque que caia sobre outro elemento seja interpretado
// como uma rolagem, especialmente em navegadores móveis.
document.addEventListener('click', (event) => {
  const botaoDado = event.target.closest('.btn-dado[data-lados]');
  if (!botaoDado || botaoDado.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  const lados = Number(botaoDado.dataset.lados);
  if ([4,6,8,10,12,20,100].includes(lados)) rolarDado(lados, 'botao-dado');
}, true);

document.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName;
  const digit = event.key;
  if (digit === 'Escape') {
    fecharAcoesRapidas();
    fecharCriadorFicha();
    if (typeof fecharModalFichaGrupo === 'function') fecharModalFichaGrupo();
    const visualizador = document.getElementById('modal-visualizador-img');
    if (visualizador) visualizador.style.display = 'none';
    if (typeof fecharImagemMestre === 'function' && imagemMestreAberta) fecharImagemMestre();
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  const abas = ['ficha', 'grupo', 'mapa', 'rolagens', 'galeria'];
  const index = Number(digit) - 1;
  if (index >= 0 && index < abas.length) {
    const aba = abas[index];
    if (aba === 'rolagens') abrirAbaRolagensSegura('atalho-teclado');
    else mudarAba(aba);
  }
});

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.type !== 'cronicas-camelot-ficha-pronta') return;
  if (!event.data.dados) return;

  const foiEdicao = event.data.modo === 'edicao';
  dadosFichaAtual = event.data.dados;
  if (worldTriggerAtivo()) { worldTriggerEstado.triggersAtivos = normalizarTriggersFichaWT(dadosFichaAtual); sincronizarSquadNPCsEstadoWT(dadosFichaAtual); salvarEstadoWorldTrigger(); }
  if (foiEdicao && event.data.userId) {
    fichaEditandoUserId = event.data.userId;
  }
  fichaStatusCentral = foiEdicao ? 'salvando' : 'salvando';
  renderizarFichaNaTela(dadosFichaAtual);
  renderizarCentralCampanha();
  fecharCriadorFicha();

  const nome = dadosFichaAtual.nome || dadosFichaAtual.personagem_nome || 'Personagem';
  mostrarPopup(foiEdicao ? `💾 Ficha de ${nome} atualizada!` : `⚔️ Ficha de ${nome} criada na mesa!`);

  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await salvarFichaNoSupabase(fichaEditandoUserId);
  }
});



// --- AUTENTICAÇÃO ---
async 

async 

async 



// --- CENTRAL DE AÇÕES RÁPIDAS ---
function alternarAcoesRapidas(event) {
  if (event) event.stopPropagation();
  const container = document.getElementById('acoes-rapidas');
  const botao = document.getElementById('btn-acoes-rapidas');
  const menu = document.getElementById('menu-acoes-rapidas');
  if (!container || !botao || !menu) return;

  const aberto = container.classList.toggle('aberto');
  botao.setAttribute('aria-expanded', String(aberto));
  botao.setAttribute('aria-label', aberto ? 'Fechar ações rápidas' : 'Abrir ações rápidas');
  menu.setAttribute('aria-hidden', String(!aberto));
  // Quando fechado, os itens ficam desabilitados de verdade (não apenas invisíveis).
  menu.inert = !aberto;
  menu.querySelectorAll('button').forEach(b => { b.disabled = !aberto; });
  tocarSom(aberto ? 'success' : 'click');
  vibrarPadrao([aberto ? 14 : 8]);
}

function fecharAcoesRapidas() {
  const container = document.getElementById('acoes-rapidas');
  const botao = document.getElementById('btn-acoes-rapidas');
  const menu = document.getElementById('menu-acoes-rapidas');
  if (!container || !botao || !menu) return;
  container.classList.remove('aberto');
  botao.setAttribute('aria-expanded', 'false');
  botao.setAttribute('aria-label', 'Abrir ações rápidas');
  menu.setAttribute('aria-hidden', 'true');
  menu.inert = true;
  menu.querySelectorAll('button').forEach(b => { b.disabled = true; });
}

function focarElementoDepoisDoAba(id) {
  window.setTimeout(() => {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    elemento.focus({ preventScroll: true });
    elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
}

function abrirAbaRolagensSegura(origem = 'interno') {
  // A aba de rolagens só pode ser aberta por uma ação explicitamente autorizada.
  // Isso impede que um clique que escape de algum elemento/overlay seja interpretado
  // como comando para abrir o salão de dados.
  window.__cronicasPermitirAbaRolagens = { origem, ate: Date.now() + 1000 };
  mudarAba('rolagens', { __navegacaoRolagensAutorizada: true, origem });
}

function acaoRapida(tipo) {
  fecharAcoesRapidas();

  if (tipo === 'rolagem') {
    abrirAbaRolagensSegura('acoes-rapidas');
    focarElementoDepoisDoAba('expressao-dado');
    mostrarPopup('🎲 Salão de Rolagens aberto.');
    return;
  }

  if (tipo === 'ataque') {
    const expressao = prompt('⚔️ Ação / Ataque\n\nDigite a rolagem (ex: 1d20+5):', '1d20+0');
    if (expressao === null) return;
    const input = document.getElementById('expressao-dado');
    if (!input) return mostrarPopup('❌ Campo de rolagem não encontrado.');
    abrirAbaRolagensSegura('acao-ataque');
    input.value = expressao.trim();
    rolarExpressaoPersonalizada();
    return;
  }

  if (tipo === 'vida') {
    if (!ultimoTokenInteragido || !document.body.contains(ultimoTokenInteragido)) {
      mudarAba('mapa');
      mostrarPopup('❤️ Primeiro toque/clique em um token no mapa para selecioná-lo.');
      return;
    }

    const token = ultimoTokenInteragido;
    const nome = token.dataset.tokenNome || 'Personagem';
    const hpAtual = Number(token.dataset.tokenHpAtual) || 0;
    const hpMax = Number(token.dataset.tokenHpMax) || 50;
    const novoHpStr = prompt(`Gerenciar Vida de ${nome} (${hpAtual}/${hpMax}):\nDigite o novo valor ou ajuste com + / - (ex: -5, +5):`, hpAtual);
    if (novoHpStr === null) return;

    const valorTrim = novoHpStr.trim();
    let calculado = hpAtual;
    if (valorTrim.startsWith('+') || valorTrim.startsWith('-')) {
      calculado = Math.max(0, Math.min(hpMax, hpAtual + (parseInt(valorTrim, 10) || 0)));
    } else {
      calculado = Math.max(0, Math.min(hpMax, parseInt(valorTrim, 10) || 0));
    }

    token.dataset.tokenHpAtual = String(calculado);
    const hpTag = token.querySelector('.vtt-token-hp');
    if (hpTag) {
      hpTag.innerText = `${calculado}/${hpMax}`;
      hpTag.style.color = calculado <= (hpMax * 0.25) ? '#ff5252' : (calculado <= (hpMax * 0.5) ? '#ffab40' : '#04d361');
    }

    const x = parseFloat(token.style.left) || 0;
    const y = parseFloat(token.style.top) || 0;
    transmitirMovimentoToken(token, x, y);
    mostrarPopup(`❤️ Vida de ${nome}: ${calculado}/${hpMax}`);
    tocarSom('success');
    return;
  }

  if (tipo === 'chat') {
    mudarAba('galeria');
    mostrarPopup('💬 Chat & Galeria aberto.');
    return;
  }

  if (tipo === 'nota') {
    mudarAba('diario');
    focarElementoDepoisDoAba('diario-conteudo');
    mostrarPopup(MAMUS_STATE.session.current ? '📔 Diário da sessão aberto.' : '🕯️ O diário ficará pronto quando o Mestre iniciar uma sessão.');
    return;
  }

  if (tipo === 'mapa') {
    mudarAba('mapa');
    mostrarPopup('🗺️ Mapa aberto.');
  }
}

// Barreira de interação da Central de Ações Rápidas.
// O menu fechado não pode capturar cliques/toques mesmo que algum CSS futuro
// coloque um descendente em pointer-events:auto. A barreira roda na captura,
// antes dos handlers dos botões e dos listeners globais.
document.addEventListener('pointerdown', (event) => {
  const container = document.getElementById('acoes-rapidas');
  if (!container || container.classList.contains('aberto')) return;
  const menu = document.getElementById('menu-acoes-rapidas');
  if (menu && menu.contains(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}, true);

document.addEventListener('click', (event) => {
  const container = document.getElementById('acoes-rapidas');
  if (!container || container.classList.contains('aberto')) return;
  const menu = document.getElementById('menu-acoes-rapidas');
  if (menu && menu.contains(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}, true);

document.addEventListener('pointerdown', (event) => {
  const container = document.getElementById('acoes-rapidas');
  if (container && container.classList.contains('aberto') && !container.contains(event.target)) {
    fecharAcoesRapidas();
  }
});

// ==========================================
// ARQUITETURA MULTICAMPANHA — ETAPA 1
// ==========================================
function atualizarVisibilidadeAcoesRapidas() {
  const container = document.getElementById('acoes-rapidas');
  if (!container) return;
  container.style.display = MAMUS_STATE.campaign.current ? 'flex' : 'none';
  if (!MAMUS_STATE.campaign.current) fecharAcoesRapidas();
}

function hexParaRgb(valor) {
  const m = String(valor || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return '194,31,50';
  const h = m[1];
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
}

function obterTemaSistemaParaMesa() {
  const cfg = MAMUS_STATE.system.current?.configuracao || {};
  const tipo = String(cfg.tipo || '').toLowerCase();
  const temasPorTipo = {
    elarion: { corPrimaria:'#c89b3c', corSecundaria:'#9d6cff', corFundo:'#09080b', corPainel:'#17121b', corPainel2:'#0e0b12' },
    eter_brasas: { corPrimaria:'#d97732', corSecundaria:'#f1a15d', corFundo:'#0b0806', corPainel:'#1d130f', corPainel2:'#120e0c' },
    noctavell: { corPrimaria:'#9b5de5', corSecundaria:'#d9d9e6', corFundo:'#0d0912', corPainel:'#1a1222', corPainel2:'#100c16' },
    olimpia_pangeia: { corPrimaria:'#c9a85b', corSecundaria:'#6da8d8', corFundo:'#0b0d14', corPainel:'#151923', corPainel2:'#0d111a' },
    sobreviventes_fronteira: { corPrimaria:'#c6a15b', corSecundaria:'#a94d42', corFundo:'#0a0d0b', corPainel:'#131814', corPainel2:'#0d120f' },
    noites_em_tokyo: { corPrimaria:'#8b1e3f', corSecundaria:'#c9cbd4', corFundo:'#080a10', corPainel:'#111522', corPainel2:'#171c2b' },
    world_trigger: { corPrimaria:'#39b8ff', corSecundaria:'#7fd7ff', corFundo:'#071018', corPainel:'#0d1822', corPainel2:'#09131b' },
    legado: { corPrimaria:'#3f8cff', corSecundaria:'#d4af37', corFundo:'#070b14', corPainel:'#101725', corPainel2:'#0b101b' }
  };
  return cfg.tema || temasPorTipo[tipo] || null;
}

function aplicarCoresLogoMamus(corVermelho, corDourado) {
  const root = document.documentElement;
  if (!root) return;
  const valida = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
  const vermelho = valida(corVermelho) ? corVermelho : '#c41624';
  const dourado = valida(corDourado) ? corDourado : '#d9a52e';
  root.style.setProperty('--logo-red', vermelho);
  root.style.setProperty('--logo-gold', dourado);
}

function aplicarTemaMesa() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  const tema = MAMUS_STATE.campaign.current ? obterTemaSistemaParaMesa() : null;
  if (!MAMUS_STATE.campaign.current || !tema) {
    body.classList.remove('tema-sistema');
    body.classList.add('tema-base');
    body.removeAttribute('data-sistema-tipo');
    root.style.setProperty('--cam-bg', '#100609');
    root.style.setProperty('--cam-panel', '#16090d');
    root.style.setProperty('--cam-panel-alt', '#211016');
    root.style.setProperty('--cam-gold', '#d4af37');
    root.style.setProperty('--cam-gold-light', '#f3d075');
    root.style.setProperty('--cam-gold-dark', '#8c6d1e');
    root.style.setProperty('--cam-border', '#5b252b');
    root.style.setProperty('--cam-primary', '#ed1c14');
    root.style.setProperty('--cam-primary-rgb', '237,28,20');
    root.style.setProperty('--cam-gold-rgb', '212,175,55');
    root.style.setProperty('--tema-secondary', '#d4af37');
    aplicarCoresLogoMamus('#c41624', '#d9a52e');
    atualizarMetaThemeColor('#100609');
    return;
  }

  const valida = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
  const primaria = valida(tema.corPrimaria) ? tema.corPrimaria : '#c5a059';
  const secundaria = valida(tema.corSecundaria) ? tema.corSecundaria : primaria;
  const fundo = valida(tema.corFundo) ? tema.corFundo : '#090a0f';
  const tipo = String(MAMUS_STATE.system.current?.configuracao?.tipo || '').toLowerCase();
  const painel = valida(tema.corPainel) ? tema.corPainel : '#151821';
  const painel2 = valida(tema.corPainel2) ? tema.corPainel2 : painel;
  const rgb = hexParaRgb(primaria);

  body.classList.remove('tema-base');
  body.classList.add('tema-sistema');
  body.setAttribute('data-sistema-tipo', tipo || '');
  root.style.setProperty('--tema-primaria', primaria);
  root.style.setProperty('--tema-secundaria', secundaria);
  root.style.setProperty('--tema-fundo', fundo);
  root.style.setProperty('--tema-painel', painel);
  root.style.setProperty('--tema-painel-2', painel2);
  root.style.setProperty('--tema-primary-rgb', rgb);
  root.style.setProperty('--cam-gold-rgb', rgb);
  // O emblema MaMuS acompanha a identidade da campanha: canal vermelho = primária,
  // canal dourado = secundária. O desenho, contorno preto e proporções permanecem iguais.
  aplicarCoresLogoMamus(primaria, secundaria);
  atualizarMetaThemeColor(fundo);
}

function atualizarMetaThemeColor(cor) {
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', cor || '#100609');
}

function atualizarContextoCampanha() {
  const avisoEncerrada = document.getElementById('aviso-campanha-encerrada');
  if (avisoEncerrada) {
    if (MAMUS_STATE.campaign.current?.status === 'encerrada') {
      avisoEncerrada.style.display = 'block';
      avisoEncerrada.innerHTML = `<strong>🔒 Campanha encerrada</strong><br>Esta mesa está em modo de consulta. Os dados foram preservados e não devem ser alterados.`;
    } else {
      avisoEncerrada.style.display = 'none';
      avisoEncerrada.innerHTML = '';
    }
  }
  const contexto = document.getElementById('contexto-campanha');
  const nome = document.getElementById('campanha-ativa-nome');
  const sistema = document.getElementById('campanha-ativa-sistema');
  const papel = document.getElementById('campanha-ativa-papel');
  if (!contexto || !nome || !sistema) return;

  renderizarDashboardSistema();

  if (!MAMUS_STATE.campaign.current) {
    contexto.style.display = 'none';
    nome.textContent = 'Nenhuma campanha';
    sistema.textContent = 'Sistema: —';
    if (papel) papel.textContent = 'Papel: —';
    return;
  }

  contexto.style.display = 'flex';
  nome.textContent = MAMUS_STATE.campaign.current.nome || 'Campanha';
  sistema.textContent = `Sistema: ${MAMUS_STATE.system.current?.nome || 'Não definido'}`;
  if (papel) papel.textContent = `Papel: ${ehMestreDaCampanhaAtual() ? 'Mestre' : 'Jogador'}`;
}

function obterCampanhaIdAtual() {
  return MAMUS_STATE.campaign.current?.id || null;
}

function salvarCampanhaLocalmente() {
  try {
    if (MAMUS_STATE.campaign.current?.id) localStorage.setItem('cronicas_camelot_campanha', MAMUS_STATE.campaign.current.id);
    else localStorage.removeItem('cronicas_camelot_campanha');
  } catch (err) {}
}

async 

async 

async 

async 



async 

async function selecionarCampanha(campanhaId, mostrarFeedback = true) {
  const campanha = MAMUS_STATE.campaign.available.find(c => c.id === campanhaId);
  if (!campanha) return;

  const membro = ehMestreGlobal() || await usuarioEhMembroDaCampanha(campanhaId);
  if (!membro) {
    return solicitarEntradaCampanha(campanhaId);
  }

  MAMUS_STATE.campaign.current = campanha;
  atualizarVisibilidadeAcoesRapidas();

  // O relacionamento campanhas -> sistemas pode estar nulo/órfão em bancos
  // que foram migrados antes da criação do sistema legado de Camelot.
  // Resolva o sistema novamente pelo ID antes de abrir qualquer ficha.
  MAMUS_STATE.system.current = campanha.sistemas || null; inicializarBestiarioElarion();
  carregarEstadoWorldTrigger();
  if (!MAMUS_STATE.system.current && campanha.sistema_id && supabaseClient) {
    const { data: sistemaPorId } = await supabaseClient
      .from('sistemas')
      .select('id,nome,descricao,configuracao')
      .eq('id', campanha.sistema_id)
      .maybeSingle();
    MAMUS_STATE.system.current = sistemaPorId || null;
  }

  // Compatibilidade: a campanha original de Crônicas de Camelot usa a ficha
  // legada. Se o vínculo do sistema estiver quebrado, ainda abrimos a ficha
  // correta em vez de mandar o jogador para ficha-generica com sistema vazio.
  if (!MAMUS_STATE.system.current && /crônicas? de camelot/i.test(campanha.nome || '')) {
    MAMUS_STATE.system.current = {
      id: campanha.sistema_id || 'legacy-camelot',
      nome: 'Crônicas de Camelot',
      descricao: 'Sistema original de Crônicas de Camelot.',
      configuracao: { tipo: 'legado', ficha: 'ficha-editor.html' }
    };
  }

  // Só agora que o sistema foi resolvido carregamos o estado tático da campanha.
  carregarEstadoWorldTrigger();
  aplicarTemaMesa();
  garantirAbasEconomiaJornaisVisiveis();
  garantirAbaGuiasVisivel();

  salvarCampanhaLocalmente();
  atualizarContextoCampanha();
  centralResumoCache = { campanhaId: MAMUS_STATE.campaign.current.id, atualizadoEm: 0, dados: null };
  renderizarCentralCampanha();
  atualizarGruposNavegacao();
  renderizarListaCampanhas();

  // Limpa estados carregados de recursos da campanha anterior.
  dadosFichaAtual = null;
  fichaUltimoSalvamento = null;
  fichaStatusCentral = 'sem_ficha';
  limparEstadoPersistenciaTokens();
  abasCarregadas = { mapa: false, galeria: false };
  dadosGaleriaAtual = [];
  pastaGaleriaAtual = 'Todas';
  MAMUS_STATE.session.current = null;
  diarioAtual = null;
  diarioImagens = [];
  sessoesCampanha = [];
  centralAtividades = [];
  resetarDadosEconomiaJornalAoTrocarCampanha();
  resetarCalendarioAoTrocarCampanha();
  carregarAtividadesCentral();
  await carregarSessaoAtual();
  renderizarCentralSessao();
  renderizarAtividadesCentral();

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) carregarFichaDoUsuario(session.user.id);
  if (MAMUS_STATE.ui.currentTab === 'economia') carregarEconomiaAtual(true);
  if (MAMUS_STATE.ui.currentTab === 'jornais') carregarJornaisAtual(true);

  if (MAMUS_STATE.ui.currentTab === 'mapa') { abasCarregadas.mapa = true; carregarMapaAtual(); }
  if (MAMUS_STATE.ui.currentTab === 'galeria') { abasCarregadas.galeria = true; carregarGaleria(true); }
  if (MAMUS_STATE.ui.currentTab === 'diario') carregarDiarioAtual();
  if (MAMUS_STATE.ui.currentTab === 'sessoes' && ehMestreDaCampanhaAtual()) carregarSessoesCampanha();
  if (MAMUS_STATE.ui.currentTab === 'inicio') carregarResumoCentralCampanha(true);

  atualizarInterfacePapelCampanha();
  if (ehMestreDaCampanhaAtual()) carregarPedidosComoMestre();
  if (mostrarFeedback) mostrarPopup(`🏰 Campanha ativa: ${campanha.nome}`);
}

function renderizarListaCampanhas() {
  const lista = document.getElementById('lista-campanhas');
  if (!lista) return;
  if (!MAMUS_STATE.campaign.available.length) {
    lista.innerHTML = '<div class="estado-galeria">Nenhuma campanha disponível.</div>';
    return;
  }

  lista.innerHTML = '';
  MAMUS_STATE.campaign.available.forEach(campanha => {
    const card = document.createElement('article');
    card.className = 'card-campanha' + (MAMUS_STATE.campaign.current?.id === campanha.id ? ' ativa' : '');
    const sistema = campanha.sistemas?.nome || 'Sistema não definido';
    const encerrada = campanha.status === 'encerrada';
    const pedido = obterPedidoCampanha(campanha.id);
    const souMestre = ehMestreGlobal() || campanha.mestre_id === window.usuarioAtualId;
    const membroConhecido = MAMUS_STATE.campaign.current?.id === campanha.id || souMestre || (window.campanhasMembroIds instanceof Set && window.campanhasMembroIds.has(campanha.id));
    let acao = 'solicitarEntradaCampanha';
    let textoBotao = '📨 Solicitar entrada';
    if (MAMUS_STATE.campaign.current?.id === campanha.id) { acao = 'selecionarCampanha'; textoBotao = encerrada ? '✓ Visualizando encerrada' : '✓ Campanha ativa'; }
    else if (pedido) { acao = null; textoBotao = '⏳ Pedido pendente'; }
    else if (membroConhecido) { acao = 'selecionarCampanha'; textoBotao = encerrada ? 'Visualizar campanha encerrada' : 'Entrar nesta campanha'; }
    card.innerHTML = `
      <div class="card-campanha-conteudo">
        <span class="card-campanha-icone">🏰</span>
        <div><h3>${escaparHTML(campanha.nome)} ${encerrada ? '<span class="status-campanha encerrada">🔒 Encerrada</span>' : '<span class="status-campanha">🟢 Ativa</span>'}</h3>
        <p>${escaparHTML(campanha.descricao || 'Sem descrição.')}</p>
        <span class="card-campanha-meta">⚙️ ${escaparHTML(sistema)} · ${membroConhecido ? 'Você tem acesso' : 'Acesso mediante aprovação do Mestre'}</span></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${acao ? `<button type="button" class="btn-selecionar-campanha" onclick="${acao}('${campanha.id}')">${textoBotao}</button>` : `<button type="button" class="btn-selecionar-campanha" disabled>${textoBotao}</button>`}
        ${souMestre ? `${!encerrada ? `<button type="button" class="btn-secundario" onclick="abrirEditarCampanha('${campanha.id}', event)">✏️ Editar</button>` : ''}${encerrada ? `<button type="button" class="btn-perigo-campanha" onclick="apagarCampanha('${campanha.id}', event)">🗑️ Apagar</button>` : `<button type="button" class="btn-encerrar-campanha" onclick="encerrarCampanha('${campanha.id}', event)">🔒 Encerrar</button><button type="button" class="btn-perigo-campanha" onclick="apagarCampanha('${campanha.id}', event)">🗑️ Apagar</button>`}` : ''}
      </div>`;
    lista.appendChild(card);
  });
}

async function abrirNovaCampanha() {
  if (!usuarioAutenticado()) return mostrarPopup('❌ Faça login para criar uma campanha.');
  await prepararFormularioCampanha(null);
  const painel = document.getElementById('painel-nova-campanha');
  if (painel) painel.style.display = 'block';
  document.getElementById('nova-campanha-nome')?.focus();
}

async function prepararFormularioCampanha(campanha=null) {
  const painel = document.getElementById('painel-nova-campanha');
  const titulo = document.getElementById('titulo-form-campanha');
  const texto = document.getElementById('texto-form-campanha');
  const btn = document.getElementById('btn-salvar-campanha');
  const nome = document.getElementById('nova-campanha-nome');
  const descricao = document.getElementById('nova-campanha-descricao');
  const select = document.getElementById('nova-campanha-sistema');
  if (painel) painel.style.display = 'block';
  if (titulo) titulo.textContent = campanha ? '✏️ Editar campanha' : '🏰 Criar nova campanha';
  if (texto) texto.textContent = campanha ? 'Altere os dados da campanha. Os personagens, mapas, economia, jornais e demais recursos continuam vinculados à mesma campanha.' : 'Escolha um nome para a nova mesa. Você será o Mestre desta campanha.';
  if (campanha?.status === 'encerrada') { if (btn) btn.disabled = true; } else if (btn) { btn.disabled = false; btn.textContent = campanha ? '💾 Salvar alterações' : '⚔️ Criar Campanha'; btn.onclick = campanha ? () => salvarEdicaoCampanha(campanha.id) : criarNovaCampanha; }
  if (nome) nome.value = campanha?.nome || '';
  if (descricao) descricao.value = campanha?.descricao || '';
  if (select) {
    select.innerHTML = '<option value="">Carregando sistemas...</option>';
    const {data,error}=await supabaseClient.from('sistemas').select('id,nome,configuracao').order('nome',{ascending:true});
    if(error){ select.innerHTML='<option value="">Erro ao carregar sistemas</option>'; console.error(error); }
    else {
      select.innerHTML=(data||[]).map(s=>`<option value="${s.id}">${escaparHTML(s.nome)}${s.configuracao?.tipo==='legado'?' — legado':''}</option>`).join('');
      const preferido=campanha?.sistema_id || MAMUS_STATE.system.current?.id || (data||[]).find(s=>s.configuracao?.tipo==='legado')?.id || data?.[0]?.id;
      if(preferido) select.value=preferido;
    }
  }
}

async function abrirEditarCampanha(campanhaId, evento) {
  if (evento) { evento.preventDefault(); evento.stopPropagation(); }
  if (!usuarioEhMestreDaCampanha(campanhaId)) return;
  const campanha = MAMUS_STATE.campaign.available.find(c => c.id === campanhaId);
  if (!campanha) return mostrarPopup('❌ Campanha não encontrada.');
  await prepararFormularioCampanha(campanha);
  document.getElementById('painel-nova-campanha')?.scrollIntoView({behavior:'smooth', block:'nearest'});
  document.getElementById('nova-campanha-nome')?.focus();
}

async function salvarEdicaoCampanha(campanhaId) {
  if (!supabaseClient || !usuarioEhMestreDaCampanha(campanhaId) || !campanhaId) return;
  const nome = document.getElementById('nova-campanha-nome')?.value.trim();
  const descricao = document.getElementById('nova-campanha-descricao')?.value.trim() || '';
  const sistemaId = document.getElementById('nova-campanha-sistema')?.value || null;
  if (!nome) return mostrarPopup('❌ Informe o nome da campanha.');
  if (!sistemaId) return mostrarPopup('❌ Selecione o sistema RPG da campanha.');
  const { data, error } = await supabaseClient.from('campanhas')
    .update({ nome, descricao, sistema_id: sistemaId, updated_at: new Date().toISOString() })
    .eq('id', campanhaId)
    .select('id,nome,descricao,sistema_id,mestre_id,status,encerrada_at,created_at,updated_at,sistemas(id,nome,descricao,configuracao)')
    .single();
  if (error) return mostrarPopup('❌ Não foi possível salvar a campanha: ' + error.message);
  const idx = MAMUS_STATE.campaign.available.findIndex(c => c.id === campanhaId);
  if (idx >= 0) MAMUS_STATE.campaign.available[idx] = data;
  if (MAMUS_STATE.campaign.current?.id === campanhaId) {
    MAMUS_STATE.campaign.current = data;
    MAMUS_STATE.system.current = data.sistemas || null;
    aplicarTemaMesa();
    atualizarContextoCampanha();
    garantirAbasEconomiaJornaisVisiveis();
    resetarDadosEconomiaJornalAoTrocarCampanha();
  }
  renderizarListaCampanhas();
  fecharNovaCampanha();
  mostrarPopup(`✅ Campanha "${nome}" atualizada.`);
}

async function encerrarCampanha(campanhaId, evento) {
  if (evento) { evento.preventDefault(); evento.stopPropagation(); }
  if (!usuarioEhMestreDaCampanha(campanhaId) || !supabaseClient || !campanhaId) return;
  const campanha = MAMUS_STATE.campaign.available.find(c => c.id === campanhaId);
  if (!campanha) return mostrarPopup('❌ Campanha não encontrada.');
  if (campanha.status === 'encerrada') return mostrarPopup('🔒 Esta campanha já está encerrada.');
  const ok = confirm(`Encerrar a campanha "${String(campanha.nome || '').replace(/"/g, '\\"')}"?\n\nEla NÃO será apagada. Personagens, mapas, imagens e registros serão preservados, mas a campanha ficará bloqueada para alterações.`);
  if (!ok) return;
  const { data, error } = await supabaseClient.from('campanhas')
    .update({ status:'encerrada', encerrada_at:new Date().toISOString(), updated_at:new Date().toISOString() })
    .eq('id', campanhaId)
    .select('id,nome,descricao,sistema_id,mestre_id,status,encerrada_at,created_at,updated_at,sistemas(id,nome,descricao,configuracao)')
    .single();
  if (error) return mostrarPopup('❌ Não foi possível encerrar a campanha: ' + error.message);
  const idx = MAMUS_STATE.campaign.available.findIndex(c => c.id === campanhaId);
  if (idx >= 0) MAMUS_STATE.campaign.available[idx] = data;
  if (MAMUS_STATE.campaign.current?.id === campanhaId) {
    MAMUS_STATE.campaign.current = data;
    atualizarContextoCampanha();
    atualizarVisibilidadeAcoesRapidas();
  }
  renderizarListaCampanhas();
  mostrarPopup(`🔒 Campanha "${campanha.nome}" encerrada. Os dados foram preservados.`);
}

async function apagarCampanha(campanhaId, evento) {
  if (evento) { evento.preventDefault(); evento.stopPropagation(); }
  if (!usuarioEhMestreDaCampanha(campanhaId) || !supabaseClient || !campanhaId) return;
  const campanha = MAMUS_STATE.campaign.available.find(c => c.id === campanhaId);
  if (!campanha) return mostrarPopup('❌ Campanha não encontrada.');
  const aviso = campanha.status === 'encerrada'
    ? `APAGAR PERMANENTEMENTE a campanha "${campanha.nome}"?\n\nTodos os personagens, mapas, imagens, pedidos e demais dados vinculados serão removidos. Esta ação não pode ser desfeita.`
    : `APAGAR PERMANENTEMENTE a campanha "${campanha.nome}"?\n\nA campanha ainda está ATIVA. Todos os personagens, mapas, imagens, pedidos e demais dados vinculados serão removidos. Esta ação não pode ser desfeita.`;
  if (!confirm(aviso)) return;
  const confirmacao = prompt(`Digite APAGAR para confirmar a exclusão definitiva de "${campanha.nome}".`);
  if (confirmacao !== 'APAGAR') return mostrarPopup('❌ Exclusão cancelada.');

  // Captura arquivos da galeria antes do CASCADE do banco.
  const { data: imagens } = await supabaseClient.from('galeria_imagens').select('storage_path,publico').eq('campanha_id', campanhaId);
  if (Array.isArray(imagens)) {
    const porBucket = { galeria:[], 'galeria-privada':[] };
    imagens.forEach(img => { if (img?.storage_path) porBucket[img.publico ? 'galeria' : 'galeria-privada'].push(img.storage_path); });
    for (const bucket of Object.keys(porBucket)) {
      const paths = porBucket[bucket];
      for (let i=0;i<paths.length;i+=100) {
        const { error } = await supabaseClient.storage.from(bucket).remove(paths.slice(i,i+100));
        if (error) console.warn(`Arquivo de galeria não removido (${bucket}):`, error.message);
      }
    }
  }

  // Mapas antigos foram armazenados na raiz de galeria. Tenta remover somente o arquivo
  // referenciado pelo registro do mapa, sem tocar em outros arquivos.
  const { data: mapas } = await supabaseClient.from('mapas').select('url_mapa').eq('campanha_id', campanhaId);
  if (Array.isArray(mapas)) {
    for (const mapa of mapas) {
      const url = String(mapa?.url_mapa || '');
      const m = url.match(/\/storage\/v1\/object\/public\/galeria\/([^?]+)$/);
      if (m && /^mapa_[^/]+\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(m[1])) {
        const { error } = await supabaseClient.storage.from('galeria').remove([decodeURIComponent(m[1])]);
        if (error) console.warn('Arquivo de mapa não removido:', error.message);
      }
    }
  }

  const { error } = await supabaseClient.from('campanhas').delete().eq('id', campanhaId);
  if (error) return mostrarPopup('❌ Não foi possível apagar a campanha: ' + error.message);

  if (MAMUS_STATE.campaign.current?.id === campanhaId) {
    MAMUS_STATE.campaign.current = null;
    MAMUS_STATE.system.current = null;
    salvarCampanhaLocalmente();
    atualizarContextoCampanha();
    atualizarVisibilidadeAcoesRapidas();
    fecharAcoesRapidas();
    dadosFichaAtual = null;
    abasCarregadas = { mapa:false, galeria:false };
  }
  MAMUS_STATE.campaign.available = MAMUS_STATE.campaign.available.filter(c => c.id !== campanhaId);
  renderizarListaCampanhas();
  mostrarPopup(`🗑️ Campanha "${campanha.nome}" apagada permanentemente.`);
}

function fecharNovaCampanha() {
  const painel = document.getElementById('painel-nova-campanha');
  if (painel) painel.style.display = 'none';
  const titulo = document.getElementById('titulo-form-campanha');
  const texto = document.getElementById('texto-form-campanha');
  const btn = document.getElementById('btn-salvar-campanha');
  if (titulo) titulo.textContent = '🏰 Criar nova campanha';
  if (texto) texto.textContent = 'Escolha um nome para a nova mesa. Ela será criada separada da campanha atual.';
  if (btn) { btn.textContent = '⚔️ Criar Campanha'; btn.onclick = criarNovaCampanha; }
}

async function criarNovaCampanha() {
  if (!supabaseClient || !usuarioAutenticado()) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.user) return mostrarPopup('❌ Faça login para criar uma campanha.');

  const nomeInput = document.getElementById('nova-campanha-nome');
  const descricaoInput = document.getElementById('nova-campanha-descricao');
  const nome = nomeInput?.value.trim();
  const descricao = descricaoInput?.value.trim() || '';
  if (!nome) return mostrarPopup('❌ Informe o nome da campanha.');

  const sistemaId = document.getElementById('nova-campanha-sistema')?.value || null;
  if (!sistemaId) return mostrarPopup('❌ Selecione o sistema RPG da campanha.');

  const { data, error } = await supabaseClient
    .from('campanhas')
    .insert({ nome, descricao, sistema_id: sistemaId, mestre_id: session.user.id })
    .select('id,nome,descricao,sistema_id,mestre_id,status,encerrada_at,created_at,updated_at,sistemas(id,nome,descricao,configuracao)')
    .single();

  if (error) return mostrarPopup('❌ Não foi possível criar a campanha: ' + error.message);

  const { error: membroError } = await supabaseClient.from('campanha_membros').insert({ campanha_id: data.id, user_id: session.user.id, papel: 'mestre' });
  if (membroError) console.warn('Campanha criada, mas vínculo do Mestre falhou:', membroError.message);

  MAMUS_STATE.campaign.available.push(data);
  await selecionarCampanha(data.id);
  fecharNovaCampanha();
  if (nomeInput) nomeInput.value = '';
  if (descricaoInput) descricaoInput.value = '';
  mostrarPopup(`⚔️ Campanha "${nome}" criada com dados separados.`);
}


// ==========================================
// SISTEMAS RPG — ETAPA 3 / CONSTRUTOR VISUAL
// ==========================================
const DADOS_DISPONIVEIS_SISTEMA = ['d4','d6','d8','d10','d12','d20','d100'];
const TIPOS_CAMPO = [
  {value:'texto',label:'Texto'},
  {value:'numero',label:'Número'},
  {value:'area',label:'Texto longo'},
  {value:'checkbox',label:'Caixa de seleção'},
  {value:'select',label:'Lista de opções'}
];
const CAMPOS_SISTEMA_PADRAO = {
  atributos: [{nome:'Força', sigla:'FOR'}, {nome:'Destreza', sigla:'DES'}, {nome:'Constituição', sigla:'CON'}],
  recursos: [{nome:'Vida', sigla:'HP', tipo:'numero'}, {nome:'Energia', sigla:'EN', tipo:'numero'}],
  pericias: [{nome:'Percepção', atributo:'FOR'}],
  campos: [{nome:'História', tipo:'area'}]
};
let builderSistema = { dados: [], atributos: [], recursos: [], pericias: [], campos: [], secoes: [], especial: {} };
let builderTipoSistema = 'generico';
let builderEtapaAtual = 1;

function normalizarCampoBuilder(campo, fallbackTipo='texto') {
  return {
    id: campo?.id || ('campo_' + Math.random().toString(36).slice(2,10)),
    nome: campo?.nome || 'Novo Campo',
    sigla: campo?.sigla || '',
    tipo: campo?.tipo || fallbackTipo,
    atributo: campo?.atributo || '',
    largura: Number(campo?.largura || 1),
    obrigatorio: !!campo?.obrigatorio,
    placeholder: campo?.placeholder || '',
    valor_padrao: campo?.valor_padrao ?? '',
    opcoes: Array.isArray(campo?.opcoes) ? [...campo.opcoes] : [],
    formula: campo?.formula || '',
    calculado: !!campo?.calculado,
    rolagem: campo?.rolagem || '',
    valor_maximo: campo?.valor_maximo ?? '',
    ajuda: campo?.ajuda || ''
  };
}

function gerarCatalogoCampos() {
  return [
    ...builderSistema.atributos.map((x,i)=>({id:x.id||`atributo_${i}`, nome:x.nome, grupo:'Atributo', tipo:'numero'})),
    ...builderSistema.recursos.map((x,i)=>({id:x.id||`recurso_${i}`, nome:x.nome, grupo:'Recurso', tipo:x.tipo||'numero'})),
    ...builderSistema.pericias.map((x,i)=>({id:x.id||`pericia_${i}`, nome:x.nome, grupo:'Perícia', tipo:'numero'})),
    ...builderSistema.campos.map((x,i)=>({id:x.id||`campo_${i}`, nome:x.nome, grupo:'Campo', tipo:x.tipo||'texto'}))
  ];
}

function gerarLayoutPadrao() {
  const catalogo = gerarCatalogoCampos();
  const porGrupo = g => catalogo.filter(x=>x.grupo===g).map(x=>x.id);
  return [
    {id:'sec_identidade', titulo:'Identidade', icone:'📜', colunas:2, campos:[]},
    {id:'sec_atributos', titulo:'Atributos', icone:'🛡️', colunas:3, campos:porGrupo('Atributo')},
    {id:'sec_recursos', titulo:'Recursos', icone:'❤️', colunas:3, campos:porGrupo('Recurso')},
    {id:'sec_pericias', titulo:'Perícias', icone:'🎯', colunas:2, campos:porGrupo('Perícia')},
    {id:'sec_registro', titulo:'Registro', icone:'📚', colunas:1, campos:porGrupo('Campo')}
  ];
}

function normalizarSecao(secao) {
  return {
    id: secao?.id || ('sec_' + Math.random().toString(36).slice(2,10)),
    titulo: secao?.titulo || 'Nova seção',
    icone: secao?.icone || '◆',
    colunas: Math.min(4, Math.max(1, Number(secao?.colunas || 1))),
    campos: Array.isArray(secao?.campos) ? [...secao.campos] : []
  };
}

function iniciarBuilderSistema(config = null) {
  const c = config || CAMPOS_SISTEMA_PADRAO;
  builderTipoSistema = config?.tipo || 'generico';
  builderSistema = {
    dados: Array.isArray(config?.dados) ? [...config.dados] : ['d20'],
    atributos: Array.isArray(c.atributos) ? c.atributos.map(x=>normalizarCampoBuilder(x,'numero')) : [],
    recursos: Array.isArray(c.recursos) ? c.recursos.map(x=>normalizarCampoBuilder(x,x.tipo||'numero')) : [],
    pericias: Array.isArray(c.pericias) ? c.pericias.map(x=>normalizarCampoBuilder(x,'numero')) : [],
    campos: Array.isArray(c.campos) ? c.campos.map(x=>normalizarCampoBuilder(x,x.tipo||'texto')) : [],
    especial: config ? JSON.parse(JSON.stringify({modulos:config.modulos||{},arsenal:config.arsenal||{},rankWars:config.rankWars||{}})) : {},
    secoes: Array.isArray(config?.secoes) && config.secoes.length ? config.secoes.map(normalizarSecao) : []
  };
  if (!builderSistema.secoes.length) builderSistema.secoes = gerarLayoutPadrao();
  sincronizarIdsComLayout();
  renderizarBuilderSistema();
}

function sincronizarIdsComLayout() {
  const usados = new Set();
  ['atributos','recursos','pericias','campos'].forEach(tipo=>builderSistema[tipo].forEach((x,i)=>{
    if(!x.id || usados.has(x.id)) x.id=`${tipo.slice(0,-1)}_${Date.now().toString(36)}_${i}`;
    usados.add(x.id);
  }));
  const validos = new Set(gerarCatalogoCampos().map(x=>x.id));
  builderSistema.secoes.forEach(s=>s.campos=s.campos.filter(id=>validos.has(id)));
}

function mudarEtapaBuilder(etapa) {
  builderEtapaAtual = etapa;
  document.querySelectorAll('.builder-etapa').forEach((b,i)=>b.classList.toggle('ativo',i===etapa-1));
  document.querySelectorAll('.builder-etapa-conteudo').forEach((el,i)=>el.classList.toggle('ativo',i===etapa-1));
  if(etapa===2) renderizarSecoesBuilder();
  if(etapa===3) renderizarPreviewBuilder();
}

function abrirNovoSistema() {
  if (!usuarioAutenticado()) return;
  document.getElementById('sistema-editando-id').value = '';
  document.getElementById('titulo-editor-sistema').textContent = '⚙️ Criar novo sistema';
  document.getElementById('novo-sistema-nome').value = '';
  document.getElementById('novo-sistema-descricao').value = '';
  if(document.getElementById('sistema-cor-primaria')) document.getElementById('sistema-cor-primaria').value='#c5a059';
  if(document.getElementById('sistema-cor-fundo')) document.getElementById('sistema-cor-fundo').value='#080a0f';
  if(document.getElementById('sistema-cor-painel')) document.getElementById('sistema-cor-painel').value='#151821';
  iniciarBuilderSistema();
  mudarEtapaBuilder(1);
  document.getElementById('painel-novo-sistema').style.display = 'block';
  document.getElementById('novo-sistema-nome').focus();
}
function fecharNovoSistema() { document.getElementById('painel-novo-sistema').style.display='none'; }
function escSistema(v){ return escaparHTML(v); }

function renderizarBuilderSistema(){
  const chips=document.getElementById('builder-dados');
  if(chips) chips.innerHTML=DADOS_DISPONIVEIS_SISTEMA.map(d=>`<button type="button" class="builder-chip ${builderSistema.dados.includes(d)?'ativo':''}" onclick="alternarDadoSistema('${d}')">${d}</button>`).join('');
  renderListaBuilder('atributos'); renderListaBuilder('recursos'); renderListaBuilder('pericias'); renderListaBuilder('campos');
  sincronizarIdsComLayout();
  if(builderEtapaAtual===2) renderizarSecoesBuilder();
  if(builderEtapaAtual===3) renderizarPreviewBuilder();
}
function alternarDadoSistema(d){ builderSistema.dados=builderSistema.dados.includes(d)?builderSistema.dados.filter(x=>x!==d):[...builderSistema.dados,d]; renderizarBuilderSistema(); }
function adicionarCampoSistema(tipo){
  const defaults={atributos:{nome:'Novo Atributo',sigla:'ATR',tipo:'numero'},recursos:{nome:'Novo Recurso',sigla:'REC',tipo:'numero'},pericias:{nome:'Nova Perícia',atributo:'',tipo:'numero'},campos:{nome:'Novo Campo',tipo:'texto',ajuda:'',opcoes:[]}};
  builderSistema[tipo].push(normalizarCampoBuilder(defaults[tipo],defaults[tipo].tipo));
  sincronizarIdsComLayout(); renderizarBuilderSistema();
}
function atualizarCampoSistema(tipo,index,chave,valor){ if(builderSistema[tipo]?.[index]) builderSistema[tipo][index][chave]=valor; }
function removerCampoSistema(tipo,index){
  const campo=builderSistema[tipo][index];
  builderSistema[tipo].splice(index,1);
  if(campo?.id) builderSistema.secoes.forEach(s=>s.campos=s.campos.filter(id=>id!==campo.id));
  sincronizarIdsComLayout(); renderizarBuilderSistema();
}
function moverCampoSistema(tipo,index,direcao){
  const arr=builderSistema[tipo], novo=index+direcao;
  if(novo<0||novo>=arr.length)return;
  [arr[index],arr[novo]]=[arr[novo],arr[index]]; renderizarBuilderSistema();
}
function renderListaBuilder(tipo){
  const el=document.getElementById('builder-'+tipo); if(!el) return;
  const lista=builderSistema[tipo];
  if(!lista.length){ el.innerHTML='<div class="estado-galeria">Nenhum campo configurado.</div>'; return; }
  el.innerHTML=lista.map((item,i)=>{
    const nav=`<div class="builder-movimento"><button type="button" onclick="moverCampoSistema('${tipo}',${i},-1)" ${i===0?'disabled':''}>↑</button><button type="button" onclick="moverCampoSistema('${tipo}',${i},1)" ${i===lista.length-1?'disabled':''}>↓</button></div>`;
    const tipoSelect=`<select onchange="atualizarCampoSistema('${tipo}',${i},'tipo',this.value)">${TIPOS_CAMPO.map(t=>`<option value="${t.value}" ${item.tipo===t.value?'selected':''}>${t.label}</option>`).join('')}</select>`;
    const opcoes=(item.opcoes||[]).join(', ');
    return `<details class="builder-item-avancado" open>
      <summary><span><strong>${escSistema(item.nome||'Campo')}</strong><small>${escSistema(item.sigla||item.tipo||'campo')}</small></span><span>${nav}</span></summary>
      <div class="builder-item-corpo">
        <div class="builder-linha"><input value="${escSistema(item.nome)}" oninput="atualizarCampoSistema('${tipo}',${i},'nome',this.value);renderizarPreviewBuilder()" placeholder="Nome">
        ${tipo==='atributos'||tipo==='recursos'?`<input value="${escSistema(item.sigla||'')}" maxlength="8" oninput="atualizarCampoSistema('${tipo}',${i},'sigla',this.value)" placeholder="Sigla">`:''}
        ${tipo==='pericias'?`<input value="${escSistema(item.atributo||'')}" oninput="atualizarCampoSistema('pericias',${i},'atributo',this.value)" placeholder="Atributo relacionado">`:''}
        <button type="button" class="btn-remover-campo" onclick="removerCampoSistema('${tipo}',${i})">✕</button></div>
        <div class="builder-opcoes builder-opcoes-avancadas">
          <label>Tipo ${tipoSelect}</label>
          <label>Colunas <select onchange="atualizarCampoSistema('${tipo}',${i},'largura',this.value)">${[1,2,3,4].map(n=>`<option value="${n}" ${Number(item.largura)===n?'selected':''}>${n}</option>`).join('')}</select></label>
          <label class="builder-check"><input type="checkbox" ${item.obrigatorio?'checked':''} onchange="atualizarCampoSistema('${tipo}',${i},'obrigatorio',this.checked)"> obrigatório</label>
          <label class="builder-check"><input type="checkbox" ${item.calculado?'checked':''} onchange="atualizarCampoSistema('${tipo}',${i},'calculado',this.checked);renderizarBuilderSistema()"> calculado</label>
        </div>
        <div class="builder-opcoes builder-opcoes-avancadas">
          <label>Placeholder <input value="${escSistema(item.placeholder)}" oninput="atualizarCampoSistema('${tipo}',${i},'placeholder',this.value)"></label>
          <label>Valor padrão <input value="${escSistema(item.valor_padrao)}" oninput="atualizarCampoSistema('${tipo}',${i},'valor_padrao',this.value)"></label>
          <label>Ajuda <input value="${escSistema(item.ajuda)}" oninput="atualizarCampoSistema('${tipo}',${i},'ajuda',this.value)"></label>
          ${item.tipo==='select'?`<label>Opções <input value="${escSistema(opcoes)}" oninput="atualizarCampoSistema('${tipo}',${i},'opcoes',this.value.split(',').map(x=>x.trim()).filter(Boolean))" placeholder="Humano, Elfo, Orc"></label>`:''}
          ${item.tipo==='numero'?`<label>Valor máximo <input type="number" value="${escSistema(item.valor_maximo)}" oninput="atualizarCampoSistema('${tipo}',${i},'valor_maximo',this.value)"></label>`:''}
          ${item.calculado?`<label class="builder-formula">Fórmula <input value="${escSistema(item.formula)}" oninput="atualizarCampoSistema('${tipo}',${i},'formula',this.value)" placeholder="FOR + DES + 2"></label>`:''}
          ${item.tipo==='numero'?`<label>Rolagem <input value="${escSistema(item.rolagem)}" oninput="atualizarCampoSistema('${tipo}',${i},'rolagem',this.value)" placeholder="1d20 + FOR"></label>`:''}
        </div>
      </div>
    </details>`;
  }).join('');
}
function adicionarSecaoSistema(){
  builderSistema.secoes.push(normalizarSecao({titulo:'Nova seção',icone:'◆',colunas:1,campos:[]}));
  renderizarSecoesBuilder();
}
function removerSecaoSistema(index){ if(builderSistema.secoes.length<=1)return mostrarPopup('⚠️ O sistema precisa ter pelo menos uma seção.'); builderSistema.secoes.splice(index,1); renderizarSecoesBuilder(); }
function moverSecaoSistema(index,direcao){ const novo=index+direcao; if(novo<0||novo>=builderSistema.secoes.length)return; [builderSistema.secoes[index],builderSistema.secoes[novo]]=[builderSistema.secoes[novo],builderSistema.secoes[index]]; renderizarSecoesBuilder(); }
function atualizarSecaoSistema(index,chave,valor){ if(builderSistema.secoes[index]) builderSistema.secoes[index][chave]=chave==='colunas'?Number(valor):valor; }
function alternarCampoSecao(secaoIndex,campoId){
  const s=builderSistema.secoes[secaoIndex]; if(!s)return;
  s.campos=s.campos.includes(campoId)?s.campos.filter(x=>x!==campoId):[...s.campos,campoId];
  renderizarSecoesBuilder();
}
function renderizarSecoesBuilder(){
  const el=document.getElementById('builder-secoes'); if(!el)return;
  const catalogo=gerarCatalogoCampos();
  el.innerHTML=builderSistema.secoes.map((s,i)=>`<div class="builder-secao-card">
    <div class="builder-secao-cabecalho"><div class="builder-secao-titulo"><input class="builder-icone" value="${escSistema(s.icone)}" maxlength="3" oninput="atualizarSecaoSistema(${i},'icone',this.value)"><input value="${escSistema(s.titulo)}" oninput="atualizarSecaoSistema(${i},'titulo',this.value)" placeholder="Título da seção"></div><div class="builder-movimento"><button type="button" onclick="moverSecaoSistema(${i},-1)" ${i===0?'disabled':''}>↑</button><button type="button" onclick="moverSecaoSistema(${i},1)" ${i===builderSistema.secoes.length-1?'disabled':''}>↓</button><button type="button" onclick="removerSecaoSistema(${i})">✕</button></div></div>
    <div class="builder-secao-opcoes"><label>Colunas <select onchange="atualizarSecaoSistema(${i},'colunas',this.value)">${[1,2,3,4].map(n=>`<option value="${n}" ${s.colunas===n?'selected':''}>${n}</option>`).join('')}</select></label></div>
    <div class="builder-catalogo-campos">${catalogo.length?catalogo.map(c=>`<label class="builder-campo-toggle"><input type="checkbox" ${s.campos.includes(c.id)?'checked':''} onchange="alternarCampoSecao(${i},'${c.id}')"><span>${escSistema(c.nome)}</span><small>${c.grupo}</small></label>`).join(''):'<span class="texto-vazio">Crie componentes na etapa 1.</span>'}</div>
  </div>`).join('');
}

function renderizarPreviewBuilder(){
  const el=document.getElementById('builder-preview'); if(!el)return;
  const catalogo=gerarCatalogoCampos();
  const mapa=new Map(catalogo.map(x=>[x.id,x]));
  const identidade=`<section class="preview-secao"><h4>📜 Identidade</h4><div class="preview-grid cols-2"><div><label>Nome do Personagem</label><input placeholder="Ex.: Sir Lancelot"></div><div><label>Nível</label><input type="number" placeholder="1"></div></div></section>`;
  const secoes=builderSistema.secoes.map(s=>`<section class="preview-secao"><h4>${escSistema(s.icone)} ${escSistema(s.titulo)}</h4><div class="preview-grid cols-${s.colunas}">${s.campos.map(id=>{const c=mapa.get(id);if(!c)return '';return `<div class="preview-campo span-${Math.min(4,Number(c.largura||1))}"><label>${escSistema(c.nome)}${c.obrigatorio?' *':''}</label>${c.tipo==='area'?'<textarea rows="3" placeholder="Texto longo..."></textarea>':c.tipo==='checkbox'?'<label class="preview-checkbox"><input type="checkbox"> marcado</label>':`<input type="${c.tipo==='numero'?'number':'text'}" placeholder="${escSistema(c.placeholder||'')}">`}</div>`;}).join('')}</div></section>`).join('');
  el.innerHTML=`<div class="preview-ficha"><div class="preview-cabecalho"><h3>${escSistema(document.getElementById('novo-sistema-nome')?.value||'Novo Sistema')}</h3><p>Ficha de personagem</p></div>${identidade}${secoes||'<p class="texto-vazio">Nenhuma seção configurada.</p>'}</div>`;
}

document.addEventListener('input', function(e){
  if(e.target?.id==='novo-sistema-nome' && builderEtapaAtual===3) renderizarPreviewBuilder();
});

function criarConfiguracaoWorldTrigger(){
  const numero = (id,nome,sigla,valor='',extra={}) => ({id,nome,sigla,tipo:'numero',largura:1,obrigatorio:false,calculado:false,placeholder:'',valor_padrao:valor,ajuda:'',opcoes:[],valor_maximo:'',formula:'',rolagem:'',...extra});
  const texto = (id,nome,extra={}) => ({id,nome,tipo:'texto',largura:1,obrigatorio:false,calculado:false,placeholder:'',valor_padrao:'',ajuda:'',opcoes:[],valor_maximo:'',formula:'',rolagem:'',...extra});
  const area = (id,nome,extra={}) => ({id,nome,tipo:'area',largura:2,obrigatorio:false,calculado:false,placeholder:'',valor_padrao:'',ajuda:'',opcoes:[],valor_maximo:'',formula:'',rolagem:'',...extra});
  return {
    versao:4,
    tipo:'world_trigger',
    dados:['d6','d10'],
    modulos:{
      trion:{ativo:true,criacao:'1d10+2',multiplicador:5,limiteAcao:5,regeneracao:1,eficienciaAte:2,bonusEficiencia:1,sobrecargaApartir:5,penalidadeSobrecarga:-1},
      triggers:{ativo:true},
      squads:{ativo:true,minMembros:3,maxMembros:4},
      radar:{ativo:true},
      visibilidade:{ativo:true,porSquad:true},
      bagworm:{ativo:true,custoPorTurno:1},
      chameleon:{ativo:true,custoPorTurno:2},
      operador:{ativo:true},
      rankWars:{ativo:true},
      eventosDinamicos:{ativo:true}
    },
    arsenal:{
      atacantes:[
        {nome:'Kogetsu',categoria:'Atacante',custoBase:1,tecnicas:[['Corte Reto',1,'Ataque direto. +1 no teste se for frontal.'],['Tornado',2,'Corte em arco. Atinge múltiplos alvos próximos.'],['Senkū',4,'Corte à distância. Ignora cobertura leve.'],['Flash',3,'Avança rapidamente e ataca. Ganha prioridade na ação.']]},
        {nome:'Scorpion',categoria:'Atacante',custoBase:1,tecnicas:[['Morfia',1,'Altera a forma da lâmina livremente.'],['Agulha',2,'Ataque perfurante. +1 contra defesa.'],['Mantis',3,'Combina duas lâminas. +2 no dano.'],['Armadura Viva',2,'Forma proteção temporária.']]},
        {nome:'Raygust',categoria:'Atacante',custoBase:1,tecnicas:[['Modo Escudo',1,'Reduz dano recebido em -2.'],['Thruster',3,'Avanço explosivo.'],['Âncora',2,'Não pode ser empurrado ou derrubado.'],['Captura',3,'Prende o alvo temporariamente.']]}
      ],
      armeiros:[
        {nome:'Asteroid',custo:'1 por disparo',efeito:'dano bruto puro'},
        {nome:'Hound',custo:2,efeito:'projéteis seguem o alvo'},
        {nome:'Viper',custo:'2–3',efeito:'trajetória definida pelo jogador'},
        {nome:'Meteor',custo:3,efeito:'dano em área'}
      ],
      snipers:[
        {nome:'Lightning',custo:2,efeito:'tiro rápido, difícil de evitar'},
        {nome:'Egret',custo:3,efeito:'tiro equilibrado'},
        {nome:'Ibis',custo:4,efeito:'destruição massiva'}
      ],
      opcionais:[
        {nome:'Shield',custo:'1–2',efeito:'Cria barreira de Trion'},
        {nome:'Bagworm',custo:'1 por turno',efeito:'Remove usuário do radar'},
        {nome:'Chameleon',custo:'2 por turno',efeito:'Invisibilidade total'},
        {nome:'Spider',custo:2,efeito:'Cria fios no cenário'},
        {nome:'Lead Bullet',custo:3,efeito:'Projétil não causa dano, mas pesa o alvo'},
        {nome:'Thruster',custo:2,efeito:'Impulso de movimento'},
        {nome:'Bail Out',custo:'especial',efeito:'Retirada automática do combate'}
      ]
    },
    rankWars:{composicao:'2–4 combatentes + 1 operador',squadsSimultaneos:'3–4',objetivo:'Pontuar melhor que os outros squads',pontuacao:{abate:1,ultimaEquipe:2,assistencia:0.5,controleArea:1,execucaoTatica:1,firstBlood:1,eliminacaoLimpa:1},ambientes:{noite:'-1 percepção',neve:'reduz mobilidade',chuva:'reduz precisão',nevoa:'limita alcance'},eventos:['Blackout','Colapso de área','Interferência']},
    atributos:[],
    recursos:[
      numero('trion_atual','Trion Atual','TRION',0,{valor_maximo:1000,ajuda:'Recurso de combate. Regenera 1 por turno.'}),
      numero('trion_maximo','Trion Máximo','TRION MAX',0,{calculado:true,formula:'TRION_BASE * 5',ajuda:'Resultado inicial de Trion multiplicado por 5.'}),
      numero('trion_base','Resultado de Trion','TRION BASE',0,{ajuda:'Resultado de 1d10 + 2 usado para determinar o Trion.'})
    ],
    pericias:[],
    campos:[
      texto('squad','Squad',{ajuda:'Equipe do agente. Aliados do mesmo Squad podem compartilhar informações.'}),
      texto('funcao','Função',{placeholder:'Atacante, Artilheiro, Sniper, Operador...'}),
      texto('estilo_squad','Estilo do Squad',{placeholder:'Ofensiva, Defensiva, Tática, Móvel ou Híbrida'}),
      area('objetivo','Objetivo do personagem',{largura:2}),
      area('medo','Medo',{largura:2}),
      area('limite','Limite',{largura:2}),
      area('side_effect','Side Effect',{largura:2,ajuda:'Vantagem especial do agente.'}),
      area('side_effect_limitacao','Limitação do Side Effect',{largura:2,ajuda:'Todo Side Effect deve possuir uma limitação obrigatória.'}),
      area('triggers_equipados','Triggers equipados',{largura:2,placeholder:'Liste os Triggers utilizados pelo agente.'})
    ],
    secoes:[
      {titulo:'Identidade do Agente',icone:'🧑‍✈️',colunas:2,campos:['squad','funcao','estilo_squad']},
      {titulo:'Trion',icone:'🔋',colunas:3,campos:['trion_base','trion_maximo','trion_atual']},
      {titulo:'Perfil',icone:'🎭',colunas:2,campos:['objetivo','medo','limite','side_effect','side_effect_limitacao']},
      {titulo:'Arsenal',icone:'⚔️',colunas:1,campos:['triggers_equipados']}
    ],
    tema:{corPrimaria:'#39b8ff',corFundo:'#071018',corPainel:'#0d1822'},
    ficha:'ficha-generica.html'
  };
}

function criarConfiguracaoNoitesEmTokyo(){
  const attrs=[['FOR','Força'],['AGI','Agilidade'],['CON','Constituição'],['INT','Inteligência'],['SAB','Sabedoria'],['CAR','Carisma'],['FOME','Fome']];
  return {versao:1,tipo:'noites_em_tokyo',dados:['d6','d10','d100'],descricao:'RPG urbano de Ghouls, CCG, Kagunes, Quinques, Aratas e sobrevivência em Tokyo.',modulos:{atributos:true,origens:true,kagunes:true,fome:true,rc:true,kakuja:true,ccg:true,quinques:true,aratas:true,sanidade:true,combate:true},regras:{atributos:{lista:attrs.map(x=>({sigla:x[0],nome:x[1]})),distribuicao:'Definida pelo Mestre'},derivados:{ca:'10 + MOD. AGI',vida:'20 + CON × 2',fadiga:'5 + MOD. CON',iniciativa:'2d10 + MOD. AGI'},testes:'2d10 + modificador do atributo',combate:{movimento:'6 metros',turno:'1 Ação + 1 Movimento + 1 Reação',ataque:'2d10 + modificador contra CA',desarmado:'1d6 + MOD. FOR',critico:'10+10',falha_critica:'1+1',incapacitado:'0 PV; testes de sobrevivência; 3 sucessos estabilizam, 3 falhas resultam em morte'},kagunes:{tipos:[{nome:'Ukaku',bonus:'+2 Agilidade',especializacao:'Ataques à distância',limitacao:'Baixa resistência'},{nome:'Koukaku',bonus:'+2 Resistência',especializacao:'Grande defesa',limitacao:'Movimentos lentos'},{nome:'Rinkaku',bonus:'+2 Regeneração',especializacao:'Alto dano',limitacao:'Instável emocionalmente'},{nome:'Bikaku',bonus:'+1 nos atributos físicos',especializacao:'Equilibrado',limitacao:'Nenhuma extrema'}],ciclo:'Ukaku > Bikaku > Rinkaku > Koukaku > Ukaku'},one_eye:'1d100; 96–100; +2 atributos físicos',fome:'Cada missão sem alimentação +1; pode causar Frenesi',rc:{faixas:[['0–999','Ghoul Iniciante'],['1.000–2.999','Ghoul Experiente'],['3.000–5.999','Ghoul Forte'],['6.000–9.999','Elite'],['10.000–14.999','Semi-Kakuja'],['15.000+','Kakuja Completa']]},kakuja:{estagios:['Kakuja Parcial','Kakuja Completa — Armadura','Kakuja Completa — Monstruosa'],controle:'Ao ativar Semi-Kakuja, teste de Vontade; falha causa Frenesi'},ccg:{arquetipos:['Investigador de Campo','Analista','Rastreador','Executor','Especialista Quinque','Comandante'],quinques:['Kurotsuki','Shirabe','Kitsune','Guren','Kagami','Tensei'],arata:['Arata Proto','Arata II','Arata Joker','Arata Proto II']},quinque_progressao:['Familiaridade','Proficiência','Especialização','Maestria','Sincronia']},tema:{corPrimaria:'#8b1e3f',corSecundaria:'#c9cbd4',corFundo:'#080a10',corPainel:'#111522',corPainel2:'#171c2b'},ficha:'ficha-noites-em-tokyo.html'};
}
async function garantirSistemaNoitesEmTokyo(){
  if(!usuarioAutenticado()||!supabaseClient)return;
  const {data,error}=await supabaseClient.from('sistemas').select('id').eq('nome','Noites em Tokyo').limit(1);
  if(error||data?.length)return;
  const session=(await supabaseClient.auth.getSession()).data.session;if(!session)return;
  const cfg=criarConfiguracaoNoitesEmTokyo();
  const r=await supabaseClient.from('sistemas').insert({nome:'Noites em Tokyo',descricao:'Ghouls, CCG, Kagunes, Quinques, Aratas, Fome, RC e Kakuja.',configuracao:cfg,criado_por:session.user.id});
  if(r.error)console.warn('Noites em Tokyo não pôde ser criado automaticamente:',r.error.message);
}

function criarConfiguracaoElarion(){
  const attrs=[['FOR','Força'],['CON','Constituição'],['AGI','Agilidade'],['VON','Vontade'],['INT','Inteligência'],['CAR','Carisma'],['PER','Percepção'],['FÉ','Fé']];
  return {versao:1,tipo:'elarion',dados:['d10','d12'],modulos:{joias:{ativo:true,quantidade_limite:false},luvas:{ativo:true},classes:{ativo:true},racas:{ativo:true},coracao:{dados:3},inspiracao:{max:3},testes:{dados:'2d10'},fadiga:{pf_minimo:5}},regras:{atributos:attrs.map(x=>({sigla:x[0],nome:x[1],base:1,max_inicial:5})),progressao_xp:[0,100,300,600,1000,1500,2100,2800,3600,4500,5500,6600,7800,9100,10500,12000,13600,15300,17100,19000],classes:['Espadachim Rúnico','Guardião Prismático','Arqueiro Elemental','Teurgo Cristalino','Sombra Lapidada','Berserker do Núcleo','Bardo da Inspiração','Místico Mentalista'],portadores_puros:['Punho Elemental','Condutor do Núcleo','Avatar do Vazio','Mestre da Luz Interior','Punho da Ruína','Tecedor Temporal'],racas:['Humano','Elfo','Orc','Khajiit','Lizardmen','Anões','Povo-Fera'],tf:'CON + VON + Nível',pf_minimo:5,teste:'2d10 + modificador vs CD',coracao:'3 dados; 1d12 para feitos impossíveis',inspiracao:'0–3'},tema:{corPrimaria:'#c89b3c',corFundo:'#09080b',corPainel:'#17121b'},ficha:'ficha-elarion.html'};
}

function criarConfiguracaoNoctavell(){
  const attrs=[['PRES','Presença'],['VON','Vontade'],['INS','Instinto'],['OCU','Ocultismo'],['COR','Corrupção']];
  return {
    versao:2,tipo:'noctavell',dados:['d6'],
    modulos:{dado_do_veu:true,nome_verdadeiro:true,pactos:true,contratos:true,entidades:true,artefatos_jurados:true,fluxo_vivo:true,sanidade:true,feridas_folego:true,imersao:true,arcântria:true,trabalhos:true,batidas_do_veu:true,marcadores_interesse:true,diario:true},
    regras:{
      atributos:{pontos_iniciais:15,minimo:1,maximo:5,lista:attrs.map(x=>({sigla:x[0],nome:x[1]}))},
      dado_veu:{tipo:'d6',faces:{1:{simbolo:'⚖️',nome:'Equilíbrio',efeito:'Sucesso parcial com custo.'},2:{simbolo:'🔥',nome:'Ruptura',efeito:'Sucesso forte, mas com tensão ou risco oculto.'},3:{simbolo:'🌑',nome:'Silêncio',efeito:'Falha. Nada acontece ou o efeito se anula.'},4:{simbolo:'🔯',nome:'Eco',efeito:'Efeito secundário inesperado.'},5:{simbolo:'🔑',nome:'Verdade',efeito:'Sucesso total com elegância.'},6:{simbolo:'👁️',nome:'Olho do Véu',efeito:'Sucesso crítico + revelação ou conhecimento oculto.'}}},
      nome_verdadeiro:{efeitos:['Contrato profundo mais poderoso e permanente','Rastreamento/compulsão sem resistência','Maldições e selamentos dobram de intensidade','Artefatos jurados ligados à alma','Convocação arcana da alma','Traição permite selar promessas contra o portador'],protecao:['Esconder','Selar em objeto','Trocar parcialmente','Escrever em código'],troca:{custo_minimo:3,local:'Corte de Cera',invalidar_promessas:true,resetar_corrupcao:true}},
      pacto_interno:{limite_ativo:1,niveis:{1:{risco:'Fôlego/inconsciência',poder:'bônus específico/resistência momentânea'},2:{risco:'atributo/memória',poder:'magias exclusivas/sentidos arcanos'},3:{risco:'voz/visão/identidade',poder:'forças elementais ou emocionais'},4:{risco:'morte/alma aprisionada',poder:'manipular o Véu/desafiar entidades'}}},
      contratos:{simultaneos:3,graus:{I:'Sussurros',II:'Cicatrizes Leves',III:'Pactos em Perigo',IV:'Contrapromessas',V:'Peso do Véu'},campos_oficiais:['beneficio','gatilho','limites','alvos_alcance','custo','risco','proibicoes','prova_validacao','quebra_penalidade','excecoes','preco','prazo']},
      magia_basica:{nome:'Fluxo Vivo',usos_por_cena:3,extra_com_custo:true,limites_minimos:2,limites:['Alcance curto','Curta duração','Afeta apenas 1 coisa','Precisa de gesto ou palavra','Interrompível'],nao_causa_dano_significativo:true,nao_supera_arma_comum:true},
      sacrificios:{leve:'1 ponto de Vida/sangue ou objeto querido — +1 dado ou vantagem simbólica',medio:'memória ou segredo — estende duração ou torna ritual',forte:'mutilação, juramento grave ou quebra de laço — equivale a magia de pacto por 1 cena',critico:'valor/princípio/parte da alma — efeito épico com marca ou trauma permanente'},
      combate:{iniciativa_fixa:false,estrutura:'declaração de intenção + Dado do Véu',resistencia_morte:'Vontade + Dado do Véu',foco:'narrativo'},
      folego:{inicial:5,maximo:8,recuperacao:1,regra_zero:'próximo acerto real gera Ferida'},
      feridas:{tipos:{Leve:'corte/contusão/queimadura superficial',Grave:'fratura/perfuração/hemorragia/queimadura ampla',Mortal:'órgão atingido/hemorragia interna/trauma cerebral'},regra_morte:'3 Feridas ou 1 Mortal matam humano sem ajuda imediata'},
      sanidade:{inicial:6,colapso:0,apos_colapso:3,causas:['entidade verdadeira','Ferida Mortal','verdade proibida','quebra de contrato mental','magia além da compreensão','sonho de Arcântria sem preparo'],colapso:['Catatonia','Paranoia','Delírio','Autodestruição','Possessão Passiva'],recuperacao:['Descanso profundo +1','Conexão emocional +1 (1x/sessão)','Ritual de purificação +2','Quebrar pacto mentalmente corrosivo +1']},
      imersao:{maximo:3,ganho_por_cena:1,usos:['Rerrolagem','Bônus Narrativo','Insight Arcano','Mitigação de Consequência']},
      arcântria:{locais:['Saguão do Véu','Arquivo das Quebras','Contrafluxo','Corte de Cera','Portaria das Entidades'],regras:['Promessas ditas ali têm validade','Nenhuma agressão direta','O Véu escuta sempre']},
      moedas_arcantria:{ganhos:['Cumprir contrato temporário +1','Manter contrato fixo (3 sessões) +1','Cumprir termo oculto +1','Renegociar com sucesso +1','Salvar outro jogador de pacto fatal +1 compartilhado'],gastos:['1 +1 atributo (máx 5)','1 adicionar cláusula','2 novo pacto','2 reduzir 1 Corrupção','3 contrato personalizado','3 ritual avançado','4 Marca do Véu permanente']},
      trabalhos:{recebimento:['envelope selado','símbolo em sonho','telefonema sem voz','murmúrio nas paredes'],graus:{I:'Sussurros',II:'Cicatrizes Leves',III:'Pactos em Perigo',IV:'Contrapromessas',V:'Peso do Véu'},quebra:{Leve:'Marca do Véu/perda de influência',Média:'maldição menor/dívida com Arcântria',Grave:'caçado pela Corte de Cera ou entidade',Total:'perda do Nome Verdadeiro ou alma selada'}},
      imersao_roleplay:{batidas:['Preparação','Confronto','Clímax','Desfecho'],interesse_limite:3,ganho_interesse:1,gancho_em:3,diario:['medo','memoria','eco']}
    },
    tema:{corPrimaria:'#9b7b48',corFundo:'#09090c',corPainel:'#15141a'},ficha:'ficha-noctavell.html',entidades_arquivo:'entidades-noctavell.json'
  };
}
async function garantirSistemaNoctavell(){
  if(!usuarioAutenticado()||!supabaseClient)return;
  const {data,error}=await supabaseClient.from('sistemas').select('id').eq('nome','Noctavell').limit(1);
  if(error||data?.length)return;
  const session=(await supabaseClient.auth.getSession()).data.session;if(!session)return;
  const cfg=criarConfiguracaoNoctavell();
  const r=await supabaseClient.from('sistemas').insert({nome:'Noctavell',descricao:'RPG contemporâneo ocultista de pactos, contratos, entidades e consequências do Véu.',configuracao:cfg,criado_por:session.user.id});
  if(r.error)console.warn('Noctavell não pôde ser criado automaticamente:',r.error.message);
}

function criarConfiguracaoEterBrasas(){
  const attrs=[['FOR','Força'],['AGI','Agilidade'],['VIT','Vitalidade'],['INT','Intelecto'],['VON','Vontade'],['CAR','Carisma']];
  const pericias=['Armas Brancas','Armas de Impacto','Armas de Distância','Armas de Fogo','Artes Marciais','Montaria de Combate','Canalização Mágica','Técnica Única','Magia Elemental','Magia de Suporte','Magia de Encantamento','Magia de Invocação','Forja & Metalurgia','Arcanotécnica','Alquimia','Herborismo','Medicina','História & Tradições','Investigação','Furtividade','Percepção','Sobrevivência Selvagem','Navegação','Lábia (Blefe)','Resistência','Carisma','Diplomacia','Intimidação','Enganação','Etiqueta Nobre','Mercado & Negócios','Arte & Música','Jogos & Sorte','Acrobacia','Truques Criminosos'];
  const armas=[['Punhal','1d6'],['Espada curta','1d8'],['Espada longa / Lança / Machado','1d10'],['Martelo pesado','1d10'],['Arco','1d8'],['Besta','1d10'],['Revólver','1d10'],['Rifle','1d12']];
  const moedas=[['Lúmen','Ł','Brassanthium'],['Króna','Kr','Frostheim'],['Drom','Ð','Zerathis'],['Cogmark','⚙','Altherion'],['Folha','♣',"Kael'Thir"],['Astreel','✦','Astra'],['Koban','Ꝏ','Kuroshida'],['Vargr','Vm','Drosgard'],['Coroa de Ferro','IC','Valmorra'],['Lunis','☾','Lunareth'],['Dobrão','Db','Drakenshore']];
  return {versao:1,tipo:'eter_brasas',dados:['d10','d12'],modulos:{testes_2d10:true,tecnica_magica_unica:true,guildas:true,reinos:true,inspiracao:true,impulso_pressao:true,maldição_compartilhada:true,bestiario:true,moedas:true,calendario:true},regras:{atributos:attrs.map(x=>({sigla:x[0],nome:x[1],base:0,min_inicial:-1,max_inicial:4,modificador:'igual ao valor'})),criacao:{pontos_atributos:10,pericias_treinadas:5,bonus_treinada:2,bonus_especialista:4},testes:{formula:'2d10 + Atributo + Perícia',cds:{facil:10,moderado:14,dificil:18,lendario:22},critico_sucesso:'dois 10 (20 natural)',critico_falha:'dois 1 (2 natural)',impulso:'3d10, soma os 2 maiores',pressao:'3d10, soma os 2 menores'},combate:{acao:'1 Ação',movimento:'1 Movimento até ~9m',menor:'1 Ação Menor',reacao:'1 Reação',iniciativa:'2d10 + Agilidade',defesa:'12 + Agilidade + escudo + cobertura'},sobrevivencia:{pv_inicial:'10 + Vitalidade',pv_por_nivel:'+5 + Vitalidade',fome:'0–5',sede:'0–3',cansaco:'0–4'},pericias,armas,armaduras:[['Leve','+1'],['Média','+2'],['Pesada','+3']],moedas},tema:{corPrimaria:'#d97732',corFundo:'#100a07',corPainel:'#241712'},ficha:'ficha-eter-brasas.html',bestiario_arquivo:'bestiario-eter-brasas.json',moedas_arquivo:'moedas-eter-brasas.json'};
}
async function garantirSistemaEterBrasas(){
  if(!usuarioAutenticado()||!supabaseClient)return;
  const {data,error}=await supabaseClient.from('sistemas').select('id').eq('nome','Éter & Brasas').limit(1);
  if(error||data?.length)return;
  const session=(await supabaseClient.auth.getSession()).data.session;if(!session)return;
  const cfg=criarConfiguracaoEterBrasas();
  const r=await supabaseClient.from('sistemas').insert({nome:'Éter & Brasas',descricao:'RPG 2d10 de mundo aberto, guildas e Técnicas Mágicas Únicas.',configuracao:cfg,criado_por:session.user.id});
  if(r.error)console.warn('Éter & Brasas não pôde ser criado automaticamente:',r.error.message);
}

function criarConfiguracaoSobreviventes(){
  return {
    versao:1,
    tipo:'sobreviventes_fronteira',
    descricao:'Sistema de alta letalidade com progressão dupla, Grau de Linhagem, treinamento, ciclos temporais e Moldagem de Mana.',
    dados:['d4','d6','d8','d10','d12','d20'],
    modulos:{atributos:true,racas:true,classes:true,linhagem:true,treinamento:true,combate:true,postura:true,ciclo_temporal:true,memoria:true,miasma:true,moldagem_mana:true,orbita_matriz:true,pontos_presenca:true,equipamentos:true,mercado_negro:true},
    atributos:[['FOR','Força'],['AGI','Agilidade'],['CON','Constituição'],['INT','Inteligência'],['PER','Percepção'],['VON','Vontade'],['FUR','Furtividade']],
    racas:['Humano','Homens-Rã','Gigante','Meio-Dragão','Fada','Anão','Homem-Fera','Meio-Humano'],
    classes:['Assassino Mecânico','Bárbaro da Vanguarda','Inquisidor Pugilista','Rompe-Linhas','Guerreiro Preguiçoso','Ladino das Sombras','Pioneiro','Mágico','Curandeiro','O Sem Talento'],
    regras:{
      testes:'1d20 + valor puro do atributo, limitado pelo teto do Grau de Linhagem',
      criacao:{pontos_atributos:20,teto_inicial:5},
      grau:{faixas:[{graus:'1-5',teto:3,titulo:'Soldado Raso'},{graus:'6-10',teto:5,titulo:'Escudeiro'},{graus:'11-15',teto:8,titulo:'Proto-Cavaleiro'},{graus:'16-19',teto:12,titulo:'Cavaleiro da Fronteira'},{graus:'20',teto:null,titulo:'O Ápice'}]},
      muralhas:[{transicao:'5->6',nome:'Muralha de Aço',treinos:50,atributo:5},{transicao:'10->11',nome:'Barreira Biológica',treinos:100,atributo:8},{transicao:'15->16',nome:'Muralha Conceitual',treinos:200,atributo:12}],
      combate:{acoes:['Ação Principal','Ação de Movimento','Ação Bônus','Reação'],ca:'10 + Modificador de Agilidade + Armadura + Escudo + Bônus Racial',postura:'CON + VON',guarda_quebrada:'CA -4, sem Reações; crítico automático possível para Assassino Mecânico/Ladino'},
      recursos:{pf:'10 + (CON + VON) * 2',pm:'10 + (INT + VON) * 2'},
      ciclo:{retorno:true,memoria:true,tipe_wipe:true},
      orbita:{titulo:'ÓRBITAS DA MATRIZ: FREQUÊNCIAS DO SOBREVIVENTE',regra_geral:'NÃO UTILIZE FORMATOS HEXAGONAIS',centro:'O NÚCLEO VAZIO (EIXO DISTORCIDO)',frequencias:[{nome:'SUPREMACIA CORPOREAL',posicao_visual:'Topo / Norte',conexoes:[['ALQUIMIA VIBRACIONAL',1,'Afinidade Vizinhança'],['PROJEÇÃO VETORIAL',1,'Afinidade Vizinhança'],['ARQUITETURA CONVENIENTE',2,'Afinidade Distante'],['PULSO DE SUBMISSÃO',2,'Afinidade Distante']]},{nome:'ALQUIMIA VIBRACIONAL',posicao_visual:'Esquerda Superior / Noroeste',conexoes:[['SUPREMACIA CORPOREAL',1,'Afinidade Vizinhança'],['ARQUITETURA CONVENIENTE',1,'Afinidade Vizinhança'],['PROJEÇÃO VETORIAL',2,'Afinidade Distante']]},{nome:'ARQUITETURA CONVENIENTE',posicao_visual:'Esquerda Inferior / Sudoeste',conexoes:[['ALQUIMIA VIBRACIONAL',1,'Afinidade Vizinhança'],['SUPREMACIA CORPOREAL',2,'Afinidade Distante'],['PULSO DE SUBMISSÃO',2,'Afinidade Distante']]},{nome:'PROJEÇÃO VETORIAL',posicao_visual:'Direita Superior / Nordeste',conexoes:[['SUPREMACIA CORPOREAL',1,'Afinidade Vizinhança'],['PULSO DE SUBMISSÃO',1,'Afinidade Vizinhança'],['ALQUIMIA VIBRACIONAL',2,'Afinidade Distante']]},{nome:'PULSO DE SUBMISSÃO',posicao_visual:'Direita Inferior / Sudeste',conexoes:[['PROJEÇÃO VETORIAL',1,'Afinidade Vizinhança'],['SUPREMACIA CORPOREAL',2,'Afinidade Distante'],['ARQUITETURA CONVENIENTE',2,'Afinidade Distante']]}],propriedades:5,conceitos_d6:9,friccao:{vizinha:'+1 PM / +1 Fricção',distante:'+3 PM / +3 Fricção / -3 no Dado'}},
      tecnicas:{formadas:true,livres:true,pp_simples:2,pp_complexas:4},
      sem_talento:{retorno:true,obsessao_treino:true,esponja:{basicas:5,intermediarias:15,avancadas:30,supremas:50}}
    },
    ficha:'ficha-sobreviventes.html',
    tema:{corPrimaria:'#c6a15b',corFundo:'#090c0a',corPainel:'#131814'}
  };
}
async function garantirSistemaSobreviventes(){
  if(!usuarioAutenticado()||!supabaseClient)return;
  const {data,error}=await supabaseClient.from('sistemas').select('id').eq('nome','Sobreviventes da Fronteira').limit(1);
  if(error||data?.length)return;
  const session=(await supabaseClient.auth.getSession()).data.session;if(!session)return;
  const cfg=criarConfiguracaoSobreviventes();
  const r=await supabaseClient.from('sistemas').insert({nome:'Sobreviventes da Fronteira',descricao:'Alta letalidade, Grau de Linhagem, treinamento, ciclos temporais e Moldagem de Mana.',configuracao:cfg,criado_por:session.user.id});
  if(r.error)console.warn('Sobreviventes da Fronteira não pôde ser criado automaticamente:',r.error.message);
}

function criarConfiguracaoOlimpia(){
  const attrs=[['FOR','Força'],['DES','Destreza'],['INT','Inteligência'],['SAB','Sabedoria'],['CAR','Carisma'],['CON','Constituição']];
  const pericias=[
    ['Acrobatics','DES'],['Animal Handling','SAB'],['Arcana','INT'],['Athletics','FOR'],['Deception','CAR'],['History','INT'],['Insight','SAB'],['Intimidation','CAR'],['Investigation','INT'],['Medicine','SAB'],['Nature','INT'],['Perception','SAB'],['Performance','CAR'],['Persuasion','CAR'],['Religion','SAB'],['Sleight of Hand','DES'],['Stealth','DES'],['Survival','SAB']
  ];
  const reinos=[
    {nome:'Olímpia',descricao:'Reino dos deuses e ascendidos, cercado por uma barreira divina impenetrável a seres sem pelo menos um artefato de rank S.'},
    {nome:'Lumier',descricao:'Limite dos mortais, cidade extremamente devota ao deus rei Taric.',exclusivas:['Templário']},
    {nome:'Cluvant',descricao:'Reino especializado em caça e pesca e núcleo cultural da Pangeia.',exclusivas:['Dançarino','Caçador']},
    {nome:'Bel',descricao:'Reino de magia extremamente forte e lapidada.',exclusivas:['Feiticeiro','Alquimista']},
    {nome:'Fenrir',descricao:'Reino meritocrático e guerreiro, conhecido pela dureza e impiedade.',exclusivas:['Necromante','Berserker']},
    {nome:'Long Bunker',descricao:'Cidade do crime, assolada pela fome e violência.',exclusivas:['Trapaceiro Arcano']},
    {nome:'Cassiantopia',descricao:'Reino fiel às tradições, lar de grandes espadachins.',exclusivas:['Ninja'],estilo_exclusivo:'Sumo'},
    {nome:'Magistar',descricao:'Reino de monges e budistas, criador de grandes marcialistas.',exclusivas:['Monge']},
    {nome:'Deviation',descricao:'Reino extremamente forte e preconceituoso contra magos.'}
  ];
  const classes=['Guerreiro','Cavaleiro','Atirador','Arqueiro','Caçador','Ranger','Mago','Bruxo','Elementalista','Assassino','Trapaceiro Arcano','Ladrão','Ninja','Clérigo','Alquimista','Templário','Paladino','Feiticeiro','Invocador','Necromante','Druida','Xamã','Monge','Lutador','Bardo','Dançarino','Bárbaro','Berserker'];
  const estilos={
    Guerreiro:['Deus do ataque','Deus da defesa','Deus do equilíbrio'],
    Cavaleiro:['Lanceiro','Arqueiro montado','Porta estandarte'],
    Atirador:['Armadilheiro','Usuário de besta','Arco longo'],
    Ninja:['Adagas invisíveis','Arqueiro furtivo','Sabotador'],
    Alquimista:['Box'],
    Templário:['Escudos da fé','Exorcista','Arqueiro da fé'],
    Paladino:['Escudos da fé','Exorcista','Arqueiro da fé'],
    Druida:['Companheiros de corpo e alma','Mestre do terreno'],
    Xamã:['Arte marcial + arma'],
    Lutador:['Box','Sumo','Taekwondo','Capoeira','Muay Thai','Judô'],
    Dançarino:['Taekwondo','Capoeira'],
    Bárbaro:['Fúria das bestas','Procurar e destruir','Corrida das armas'],
    Berserker:['Fúria das bestas','Procurar e destruir','Corrida das armas']
  };
  return {
    versao:1,
    tipo:'olimpia_pangeia',
    descricao:'RPG de Pangeia com reinos, classes, estilos de combate, atributos, perícias, Jóias e progressão por níveis.',
    dados:['d4','d6','d8','d10','d12','d20'],
    atributos:attrs.map(x=>({sigla:x[0],nome:x[1],regra:'A cada 3 pontos, +1 de multiplicador; atributo 6 = multiplicador 2.'})),
    pericias:pericias.map(x=>({nome:x[0],atributo:x[1]})),
    recursos:['Vida','Mana','XP'],
    racas:[
      {nome:'Humano',efeito:'Ao encontrar uma Jóia, gira um dado para obter uma Jóia adicional.',populares:['Feiticeiro','Guerreiro','Ladino']},
      {nome:'Elfo',efeito:'Sempre que fizer um teste de Destreza, ganha +2 no dado.',populares:['Mago','Arqueiro','Druida']},
      {nome:'Orc',efeito:'Sempre que girar um dado de dano por Força, ganha +2.',populares:['Tanque','Berserker','Lutador']}
    ],
    reinos,
    classes,
    estilos,
    habilidades:{estrutura:['Passiva','Habilidade 1','Habilidade 2','Habilidade 3','Ultimate'],observacao:'O Guia afirma 3 habilidades iniciais e uma habilidade de estilo; os textos das três habilidades iniciais não foram fornecidos na fonte.'},
    progressao:{xp_formula:'100 * 2^(nivel-1)',xp_niveis:Array.from({length:20},(_,i)=>100*Math.pow(2,i)),habilidade_classe_niveis:[5,10,15],classe_secundaria_nivel:20},
    cooldown:{habilidades_iniciais_turnos:5,reducao_por_nivel:1,minimo_turnos:2,minimo_mana:3},
    combate:{ordem:'maior iniciativa começa atacando',acerto:'dado de dano precisa ser maior que a Constituição do alvo',movimento:'peso reduz deslocamento; habilidades de mobilidade podem aumentar',furtivo:'ataques furtivos retiram dado de defesa e reflexo, mas ainda podem falhar contra Constituição'},
    guerra:{principio:'estratégia e trabalho em equipe são mais valiosos que habilidades individuais'},
    politica:['Economia','Alimentação','Alianças','Guerras','Salários','Imposto','Alistamento'],
    joias:{tem_almas_de_dragao:true,equipadas_em_itens:true,mais_do_mesmo_elemento_fortalece:true,itens_vinculados_ao_dono:true,destruicao_do_item_remove:true,podem_buffar:['habilidades marciais','habilidades de classe','magias'],compartilham_cooldown:true,nao_consumem_mana:true},
    ficha:'ficha-olimpia.html',
    tema:{corPrimaria:'#c9a85b',corFundo:'#0b0d14',corPainel:'#151923'}
  };
}

async function garantirSistemaOlimpia(){
  if(!usuarioAutenticado()||!supabaseClient)return;
  const {data,error}=await supabaseClient.from('sistemas').select('id').eq('nome','Olímpia — Pangeia').limit(1);
  if(error||data?.length)return;
  const session=(await supabaseClient.auth.getSession()).data.session;if(!session)return;
  const cfg=criarConfiguracaoOlimpia();
  const r=await supabaseClient.from('sistemas').insert({nome:'Olímpia — Pangeia',descricao:'Sistema de fantasia de Pangeia com classes, estilos de combate, Jóias e progressão por níveis.',configuracao:cfg,criado_por:session.user.id});
  if(r.error)console.warn('Olímpia — Pangeia não pôde ser criado automaticamente:',r.error.message);
}

async function garantirSistemaElarion(){
  if(!usuarioAutenticado()||!supabaseClient)return;
  const {data,error}=await supabaseClient.from('sistemas').select('id').eq('nome','Elarion — Sistema de Joias e Luvas').limit(1);
  if(error||data?.length)return;
  const session=(await supabaseClient.auth.getSession()).data.session;if(!session)return;
  const cfg=criarConfiguracaoElarion();
  const r=await supabaseClient.from('sistemas').insert({nome:'Elarion — Sistema de Joias e Luvas',descricao:'RPG de Joias e Luvas de Canalização. Ficha com inventário de joias sem limite de quantidade.',configuracao:cfg,criado_por:session.user.id});
  if(r.error)console.warn('Elarion não pôde ser criado automaticamente:',r.error.message);
}
async function carregarSistemas(){
  if(!supabaseClient) return;
  const lista=document.getElementById('lista-sistemas'); if(!lista) return;
  const {data,error}=await supabaseClient.from('sistemas').select('id,nome,descricao,configuracao,criado_por,created_at').order('created_at',{ascending:true});
  if(error){ lista.innerHTML='<div class="estado-galeria">Execute a atualização SQL da Etapa 2 no Supabase.</div>'; console.error(error); return; }
  lista.innerHTML='';
  (data||[]).forEach(s=>{
    const card=document.createElement('article'); card.className='card-sistema'+(s.configuracao?.tipo==='legado'?' legado':'');
    const cfg=s.configuracao||{};
    const modulosWT=cfg.tipo==='world_trigger'?['🔋 Trion','👥 Squads','📡 Radar','👻 Stealth','🏆 Rank Wars']:[]; const modulosEL=cfg.tipo==='elarion'?['💎 Joias ilimitadas','🧤 Luvas','✨ Inspiração','❤️ Fadiga','🎲 2d10']:[]; const modulosEB=cfg.tipo==='eter_brasas'?['🎲 2d10','✨ Técnica Única','🏰 Reinos','🏛️ Guildas','📖 Bestiário','🗓️ Calendário']:[]; const modulosNO=cfg.tipo==='noctavell'?['🎲 Dado do Véu','📜 Pactos','👁️ Entidades','🧠 Sanidade','🔐 Nome Verdadeiro']:[]; const modulosOP=cfg.tipo==='olimpia_pangeia'?['🏛️ Pangeia','⚔️ Classes','✨ Passiva + 3 Habilidades + Ultimate','💎 Jóias','📈 XP dobrando']:[]; const modulosSF=cfg.tipo==='sobreviventes_fronteira'?['🧱 Grau de Linhagem','⚔️ Combate letal','🌀 Ciclos temporais','🌌 Órbitas','✨ Moldagem de Mana']:[]; const modulosNT=cfg.tipo==='noites_em_tokyo'?['🩸 Ghouls','🧬 Kagunes','🔬 RC / Kakuja','⚔️ CCG / Quinques','🌙 Fome / Sanidade']:[]; const resumo=modulosWT.length?modulosWT.join(' · '):modulosEL.length?modulosEL.join(' · '):modulosEB.length?modulosEB.join(' · '):modulosNO.length?modulosNO.join(' · '):modulosOP.length?modulosOP.join(' · '):modulosSF.length?modulosSF.join(' · '):modulosNT.length?modulosNT.join(' · '):[`${(cfg.dados||[]).length} dados`,`${(cfg.atributos||[]).length} atributos`,`${(cfg.recursos||[]).length} recursos`,`${(cfg.pericias||[]).length} perícias`].join(' · ');
    card.innerHTML=`<div class="card-sistema-topo"><div><h3>⚙️ ${escaparHTML(s.nome)}</h3><p>${escaparHTML(s.descricao||'Sem descrição.')}</p><div class="card-sistema-meta">${escaparHTML(resumo)}</div></div>${cfg.tipo==='legado'?'<span class="badge-legado">LEGADO</span>':''}</div><div class="card-sistema-acoes"><button class="btn-sistema-acao" onclick="abrirFichaDoSistema('${s.id}')">📖 Abrir Ficha</button>${(s.criado_por === window.usuarioAtualId || ehMestreGlobal()) ? `<button class="btn-sistema-acao" onclick="editarSistema('${s.id}')">✏️ Editar</button>`:''}</div>`;
    lista.appendChild(card);
  });
}
async function editarSistema(id){
  const s=(await supabaseClient.from('sistemas').select('*').eq('id',id).single()).data; if(!s)return;
  if (s.criado_por !== window.usuarioAtualId && !ehMestreGlobal()) return mostrarPopup('❌ Você só pode editar sistemas que criou.');
  document.getElementById('sistema-editando-id').value=s.id;
  document.getElementById('titulo-editor-sistema').textContent='⚒️ Editar sistema';
  document.getElementById('novo-sistema-nome').value=s.nome||''; document.getElementById('novo-sistema-descricao').value=s.descricao||'';
  iniciarBuilderSistema(s.configuracao||{}); const tema=s.configuracao?.tema||{}; if(document.getElementById('sistema-cor-primaria')) document.getElementById('sistema-cor-primaria').value=tema.corPrimaria||'#c5a059'; if(document.getElementById('sistema-cor-fundo')) document.getElementById('sistema-cor-fundo').value=tema.corFundo||'#080a0f'; if(document.getElementById('sistema-cor-painel')) document.getElementById('sistema-cor-painel').value=tema.corPainel||'#151821'; document.getElementById('painel-novo-sistema').style.display='block'; document.getElementById('novo-sistema-nome').focus();
}
async function salvarSistema(){
  if(!usuarioAutenticado()) return; const nome=document.getElementById('novo-sistema-nome')?.value.trim(); if(!nome)return mostrarPopup('❌ Informe o nome do sistema.');
  const descricao=document.getElementById('novo-sistema-descricao')?.value.trim()||''; const id=document.getElementById('sistema-editando-id')?.value||null;
  sincronizarIdsComLayout();
  const config={versao:builderTipoSistema==='world_trigger'?4:3,tipo:builderTipoSistema,dados:[...builderSistema.dados],atributos:builderSistema.atributos.map(x=>({...x})),recursos:builderSistema.recursos.map(x=>({...x})),pericias:builderSistema.pericias.map(x=>({...x})),campos:builderSistema.campos.map(x=>({...x})),secoes:builderSistema.secoes.map(x=>({...x,campos:[...x.campos]})),tema:{corPrimaria:document.getElementById('sistema-cor-primaria')?.value||'#c5a059',corFundo:document.getElementById('sistema-cor-fundo')?.value||'#080a0f',corPainel:document.getElementById('sistema-cor-painel')?.value||'#151821'},ficha:'ficha-generica.html',...(builderSistema.especial||{})};
  let q=supabaseClient.from('sistemas'); const payload={nome,descricao,configuracao:config,updated_at:new Date().toISOString()};
  const result=id
    ? await (ehMestreGlobal() ? q.update(payload).eq('id',id) : q.update(payload).eq('id',id).eq('criado_por',window.usuarioAtualId)).select().single()
    : await q.insert({...payload,criado_por:(await supabaseClient.auth.getUser()).data.user?.id}).select().single();
  if(result.error)return mostrarPopup('❌ Erro ao salvar sistema: '+result.error.message);
  fecharNovoSistema(); await carregarSistemas(); mostrarPopup(`⚙️ Sistema "${nome}" salvo com sucesso!`);
}
function abrirFichaGenericaNoIframe(iframe, src, sistema, dados = null, modo = 'criacao') {
  if (!iframe || !sistema) return;
  const enviar = () => {
    try {
      iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-sistema', sistema }, window.location.origin);
      if (dados) iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-ficha', dados, modo }, window.location.origin);
    } catch (err) { console.error('Erro ao enviar sistema para a ficha:', err); }
  };
  iframe.addEventListener('load', enviar, { once: true });
  iframe.src = src;
}

async function abrirFichaDoSistema(id){
  const {data,error}=await supabaseClient.from('sistemas').select('*').eq('id',id).single(); if(error||!data)return mostrarPopup('❌ Sistema não encontrado.');
  MAMUS_STATE.system.current=data;
  const modal=document.getElementById('modal-criador-ficha'), iframe=document.getElementById('iframe-criador-ficha'); if(!modal||!iframe)return;
  if(data.configuracao?.tipo==='legado') iframe.src='ficha-editor.html?modo=criacao&t='+Date.now(); else if(data.configuracao?.tipo==='elarion') abrirFichaGenericaNoIframe(iframe, 'ficha-elarion.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao'); else if(data.configuracao?.tipo==='eter_brasas') abrirFichaGenericaNoIframe(iframe, 'ficha-eter-brasas.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao'); else if(data.configuracao?.tipo==='noctavell') abrirFichaGenericaNoIframe(iframe, 'ficha-noctavell.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao'); else if(data.configuracao?.tipo==='olimpia_pangeia') abrirFichaGenericaNoIframe(iframe, 'ficha-olimpia.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao'); else if(data.configuracao?.tipo==='noites_em_tokyo') abrirFichaGenericaNoIframe(iframe, 'ficha-noites-em-tokyo.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao'); else if(data.configuracao?.tipo==='sobreviventes_fronteira') abrirFichaGenericaNoIframe(iframe, 'ficha-sobreviventes.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao'); else abrirFichaGenericaNoIframe(iframe, 'ficha-generica.html?modo=criacao&sistema='+encodeURIComponent(id)+'&t='+Date.now(), data, null, 'criacao');
  const titulo=document.querySelector('#modal-criador-ficha .modal-ficha-cabecalho h2'); if(titulo)titulo.textContent=`⚔️ Ficha — ${data.nome}`;
  modal.style.display='flex';
}


// --- BESTIÁRIO ELARION ---
let bestiarioElarion = [];
let bestiarioInicializado = false;
function bestiarioEhElarionAtivo(){
  const tipo=MAMUS_STATE.system.current?.configuracao?.tipo;
  return tipo==='elarion'||tipo==='eter_brasas';
}
function bestiarioArquivoAtivo(){
  const tipo=MAMUS_STATE.system.current?.configuracao?.tipo;
  if(tipo==='eter_brasas') return 'bestiario-eter-brasas.json';
  if(tipo==='elarion') return 'bestiario-elarion.json';
  return MAMUS_STATE.system.current?.configuracao?.bestiario_arquivo || 'bestiario-elarion.json';
}
async function inicializarBestiarioElarion(){
  const btn=document.getElementById('btn-aba-bestiario');
  if(!btn) return;
  const ativo=bestiarioEhElarionAtivo();
  btn.style.display = usuarioAutenticado() && ativo ? '' : 'none';
  const eb=MAMUS_STATE.system.current?.configuracao?.tipo==='eter_brasas';
  if(eb) bestiarioInicializado=false;
  if(!bestiarioEhElarionAtivo() || !usuarioAutenticado()) return;
  if(bestiarioInicializado) return;
  try{
    const r=await fetch(bestiarioArquivoAtivo(), {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    bestiarioElarion=await r.json();
    bestiarioInicializado=true;
    const eb=MAMUS_STATE.system.current?.configuracao?.tipo==='eter_brasas';
    const ey=document.getElementById('bestiario-eyebrow'), tt=document.getElementById('bestiario-titulo-aba'), stx=document.getElementById('bestiario-subtexto-aba');
    if(ey)ey.textContent=eb?'🔥 Éter & Brasas':'💎 Elarion';
    if(tt)tt.textContent=eb?'📖 Bestiário — Éter & Brasas':'📖 Bestiário — Elarion';
    if(stx)stx.textContent=eb?'Bestiário do Éter & Brasas. Consulte criaturas, filtre por reino/nível e coloque monstros diretamente no mapa.':'Bestiário oficial de Elarion. Consulte criaturas, filtre por reino/nível/papel e coloque monstros diretamente no mapa.';
    preencherFiltrosBestiario();
    renderizarBestiario();
  }catch(e){
    console.error('Erro ao carregar bestiário:',e);
    const st=document.getElementById('bestiario-status'); if(st) st.textContent='❌ Não foi possível carregar bestiario-elarion.json.';
  }
}
function preencherFiltrosBestiario(){
  const campos=[['bestiario-reino',bestiarioElarion.map(x=>x.reino)],['bestiario-nivel',bestiarioElarion.map(x=>x.nivel)],['bestiario-papel',bestiarioElarion.map(x=>x.papel)]];
  campos.forEach(([id,valores])=>{const el=document.getElementById(id); if(!el)return; [...new Set(valores.filter(v=>v!==undefined&&v!==null).map(String))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o)}); el.addEventListener('change',renderizarBestiario)});
  const busca=document.getElementById('bestiario-busca'); if(busca) busca.addEventListener('input',renderizarBestiario);
}
function escaparBestiario(v){return escaparHTML(String(v??''));}
function renderizarBestiario(){
  const lista=document.getElementById('bestiario-lista'),status=document.getElementById('bestiario-status'); if(!lista)return;
  const q=(document.getElementById('bestiario-busca')?.value||'').trim().toLowerCase();
  const reino=document.getElementById('bestiario-reino')?.value||'',nivel=document.getElementById('bestiario-nivel')?.value||'',papel=document.getElementById('bestiario-papel')?.value||'';
  const itens=bestiarioElarion.filter(m=>{const texto=[m.nome,m.reino,m.afinidade,m.papel].join(' ').toLowerCase();return(!q||texto.includes(q))&&(!reino||String(m.reino)===reino)&&(!nivel||String(m.nivel)===nivel)&&(!papel||String(m.papel)===papel)});
  if(status)status.textContent=`${itens.length} criatura(s) encontrada(s) de ${bestiarioElarion.length}.`;
  lista.innerHTML=itens.map((m,i)=>`<article class="bestiario-card"><h3>🐾 ${escaparBestiario(m.nome)}</h3><div class="bestiario-meta">${escaparBestiario(m.reino)} · Nível ${escaparBestiario(m.nivel)} · ${escaparBestiario(m.papel)}<br>${escaparBestiario(m.afinidade)}</div><div class="bestiario-recursos"><div class="bestiario-recurso"><strong>❤️ ${escaparBestiario(m.pv)}</strong><small>PV</small></div><div class="bestiario-recurso"><strong>⚡ ${escaparBestiario(m.tf)}</strong><small>TF</small></div><div class="bestiario-recurso"><strong>🛡️ ${escaparBestiario(m.df)}</strong><small>DF</small></div><div class="bestiario-recurso"><strong>🏃 ${escaparBestiario(m.movimento)}</strong><small>Mov.</small></div></div><div class="bestiario-acoes"><button type="button" class="btn-sistema-acao" onclick="abrirDetalheBestiario(${bestiarioElarion.indexOf(m)})">👁️ Ver ficha</button><button type="button" class="btn-sistema-acao" onclick="criarTokenDoBestiario(${bestiarioElarion.indexOf(m)})">⚔️ Criar Token</button></div></article>`).join('');
}
function abrirDetalheBestiario(idx){
  const m=bestiarioElarion[idx]; if(!m)return;
  document.getElementById('bestiario-detalhe-titulo').textContent='🐾 '+m.nome;
  const attrs=Object.entries(m.atributos||{}).map(([k,v])=>`<span><strong>${escaparBestiario(k)}</strong> ${escaparBestiario(v)}</span>`).join(' · ');
  const ataques=(m.ataques||[]).map(a=>`<div class="bestiario-ataque"><strong>⚔️ ${escaparBestiario(a.nome)}</strong><br>Teste: ${escaparBestiario(a.teste)} · Dano: ${escaparBestiario(a.dano)} · ${escaparBestiario(a.tipo)}</div>`).join('')||'<em>Nenhum ataque registrado.</em>';
  const hab=(m.habilidades||[]).map(h=>`<li><strong>${escaparBestiario(h.nome)}:</strong> ${escaparBestiario(h.efeito)}</li>`).join('');
  const lista=(arr)=> (arr||[]).length?'<ul>'+arr.map(x=>`<li>${escaparBestiario(x)}</li>`).join('')+'</ul>':'<em>Nenhum.</em>';
  document.getElementById('bestiario-detalhe-corpo').innerHTML=`<div class="bestiario-meta">${escaparBestiario(m.reino)} · Nível ${escaparBestiario(m.nivel)} · ${escaparBestiario(m.papel)}<br>Afinidades: ${escaparBestiario(m.afinidade)}</div><div class="bestiario-detalhe-grid"><div class="bestiario-recurso">❤️ <strong>${escaparBestiario(m.pv)}</strong><small>PV</small></div><div class="bestiario-recurso">⚡ <strong>${escaparBestiario(m.tf)}</strong><small>TF</small></div><div class="bestiario-recurso">🛡️ <strong>${escaparBestiario(m.df)}</strong><small>DF</small></div><div class="bestiario-recurso">🏃 <strong>${escaparBestiario(m.movimento)}</strong><small>Movimento</small></div></div><div class="bestiario-bloco"><h4>📊 Atributos</h4><div>${attrs}</div></div><div class="bestiario-bloco"><h4>⚔️ Ataques</h4>${ataques}</div><div class="bestiario-bloco"><h4>✨ Habilidades</h4><ul>${hab||'<li>Nenhuma.</li>'}</ul></div><div class="bestiario-bloco"><h4>🛡️ Resistências</h4>${lista(m.resistencias)}</div><div class="bestiario-bloco"><h4>⚠️ Fraquezas</h4>${lista(m.fraquezas)}</div><div class="bestiario-bloco"><h4>💎 Loot sugerido</h4>${lista(m.loot_sugerido)}</div><div class="bestiario-acoes"><button type="button" class="btn-ficha-principal" onclick="criarTokenDoBestiario(${idx}); fecharDetalheBestiario();">⚔️ Colocar no Mapa</button></div>`;
  const modal = document.getElementById('bestiario-detalhe');
  if (!modal) { console.error('Modal do Bestiário não encontrado.'); return; }
  modal.style.display='flex';
}
function fecharDetalheBestiario(){const el=document.getElementById('bestiario-detalhe');if(el)el.style.display='none';}
function criarTokenDoBestiario(idx){
  if(!ehMestreDaCampanhaAtual())return mostrarPopup('❌ Apenas o Mestre pode criar criaturas no mapa.');
  const m=bestiarioElarion[idx]; if(!m)return;
  const base='monstro_'+normalizarIdTokenWT(m.nome)+'_'+Date.now();
  criarElementoToken(base,m.nome,10,10,55,'',Number(m.pv)||1,Number(m.pv)||1,true,{tipo:'bestiario',monstro:true,reino:m.reino,nivel:m.nivel,papel:m.papel,atributos:m.atributos||{},ataques:m.ataques||[],habilidades:m.habilidades||[],resistencias:m.resistencias||[],fraquezas:m.fraquezas||[],loot_sugerido:m.loot_sugerido||[],ownerNick:document.getElementById('user-nick-display')?.innerText||'Mestre',ownerUserId:window.usuarioAtualId||''});
  const tokenMonstro=document.getElementById(base); if(tokenMonstro) salvarTokenNoSupabase(tokenMonstro);
  if(canalMesa) canalMesa.send({type:'broadcast',event:'vtt_mover_token',payload:{id:base,nome:m.nome,x:10,y:10,tamanho:55,imagem:'',hpAtual:Number(m.pv)||1,hpMax:Number(m.pv)||1,campanha_id:obterCampanhaIdAtual(),ownerNick:document.getElementById('user-nick-display')?.innerText||'Mestre',ownerUserId:window.usuarioAtualId||'',tipo:'bestiario',monstro:true,reino:m.reino,nivel:m.nivel,papel:m.papel,atributos:m.atributos||{},ataques:m.ataques||[],habilidades:m.habilidades||[],resistencias:m.resistencias||[],fraquezas:m.fraquezas||[],loot_sugerido:m.loot_sugerido||[]}});
  mostrarPopup(`🐾 ${m.nome} foi colocado no mapa!`);
}


// =========================================================
// ÉTER & BRASAS — ECONOMIA VIVA + JORNAIS DA CAMPANHA
// =========================================================
let economiaDados = { mercados: [], itens: [], eventos: [] };
let jornaisDados = [];
let economiaCarregadaCampanha = null;
let jornaisCarregadosCampanha = null;

function sistemaEterBrasasAtivo() {
  return MAMUS_STATE.system.current?.configuracao?.tipo === 'eter_brasas' || /éter\s*&\s*brasas/i.test(MAMUS_STATE.system.current?.nome || '');
}
function moedaEterPorCodigo(codigo) {
  const lista = [
    ['LUM','Lúmen','Ł','Brassanthium'],['KRO','Króna','Kr','Frostheim'],['DRM','Drom','Ð','Zerathis'],['COG','Cogmark','⚙','Altherion'],['LEF','Folha','♣',"Kael'Thir"],['AST','Astreel','✦','Astra'],['KOB','Koban','Ꝏ','Kuroshida'],['VMR','Vargr','Vm','Drosgard'],['ICR','Coroa de Ferro','IC','Valmorra'],['LUN','Lunis','☾','Lunareth'],['DBL','Dobrão','Db','Drakenshore']
  ];
  return lista.find(m => m[0] === codigo) || null;
}
function formatarMoedaEter(valor, codigo='LUM') {
  const m = moedaEterPorCodigo(codigo);
  return `${Number(valor || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${m?.[2] || 'Ł'}`;
}
function obterPrecoAtualEconomia(item) {
  const base = Number(item?.preco_base) || 0;
  const mod = Number(item?.modificador_percentual) || 0;
  return Math.max(0, base * (1 + mod / 100));
}
function normalizarTextoEconomia(v){ return String(v ?? '').trim(); }

async function carregarEconomiaAtual(force=false) {
  const id = obterCampanhaIdAtual();
  const vazio = document.getElementById('economia-sem-campanha');
  if (!id) { if(vazio) vazio.style.display='block'; return; }
  if (!force && economiaCarregadaCampanha === id) { renderizarEconomia(); return; }
  if (vazio) vazio.style.display='none';
  if (!supabaseClient) return;
  economiaCarregadaCampanha = id;
  const [m,i,e] = await Promise.all([
    supabaseClient.from('economia_mercados').select('*').eq('campanha_id',id).order('nome'),
    supabaseClient.from('economia_itens').select('*').eq('campanha_id',id).order('nome'),
    supabaseClient.from('economia_eventos').select('*').eq('campanha_id',id).order('created_at',{ascending:false})
  ]);
  if (m.error || i.error || e.error) {
    console.error('Economia:',m.error||i.error||e.error);
    document.getElementById('lista-mercados-economia').innerHTML='<div class="estado-galeria">A economia ainda não foi preparada no Supabase. Execute o SQL da atualização.</div>';
    return;
  }
  economiaDados={mercados:m.data||[],itens:i.data||[],eventos:e.data||[]};
  renderizarEconomia();
}
function renderizarEconomia(){
  const id=obterCampanhaIdAtual();
  const painel=document.getElementById('economia-painel-mestre');
  const acoes=document.getElementById('economia-acoes-mestre');
  if (painel) painel.style.display = ehMestreDaCampanhaAtual() && id ? 'block':'none';
  if (acoes) acoes.style.display = ehMestreDaCampanhaAtual() && id ? 'flex':'none';
  const resumo=document.getElementById('economia-resumo');
  if(resumo) resumo.innerHTML=`<div class="economia-kpi"><strong>${economiaDados.mercados.length}</strong><span>Mercados</span></div><div class="economia-kpi"><strong>${economiaDados.itens.length}</strong><span>Mercadorias</span></div><div class="economia-kpi"><strong>${economiaDados.eventos.length}</strong><span>Eventos registrados</span></div>`;
  const lmoin=document.getElementById('lista-moedas-economia');
  if(lmoin) lmoin.innerHTML=[['LUM','Lúmen','Ł','Brassanthium',1,1],['KRO','Króna','Kr','Frostheim',1.4,0.71],['DRM','Drom','Ð','Zerathis',0.6,1.67],['COG','Cogmark','⚙','Altherion',1.2,0.83],['LEF','Folha','♣',"Kael'Thir",0.9,1.11],['AST','Astreel','✦','Astra',1.6,0.63],['KOB','Koban','Ꝏ','Kuroshida',1.3,0.77],['VMR','Vargr','Vm','Drosgard',0.7,1.43],['ICR','Coroa de Ferro','IC','Valmorra',1.1,0.91],['LUN','Lunis','☾','Lunareth',1.5,0.67],['DBL','Dobrão','Db','Drakenshore',0.5,2]].map(m=>`<article class="economia-card moeda-card"><div class="economia-card-topo"><div><span class="economia-selo">${m[0]}</span><h4>${escaparHTML(m[1])}</h4></div><span class="economia-moeda">${m[2]}</span></div><div class="economia-mini-grid"><span>Reino <b>${escaparHTML(m[3])}</b></span><span>Taxa / Lúmen <b>${m[4]}</b></span><span>1 Lúmen = <b>${m[5]} ${m[2]}</b></span></div></article>`).join('');
  const lm=document.getElementById('lista-mercados-economia');
  if(lm) lm.innerHTML=economiaDados.mercados.length?economiaDados.mercados.map(m=>`<article class="economia-card"><div class="economia-card-topo"><div><span class="economia-selo">🏪 ${escaparHTML(m.regiao||'Mundo')}</span><h4>${escaparHTML(m.nome)}</h4></div><span class="economia-moeda">${escaparHTML(m.moeda_simbolo||moedaEterPorCodigo(m.moeda_codigo)?.[2]||'Ł')}</span></div><p>${escaparHTML(m.observacoes||'Mercado sem observações.')}</p><div class="economia-mini-grid"><span>Riqueza <b>${Number(m.riqueza||5)}/10</b></span><span>Inflação <b>${Number(m.inflacao||0)}%</b></span><span>Moeda <b>${escaparHTML(m.moeda_codigo||'LUM')}</b></span></div>${ehMestreDaCampanhaAtual()?`<div class="economia-card-acoes"><button type="button" onclick="abrirEditorMercado('${m.id}')">✏️ Editar</button><button type="button" class="btn-perigo" onclick="excluirMercado('${m.id}')">🗑️</button></div>`:''}</article>`).join(''):'<div class="estado-galeria">Nenhum mercado cadastrado. O Mestre pode criar o primeiro.</div>';
  const li=document.getElementById('lista-itens-economia');
  if(li) li.innerHTML=economiaDados.itens.length?economiaDados.itens.map(item=>`<article class="economia-card economia-item"><div class="economia-card-topo"><div><span class="economia-selo">📦 ${escaparHTML(item.categoria||'Mercadoria')}</span><h4>${escaparHTML(item.nome)}</h4></div><strong class="economia-preco">${formatarMoedaEter(obterPrecoAtualEconomia(item),item.moeda_codigo||'LUM')}</strong></div><div class="economia-mini-grid"><span>Base <b>${formatarMoedaEter(item.preco_base,item.moeda_codigo||'LUM')}</b></span><span>Mercado <b>${escaparHTML(economiaDados.mercados.find(x=>x.id===item.mercado_id)?.nome||'—')}</b></span><span>Ajuste <b>${Number(item.modificador_percentual||0)>0?'+':''}${Number(item.modificador_percentual||0)}%</b></span><span>Oferta/Demanda <b>${Number(item.oferta||0)} / ${Number(item.demanda||0)}</b></span></div>${item.descricao?`<p>${escaparHTML(item.descricao)}</p>`:''}${ehMestreDaCampanhaAtual()?`<div class="economia-card-acoes"><button type="button" onclick="abrirEditorMercadoria('${item.id}')">✏️ Editar</button><button type="button" class="btn-perigo" onclick="excluirMercadoria('${item.id}')">🗑️</button></div>`:''}</article>`).join(''):'<div class="estado-galeria">Nenhuma mercadoria cadastrada.</div>';
  const le=document.getElementById('lista-eventos-economia');
  if(le) le.innerHTML=economiaDados.eventos.length?economiaDados.eventos.map(e=>`<article class="card-campanha economia-evento"><div class="card-campanha-conteudo"><span class="card-campanha-icone">${escaparHTML(e.icone||'🌪️')}</span><div><h3>${escaparHTML(e.titulo)}</h3><p>${escaparHTML(e.descricao||'')}</p><span class="card-campanha-meta">${escaparHTML(e.tipo||'Evento')} · ${escaparHTML(e.regiao||'Mundo')} · Intensidade ${Number(e.intensidade||1)}/5 · ${e.created_at?new Date(e.created_at).toLocaleString('pt-BR'):''}</span></div></div>${ehMestreDaCampanhaAtual()?`<button type="button" class="btn-perigo" onclick="excluirEventoEconomico('${e.id}')">🗑️ Apagar</button>`:''}</article>`).join(''):'<div class="estado-galeria">Nenhum evento econômico registrado.</div>';
  document.getElementById('economia-contagem-mercados')?.replaceChildren(document.createTextNode(`${economiaDados.mercados.length} cadastrados`));
  document.getElementById('economia-contagem-itens')?.replaceChildren(document.createTextNode(`${economiaDados.itens.length} cadastradas`));
}
function recarregarEconomiaAtual(){ carregarEconomiaAtual(true); }
function fecharEditorEconomia(){ const el=document.getElementById('economia-formulario'); if(el){el.style.display='none';el.innerHTML='';} }
function abrirEditorMercado(id=null){
  if(!ehMestreDaCampanhaAtual())return; const x=economiaDados.mercados.find(v=>v.id===id)||{}; const el=document.getElementById('economia-formulario'); if(!el)return;
  el.style.display='block'; el.innerHTML=`<div class="economia-editor"><h3>${id?'✏️ Editar':'＋ Criar'} mercado</h3><div class="economia-form-grid"><label>Nome<input id="econ-mercado-nome" maxlength="80" value="${escaparHTML(x.nome||'')}"></label><label>Região<input id="econ-mercado-regiao" maxlength="80" value="${escaparHTML(x.regiao||'')}"></label><label>Moeda<select id="econ-mercado-moeda">${['LUM','KRO','DRM','COG','LEF','AST','KOB','VMR','ICR','LUN','DBL'].map(c=>`<option value="${c}" ${x.moeda_codigo===c?'selected':''}>${c} — ${moedaEterPorCodigo(c)?.[1]}</option>`).join('')}</select></label><label>Riqueza (1–10)<input id="econ-mercado-riqueza" type="number" min="1" max="10" value="${Number(x.riqueza||5)}"></label><label>Inflação %<input id="econ-mercado-inflacao" type="number" step="0.1" value="${Number(x.inflacao||0)}"></label></div><label>Observações<textarea id="econ-mercado-obs" rows="3" maxlength="1000">${escaparHTML(x.observacoes||'')}</textarea></label><div class="economia-editor-acoes"><button type="button" class="btn-ficha-principal" onclick="salvarMercado('${id||''}')">💾 Salvar</button><button type="button" class="btn-secundario" onclick="fecharEditorEconomia()">Cancelar</button></div></div>`;
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function salvarMercado(id=''){ if(!ehMestreDaCampanhaAtual()||!supabaseClient||!obterCampanhaIdAtual())return; const payload={campanha_id:obterCampanhaIdAtual(),nome:normalizarTextoEconomia(document.getElementById('econ-mercado-nome')?.value),regiao:normalizarTextoEconomia(document.getElementById('econ-mercado-regiao')?.value)||'Mundo',moeda_codigo:document.getElementById('econ-mercado-moeda')?.value||'LUM',riqueza:Math.max(1,Math.min(10,Number(document.getElementById('econ-mercado-riqueza')?.value)||5)),inflacao:Number(document.getElementById('econ-mercado-inflacao')?.value)||0,observacoes:document.getElementById('econ-mercado-obs')?.value.trim()||'',atualizado_por:window.usuarioAtualId}; if(!payload.nome)return mostrarPopup('❌ Informe o nome do mercado.'); const r=id?await supabaseClient.from('economia_mercados').update(payload).eq('id',id).eq('campanha_id',obterCampanhaIdAtual()):await supabaseClient.from('economia_mercados').insert(payload); if(r.error)return mostrarPopup('❌ '+r.error.message); fecharEditorEconomia(); await carregarEconomiaAtual(true); transmitirEconomia('mercado'); }
async function excluirMercado(id){if(!ehMestreDaCampanhaAtual()||!confirm('Apagar este mercado?'))return; const r=await supabaseClient.from('economia_mercados').delete().eq('id',id).eq('campanha_id',obterCampanhaIdAtual()); if(r.error)return mostrarPopup('❌ '+r.error.message); await carregarEconomiaAtual(true);}
function abrirEditorMercadoria(id=null){ if(!ehMestreDaCampanhaAtual())return; const x=economiaDados.itens.find(v=>v.id===id)||{}; const el=document.getElementById('economia-formulario'); if(!el)return; el.style.display='block'; el.innerHTML=`<div class="economia-editor"><h3>${id?'✏️ Editar':'＋ Criar'} mercadoria</h3><div class="economia-form-grid"><label>Nome<input id="econ-item-nome" maxlength="80" value="${escaparHTML(x.nome||'')}"></label><label>Categoria<input id="econ-item-cat" maxlength="60" value="${escaparHTML(x.categoria||'')}"></label><label>Mercado<select id="econ-item-mercado"><option value="">Global / sem mercado</option>${economiaDados.mercados.map(m=>`<option value="${m.id}" ${x.mercado_id===m.id?'selected':''}>${escaparHTML(m.nome)}</option>`).join('')}</select></label><label>Moeda<select id="econ-item-moeda">${['LUM','KRO','DRM','COG','LEF','AST','KOB','VMR','ICR','LUN','DBL'].map(c=>`<option value="${c}" ${x.moeda_codigo===c?'selected':''}>${c} — ${moedaEterPorCodigo(c)?.[1]}</option>`).join('')}</select></label><label>Preço base<input id="econ-item-preco" type="number" min="0" step="0.01" value="${Number(x.preco_base||0)}"></label><label>Ajuste de preço %<input id="econ-item-mod" type="number" step="0.1" value="${Number(x.modificador_percentual||0)}"></label><label>Oferta<input id="econ-item-oferta" type="number" min="0" value="${Number(x.oferta||0)}"></label><label>Demanda<input id="econ-item-demanda" type="number" min="0" value="${Number(x.demanda||0)}"></label></div><label>Descrição<textarea id="econ-item-desc" rows="3" maxlength="1000">${escaparHTML(x.descricao||'')}</textarea></label><div class="economia-editor-acoes"><button type="button" class="btn-ficha-principal" onclick="salvarMercadoria('${id||''}')">💾 Salvar</button><button type="button" class="btn-secundario" onclick="fecharEditorEconomia()">Cancelar</button></div></div>`; el.scrollIntoView({behavior:'smooth',block:'nearest'}); }
async function salvarMercadoria(id=''){if(!ehMestreDaCampanhaAtual()||!supabaseClient||!obterCampanhaIdAtual())return; const payload={campanha_id:obterCampanhaIdAtual(),nome:normalizarTextoEconomia(document.getElementById('econ-item-nome')?.value),categoria:normalizarTextoEconomia(document.getElementById('econ-item-cat')?.value)||'Mercadoria',mercado_id:document.getElementById('econ-item-mercado')?.value||null,moeda_codigo:document.getElementById('econ-item-moeda')?.value||'LUM',preco_base:Math.max(0,Number(document.getElementById('econ-item-preco')?.value)||0),modificador_percentual:Number(document.getElementById('econ-item-mod')?.value)||0,oferta:Math.max(0,Number(document.getElementById('econ-item-oferta')?.value)||0),demanda:Math.max(0,Number(document.getElementById('econ-item-demanda')?.value)||0),descricao:document.getElementById('econ-item-desc')?.value.trim()||'',atualizado_por:window.usuarioAtualId}; if(!payload.nome)return mostrarPopup('❌ Informe o nome da mercadoria.'); const r=id?await supabaseClient.from('economia_itens').update(payload).eq('id',id).eq('campanha_id',obterCampanhaIdAtual()):await supabaseClient.from('economia_itens').insert(payload); if(r.error)return mostrarPopup('❌ '+r.error.message); fecharEditorEconomia(); await carregarEconomiaAtual(true); transmitirEconomia('mercadoria');}
async function excluirMercadoria(id){if(!ehMestreDaCampanhaAtual()||!confirm('Apagar esta mercadoria?'))return;const r=await supabaseClient.from('economia_itens').delete().eq('id',id).eq('campanha_id',obterCampanhaIdAtual());if(r.error)return mostrarPopup('❌ '+r.error.message);await carregarEconomiaAtual(true);}
function abrirEditorEventoEconomico(){if(!ehMestreDaCampanhaAtual())return;const el=document.getElementById('economia-formulario');if(!el)return;el.style.display='block';el.innerHTML=`<div class="economia-editor"><h3>🌪️ Registrar acontecimento econômico</h3><div class="economia-form-grid"><label>Título<input id="econ-evento-titulo" maxlength="100" placeholder="Ex.: Guerra fecha a fronteira"></label><label>Tipo<select id="econ-evento-tipo"><option>Guerra</option><option>Fome</option><option>Escassez</option><option>Superprodução</option><option>Descoberta</option><option>Festival</option><option>Catástrofe</option><option>Bloqueio comercial</option><option>Nova rota</option><option>Política</option><option>Outro</option></select></label><label>Região<input id="econ-evento-regiao" maxlength="80" placeholder="Ex.: Frostheim"></label><label>Intensidade (1–5)<input id="econ-evento-intensidade" type="number" min="1" max="5" value="3"></label><label>Ícone<input id="econ-evento-icone" maxlength="4" value="🌪️"></label></div><label>O que aconteceu?<textarea id="econ-evento-desc" rows="4" maxlength="2000" placeholder="Descreva a causa e as consequências."></textarea></label><div class="economia-editor-acoes"><button type="button" class="btn-ficha-principal" onclick="salvarEventoEconomico()">📌 Registrar evento</button><button type="button" class="btn-secundario" onclick="fecharEditorEconomia()">Cancelar</button></div></div>`;el.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function salvarEventoEconomico(){if(!ehMestreDaCampanhaAtual()||!supabaseClient||!obterCampanhaIdAtual())return;const payload={campanha_id:obterCampanhaIdAtual(),titulo:normalizarTextoEconomia(document.getElementById('econ-evento-titulo')?.value),tipo:document.getElementById('econ-evento-tipo')?.value||'Outro',regiao:normalizarTextoEconomia(document.getElementById('econ-evento-regiao')?.value)||'Mundo',intensidade:Math.max(1,Math.min(5,Number(document.getElementById('econ-evento-intensidade')?.value)||3)),icone:normalizarTextoEconomia(document.getElementById('econ-evento-icone')?.value)||'🌪️',descricao:document.getElementById('econ-evento-desc')?.value.trim()||'',criado_por:window.usuarioAtualId};if(!payload.titulo||!payload.descricao)return mostrarPopup('❌ Preencha o título e a descrição.');const r=await supabaseClient.from('economia_eventos').insert(payload);if(r.error)return mostrarPopup('❌ '+r.error.message);fecharEditorEconomia();await carregarEconomiaAtual(true);transmitirEconomia('evento');}
async function excluirEventoEconomico(id){if(!ehMestreDaCampanhaAtual()||!confirm('Apagar este evento do histórico?'))return;const r=await supabaseClient.from('economia_eventos').delete().eq('id',id).eq('campanha_id',obterCampanhaIdAtual());if(r.error)return mostrarPopup('❌ '+r.error.message);await carregarEconomiaAtual(true);}
function transmitirEconomia(tipo){if(canalMesa)canalMesa.send({type:'broadcast',event:'economia_atualizada',payload:{campanha_id:obterCampanhaIdAtual(),tipo,quando:Date.now()}});}

async function carregarJornaisAtual(force=false){
  const id=obterCampanhaIdAtual(); const vazio=document.getElementById('jornais-sem-campanha');
  if(!id){if(vazio)vazio.style.display='block';return;} if(!force&&jornaisCarregadosCampanha===id){renderizarJornais();return;} if(vazio)vazio.style.display='none'; if(!supabaseClient)return;
  jornaisCarregadosCampanha=id; const r=await supabaseClient.from('jornais_campanha').select('*').eq('campanha_id',id).eq('publicado',true).order('publicado_em',{ascending:false});
  if(r.error){console.error('Jornais:',r.error);document.getElementById('lista-jornais').innerHTML='<div class="estado-galeria">Execute o SQL da atualização para ativar o jornal.</div>';return;} jornaisDados=r.data||[]; preencherFiltroRegiaoJornal(); renderizarJornais();
}
function preencherFiltroRegiaoJornal(){const s=document.getElementById('jornal-regiao');if(!s)return;const atual=s.value;const regs=[...new Set(jornaisDados.map(j=>j.regiao).filter(Boolean))].sort();s.innerHTML='<option value="">Todas as regiões</option>'+regs.map(r=>`<option value="${escaparHTML(r)}">${escaparHTML(r)}</option>`).join('');if(regs.includes(atual))s.value=atual;}
function renderizarJornais(){
  const busca=(document.getElementById('jornal-busca')?.value||'').toLowerCase().trim(),cat=document.getElementById('jornal-categoria')?.value||'',reg=document.getElementById('jornal-regiao')?.value||''; const lista=document.getElementById('lista-jornais'); if(!lista)return;
  const filtrados=jornaisDados.filter(j=>(!cat||j.categoria===cat)&&(!reg||j.regiao===reg)&&(!busca||`${j.titulo} ${j.manchete} ${j.conteudo} ${j.regiao}`.toLowerCase().includes(busca)));
  lista.innerHTML=filtrados.length?filtrados.map((j,i)=>`<article class="jornal-folha ${i===0&&!busca&&!cat&&!reg?'jornal-destaque':''}"><div class="jornal-cabecalho"><span class="jornal-marca">O CORREIO DO ÉTER</span><span>${j.publicado_em?new Date(j.publicado_em).toLocaleDateString('pt-BR'):''}</span></div><div class="jornal-meta"><span>${escaparHTML(j.categoria||'Mundo')}</span><span>${escaparHTML(j.regiao||'Mundo')}</span>${j.importancia>=4?'<b>🚨 DESTAQUE</b>':''}</div><h3>${escaparHTML(j.titulo)}</h3>${j.manchete?`<p class="jornal-manchete">${escaparHTML(j.manchete)}</p>`:''}<div class="jornal-corpo">${escaparHTML(j.conteudo||'').replace(/\n/g,'<br>')}</div>${ehMestreDaCampanhaAtual()?`<div class="jornal-acoes"><button type="button" onclick="abrirEditorJornal('${j.id}')">✏️ Editar</button><button type="button" class="btn-perigo" onclick="excluirJornal('${j.id}')">🗑️ Apagar</button></div>`:''}</article>`).join(''):'<div class="estado-galeria">Nenhuma notícia encontrada.</div>';
  const btn=document.getElementById('btn-novo-jornal');if(btn)btn.style.display=ehMestreDaCampanhaAtual()&&obterCampanhaIdAtual()?'':'none';
}
function abrirEditorJornal(id=null){if(!ehMestreDaCampanhaAtual())return;const x=jornaisDados.find(v=>v.id===id)||{};const el=document.getElementById('painel-editor-jornal');if(!el)return;el.style.display='block';el.innerHTML=`<h3>${id?'✏️ Editar notícia':'📰 Nova edição'}</h3><div class="jornal-editor-grid"><label>Título<input id="jornal-titulo" maxlength="140" value="${escaparHTML(x.titulo||'')}" placeholder="Ex.: Fronteiras de Frostheim são fechadas"></label><label>Categoria<select id="jornal-cat">${['Política','Guerra','Economia','Monstros','Magia','Guildas','Reinos','Mundo','Urgente','Rumor'].map(v=>`<option ${x.categoria===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Região<input id="jornal-regiao-input" maxlength="80" value="${escaparHTML(x.regiao||'Mundo')}" placeholder="Ex.: Eryndor"></label><label>Importância (1–5)<input id="jornal-importancia" type="number" min="1" max="5" value="${Number(x.importancia||3)}"></label></div><label>Manchete / subtítulo<input id="jornal-manchete" maxlength="240" value="${escaparHTML(x.manchete||'')}"></label><label>Notícia<textarea id="jornal-conteudo" rows="9" maxlength="6000" placeholder="Escreva o acontecimento que os jogadores poderão ler.">${escaparHTML(x.conteudo||'')}</textarea></label><div class="jornal-editor-acoes"><button type="button" class="btn-ficha-principal" onclick="salvarJornal('${id||''}')">📢 Publicar</button><button type="button" class="btn-secundario" onclick="fecharEditorJornal()">Cancelar</button></div>`;el.scrollIntoView({behavior:'smooth',block:'nearest'});}
function fecharEditorJornal(){const el=document.getElementById('painel-editor-jornal');if(el){el.style.display='none';el.innerHTML='';}}
async function salvarJornal(id=''){if(!ehMestreDaCampanhaAtual()||!supabaseClient||!obterCampanhaIdAtual())return;const payload={campanha_id:obterCampanhaIdAtual(),titulo:normalizarTextoEconomia(document.getElementById('jornal-titulo')?.value),categoria:document.getElementById('jornal-cat')?.value||'Mundo',regiao:normalizarTextoEconomia(document.getElementById('jornal-regiao-input')?.value)||'Mundo',importancia:Math.max(1,Math.min(5,Number(document.getElementById('jornal-importancia')?.value)||3)),manchete:document.getElementById('jornal-manchete')?.value.trim()||'',conteudo:document.getElementById('jornal-conteudo')?.value.trim()||'',publicado:true,publicado_em:new Date().toISOString(),criado_por:window.usuarioAtualId};if(!payload.titulo||!payload.conteudo)return mostrarPopup('❌ Preencha o título e a notícia.');const r=id?await supabaseClient.from('jornais_campanha').update(payload).eq('id',id).eq('campanha_id',obterCampanhaIdAtual()):await supabaseClient.from('jornais_campanha').insert(payload);if(r.error)return mostrarPopup('❌ '+r.error.message);fecharEditorJornal();await carregarJornaisAtual(true);transmitirJornal();mostrarPopup('📰 Notícia publicada para a campanha.');}
async function excluirJornal(id){if(!ehMestreDaCampanhaAtual()||!confirm('Apagar esta notícia?'))return;const r=await supabaseClient.from('jornais_campanha').delete().eq('id',id).eq('campanha_id',obterCampanhaIdAtual());if(r.error)return mostrarPopup('❌ '+r.error.message);await carregarJornaisAtual(true);}
function transmitirJornal(){if(canalMesa)canalMesa.send({type:'broadcast',event:'jornal_atualizado',payload:{campanha_id:obterCampanhaIdAtual(),quando:Date.now()}});}
function resetarDadosEconomiaJornalAoTrocarCampanha(){economiaCarregadaCampanha=null;jornaisCarregadosCampanha=null;economiaDados={mercados:[],itens:[],eventos:[]};jornaisDados=[];fecharEditorEconomia();fecharEditorJornal();}

// --- CALENDÁRIO DAS BRASAS — ÉTER & BRASAS ---
const CALENDARIO_BRASAS = {
  diasAno: 365,
  diasMes: 36,
  meses: [
    ['Brasal','mês das brasas novas'],['Ventor','mês dos ventos e rotas'],['Nimbro','mês das chuvas e comércio'],
    ['Folhar','mês das colheitas verdes'],['Sombral','mês dos segredos e intrigas'],['Glaciar','mês do frio profundo'],
    ['Aural','mês das auroras e revelações'],['Sevar','mês das separações e julgamentos'],['Ignis','mês do fogo, batalhas e invenções'],['Astra','mês das estrelas e profecias']
  ],
  semana: ['Aurora','Ferra','Trama','Rumo','Vela','Eco'],
  festivais: {
    37:['Fornalha Nova','juramentos, forjas, inícios'],
    146:['Semeadura','bênção da terra, plantio'],
    219:['Veio do Gelo','resistência, lendas'],
    292:['Colheita & Brumas','máscaras, intriga'],
    365:['Brasas Altas','contratos eternos, renovações']
  }
};
let calendarioDados = { ano:1, dia:1 };
let calendarioCarregadoCampanha = null;

function sistemaEhEterBrasas(){ return Boolean(MAMUS_STATE.campaign.current && MAMUS_STATE.system.current?.configuracao?.tipo === 'eter_brasas'); }
function diaNormalCalendario(dia){ return Number(dia) >= 1 && Number(dia) <= 365 && !CALENDARIO_BRASAS.festivais[Number(dia)]; }
function obterInfoDiaCalendario(dia){
  dia = Math.max(1, Math.min(365, Number(dia)||1));
  const semana = CALENDARIO_BRASAS.semana[(dia-1)%6];
  const festival = CALENDARIO_BRASAS.festivais[dia];
  if(festival) return { dia, semana, festival:true, nome:festival[0], descricao:festival[1], mes:null, diaMes:null };
  let restante = dia;
  for(let i=0;i<CALENDARIO_BRASAS.meses.length;i++){
    if(i===0){ if(restante<=36) return {dia,semana,festival:false,mes:i,diaMes:restante}; restante-=36; }
    else {
      // Dias Livres ocupam as posições oficiais definidas pelo manual.
      const antesDoFestival = [146,219,292,365].includes(dia) ? 0 : 0;
      const inicio = [38,74,110,147,183,220,256,293,329][i-1];
      const fim = inicio+35;
      if(dia>=inicio && dia<=fim) return {dia,semana,festival:false,mes:i,diaMes:dia-inicio+1};
    }
  }
  return {dia,semana,festival:false,mes:9,diaMes:36};
}
function nomeDataCalendario(ano,dia){
  const info=obterInfoDiaCalendario(dia);
  if(info.festival) return {titulo:`Ano ${ano} • Dia Livre`, detalhe:`${info.nome} • ${info.descricao}`, info};
  const mes=CALENDARIO_BRASAS.meses[info.mes];
  return {titulo:`Ano ${ano} • ${mes[0]}, dia ${info.diaMes}`, detalhe:`${info.semana} • ${mes[1]}`, info};
}
function renderizarCalendario(){
  const painel=document.getElementById('calendario-painel'), vazio=document.getElementById('calendario-sem-campanha');
  if(!painel||!vazio)return;
  if(!sistemaEhEterBrasas()){painel.style.display='none';vazio.style.display='block';return;}
  painel.style.display='block';vazio.style.display='none';
  const d=nomeDataCalendario(calendarioDados.ano,calendarioDados.dia);
  const t=document.getElementById('calendario-data-titulo'), det=document.getElementById('calendario-data-detalhe');
  if(t)t.textContent=d.titulo; if(det)det.textContent=d.detalhe;
  const yt=document.getElementById('calendario-ano-titulo'); if(yt)yt.textContent=`Ano ${calendarioDados.ano}`;
  const ctrl=document.getElementById('calendario-controles-mestre'); if(ctrl)ctrl.style.display=ehMestreDaCampanhaAtual()?'flex':'none';
  const resumo=document.getElementById('calendario-resumo');
  if(resumo){ resumo.innerHTML=`<div><span>Ano</span><strong>${calendarioDados.ano}</strong></div><div><span>Dia do ano</span><strong>${calendarioDados.dia}/365</strong></div><div><span>Semana</span><strong>${escaparHTML(d.info.semana)}</strong></div><div><span>Próximo marco</span><strong>${escaparHTML(proximoMarcoCalendario(calendarioDados.dia))}</strong></div>`; }
  const legenda=document.getElementById('calendario-legenda');
  if(legenda){ legenda.innerHTML=`<span>☀️ Aurora</span><span>⚒️ Ferra</span><span>🧵 Trama</span><span>🧭 Rumo</span><span>🕯️ Vela</span><span>🔔 Eco</span><span>🎉 Dia Livre</span>`; }
  const anoEl=document.getElementById('calendario-ano'); if(!anoEl)return;
  let html='';
  const blocos=[
    {mes:0,inicio:1},{mes:1,inicio:38},{mes:2,inicio:74},{mes:3,inicio:110},{festival:37},
    {mes:4,inicio:147},{mes:5,inicio:183},{festival:146},{mes:6,inicio:220},{mes:7,inicio:256},{festival:219},
    {mes:8,inicio:293},{mes:9,inicio:329},{festival:292},{festival:365}
  ];
  blocos.forEach(b=>{
    if(b.festival){ const f=CALENDARIO_BRASAS.festivais[b.festival]; html+=`<article class="calendario-festival ${calendarioDados.dia===b.festival?'atual':''}"><span>🎉 DIA LIVRE</span><strong>${escaparHTML(f[0])}</strong><small>Dia ${b.festival} • ${escaparHTML(f[1])}</small></article>`; return; }
    const m=CALENDARIO_BRASAS.meses[b.mes]; html+=`<article class="calendario-mes"><header><div><span>${String(b.mes+1).padStart(2,'0')}</span><strong>${escaparHTML(m[0])}</strong></div><small>${escaparHTML(m[1])}</small></header><div class="calendario-semana">${CALENDARIO_BRASAS.semana.map(x=>`<span>${escaparHTML(x)}</span>`).join('')}</div><div class="calendario-grade">`;
    for(let i=0;i<36;i++){ const dia=b.inicio+i; const ativo=dia===calendarioDados.dia; const wk=CALENDARIO_BRASAS.semana[i%6]; html+=`<button type="button" class="calendario-dia ${ativo?'atual':''}" ${ehMestreDaCampanhaAtual()?`onclick="definirDiaCalendario(${dia})"`:''} title="${escaparHTML(wk)}">${i+1}</button>`; }
    html+='</div></article>';
  });
  anoEl.innerHTML=html;
}
function proximoMarcoCalendario(dia){ const ds=Object.keys(CALENDARIO_BRASAS.festivais).map(Number).filter(x=>x>dia); if(ds.length){const x=Math.min(...ds);return `${CALENDARIO_BRASAS.festivais[x][0]} (dia ${x})`;} return 'Brasal do próximo ano (dia 37)'; }
async function carregarCalendarioAtual(force=false){
  if(!sistemaEhEterBrasas()){renderizarCalendario();return;}
  const id=obterCampanhaIdAtual(); if(!id){renderizarCalendario();return;}
  if(!force&&calendarioCarregadoCampanha===id){renderizarCalendario();return;}
  calendarioCarregadoCampanha=id;
  if(!supabaseClient){renderizarCalendario();return;}
  const r=await supabaseClient.from('calendario_campanha').select('ano,dia_do_ano').eq('campanha_id',id).maybeSingle();
  if(r.error){console.error('Calendário:',r.error);renderizarCalendario();return;}
  if(r.data){calendarioDados={ano:Math.max(1,Number(r.data.ano)||1),dia:Math.max(1,Math.min(365,Number(r.data.dia_do_ano)||1))};}
  else if(ehMestreDaCampanhaAtual()){ const ins=await supabaseClient.from('calendario_campanha').insert({campanha_id:id,ano:1,dia_do_ano:1,atualizado_por:window.usuarioAtualId}).select('ano,dia_do_ano').single(); if(!ins.error&&ins.data) calendarioDados={ano:1,dia:1}; }
  renderizarCalendario();
}
async function salvarCalendarioAtual(){
  if(!ehMestreDaCampanhaAtual()||!supabaseClient||!obterCampanhaIdAtual())return;
  const id=obterCampanhaIdAtual();
  const p={campanha_id:id,ano:calendarioDados.ano,dia_do_ano:calendarioDados.dia,atualizado_por:window.usuarioAtualId};
  const r=await supabaseClient.from('calendario_campanha').update({ano:p.ano,dia_do_ano:p.dia,atualizado_por:p.atualizado_por}).eq('campanha_id',id);
  if(r.error)return mostrarPopup('❌ Não foi possível atualizar o calendário: '+r.error.message);
  transmitirCalendario(); renderizarCalendario();
}
async function definirDiaCalendario(dia){ if(!ehMestreDaCampanhaAtual()||!sistemaEhEterBrasas())return; calendarioDados.dia=Math.max(1,Math.min(365,Number(dia)||1)); await salvarCalendarioAtual(); }
async function alterarDiaCalendario(delta){ if(!ehMestreDaCampanhaAtual()||!sistemaEhEterBrasas())return; let d=calendarioDados.dia+Number(delta||0),a=calendarioDados.ano; if(d>365){d=1;a++;} if(d<1){d=365;a=Math.max(1,a-1);} calendarioDados={ano:a,dia:d}; await salvarCalendarioAtual(); }
async function mudarAnoCalendario(delta){ if(!ehMestreDaCampanhaAtual()||!sistemaEhEterBrasas())return; calendarioDados.ano=Math.max(1,calendarioDados.ano+Number(delta||0)); await salvarCalendarioAtual(); }
function transmitirCalendario(){if(canalMesa)canalMesa.send({type:'broadcast',event:'calendario_atualizado',payload:{campanha_id:obterCampanhaIdAtual(),ano:calendarioDados.ano,dia_do_ano:calendarioDados.dia,quando:Date.now()}});}
function resetarCalendarioAoTrocarCampanha(){calendarioCarregadoCampanha=null;calendarioDados={ano:1,dia:1};}


// Economia e Jornais pertencem ao sistema Éter & Brasas e ao mundo da
// campanha ativa. Eles NÃO são abas globais do VTT.
function campanhaUsaEterBrasas() {
  const cfg = MAMUS_STATE.system.current?.configuracao || {};
  return !!MAMUS_STATE.campaign.current && (
    cfg.tipo === 'eter_brasas' ||
    /éter\s*&\s*brasas/i.test(MAMUS_STATE.system.current?.nome || '') ||
    /eter\s*&\s*brasas/i.test(MAMUS_STATE.system.current?.nome || '')
  );
}

function garantirAbasEconomiaJornaisVisiveis() {
  const disponiveis = campanhaUsaEterBrasas();
  ['economia','jornais','calendario'].forEach(nome => {
    const btn = document.getElementById(`btn-aba-${nome}`);
    if (!btn) return;
    if (disponiveis) {
      btn.style.setProperty('display', 'inline-flex', 'important');
      btn.style.setProperty('visibility', 'visible', 'important');
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
      btn.removeAttribute('aria-hidden');
    } else {
      btn.style.setProperty('display', 'none', 'important');
      btn.style.setProperty('visibility', 'hidden', 'important');
      btn.style.setProperty('opacity', '0', 'important');
      btn.style.setProperty('pointer-events', 'none', 'important');
      btn.setAttribute('aria-hidden', 'true');
      btn.classList.remove('ativo');
    }
  });

  const btnNoct = document.getElementById('btn-aba-noctavell');
  const disponivelNoct = Boolean(MAMUS_STATE.campaign.current && MAMUS_STATE.system.current?.configuracao?.tipo === 'noctavell');
  if (btnNoct) {
    if (disponivelNoct) {
      btnNoct.style.setProperty('display','inline-flex','important'); btnNoct.style.setProperty('visibility','visible','important'); btnNoct.style.setProperty('opacity','1','important'); btnNoct.style.setProperty('pointer-events','auto','important'); btnNoct.removeAttribute('aria-hidden');
    } else {
      btnNoct.style.setProperty('display','none','important'); btnNoct.style.setProperty('visibility','hidden','important'); btnNoct.style.setProperty('opacity','0','important'); btnNoct.style.setProperty('pointer-events','none','important'); btnNoct.setAttribute('aria-hidden','true'); btnNoct.classList.remove('ativo');
    }
  }
  if (!disponiveis && (MAMUS_STATE.ui.currentTab === 'economia' || MAMUS_STATE.ui.currentTab === 'jornais' || MAMUS_STATE.ui.currentTab === 'calendario')) mudarAba('ficha');
  if (!disponivelNoct && MAMUS_STATE.ui.currentTab === 'noctavell') mudarAba('ficha');
}


// --- CENTRAL NOCTAVELL ---
const NOCTAVELL_FACES = {
  1:['⚖️ Equilíbrio','Sucesso parcial com custo.'],2:['🔥 Ruptura','Sucesso forte, mas com tensão ou risco oculto.'],
  3:['🌑 Silêncio','Falha; nada acontece ou o efeito se anula.'],4:['🔯 Eco','O Véu responde com efeito secundário inesperado.'],
  5:['🔑 Verdade','Sucesso total com elegância.'],6:['👁️ Olho do Véu','Sucesso crítico + revelação ou conhecimento oculto.']
};
function sistemaEhNoctavell(){ return Boolean(MAMUS_STATE.campaign.current && MAMUS_STATE.system.current?.configuracao?.tipo === 'noctavell'); }
function rolarDadoNoctavell(){
  if(!sistemaEhNoctavell()) return mostrarPopup('🕯️ Selecione uma campanha Noctavell.');
  const n=1+Math.floor(Math.random()*6), f=NOCTAVELL_FACES[n], el=document.getElementById('noctavell-resultado-dado');
  if(el) el.innerHTML=`<b>${f[0]}</b><br><span class="texto-vazio">${f[1]}</span>`;
  try{ supabaseClient?.channel?.('sala-rpg-geral')?.send({type:'broadcast',event:'noctavell_dado',payload:{campanha_id:obterCampanhaIdAtual(),resultado:n,rotulo:f[0]}}); }catch(e){}
  return n;
}
function batidaNoctavell(nome){
  if(!sistemaEhNoctavell()) return;
  localStorage.setItem('noctavell_batida_'+obterCampanhaIdAtual(),nome);
  mostrarPopup('🕯️ Batida atual: '+nome);
}
async function carregarTrabalhosNoctavell(){
  const box=document.getElementById('noctavell-trabalhos-lista'); if(!box||!sistemaEhNoctavell()) return;
  if(!supabaseClient){box.innerHTML='<p class="texto-vazio">Supabase indisponível.</p>';return;}
  const {data,error}=await supabaseClient.from('noctavell_trabalhos').select('*').eq('campanha_id',obterCampanhaIdAtual()).order('criado_em',{ascending:false});
  if(error){box.innerHTML='<p class="texto-vazio">Aplique o SQL Noctavell para ativar o quadro compartilhado.</p>';return;}
  box.innerHTML=data?.length?data.map(t=>`<div class="item-galeria"><strong>Grau ${escaparHTML(t.grau)} · ${escaparHTML(t.titulo)}</strong><p>${escaparHTML(t.descricao||'')}</p><small>Recompensa: ${escaparHTML(t.recompensa||'—')} · Prazo: ${escaparHTML(t.prazo||'—')}</small><br><small>Status: ${escaparHTML(t.status)}</small></div>`).join(''):'<p class="texto-vazio">Nenhum trabalho disponível.</p>';
}
async function novoTrabalhoNoctavell(){
  if(!ehMestreDaCampanhaAtual()||!sistemaEhNoctavell()) return mostrarPopup('👑 Apenas o Mestre pode criar trabalhos Noctavell.');
  const titulo=prompt('Título do trabalho'); if(!titulo)return;
  const grau=prompt('Grau I–V','I')||'I', descricao=prompt('Descrição')||'', recompensa=prompt('Recompensa')||'', penalidade=prompt('Penalidade por quebra/falha')||'', prazo=prompt('Prazo')||'';
  const {data:{session}}=await supabaseClient.auth.getSession();
  const {error}=await supabaseClient.from('noctavell_trabalhos').insert({campanha_id:obterCampanhaIdAtual(),titulo,grau,descricao,recompensa,penalidade,prazo,criado_por:session?.user?.id});
  if(error)return mostrarPopup('❌ Quadro Noctavell não configurado: '+error.message);
  mostrarPopup('📜 Trabalho criado.'); carregarTrabalhosNoctavell();
}

// --- SESSÕES E DIÁRIO ---
function sessaoEhEditavel(){
  return Boolean(MAMUS_STATE.session.current?.status === 'aberta' && MAMUS_STATE.campaign.current?.status !== 'encerrada');
}

function nomeUsuarioAtual(){
  return document.getElementById('user-nick-display')?.innerText?.trim() || 'Jogador';
}

function atualizarStatusSessaoUI(){
  const aberta = MAMUS_STATE.session.current?.status === 'aberta';
  const labelDiario = document.getElementById('status-diario-sessao');
  const labelMestre = document.getElementById('status-sessao-mestre');
  const labelSessao = document.getElementById('diario-sessao-label');
  const statusTexto = aberta ? `🎬 Sessão ${MAMUS_STATE.session.current.numero} aberta` : (MAMUS_STATE.session.current ? `📕 Sessão ${MAMUS_STATE.session.current.numero} encerrada` : 'Sem sessão aberta');
  if(labelDiario){ labelDiario.textContent=statusTexto; labelDiario.classList.toggle('status-sessao-aberta', aberta); labelDiario.classList.toggle('status-sessao-encerrada', !!MAMUS_STATE.session.current && !aberta); }
  if(labelMestre){ labelMestre.textContent=statusTexto; labelMestre.classList.toggle('status-sessao-aberta', aberta); labelMestre.classList.toggle('status-sessao-encerrada', !!MAMUS_STATE.session.current && !aberta); }
  if(labelSessao) labelSessao.textContent=MAMUS_STATE.session.current ? `Sessão ${MAMUS_STATE.session.current.numero} · ${MAMUS_STATE.session.current.status === 'aberta' ? 'em andamento' : 'encerrada'}` : 'Nenhuma sessão selecionada';
}

async function carregarSessaoAtual(){
  if(!supabaseClient || !obterCampanhaIdAtual()) { MAMUS_STATE.session.current=null; atualizarStatusSessaoUI(); return null; }
  const {data,error}=await supabaseClient.from('sessoes_campanha').select('*').eq('campanha_id',obterCampanhaIdAtual()).eq('status','aberta').order('numero',{ascending:false}).limit(1).maybeSingle();
  if(error){ console.warn('Sessões não configuradas:',error); MAMUS_STATE.session.current=null; atualizarStatusSessaoUI(); return null; }
  MAMUS_STATE.session.current=data||null;
  atualizarStatusSessaoUI();
  renderizarControleSessaoMestre();
  atualizarEditorDiarioUI();
  return MAMUS_STATE.session.current;
}

async function iniciarSessao(){
  if(!ehMestreDaCampanhaAtual() || !supabaseClient || !obterCampanhaIdAtual()) return mostrarPopup('❌ Apenas o Mestre pode iniciar uma sessão em uma campanha ativa.');
  if(MAMUS_STATE.campaign.current?.status==='encerrada') return mostrarPopup('🔒 Esta campanha está encerrada.');
  await carregarSessaoAtual();
  if(MAMUS_STATE.session.current) return mostrarPopup(`🎬 A Sessão ${MAMUS_STATE.session.current.numero} já está aberta.`);
  const nome=prompt('🎬 Nome opcional da sessão:', `Sessão ${(sessoesCampanha.length||0)+1}`);
  if(nome===null) return;
  const {data:ultima}=await supabaseClient.from('sessoes_campanha').select('numero').eq('campanha_id',obterCampanhaIdAtual()).order('numero',{ascending:false}).limit(1).maybeSingle();
  const numero=(Number(ultima?.numero)||0)+1;
  const {data:{session}}=await supabaseClient.auth.getSession();
  const {data,error}=await supabaseClient.from('sessoes_campanha').insert({campanha_id:obterCampanhaIdAtual(),numero,nome:nome.trim().slice(0,120)||`Sessão ${numero}`,status:'aberta',iniciada_em:new Date().toISOString(),iniciada_por:session?.user?.id}).select('*').single();
  if(error) return mostrarPopup('❌ Não foi possível iniciar a sessão: '+error.message);
  MAMUS_STATE.session.current=data; centralAdicionarAtividade('🎬', `Sessão ${numero} iniciada`, data.nome || ''); tocarSom('success'); vibrarPadrao([30,40,30]);
  atualizarStatusSessaoUI(); renderizarControleSessaoMestre(); atualizarEditorDiarioUI();
  if(MAMUS_STATE.ui.currentTab==='sessoes') carregarSessoesCampanha();
  mostrarPopup(`🎬 Sessão ${numero} iniciada! As rolagens e diários agora serão catalogados nela.`);
  if(canalMesa) canalMesa.send({type:'broadcast',event:'sessao_atualizada',payload:{campanha_id:obterCampanhaIdAtual(),sessao_id:data.id,status:'aberta',numero:data.numero,nome:data.nome}});
}

async function encerrarSessao(){
  if(!ehMestreDaCampanhaAtual() || !supabaseClient || !MAMUS_STATE.session.current?.id) return;
  if(!confirm(`Encerrar a Sessão ${MAMUS_STATE.session.current.numero}?\n\nAs rolagens e diários já salvos permanecerão no histórico.`)) return;
  const {data,error}=await supabaseClient.from('sessoes_campanha').update({status:'encerrada',encerrada_em:new Date().toISOString()}).eq('id',MAMUS_STATE.session.current.id).eq('campanha_id',obterCampanhaIdAtual()).select('*').single();
  if(error) return mostrarPopup('❌ Não foi possível encerrar a sessão: '+error.message);
  const {count:rolagens}=await supabaseClient.from('sessao_rolagens').select('id',{count:'exact',head:true}).eq('sessao_id',data.id);
  const {count:diarios}=await supabaseClient.from('sessao_diarios').select('id',{count:'exact',head:true}).eq('sessao_id',data.id);
  const {data:final}=await supabaseClient.from('sessoes_campanha').update({total_rolagens:rolagens||0,total_diarios:diarios||0}).eq('id',data.id).select('*').single();
  MAMUS_STATE.session.current=final||data; centralAdicionarAtividade('📕', `Sessão ${MAMUS_STATE.session.current.numero} encerrada`, MAMUS_STATE.session.current.nome || ''); atualizarStatusSessaoUI(); atualizarEditorDiarioUI(); renderizarControleSessaoMestre();
  if(MAMUS_STATE.ui.currentTab==='sessoes') carregarSessoesCampanha();
  mostrarPopup(`📕 Sessão ${MAMUS_STATE.session.current.numero} encerrada. ${rolagens||0} rolagens e ${diarios||0} diários catalogados.`);
  if(canalMesa) canalMesa.send({type:'broadcast',event:'sessao_atualizada',payload:{campanha_id:obterCampanhaIdAtual(),sessao_id:MAMUS_STATE.session.current.id,status:'encerrada',numero:MAMUS_STATE.session.current.numero}});
}

function renderizarControleSessaoMestre(){
  const box=document.getElementById('painel-controle-sessao'); if(!box) return;
  if(!ehMestreDaCampanhaAtual()){box.style.display='none';return;}
  box.style.display='block';
  if(!MAMUS_STATE.campaign.current){box.innerHTML='<p>Selecione uma campanha.</p>';return;}
  if(MAMUS_STATE.campaign.current.status==='encerrada') { box.innerHTML='<div class="sessao-controle"><div><h3>🔒 Campanha encerrada</h3><p>Não é possível iniciar novas sessões.</p></div></div>'; return; }
  if(MAMUS_STATE.session.current?.status==='aberta') box.innerHTML=`<div class="sessao-controle"><div><h3>🎬 Sessão ${MAMUS_STATE.session.current.numero} em andamento</h3><p>${escaparHTML(MAMUS_STATE.session.current.nome||'Sessão')} · iniciada em ${new Date(MAMUS_STATE.session.current.iniciada_em).toLocaleString('pt-BR')}</p></div><button type="button" class="btn-encerrar-campanha" onclick="encerrarSessao()">📕 Encerrar Sessão</button></div>`;
  else box.innerHTML='<div class="sessao-controle"><div><h3>🕯️ A mesa está pronta</h3><p>Inicie uma sessão para começar a registrar automaticamente rolagens e diários.</p></div><button type="button" class="btn-ficha-principal" onclick="iniciarSessao()">🎬 Iniciar Sessão</button></div>';
}

async function carregarSessoesCampanha(){
  const lista=document.getElementById('lista-sessoes-campanha'); if(!lista) return;
  if(!ehMestreDaCampanhaAtual()){lista.innerHTML='<p>Apenas o Mestre possui o controle completo das sessões.</p>';return;}
  if(!obterCampanhaIdAtual()){lista.innerHTML='<div class="estado-galeria">Selecione uma campanha.</div>';return;}
  const {data,error}=await supabaseClient.from('sessoes_campanha').select('*').eq('campanha_id',obterCampanhaIdAtual()).order('numero',{ascending:false});
  if(error){lista.innerHTML='<div class="estado-galeria">Execute o SQL das sessões no Supabase para ativar este módulo.</div>';return;}
  sessoesCampanha=data||[];
  renderizarControleSessaoMestre(); atualizarStatusSessaoUI();
  lista.innerHTML=sessoesCampanha.length?sessoesCampanha.map(x=>`<article class="card-campanha"><div class="card-campanha-conteudo"><span class="card-campanha-icone">${x.status==='aberta'?'🎬':'📕'}</span><div><h3>Sessão ${Number(x.numero)||0} ${x.status==='aberta'?'<span class="status-campanha">🟢 Aberta</span>':'<span class="status-campanha encerrada">📕 Encerrada</span>'}</h3><p>${escaparHTML(x.nome||`Sessão ${x.numero}`)}</p><span class="card-campanha-meta">Início: ${x.iniciada_em?new Date(x.iniciada_em).toLocaleString('pt-BR'):'—'} · ${x.encerrada_em?'Fim: '+new Date(x.encerrada_em).toLocaleString('pt-BR'):'Em andamento'}</span></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-selecionar-campanha" onclick="abrirDetalhesSessao('${x.id}')">📖 Ver registros</button>${x.status==='aberta'&&MAMUS_STATE.session.current?.id===x.id?'<button type="button" class="btn-encerrar-campanha" onclick="encerrarSessao()">📕 Encerrar</button>':''}</div></article>`).join(''):'<div class="estado-galeria">Nenhuma sessão registrada nesta campanha.</div>';
}

async function registrarRolagemNaSessao(descricao,resultado){
  if(!supabaseClient || !MAMUS_STATE.session.current?.id || MAMUS_STATE.session.current.status!=='aberta') return;
  const {error}=await supabaseClient.from('sessao_rolagens').insert({sessao_id:MAMUS_STATE.session.current.id,campanha_id:obterCampanhaIdAtual(),user_id:window.usuarioAtualId,nick:nomeUsuarioAtual(),descricao:String(descricao||'').slice(0,500),resultado:String(resultado??'').slice(0,1000)});
  if(error) console.warn('Não foi possível catalogar a rolagem:',error);
}

function atualizarEditorDiarioUI(){
  const sem=document.getElementById('diario-sem-sessao'), editor=document.getElementById('painel-diario-editor');
  if(!sem||!editor) return;
  const editavel=sessaoEhEditavel();
  sem.style.display=MAMUS_STATE.session.current?'none':'block';
  editor.style.display=MAMUS_STATE.session.current?'block':'none';
  ['diario-titulo','diario-conteudo','diario-arquivos'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=!editavel;});
  const btn=editor.querySelector('.btn-ficha-principal'); if(btn) btn.disabled=!editavel;
}

async function carregarDiarioAtual(){
  if(!supabaseClient || !obterCampanhaIdAtual()) return atualizarEditorDiarioUI();
  if(!MAMUS_STATE.session.current) await carregarSessaoAtual();
  if(!MAMUS_STATE.session.current){ atualizarEditorDiarioUI(); carregarHistoricoDiarioPessoal(); return; }
  const {data,error}=await supabaseClient.from('sessao_diarios').select('*').eq('sessao_id',MAMUS_STATE.session.current.id).eq('user_id',window.usuarioAtualId).maybeSingle();
  if(error){ console.warn('Diário indisponível:',error); mostrarPopup('❌ Execute o SQL das sessões para ativar o diário.'); return; }
  diarioAtual=data||null; diarioImagens=Array.isArray(data?.imagens)?data.imagens:[];
  const titulo=document.getElementById('diario-titulo'), conteudo=document.getElementById('diario-conteudo');
  if(titulo) titulo.value=data?.titulo||''; if(conteudo) conteudo.value=data?.conteudo||'';
  const ultima=document.getElementById('diario-ultima-salvacao'); if(ultima) ultima.textContent=data?.atualizado_em?`Salvo em ${new Date(data.atualizado_em).toLocaleString('pt-BR')}`:'Ainda não salvo nesta sessão.';
  renderizarImagensDiario(); atualizarEditorDiarioUI(); atualizarStatusSessaoUI(); carregarHistoricoDiarioPessoal();
}

async function salvarDiarioAtual(mostrarFeedback=true){
  if(!supabaseClient || !sessaoEhEditavel()) return mostrarPopup('🕯️ O diário só pode ser editado durante uma sessão aberta.');
  const titulo=document.getElementById('diario-titulo')?.value.trim()||'Registro da sessão';
  const conteudo=document.getElementById('diario-conteudo')?.value||'';
  const {data:{session}}=await supabaseClient.auth.getSession();
  const payload={sessao_id:MAMUS_STATE.session.current.id,campanha_id:obterCampanhaIdAtual(),user_id:session?.user?.id,autor_nick:nomeUsuarioAtual(),titulo:titulo.slice(0,120),conteudo:conteudo.slice(0,30000),imagens:diarioImagens,atualizado_em:new Date().toISOString()};
  const {data,error}=await supabaseClient.from('sessao_diarios').upsert(payload,{onConflict:'sessao_id,user_id'}).select('*').single();
  if(error) return mostrarPopup('❌ Não foi possível salvar o diário: '+error.message);
  diarioAtual=data;
  const ultima=document.getElementById('diario-ultima-salvacao'); if(ultima) ultima.textContent=`Salvo em ${new Date(data.atualizado_em).toLocaleString('pt-BR')}`;
  if(mostrarFeedback){ tocarSom('success'); mostrarPopup('📔 Diário salvo na sessão.'); }
}

async function adicionarImagensDiario(event){
  if(!sessaoEhEditavel()) return;
  const files=Array.from(event.target.files||[]); event.target.value='';
  if(!files.length) return;
  if(files.length>12 || diarioImagens.length+files.length>30) return mostrarPopup('❌ Limite de imagens do diário: 30.');
  for(const file of files){
    if(!file.type.startsWith('image/')) continue;
    if(file.size>8*1024*1024){ mostrarPopup(`⚠️ ${file.name} ignorada: máximo de 8 MB.`); continue; }
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`${obterCampanhaIdAtual()}/${MAMUS_STATE.session.current.id}/${window.usuarioAtualId}/${crypto.randomUUID?.()||Date.now()+Math.random().toString(16).slice(2)}.${ext}`;
    const {error}=await supabaseClient.storage.from('sessao-notas').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(error){console.warn(error);mostrarPopup('❌ Falha ao enviar '+file.name);continue;}
    diarioImagens.push({storage_path:path,nome:file.name.slice(0,160),tipo:file.type,tamanho:file.size});
  }
  renderizarImagensDiario(); await salvarDiarioAtual();
}

async function renderizarImagensDiario(){
  const box=document.getElementById('diario-imagens-preview'); if(!box) return;
  box.innerHTML='';
  if(!diarioImagens.length){box.innerHTML='<div class="estado-galeria">Nenhuma imagem vinculada ainda.</div>';return;}
  for(let i=0;i<diarioImagens.length;i++){
    const img=diarioImagens[i]; let url='';
    if(img.url) url=img.url; else if(img.storage_path){const r=await supabaseClient.storage.from('sessao-notas').createSignedUrl(img.storage_path,3600);url=r.data?.signedUrl||'';}
    const card=document.createElement('div'); card.className='diario-imagem-card';
    card.innerHTML=`${url?`<img src="${escaparAtributoHTML(url)}" alt="${escaparAtributoHTML(img.nome||'Imagem do diário')}" loading="lazy">`:'<div style="padding:20px;text-align:center;color:#aaa">Imagem indisponível</div>'}<div class="diario-imagem-nome">${escaparHTML(img.nome||'Imagem')}</div>${sessaoEhEditavel()?`<button type="button" class="btn-perigo" onclick="removerImagemDiario(${i})">✕</button>`:''}`;
    box.appendChild(card);
  }
}

async function removerImagemDiario(index){
  if(!sessaoEhEditavel() || !diarioImagens[index]) return;
  const item=diarioImagens[index];
  if(!confirm(`Remover a imagem “${item.nome||'Imagem'}” do diário?`)) return;
  if(item.storage_path) await supabaseClient.storage.from('sessao-notas').remove([item.storage_path]);
  diarioImagens.splice(index,1); renderizarImagensDiario(); await salvarDiarioAtual();
}

async function carregarHistoricoDiarioPessoal(){
  const box=document.getElementById('lista-diario-historico'), painel=document.getElementById('diario-historico-pessoal'); if(!box||!painel) return;
  if(!supabaseClient||!obterCampanhaIdAtual()||!window.usuarioAtualId){painel.style.display='none';return;}
  const {data,error}=await supabaseClient.from('sessao_diarios').select('id,sessao_id,titulo,conteudo,imagens,atualizado_em,sessoes_campanha(numero,nome,encerrada_em)').eq('campanha_id',obterCampanhaIdAtual()).eq('user_id',window.usuarioAtualId).order('atualizado_em',{ascending:false}).limit(30);
  if(error){painel.style.display='none';return;}
  painel.style.display='block';
  box.innerHTML=data?.length?data.map(x=>`<article class="diario-registro"><h4>📔 ${escaparHTML(x.titulo||'Registro')}</h4><div class="diario-registro-meta">Sessão ${Number(x.sessoes_campanha?.numero)||'—'} · ${escaparHTML(x.sessoes_campanha?.nome||'')} · ${x.atualizado_em?new Date(x.atualizado_em).toLocaleString('pt-BR'):''}</div><div class="diario-registro-conteudo">${escaparHTML(x.conteudo||'')}</div><div class="diario-registro-imagens" data-diario-id="${x.id}"></div></article>`).join(''):'<div class="estado-galeria">Você ainda não possui registros de diário nesta campanha.</div>';
  for(const x of data||[]){
    const target=box.querySelector(`[data-diario-id="${x.id}"]`); if(!target) continue;
    for(const im of (Array.isArray(x.imagens)?x.imagens:[])){ const r=im.storage_path?await supabaseClient.storage.from('sessao-notas').createSignedUrl(im.storage_path,3600):{data:{signedUrl:im.url||''}}; if(r.data?.signedUrl){const el=document.createElement('img');el.src=r.data.signedUrl;el.alt=im.nome||'Imagem do diário';el.loading='lazy';target.appendChild(el);} }
  }
}

async function abrirDetalhesSessao(sessaoId){
  if(!ehMestreDaCampanhaAtual()||!supabaseClient) return;
  const box=document.getElementById('painel-detalhes-sessao'); if(!box) return;
  box.style.display='block'; box.innerHTML='<div class="estado-galeria">Carregando registros...</div>';
  const {data:diarios,error:e1}=await supabaseClient.from('sessao_diarios').select('*,sessoes_campanha(numero,nome)').eq('sessao_id',sessaoId).order('atualizado_em',{ascending:false});
  const {data:rolagens,error:e2}=await supabaseClient.from('sessao_rolagens').select('*').eq('sessao_id',sessaoId).order('criado_em',{ascending:true});
  if(e1||e2){box.innerHTML='<div class="estado-galeria">Não foi possível carregar os registros desta sessão.</div>';return;}
  const sess=sessoesCampanha.find(x=>x.id===sessaoId)||MAMUS_STATE.session.current;
  let html=`<div class="sessao-controle"><div><h3>📖 Sessão ${Number(sess?.numero)||'—'} · ${escaparHTML(sess?.nome||'')}</h3><p>${diarios?.length||0} diário(s) · ${rolagens?.length||0} rolagem(ns)</p></div><button type="button" class="btn-secundario" onclick="document.getElementById('painel-detalhes-sessao').style.display='none'">Fechar</button></div>`;
  html+=`<details class="sessao-detalhe" open><summary>🎲 Rolagens da sessão (${rolagens?.length||0})</summary>`;
  html+=rolagens?.length?rolagens.map(r=>`<div class="diario-registro"><div class="diario-registro-meta">${escaparHTML(r.nick||'Jogador')} · ${r.criado_em?new Date(r.criado_em).toLocaleString('pt-BR'):''}</div><strong>${escaparHTML(r.descricao||'Rolagem')}</strong><div class="diario-registro-conteudo">${escaparHTML(r.resultado||'')}</div></div>`).join(''):'<p class="estado-galeria">Nenhuma rolagem registrada.</p>';
  html+='</details><details class="sessao-detalhe" open><summary>📔 Diários dos jogadores (${diarios?.length||0})</summary>';
  html+=diarios?.length?diarios.map(d=>`<article class="diario-registro"><h4>📔 ${escaparHTML(d.titulo||'Registro')} — ${escaparHTML(d.autor_nick||'Jogador')}</h4><div class="diario-registro-meta">Salvo em ${d.atualizado_em?new Date(d.atualizado_em).toLocaleString('pt-BR'):''}</div><div class="diario-registro-conteudo">${escaparHTML(d.conteudo||'')}</div><div class="diario-registro-imagens" data-master-diario="${d.id}"></div></article>`).join(''):'<p class="estado-galeria">Nenhum diário salvo nesta sessão.</p>';
  html+='</details>'; box.innerHTML=html;
  for(const d of diarios||[]){ const target=box.querySelector(`[data-master-diario="${d.id}"]`); if(!target)continue; for(const im of (Array.isArray(d.imagens)?d.imagens:[])){const r=im.storage_path?await supabaseClient.storage.from('sessao-notas').createSignedUrl(im.storage_path,3600):{data:{signedUrl:im.url||''}};if(r.data?.signedUrl){const el=document.createElement('img');el.src=r.data.signedUrl;el.alt=im.nome||'Imagem do diário';el.loading='lazy';target.appendChild(el);}} }
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// --- BIBLIOTECA DE GUIAS DO RPG ---
const GUIAS_RPG = {
  legado: [
    {titulo:'⚔️ Crônicas de Camelot — Manual completo', arquivo:'guias/oficiais/cronicas-de-camelot-manual-completo.pdf', tipo:'pdf'}
  ],
  elarion: [
    {titulo:'💎 Elarion — PREMISSA — Sistema de Joias e Luvas — Manual completo', arquivo:'guias/oficiais/PREMISSA.pdf', tipo:'pdf'}
  ],
  world_trigger: [
    {titulo:'📖 Guia do Agente — RPG de Trion — Manual completo', arquivo:'guias/oficiais/world-trigger-guia-do-agente-completo.pdf', tipo:'pdf'}
  ],
  eter_brasas: [
    {titulo:'🔥 Éter & Brasas — Guia completo', arquivo:'guias/oficiais/eter-brasas-guia-jogador-2026.pdf', tipo:'pdf'}
  ],
  noctavell: [
    {titulo:'🕯️ Noctavell — Manual completo', arquivo:'guias/oficiais/noctavell-manual-completo.pdf', tipo:'pdf'}
  ],
  olimpia_pangeia: [
    {titulo:'🌌 Olímpia / Pangeia — Guia completo', arquivo:'guias/oficiais/olimpia-pangeia-guia-completo.pdf', tipo:'pdf'},
    {titulo:'📄 Olímpia / Pangeia — Documento original', arquivo:'guias/oficiais/olimpia-pangeia-guia-completo.docx', tipo:'doc'}
  ],
  sobreviventes_fronteira: [
    {titulo:'🌀 Sobreviventes da Fronteira — Manual completo', arquivo:'guias/oficiais/sobreviventes-da-fronteira-manual-completo.pdf', tipo:'pdf'}
  ],
  noites_em_tokyo: [
    {titulo:'🌃 Noites em Tokyo — Guia completo', arquivo:'https://mrlepre.github.io/Noites-em-Tokyo/', tipo:'html', externo:true}
  ]
};
function tipoSistemaParaGuias(){
  const tipo=MAMUS_STATE.system.current?.configuracao?.tipo; if(tipo&&GUIAS_RPG[tipo])return tipo;
  const nome=(MAMUS_STATE.system.current?.nome||'').toLowerCase();
  if(/noites\s+em\s+tokyo/.test(nome))return'noites_em_tokyo'; if(/world\s*trigger|trion/.test(nome))return'world_trigger'; if(/éter\s*&\s*brasas|eter\s*&\s*brasas/.test(nome))return'eter_brasas'; if(/noctavell/.test(nome))return'noctavell'; if(/olímpia|olimpia|pangeia/.test(nome))return'olimpia_pangeia'; if(/sobreviventes\s+da\s+fronteira/.test(nome))return'sobreviventes_fronteira'; if(/elarion/.test(nome))return'elarion'; if(/camelot/.test(nome))return'legado'; return null;
}
function garantirAbaGuiasVisivel(){
  const btn=document.getElementById('btn-aba-guias');
  if(!btn)return;
  // A aba pertence à campanha, não ao resultado momentâneo da resolução do sistema.
  // Mantê-la visível enquanto houver campanha evita sumiços por corrida de carregamento,
  // cache antigo ou sistema sem `configuracao.tipo` (o carregador faz fallback pelo nome).
  const ok=Boolean(MAMUS_STATE.campaign.current);
  btn.style.setProperty('display',ok?'flex':'none','important');
  btn.style.setProperty('visibility',ok?'visible':'hidden','important');
  btn.style.setProperty('opacity',ok?'1':'0','important');
  btn.style.setProperty('pointer-events',ok?'auto':'none','important');
  btn.setAttribute('aria-hidden',ok?'false':'true');
  if(!ok)btn.classList.remove('ativo');
  if(!ok&&MAMUS_STATE.ui.currentTab==='guias')mudarAba('ficha');
  // Recalcula o grupo depois de alterar a visibilidade para não deixar o grupo MUNDO
  // preso no estado `grupo-vazio` de antes da campanha ser selecionada.
  requestAnimationFrame(()=>atualizarGruposNavegacao());
}
function carregarGuiasRPG(){const lista=document.getElementById('guias-lista'),sub=document.getElementById('guias-subtitulo');if(!lista)return;const guias=GUIAS_RPG[tipoSistemaParaGuias()]||[];if(sub)sub.innerHTML=guias.length?`Materiais disponíveis para <strong>${escaparHTML(MAMUS_STATE.system.current?.nome||'Sistema RPG')}</strong>.`:'Nenhum guia cadastrado para este sistema.';lista.innerHTML=guias.length?guias.map((g,i)=>`<article class="guia-card"><div class="guia-card-icone">${g.tipo==='pdf'?'📕':g.tipo==='txt'?'📄':'📖'}</div><div class="guia-card-corpo"><h3>${escaparHTML(g.titulo)}</h3><p>${g.tipo==='pdf'?'Manual original em PDF':g.tipo==='txt'?'Material de referência rápido':'Guia integrado para leitura na mesa'}</p><button type="button" class="btn-acao" data-guia-index="${i}">Ler guia</button></div></article>`).join(''):'<div class="estado-galeria">Nenhum guia cadastrado para este sistema.</div>';lista.querySelectorAll('[data-guia-index]').forEach(b=>b.addEventListener('click',()=>abrirLeitorGuia(guias[Number(b.dataset.guiaIndex)])));}
function abrirLeitorGuia(g){if(!g)return;const leitor=document.getElementById('guia-leitor'),frame=document.getElementById('guia-iframe'),titulo=document.getElementById('guia-leitor-titulo'),link=document.getElementById('guia-abrir-original');if(!leitor||!frame)return;frame.src=g.arquivo;if(titulo)titulo.textContent=g.titulo;if(link)link.href=g.arquivo;leitor.style.display='block';const lista=document.getElementById('guias-lista');if(lista)lista.style.display='none';leitor.scrollIntoView({behavior:'smooth',block:'start'});}
function fecharLeitorGuia(){const leitor=document.getElementById('guia-leitor'),frame=document.getElementById('guia-iframe'),lista=document.getElementById('guias-lista');if(frame)frame.src='about:blank';if(leitor)leitor.style.display='none';if(lista)lista.style.display='grid';}

// --- NAVEGAÇÃO / SHELL DA APLICAÇÃO ---
function aplicarEstadoSidebar(recolhida, persistir = true) {
  const shell = document.getElementById('app-shell');
  const sidebar = document.getElementById('sidebar-navegacao');
  const botao = document.getElementById('btn-recolher-sidebar');
  if (!shell || !sidebar || !botao) return;

  const usarRecolhida = !!recolhida && window.innerWidth > 900;
  shell.classList.toggle('sidebar-recolhida', usarRecolhida);
  sidebar.classList.toggle('recolhida', usarRecolhida);

  botao.setAttribute('aria-expanded', String(!usarRecolhida));
  botao.setAttribute('aria-label', usarRecolhida ? 'Expandir menu lateral' : 'Recolher menu lateral');
  botao.title = usarRecolhida ? 'Expandir menu lateral' : 'Recolher menu lateral';
  botao.textContent = usarRecolhida ? '›' : '‹';

  sidebar.querySelectorAll('.abas-navegacao button[data-nav-group-item]').forEach(btn => {
    const label = btn.querySelector('span:nth-child(2)')?.textContent?.trim();
    if (label) btn.title = usarRecolhida ? label : '';
  });

  if (persistir) {
    try { localStorage.setItem('mamusboard_sidebar_recolhida', usarRecolhida ? '1' : '0'); } catch (err) {}
  }
}

function alternarSidebarNavegacao(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const shell = document.getElementById('app-shell');
  if (!shell) return;
  aplicarEstadoSidebar(!shell.classList.contains('sidebar-recolhida'), true);
}

function restaurarEstadoSidebar() {
  let recolhida = false;
  try { recolhida = localStorage.getItem('mamusboard_sidebar_recolhida') === '1'; } catch (err) {}
  aplicarEstadoSidebar(recolhida, false);
}

function prepararSidebarResponsiva() {
  const shell = document.getElementById('app-shell');
  const recolhida = shell?.classList.contains('sidebar-recolhida') || false;
  aplicarEstadoSidebar(recolhida, false);
}

function alternarMenuNavegacao(event) {
  if (event) event.stopPropagation();
  const sidebar = document.getElementById('sidebar-navegacao');
  const overlay = document.getElementById('overlay-menu-navegacao');
  const botao = document.getElementById('btn-menu-mobile');
  if (!sidebar || !overlay || !botao) return;
  const aberto = !sidebar.classList.contains('aberto');
  sidebar.classList.toggle('aberto', aberto);
  overlay.classList.toggle('aberto', aberto);
  overlay.setAttribute('aria-hidden', String(!aberto));
  botao.setAttribute('aria-expanded', String(aberto));
  botao.setAttribute('aria-label', aberto ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
  document.body.classList.toggle('menu-mobile-aberto', aberto);
}

function fecharMenuNavegacao() {
  const sidebar = document.getElementById('sidebar-navegacao');
  const overlay = document.getElementById('overlay-menu-navegacao');
  const botao = document.getElementById('btn-menu-mobile');
  sidebar?.classList.remove('aberto');
  overlay?.classList.remove('aberto');
  overlay?.setAttribute('aria-hidden', 'true');
  botao?.setAttribute('aria-expanded', 'false');
  botao?.setAttribute('aria-label', 'Abrir menu de navegação');
  document.body.classList.remove('menu-mobile-aberto');
}

function atualizarGruposNavegacao() {
  document.querySelectorAll('.nav-grupo').forEach(grupo => {
    const botoes = [...grupo.querySelectorAll('button[data-nav-group-item]')];
    if (!botoes.length) return;
    const visivel = botoes.some(btn => {
      const st = getComputedStyle(btn);
      return st.display !== 'none' && st.visibility !== 'hidden' && btn.offsetParent !== null;
    });
    grupo.classList.toggle('grupo-vazio', !visivel);
  });
}

function atualizarNavegacaoMobile() {
  atualizarGruposNavegacao();
}

window.addEventListener('resize', prepararSidebarResponsiva);
window.addEventListener('resize', () => garantirAbaGuiasVisivel());

// --- CENTRAL DA CAMPANHA ---
function escaparTextoCentral(valor) {
  return escaparHTML(valor ?? '');
}

function centralFormatarData() {
  if (!MAMUS_STATE.campaign.current) return { titulo: '—', detalhe: 'Selecione uma campanha' };
  try {
    if (typeof sistemaEhEterBrasas === 'function' && sistemaEhEterBrasas() && typeof nomeDataCalendario === 'function') {
      const data = nomeDataCalendario(calendarioDados.ano, calendarioDados.dia);
      return { titulo: data.titulo, detalhe: data.detalhe };
    }
  } catch (err) {}
  return { titulo: `Ano ${centralAnoGenerico()}`, detalhe: MAMUS_STATE.system.current?.nome || 'Sistema ativo' };
}

function centralAnoGenerico() {
  const possivel = Number(MAMUS_STATE.campaign.current?.ano_atual ?? MAMUS_STATE.campaign.current?.ano ?? 1);
  return Number.isFinite(possivel) && possivel > 0 ? possivel : 1;
}

const CENTRAL_DASHBOARDS = {
  legado: {
    titulo: 'Crônicas de Camelot',
    descricao: 'Mesa medieval, personagens, mapa e recursos da campanha.',
    badge: '⚔️ Camelot',
    widgets: [
      {icon:'🛡️', titulo:'Minha Ficha', texto:'Personagem, atributos e evolução.', aba:'ficha'},
      {icon:'🗺️', titulo:'Mesa Tática', texto:'Mapa, grid, tokens e HP.', aba:'mapa'},
      {icon:'🎲', titulo:'Rolagens', texto:'Dados e histórico da mesa.', aba:'rolagens'}
    ]
  },
  elarion: {
    titulo: 'Elarion — Sistema de Joias e Luvas',
    descricao: 'A Central destaca os elementos mais importantes de Elarion: Joias, Luvas e progressão.',
    badge: '💎 Elarion',
    widgets: [
      {icon:'💎', titulo:'Joias', texto:'Consulte a ficha para acompanhar suas Joias e combinações.', aba:'ficha'},
      {icon:'🧤', titulo:'Luvas', texto:'Acompanhe sua fase e evolução da Luva.', aba:'ficha'},
      {icon:'📈', titulo:'Progressão', texto:'Evolução do personagem e melhorias.', aba:'ficha'},
      {icon:'📖', titulo:'Bestiário', texto:'Criaturas disponíveis e criação de tokens.', aba:'bestiario'}
    ]
  },
  eter_brasas: {
    titulo: 'Éter & Brasas',
    descricao: 'O painel do sistema reúne calendário, economia e notícias do mundo.',
    badge: '🔥 Éter & Brasas',
    widgets: [
      {icon:'🗓️', titulo:'Calendário', texto:'Ano, dia atual e marcos do calendário.', aba:'calendario'},
      {icon:'💰', titulo:'Economia', texto:'Mercados, mercadorias e eventos econômicos.', aba:'economia'},
      {icon:'📰', titulo:'Jornais', texto:'Últimos acontecimentos publicados na campanha.', aba:'jornais'},
      {icon:'📖', titulo:'Bestiário', texto:'Criaturas e criação de tokens.', aba:'bestiario'}
    ]
  },
  noctavell: {
    titulo: 'Noctavell',
    descricao: 'O painel destaca Véu, Pactos e recursos sobrenaturais do personagem.',
    badge: '🕯️ Noctavell',
    widgets: [
      {icon:'🕯️', titulo:'Véu', texto:'Acessar os módulos sobrenaturais da campanha.', aba:'noctavell'},
      {icon:'👁️', titulo:'Entidades', texto:'Consultar as entidades e informações do Véu.', aba:'noctavell'},
      {icon:'🧠', titulo:'Sanidade', texto:'Acompanhar a situação do personagem.', aba:'ficha'},
      {icon:'🤝', titulo:'Pactos', texto:'Gerenciar informações do personagem.', aba:'noctavell'}
    ]
  },
  olimpia_pangeia: {
    titulo: 'Olímpia — Pangeia',
    descricao: 'A Central prioriza personagem, progressão e exploração do mundo.',
    badge: '🌌 Pangeia',
    widgets: [
      {icon:'⚔️', titulo:'Classe', texto:'Abrir ficha e acompanhar classe e estilo.', aba:'ficha'},
      {icon:'💎', titulo:'Jóias', texto:'Abrir ficha para acompanhar as Joias.', aba:'ficha'},
      {icon:'📈', titulo:'Progressão', texto:'Nível, XP e evolução do personagem.', aba:'ficha'},
      {icon:'🗺️', titulo:'Mapa', texto:'Explorar a mesa e o mundo da campanha.', aba:'mapa'}
    ]
  },
  sobreviventes_fronteira: {
    titulo: 'Sobreviventes da Fronteira',
    descricao: 'Painel focado em progressão, órbitas, Moldagem de Mana e sobrevivência.',
    badge: '🌀 Sobreviventes',
    widgets: [
      {icon:'🧱', titulo:'Linhagem', texto:'Grau de Linhagem e progressão.', aba:'ficha'},
      {icon:'🌌', titulo:'Órbitas', texto:'Acompanhar a construção do personagem.', aba:'ficha'},
      {icon:'✨', titulo:'Moldagem de Mana', texto:'Consultar e evoluir técnicas.', aba:'ficha'},
      {icon:'🗺️', titulo:'Mapa', texto:'Abrir a mesa tática.', aba:'mapa'}
    ]
  },
  noites_em_tokyo: {
    titulo: 'Noites em Tokyo',
    descricao: 'A Central destaca RC, Kagune, Fome, CCG e progressão.',
    badge: '🌃 Noites em Tokyo',
    widgets: [
      {icon:'🩸', titulo:'RC / Kakuja', texto:'Abrir ficha para acompanhar RC e evolução.', aba:'ficha'},
      {icon:'👁️', titulo:'Kagune', texto:'Consultar a biologia e o combate.', aba:'ficha'},
      {icon:'🍖', titulo:'Fome', texto:'Acompanhar Fome e recursos do personagem.', aba:'ficha'},
      {icon:'🏢', titulo:'CCG', texto:'Arquétipos, Quinques e informações do sistema.', aba:'ficha'}
    ]
  },
  world_trigger: {
    titulo: 'World Trigger RPG',
    descricao: 'Painel tático para agentes, Squads, Trion e leitura do campo.',
    badge: '⚡ World Trigger',
    widgets: [
      {icon:'👥', titulo:'Squad', texto:'Seu Squad, composição e NPCs.', aba:'ficha'},
      {icon:'📡', titulo:'Radar', texto:'Abrir a mesa para visualizar os sinais detectados.', aba:'mapa'},
      {icon:'🛡️', titulo:'Triggers', texto:'Consultar seu equipamento e configurações.', aba:'ficha'},
      {icon:'🗺️', titulo:'Mapa Tático', texto:'Campo de batalha, cobertura e FOV.', aba:'mapa'}
    ]
  }
};

function centralTipoSistema() {
  const tipo = String(MAMUS_STATE.system.current?.configuracao?.tipo || '').toLowerCase();
  if (CENTRAL_DASHBOARDS[tipo]) return tipo;
  const nome = String(MAMUS_STATE.system.current?.nome || '').toLowerCase();
  if (/world\s*trigger|trion/.test(nome)) return 'world_trigger';
  if (/noites\s+em\s+tokyo/.test(nome)) return 'noites_em_tokyo';
  if (/éter\s*&\s*brasas|eter\s*&\s*brasas/.test(nome)) return 'eter_brasas';
  if (/noctavell/.test(nome)) return 'noctavell';
  if (/olímpia|olimpia|pangeia/.test(nome)) return 'olimpia_pangeia';
  if (/sobreviventes\s+da\s+fronteira/.test(nome)) return 'sobreviventes_fronteira';
  if (/elarion/.test(nome)) return 'elarion';
  if (/camelot/.test(nome)) return 'legado';
  return 'generico';
}

function centralDashboardGenerico() {
  const cfg = MAMUS_STATE.system.current?.configuracao || {};
  const dados = Array.isArray(cfg.dados) ? cfg.dados : [];
  const atributos = Array.isArray(cfg.atributos) ? cfg.atributos : [];
  const recursos = Array.isArray(cfg.recursos) ? cfg.recursos : [];
  const pericias = Array.isArray(cfg.pericias) ? cfg.pericias : [];
  return {
    titulo: MAMUS_STATE.system.current?.nome || 'Sistema RPG',
    descricao: 'Painel gerado automaticamente a partir da configuração deste sistema.',
    badge: '⚙️ Sistema',
    widgets: [
      {icon:'👤', titulo:'Personagem', texto:`${atributos.length || 0} atributos · ${recursos.length || 0} recursos`, aba:'ficha'},
      {icon:'🎲', titulo:'Dados', texto:`${dados.length || 0} tipos de dado configurados`, aba:'rolagens'},
      {icon:'📚', titulo:'Perícias', texto:`${pericias.length || 0} perícias cadastradas`, aba:'ficha'},
      {icon:'🗺️', titulo:'Mesa', texto:'Mapa, tokens e sessão da campanha.', aba:'mapa'}
    ]
  };
}

function renderizarDashboardSistema() {
  const card = document.getElementById('central-sistema-card');
  const titulo = document.getElementById('central-sistema-titulo');
  const descricao = document.getElementById('central-sistema-descricao');
  const badge = document.getElementById('central-sistema-badge');
  const widgets = document.getElementById('central-sistema-widgets');
  if (!card || !widgets) return;

  if (!MAMUS_STATE.campaign.current || !MAMUS_STATE.system.current) {
    card.style.display = 'none';
    widgets.innerHTML = '';
    return;
  }

  const tipo = centralTipoSistema();
  const dashboard = CENTRAL_DASHBOARDS[tipo] || centralDashboardGenerico();
  card.style.display = 'block';
  if (titulo) titulo.textContent = dashboard.titulo;
  if (descricao) descricao.textContent = dashboard.descricao;
  if (badge) badge.textContent = dashboard.badge;

  widgets.innerHTML = dashboard.widgets.map(w => `
    <button type="button" class="central-sistema-widget" onclick="mudarAba('${escaparHTML(w.aba)}')">
      <span class="central-sistema-widget-icone">${w.icon}</span>
      <span class="central-sistema-widget-corpo"><strong>${escaparTextoCentral(w.titulo)}</strong><small>${escaparTextoCentral(w.texto)}</small></span>
      <span class="central-sistema-widget-seta">›</span>
    </button>
  `).join('');
}

function atualizarAcoesCentral() {
  const temCampanha = Boolean(MAMUS_STATE.campaign.current);
  ['central-btn-mapa','central-btn-rolagem'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !temCampanha;
    btn.title = temCampanha ? '' : 'Selecione uma campanha primeiro';
  });
  const botaoCalendario = document.querySelector('.central-lista-atalhos button[onclick*="calendario"]');
  const botaoBestiario = document.querySelector('.central-lista-atalhos button[onclick*="bestiario"]');
  if (botaoCalendario) {
    const disponivel = typeof sistemaEhEterBrasas === 'function' && sistemaEhEterBrasas();
    botaoCalendario.disabled = !disponivel;
    botaoCalendario.style.opacity = disponivel ? '' : '.45';
  }
  if (botaoBestiario) {
    const disponivel = Boolean(MAMUS_STATE.system.current && tipoSistemaComBestiario(MAMUS_STATE.system.current));
    botaoBestiario.disabled = !disponivel;
    botaoBestiario.style.opacity = disponivel ? '' : '.45';
  }
}

function tipoSistemaComBestiario(sistema) {
  const tipo = String(sistema?.configuracao?.tipo || '').toLowerCase();
  const nome = String(sistema?.nome || '').toLowerCase();
  return ['elarion','eter_brasas'].includes(tipo) || /elarion|éter\s*&\s*brasas|eter\s*&\s*brasas/.test(nome);
}


function centralLerValor(obj, caminhos) {
  for (const caminho of caminhos) {
    const partes = caminho.split('.');
    let atual = obj;
    for (const parte of partes) {
      if (atual == null) { atual = undefined; break; }
      atual = atual[parte];
    }
    if (atual !== undefined && atual !== null && String(atual).trim() !== '') return atual;
  }
  return null;
}

function centralEncontrarRecurso(dados) {
  const atual = centralLerValor(dados, [
    'vida_atual','pv_atual','hp_atual','vida.atual','pv.atual','hp.atual',
    'combate.vida.atual','combate.pv.atual','combate.hp.atual','recursos.pv.atual'
  ]);
  const max = centralLerValor(dados, [
    'vida_max','pv_max','hp_max','vida.max','pv.max','hp.max',
    'combate.vida.max','combate.pv.max','combate.hp.max','recursos.pv.max'
  ]);
  if (atual === null && max === null) return null;
  const a = Number(atual); const m = Number(max);
  return { atual: Number.isFinite(a) ? a : atual, max: Number.isFinite(m) && m > 0 ? m : max };
}

function centralEncontrarRecursoSecundario(dados) {
  const candidatos = [
    ['Vigor','vigor_atual','vigor_max'],
    ['Fadiga','fadiga_atual','fadiga_max'],
    ['Mana','mana_atual','mana_max'],
    ['Energia','energia_atual','energia_max'],
    ['Trion','trion_atual','trion_max'],
    ['RC','rc.atual','rc.max']
  ];
  for (const [nome, atualPath, maxPath] of candidatos) {
    const atual = centralLerValor(dados,[atualPath]);
    const max = centralLerValor(dados,[maxPath]);
    if (atual !== null || max !== null) return { nome, atual, max };
  }
  return null;
}

function centralEncontrarNivel(dados) {
  const valor = centralLerValor(dados,['nivel','nível','level','progressao.nivel','progressão.nivel']);
  return valor == null ? null : valor;
}

function centralEncontrarXP(dados) {
  const atual = centralLerValor(dados,['xp_atual','xp','experiencia','experiência','progressao.xp','progressão.xp']);
  const proximo = centralLerValor(dados,['xp_proximo_nivel','xp_proximo','proximo_nivel_xp','progressao.xp_proximo','progressão.xp_proximo']);
  return atual == null && proximo == null ? null : { atual, proximo };
}

function centralFormatarSalvamento() {
  if (fichaStatusCentral === 'nao_salva') return { classe:'central-save-status-alerta', texto:'● Alterações não salvas' };
  if (fichaStatusCentral === 'salvando') return { classe:'central-save-status-salvando', texto:'⟳ Salvando ficha...' };
  if (!fichaUltimoSalvamento) return { classe:'central-save-status-vazio', texto:'Sem ficha' };
  const data = new Date(fichaUltimoSalvamento);
  if (Number.isNaN(data.getTime())) return { classe:'central-save-status-ok', texto:'✓ Salva na nuvem' };
  return { classe:'central-save-status-ok', texto:`✓ Salva às ${data.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}` };
}

function centralRenderizarPersonagem() {
  const titulo = document.getElementById('central-personagem-titulo');
  const conteudo = document.getElementById('central-personagem-conteudo');
  const status = document.getElementById('central-ficha-status');
  const mestreCard = document.getElementById('central-mestre-card');
  const mestreJogadores = document.getElementById('central-mestre-jogadores');
  const mestreSessao = document.getElementById('central-mestre-sessao');
  const mestreMapa = document.getElementById('central-mestre-mapa');
  if (!titulo || !conteudo || !status) return;

  const salvar = centralFormatarSalvamento();
  status.className = `central-save-status ${salvar.classe}`;
  status.textContent = salvar.texto;

  if (!MAMUS_STATE.campaign.current || !dadosFichaAtual) {
    titulo.textContent = 'Nenhum personagem carregado';
    conteudo.innerHTML = `<div class="central-personagem-vazio"><span>👤</span><div><strong>${MAMUS_STATE.campaign.current ? 'Você ainda não possui uma ficha nesta campanha.' : 'Nenhuma campanha selecionada.'}</strong><p>${MAMUS_STATE.campaign.current ? 'Importe uma ficha existente ou crie seu personagem diretamente pela mesa.' : 'Escolha uma campanha para carregar o personagem correspondente.'}</p></div></div><div class="central-personagem-acoes">${MAMUS_STATE.campaign.current ? '<button type="button" class="btn-ficha-principal" onclick="mudarAba(\'ficha\')">👤 Abrir Minha Ficha</button>' : '<button type="button" class="btn-ficha-principal" onclick="mudarAba(\'campanhas\')">🏰 Escolher Campanha</button>'}</div>`;
  } else {
    const nome = centralLerValor(dadosFichaAtual,['nome','personagem_nome','identidade.nome']) || 'Personagem';
    const nivel = centralEncontrarNivel(dadosFichaAtual);
    const xp = centralEncontrarXP(dadosFichaAtual);
    const recurso = centralEncontrarRecurso(dadosFichaAtual);
    const secundario = centralEncontrarRecursoSecundario(dadosFichaAtual);
    const pct = recurso?.max && Number(recurso.max) > 0 ? Math.max(0,Math.min(100,(Number(recurso.atual)||0)/Number(recurso.max)*100)) : null;
    const xpTexto = xp ? `${escaparTextoCentral(xp.atual ?? '0')}${xp.proximo != null ? ` / ${escaparTextoCentral(xp.proximo)}` : ''}` : 'Não informado';
    titulo.textContent = nome;
    conteudo.innerHTML = `
      <div class="central-personagem-identidade"><div class="central-personagem-avatar">${nome.charAt(0).toUpperCase()}</div><div><strong>${escaparTextoCentral(nome)}</strong><small>${nivel != null ? `Nível ${escaparTextoCentral(nivel)}` : 'Personagem da campanha'}${MAMUS_STATE.system.current?.nome ? ` • ${escaparTextoCentral(MAMUS_STATE.system.current.nome)}` : ''}</small></div></div>
      <div class="central-personagem-metricas">
        <div class="central-personagem-metrica"><small>XP</small><strong>${xpTexto}</strong></div>
        ${recurso ? `<div class="central-personagem-metrica central-personagem-recurso"><small>PV / VIDA</small><strong>${escaparTextoCentral(recurso.atual)}${recurso.max != null ? ` / ${escaparTextoCentral(recurso.max)}` : ''}</strong>${pct != null ? `<div class="central-barra"><span style="width:${pct}%"></span></div>` : ''}</div>` : ''}
        ${secundario ? `<div class="central-personagem-metrica"><small>${escaparTextoCentral(secundario.nome)}</small><strong>${escaparTextoCentral(secundario.atual ?? '—')}${secundario.max != null ? ` / ${escaparTextoCentral(secundario.max)}` : ''}</strong></div>` : ''}
      </div>
      <div class="central-personagem-acoes"><button type="button" class="btn-ficha-principal" onclick="abrirFichaAtualCompleta()">📖 Abrir Ficha</button><button type="button" class="btn-secundario" onclick="abrirEditorFichaAtual()">✏️ Editar</button><button type="button" class="btn-secundario" onclick="mudarAba('ficha')">⚙️ Gerenciar</button></div>`;
  }

  if (mestreCard) {
    mestreCard.style.display = ehMestreDaCampanhaAtual() && MAMUS_STATE.campaign.current ? 'block' : 'none';
    if (ehMestreDaCampanhaAtual() && MAMUS_STATE.campaign.current) {
      if (mestreJogadores) mestreJogadores.textContent = centralResumoCache.dados?.totalFichas != null ? String(centralResumoCache.dados.totalFichas) : '—';
      if (mestreSessao) mestreSessao.textContent = MAMUS_STATE.session.current ? `#${MAMUS_STATE.session.current.numero}` : '—';
      if (mestreMapa) mestreMapa.textContent = centralResumoCache.dados?.temMapa ? 'Pronto' : '—';
    }
  }
}


function centralAtividadeStorageKey() {
  return `mamusboard_atividade_${obterCampanhaIdAtual() || 'sem-campanha'}`;
}

function carregarAtividadesCentral() {
  centralAtividades = [];
  if (!MAMUS_STATE.campaign.current) return;
  try {
    const salvo = JSON.parse(localStorage.getItem(centralAtividadeStorageKey()) || '[]');
    if (Array.isArray(salvo)) centralAtividades = salvo.slice(0, centralAtividadesMaximas);
  } catch (err) {}
}

function salvarAtividadesCentral() {
  if (!MAMUS_STATE.campaign.current) return;
  try { localStorage.setItem(centralAtividadeStorageKey(), JSON.stringify(centralAtividades.slice(0, centralAtividadesMaximas))); } catch (err) {}
}

function centralAdicionarAtividade(icone, texto, meta = '') {
  if (!MAMUS_STATE.campaign.current || !texto) return;
  const item = { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, icone: icone || '•', texto: String(texto).slice(0, 240), meta: String(meta || '').slice(0, 80), quando: new Date().toISOString() };
  centralAtividades.unshift(item);
  centralAtividades = centralAtividades.slice(0, centralAtividadesMaximas);
  salvarAtividadesCentral();
  renderizarAtividadesCentral();
}

function centralTempoRelativo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const horas = Math.floor(mins / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} d`;
}

function renderizarAtividadesCentral() {
  const box = document.getElementById('central-atividade');
  if (!box) return;
  if (!MAMUS_STATE.campaign.current) {
    box.innerHTML = '<p class="texto-vazio">Selecione uma campanha para acompanhar a atividade da mesa.</p>';
    return;
  }
  if (!centralAtividades.length) {
    box.innerHTML = '<div class="central-atividade-vazio"><p class="texto-vazio">Nenhuma atividade recente nesta campanha.</p></div>';
    return;
  }
  box.innerHTML = centralAtividades.slice(0, 10).map(a => `
    <div class="central-atividade-item">
      <span class="central-atividade-icone">${escaparHTML(a.icone)}</span>
      <div class="central-atividade-texto">${escaparHTML(a.texto)}${a.meta ? ` <strong>· ${escaparHTML(a.meta)}</strong>` : ''}</div>
      <span class="central-atividade-tempo">${escaparHTML(centralTempoRelativo(a.quando))}</span>
    </div>
  `).join('');
}

function limparAtividadeCentral() {
  centralAtividades = [];
  salvarAtividadesCentral();
  renderizarAtividadesCentral();
  mostrarPopup('🧹 Atividade recente limpa neste dispositivo.');
}

function renderizarCentralSessao() {
  const titulo = document.getElementById('central-sessao-titulo');
  const status = document.getElementById('central-sessao-status');
  const descricao = document.getElementById('central-sessao-descricao');
  const meta = document.getElementById('central-sessao-meta');
  const acoes = document.getElementById('central-sessao-acoes');
  if (!titulo || !status || !descricao || !meta || !acoes) return;
  meta.innerHTML = '';
  acoes.innerHTML = '';
  if (!MAMUS_STATE.campaign.current) {
    titulo.textContent = 'Selecione uma campanha';
    status.className = 'central-session-badge central-session-badge-vazia';
    status.textContent = 'SEM CAMPANHA';
    descricao.textContent = 'Escolha uma campanha para consultar a sessão atual.';
    return;
  }
  if (!MAMUS_STATE.session.current) {
    titulo.textContent = 'Nenhuma sessão iniciada';
    status.className = 'central-session-badge central-session-badge-vazia';
    status.textContent = 'AGUARDANDO';
    descricao.textContent = ehMestreDaCampanhaAtual() ? 'A mesa está pronta. Inicie uma sessão quando todos estiverem preparados.' : 'O Mestre ainda não iniciou uma sessão nesta campanha.';
    if (ehMestreDaCampanhaAtual() && MAMUS_STATE.campaign.current.status !== 'encerrada') acoes.innerHTML = '<button type="button" class="btn-ficha-principal" onclick="iniciarSessao()">🎬 Iniciar Sessão</button>';
    else acoes.innerHTML = '<button type="button" class="btn-secundario" onclick="mudarAba(\'sessoes\')">🎬 Ver Sessões</button>';
    return;
  }
  const aberta = MAMUS_STATE.session.current.status === 'aberta';
  titulo.textContent = `Sessão ${MAMUS_STATE.session.current.numero}${MAMUS_STATE.session.current.nome ? ` · ${MAMUS_STATE.session.current.nome}` : ''}`;
  status.className = `central-session-badge ${aberta ? 'central-session-badge-aberta' : 'central-session-badge-encerrada'}`;
  status.textContent = aberta ? '● AO VIVO' : 'ENCERRADA';
  descricao.textContent = aberta ? 'As rolagens e os diários estão sendo catalogados nesta sessão.' : 'Esta foi a última sessão selecionada para a campanha.';
  if (MAMUS_STATE.session.current.iniciada_em) meta.innerHTML += `<span>Início: ${escaparHTML(new Date(MAMUS_STATE.session.current.iniciada_em).toLocaleString('pt-BR'))}</span>`;
  if (MAMUS_STATE.session.current.encerrada_em) meta.innerHTML += `<span>Fim: ${escaparHTML(new Date(MAMUS_STATE.session.current.encerrada_em).toLocaleString('pt-BR'))}</span>`;
  if (MAMUS_STATE.session.current.total_rolagens != null) meta.innerHTML += `<span>🎲 ${escaparHTML(MAMUS_STATE.session.current.total_rolagens)} rolagens</span>`;
  if (MAMUS_STATE.session.current.total_diarios != null) meta.innerHTML += `<span>📔 ${escaparHTML(MAMUS_STATE.session.current.total_diarios)} diários</span>`;
  acoes.innerHTML = `<button type="button" class="btn-secundario" onclick="mudarAba('sessoes')">📖 Ver Sessão</button>${aberta && ehMestreDaCampanhaAtual() ? '<button type="button" class="btn-encerrar-campanha" onclick="encerrarSessao()">📕 Encerrar</button>' : ''}`;
}

function renderizarCentralCampanha(dados = centralResumoCache.dados || {}) {
  const titulo = document.getElementById('central-titulo');
  const subtitulo = document.getElementById('central-subtitulo');
  const semCampanha = document.getElementById('central-sem-campanha');
  const dataKpi = document.getElementById('central-kpi-data');
  const dataDetalhe = document.getElementById('central-kpi-data-detalhe');
  const sessaoKpi = document.getElementById('central-kpi-sessao');
  const sessaoDetalhe = document.getElementById('central-kpi-sessao-detalhe');
  const grupoKpi = document.getElementById('central-kpi-grupo');
  const mapaKpi = document.getElementById('central-kpi-mapa');
  const mapaDetalhe = document.getElementById('central-kpi-mapa-detalhe');
  const noticia = document.getElementById('central-ultima-noticia');
  const contexto = document.getElementById('contexto-campanha');

  if (!MAMUS_STATE.campaign.current) {
    if (titulo) titulo.textContent = 'Bem-vindo ao MaMuSBoaRD';
    if (subtitulo) subtitulo.textContent = 'Selecione uma campanha para abrir sua mesa virtual.';
    if (semCampanha) semCampanha.style.display = 'flex';
    if (dataKpi) dataKpi.textContent = '—';
    if (dataDetalhe) dataDetalhe.textContent = 'Selecione uma campanha';
    if (sessaoKpi) sessaoKpi.textContent = 'Nenhuma';
    if (sessaoDetalhe) sessaoDetalhe.textContent = 'Nenhuma sessão ativa';
    if (grupoKpi) grupoKpi.textContent = '—';
    if (mapaKpi) mapaKpi.textContent = '—';
    if (mapaDetalhe) mapaDetalhe.textContent = 'Selecione uma campanha';
    if (noticia) noticia.innerHTML = '<p class="texto-vazio">Selecione uma campanha para carregar as novidades.</p>';
    if (contexto) contexto.style.display = 'none';
    centralRenderizarPersonagem();
    atualizarAcoesCentral();
    return;
  }

  if (titulo) titulo.textContent = MAMUS_STATE.campaign.current.nome || 'Campanha';
  if (subtitulo) subtitulo.textContent = MAMUS_STATE.system.current?.nome ? `Sistema: ${MAMUS_STATE.system.current.nome} • Sua central de comando para esta mesa.` : 'Sua central de comando para esta mesa.';
  if (semCampanha) semCampanha.style.display = 'none';

  const data = centralFormatarData();
  if (dataKpi) dataKpi.textContent = data.titulo;
  if (dataDetalhe) dataDetalhe.textContent = data.detalhe;

  const sessao = MAMUS_STATE.session.current;
  if (sessaoKpi) sessaoKpi.textContent = sessao ? `#${sessao.numero}` : 'Nenhuma';
  if (sessaoDetalhe) sessaoDetalhe.textContent = sessao ? `${sessao.nome || `Sessão ${sessao.numero}`} • ${sessao.status === 'aberta' ? 'em andamento' : 'encerrada'}` : 'Nenhuma sessão ativa';

  if (grupoKpi) grupoKpi.textContent = dados.totalFichas != null ? String(dados.totalFichas) : '—';
  if (mapaKpi) mapaKpi.textContent = dados.temMapa ? 'Pronto' : 'Sem mapa';
  if (mapaDetalhe) mapaDetalhe.textContent = dados.temMapa ? (dados.nomeMapa || 'Mapa da campanha') : 'O Mestre ainda não publicou um mapa';

  if (noticia) {
    if (dados.ultimaNoticia) {
      noticia.innerHTML = `<article class="central-noticia-detalhe"><span>${escaparTextoCentral(dados.ultimaNoticia.categoria || 'Mundo')}</span><h4>${escaparTextoCentral(dados.ultimaNoticia.titulo || 'Notícia')}</h4><p>${escaparTextoCentral(dados.ultimaNoticia.manchete || dados.ultimaNoticia.conteudo || 'Sem resumo.')}</p><small>${escaparTextoCentral(dados.ultimaNoticia.regiao || 'Mundo')}</small></article>`;
    } else {
      noticia.innerHTML = '<p class="texto-vazio">Nenhuma notícia publicada nesta campanha.</p>';
    }
  }
  centralRenderizarPersonagem();
  renderizarCentralSessao();
  renderizarAtividadesCentral();
  atualizarAcoesCentral();
}

async function carregarResumoCentralCampanha(force = false) {
  if (!MAMUS_STATE.campaign.current || !supabaseClient) {
    renderizarCentralCampanha();
    return;
  }
  const id = obterCampanhaIdAtual();
  const agora = Date.now();
  if (!force && centralResumoCache.campanhaId === id && agora - centralResumoCache.atualizadoEm < 30000) {
    renderizarCentralCampanha(centralResumoCache.dados || {});
    return;
  }

  const dados = { totalFichas: null, temMapa: false, nomeMapa: '', ultimaNoticia: null };
  try {
    const [fichasRes, mapaRes, jornalRes, sessaoRes] = await Promise.all([
      supabaseClient.from('fichas').select('id', { count: 'exact', head: true }).eq('campanha_id', id),
      supabaseClient.from('mapas').select('url_mapa').eq('campanha_id', id).limit(1).maybeSingle(),
      supabaseClient.from('jornais_campanha').select('titulo,manchete,conteudo,categoria,regiao,publicado_em').eq('campanha_id', id).eq('publicado', true).order('publicado_em', { ascending: false }).limit(1).maybeSingle(),
      supabaseClient.from('sessoes_campanha').select('numero,nome,status,iniciada_em,encerrada_em,total_rolagens,total_diarios').eq('campanha_id', id).order('numero', { ascending: false }).limit(1).maybeSingle()
    ]);
    if (!fichasRes.error) dados.totalFichas = fichasRes.count ?? 0;
    if (!mapaRes.error && mapaRes.data?.url_mapa) { dados.temMapa = true; dados.nomeMapa = 'Mapa publicado'; }
    if (!jornalRes.error) dados.ultimaNoticia = jornalRes.data || null;
    if (!MAMUS_STATE.session.current && !sessaoRes.error && sessaoRes.data) MAMUS_STATE.session.current = sessaoRes.data;
    if (sessaoRes.data && centralAtividades.length === 0) {
      const s = sessaoRes.data;
      centralAtividades.push({id:`sessao_${s.numero}`,icone:s.status==='aberta'?'🎬':'📕',texto:`Sessão ${s.numero} ${s.status==='aberta'?'foi iniciada':'foi encerrada'}`,meta:s.nome||'',quando:s.encerrada_em||s.iniciada_em||new Date().toISOString()});
    }
    if (dados.ultimaNoticia && centralAtividades.length < centralAtividadesMaximas) {
      centralAtividades.push({id:`jornal_${dados.ultimaNoticia.publicado_em}`,icone:'📰',texto:`Novo jornal: ${dados.ultimaNoticia.titulo || 'Notícia publicada'}`,meta:dados.ultimaNoticia.regiao || '',quando:dados.ultimaNoticia.publicado_em || new Date().toISOString()});
    }
    centralAtividades = centralAtividades.slice(0, centralAtividadesMaximas);
    salvarAtividadesCentral();
  } catch (err) {
    console.warn('Resumo da central indisponível:', err);
  }
  centralResumoCache = { campanhaId: id, atualizadoEm: Date.now(), dados };
  renderizarCentralCampanha(dados);
}

// --- NAVEGAÇÃO DE ABAS ---
function mudarAba(nomeAba, evento) {
  const abasValidas = ['inicio', 'ficha', 'campanhas', 'sistemas', 'bestiario', 'guias', 'economia', 'jornais', 'calendario', 'noctavell', 'grupo', 'mapa', 'rolagens', 'diario', 'sessoes', 'galeria'];

  // PROTEÇÃO CONTRA ABERTURA ACIDENTAL DO SALÃO DE DADOS.
  // 'Rolagens' é uma ação deliberada: só entra por seu botão da navegação,
  // pela Central de Ações Rápidas, pelo atalho de teclado ou pela restauração
  // inicial da aba salva. Cliques/toques que escapem de overlays não podem
  // transformar uma chamada indevida em navegação para os dados.
  if (nomeAba === 'rolagens') {
    const botaoNav = evento?.currentTarget?.closest?.('.abas-navegacao button');
    const chamadaAutorizada = evento?.__navegacaoRolagensAutorizada === true;
    const permissao = window.__cronicasPermitirAbaRolagens;
    const permissaoValida = permissao && permissao.ate > Date.now();
    const restauracaoInicial = evento?.__restauracaoAbaSalva === true;
    if (!botaoNav && !chamadaAutorizada && !permissaoValida && !restauracaoInicial) {
      console.warn('Abertura de Rolagens bloqueada: origem não autorizada.');
      return;
    }
    window.__cronicasPermitirAbaRolagens = null;
  }
  if (!abasValidas.includes(nomeAba)) return;

  const paineis = document.querySelectorAll('.painel');
  paineis.forEach(p => p.classList.remove('ativo'));
  const botoes = document.querySelectorAll('.abas-navegacao button');
  botoes.forEach(b => b.classList.remove('ativo'));

  const abaAlvo = document.getElementById(`aba-${nomeAba}`) || document.getElementById(nomeAba);
  if (abaAlvo) abaAlvo.classList.add('ativo');

  if (evento && evento.currentTarget) {
    evento.currentTarget.classList.add('ativo');
  } else {
    const botaoAba = document.querySelector(`.abas-navegacao button[onclick*="'${nomeAba}'"]`);
    if (botaoAba) botaoAba.classList.add('ativo');
  }

  if (window.innerWidth <= 900) {
    fecharMenuNavegacao();
    fecharMenuMobileMais();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }
  MAMUS_STATE.ui.currentTab = nomeAba;
  atualizarNavegacaoMobile();
  try { localStorage.setItem('cronicas_camelot_aba', nomeAba); } catch (err) {}

  if (nomeAba === 'inicio') { renderizarCentralCampanha(); carregarResumoCentralCampanha(); }

  // Carregamento sob demanda: a mesa abre mais rápido e cada recurso é
  // consultado somente quando realmente é necessário.
  if (nomeAba === 'bestiario') { inicializarBestiarioElarion(); }
  if (nomeAba === 'guias') { carregarGuiasRPG(); }
  if (nomeAba === 'economia') { carregarEconomiaAtual(); }
  if (nomeAba === 'jornais') { carregarJornaisAtual(); }
  if (nomeAba === 'calendario') { carregarCalendarioAtual(); }
  if (nomeAba === 'noctavell') { carregarTrabalhosNoctavell(); }
  if (nomeAba === 'mapa' && !abasCarregadas.mapa && supabaseClient) {
    abasCarregadas.mapa = true;
    carregarMapaAtual();
  }
  if (nomeAba === 'diario' && supabaseClient) { carregarDiarioAtual(); }
  if (nomeAba === 'sessoes' && supabaseClient && ehMestreDaCampanhaAtual()) { carregarSessoesCampanha(); }
  if (nomeAba === 'galeria' && !abasCarregadas.galeria && supabaseClient) {
    abasCarregadas.galeria = true;
    carregarGaleria();
  }
  if (nomeAba === 'sistemas' && supabaseClient) {
    (async () => {
      if (usuarioAutenticado()) {
        await garantirSistemaElarion();
        await garantirSistemaEterBrasas();
        await garantirSistemaNoctavell(); garantirSistemaNoitesEmTokyo();
        await garantirSistemaOlimpia();
      await garantirSistemaSobreviventes();
      }
      await carregarSistemas();
    })();
  }
}

// --- FICHA DO PERSONAGEM ---
function importarArquivoJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      dadosFichaAtual = JSON.parse(e.target.result);
      fichaUltimoSalvamento = null;
      fichaStatusCentral = 'nao_salva';
      renderizarFichaNaTela(dadosFichaAtual);
      renderizarCentralCampanha();
      mostrarPopup('📄 Ficha JSON lida com sucesso! Clique em "Salvar na Nuvem".');
    } catch (err) {
      alert('Arquivo JSON inválido.');
    }
  };
  reader.readAsText(file);
}

async function salvarFichaNoSupabase(userIdDestino = null) {
  if (!supabaseClient) return alert('Supabase não conectado.');

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return alert('Você precisa estar logado para salvar sua ficha!');
  if (!dadosFichaAtual) return alert('Nenhuma ficha carregada para salvar.');

  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return alert('Selecione uma campanha antes de salvar a ficha.');

  const nomeChar = dadosFichaAtual.nome || dadosFichaAtual.personagem_nome || 'Personagem';
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
  const consultaExistente = await supabaseClient
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
    resultado = await supabaseClient
      .from('fichas')
      .update({
        nome_personagem: nomeChar,
        dados_ficha: dadosFichaAtual,
        updated_at: agora
      })
      .eq('id', consultaExistente.data.id)
      .eq('campanha_id', campanhaId)
      .select('id')
      .single();
  } else {
    // Primeira ficha deste jogador nesta campanha.
    resultado = await supabaseClient
      .from('fichas')
      .insert({
        user_id: idDestino,
        nome_personagem: nomeChar,
        dados_ficha: dadosFichaAtual,
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

  fichaUltimoSalvamento = agora;
  fichaStatusCentral = 'salva';
  centralAdicionarAtividade('👤', `${nomeChar} atualizou a ficha`, ehEdicaoMestre ? 'Mestre' : 'Meu personagem');
  renderizarCentralCampanha();
  mostrarPopup(
    ehEdicaoMestre
      ? '👑 Ficha do jogador atualizada pelo Mestre!'
      : '💾 Ficha salva na nuvem com sucesso!'
  );
}

async function carregarFichaDoUsuario(userId) {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
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
    dadosFichaAtual = data.dados_ficha;
    fichaUltimoSalvamento = data.updated_at || null;
    fichaStatusCentral = 'salva';
    renderizarFichaNaTela(dadosFichaAtual);
    renderizarCentralCampanha();
    if (worldTriggerAtivo()) { worldTriggerEstado.triggersAtivos = normalizarTriggersFichaWT(dadosFichaAtual); sincronizarSquadNPCsEstadoWT(dadosFichaAtual); salvarEstadoWorldTrigger(); renderizarPainelWTSeNecessario(); }
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
  if (!dadosFichaAtual) return mostrarPopup('❌ Nenhuma ficha carregada para editar.');
  const modal = document.getElementById('modal-criador-ficha');
  const iframe = document.getElementById('iframe-criador-ficha');
  if (!modal || !iframe) return;
  if (ehFichaLegadaAtual()) {
    iframe.src = 'ficha-editor.html?modo=edicao&t=' + Date.now();
    iframe.addEventListener('load', function carregarEdicaoLegadaUmaVez() {
      iframe.contentWindow.postMessage({ type: 'cronicas-camelot-carregar-ficha', dados: dadosFichaAtual, modo: 'edicao', userId: null }, window.location.origin);
    }, { once: true });
  } else {
    const arquivo = MAMUS_STATE.system.current?.configuracao?.tipo === 'eter_brasas' ? 'ficha-eter-brasas.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noctavell' ? 'ficha-noctavell.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'olimpia_pangeia' ? 'ficha-olimpia.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'sobreviventes_fronteira' ? 'ficha-sobreviventes.html' : (MAMUS_STATE.system.current?.configuracao?.tipo === 'noites_em_tokyo' ? 'ficha-noites-em-tokyo.html' : 'ficha-generica.html'))));
    abrirFichaGenericaNoIframe(iframe, arquivo + '?modo=edicao&sistema=' + encodeURIComponent(MAMUS_STATE.system.current.id) + '&t=' + Date.now(), MAMUS_STATE.system.current, dadosFichaAtual, 'edicao');
  }
  modal.style.display = 'flex';
}

function abrirEditorFicha(dados, userId = null) {
  if (!dados) return mostrarPopup('❌ Dados da ficha não encontrados.');
  const modal = document.getElementById('modal-criador-ficha');
  const iframe = document.getElementById('iframe-criador-ficha');
  if (!modal || !iframe) return;

  fichaEditandoUserId = userId;
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
  if (!dadosFichaAtual) return mostrarPopup('❌ Nenhuma ficha carregada.');
  const tituloElem = document.getElementById('modal-titulo-personagem');
  if (tituloElem) tituloElem.innerText = dadosFichaAtual.nome || dadosFichaAtual.personagem_nome || 'Ficha do Cavaleiro';
  abrirFichaCompletaNoIframe(dadosFichaAtual);
  const modal = document.getElementById('modal-ficha-grupo');
  if (modal) modal.style.display = 'flex';
}


// --- FICHAS DO GRUPO ---
async function carregarFichasDoGrupo() {
  if (!supabaseClient) return;
  const lista = document.getElementById('lista-fichas-grupo');
  if (!lista) return;
  lista.innerHTML = '<p style="color: #a8a8b3;">Carregando fichas dos cavaleiros...</p>';

  const { data: { session } } = await supabaseClient.auth.getSession();
  const meuUserId = session?.user?.id || null;

  const { data, error } = await supabaseClient
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
  if (!ehMestreDaCampanhaAtual() || !supabaseClient) return mostrarPopup('❌ Apenas o Mestre pode apagar fichas.');
  if (!fichaId) return mostrarPopup('❌ ID da ficha não encontrado.');
  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return mostrarPopup('❌ Selecione uma campanha antes de apagar a ficha.');
  if (!confirm(`Apagar a ficha de "${String(nomePersonagem).replace(/"/g, '\"')}" desta campanha?\n\nOs dados da ficha serão removidos da nuvem.`)) return;

  const { error } = await supabaseClient
    .from('fichas')
    .delete()
    .eq('id', fichaId)
    .eq('campanha_id', campanhaId);

  if (error) {
    console.error('Erro ao apagar ficha:', error);
    return mostrarPopup('❌ Não foi possível apagar a ficha: ' + error.message);
  }

  if (dadosFichaAtual && (dadosFichaAtual.nome === nomePersonagem || dadosFichaAtual.personagem_nome === nomePersonagem)) {
    dadosFichaAtual = null;
    const container = document.getElementById('container-ficha-carregada');
    if (container) container.innerHTML = '<p class="texto-vazio">A ficha foi removida pelo Mestre.</p>';
  }

  tocarSom('success');
  mostrarPopup('🗑️ Ficha apagada da campanha.');
  await carregarFichasDoGrupo();
  if (typeof carregarFichaDoUsuario === 'function') {
    const session = (await supabaseClient.auth.getSession()).data.session;
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

// --- MAPA E MINI-VTT (OTIMIZADO PARA MOBILE) ---
async function fazerUploadMapa() {
  if (!supabaseClient) return alert('Supabase não conectado.');
  const input = document.getElementById('arquivo-mapa');
  if (!input.files || input.files.length === 0) return alert('Selecione uma imagem para o mapa!');

  const file = input.files[0];
  if (!file.type.startsWith('image/')) return mostrarPopup('❌ O mapa precisa ser uma imagem.');
  if (file.size > 12 * 1024 * 1024) return mostrarPopup('❌ O mapa deve ter no máximo 12 MB.');
  const extensao = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `mapa_${Date.now()}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}.${extensao}`;

  const { error } = await supabaseClient.storage
    .from('galeria')
    .upload(fileName, file);

  if (error) return alert('Erro ao subir imagem: ' + error.message);

  const { data } = supabaseClient.storage
    .from('galeria')
    .getPublicUrl(fileName);
  const publicUrl = data.publicUrl;

  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return alert('Selecione uma campanha antes de publicar o mapa.');
  const { data: mapaExistente } = await supabaseClient.from('mapas').select('id').eq('campanha_id', campanhaId).limit(1).maybeSingle();
  if (mapaExistente?.id) await supabaseClient.from('mapas').update({ url_mapa: publicUrl }).eq('id', mapaExistente.id).eq('campanha_id', campanhaId);
  else await supabaseClient.from('mapas').insert({ url_mapa: publicUrl, campanha_id: campanhaId });

  exibirMapaNaTela(publicUrl);
  if (canalMesa) {
    canalMesa.send({ type: 'broadcast', event: 'novo_mapa', payload: { url: publicUrl, campanha_id: obterCampanhaIdAtual() } });
  }
  mostrarPopup('🗺️ Mapa atualizado com sucesso!');
}

async function carregarMapaAtual() {
  if (!supabaseClient) return;
  const campanhaId = obterCampanhaIdAtual();
  const container = document.getElementById('container-mapa');
  if (!campanhaId) {
    if (container) container.innerHTML = '<p class="estado-galeria">Selecione uma campanha para carregar o mapa.</p>';
    return;
  }

  // Sempre consulta o mapa vinculado explicitamente à campanha atual.
  const { data, error } = await supabaseClient
    .from('mapas')
    .select('id,url_mapa')
    .eq('campanha_id', campanhaId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar mapa da campanha:', error);
    if (container) {
      container.innerHTML = `
        <div class="estado-galeria">
          <strong>Não foi possível carregar o mapa.</strong><br>
          <small>${escaparHTML(error.message || 'Erro desconhecido do Supabase.')}</small>
        </div>`;
    }
    return;
  }

  if (data?.url_mapa) {
    exibirMapaNaTela(data.url_mapa);
    setTimeout(() => carregarTokensCampanha(true), 80);
    return;
  }

  // Compatibilidade com mapas antigos criados antes da arquitetura multicampanha:
  // se uma campanha de World Trigger ainda não tiver seu próprio mapa, procura
  // um único registro legado sem campanha. Não grava esse vínculo automaticamente.
  // Assim não há risco de mover um mapa entre campanhas silenciosamente.
  if (worldTriggerAtivo()) {
    const { data: legado, error: erroLegado } = await supabaseClient
      .from('mapas')
      .select('id,url_mapa')
      .is('campanha_id', null)
      .limit(2);

    if (!erroLegado && Array.isArray(legado) && legado.length === 1 && legado[0]?.url_mapa) {
      exibirMapaNaTela(legado[0].url_mapa);
      setTimeout(() => carregarTokensCampanha(true), 80);
      if (ehMestreDaCampanhaAtual()) mostrarPopup('🗺️ Mapa legado carregado. Publique um novo mapa para vinculá-lo a esta campanha World Trigger.');
      return;
    }
  }

  if (container) {
    container.innerHTML = `
      <div class="estado-galeria">
        <strong>🗺️ Nenhum mapa publicado nesta campanha.</strong><br>
        ${ehMestreDaCampanhaAtual() ? '<small>Use “Enviar Novo Mapa” no painel do Mestre para publicar o mapa desta campanha.</small>' : '<small>Aguarde o Mestre publicar o mapa da campanha.</small>'}
      </div>`;
  }
}

function exibirMapaNaTela(url) {
  const container = document.getElementById('container-mapa');
  if (!container) return;

  let zoomControlHTML = '';
  if (ehMestreDaCampanhaAtual()) {
    zoomControlHTML = `
      <div style="display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.85rem;">
        <span>Zoom:</span>
        <input type="range" min="50" max="300" value="${vttZoom}" oninput="alterarZoomMaster(this.value)" style="width: 80px; cursor: pointer;">
        <span id="zoom-label" style="color: #f3d075;">${vttZoom}%</span>
      </div>
      <button id="btn-cadeado-vtt" onclick="alternarMovimentoMapa()" style="background: ${vttMovimentoLivre ? '#04d361' : '#29292e'}; color: #fff; border: 1px solid #4a3d24; padding: 0.3rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
        ${vttMovimentoLivre ? '🔓 Desbloqueado' : '🔒 Travado'}
      </button>
    `;
  } else {
    zoomControlHTML = `
      <div style="display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.85rem;">
        <span>Zoom:</span>
        <span id="zoom-label" style="color: #f3d075;">${vttZoom}%</span>
      </div>
    `;
  }

  const alturaMapa = mapaModoImersivo ? '80vh' : '55vh';

  container.innerHTML = `
    <div style="margin-bottom: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: #18181b; padding: 8px; border-radius: 6px; border: 1px solid #29292e;">
      <button onclick="alternarGridVTT()" style="padding: 6px 10px; font-size: 0.85rem;">🗺️ Grelha</button>
      <button onclick="abrirModalConfigToken()" style="padding: 6px 10px; font-size: 0.85rem;">🛡️ Meu Token</button>

      ${zoomControlHTML}

      <div style="display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.85rem;">
        <span>Grid:</span>
        <input type="range" min="20" max="80" value="${vttGridTamanho}" oninput="ajustarGridTamanhoVTT(this.value)" style="width: 70px; cursor: pointer;">
        <span id="grid-size-label" style="color: #f3d075;">${vttGridTamanho}px</span>
      </div>
    </div>
    ${worldTriggerAtivo() ? '<div id="wt-mesa-painel-host">' + renderizarPainelWorldTrigger() + '</div>' : ''}
    
    <div id="vtt-canvas" class="vtt-wrapper" style="overflow: hidden; position: relative; width: 100%; height: ${alturaMapa}; border: 1px solid #29292e; border-radius: 6px; background: #0b0d12; display: flex; justify-content: center; align-items: center; touch-action: none; cursor: ${ehMestreDaCampanhaAtual() && vttMovimentoLivre ? 'grab' : 'crosshair'}; transition: height 0.3s ease;">
      <div id="vtt-mapa-scaler" style="position: relative; width: 100%; transform: translate(${vttPanX}px, ${vttPanY}px) scale(${vttZoom / 100}); transform-origin: center center; transition: transform 0.05s ease-out; display: flex; justify-content: center; align-items: center;">
        <img src="${escaparHTML(url)}" class="vtt-mapa-img" alt="Mapa Tático" decoding="async" fetchpriority="high" onload="renderizarObstaculosMapaWT(); renderizarFovWorldTrigger();" style="width: 100%; display: block; height: auto; pointer-events: none;">
        <div id="vtt-fov-camada" class="wt-fov-camada" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2;"></div>
        <div id="vtt-obstaculos-camada" class="wt-obstaculos-camada" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:3;"></div>
        <div id="vtt-grid-camada" class="vtt-grid ${gridAtivo ? 'ativo' : ''}" style="background-size: ${vttGridTamanho}px ${vttGridTamanho}px; position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;"></div>
        <div id="vtt-tokens-camada" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;"></div>
      </div>
    </div>
  `;

  configurarPanMapa();
  if (worldTriggerAtivo()) {
    const scalerTatico=document.getElementById('vtt-mapa-scaler');
    if(scalerTatico && !scalerTatico.dataset.taticaListener){ scalerTatico.dataset.taticaListener='true'; scalerTatico.addEventListener('click', editarCelulaMapaTaticoWT, true); }
    setTimeout(carregarMapaTaticoSupabaseWT, 50);
    renderizarPainelWTSeNecessario();
    atualizarEstadoTokenProprioWT();
    renderizarFovWorldTrigger();
    setTimeout(atualizarVisibilidadeTodosTokensWT, 0);
  }
  setTimeout(() => carregarTokensCampanha(), 40);
}

// Configura o arrasto (Pan) do mapa para o Mestre quando destravado
function configurarPanMapa() {
  const canvas = document.getElementById('vtt-canvas');
  if (!canvas) return;

  let estaMovendoMapa = false;
  let inicioX = 0;
  let inicioY = 0;

  const iniciarPan = (e) => {
    if (e.target.closest('.vtt-token')) return;
    
    if (ehMestreDaCampanhaAtual() && vttMovimentoLivre) {
      estaMovendoMapa = true;
      inicioX = (e.clientX || e.touches?.[0].clientX) - vttPanX;
      inicioY = (e.clientY || e.touches?.[0].clientY) - vttPanY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    } else {
      darPingNoMapa(e);
    }
  };

  const moverPan = (e) => {
    if (!estaMovendoMapa) return;
    const clientX = e.clientX || e.touches?.[0].clientX;
    const clientY = e.clientY || e.touches?.[0].clientY;

    vttPanX = clientX - inicioX;
    vttPanY = clientY - inicioY;

    atualizarTransformMapaVTT();
    e.preventDefault();
  };

  const pararPan = () => {
    if (estaMovendoMapa) {
      estaMovendoMapa = false;
      if (canvas) canvas.style.cursor = 'grab';
      
      if (canalMesa && ehMestreDaCampanhaAtual()) {
        canalMesa.send({
          type: 'broadcast',
          event: 'vtt_zoom',
          payload: { zoom: vttZoom, panX: vttPanX, panY: vttPanY, campanha_id: obterCampanhaIdAtual() }
        });
      }
    }
  };

  // Pointer Events funcionam para mouse, toque e caneta e evitam
  // listeners globais de touch que podem capturar/interferir com
  // cliques da interface no celular.
  canvas.onpointerdown = iniciarPan;
  canvas.onpointermove = moverPan;
  canvas.onpointerup = pararPan;
  canvas.onpointercancel = pararPan;

}


function alternarMovimentoMapa() {
  if (!ehMestreDaCampanhaAtual()) return;
  vttMovimentoLivre = !vttMovimentoLivre;
  
  const btn = document.getElementById('btn-cadeado-vtt');
  const canvas = document.getElementById('vtt-canvas');
  
  if (btn) {
    btn.style.background = vttMovimentoLivre ? '#04d361' : '#29292e';
    btn.innerText = vttMovimentoLivre ? '🔓 Desbloqueado' : '🔒 Travado';
  }
  if (canvas) {
    canvas.style.cursor = vttMovimentoLivre ? 'grab' : 'crosshair';
  }
  mostrarPopup(vttMovimentoLivre ? '🔓 Mapa destravado!' : '🔒 Mapa travado.');
}

function alternarGridVTT() {
  gridAtivo = !gridAtivo;
  const gridDiv = document.getElementById('vtt-grid-camada');
  if (gridDiv) {
    gridDiv.classList.toggle('ativo', gridAtivo);
  }
}

function alterarZoomMaster(valor) {
  if (!ehMestreDaCampanhaAtual()) return;
  vttZoom = parseInt(valor);
  atualizarTransformMapaVTT();

  if (canalMesa) {
    canalMesa.send({
      type: 'broadcast',
      event: 'vtt_zoom',
      payload: { zoom: vttZoom, panX: vttPanX, panY: vttPanY, campanha_id: obterCampanhaIdAtual() }
    });
  }
}

function atualizarTransformMapaVTT() {
  const label = document.getElementById('zoom-label');
  if (label) label.innerText = `${vttZoom}%`;

  const scaler = document.getElementById('vtt-mapa-scaler');
  if (scaler) {
    scaler.style.transform = `translate(${vttPanX}px, ${vttPanY}px) scale(${vttZoom / 100})`;
  }
}

function ajustarGridTamanhoVTT(valor) {
  vttGridTamanho = parseInt(valor);
  const label = document.getElementById('grid-size-label');
  if (label) label.innerText = `${vttGridTamanho}px`;

  const gridDiv = document.getElementById('vtt-grid-camada');
  if (gridDiv) {
    gridDiv.style.backgroundSize = `${vttGridTamanho}px ${vttGridTamanho}px`;
  }
}

function darPingNoMapa(event) {
  if (event.target.classList.contains('vtt-token') || vttMovimentoLivre) return;

  const canvas = document.getElementById('vtt-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  
  const clientX = event.clientX || event.touches?.[0]?.clientX;
  const clientY = event.clientY || event.touches?.[0]?.clientY;
  if (!clientX || !clientY) return;

  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;

  if (canalMesa) {
    canalMesa.send({
      type: 'broadcast',
      event: 'vtt_ping',
      payload: { x, y, campanha_id: obterCampanhaIdAtual() }
    });
  }
  criarEfeitoPing(x, y);
}

function criarEfeitoPing(x, y) {
  tocarSom('ping');
  vibrarPadrao([12]);
  const canvas = document.getElementById('vtt-canvas');
  if (!canvas) return;

  const ping = document.createElement('div');
  ping.className = 'vtt-ping';
  ping.style.left = `${x}%`;
  ping.style.top = `${y}%`;
  canvas.appendChild(ping);

  setTimeout(() => ping.remove(), 1000);
}

// --- MODAL DE CONFIGURAÇÃO DE TOKEN ---
async function abrirModalConfigToken() {
  if (worldTriggerAtivo()) { await carregarTriggersDaFichaWorldTrigger(); }
  let modal = document.getElementById('modal-config-token');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-config-token';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 15px; box-sizing: border-box;';
    document.body.appendChild(modal);
  }

  let imagensHtml = '<p style="color: #a8a8b3; font-size: 0.85rem;">Carregando galeria...</p>';
  if (supabaseClient) {
    const { data } = await supabaseClient.from('galeria_imagens').select('*').eq('campanha_id', obterCampanhaIdAtual()).order('criado_em', { ascending: false });
    if (data && data.length > 0) {
      imagensHtml = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; max-height: 120px; overflow-y: auto; background: #0b0d12; padding: 6px; border-radius: 4px; border: 1px solid #29292e;">
          ${data.map(img => `
            <div class="opcao-img-token" data-storage-path="${escaparAtributoHTML(img.storage_path || '')}" data-publico="${img.publico ? 'true' : 'false'}" onclick="selecionarImgToken('${img.url}', this)" style="cursor: pointer; border: 2px solid transparent; border-radius: 4px; overflow: hidden; height: 45px;">
              <img src="${img.url}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
          `).join('')}
        </div>
      `;
    } else {
      imagensHtml = '<p style="color: #a8a8b3; font-size: 0.85rem;">Nenhuma imagem na galeria.</p>';
    }
  }

  modal.innerHTML = `
    <div style="background: #151821; border: 2px solid #8257e5; padding: 15px; border-radius: 8px; width: 100%; max-width: 380px; color: #fff; font-family: 'EB Garamond', serif; box-sizing: border-box;">
      <h3 style="color: #f3d075; font-family: 'Cinzel', serif; margin-bottom: 10px; text-align: center; font-size: 1.2rem;">Configurar Meu Token</h3>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="display: block; font-size: 0.8rem; color: #e6ca88; margin-bottom: 2px;">Tamanho:</label>
          <select id="token-tamanho-select" style="width: 100%; padding: 6px; background: #0b0d12; color: #fff; border: 1px solid #4a3d24; border-radius: 4px; font-size: 0.85rem;">
            <option value="35">Pequeno</option>
            <option value="45" selected>Padrão</option>
            <option value="65">Médio</option>
            <option value="90">Gigante</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-size: 0.8rem; color: #e6ca88; margin-bottom: 2px;">HP Máximo:</label>
          <input type="number" id="token-hp-input" value="50" style="width: 100%; padding: 6px; background: #0b0d12; color: #fff; border: 1px solid #4a3d24; border-radius: 4px; font-size: 0.85rem; box-sizing: border-box;">
        </div>
      </div>
      ${worldTriggerAtivo() ? `<div style="display:grid; gap:7px; margin-bottom:10px; padding:9px; background:#08141e; border:1px solid #1e4f68; border-radius:5px;">
        <strong style="color:#69d3ff; font-size:.9rem;">🌐 Configuração World Trigger</strong>
        <label style="color:#e6ca88; font-size:.85rem;">Squad
          <input id="wt-token-squad-input" type="text" maxlength="40" value="${escaparHTML(worldTriggerEstado.meuSquad || '')}" placeholder="Ex.: A-01" style="width:100%; margin-top:3px; padding:6px; background:#0b0d12; color:#fff; border:1px solid #4a3d24; border-radius:4px; box-sizing:border-box;">
        </label>
        <label style="display:flex;align-items:center;gap:7px;color:#e6ca88;font-size:.85rem;"><input id="wt-token-bagworm" type="checkbox" ${worldTriggerEstado.bagworm?'checked':''} ${!worldTriggerEstado.triggersAtivos.some(x=>String(x).toLowerCase()==='bagworm')?'disabled':''}> Bagworm — fora do radar</label>
        <label style="display:flex;align-items:center;gap:7px;color:#e6ca88;font-size:.85rem;"><input id="wt-token-chameleon" type="checkbox" ${worldTriggerEstado.chameleon?'checked':''} ${!worldTriggerEstado.triggersAtivos.some(x=>String(x).toLowerCase()==='chameleon')?'disabled':''}> Chameleon — invisível</label>
        <div style="padding:7px;background:#071018;border:1px solid #1e4f68;border-radius:4px;"><strong style="color:#69d3ff;font-size:.82rem;">⚔️ Triggers da ficha</strong><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;">${(worldTriggerEstado.triggersAtivos||[]).length ? worldTriggerEstado.triggersAtivos.map(x=>`<span style="padding:4px 6px;border:1px solid #2d91bd;border-radius:4px;color:#d7f3ff;font-size:.78rem;">${escaparHTML(x)}</span>`).join('') : '<span style="color:#ffca70;font-size:.78rem;">Nenhum Trigger selecionado na ficha.</span>'}</div></div>
      </div>` : ''}

      <div style="margin-bottom: 8px;">
        <label style="display: block; font-size: 0.8rem; color: #e6ca88; margin-bottom: 2px;">Escolher Imagem:</label>
        <input type="hidden" id="token-url-escolhida" value=">
        <input type="hidden" id="token-imagem-storage-path" value=">
        <input type="hidden" id="token-imagem-bucket" value=">
        <input type="hidden" id="token-imagem-publico" value="true">
        ${imagensHtml}
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 0.8rem; color: #e6ca88; margin-bottom: 2px;">Ou Link Direto:</label>
        <input type="text" id="token-url-input" placeholder="https://..." oninput="document.getElementById('token-url-escolhida').value=this.value; document.getElementById('token-imagem-storage-path').value=''; document.getElementById('token-imagem-bucket').value=''; document.getElementById('token-imagem-publico').value='true'" style="width: 100%; padding: 6px; background: #0b0d12; color: #fff; border: 1px solid #4a3d24; border-radius: 4px; font-size: 0.85rem; box-sizing: border-box;">
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button onclick="document.getElementById('modal-config-token').style.display='none'" style="background: #29292e; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Cancelar</button>
        <button onclick="confirmarCriacaoToken()" style="background: #8257e5; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.85rem;">Salvar</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
}

function selecionarImgToken(url, elem) {
  document.querySelectorAll('.opcao-img-token').forEach(el => el.style.border = '2px solid transparent');
  elem.style.border = '2px solid #04d361';
  document.getElementById('token-url-escolhida').value = url;
  const storagePath = elem.dataset.storagePath || '';
  const bucket = elem.dataset.publico === 'false' ? 'galeria-privada' : 'galeria';
  const pathInput = document.getElementById('token-imagem-storage-path');
  const bucketInput = document.getElementById('token-imagem-bucket');
  const publicoInput = document.getElementById('token-imagem-publico');
  if (pathInput) pathInput.value = storagePath;
  if (bucketInput) bucketInput.value = bucket;
  if (publicoInput) publicoInput.value = elem.dataset.publico === 'false' ? 'false' : 'true';
  document.getElementById('token-url-input').value = url;
}

function confirmarCriacaoToken() {
  const tamanho = parseInt(document.getElementById('token-tamanho-select').value) || 45;
  const hpMax = parseInt(document.getElementById('token-hp-input').value) || 50;
  const imagem = document.getElementById('token-url-escolhida').value.trim();
  const imagemStoragePath = document.getElementById('token-imagem-storage-path')?.value || '';
  const imagemBucket = document.getElementById('token-imagem-bucket')?.value || '';
  const imagemPublico = document.getElementById('token-imagem-publico')?.value !== 'false';
  if (worldTriggerAtivo()) {
    worldTriggerEstado.meuSquad = String(document.getElementById('wt-token-squad-input')?.value || '').trim();
    worldTriggerEstado.bagworm = !!document.getElementById('wt-token-bagworm')?.checked && worldTriggerEstado.triggersAtivos.some(x=>String(x).toLowerCase()==='bagworm');
    worldTriggerEstado.chameleon = !!document.getElementById('wt-token-chameleon')?.checked && worldTriggerEstado.triggersAtivos.some(x=>String(x).toLowerCase()==='chameleon');
    salvarEstadoWorldTrigger();
  }
  document.getElementById('modal-config-token').style.display = 'none';
  
  executarAdicionarTokenMesa(tamanho, imagem, hpMax, hpMax, { storagePath: imagemStoragePath, bucket: imagemBucket, publico: imagemPublico });
}

async function executarAdicionarTokenMesa(tamanho = 45, imagem = '', hpMax = 50, hpAtual = 50, imagemMeta = {}) {
  const userNick = document.getElementById('user-nick-display')?.innerText || document.getElementById('auth-nick')?.value || 'Cavaleiro';
  const tokenID = 'token_' + (userNick.toLowerCase().replace(/[^a-z0-9]/g, '_'));

  if (worldTriggerAtivo()) { carregarEstadoWorldTrigger(); await carregarTriggersDaFichaWorldTrigger(); }
  criarElementoToken(tokenID, userNick, 10, 10, tamanho, imagem, hpAtual, hpMax, true, {
    squad: worldTriggerEstado.meuSquad,
    bagworm: worldTriggerEstado.bagworm,
    chameleon: worldTriggerEstado.chameleon,
    triggers: [...worldTriggerEstado.triggersAtivos], ownerNick: userNick, ownerUserId: window.usuarioAtualId || '', tipo:'player', imagemStoragePath: imagemMeta.storagePath || '', imagemBucket: imagemMeta.bucket || '', imagemPublico: imagemMeta.publico !== false
  });
  const tokenCriado = document.getElementById(tokenID);
  if (tokenCriado) await salvarTokenNoSupabase(tokenCriado);
  if (worldTriggerAtivo()) sincronizarTokensSquadWorldTrigger(10,10,tamanho);
  
  if (canalMesa) {
    canalMesa.send({
      type: 'broadcast',
      event: 'vtt_mover_token',
      payload: { id: tokenID, nome: userNick, x: 10, y: 10, tamanho, imagem: imagemMeta.storagePath ? '' : imagem, imagemStoragePath: imagemMeta.storagePath || '', imagemBucket: imagemMeta.bucket || '', imagemPublico: imagemMeta.publico !== false, hpAtual, hpMax, campanha_id: obterCampanhaIdAtual(), squad: worldTriggerEstado.meuSquad || '', bagworm: !!worldTriggerEstado.bagworm, chameleon: !!worldTriggerEstado.chameleon, triggers: [...worldTriggerEstado.triggersAtivos], ownerNick: userNick, ownerUserId: window.usuarioAtualId || '', tipo:'player' }
    });
  }
  mostrarPopup('🛡️ Token posicionado na Távola!');
}


function tokenImagemMetaDoElemento(token) {
  if (!token) return { storagePath: '', bucket: '', publico: true };
  return {
    storagePath: token.dataset.tokenImagemStoragePath || '',
    bucket: token.dataset.tokenImagemBucket || '',
    publico: token.dataset.tokenImagemPublico !== 'false'
  };
}

async function resolverImagemTokenURL(storagePath, bucket, publico = true, fallbackUrl = '') {
  if (!storagePath) return fallbackUrl || '';
  try {
    const nomeBucket = bucket || (publico ? 'galeria' : 'galeria-privada');
    if (nomeBucket === 'galeria' || publico) {
      const { data } = supabaseClient.storage.from(nomeBucket).getPublicUrl(storagePath);
      return data?.publicUrl || fallbackUrl || '';
    }
    const { data, error } = await supabaseClient.storage.from(nomeBucket).createSignedUrl(storagePath, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (err) {
    console.warn('Não foi possível resolver imagem do token:', err);
  }
  return fallbackUrl || '';
}

async function aplicarImagemStorageAoToken(token, storagePath, bucket, publico = true, fallbackUrl = '') {
  if (!token || !storagePath || !supabaseClient) return;
  const url = await resolverImagemTokenURL(storagePath, bucket, publico, fallbackUrl);
  if (!url || !document.body.contains(token)) return;
  token.dataset.tokenImagemStoragePath = storagePath;
  token.dataset.tokenImagemBucket = bucket || (publico ? 'galeria' : 'galeria-privada');
  token.dataset.tokenImagemPublico = String(publico);
  token.dataset.tokenImagem = url;
  token.style.backgroundImage = `url(${url})`;
  token.style.backgroundSize = 'cover';
  token.style.backgroundPosition = 'center';
  token.innerText = '';
}

function tokenParaPersistencia(token) {
  if (!token) return null;
  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return null;
  const imagemMeta = tokenImagemMetaDoElemento(token);
  return {
    campanha_id: campanhaId,
    id: token.dataset.tokenId,
    nome: token.dataset.tokenNome || 'Personagem',
    owner_user_id: token.dataset.tokenOwnerUserId || window.usuarioAtualId || null,
    x: Number(token.dataset.tokenX ?? parseFloat(token.style.left) ?? 10),
    y: Number(token.dataset.tokenY ?? parseFloat(token.style.top) ?? 10),
    tamanho: Number(token.dataset.tokenTamanho) || 45,
    imagem_url: imagemMeta.storagePath ? null : (token.dataset.tokenImagem || null),
    imagem_storage_path: imagemMeta.storagePath || null,
    imagem_bucket: imagemMeta.storagePath ? (imagemMeta.bucket || (imagemMeta.publico ? 'galeria' : 'galeria-privada')) : null,
    imagem_publico: imagemMeta.publico,
    hp_atual: Number(token.dataset.tokenHpAtual) || 0,
    hp_max: Number(token.dataset.tokenHpMax) || 50,
    squad: token.dataset.tokenSquad || '',
    bagworm: token.dataset.tokenBagworm === 'true',
    chameleon: token.dataset.tokenChameleon === 'true',
    trion: token.dataset.tokenTrion || null,
    triggers: (() => { try { return JSON.parse(token.dataset.tokenTriggers || '[]'); } catch (err) { return []; } })(),
    owner_nick: token.dataset.tokenOwnerNick || '',
    tipo: token.dataset.tokenTipo || '',
    npc_index: token.dataset.tokenNpcIndex !== '' ? Number(token.dataset.tokenNpcIndex) : null,
    atualizado_em: new Date().toISOString()
  };
}

async function salvarTokenNoSupabase(token) {
  if (!supabaseClient || !token || !obterCampanhaIdAtual()) return;
  const registro = tokenParaPersistencia(token);
  if (!registro) return;
  const { error } = await supabaseClient.from('vtt_tokens').upsert(registro, { onConflict: 'campanha_id,id' });
  if (error) console.error('Erro ao persistir token:', error);
}

function agendarPersistenciaToken(token, imediato = false) {
  if (!token || !supabaseClient || !obterCampanhaIdAtual()) return;
  const id = `${obterCampanhaIdAtual()}:${token.dataset.tokenId}`;
  if (imediato) {
    const timer = timersPersistenciaTokens.get(id);
    if (timer) clearTimeout(timer);
    timersPersistenciaTokens.delete(id);
    salvarTokenNoSupabase(token);
    return;
  }
  const anterior = timersPersistenciaTokens.get(id);
  if (anterior) clearTimeout(anterior);
  const timer = setTimeout(() => {
    timersPersistenciaTokens.delete(id);
    salvarTokenNoSupabase(token);
  }, 250);
  timersPersistenciaTokens.set(id, timer);
}

async function carregarTokensCampanha(forcar = false) {
  if (!supabaseClient) return;
  const campanhaId = obterCampanhaIdAtual();
  const camada = document.getElementById('vtt-tokens-camada');
  if (!campanhaId || !camada) return;
  if (!forcar && tokensCarregadosCampanhaId === campanhaId) return;
  if (carregandoTokensCampanhaId === campanhaId) return;
  carregandoTokensCampanhaId = campanhaId;
  try {
    const { data, error } = await supabaseClient
      .from('vtt_tokens')
      .select('*')
      .eq('campanha_id', campanhaId)
      .order('atualizado_em', { ascending: true });
    if (error) throw error;

    const idsDoBanco = new Set((data || []).map(t => String(t.id)));
    Array.from(camada.querySelectorAll('.vtt-token')).forEach(el => {
      if (!idsDoBanco.has(String(el.dataset.tokenId || ''))) el.remove();
    });

    for (const t of (data || [])) {
      const souDono = String(t.owner_nick || '').trim().toLowerCase() === obterMeuNickWT().trim().toLowerCase();
      const podeMover = souDono || ehMestreDaCampanhaAtual();
      const imagemInicial = t.imagem_storage_path ? '' : (t.imagem_url || '');
      const token = criarElementoToken(
        t.id, t.nome, Number(t.x), Number(t.y), Number(t.tamanho) || 45,
        imagemInicial, Number(t.hp_atual) || 0, Number(t.hp_max) || 50, podeMover,
        {
          ownerNick: t.owner_nick || '', tipo: t.tipo || '', npcIndex: t.npc_index,
          squad: t.squad || '', bagworm: !!t.bagworm, chameleon: !!t.chameleon,
          trion: t.trion ?? null, triggers: Array.isArray(t.triggers) ? t.triggers : [],
          imagemStoragePath: t.imagem_storage_path || '', imagemBucket: t.imagem_bucket || '', imagemPublico: t.imagem_publico !== false
        }
      );
      if (token && t.imagem_storage_path) {
        aplicarImagemStorageAoToken(token, t.imagem_storage_path, t.imagem_bucket || '', t.imagem_publico !== false, t.imagem_url || '');
      }
    }
    tokensCarregadosCampanhaId = campanhaId;
  } catch (error) {
    console.error('Erro ao carregar tokens da campanha:', error);
    mostrarPopup('❌ Não foi possível carregar os tokens desta campanha.');
  } finally {
    carregandoTokensCampanhaId = null;
  }
}

function limparEstadoPersistenciaTokens() {
  tokensCarregadosCampanhaId = null;
  carregandoTokensCampanhaId = null;
  timersPersistenciaTokens.forEach(timer => clearTimeout(timer));
  timersPersistenciaTokens.clear();
}

function criarElementoToken(id, nome, x, y, tamanho = 45, imagem = '', hpAtual = 50, hpMax = 50, ehMeu = false, metadados = {}) {
  const camada = document.getElementById('vtt-tokens-camada');
  if (!camada) return;

  let token = document.getElementById(id);
  if (!token) {
    token = document.createElement('div');
    token.id = id;
    token.className = 'vtt-token';
    camada.appendChild(token);
  }

  token.dataset.tokenId = id;
  token.dataset.tokenNome = nome;
  token.dataset.tokenTamanho = tamanho;
  token.dataset.tokenImagem = imagem;
  token.dataset.tokenImagemStoragePath = metadados.imagemStoragePath ?? token.dataset.tokenImagemStoragePath ?? '';
  token.dataset.tokenImagemBucket = metadados.imagemBucket ?? token.dataset.tokenImagemBucket ?? '';
  token.dataset.tokenImagemPublico = String(metadados.imagemPublico !== undefined ? !!metadados.imagemPublico : token.dataset.tokenImagemPublico !== 'false');
  token.dataset.tokenHpAtual = hpAtual;
  token.dataset.tokenHpMax = hpMax;
  token.dataset.tokenX = x;
  token.dataset.tokenY = y;
  token.dataset.tokenSquad = metadados.squad !== undefined ? String(metadados.squad || '') : (token.dataset.tokenSquad || '');
  token.dataset.tokenBagworm = String(metadados.bagworm !== undefined ? !!metadados.bagworm : token.dataset.tokenBagworm === 'true');
  token.dataset.tokenChameleon = String(metadados.chameleon !== undefined ? !!metadados.chameleon : token.dataset.tokenChameleon === 'true');
  token.dataset.tokenTriggers = JSON.stringify(Array.isArray(metadados.triggers) ? metadados.triggers : (token.dataset.tokenTriggers ? JSON.parse(token.dataset.tokenTriggers) : []));
  token.dataset.tokenTrion = metadados.trion ?? token.dataset.tokenTrion ?? '';
  token.dataset.tokenOwnerNick = metadados.ownerNick ?? token.dataset.tokenOwnerNick ?? '';
  token.dataset.tokenOwnerUserId = metadados.ownerUserId ?? token.dataset.tokenOwnerUserId ?? window.usuarioAtualId ?? '';
  token.dataset.tokenTipo = metadados.tipo ?? token.dataset.tokenTipo ?? '';
  token.dataset.tokenNpcIndex = metadados.npcIndex != null ? String(metadados.npcIndex) : (token.dataset.tokenNpcIndex || '');

  token.style.width = `${tamanho}px`;
  token.style.height = `${tamanho}px`;
  token.style.borderRadius = '50%';
  token.style.position = 'absolute';
  token.style.transform = 'translate(-50%, -50%)';
  token.style.cursor = 'grab';
  token.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)';
  token.style.border = '2px solid #f3d075';
  token.style.display = 'flex';
  token.style.alignItems = 'center';
  token.style.justifyContent = 'center';
  token.style.fontWeight = 'bold';
  token.style.fontSize = '0.75rem';
  token.style.color = '#fff';
  token.style.overflow = 'visible';
  token.style.touchAction = 'none';
  token.style.pointerEvents = 'auto';
  token.style.zIndex = '5';

  if (imagem) {
    token.style.backgroundImage = `url(${imagem})`;
    token.style.backgroundSize = 'cover';
    token.style.backgroundPosition = 'center';
    token.innerText = '';
  } else {
    token.style.backgroundImage = 'none';
    token.style.backgroundColor = '#202024';
    token.innerText = String(nome || '').substring(0, 3).toUpperCase();
  }

  token.style.left = `${x}%`;
  token.style.top = `${y}%`;

  let hpTag = token.querySelector('.vtt-token-hp');
  if (!hpTag) {
    hpTag = document.createElement('div');
    hpTag.className = 'vtt-token-hp';
    hpTag.style.cssText = 'position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%); background: #121214; border: 1px solid #4a3d24; color: #04d361; font-size: 0.6rem; padding: 1px 4px; border-radius: 4px; white-space: nowrap; pointer-events: none; font-family: sans-serif; font-weight: bold;';
    token.appendChild(hpTag);
  }
  hpTag.innerText = `${hpAtual}/${hpMax}`;
  hpTag.style.color = hpAtual <= (hpMax * 0.25) ? '#ff5252' : (hpAtual <= (hpMax * 0.5) ? '#ffab40' : '#04d361');
  if (worldTriggerAtivo()) {
    registrarTokenNoRadarWT(id, nome, x, y, token.dataset.tokenSquad, token.dataset.tokenBagworm === 'true', token.dataset.tokenChameleon === 'true', token.dataset.tokenTrion || null, JSON.parse(token.dataset.tokenTriggers || '[]'));
    aplicarVisibilidadeTokenWT(token);
  }

  // O listener é instalado apenas uma vez. Antes, cada atualização realtime
  // adicionava novos listeners ao window, causando atraso e movimento pesado.
  if ((ehMeu || ehMestreDaCampanhaAtual()) && !token.dataset.arrastoConfigurado) {
    token.dataset.arrastoConfigurado = 'true';
    ativarArrastoToken(token);
  }
  return token;
}

function obterCoordenadasTokenPeloCursor(clientX, clientY) {
  const scaler = document.getElementById('vtt-mapa-scaler');
  const canvas = document.getElementById('vtt-canvas');
  if (!scaler || !canvas) return null;

  const rect = scaler.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  // Usa a caixa REAL do elemento já transformado. Assim o cálculo acompanha
  // zoom e pan e o token fica exatamente sob o cursor.
  let x = ((clientX - rect.left) / rect.width) * 100;
  let y = ((clientY - rect.top) / rect.height) * 100;

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y))
  };
}

function atualizarPosicaoTokenLocal(token, x, y) {
  token.style.left = `${x}%`;
  token.style.top = `${y}%`;
  token.dataset.tokenX = x;
  token.dataset.tokenY = y;
  if (worldTriggerAtivo()) {
    registrarTokenNoRadarWT(token.dataset.tokenId, token.dataset.tokenNome, x, y, token.dataset.tokenSquad, token.dataset.tokenBagworm === 'true', token.dataset.tokenChameleon === 'true', token.dataset.tokenTrion || null, (() => { try { return JSON.parse(token.dataset.tokenTriggers || '[]'); } catch (err) { return []; } })());
  }
  agendarPersistenciaToken(token, false);
}

function transmitirMovimentoToken(token, x, y) {
  if (!canalMesa) return;

  const agora = performance.now();
  const ultimo = Number(token.dataset.ultimoBroadcast || 0);
  const intervalo = 35;

  token.dataset.broadcastX = x;
  token.dataset.broadcastY = y;

  if (agora - ultimo < intervalo) {
    if (!token._broadcastAgendado) {
      token._broadcastAgendado = requestAnimationFrame(() => {
        token._broadcastAgendado = null;
        const bx = Number(token.dataset.broadcastX);
        const by = Number(token.dataset.broadcastY);
        transmitirMovimentoToken(token, bx, by);
      });
    }
    return;
  }

  token.dataset.ultimoBroadcast = String(agora);

  canalMesa.send({
    type: 'broadcast',
    event: 'vtt_mover_token',
    payload: {
      id: token.dataset.tokenId,
      nome: token.dataset.tokenNome,
      x,
      y,
      tamanho: Number(token.dataset.tokenTamanho) || 45,
      imagem: token.dataset.tokenImagemStoragePath ? '' : (token.dataset.tokenImagem || ''),
      imagemStoragePath: token.dataset.tokenImagemStoragePath || '',
      imagemBucket: token.dataset.tokenImagemBucket || '',
      imagemPublico: token.dataset.tokenImagemPublico !== 'false',
      hpAtual: Number(token.dataset.tokenHpAtual) || 0,
      hpMax: Number(token.dataset.tokenHpMax) || 50,
      campanha_id: obterCampanhaIdAtual(),
      squad: token.dataset.tokenSquad || '',
      bagworm: token.dataset.tokenBagworm === 'true',
      chameleon: token.dataset.tokenChameleon === 'true',
      trion: token.dataset.tokenTrion || null,
      triggers: (() => { try { return JSON.parse(token.dataset.tokenTriggers || '[]'); } catch (err) { return []; } })(),
      ownerNick: token.dataset.tokenOwnerNick || '',
      ownerUserId: token.dataset.tokenOwnerUserId || '',
      tipo: token.dataset.tokenTipo || '',
      npcIndex: token.dataset.tokenNpcIndex !== '' ? Number(token.dataset.tokenNpcIndex) : null
    }
  });
}

function ativarArrastoToken(token) {
  let arrastando = false;
  let moveuDeFato = false;
  let ponteiroAtivo = null;
  let ultimoX = 0;
  let ultimoY = 0;

  const iniciarArrasto = (e) => {
    // Apenas botão esquerdo no mouse.
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    ultimoTokenInteragido = token;

    arrastando = true;
    moveuDeFato = false;
    ponteiroAtivo = e.pointerId;
    ultimoX = e.clientX;
    ultimoY = e.clientY;

    token.setPointerCapture?.(e.pointerId);
    token.style.cursor = 'grabbing';
    token.classList.add('arrastando');

    e.stopPropagation();
    e.preventDefault();
  };

  const mover = (e) => {
    if (!arrastando) return;
    if (ponteiroAtivo !== null && e.pointerId !== ponteiroAtivo) return;

    // Ignora microscopicamente o mesmo ponto e reduz trabalho desnecessário.
    if (e.clientX === ultimoX && e.clientY === ultimoY) return;
    ultimoX = e.clientX;
    ultimoY = e.clientY;

    const pos = obterCoordenadasTokenPeloCursor(e.clientX, e.clientY);
    if (!pos) return;

    moveuDeFato = true;
    atualizarPosicaoTokenLocal(token, pos.x, pos.y);
    transmitirMovimentoToken(token, pos.x, pos.y);

    e.stopPropagation();
    e.preventDefault();
  };

  const pararArrasto = (e) => {
    if (!arrastando) return;
    if (ponteiroAtivo !== null && e.pointerId !== ponteiroAtivo) return;

    arrastando = false;
    token.releasePointerCapture?.(ponteiroAtivo);
    ponteiroAtivo = null;
    token.style.cursor = 'grab';
    token.classList.remove('arrastando');

    if (!moveuDeFato) {
      const nome = token.dataset.tokenNome || 'Personagem';
      let hpAtual = Number(token.dataset.tokenHpAtual) || 0;
      const hpMax = Number(token.dataset.tokenHpMax) || 50;

      const novoHpStr = prompt(`Gerenciar HP de ${nome} (${hpAtual}/${hpMax}):\nDigite o novo valor ou ajuste com + / - (ex: -5, +5):`, hpAtual);
      if (novoHpStr !== null) {
        const valorTrim = novoHpStr.trim();
        let calculado = hpAtual;

        if (valorTrim.startsWith('+') || valorTrim.startsWith('-')) {
          calculado = Math.max(0, Math.min(hpMax, hpAtual + (parseInt(valorTrim, 10) || 0)));
        } else {
          calculado = Math.max(0, Math.min(hpMax, parseInt(valorTrim, 10) || 0));
        }

        hpAtual = calculado;
        token.dataset.tokenHpAtual = String(hpAtual);

        const hpTag = token.querySelector('.vtt-token-hp');
        if (hpTag) {
          hpTag.innerText = `${hpAtual}/${hpMax}`;
          hpTag.style.color = hpAtual <= (hpMax * 0.25) ? '#ff5252' : (hpAtual <= (hpMax * 0.5) ? '#ffab40' : '#04d361');
        }

        const x = parseFloat(token.style.left) || 0;
        const y = parseFloat(token.style.top) || 0;
        transmitirMovimentoToken(token, x, y);
        agendarPersistenciaToken(token, true);
        mostrarPopup(`❤️ HP de ${nome} atualizado: ${hpAtual}/${hpMax}`);
      }
    }

    agendarPersistenciaToken(token, true);
    e.stopPropagation();
    e.preventDefault();
  };

  token.addEventListener('pointerdown', iniciarArrasto);
  token.addEventListener('pointermove', mover);
  token.addEventListener('pointerup', pararArrasto);
  token.addEventListener('pointercancel', pararArrasto);
}

// --- ROLAGENS DE DADOS ---
function rolarDado(lados, origem = 'externa') {
  // Segurança contra toques acidentais/elementos sobrepostos no mobile:
  // a rolagem de dado só pode ser disparada pelo listener explícito dos botões.
  if (origem !== 'botao-dado') {
    console.warn('Rolagem ignorada: origem não autorizada.', origem);
    return;
  }
  tocarSom('dice');
  vibrarPadrao([22]);
  const resultado = Math.floor(Math.random() * lados) + 1;
  const userNick = document.getElementById('user-nick-display')?.innerText || 'Jogador';
  const descricao = `${userNick} rolou d${lados}`;

  let mensagemExtra = '';
  if (lados === 20) {
    if (resultado === 20) {
      mensagemExtra = ' ✨ BENÇÃO DA DAMA DO LAGO! Crítico!';
    } else if (resultado === 1) {
      mensagemExtra = ' ⚠️ FALHA CRÍTICA!';
    }
  }

  const textoResultado = `${descricao}: ${resultado}${mensagemExtra}`;
  if (lados === 20 && resultado === 20) tocarSom('critical');
  registrarRolagemHistorico(descricao, textoResultado, false);
}

function rolarExpressaoPersonalizada() {
  tocarSom('dice');
  vibrarPadrao([22]);
  const exprInput = document.getElementById('expressao-dado');
  if (!exprInput) return;
  const expr = exprInput.value.trim();
  if (!expr) return alert('Digite uma expressão (ex: 2d20+5)');
  
  try {
    const regex = /^(\d*)d(\d+)([+-]\d+)?$/i;
    const match = expr.match(regex);
    if (!match) return alert('Formato inválido. Use ex: 1d20 ou 2d6+3');

    const qtd = match[1] ? parseInt(match[1]) : 1;
    const lados = parseInt(match[2]);
    const modificador = match[3] ? parseInt(match[3]) : 0;
    if (qtd < 1 || qtd > 100 || lados < 2 || lados > 1000 || Math.abs(modificador) > 10000) {
      return mostrarPopup('❌ Limites da rolagem: até 100 dados, d2–d1000 e modificador de ±10000.');
    }

    let soma = 0;
    let lancamentos = [];
    for (let i = 0; i < qtd; i++) {
      const r = Math.floor(Math.random() * lados) + 1;
      lancamentos.push(r);
      soma += r;
    }

    const totalFinal = soma + modificador;
    const userNick = document.getElementById('user-nick-display')?.innerText || 'Jogador';
    const detalhe = `${qtd}d${lados}${modificador !== 0 ? (modificador > 0 ? '+'+modificador : modificador) : ''} [${lancamentos.join(', ')}]`;
    
    registrarRolagemHistorico(`${userNick} rolou ${detalhe}`, totalFinal, false);
    exprInput.value = '';
  } catch (err) {
    alert('Erro ao processar expressão.');
  }
}

function registrarRolagemHistorico(descricao, resultado, veioDoBroadcast = false) {
  const historico = document.getElementById('historico-rolagens');
  if (!historico) return;

  if (historico.querySelector('p')) historico.innerHTML = '';

  const item = document.createElement('div');
  item.style.cssText = 'background: #202024; padding: 0.5rem 0.8rem; border-radius: 4px; margin-bottom: 0.4rem; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #8257e5; font-size: 0.9rem; gap: 12px;';

  const textoRes = typeof resultado === 'string' ? resultado : `${descricao} = ${resultado}`;
  const descricaoEl = document.createElement('span');
  descricaoEl.style.color = '#a8a8b3';
  descricaoEl.textContent = descricao;
  const resultadoEl = document.createElement('strong');
  resultadoEl.style.cssText = 'color: #04d361; font-size: 1.1rem;';
  resultadoEl.textContent = textoRes;
  item.append(descricaoEl, resultadoEl);

  historico.prepend(item);
  mostrarPopup(`🎲 ${textoRes}`);

  if (!veioDoBroadcast) {
    registrarRolagemNaSessao(descricao, textoRes);
    centralAdicionarAtividade('🎲', String(descricao || 'Nova rolagem'), String(textoRes || ''));
  }

  if (!veioDoBroadcast && canalMesa) {
    canalMesa.send({
      type: 'broadcast',
      event: 'nova_rolagem',
      payload: { descricao, resultado: textoRes, campanha_id: obterCampanhaIdAtual() }
    });
  }
}

// --- GALERIA & IMAGENS ---
function normalizarPastaGaleria(valor) {
  const limpa = String(valor || 'Geral')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (limpa || 'Geral').slice(0, 60);
}

function escaparAtributoHTML(valor) {
  return escaparHTML(String(valor ?? ''));
}

async function fazerUploadImagem() {
  if (!supabaseClient) return mostrarPopup('❌ Supabase não conectado.');
  if (!ehMestreDaCampanhaAtual()) return mostrarPopup('❌ Apenas o Mestre pode organizar a biblioteca.');

  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return mostrarPopup('❌ Selecione uma campanha antes de enviar imagens.');
  if (MAMUS_STATE.campaign.current?.status === 'encerrada') return mostrarPopup('🔒 Esta campanha está encerrada.');

  const input = document.getElementById('arquivo-imagem');
  const nomeInput = document.getElementById('nome-imagem');
  const pastaInput = document.getElementById('pasta-imagem');
  const visibilidadeInput = document.getElementById('visibilidade-imagem');
  const status = document.getElementById('status-galeria');
  if (!input || !input.files || input.files.length === 0) return mostrarPopup('❌ Selecione uma imagem.');

  const file = input.files[0];
  if (!file.type.startsWith('image/')) return mostrarPopup('❌ Selecione um arquivo de imagem.');
  if (file.size > 12 * 1024 * 1024) return mostrarPopup('❌ A imagem deve ter no máximo 12 MB.');

  const pasta = normalizarPastaGaleria(pastaInput?.value || 'Geral');
  const nome = String(nomeInput?.value || file.name.replace(/\.[^.]+$/, '')).trim().slice(0, 120) || 'Imagem sem nome';
  const publica = (visibilidadeInput?.value || 'publica') === 'publica';
  const extensao = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const identificador = (window.crypto?.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const storagePath = `${campanhaId}/${pasta}/${Date.now()}_${identificador}.${extensao}`;
  const bucketGaleria = publica ? 'galeria' : 'galeria-privada';

  const btn = document.querySelector('.btn-publicar-galeria');
  const textoOriginal = btn?.textContent || '📤 Adicionar à Biblioteca';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando imagem...'; }
  if (status) status.textContent = 'Enviando arquivo...';

  let arquivoEnviado = false;
  try {
    // 1) Arquivo físico no Storage.
    const { error: uploadError } = await supabaseClient.storage
      .from(bucketGaleria)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (uploadError) throw new Error(`Storage: ${uploadError.message}`);
    arquivoEnviado = true;

    if (status) status.textContent = 'Salvando registro da imagem...';

    // 2) URL que será usada pela galeria.
    let imageUrl = null;
    if (publica) {
      const { data: publicData } = supabaseClient.storage.from('galeria').getPublicUrl(storagePath);
      imageUrl = publicData?.publicUrl || null;
    } else {
      const { data: signedData, error: signedError } = await supabaseClient.storage
        .from('galeria-privada').createSignedUrl(storagePath, 3600);
      if (signedError) throw new Error(`URL privada: ${signedError.message}`);
      imageUrl = signedData?.signedUrl || null;
    }
    if (!imageUrl) throw new Error('Não foi possível obter a URL da imagem.');

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.id) throw new Error('Sessão de usuário não encontrada. Faça login novamente.');

    // 3) Metadados. O registro é explicitamente vinculado à campanha atual.
    const payload = {
      url: imageUrl,
      categoria: pasta,
      pasta,
      nome,
      publico: publica,
      storage_path: storagePath,
      criado_por: user.id,
      campanha_id: campanhaId,
      criado_em: new Date().toISOString()
    };

    const { data: registro, error: dbError } = await supabaseClient
      .from('galeria_imagens')
      .insert(payload)
      .select('id,url,categoria,pasta,nome,publico,storage_path,criado_em,criado_por,campanha_id')
      .single();
    if (dbError) throw new Error(`Banco: ${dbError.message}`);
    if (!registro?.id) throw new Error('O banco não confirmou o registro da imagem.');

    // 4) Atualiza imediatamente a tela e confirma que o registro está visível.
    if (status) status.textContent = 'Atualizando biblioteca...';
    await carregarGaleria(true);

    const apareceu = dadosGaleriaAtual.some(img => img.id === registro.id);
    if (!apareceu) {
      throw new Error('A imagem foi salva, mas não apareceu na consulta da galeria. Verifique as políticas RLS da galeria no Supabase.');
    }

    tocarSom('success');
    mostrarPopup(publica ? '🌐 Imagem publicada e adicionada à galeria.' : '🔒 Imagem salva na pasta oculta e adicionada à galeria.');
    if (input) input.value = '';
    if (nomeInput) nomeInput.value = '';
  } catch (error) {
    console.error('Erro no upload da galeria:', error);
    // Se o arquivo chegou ao Storage mas os metadados falharam, remove o órfão.
    if (arquivoEnviado) {
      const { error: cleanupError } = await supabaseClient.storage.from(bucketGaleria).remove([storagePath]);
      if (cleanupError) console.warn('Não foi possível limpar arquivo órfão da galeria:', cleanupError.message);
    }
    if (status) status.textContent = 'Erro ao salvar';
    mostrarPopup('❌ Não foi possível adicionar a imagem: ' + (error.message || 'erro desconhecido'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
    if (status && !status.textContent?.startsWith('Erro')) {
      status.textContent = `${dadosGaleriaAtual.length} recurso${dadosGaleriaAtual.length === 1 ? '' : 's'}`;
    }
  }
}
async function prepararUrlsGaleria(imagens) {
  const lista = Array.isArray(imagens) ? imagens : [];
  return Promise.all(lista.map(async (img) => {
    const item = { ...img };
    if (!item.publico && item.storage_path) {
      const { data, error } = await supabaseClient.storage.from('galeria-privada').createSignedUrl(item.storage_path, 3600);
      if (!error && data?.signedUrl) item.url = data.signedUrl;
    }
    return item;
  }));
}

async function carregarGaleria(forcar = false) {
  if (!supabaseClient) return;
  const status = document.getElementById('status-galeria');
  if (status) status.textContent = 'Sincronizando...';

  let query = supabaseClient
    .from('galeria_imagens')
    .select('id,url,categoria,pasta,nome,publico,storage_path,criado_em,criado_por,campanha_id')
    .eq('campanha_id', obterCampanhaIdAtual())
    .order('criado_em', { ascending: false });

  if (!ehMestreDaCampanhaAtual()) query = query.eq('publico', true);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar galeria:', error);
    if (status) status.textContent = 'Erro de sincronização';
    const grid = document.getElementById('galeria-grid');
    if (grid) grid.innerHTML = '<div class="estado-galeria">Não foi possível carregar a biblioteca.</div>';
    return;
  }

  dadosGaleriaAtual = await prepararUrlsGaleria(data);
  renderizarPastasGaleria(dadosGaleriaAtual);
  renderizarGaleria(dadosGaleriaAtual);
  if (status) status.textContent = `${dadosGaleriaAtual.length} recurso${dadosGaleriaAtual.length === 1 ? '' : 's'}`;
}

function renderizarPastasGaleria(imagens) {
  const container = document.getElementById('galeria-pastas');
  if (!container) return;

  const nomes = [...new Set(imagens.map(img => String(img.pasta || img.categoria || 'Geral')).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const todas = ['Todas', ...nomes];
  if (!todas.includes(pastaGaleriaAtual)) pastaGaleriaAtual = 'Todas';

  container.innerHTML = '';
  todas.forEach(pasta => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pasta-galeria' + (pasta === pastaGaleriaAtual ? ' ativa' : '');
    btn.textContent = pasta === 'Todas' ? '📚 Todas' : `📁 ${pasta}`;
    btn.onclick = (event) => filtrarGaleriaPasta(pasta, event);
    container.appendChild(btn);
  });
}

function filtrarGaleriaPasta(pasta, event) {
  pastaGaleriaAtual = pasta || 'Todas';
  document.querySelectorAll('#galeria-pastas .pasta-galeria').forEach(btn => btn.classList.remove('ativa'));
  if (event?.currentTarget) event.currentTarget.classList.add('ativa');
  else document.querySelectorAll('#galeria-pastas .pasta-galeria').forEach(btn => {
    const texto = btn.textContent.replace(/^📚 |^📁 /, '');
    if (texto === pastaGaleriaAtual) btn.classList.add('ativa');
  });
  renderizarGaleria(dadosGaleriaAtual);
}

function renderizarGaleria(imagens) {
  const grid = document.getElementById('galeria-grid');
  if (!grid) return;

  const filtradas = pastaGaleriaAtual === 'Todas'
    ? imagens
    : imagens.filter(img => String(img.pasta || img.categoria || 'Geral') === pastaGaleriaAtual);

  if (!filtradas.length) {
    grid.innerHTML = `<div class="estado-galeria">${pastaGaleriaAtual === 'Todas' ? 'Nenhuma imagem na biblioteca.' : 'Esta pasta está vazia.'}</div>`;
    return;
  }

  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  filtradas.forEach(img => {
    const pasta = String(img.pasta || img.categoria || 'Geral');
    const nome = String(img.nome || 'Imagem sem nome');
    const card = document.createElement('article');
    card.className = 'card-imagem-galeria' + (img.publico ? '' : ' imagem-oculta');

    const media = document.createElement('div');
    media.className = 'thumb-galeria';
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = img.url;
    image.alt = nome;
    image.onerror = () => { image.style.opacity = '0.25'; };
    media.appendChild(image);

    const info = document.createElement('div');
    info.className = 'info-imagem-galeria';
    const titulo = document.createElement('strong');
    titulo.textContent = nome;
    const meta = document.createElement('span');
    meta.textContent = `${img.publico ? '🌐 Público' : '🔒 Oculto'} · ${pasta}`;
    info.append(titulo, meta);

    const acoes = document.createElement('div');
    acoes.className = 'acoes-imagem-galeria';
    const btnAbrir = document.createElement('button');
    btnAbrir.type = 'button';
    btnAbrir.className = 'btn-mini-galeria';
    btnAbrir.textContent = '🔎 Abrir';
    btnAbrir.onclick = () => abrirVisualizadorImagem(img.url, pasta, nome);
    acoes.appendChild(btnAbrir);

    if (ehMestreDaCampanhaAtual()) {
      const btnMostrar = document.createElement('button');
      btnMostrar.type = 'button';
      btnMostrar.className = 'btn-mini-galeria btn-mostrar-galeria';
      btnMostrar.textContent = '📺 Mostrar para todos';
      btnMostrar.onclick = () => mostrarImagemParaTodos(img);
      acoes.appendChild(btnMostrar);

      const btnExcluir = document.createElement('button');
      btnExcluir.type = 'button';
      btnExcluir.className = 'btn-mini-galeria btn-excluir-galeria';
      btnExcluir.textContent = '🗑️ Apagar';
      btnExcluir.onclick = () => excluirImagemGaleria(img);
      acoes.appendChild(btnExcluir);
    }

    card.append(media, info, acoes);
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

async function excluirImagemGaleria(img) {
  if (!ehMestreDaCampanhaAtual() || !supabaseClient) return mostrarPopup('❌ Apenas o Mestre pode apagar imagens.');
  if (!img?.id) return mostrarPopup('❌ Imagem inválida.');
  const campanhaId = obterCampanhaIdAtual();
  if (!campanhaId) return mostrarPopup('❌ Selecione uma campanha antes de apagar imagens.');

  const nome = String(img.nome || 'esta imagem');
  if (!confirm(`Apagar "${nome.replace(/"/g, '\"')}" da biblioteca?\n\nO arquivo e o registro da imagem serão removidos.`)) return;

  const bucket = img.publico ? 'galeria' : 'galeria-privada';
  if (img.storage_path) {
    const { error: storageError } = await supabaseClient.storage.from(bucket).remove([img.storage_path]);
    if (storageError) {
      console.error('Erro ao apagar arquivo da galeria:', storageError);
      return mostrarPopup('❌ Não foi possível apagar o arquivo: ' + storageError.message);
    }
  }

  const { error: dbError } = await supabaseClient
    .from('galeria_imagens')
    .delete()
    .eq('id', img.id)
    .eq('campanha_id', campanhaId);

  if (dbError) {
    console.error('Erro ao apagar registro da galeria:', dbError);
    return mostrarPopup('⚠️ O arquivo foi removido, mas o registro não pôde ser apagado: ' + dbError.message);
  }

  tocarSom('success');
  mostrarPopup('🗑️ Imagem removida da biblioteca.');
  await carregarGaleria(true);
}

function mostrarImagemParaTodos(img) {
  if (!ehMestreDaCampanhaAtual() || !img?.url || !canalMesa) return mostrarPopup('❌ Apenas o Mestre pode mostrar imagens.');
  const dados = {
    url: img.url,
    nome: img.nome || 'Imagem da campanha',
    pasta: img.pasta || img.categoria || 'Geral'
  };
  abrirImagemMestre(dados.url, dados.nome, dados.pasta, false);
  canalMesa.send({ type: 'broadcast', event: 'galeria_mostrar_imagem', payload: dados });
  tocarSom('success');
  mostrarPopup('📺 Imagem enviada para todos os jogadores.');
}

function abrirImagemMestre(url, nome, pasta, veioDoBroadcast = false) {
  const modal = document.getElementById('modal-imagem-mestre');
  const img = document.getElementById('imagem-mestre-preview');
  const titulo = document.getElementById('imagem-mestre-titulo');
  const pastaEl = document.getElementById('imagem-mestre-pasta');
  if (!modal || !img) return;

  img.src = url;
  if (titulo) titulo.textContent = nome || 'Imagem da campanha';
  if (pastaEl) pastaEl.textContent = pasta || 'Geral';
  modal.style.display = 'flex';
  imagemMestreAberta = true;
  document.body.classList.add('imagem-mestre-aberta');
  if (veioDoBroadcast) {
    tocarSom('ping');
    vibrarPadrao([20, 30, 20]);
  }
}

function fecharImagemMestre(veioDoBroadcast = false) {
  const modal = document.getElementById('modal-imagem-mestre');
  if (!modal) return;
  modal.style.display = 'none';
  imagemMestreAberta = false;
  document.body.classList.remove('imagem-mestre-aberta');

  if (!veioDoBroadcast && ehMestreDaCampanhaAtual() && canalMesa) {
    canalMesa.send({ type: 'broadcast', event: 'galeria_fechar_imagem', payload: { campanha_id: obterCampanhaIdAtual() } });
  }
}

function abrirVisualizadorImagem(url, pasta, nome = 'Imagem da campanha') {
  let modal = document.getElementById('modal-visualizador-img');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-visualizador-img';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; padding: 15px; box-sizing: border-box;';
    modal.innerHTML = `
      <div style="position:relative; max-width:95%; max-height:90vh; text-align:center;">
        <button type="button" onclick="document.getElementById('modal-visualizador-img').style.display='none'" style="position:absolute; top:-40px; right:0; background:#ff5252; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">✕ Fechar</button>
        <img id="img-ampliada" src="" alt="" style="max-width:100%; max-height:78vh; border-radius:8px; border:2px solid #d4af37; display:block; margin:auto;">
        <div id="legenda-ampliada" style="color:#fff; margin-top:10px; font-weight:bold; font-size:1rem;"></div>
      </div>`;
    document.body.appendChild(modal);
  }
  const imgAmpliada = document.getElementById('img-ampliada');
  const legendaAmpliada = document.getElementById('legenda-ampliada');
  if (imgAmpliada) { imgAmpliada.src = url; imgAmpliada.alt = nome; }
  if (legendaAmpliada) legendaAmpliada.textContent = `${nome} · 📁 ${pasta}`;
  modal.style.display = 'flex';
}

// --- CONTROLE DE MODO IMERSIVO E ESPAÇO DO MAPA ---
function alternarModoImersivoMapa() {
  mapaModoImersivo = !mapaModoImersivo;
  const topo = document.getElementById('topo-geral');
  const painelMestre = document.getElementById('painel-upload-mestre');
  const canvas = document.getElementById('vtt-canvas');
  const btn = document.getElementById('btn-modo-imersivo');

  if (mapaModoImersivo) {
    if (topo) topo.style.display = 'none';
    if (painelMestre) painelMestre.removeAttribute('open');
    if (canvas) canvas.style.height = '80vh';
    if (btn) {
      btn.innerText = '🔙 Restaurar Interface';
      btn.style.background = '#04d361';
      btn.style.color = '#121214';
    }
    mostrarPopup('🔍 Modo Imersivo: Interface recolhida!');
  } else {
    if (topo) topo.style.display = 'block';
    if (canvas) canvas.style.height = '55vh';
    if (btn) {
      btn.innerText = '📐 Maximizar Mapa';
      btn.style.background = '#8257e5';
      btn.style.color = '#fff';
    }
    mostrarPopup('📐 Interface restaurada.');
  }
}

// --- SISTEMA DE TOASTS ---
function mostrarPopup(texto) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 99999; display: flex; flex-direction: column; gap: 5px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = 'background: #18181b; color: #fff; border: 1px solid #8257e5; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 8px;';
  const icone = document.createElement('span');
  icone.textContent = '⚔️';
  const mensagem = document.createElement('span');
  mensagem.textContent = texto;
  toast.append(icone, mensagem);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}


// ==========================================================
// FASE 1.5 — EXPERIÊNCIA MOBILE / TABLET
// ==========================================================
const MOBILE_NAV_ITEMS = [
  { aba:'grupo', icone:'👥', nome:'Grupo' },
  { aba:'sessoes', icone:'🎬', nome:'Sessões' },
  { aba:'bestiario', icone:'📖', nome:'Bestiário' },
  { aba:'guias', icone:'📚', nome:'Guias' },
  { aba:'economia', icone:'💰', nome:'Economia' },
  { aba:'jornais', icone:'📰', nome:'Jornais' },
  { aba:'calendario', icone:'🗓️', nome:'Calendário' },
  { aba:'campanhas', icone:'🏰', nome:'Campanhas' },
  { aba:'diario', icone:'📔', nome:'Diário' },
  { aba:'galeria', icone:'💬', nome:'Galeria' },
  { aba:'noctavell', icone:'🕯️', nome:'Véu' },
  { aba:'sistemas', icone:'⚙️', nome:'Sistemas' }
];

function atualizarNavegacaoMobile() {
  document.querySelectorAll('.mobile-nav-item[data-mobile-aba]').forEach(btn => {
    btn.classList.toggle('ativo', btn.dataset.mobileAba === MAMUS_STATE.ui.currentTab);
  });
  renderizarMenuMobileMais();
}

function navegarMobile(nomeAba) {
  if (!nomeAba) return;

  fecharMenuNavegacao();

  if (nomeAba === 'rolagens') {
    window.__cronicasPermitirAbaRolagens = { ate: Date.now() + 1500 };
    mudarAba('rolagens', { __navegacaoRolagensAutorizada: true, origem: 'mobile-bottom-nav' });
  } else {
    mudarAba(nomeAba);
  }

  fecharMenuMobileMais();
}

function renderizarMenuMobileMais() {
  const grid = document.getElementById('mobile-more-grid');
  if (!grid) return;
  const disponiveis = MOBILE_NAV_ITEMS.filter(item => {
    const btn = document.querySelector(`.abas-navegacao button[onclick*="'${item.aba}'"]`);
    if (!btn) return false;
    const st = getComputedStyle(btn);
    return st.display !== 'none' && st.visibility !== 'hidden';
  });
  grid.innerHTML = disponiveis.map(item => `
    <button type="button" class="mobile-more-item" onclick="navegarMobile('${item.aba}')">
      <span>${item.icone}</span><strong>${escaparHTML(item.nome)}</strong>
    </button>`).join('');
}

function alternarMenuMobileMais(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const menu = document.getElementById('mobile-more-menu');
  const btn = document.getElementById('btn-mobile-mais');
  if (!menu) return;
  const aberto = !menu.classList.contains('aberto');
  menu.classList.toggle('aberto', aberto);
  menu.setAttribute('aria-hidden', String(!aberto));
  btn?.setAttribute('aria-expanded', String(aberto));
  if (aberto) renderizarMenuMobileMais();
}

function fecharMenuMobileMais() {
  const menu = document.getElementById('mobile-more-menu');
  const btn = document.getElementById('btn-mobile-mais');
  menu?.classList.remove('aberto');
  menu?.setAttribute('aria-hidden', 'true');
  btn?.setAttribute('aria-expanded', 'false');
}

function inicializarScrollTouchMobile() {
  if (window.__mamusTouchScrollInicializado) return;
  window.__mamusTouchScrollInicializado = true;

  let inicioX = 0;
  let inicioY = 0;
  let ultimoY = 0;
  let arrastandoPagina = false;
  let ignorar = false;

  const elementoDeveManterGestosProprios = (el) => !!el?.closest?.(
    '#vtt-canvas, .vtt-wrapper, .mobile-more-sheet, .abas-navegacao, input, textarea, select, [contenteditable=\"true\"]'
  );

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
      arrastandoPagina = false;
      ignorar = true;
      return;
    }
    const t = event.touches[0];
    inicioX = ultimoY = t.clientX;
    inicioY = t.clientY;
    arrastandoPagina = false;
    ignorar = elementoDeveManterGestosProprios(event.target);
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (ignorar || event.touches.length !== 1) return;
    const t = event.touches[0];
    const dx = t.clientX - inicioX;
    const dy = t.clientY - inicioY;

    if (!arrastandoPagina) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx) * 1.05) return;
      arrastandoPagina = true;
    }

    const deltaY = t.clientY - ultimoY;
    if (!Number.isFinite(deltaY) || deltaY === 0) return;

    // Fallback de rolagem para navegadores móveis que prendem o gesto no
    // documento por causa de wrappers/fixed overlays. Não toca no VTT.
    window.scrollBy(0, -deltaY);
    ultimoY = t.clientY;
    event.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    arrastandoPagina = false;
    ignorar = false;
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    arrastandoPagina = false;
    ignorar = false;
  }, { passive: true });
}

function inicializarInteracoesMobile() {
  inicializarScrollTouchMobile();
  atualizarNavegacaoMobile();
  window.addEventListener('orientationchange', () => setTimeout(() => {
    prepararSidebarResponsiva();
    atualizarNavegacaoMobile();
  }, 120));
  window.addEventListener('resize', () => {
    prepararSidebarResponsiva();
    if (window.innerWidth > 900) fecharMenuMobileMais();
    atualizarNavegacaoMobile();
  });

  // Melhora de toque para zoom por pinça sem substituir a lógica existente do VTT.
  const estadoPinch = new Map();
  let distanciaAnterior = null;
  document.addEventListener('pointerdown', (e) => {
    const canvas = e.target.closest?.('#vtt-canvas');
    if (!canvas || e.pointerType === 'mouse') return;
    estadoPinch.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (estadoPinch.size === 2) {
      const p = [...estadoPinch.values()];
      distanciaAnterior = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    }
  }, { passive:true });
  document.addEventListener('pointermove', (e) => {
    if (!estadoPinch.has(e.pointerId)) return;
    estadoPinch.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (estadoPinch.size !== 2 || !vttZoom || !document.getElementById('vtt-canvas')) return;
    const p = [...estadoPinch.values()];
    const distanciaAtual = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    if (!distanciaAnterior || !Number.isFinite(distanciaAtual)) return;
    const delta = (distanciaAtual - distanciaAnterior) / Math.max(1, distanciaAnterior);
    if (Math.abs(delta) >= 0.018 && ehMestreDaCampanhaAtual()) {
      const proximo = Math.max(50, Math.min(300, Math.round(vttZoom * (1 + delta))));
      if (proximo !== vttZoom) {
        vttZoom = proximo;
        atualizarTransformMapaVTT();
      }
      distanciaAnterior = distanciaAtual;
      e.preventDefault();
    }
  }, { passive:false });
  const limparPinch = (e) => { estadoPinch.delete(e.pointerId); if (estadoPinch.size < 2) distanciaAnterior = null; };
  document.addEventListener('pointerup', limparPinch, { passive:true });
  document.addEventListener('pointercancel', limparPinch, { passive:true });
}

// ==========================================================
// FIM FASE 1.5
// ==========================================================

// ==========================================
// EXPORTAÇÕES GLOBAIS
// ==========================================
window.alternarAcoesRapidas = alternarAcoesRapidas;
window.acaoRapida = acaoRapida;
window.atualizarVisibilidadeAcoesRapidas = atualizarVisibilidadeAcoesRapidas;
window.garantirAbasEconomiaJornaisVisiveis=garantirAbasEconomiaJornaisVisiveis;
window.carregarEconomiaAtual=carregarEconomiaAtual;
window.recarregarEconomiaAtual=recarregarEconomiaAtual;
window.carregarCalendarioAtual=carregarCalendarioAtual;
window.definirDiaCalendario=definirDiaCalendario;
window.alterarDiaCalendario=alterarDiaCalendario;
window.mudarAnoCalendario=mudarAnoCalendario;
window.abrirEditorMercado=abrirEditorMercado;
window.abrirEditorMercadoria=abrirEditorMercadoria;
window.abrirEditorEventoEconomico=abrirEditorEventoEconomico;
window.salvarMercado=salvarMercado;
window.salvarMercadoria=salvarMercadoria;
window.salvarEventoEconomico=salvarEventoEconomico;
window.excluirMercado=excluirMercado;
window.excluirMercadoria=excluirMercadoria;
window.excluirEventoEconomico=excluirEventoEconomico;
window.carregarJornaisAtual=carregarJornaisAtual;
window.abrirEditorJornal=abrirEditorJornal;
window.fecharEditorJornal=fecharEditorJornal;
window.salvarJornal=salvarJornal;
window.excluirJornal=excluirJornal;

window.fazerLogin = fazerLogin;
window.fazerCadastro = fazerCadastro;
window.fazerLogout = fazerLogout;
window.mudarAba = mudarAba;
window.garantirSistemaNoctavell = garantirSistemaNoctavell;
window.garantirSistemaOlimpia = garantirSistemaOlimpia;
window.garantirSistemaSobreviventes = garantirSistemaSobreviventes;
window.abrirAbaRolagensSegura = abrirAbaRolagensSegura;
window.selecionarCampanha = selecionarCampanha;
window.abrirNovaCampanha = abrirNovaCampanha;
window.abrirEditarCampanha = abrirEditarCampanha;
window.salvarEdicaoCampanha = salvarEdicaoCampanha;
window.fecharNovaCampanha = fecharNovaCampanha;
window.criarNovaCampanha = criarNovaCampanha;
window.importarArquivoJSON = importarArquivoJSON;
window.abrirCriadorFicha = abrirCriadorFicha;
window.fecharCriadorFicha = fecharCriadorFicha;
window.abrirFichaAtualCompleta = abrirFichaAtualCompleta;
window.abrirEditorFichaAtual = abrirEditorFichaAtual;
window.abrirEditorFicha = abrirEditorFicha;
window.salvarFichaNoSupabase = salvarFichaNoSupabase;
window.carregarFichasDoGrupo = carregarFichasDoGrupo;
window.excluirFichaDoGrupo = excluirFichaDoGrupo;
window.abrirFichaGrupo = abrirFichaGrupo;
window.fecharModalFichaGrupo = fecharModalFichaGrupo;
window.fazerUploadMapa = fazerUploadMapa;
window.alternarGridVTT = alternarGridVTT;
window.alterarZoomMaster = alterarZoomMaster;
window.atualizarTransformMapaVTT = atualizarTransformMapaVTT;
window.ajustarGridTamanhoVTT = ajustarGridTamanhoVTT;
window.darPingNoMapa = darPingNoMapa;
window.abrirModalConfigToken = abrirModalConfigToken;
window.selecionarImgToken = selecionarImgToken;
window.confirmarCriacaoToken = confirmarCriacaoToken;
window.rolarDado = rolarDado;
window.rolarExpressaoPersonalizada = rolarExpressaoPersonalizada;
window.fazerUploadImagem = fazerUploadImagem;
window.carregarGaleria = carregarGaleria;
window.filtrarGaleriaPasta = filtrarGaleriaPasta;
window.excluirImagemGaleria = excluirImagemGaleria;
window.mostrarImagemParaTodos = mostrarImagemParaTodos;
window.abrirImagemMestre = abrirImagemMestre;
window.fecharImagemMestre = fecharImagemMestre;
window.alternarMovimentoMapa = alternarMovimentoMapa;
window.alternarEdicaoMapaTaticoWT = alternarEdicaoMapaTaticoWT;
window.definirFerramentaMapaTaticoWT = definirFerramentaMapaTaticoWT;
window.limparMapaTaticoWT = limparMapaTaticoWT;
window.alternarModoImersivoMapa = alternarModoImersivoMapa;
window.tocarSom = tocarSom;
window.limparAtividadeCentral = limparAtividadeCentral;
window.centralAdicionarAtividade = centralAdicionarAtividade;
window.navegarMobile = navegarMobile;
window.alternarMenuMobileMais = alternarMenuMobileMais;
window.fecharMenuMobileMais = fecharMenuMobileMais;

// Exposição global dos controles do Bestiário para os botões inline da interface.
window.inicializarBestiarioElarion = inicializarBestiarioElarion;
window.renderizarBestiario = renderizarBestiario;
window.abrirDetalheBestiario = abrirDetalheBestiario;
window.fecharDetalheBestiario = fecharDetalheBestiario;
window.criarTokenDoBestiario = criarTokenDoBestiario;

window.carregarGuiasRPG=carregarGuiasRPG; window.abrirLeitorGuia=abrirLeitorGuia; window.fecharLeitorGuia=fecharLeitorGuia;
