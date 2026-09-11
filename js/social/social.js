// MaMuSBoaRD — Marco 11 — Comunidade RPG
(function(global){
  'use strict';
  const state = global.MAMUS_STATE;
  const client = () => global.MAMUS_SUPABASE || null;
  const esc = value => typeof global.escaparHTML === 'function' ? global.escaparHTML(value ?? '') : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mesasCache = [];

  function uid(){ return state?.auth?.user?.id || global.usuarioAtualId || null; }
  function nick(){ return state?.auth?.user?.user_metadata?.display_name || document.getElementById('user-nick-display')?.innerText || 'Jogador'; }
  function toast(msg){ global.mostrarPopup?.(msg); }

  async function ensureProfile(){
    const sb=client(), id=uid(); if(!sb||!id) return null;
    let {data,error}=await sb.from('perfis').select('id,username,display_name,bio,avatar_url').eq('id',id).maybeSingle();
    if(error){ console.error('[Social] perfil:',error); return null; }
    if(!data){
      const display=nick();
      const base=String(display).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24)||'jogador';
      const payload={id,username:base,display_name:display,bio:''};
      const result=await sb.from('perfis').upsert(payload,{onConflict:'id'}).select().single();
      if(result.error){ console.error('[Social] criar perfil:',result.error); return null; }
      data=result.data;
    }
    state.social.profile=data; renderProfile(data); return data;
  }

  function renderProfile(p){
    const n=document.getElementById('social-perfil-nome'), b=document.getElementById('social-perfil-bio');
    if(n) n.textContent=p?.display_name||p?.username||'Jogador';
    if(b) b.textContent=p?.bio||'Seu perfil ainda não possui uma bio.';
    const u=document.getElementById('social-username'), d=document.getElementById('social-display-name'), bi=document.getElementById('social-bio-input');
    if(u && document.activeElement!==u) u.value=p?.username||'';
    if(d && document.activeElement!==d) d.value=p?.display_name||'';
    if(bi && document.activeElement!==bi) bi.value=p?.bio||'';
  }

  async function salvarPerfilSocial(){
    const sb=client(), id=uid(); if(!sb||!id) return toast('❌ Faça login para editar seu perfil.');
    const username=String(document.getElementById('social-username')?.value||'').trim().toLowerCase().replace(/\s+/g,'_');
    const display_name=String(document.getElementById('social-display-name')?.value||'').trim();
    const bio=String(document.getElementById('social-bio-input')?.value||'').trim();
    if(!/^[a-z0-9_]{3,32}$/.test(username)) return toast('❌ Username: use 3–32 caracteres, letras, números ou _.');
    if(!display_name) return toast('❌ Informe um nome de exibição.');
    const {data,error}=await sb.from('perfis').update({username,display_name,bio,updated_at:new Date().toISOString()}).eq('id',id).select().single();
    if(error) return toast('❌ Não foi possível salvar: '+(error.message||'erro'));
    state.social.profile=data; renderProfile(data); toast('✅ Perfil atualizado.');
  }

  async function buscarUsuariosSocial(){
    const sb=client(), id=uid(); if(!sb||!id) return toast('❌ Faça login primeiro.');
    const q=String(document.getElementById('social-busca-usuario')?.value||'').trim().replace(/[^a-zA-Z0-9_ áéíóúãõçÁÉÍÓÚÃÕÇ-]/g,'');
    if(q.length<2) return toast('Digite pelo menos 2 caracteres.');
    const {data,error}=await sb.from('perfis').select('id,username,display_name,bio,avatar_url').neq('id',id).or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(12);
    if(error) return toast('❌ Busca indisponível: '+error.message);
    state.social.searchResults=data||[]; renderSearchResults();
  }

  function renderSearchResults(){
    const el=document.getElementById('social-resultados-busca'); if(!el) return;
    if(!state.social.searchResults.length){ el.innerHTML='<p class="texto-vazio">Nenhum jogador encontrado.</p>'; return; }
    const friendIds=new Set((state.social.friends||[]).map(x=>x.id));
    el.innerHTML=state.social.searchResults.map(p=>`<div class="social-user-row"><div><strong>${esc(p.display_name||p.username)}</strong><small>@${esc(p.username)}</small></div>${friendIds.has(p.id)?'<span class="social-badge">AMIGO</span>':`<button type="button" class="btn-secundario btn-social" onclick="enviarSolicitacaoAmizade('${p.id}')">Adicionar</button>`}</div>`).join('');
  }

  async function loadFriends(){
    const sb=client(), id=uid(); if(!sb||!id) return;
    const {data:rels,error}=await sb.from('amizades').select('id,user_a,user_b,created_at').or(`user_a.eq.${id},user_b.eq.${id}`);
    if(error){console.error('[Social] amizades:',error);return;}
    const ids=(rels||[]).map(r=>r.user_a===id?r.user_b:r.user_a);
    let profiles=[];
    if(ids.length){ const r=await sb.from('perfis').select('id,username,display_name,bio,avatar_url').in('id',ids); if(!r.error) profiles=r.data||[]; }
    state.social.friends=profiles; renderFriends(); renderSearchResults();
    document.getElementById('social-amigos-count').textContent=String(profiles.length);
  }

  async function loadRequests(){
    const sb=client(), id=uid(); if(!sb||!id) return;
    const {data,error}=await sb.from('solicitacoes_amizade').select('id,de_usuario,para_usuario,status,created_at').eq('para_usuario',id).eq('status','pendente').order('created_at',{ascending:false});
    if(error){console.error('[Social] requests:',error);return;}
    const ids=(data||[]).map(r=>r.de_usuario); let profiles=[];
    if(ids.length){ const r=await sb.from('perfis').select('id,username,display_name').in('id',ids); if(!r.error) profiles=r.data||[]; }
    state.social.friendRequests=(data||[]).map(r=>({...r,profile:profiles.find(p=>p.id===r.de_usuario)||null})); renderRequests();
  }

  function renderRequests(){
    const el=document.getElementById('social-solicitacoes'); if(!el)return;
    const req=state.social.friendRequests||[];
    el.innerHTML=req.length?`<div class="social-subtitulo">SOLICITAÇÕES RECEBIDAS</div>`+req.map(r=>`<div class="social-user-row"><div><strong>${esc(r.profile?.display_name||'Jogador')}</strong><small>@${esc(r.profile?.username||'')}</small></div><span><button type="button" class="btn-ficha-principal btn-social" onclick="resolverSolicitacaoAmizade('${r.id}',true)">Aceitar</button> <button type="button" class="btn-secundario btn-social" onclick="resolverSolicitacaoAmizade('${r.id}',false)">Recusar</button></span></div>`).join(''):'';
  }

  function renderFriends(){
    const el=document.getElementById('social-amigos'); if(!el)return;
    const f=state.social.friends||[];
    el.innerHTML=f.length?f.map(p=>`<div class="social-user-row"><div><strong>${esc(p.display_name||p.username)}</strong><small>@${esc(p.username)}</small></div><button type="button" class="btn-secundario btn-social" onclick="verCampanhasAmigoSocial('${p.id}','${esc(p.display_name||p.username)}')">Ver mesas</button></div>`).join(''):'<p class="texto-vazio">Você ainda não adicionou amigos.</p>';
  }

  async function enviarSolicitacaoAmizade(id){
    const sb=client(), me=uid(); if(!sb||!me||id===me)return;
    const {error}=await sb.from('solicitacoes_amizade').insert({de_usuario:me,para_usuario:id,status:'pendente'});
    if(error) return toast(error.code==='23505'?'⚠️ Solicitação já enviada ou amizade existente.':'❌ '+error.message);
    toast('✅ Solicitação de amizade enviada.');
  }

  async function resolverSolicitacaoAmizade(requestId,accept){
    const sb=client(); if(!sb)return;
    const {error}=await sb.rpc('resolver_solicitacao_amizade',{p_solicitacao:requestId,p_aceitar:accept});
    if(error) return toast('❌ '+error.message);
    await loadFriends(); await loadRequests(); toast(accept?'✅ Amizade adicionada.':'Solicitação recusada.');
  }

  async function carregarDescobertaSocial(){
    const sb=client(), me=uid(); if(!sb||!me)return;
    const {data,error}=await sb.from('campanhas').select('id,nome,descricao,sistema_id,mestre_id,publica,procurando_jogadores,vagas_jogadores,horario_texto,status,created_at').eq('publica',true).eq('procurando_jogadores',true).neq('mestre_id',me).neq('status','encerrada').order('created_at',{ascending:false}).limit(50);
    if(error){console.error('[Social] mesas:',error); const el=document.getElementById('social-mesas-lista');if(el)el.innerHTML='<p class="texto-vazio">Não foi possível carregar as mesas.</p>';return;}
    const ownerIds=[...new Set((data||[]).map(c=>c.mestre_id).filter(Boolean))]; const sysIds=[...new Set((data||[]).map(c=>c.sistema_id).filter(Boolean))];
    let owners=[],systems=[];
    if(ownerIds.length){const r=await sb.from('perfis').select('id,username,display_name').in('id',ownerIds);if(!r.error)owners=r.data||[];}
    if(sysIds.length){const r=await sb.from('sistemas').select('id,nome').in('id',sysIds);if(!r.error)systems=r.data||[];}
    mesasCache=(data||[]).map(c=>({...c,owner:owners.find(o=>o.id===c.mestre_id),system:systems.find(x=>x.id===c.sistema_id)}));
    state.social.discovery=mesasCache; renderMesas(mesasCache);
  }

  function filtrarMesasSocial(){
    const q=String(document.getElementById('social-filtro-mesas')?.value||'').toLowerCase(); const only=document.getElementById('social-filtro-vagas')?.value==='vagas';
    const list=mesasCache.filter(c=>(!q||`${c.nome} ${c.system?.nome||''} ${c.owner?.display_name||''}`.toLowerCase().includes(q))&&(!only||(Number(c.vagas_jogadores)||0)>0)); renderMesas(list);
  }

  function renderMesas(list){
    const el=document.getElementById('social-mesas-lista'); if(!el)return;
    if(!list.length){el.innerHTML='<p class="texto-vazio">Nenhuma mesa encontrada com esses filtros.</p>';return;}
    el.innerHTML=list.map(c=>`<article class="social-mesa"><div class="social-mesa-top"><div><span class="social-mesa-sistema">${esc(c.system?.nome||'Sistema não informado')}</span><h4>${esc(c.nome)}</h4></div><span class="social-vagas">${Number(c.vagas_jogadores)||0} vaga(s)</span></div><p>${esc(c.descricao||'Uma nova aventura está procurando jogadores.')}</p><div class="social-mesa-meta"><span>👑 ${esc(c.owner?.display_name||'Mestre')}</span><span>🕐 ${esc(c.horario_texto||'Horário a combinar')}</span></div><button type="button" class="btn-ficha-principal" onclick="solicitarEntradaMesaSocial('${c.id}')">Quero jogar</button></article>`).join('');
  }

  async function solicitarEntradaMesaSocial(campanhaId){
    const sb=client(), me=uid(); if(!sb||!me)return;
    const {data:existing}=await sb.from('campanha_pedidos').select('id,status').eq('campanha_id',campanhaId).eq('user_id',me).in('status',['pendente','aceito']).maybeSingle();
    if(existing) return toast(existing.status==='aceito'?'Você já está nesta campanha.':'⏳ Você já enviou um pedido para esta mesa.');
    const {error}=await sb.from('campanha_pedidos').insert({campanha_id:campanhaId,user_id:me,status:'pendente'});
    if(error)return toast('❌ Não foi possível enviar: '+error.message);
    toast('✅ Pedido enviado ao Mestre.');
  }

  async function verCampanhasAmigoSocial(friendId,nome){
    const sb=client(); if(!sb)return;
    const {data,error}=await sb.from('campanhas').select('id,nome,descricao,sistema_id,mestre_id,publica,procurando_jogadores,vagas_jogadores,horario_texto,status').eq('mestre_id',friendId).neq('status','encerrada').order('created_at',{ascending:false});
    if(error)return toast('❌ '+error.message);
    const sysIds=[...new Set((data||[]).map(c=>c.sistema_id).filter(Boolean))]; let systems=[];
    if(sysIds.length){const r=await sb.from('sistemas').select('id,nome').in('id',sysIds);if(!r.error)systems=r.data||[];}
    const list=(data||[]).map(c=>({...c,system:systems.find(s=>s.id===c.sistema_id)}));
    mesasCache=list; document.getElementById('social-filtro-mesas').value=''; renderMesas(list);
    document.getElementById('social-mesas-lista')?.scrollIntoView({behavior:'smooth',block:'start'});
    toast(`🎲 ${nome}: ${list.length} mesa(s) pública(s).`);
  }

  async function carregarPublicacaoAtual(){
    const c=state.campaign.current, el=document.getElementById('social-campanha-atual');
    if(!el)return;
    if(!c){el.textContent='Nenhuma campanha ativa.';return;}
    el.innerHTML=`<strong>${esc(c.nome)}</strong><small>${esc(state.system.current?.nome||'Sistema não informado')}</small>`;
    const sb=client(); if(!sb)return;
    const {data,error}=await sb.from('campanhas').select('publica,procurando_jogadores,vagas_jogadores,horario_texto').eq('id',c.id).maybeSingle();
    if(error||!data)return;
    const pub=document.getElementById('social-campanha-publica'), proc=document.getElementById('social-procurando-jogadores'), vagas=document.getElementById('social-vagas'), hora=document.getElementById('social-horario');
    if(pub)pub.checked=!!data.publica;if(proc)proc.checked=!!data.procurando_jogadores;if(vagas)vagas.value=Number(data.vagas_jogadores)||0;if(hora)hora.value=data.horario_texto||'';
  }

  async function salvarPublicacaoMesaSocial(){
    const sb=client(), c=state.campaign.current, me=uid(); if(!sb||!c||!me)return toast('❌ Selecione uma campanha que você administra.');
    if(c.mestre_id!==me && !global.ehMestreGlobal?.()) return toast('❌ Apenas o Mestre pode publicar a mesa.');
    const payload={publica:!!document.getElementById('social-campanha-publica')?.checked,procurando_jogadores:!!document.getElementById('social-procurando-jogadores')?.checked,vagas_jogadores:Math.max(0,Number(document.getElementById('social-vagas')?.value)||0),horario_texto:String(document.getElementById('social-horario')?.value||'').trim()};
    const {error}=await sb.from('campanhas').update(payload).eq('id',c.id);
    if(error)return toast('❌ '+error.message);
    Object.assign(c,payload); toast(payload.publica&&payload.procurando_jogadores?'✅ Mesa publicada na comunidade.':'✅ Publicação atualizada.'); await carregarDescobertaSocial();
  }

  async function load(){
    const aviso=document.getElementById('comunidade-login-aviso'), conteudo=document.getElementById('comunidade-conteudo');
    const id=uid(); if(aviso)aviso.style.display=id?'none':'block'; if(conteudo)conteudo.style.display=id?'grid':'none'; if(!id)return;
    await ensureProfile(); await Promise.all([loadFriends(),loadRequests(),carregarDescobertaSocial(),carregarPublicacaoAtual()]);
  }

  global.MAMUS_SOCIAL={load,buscarUsuarios:buscarUsuariosSocial,salvarPerfil:salvarPerfilSocial,carregarDescoberta:carregarDescobertaSocial};
  global.salvarPerfilSocial=salvarPerfilSocial; global.buscarUsuariosSocial=buscarUsuariosSocial; global.enviarSolicitacaoAmizade=enviarSolicitacaoAmizade; global.resolverSolicitacaoAmizade=resolverSolicitacaoAmizade; global.carregarDescobertaSocial=carregarDescobertaSocial; global.filtrarMesasSocial=filtrarMesasSocial; global.solicitarEntradaMesaSocial=solicitarEntradaMesaSocial; global.verCampanhasAmigoSocial=verCampanhasAmigoSocial; global.salvarPublicacaoMesaSocial=salvarPublicacaoMesaSocial;
})(window);
