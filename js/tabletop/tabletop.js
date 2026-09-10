/**
 * MaMuSBoaRD - Tabletop / VTT
 * Marco 7: mapa, pan/zoom, grid, ping e tokens.
 */

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
        <input type="range" min="50" max="300" value="${MAMUS_STATE.tabletop.zoom}" oninput="alterarZoomMaster(this.value)" style="width: 80px; cursor: pointer;">
        <span id="zoom-label" style="color: #f3d075;">${MAMUS_STATE.tabletop.zoom}%</span>
      </div>
      <button id="btn-cadeado-vtt" onclick="alternarMovimentoMapa()" style="background: ${MAMUS_STATE.tabletop.movementUnlocked ? '#04d361' : '#29292e'}; color: #fff; border: 1px solid #4a3d24; padding: 0.3rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
        ${MAMUS_STATE.tabletop.movementUnlocked ? '🔓 Desbloqueado' : '🔒 Travado'}
      </button>
    `;
  } else {
    zoomControlHTML = `
      <div style="display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.85rem;">
        <span>Zoom:</span>
        <span id="zoom-label" style="color: #f3d075;">${MAMUS_STATE.tabletop.zoom}%</span>
      </div>
    `;
  }

  const alturaMapa = MAMUS_STATE.tabletop.immersive ? '80vh' : '55vh';

  container.innerHTML = `
    <div style="margin-bottom: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: #18181b; padding: 8px; border-radius: 6px; border: 1px solid #29292e;">
      <button onclick="alternarGridVTT()" style="padding: 6px 10px; font-size: 0.85rem;">🗺️ Grelha</button>
      <button onclick="abrirModalConfigToken()" style="padding: 6px 10px; font-size: 0.85rem;">🛡️ Meu Token</button>

      ${zoomControlHTML}

      <div style="display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.85rem;">
        <span>Grid:</span>
        <input type="range" min="20" max="80" value="${MAMUS_STATE.tabletop.gridSize}" oninput="ajustarGridTamanhoVTT(this.value)" style="width: 70px; cursor: pointer;">
        <span id="grid-size-label" style="color: #f3d075;">${MAMUS_STATE.tabletop.gridSize}px</span>
      </div>
    </div>
    ${worldTriggerAtivo() ? '<div id="wt-mesa-painel-host">' + renderizarPainelWorldTrigger() + '</div>' : ''}
    
    <div id="vtt-canvas" class="vtt-wrapper" style="overflow: hidden; position: relative; width: 100%; height: ${alturaMapa}; border: 1px solid #29292e; border-radius: 6px; background: #0b0d12; display: flex; justify-content: center; align-items: center; touch-action: none; cursor: ${ehMestreDaCampanhaAtual() && MAMUS_STATE.tabletop.movementUnlocked ? 'grab' : 'crosshair'}; transition: height 0.3s ease;">
      <div id="vtt-mapa-scaler" style="position: relative; width: 100%; transform: translate(${MAMUS_STATE.tabletop.panX}px, ${MAMUS_STATE.tabletop.panY}px) scale(${MAMUS_STATE.tabletop.zoom / 100}); transform-origin: center center; transition: transform 0.05s ease-out; display: flex; justify-content: center; align-items: center;">
        <img src="${escaparHTML(url)}" class="vtt-mapa-img" alt="Mapa Tático" decoding="async" fetchpriority="high" onload="renderizarObstaculosMapaWT(); renderizarFovWorldTrigger();" style="width: 100%; display: block; height: auto; pointer-events: none;">
        <div id="vtt-fov-camada" class="wt-fov-camada" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2;"></div>
        <div id="vtt-obstaculos-camada" class="wt-obstaculos-camada" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:3;"></div>
        <div id="vtt-grid-camada" class="vtt-grid ${MAMUS_STATE.tabletop.gridAtivo ? 'ativo' : ''}" style="background-size: ${MAMUS_STATE.tabletop.gridSize}px ${MAMUS_STATE.tabletop.gridSize}px; position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;"></div>
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
    
    if (ehMestreDaCampanhaAtual() && MAMUS_STATE.tabletop.movementUnlocked) {
      estaMovendoMapa = true;
      inicioX = (e.clientX || e.touches?.[0].clientX) - MAMUS_STATE.tabletop.panX;
      inicioY = (e.clientY || e.touches?.[0].clientY) - MAMUS_STATE.tabletop.panY;
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

    MAMUS_STATE.tabletop.panX = clientX - inicioX;
    MAMUS_STATE.tabletop.panY = clientY - inicioY;

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
          payload: { zoom: MAMUS_STATE.tabletop.zoom, panX: MAMUS_STATE.tabletop.panX, panY: MAMUS_STATE.tabletop.panY, campanha_id: obterCampanhaIdAtual() }
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
  MAMUS_STATE.tabletop.movementUnlocked = !MAMUS_STATE.tabletop.movementUnlocked;
  
  const btn = document.getElementById('btn-cadeado-vtt');
  const canvas = document.getElementById('vtt-canvas');
  
  if (btn) {
    btn.style.background = MAMUS_STATE.tabletop.movementUnlocked ? '#04d361' : '#29292e';
    btn.innerText = MAMUS_STATE.tabletop.movementUnlocked ? '🔓 Desbloqueado' : '🔒 Travado';
  }
  if (canvas) {
    canvas.style.cursor = MAMUS_STATE.tabletop.movementUnlocked ? 'grab' : 'crosshair';
  }
  mostrarPopup(MAMUS_STATE.tabletop.movementUnlocked ? '🔓 Mapa destravado!' : '🔒 Mapa travado.');
}

function alternarGridVTT() {
  MAMUS_STATE.tabletop.gridAtivo = !MAMUS_STATE.tabletop.gridAtivo;
  const gridDiv = document.getElementById('vtt-grid-camada');
  if (gridDiv) {
    gridDiv.classList.toggle('ativo', MAMUS_STATE.tabletop.gridAtivo);
  }
}

function alterarZoomMaster(valor) {
  if (!ehMestreDaCampanhaAtual()) return;
  MAMUS_STATE.tabletop.zoom = parseInt(valor);
  atualizarTransformMapaVTT();

  if (canalMesa) {
    canalMesa.send({
      type: 'broadcast',
      event: 'vtt_zoom',
      payload: { zoom: MAMUS_STATE.tabletop.zoom, panX: MAMUS_STATE.tabletop.panX, panY: MAMUS_STATE.tabletop.panY, campanha_id: obterCampanhaIdAtual() }
    });
  }
}

function atualizarTransformMapaVTT() {
  const label = document.getElementById('zoom-label');
  if (label) label.innerText = `${MAMUS_STATE.tabletop.zoom}%`;

  const scaler = document.getElementById('vtt-mapa-scaler');
  if (scaler) {
    scaler.style.transform = `translate(${MAMUS_STATE.tabletop.panX}px, ${MAMUS_STATE.tabletop.panY}px) scale(${MAMUS_STATE.tabletop.zoom / 100})`;
  }
}

function ajustarGridTamanhoVTT(valor) {
  MAMUS_STATE.tabletop.gridSize = parseInt(valor);
  const label = document.getElementById('grid-size-label');
  if (label) label.innerText = `${MAMUS_STATE.tabletop.gridSize}px`;

  const gridDiv = document.getElementById('vtt-grid-camada');
  if (gridDiv) {
    gridDiv.style.backgroundSize = `${MAMUS_STATE.tabletop.gridSize}px ${MAMUS_STATE.tabletop.gridSize}px`;
  }
}

function darPingNoMapa(event) {
  if (event.target.classList.contains('vtt-token') || MAMUS_STATE.tabletop.movementUnlocked) return;

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
  if (!forcar && MAMUS_STATE.tabletop.tokensLoadedCampaignId === campanhaId) return;
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
    MAMUS_STATE.tabletop.tokensLoadedCampaignId = campanhaId;
  } catch (error) {
    console.error('Erro ao carregar tokens da campanha:', error);
    mostrarPopup('❌ Não foi possível carregar os tokens desta campanha.');
  } finally {
    carregandoTokensCampanhaId = null;
  }
}

function limparEstadoPersistenciaTokens() {
  MAMUS_STATE.tabletop.tokensLoadedCampaignId = null;
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

    MAMUS_STATE.tabletop.lastInteractedToken = token;

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

// --- CONTROLE DE MODO IMERSIVO E ESPAÇO DO MAPA ---
function alternarModoImersivoMapa() {
  MAMUS_STATE.tabletop.immersive = !MAMUS_STATE.tabletop.immersive;
  const topo = document.getElementById('topo-geral');
  const painelMestre = document.getElementById('painel-upload-mestre');
  const canvas = document.getElementById('vtt-canvas');
  const btn = document.getElementById('btn-modo-imersivo');

  if (MAMUS_STATE.tabletop.immersive) {
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


