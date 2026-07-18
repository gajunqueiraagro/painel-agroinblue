# Constituição do Produto — AGROinBLUE

> Fonte normativa máxima da arquitetura. Contém APENAS princípios,
> hierarquia de fontes, metodologia e soberania de dados. Detalhes
> vivem nos documentos referenciados — esta Constituição referencia,
> nunca duplica (regra anti-drift). A Constituição responde "quem é
> o dono da verdade", nunca "como isso é implementado hoje":
> caminhos, nomes de hooks, tabelas e funções pertencem aos ADRs,
> specs, módulos e ao código.
> Vigência: aprovada em 04/07/2026. Emendas: ver Título VII.

## Documentos constitucionais
Este documento é a Constituição nº 1 (Técnica): rege arquitetura,
fontes soberanas e metodologia. A Constituição nº 2 — Produto e
Inteligência Gerencial
(docs/constituicao/CONSTITUICAO-2-INTELIGENCIA-GERENCIAL.md) rege
propósito, pilares e regras de inteligência. São irmãs, sem
precedência entre si: conflito aparente é erro de interpretação e
deve ser levado à deliberação. A hierarquia "Constituição > ADRs >
..." lê-se, a partir de 18/07/2026, "Constituições > ADRs > ...".

## Título I — Hierarquia de fontes
1. A verdade técnica vive no repositório (esta Constituição, ADRs,
   specs, módulos, runbooks, código) e no banco em tempo real.
2. Contexto de chat e Project Knowledge são auxiliares — nunca fonte
   de verdade.
3. Estado atual do sistema (dados, schemas, bugs, pendências,
   estrutura) NUNCA se assume de documento: descobre-se
   empiricamente na FASE 0.
4. Autoridade documental: Constituição > ADRs > specs/modules/
   runbooks > código comentado. Em conflito, prevalece o nível
   superior. CLAUDE.md rege a execução; esta Constituição rege a
   arquitetura.

## Título II — Princípios
1. ARQUITETURA ANTES DA IMPLEMENTAÇÃO — antes de escrever código,
   identificar onde a funcionalidade se encaixa na arquitetura
   existente, quais componentes, telas e fontes de dados já existem,
   e justificar por que a solução é a evolução correta do sistema —
   e não uma duplicação.
2. SINGLE SOURCE OF TRUTH — cada dado tem UM dono oficial (Título
   III). Proibido cálculo paralelo, fallback ou segunda fonte "que
   bate".
3. UX ÚNICA — toda tela nova nasce dos componentes e padrões
   existentes e deve parecer que sempre pertenceu ao sistema.
   Criar componente novo exige justificar por que nenhum existente
   serve. Padrão de telas operacionais:
   docs/adr/ADR-2026-07-erp-operational-shell.md.
4. REUTILIZAR ANTES DE CRIAR; evoluir antes de duplicar. Vale para
   código E para documentação.
5. O SISTEMA EXPLICA, O OPERADOR DECIDE — o sistema apresenta
   evidência e candidatos; não conclui pelo operador
   (docs/modules/mesa-conciliacao.md).
6. NUNCA "FAZER BATER" — divergência entre fontes legítimas é
   informação de domínio (ex.: caixa vs competência), nunca defeito
   a maquiar com ajuste, bucket artificial ou rótulo alterado.
7. DIAGNÓSTICOS SÃO FOTOGRAFIAS DATADAS — registros de capacidade,
   risco e performance valem na data em que foram medidos; exigem
   revalidação empírica antes de orientar decisão futura
   (docs/evolution/).

## Título III — Soberania de dados
Tabela normativa e conceitual: define QUEM é o dono da verdade de
cada domínio. COMO cada fonte é implementada hoje (arquivos, hooks,
tabelas, funções) vive nos documentos referenciados e no código, e
se verifica na FASE 0. Se um domínio não está aqui, a FASE 0 define
o dono ANTES de qualquer consumidor existir. Segunda fonte =
violação, mesmo que os números batam.

| Domínio | Fonte soberana (conceito) | Regra essencial | Referência |
|---|---|---|---|
| Indicadores derivados | Painel do Consultor oficial (PC-100) | Indicador faltando/errado → corrigir na fonte soberana; proibido derivar na tela | docs/modules/pc100-migracao-legado.md |
| Rebanho (saldo/peso/GMD) | Fechamento mensal oficial de pastos (P1) | Nunca recalcular por movimentações; consumo exclusivo via camada oficial de leitura | — |
| Movimentações zootécnicas (competência) | Lançamentos zootécnicos, por data da movimentação | Fonte da receita pecuária em regime de competência | — |
| Caixa realizado | Lançamentos financeiros realizados, por data de pagamento | Diverge da competência POR DESENHO | — |
| Classificação entrada/saída | Biblioteca única de classificação financeira | Lógica centralizada; duplicação proibida | docs/runbooks/importacao-financeira.md |
| Saldos bancários | Cadeia oficial de saldos com propagação automática | Invariante: saldo final do mês N = saldo inicial do mês N+1 | docs/runbooks/migracao-cliente.md |
| Valor do rebanho | Snapshot do fechamento oficial (P2) | Imutável sem reabertura explícita | — |
| Resolução de conta (Mesa) | Resolução canônica pelo cadastro de contas | Conta vem da LINHA da planilha, nunca da sessão | docs/modules/mesa-conciliacao.md |
| Financiamentos | Vínculo estrutural entre financiamento, parcelas e lançamentos | Nunca inferência textual | docs/adr/ADR-2026-05-financiamentos-vinculo-estrutural.md |
| Contraparte (zoo) | Estado explícito de maturidade da contraparte | Ausência de contraparte é estado do domínio, não ambiguidade | docs/specs/P0-Z0-status-contraparte.md |
| Classificação financeira (vocabulário) | Plano de contas padrão | Subcentros exclusivamente do plano | docs/runbooks/importacao-financeira.md |
| Regras de acesso | Policies de acesso (RLS) | RLS é regra de negócio; resultado vazio pode ser policy | docs/adr/ADR-2026-04-rls-incidente-deny-all.md |

## Título IV — Metodologia
1. Fases: FASE 0 (investigação empírica) → FASE 1 (briefing
   autocontido) → FASE 2 (implementação). Pular fases é proibido.
   Validação técnica verde (TSC/build) NÃO fecha PR — somente
   homologação runtime fecha.
2. SEIS PERGUNTAS ARQUITETURAIS — toda FASE 0 de implementação
   responde, com evidência (arquivo/linha/tabela):
   (a) Isso já existe?
   (b) Existe componente semelhante que deve ser reutilizado?
   (c) Quem é a fonte soberana desse dado (Título III)?
   (d) Estou criando uma segunda forma de resolver o mesmo problema?
   (e) Esta solução melhora só esta tela ou fortalece a plataforma?
   (f) Estou aumentando ou reduzindo dívida técnica?
3. TRÊS PERGUNTAS DE DOCUMENTAÇÃO — todo PR que cria/reorganiza
   documentação responde, com evidência:
   (a) O que já existe no repositório sobre o assunto? (listagem
   real de diretório — sondagem pontual não prova inexistência)
   (b) O que existe fora do repositório (PK/contexto)?
   (c) O novo documento é novo, evolução ou substituição?
4. ENCAIXE ARQUITETURAL — todo briefing de implementação contém
   seção com as respostas das seis perguntas. Briefing sem ela não
   é executado.
5. Regra de âncora, código movido verbatim, gates e relatório:
   CLAUDE.md (execução).

## Título V — Enforcement
1. CLAUDE.md exige consulta a esta Constituição antes de criação
   arquitetural e recusa briefing sem ENCAIXE ARQUITETURAL.
2. Guards mecânicos (hooks) protegem branch e baseline de tipos.
3. Homologação runtime pelo Chat fecha todo PR.

## Título VI — Documentação
1. Estrutura oficial: docs/README.md. Cada assunto tem UM documento
   dono; a Constituição referencia, nunca duplica.
2. Documentar módulo em evolução ativa é prematuro — cristalizar
   apenas após estabilização (precedente: abate-modal, 04/07/2026).

## Título VII — Emendas
Emenda exige: caso real que a regra atual não acomoda + PR dedicado
com o rito integral + registro da motivação no commit. Princípios do
Título II só mudam com justificativa arquitetural explícita.
