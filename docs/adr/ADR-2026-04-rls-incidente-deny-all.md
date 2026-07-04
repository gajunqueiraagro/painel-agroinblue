# ADR — RLS é regra de negócio (post-mortem deny_all_temp)

**Data:** 30/04/2026 · **Status:** Aceito

## Incidente
Policies deny_all_temp com USING(false) bloqueavam 100% das leituras
em 15 tabelas críticas via anon key. Sistema exibia dados zerados sem
nenhum erro — queries retornavam arrays vazios silenciosamente.
Correção: remoção das policies + SELECT USING(true) onde faltava.
Nenhum código ou dado alterado.

## Lições permanentes
1. RLS faz parte da regra de negócio, não é apenas segurança.
2. Query vazia NÃO significa ausência de dado — pode ser RLS
   bloqueando silenciosamente.
3. Toda validação de leitura deve ser feita via ANON KEY — o
   Dashboard (service role) ignora RLS e mascara o erro.
4. Proibido policy com sufixo _temp sem ciclo de vida controlado.

## Checklist obrigatório para qualquer alteração de RLS
- Existe policy SELECT na tabela?
- Existe USING(false) em alguma policy?
- Impacta isolamento multi-tenant?
- Validado via anon key?

## Auditoria periódica
SELECT tablename, policyname, qual FROM pg_policies ORDER BY tablename;

## Futuro
RLS multi-tenant real por cliente_id — planejado (roadmap SaaS),
sem urgência, nunca às pressas.
