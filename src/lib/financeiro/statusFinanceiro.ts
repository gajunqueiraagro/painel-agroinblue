/**
 * Domínio de STATUS do Financeiro V2 — DONO ÚNICO do vocabulário de
 * `status_transacao` apresentado/gravado pelo Financeiro V2.
 *
 * Criado em PR-FIN-STATUS-UX-03A-1 para eliminar a duplicação que existia entre
 * FinanceiroV2Tab, LancamentoV2Dialog e useFinanceiroV2, SEM tocar o módulo
 * compartilhado `src/lib/statusOperacional.ts` (usado por zootécnico/compra/mesa).
 *
 * ESCOPO / LIMITES:
 *   - NÃO inclui 'conciliado' (estado DERIVADO da conciliação bancária — será
 *     tratado no PR-FIN-OC-LEDGER-SYNC-04). 'conciliado' nunca é escolhido no
 *     modal nem gravado por aqui.
 *   - NÃO se relaciona com o eixo `cenario='meta'` (planejamento). Aqui só se
 *     trata de `status_transacao`.
 */

// ── Domínio oficial (estágio financeiro persistido) ──

/** Fluxo oficial: previsto → programado → agendado → realizado (PR-FIN-V2-STATUS-PGTO-01). */
export type StatusFinanceiro = 'previsto' | 'agendado' | 'programado' | 'realizado';

/** Status inicial de um NOVO lançamento (era 'meta' até PR-FIN-STATUS-UX-03A-1). */
export const STATUS_FINANCEIRO_INICIAL: StatusFinanceiro = 'previsto';

/**
 * Ordem oficial do fluxo — e a de TODO lugar que lista status: coluna, filtro, select do
 * modal e `ModoRapidoGrid`.
 * ⚠ PROGRAMADO ANTES DE AGENDADO — PR-FIN-V2-STATUS-PGTO-01 (aprovada pelo Gabriel em
 * 29/09, FIN-V2-COLUNAS-STATUS-01). Era previsto → agendado → programado.
 */
export const STATUS_FINANCEIRO_ORDEM: StatusFinanceiro[] = [
  'previsto', 'programado', 'agendado', 'realizado',
];

/** Labels de apresentação. */
export const STATUS_FINANCEIRO_LABEL: Record<StatusFinanceiro, string> = {
  previsto: 'Previsto',
  agendado: 'Agendado',
  programado: 'Programado',
  realizado: 'Realizado',
};

/**
 * A PALETA DO STATUS — DONA ÚNICA DA COR, PR-FIN-V2-STATUS-PGTO-01. Mock v4 aprovado pelo
 * Gabriel em 29/09 (FIN-V2-COLUNAS-STATUS-01) e corrigido na homologação de 30/09
 * (PR-FIN-V2-STATUS-PGTO-01-fix1): Previsto laranja, Programado azul e Agendado verde escuro são
 * SÓ TEXTO; a caixa (fundo e borda) fica para o Realizado (verde claro) e o selo oval para o
 * Conciliado (verde escuro). `comCaixa` diz quais.
 * ⚠ ELA MORAVA EM `TabelaDespesasOC.tsx` (o `PILULA` da conta corrente da OC), e a lista do
 * Financeiro tinha outra (ciano/âmbar/roxo/azul). Duas cores para o mesmo status em duas telas.
 * Agora a OC importa daqui.
 * ⚠ `texto` É A COR QUANDO NÃO HÁ PÍLULA (quem mostra o status solto numa linha de texto), e
 * `pilula` a da caixa. No Conciliado elas DIFEREM: o texto da pílula é branco sobre o verde, e
 * branco solto sumiria no fundo. Classes literais, nunca montadas em runtime (o Tailwind só
 * gera o que lê escrito).
 * ⚠ `programado` e `conciliado` continuam com cores distintas — a colisão que o
 * FIN-LISTA-LAYOUT-02 consertou (os dois tinham o mesmo azul) não volta.
 */
export type StatusPaleta = StatusFinanceiro | 'conciliado';
export const STATUS_PALETA: Record<StatusPaleta, { texto: string; pilula: string; comCaixa: boolean }> = {
  previsto: { texto: 'text-[#c2410c]', pilula: 'text-[#c2410c] border-transparent', comCaixa: false },
  programado: { texto: 'text-[#1d4ed8]', pilula: 'text-[#1d4ed8] border-transparent', comCaixa: false },
  agendado: { texto: 'text-[#14532d]', pilula: 'text-[#14532d] border-transparent', comCaixa: false },
  realizado: { texto: 'text-[#15803d]', pilula: 'text-[#15803d] bg-[#f0fdf4] border-[#bbf7d0]', comCaixa: true },
  conciliado: { texto: 'text-[#166534]', pilula: 'text-white bg-[#166534] border-[#166534]', comCaixa: true },
};

/**
 * A cor do status em HEXADECIMAL, para quem não desenha com classe (a folha do PDF) — LIDA da paleta acima (o `texto` de cada
 * status), nunca uma segunda tabela de cores. Status fora da paleta devolve nulo, e quem chama usa o seu tom neutro.
 */
export function hexDoStatus(status: string | null | undefined): string | null {
  const chave = (status ?? '').toLowerCase();
  const entrada = Object.entries(STATUS_PALETA).find(([k]) => k === chave);
  const m = entrada ? /#[0-9a-fA-F]{6}/.exec(entrada[1].texto) : null;
  return m ? m[0] : null;
}

/**
 * A FORMA DA PÍLULA, uma só para todas as telas. 9,5px é o piso do sistema fora da Grade do DRE.
 * ⚠ NA LISTA DO FINANCEIRO ELA RENDERIZA A 9px: `.table-financeiro td *` (index.css) força 9px
 * com `!important` em tudo dentro da célula, e a lista inteira já está a 9px. Não é esta classe
 * que decide lá.
 */
export const STATUS_PILULA_BASE =
  'inline-block h-[15px] whitespace-nowrap rounded-[7px] border px-[6px] text-[9.5px] font-semibold leading-[13px]';

/** Cores de texto na grade — derivadas da paleta, sem uma segunda fonte. */
export const STATUS_FINANCEIRO_COR: Record<StatusFinanceiro, string> = {
  previsto: STATUS_PALETA.previsto.texto,
  programado: STATUS_PALETA.programado.texto,
  agendado: STATUS_PALETA.agendado.texto,
  realizado: STATUS_PALETA.realizado.texto,
};

/** Opções do Select do MODAL (seleção única). Sem Meta, sem Conciliado. */
export const STATUS_FINANCEIRO_OPCOES_MODAL: { value: StatusFinanceiro; label: string }[] =
  STATUS_FINANCEIRO_ORDEM.map(v => ({ value: v, label: STATUS_FINANCEIRO_LABEL[v] }));

// ── Filtro da grade (inclui Meta LEGADO como opção própria) ──

/**
 * Chave do filtro Status da grade.
 *
 * LEGADO TRANSITÓRIO — 'meta':
 *   `status_transacao='meta'` permanece persistido (~354 registros). Esta opção
 *   existe apenas para permitir LOCALIZAR os registros antigos na grade. Não
 *   representa reclassificação. Não autoriza migration. Não deve ser agrupada
 *   dentro de "Previsto". Será removida após o saneamento do legado.
 */
// PR-FIN-V2-STATUS-01 — filtro perde 'Meta (legado)' e ganha 'Conciliado' (DERIVADO de conciliado_em != null;
//   NÃO é status_transacao — a query aplica o filtro por conciliado_em). 'meta' segue no tipo/label só para
//   EXIBIR registros legados na grade, mas não é mais opção de filtro.
export type StatusFiltroFinanceiro = StatusFinanceiro | 'meta' | 'conciliado' | 'conciliado_real';

/** Opções do FILTRO (multisseleção): ordem oficial + Conciliado (derivado) ao fim. */
/**
 * ⚠ O 'conciliado' PERSISTIDO NÃO É OPÇÃO DE FILTRO, e continua não sendo: ele
 * é o rótulo legado dos 574. Quem entra na lista é `conciliado_real`, DERIVADO
 * do vínculo — as duas chaves existem justamente porque são coisas diferentes, e
 * tiveram a mesma cor por um tempo.
 *
 * ⚠ MAS O VALOR EXISTE NO BANCO, e por isso NÃO foi apagado do vocabulário: 574
 * lançamentos têm `status_transacao = 'conciliado'` — todos de um cliente, todos
 * gravados em 10/04/2026, e TODOS SEM VÍNCULO ATIVO. É rótulo legado sem lastro,
 * não conciliação. Some da lista de escolha, continua tendo label e cor para
 * quando aparecer numa linha — ver `STATUS_FILTRO_LABEL`.
 */
export const STATUS_FINANCEIRO_OPCOES_FILTRO: { value: StatusFiltroFinanceiro; label: string }[] = [
  ...STATUS_FINANCEIRO_ORDEM.map((v): { value: StatusFiltroFinanceiro; label: string } => ({ value: v, label: STATUS_FINANCEIRO_LABEL[v] })),
  /* ⚠ UMA LISTA SÓ, e a derivação por baixo — LANC-STATUS-LISTA-UNICA-01.
     "Conciliado" fica ao lado dos status persistidos porque, para quem opera, é
     um estágio do mesmo ciclo: previsto → … → realizado → conciliado. A seção
     separada tratava-o como outra pergunta e obrigava o operador a cruzar dois
     controles para saber o que já bateu com o banco.
     ⚠ E ELE CONTINUA SENDO DERIVADO — nunca gravado, nunca enviado ao banco. O
     recorte acontece depois da consulta, sobre o mapa de vínculos ativos: quem
     traduz é a tela, e a coluna `status_transacao` segue intocada.
     ⚠ REALIZADO PASSA A EXCLUIR OS CONCILIADOS. Os dois são partições do mesmo
     conjunto, e é isso que faz a soma fechar — marcar os dois lista todos os
     realizados, nem mais nem menos. */
  { value: 'conciliado_real', label: 'Conciliado' },
];

const STATUS_FILTRO_SET = new Set<string>([...STATUS_FINANCEIRO_ORDEM, 'meta', 'conciliado', 'conciliado_real']);

/** Guard: a string é uma chave válida do filtro de status? (sem cast, para drill-down externo) */
export function isStatusFiltroFinanceiro(v: unknown): v is StatusFiltroFinanceiro {
  return typeof v === 'string' && STATUS_FILTRO_SET.has(v);
}

/** Labels da grade/filtro por valor persistido — expõe o valor REAL (meta não é mascarado).
 *  Tipado como Record<string,string> para indexação direta pelo status_transacao cru (sem cast). */
export const STATUS_FILTRO_LABEL: Record<string, string> = {
  ...STATUS_FINANCEIRO_LABEL,
  meta: 'Meta (legado)',
  /* ⚠ "(legado)" COMO NO `meta`, e pelo mesmo motivo: o valor está gravado em 574
     linhas que não têm vínculo nenhum. Rotulá-lo "Conciliado" puro faria a lista
     afirmar uma conciliação que não existe — e agora que a pílula azul nasce do
     vínculo, as duas coisas ficariam indistinguíveis na tela. */
  conciliado: 'Conciliado (legado)',
  /* O conciliado DE VERDADE — derivado do vínculo, nunca gravado. Chave própria
     para não colidir com o valor legado que mora na coluna. */
  conciliado_real: 'Conciliado',
};

/** Cores da grade/filtro — Meta (legado) muted; Conciliado no verde escuro da paleta. */
export const STATUS_FILTRO_COR: Record<string, string> = {
  ...STATUS_FINANCEIRO_COR,
  meta: 'text-muted-foreground',
  /* Muted como o `meta`: o azul fica reservado ao conciliado DE VERDADE, o que
     tem vínculo. Duas coisas diferentes não podem ter a mesma cor — e desde o
     FIN-LISTA-LAYOUT-02 essa reserva é verdade: o `programado` foi para o âmbar.
     ⚠ A PÍLULA COM BORDA QUE ACOMPANHAVA ESTE MAPA DUROU UM PR e foi revertida em
     FIN-LISTA-VISUAL-01 — a caixa em toda linha competia com o valor numa lista densa. O
     mapa de COR ficou, porque corrigia um bug (dois status com a mesma string); a FORMA
     saiu, porque era estilo. Vale a distinção: nem toda reversão leva junto o que veio na
     mesma carona. */
  conciliado: 'text-muted-foreground',
  conciliado_real: STATUS_PALETA.conciliado.texto,
};

/**
 * A CAIXA DA COLUNA ST, por chave de filtro (o `stKey` da lista). SÓ REALIZADO E CONCILIADO têm
 * caixa (PR-FIN-V2-STATUS-PGTO-01-fix1); previsto, programado e agendado são texto colorido, sem
 * o padding da pílula — é isso que deixa a coluna caber em 77px. Os legados (`meta`,
 * `conciliado` sem vínculo) também não entram: a caixa afirmaria um estágio que o registro não tem.
 */
export const STATUS_FILTRO_PILULA: Record<string, string> = {
  realizado: STATUS_PALETA.realizado.pilula,
  conciliado_real: STATUS_PALETA.conciliado.pilula,
};

/** Só realizado (e o conciliado, que é realizado com vínculo) tem data de pagamento. */
export function statusTemPagamento(status: string | null | undefined): boolean {
  return status === 'realizado' || status === 'conciliado';
}

/**
 * O pagamento DEPOIS DE TROCAR O STATUS — PR-FIN-V2-STATUS-PGTO-01. Sair do realizado zera; voltar
 * a ele não inventa data (a validação cobra). Pagamento travado pelo extrato fica: é o do banco.
 */
export function pagamentoAoTrocarStatus(novoStatus: string, pagamentoAtual: string, travado: boolean): string {
  return statusTemPagamento(novoStatus) || travado ? pagamentoAtual : '';
}

/** O pagamento que VAI AO BANCO: nulo fora de realizado/conciliado, salvo o travado pelo extrato. */
export function pagamentoParaGravar(status: string, pagamento: string, travado: boolean): string | null {
  return statusTemPagamento(status) || travado ? (pagamento || null) : null;
}

/**
 * O pagamento que a TELA MOSTRA — FIN-PGTO-FANTASMA-01. A TELA MOSTRA O QUE VAI GRAVAR: é `pagamentoParaGravar` com o vazio
 * no lugar do nulo, nunca uma segunda condição. Antes o campo (desabilitado) e o resumo mostravam a data do banco de um
 * lançamento previsto/programado/agendado — uma data que o usuário não podia tocar e que o salvar apagava sem aviso.
 */
export function pagamentoParaMostrar(status: string, pagamento: string, travado: boolean): string {
  return pagamentoParaGravar(status, pagamento, travado) ?? '';
}

/**
 * A DATA QUE O SALVAR VAI REMOVER — FIN-PGTO-FANTASMA-01. O caso legado: o lançamento veio do banco com data de pagamento sem
 * estar realizado, e com o status escolhido agora ela não é gravada. É a única vez em que o salvar apaga algo que o usuário não
 * tocou, e por isso a tela avisa antes. Nulo = nada a avisar (sem data no banco, ou a data vai ser gravada como está).
 */
export function pagamentoQueSeraRemovido(
  pagamentoGravado: string | null | undefined, statusAtual: string, pagamentoAtual: string, travado: boolean,
): string | null {
  if (!pagamentoGravado) return null;
  return pagamentoParaGravar(statusAtual, pagamentoAtual, travado) === null ? pagamentoGravado : null;
}

/** A frase do aviso do caso legado, com a data em dd/mm/aaaa. */
export function avisoPagamentoLegado(pagamentoGravado: string): string {
  const data = pagamentoGravado.slice(0, 10).split('-').reverse().join('/');
  return `este lançamento tinha data de pagamento ${data} sem estar realizado; ao salvar ela é removida`;
}


/**
 * O STATUS COM QUE UMA LINHA DE PLANILHA ENTRA — FIN-IMPORT-EXCEL-STATUS-01a (05/10/2026).
 *
 * ⚠ SEM DATA DE PAGAMENTO, NUNCA REALIZADO — nem quando a coluna Status da planilha diz "pago". É a mesma regra de
 * `statusTemPagamento`, vista do outro lado: só realizado tem data de pagamento, logo sem data não há realizado.
 * ⚠ NASCE DE DEFEITO MEDIDO: o importador gravava `status ?? 'realizado'`, e a planilha de PREVISÕES de out/26 do NJ entrou
 * com 226 lançamentos "realizados" sem data de pagamento (858.240,65).
 * ⚠ CONTENÇÃO, NÃO DESTINO: enquanto a importação de previsões não existir, a linha sem data (e a que a planilha chama de
 * "a pagar" trazendo data) é RECUSADA com o motivo — nunca gravada com um status adivinhado.
 */
export type MotivoRecusaDaImportacao = 'sem_data_pagamento' | 'a_pagar_com_data';
export type StatusDaImportacao = 'realizado' | { recusada: MotivoRecusaDaImportacao };

export function statusParaImportar(
  { dataPagamento, statusPlanilha }: { dataPagamento: string | null | undefined; statusPlanilha: string | null | undefined },
): StatusDaImportacao {
  if (!(dataPagamento ?? '').trim()) return { recusada: 'sem_data_pagamento' };
  if (statusPlanilha === 'previsto') return { recusada: 'a_pagar_com_data' };
  return 'realizado';
}

/** `true` quando a linha entra; estreita sem depender de `strict` (a união com string não estreita por `in`). */
export function importaComoRealizado(s: StatusDaImportacao): s is 'realizado' {
  return s === 'realizado';
}


// ── Writers ──

/**
 * Deriva o status pela data de pagamento (writer de novos lançamentos).
 * ⚠ O `LancamentoV2Dialog` NÃO USA MAIS — PR-FIN-V2-STATUS-PGTO-01: lá o status é escolhido e
 * só o realizado tem pagamento. Sobra o `ModoRapidoGrid`, que ainda deriva agendado/programado
 * da data de pagamento (frente própria).
 *   sem data → previsto (era 'meta' até PR-FIN-STATUS-UX-03A-1);
 *   data futura → agendado; data passada/hoje → programado.
 */
export function deriveStatusFinanceiro(dataPagamento: string): StatusFinanceiro {
  if (!dataPagamento) return STATUS_FINANCEIRO_INICIAL;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(dataPagamento + 'T00:00:00');
  if (d > hoje) return 'agendado';
  return 'programado';
}

/**
 * Normaliza um `status_transacao` persistido para exibição no MODAL (que só
 * conhece os quatro estágios oficiais). Preserva a compatibilidade histórica
 * (confirmado→programado, conciliado→realizado) e mostra o LEGADO 'meta' como
 * 'previsto' (o modal não tem opção Meta). Exibição apenas — nada é gravado
 * até uma ação explícita de salvar.
 */
export function normalizeStatusModal(status?: string | null): StatusFinanceiro {
  const raw = (status || '').trim().toLowerCase();
  switch (raw) {
    case 'agendado': return 'agendado';
    case 'programado':
    case 'confirmado': return 'programado';
    case 'realizado':
    case 'conciliado': return 'realizado';
    case 'previsto':
    case 'meta':
    default: return STATUS_FINANCEIRO_INICIAL; // previsto
  }
}
