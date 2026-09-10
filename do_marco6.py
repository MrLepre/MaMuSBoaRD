from pathlib import Path
import re, shutil, zipfile, hashlib
root=Path('/mnt/data/marco6')
app=root/'app.js'
s=app.read_text(encoding='utf-8')
# Centralize character state references in app.js
repls={
 'dadosFichaAtual':'MAMUS_STATE.character.current',
 'fichaEditandoUserId':'MAMUS_STATE.character.editingUserId',
 'fichaUltimoSalvamento':'MAMUS_STATE.character.lastSavedAt',
 'fichaStatusCentral':'MAMUS_STATE.character.saveStatus',
}
for a,b in repls.items(): s=s.replace(a,b)
# Extract character domain block after centralized replacement.
start=s.index('// --- FICHA DO PERSONAGEM ---')
end=s.index('// --- MAPA E MINI-VTT', start)
block=s[start:end].rstrip()+"\n"
# Remove block from app
s=s[:start]+s[end:]
# Remove any duplicate old character export from app; module exports them.
# Keep window assignments harmless? remove exact lines for extracted funcs.
for name in ['salvarFichaNoSupabase','carregarFichaDoUsuario','abrirCriadorFicha','fecharCriadorFicha','abrirFichaAtualCompleta','abrirEditorFichaAtual','abrirEditorFicha','carregarFichasDoGrupo','excluirFichaDoGrupo','abrirFichaGrupo','fecharModalFichaGrupo','importarArquivoJSON']:
    s=re.sub(rf'^window\.{name}\s*=\s*{name};\n?', '', s, flags=re.M)
app.write_text(s,encoding='utf-8')
# Build module, replacing direct supabaseClient with global shared client.
module='''// ==========================================\n// MaMuSBoaRD - CHARACTERS / FICHAS\n// Marco 6 - domínio de personagens e fichas\n// ==========================================\n(function (global) {\n  'use strict';\n\n  const state = global.MAMUS_STATE;\n\n  function supabase() { return global.MAMUS_SUPABASE || null; }\n  function fichaAtual() { return state.character.current; }\n  function setFicha(valor) { state.character.current = valor; return valor; }\n  function campanhaAtual() { return state.campaign.current; }\n  function sistemaAtual() { return state.system.current; }\n  function userIdAtual() { return global.usuarioAtualId || state.auth.user?.id || null; }\n\n'''+block+'''\n\n  // API pública do domínio. Mantemos os nomes legados para compatibilidade\n  // com os onclicks existentes e com os módulos que ainda estão em transição.\n  global.MAMUS_CHARACTERS = Object.freeze({\n    get: fichaAtual,\n    set: setFicha,\n    salvar: salvarFichaNoSupabase,\n    carregar: carregarFichaDoUsuario,\n    importar: importarArquivoJSON,\n    abrirCriador: abrirCriadorFicha,\n    fecharCriador: fecharCriadorFicha,\n    abrirEditorAtual: abrirEditorFichaAtual,\n    abrirEditor: abrirEditorFicha,\n    abrirFichaCompleta: abrirFichaAtualCompleta,\n    carregarGrupo: carregarFichasDoGrupo,\n    excluirGrupo: excluirFichaDoGrupo,\n    abrirGrupo: abrirFichaGrupo,\n    fecharGrupo: fecharModalFichaGrupo\n  });\n\n  global.salvarFichaNoSupabase = salvarFichaNoSupabase;\n  global.carregarFichaDoUsuario = carregarFichaDoUsuario;\n  global.importarArquivoJSON = importarArquivoJSON;\n  global.abrirCriadorFicha = abrirCriadorFicha;\n  global.fecharCriadorFicha = fecharCriadorFicha;\n  global.abrirFichaAtualCompleta = abrirFichaAtualCompleta;\n  global.abrirEditorFichaAtual = abrirEditorFichaAtual;\n  global.abrirEditorFicha = abrirEditorFicha;\n  global.carregarFichasDoGrupo = carregarFichasDoGrupo;\n  global.excluirFichaDoGrupo = excluirFichaDoGrupo;\n  global.abrirFichaGrupo = abrirFichaGrupo;\n  global.fecharModalFichaGrupo = fecharModalFichaGrupo;\n\n  // A mensagem de criação/edição pertence ao domínio de fichas, não ao app shell.\n  global.addEventListener('message', async (event) => {\n    if (event.origin !== global.location.origin) return;\n    if (!event.data || event.data.type !== 'cronicas-camelot-ficha-pronta') return;\n    if (!event.data.dados) return;\n\n    const foiEdicao = event.data.modo === 'edicao';\n    setFicha(event.data.dados);\n    if (global.worldTriggerAtivo?.()) {\n      global.worldTriggerEstado.triggersAtivos = global.normalizarTriggersFichaWT(event.data.dados);\n      global.sincronizarSquadNPCsEstadoWT(event.data.dados);\n      global.salvarEstadoWorldTrigger();\n    }\n    if (foiEdicao && event.data.userId) state.character.editingUserId = event.data.userId;\n    state.character.saveStatus = 'salvando';\n    global.renderizarFichaNaTela(event.data.dados);\n    global.renderizarCentralCampanha();\n    fecharCriadorFicha();\n\n    const nome = event.data.dados.nome || event.data.dados.personagem_nome || 'Personagem';\n    global.mostrarPopup(foiEdicao ? `💾 Ficha de ${nome} atualizada!` : `⚔️ Ficha de ${nome} criada na mesa!`);\n\n    const client = supabase();\n    if (client) {\n      const { data: { session } } = await client.auth.getSession();\n      if (session) await salvarFichaNoSupabase(state.character.editingUserId);\n    }\n  });\n})(window);\n'''
# Replace internal references from block to helpers/global client.
module=module.replace('supabaseClient', 'supabase()')
# But this creates supabase()() in checks due replacement; normalize.
module=module.replace('supabase()()', 'supabase()')
# Replace references that became state okay; some block functions use direct globals which are fine.
# Ensure module references campaign helper aren't necessary, but leave state direct.
(root/'js/characters').mkdir(parents=True,exist_ok=True)
(root/'js/characters/characters.js').write_text(module,encoding='utf-8')
# Add script before app.js
idx=root/'index.html'
h=idx.read_text(encoding='utf-8')
needle='<script src="app.js?v=marco5-systems-v1"></script>'
replacement='<script src="js/characters/characters.js?v=marco6-characters-v1"></script>\n  '+needle
if needle not in h: raise SystemExit('script needle missing')
h=h.replace(needle,replacement)
idx.write_text(h,encoding='utf-8')
# SW shell and cache version.
sw=root/'service-worker.js'; w=sw.read_text(encoding='utf-8')
w=w.replace("'./js/systems/systems.js'", "'./js/systems/systems.js','./js/characters/characters.js'")
w=re.sub(r"const CACHE_NAME\s*=\s*['\"]([^'\"]+)", "const CACHE_NAME = 'mamus-cache-v20'", w, count=1)
# common alternative naming
w=w.replace('marco5-systems-v1','marco6-characters-v1')
sw.write_text(w,encoding='utf-8')
# changelog
(root/'CHANGELOG-MARCO-6-CHARACTERS.md').write_text('''# Marco 6 — Fichas / Characters v1\n\n- Extraído o domínio de fichas/personagens de `app.js` para `js/characters/characters.js`.\n- Estado canônico da ficha agora vive em `MAMUS_STATE.character`.\n- Mantida compatibilidade global com os nomes usados pela interface legada.\n- Fluxo de importação, criação, edição, visualização, salvamento e fichas do grupo foi preservado.\n- Listener `cronicas-camelot-ficha-pronta` foi movido para o módulo de personagens.\n- Nenhuma alteração de Supabase/RLS/SQL.\n- Service Worker atualizado para cache v20.\n''',encoding='utf-8')
# syntax check
