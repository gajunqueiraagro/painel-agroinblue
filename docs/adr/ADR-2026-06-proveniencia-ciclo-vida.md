# ADR-2026-06 — Proveniência e Ciclo de Vida de Registros Derivados
Status: ACEITO (04/07/2026) · Decide sobre: financeiro_lancamentos_v2
e todas as origens que o alimentam (OFX, Mesa, Excel, PDF, IA, Manual,
Zootécnico, integrações e origens futuras).
Sustentado por: Constituição P0 (Verdade Única) e Princípio 5
("o sistema explica, o operador decide").

## Ideia central
Todo lançamento financeiro possui uma ORIGEM e um CICLO DE VIDA.
O OFX é apenas a primeira origem tratada. Mesa, Excel, PDF, IA,
integração bancária, movimentações zootécnicas e qualquer origem
futura obedecem EXATAMENTE ao mesmo protocolo.

TESTE OBRIGATÓRIO de toda decisão técnica derivada deste ADR:
"Essa solução continua correta quando a origem for Mesa, Excel, PDF,
IA ou qualquer outra futura?" Se a resposta for "funciona apenas para
OFX", é regra localizada — não é arquitetura, e deve ser redesenhada.

## Regras permanentes
1. A SUGESTÃO DO SISTEMA NUNCA ALTERA O BANCO AUTOMATICAMENTE.
   O sistema explica. O operador decide. A sugestão jamais executa
   uma ação sozinha.
2. TODA DECISÃO OPERACIONAL DEVE SER REVERSÍVEL E AUDITÁVEL.
   Nenhum protocolo (OFX, Mesa, Excel, PDF, IA ou futuro) pode exigir
   intervenção direta no banco para desfazer uma decisão tomada pelo
   operador.

## Visão: Documento Financeiro Vivo
O lançamento deixa de ser um número e passa a ser o objeto central do
financeiro: o registro para o qual convergem origem (OFX/Excel/PDF/IA),
evidências (NF, boleto, recibo, comprovante — módulo de anexos),
enriquecimento (classificação, favorecido, fazenda), aprovação,
pagamento e conciliação. Ele carrega toda a história do fato
financeiro. Este ADR é a primeira peça dessa fundação.

## Benchmark de mercado (conceitos que sobreviveram décadas)
1. Princípio do Documento (SAP "Belegprinzip"; NetSuite/Dynamics
   "void, never delete"): registro postado nunca é apagado; correção
   é estorno referenciado. Problema que resolve: auditabilidade e
   confiança contábil. Já temos ~80% (soft delete, guards, audits
   append-only).
2. Fluxo de Documentos (SAP "Belegfluss"; NetSuite "Created From"):
   cada documento referencia o documento de origem, consultável nos
   dois sentidos, para sempre. Problema: proveniência. É o que falta.
3. Estorno em sequência (SAP bloqueia cancelar entrega com fatura
   subsequente; Odoo trava lançamento postado): invalidar uma origem
   nunca é silencioso nem cascateia — para e exige decisão na ordem.
   Problema: destruição/órfãos silenciosos. É o protocolo deste ADR.
Adotamos SOMENTE esses três, na menor forma possível. Explicitamente
fora: event sourcing, CQRS, filas, microserviços, imutabilidade total.
Prática permanente: toda arquitetura importante nasce com benchmark
(SAP, NetSuite, Dynamics BC, Odoo, Xero, QuickBooks) apresentando
problema resolvido, razão da adoção, prós/contras e adaptação mínima.

## Conceito 1 — Proveniência
Todo lançamento derivado nasce com fato de nascimento permanente:
evento 'derivado_criado' no audit_log existente ({origem_tipo,
origem_id, contexto}). Append-only; sobrevive ao destino da origem.
Consulta operacional usa os elos existentes por origem (OFX/extrato →
cbi incluindo desfeitas; Mesa → mesa_lancamento_staging.lancamento_v2_id;
Excel → lote_importacao_id; Zoot → movimentacao_rebanho_id; Contrato →
contrato_id; Manual → created_by).
REGRA DE ELOS (ajuste aprovado): na fase inicial, usar elos existentes
sempre que suficientes; se a FASE 0 de um PR provar que o elo existente
não sustenta a rastreabilidade, pode propor coluna/elo estrutural
mínimo, com justificativa.
REGRA DE SUSTENTAÇÃO: origem nunca sofre hard delete (soft/arquivar).

## Conceito 2 — Registro Reflexo
Lançamento que ainda é espelho da origem. Não é cidadão de segunda
classe: é o estado em que o DEFAULT do protocolo é acompanhar a origem.

## Conceito 3 — Registro Independente
Lançamento que virou fato de negócio. Caminhos: (a) organicamente —
marca de vida própria; (b) por PROMOÇÃO explícita do operador dentro
do protocolo, auditada. Conserva a proveniência para sempre; seu ciclo
de vida se desacopla da origem.

## Heurística inicial Reflexo × Independente (EVOLUTIVA)
Vive em UM ÚNICO LUGAR: enquanto houver um só consumidor (extrato),
é um bloco isolado e claramente identificado dentro da RPC do
protocolo; no segundo consumidor real (Mesa), é extraída para função
compartilhada. Nunca duplicada, nunca espalhada.
  reflexo := editado_manual IS NOT TRUE
             AND origem não-manual
             AND elo simples com a origem.
A heurística SUGERE e JUSTIFICA; nunca decide (Regra permanente 1).
A justificativa é DADO DE NEGÓCIO, não texto de UI: {tipo, texto},
persistida no payload da auditoria da decisão — consultável.
Evoluções previstas que passarão a indicar vida própria: anexos
fiscais (NF, boleto, comprovante), aprovação, múltiplos vínculos,
histórico de alterações, workflow financeiro.

## Protocolo Único de Invalidação de Origem
Vale identicamente para ignorar/cancelar extrato, cancelar importação,
arquivar sessão de Mesa, invalidar documento PDF/IA, cancelar
movimentação zootécnica:
1. Levantar derivados vivos ANTES de consumar.
2. Sem derivados → invalida direto, auditado (motivo obrigatório).
3. Com derivados → apresentar cada um com sugestão + justificativa;
   operador decide por derivado: [Cancelar junto] (reusa cancelamento
   soft + trigger existente de desfazer vínculos) ou [Manter como
   independente] (promoção auditada).
4. A DECISÃO é auditada (não só o resultado): quem, quando, o que o
   sistema sugeriu (tipo + texto), o que o operador decidiu, motivo.
5. Motivo é obrigatório NA CONSUMAÇÃO e validado NO BANCO (nunca só
   no front); a consulta de derivados é livre.
6. Nunca automático-destrutivo. Nunca silencioso.
7. Simetria: a direção lançamento→vínculo permanece automática
   (trg_cbi_desfazer_on_cancelamento, intocada).

## Anexos (módulo futuro)
Anexo é evidência de primeira classe do Documento Financeiro Vivo:
tabela própria, mesmas leis (append/soft; nunca some com a origem);
presença de anexo é marca automática de vida própria.

## Método de implementação (regra adotada)
Toda arquitetura grande segue: 1. descobrir o conceito; 2. escrever o
ADR; 3. implementar a MENOR fatia possível; 4. homologar com caso
real; 5. expandir em PRs pequenos. Proibido PR arquitetural big-bang.
Abstração sem segundo consumidor real NÃO se implementa — reporta-se.
O ADR documenta a visão; não obriga implementação imediata.

## Consequências / trilha incremental (camadas)
Camada 1 — PR-PROTOCOLO-01: protocolo na origem extrato (ignorar),
régua como bloco isolado na RPC — homologação com o caso real Vera
Lígia. Camada 2 — extrair a régua para função única (quando a Mesa
chegar como 2º consumidor). Camada 3 — protocolo na Mesa (arquivar
sessão substitui hard delete). Camada 4+ — Excel, PDF, IA; dedup por
FITID/documento; evento 'derivado_criado'; módulo de anexos. Backfill
de proveniência histórica é dívida registrada, não pré-requisito.
