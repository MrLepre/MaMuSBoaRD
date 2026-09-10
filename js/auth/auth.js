// MaMuSBoaRD — Marco 4 — Auth module
// Auth owns Supabase authentication. UI/campaign side effects remain app-owned via hooks.
(function(){
  function client(){ return window.MAMUS_SUPABASE || null; }
  function nickParaEmail(nick){ const tratado=String(nick||'').trim().toLowerCase().replace(/\s+/g,''); return `${tratado}@rpg.local`; }
  async function fazerCadastro(){
    const supabase=client(); if(!supabase) return alert('Supabase não inicializado.');
    const nick=document.getElementById('auth-nick')?.value; const password=document.getElementById('auth-senha')?.value;
    if(!nick||!password) return alert('Informe Nick e senha!');
    const {error}=await supabase.auth.signUp({email:nickParaEmail(nick),password,options:{data:{display_name:nick}}});
    if(error) window.mostrarPopup?.('❌ Erro no cadastro: '+error.message); else window.mostrarPopup?.('✅ Conta criada com sucesso! Clique em Entrar.');
  }
  async function fazerLogin(){
    const supabase=client(); if(!supabase) return alert('Supabase não inicializado.');
    const nick=document.getElementById('auth-nick')?.value; const password=document.getElementById('auth-senha')?.value;
    if(!nick||!password) return alert('Informe Nick e senha!');
    const {data,error}=await supabase.auth.signInWithPassword({email:nickParaEmail(nick),password});
    if(error) return window.mostrarPopup?.('❌ Nick ou senha incorretos.');
    window.mostrarPopup?.('✅ Login realizado!');
    window.MAMUS_AUTH_HOOKS?.onUserSignedIn?.(data.user);
  }
  async function fazerLogout(){
    const supabase=client(); if(!supabase) return;
    await supabase.auth.signOut();
    window.MAMUS_AUTH_HOOKS?.onUserSignedOut?.();
  }
  function atualizarInterfaceAuth(user){
    window.usuarioAtualId=user?.id||null;
    window.MAMUS_STATE?.set?.('auth.user',user||null);
    const form=document.getElementById('form-login'), status=document.getElementById('status-usuario');
    const mapa=document.getElementById('painel-mapa-mestre'), upload=document.getElementById('painel-upload-mestre');
    if(user){
      if(form) form.style.display='none'; if(status) status.style.display='flex';
      const nick=user.user_metadata?.display_name || user.email?.split('@')[0] || 'Jogador';
      const display=document.getElementById('user-nick-display'); if(display) display.innerText=nick;
      const badge=document.getElementById('badge-master-global'); if(badge){ const global=window.ehMestreGlobal?.()||false; badge.style.display=global?'inline-flex':'none'; badge.title=global?'Master global · '+(window.MASTER_GLOBAL_EMAIL||''):''; }
      document.getElementById('btn-aba-sistemas')?.style.setProperty('display','inline-flex');
      document.getElementById('btn-novo-sistema')?.style.setProperty('display','inline-flex');
      window.atualizarInterfacePapelCampanha?.(); window.atualizarGruposNavegacao?.();
    }else{
      document.getElementById('btn-aba-sistemas')?.style.setProperty('display','none'); document.getElementById('btn-novo-sistema')?.style.setProperty('display','none');
      window.atualizarGruposNavegacao?.(); if(form) form.style.display='flex'; if(status) status.style.display='none'; if(mapa) mapa.style.display='none'; if(upload) upload.style.display='none';
    }
  }
  async function getSession(){ const supabase=client(); return supabase ? (await supabase.auth.getSession()).data.session : null; }
  window.MAMUS_AUTH={nickParaEmail,fazerCadastro,fazerLogin,fazerLogout,atualizarInterfaceAuth,getSession};
  window.nickParaEmail=nickParaEmail; window.fazerCadastro=fazerCadastro; window.fazerLogin=fazerLogin; window.fazerLogout=fazerLogout; window.atualizarInterfaceAuth=atualizarInterfaceAuth;
})();
