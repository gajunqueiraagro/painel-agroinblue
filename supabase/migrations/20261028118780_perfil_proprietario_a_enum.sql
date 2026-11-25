-- PERFIL-PROPRIETARIO A — lote 118780 (Code 4; OPENFINANCE-PRONTO-NJ-01 item 8, GO do Gabriel 25/11 14:30).
-- O perfil novo "proprietario" no enum `perfil_acesso`. `cliente_membros.perfil` é texto, mas `get_user_perfil` o converte para este
-- enum: gravar 'proprietario' num membro ANTES deste lote quebraria toda checagem de permissão dele (o cast dá erro).
-- ⚠ PASSO PRÓPRIO: o valor novo só pode ser usado depois do commit deste lote. O lote B (118790, as funções) vem depois.
alter type public.perfil_acesso add value if not exists 'proprietario' after 'gestor_cliente';
