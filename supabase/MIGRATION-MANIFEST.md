# Manifesto do Marco 9

Objetivo: transformar os SQL históricos do MaMuSBoaRD em uma sequência canônica e previsível.

## Problemas corrigidos na organização

- Várias versões de `eh_master_global`, `eh_mestre_da_campanha` e `eh_membro_da_campanha` estavam espalhadas em arquivos históricos.
- Policies eram recriadas por múltiplos scripts com nomes diferentes.
- Seeds, backfills, correções pontuais e schema estrutural estavam misturados.
- Havia risco de executar migrations em ordem incorreta.

## Decisão

A base canônica começa em `0001` e a segurança consolidada fica em `0002`.
O restante entra em migrations posteriores por domínio.

## Não executado automaticamente

Nenhum SQL foi enviado ao Supabase remoto neste marco. Isso é intencional: a próxima etapa de aplicação deve começar com um diff/inspeção do banco remoto.
