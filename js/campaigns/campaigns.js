// MaMuSBoaRD — Marco 4 — Campaigns module
(function(){
  const state=()=>window.MAMUS_STATE; const db=()=>window.MAMUS_SUPABASE;
  async function carregarCampanhasDoUsuario(userId){
    const supabase=db(); if(!supabase||!userId) return;
    const lista=document.getElementById('lista-campanhas'); if(lista) lista.innerHTML='<div class="estado-galeria">Carregando campanhas disponíveis...</div>';
    const {data,error}=await supabase.from('campanhas').select('id,nome,descricao,sistema_id,mestre_id,status,encerrada_at,created_at,updated_at,sistemas(id,nome,descricao,configuracao)').order('created_at',{ascending:true});
    if(error){ console.error('Erro ao carregar campanhas:',error); if(lista) lista.innerHTML='<div class="estado-galeria">Não foi possível carregar as campanhas. Execute a migração de acesso por solicitação no Supabase.</div>'; return; }
    const pedidos=await supabase.from('campanha_pedidos').select('id,campanha_id,status,created_at,resolved_at').eq('user_id',userId).order('created_at',{ascending:false});
    const membros=await supabase.from('campanha_membros').select('campanha_id,papel').eq('user_id',userId);
    if(pedidos.error) console.warn('Pedidos de entrada indisponíveis:',pedidos.error); if(membros.error) console.warn('Vínculos de campanha indisponíveis:',membros.error);
    state().campaign.available=data||[]; window.pedidosCampanhaUsuario=pedidos.data||[]; window.campanhasMembroIds=new Set((membros.data||[]).map(m=>m.campanha_id));
    state().campaign.current=null; state().system.current=null;
    window.atualizarContextoCampanha?.(); window.atualizarVisibilidadeAcoesRapidas?.(); window.renderizarListaCampanhas?.();
    const btn=document.getElementById('btn-nova-campanha'); if(btn) btn.style.display=window.usuarioAutenticado?.()?'inline-flex':'none';
  }
  async function carregarPedidosComoMestre(){
    const supabase=db(), painel=document.getElementById('painel-pedidos-campanha'), lista=document.getElementById('lista-pedidos-campanha');
    if(!window.ehMestreDaCampanhaAtual?.()||!supabase||!painel||!lista)return; painel.style.display='block';
    const {data,error}=await supabase.from('campanha_pedidos').select('id,campanha_id,user_id,status,created_at,campanhas(nome)').eq('status','pendente').order('created_at',{ascending:true});
    if(error){console.warn('Não foi possível carregar pedidos:',error);lista.innerHTML='<div class="estado-galeria">Execute o SQL de acesso por solicitação.</div>';return;}
    if(!data?.length){lista.innerHTML='<div class="estado-galeria">Nenhum pedido pendente.</div>';return;}
    lista.innerHTML=data.map(p=>{const camp=p.campanhas?.nome||'Campanha';const d=p.created_at?new Date(p.created_at).toLocaleString('pt-BR'):'';return `<article class="card-campanha"><div class="card-campanha-conteudo"><span class="card-campanha-icone">📨</span><div><h3>Pedido de entrada</h3><p>Jogador: <strong>${window.escaparHTML?.(p.user_id)||p.user_id}</strong></p><span class="card-campanha-meta">🏰 ${window.escaparHTML?.(camp)||camp} · ${window.escaparHTML?.(d)||d}</span></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-selecionar-campanha" onclick="resolverPedidoCampanha('${p.id}', true)">✅ Aceitar</button><button type="button" class="btn-secundario" onclick="resolverPedidoCampanha('${p.id}', false)">❌ Recusar</button></div></article>`}).join('');
  }
  async function resolverPedidoCampanha(pedidoId,aceitar){ const supabase=db(); if(!window.ehMestreDaCampanhaAtual?.()||!supabase)return; const {error}=await supabase.rpc('resolver_pedido_campanha',{p_pedido:pedidoId,p_aceitar:aceitar}); if(error){console.error(error);return window.mostrarPopup?.('❌ Não foi possível resolver o pedido: '+error.message);} await carregarPedidosComoMestre(); window.mostrarPopup?.(aceitar?'✅ Jogador aceito na campanha.':'❌ Pedido recusado.'); }
  async function usuarioEhMembroDaCampanha(campanhaId){ const supabase=db(); const uid=window.usuarioAtualId; if(!supabase||!campanhaId||!uid)return false; const c=state().campaign.available.find(x=>x.id===campanhaId); if(window.ehMestreGlobal?.()||c?.mestre_id===uid)return true; const {data,error}=await supabase.rpc('eh_membro_da_campanha',{p_campanha:campanhaId}); if(error){console.warn('Não foi possível verificar membro da campanha:',error);return false;} return data===true; }
  function obterPedidoCampanha(campanhaId){ return (Array.isArray(window.pedidosCampanhaUsuario)?window.pedidosCampanhaUsuario:[]).find(p=>p.campanha_id===campanhaId&&p.status==='pendente')||null; }
  async function solicitarEntradaCampanha(campanhaId){ const supabase=db(); if(!supabase||!campanhaId)return; const session=await window.MAMUS_AUTH?.getSession(); if(!session?.user)return window.mostrarPopup?.('❌ Faça login para solicitar entrada.'); if(await usuarioEhMembroDaCampanha(campanhaId))return window.selecionarCampanha?.(campanhaId); if(obterPedidoCampanha(campanhaId))return window.mostrarPopup?.('⏳ Seu pedido de entrada já está pendente.'); const {error}=await supabase.from('campanha_pedidos').insert({campanha_id:campanhaId,user_id:session.user.id,status:'pendente'}); if(error){console.error(error);return window.mostrarPopup?.('❌ Não foi possível enviar o pedido: '+error.message);} window.pedidosCampanhaUsuario=[{campanha_id:campanhaId,user_id:session.user.id,status:'pendente',created_at:new Date().toISOString()},...(window.pedidosCampanhaUsuario||[])]; window.renderizarListaCampanhas?.(); window.mostrarPopup?.('📨 Pedido enviado ao Mestre. Aguarde a aprovação.'); }
  window.MAMUS_CAMPAIGNS={carregarCampanhasDoUsuario,carregarPedidosComoMestre,resolverPedidoCampanha,usuarioEhMembroDaCampanha,obterPedidoCampanha,solicitarEntradaCampanha};
  for(const [k,v] of Object.entries(window.MAMUS_CAMPAIGNS)) window[k]=v;
})();
