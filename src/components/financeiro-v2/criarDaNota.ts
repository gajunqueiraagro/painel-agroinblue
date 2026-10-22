/**
 * O "CRIAR N PARCELAS" E O "ATUALIZAR ESTE" DA NOTA FISCAL — FIN-NOTA-PDF-01. Nenhum gravador novo:
 *   criar     = `montarPayloadParcelamento` -> `gravarParcelamento` (a RPC `fn_parcelamento_cadastrar`, a mesma do "parcelada" do
 *               Novo lancamento) -> `lancamentosDoParcelamento` -> `gravarDocumentosDoParcelamento` (a NF na parcela 1, LIGADA a todas);
 *   atualizar = a cadeia de documentos de sempre no lancamento que ja' existe (e nas irmas, se for parcela) + o numero da NF onde
 *               o lancamento nao tem documento.
 * ⚠ O DOCUMENTO NAO E' TRANSACIONAL COM AS PARCELAS (o storage nao entra em transacao): parcelas gravadas e documento recusado
 *   voltam como `{ ok: true, erroDoDocumento }` — as parcelas FICAM, e a frase diz o que faltou.
 * ⚠ FICA AO LADO DO DIALOGO (e nao em `src/lib`) porque `gravarParcelamento` mora no arquivo do `LancamentoV2Dialog`.
 * FIN-NOTA-PDF-01b — o que ficou fora do 01, no mesmo modal:
 *   nota de UMA parcela (ou sem duplicata) = UM lancamento, pelo gravador da tela (`handleSave` -> `criarLancamentoComId`, o do Novo
 *     lancamento) e a nota anexada a ele pela cadeia de sempre;
 *   "Atualizar e parcelar" = `fn_parcelamento_a_partir_do_lancamento` (o a' vista existente vira a parcela 1/N, MESMO id) + a cadeia de
 *     documentos no parcelamento; pago com valor diferente da parcela 1: a lista sai com a parcela 1 = o valor pago e o resto da nota
 *     repartido nas demais (`parcelasRepartindo`) — o valor pago nunca muda.
 */
import { supabase } from '@/integrations/supabase/client';
import { montarPayloadParcelamento, type ParcelaDoPayload, type PayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';
import {
  gravarDocumentosDoParcelamento, gravarDocumentosPendentes, lancamentosDoParcelamento, todosGravados, type DocumentoPendente, type ParcelaGravada,
} from '@/lib/financeiro/documentosPendentes';
import { pendenteDaNota, prefillDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { notificarLancamentosMudaram, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { gravarParcelamento } from './LancamentoV2Dialog';

export interface EscolhasDaNota {
  fazendaId: string;
  favorecidoId: string;
  contaBancariaId: string | null;
  /** A linha do plano escolhida (o subcentro) e o escopo dela. */
  planoContaId: string;
  escopoNegocio: string | null;
  /** FIN-NOTA-PDF-01b — lavoura: a safra e a cultura escolhidas ('' = "Todas (rateia)"); fora da lavoura, nulos. */
  safraId?: string | null;
  cultura?: string | null;
  /** NOTA-JA-LANCADA-01 — "Criar mesmo assim": o motivo vai para a observacao do que nasce. */
  observacao?: string | null;
}

/** As parcelas da nota como a lista explicita do payload (numero, vencimento, valor em reais). */
export function parcelasDaNota(d: DoXml): ParcelaDoPayload[] {
  return d.proposta.duplicatas.map((x, i) => ({ numero: i + 1, data_vencimento: x.vencimento, valor: x.valorCent / 100 }));
}

/**
 * O PAGO NAO MUDA DE VALOR (o principio da conciliacao): a parcela 1 = o valor pago, e o RESTO da nota se reparte nas demais
 * (iguais, a ultima com a sobra), nas datas da nota. `null` quando nao ha' resto para repartir (o pago cobre a nota inteira ou mais).
 */
export function parcelasRepartindo(d: DoXml, pagoCent: number): ParcelaDoPayload[] | null {
  const dup = d.proposta.duplicatas;
  const n = dup.length;
  const resto = d.proposta.valorCent - pagoCent;
  if (n < 2 || resto < n - 1) return null;
  const base = Math.floor(resto / (n - 1));
  return dup.map((x, i) => ({
    numero: i + 1, data_vencimento: x.vencimento,
    valor: (i === 0 ? pagoCent : i === n - 1 ? resto - base * (n - 2) : base) / 100,
  }));
}

/** O que o "Atualizar e parcelar" encontra no lancamento que existe. */
export type DecisaoDoExistente =
  | { tipo: 'cabe' }                                                                     // aberto, ou pago com o valor da parcela 1
  | { tipo: 'diferenca'; pagoCent: number; parcela1Cent: number; diferencaCent: number; repartindo: ParcelaDoPayload[] | null };
export function decisaoDoExistente(alvo: { pago: boolean; valorCent: number }, d: DoXml): DecisaoDoExistente {
  const parcela1Cent = d.proposta.duplicatas[0]?.valorCent ?? 0;
  if (!alvo.pago || alvo.valorCent === parcela1Cent) return { tipo: 'cabe' };
  return { tipo: 'diferenca', pagoCent: alvo.valorCent, parcela1Cent, diferencaCent: alvo.valorCent - parcela1Cent, repartindo: parcelasRepartindo(d, alvo.valorCent) };
}

/** O payload do parcelamento da nota — PURO. Mensal (as duplicatas cabem no parcelamento de hoje) ou as parcelas como na nota. */
export function payloadDaNota(clienteId: string, d: DoXml, e: EscolhasDaNota, explicitas?: ParcelaDoPayload[]): PayloadParcelamento {
  const p = d.proposta;
  const livres = explicitas ?? (p.parcelamento.tipo === 'livres' ? parcelasDaNota(d) : null);
  return montarPayloadParcelamento(clienteId, {
    fazendaId: e.fazendaId,
    descricao: p.descricao,
    valorTotal: p.valorCent / 100,
    totalParcelas: p.duplicatas.length,
    dataPrimeiraParcela: p.duplicatas[0]?.vencimento ?? '',
    parcelas: livres,
    dataCompetencia: p.competencia,
    intervaloMeses: 1,
    favorecidoId: e.favorecidoId,
    formaPagamento: p.formaPagamento || null,
    contaBancariaId: e.contaBancariaId,
    tipoFinanciamento: e.escopoNegocio || null,
    numeroContrato: null,
    observacao: e.observacao ?? null,
  }, { plano_conta_id: e.planoContaId, safra_id: e.safraId || null, cultura: e.cultura || null, fase: null });
}

/** O formulario do lancamento UNICO da nota (uma parcela, ou sem duplicata) — o mesmo `LancamentoV2Form` do Novo lancamento. */
export function formDaNota(d: DoXml, e: EscolhasDaNota, vencimento: string, textos: { subcentro: string; macro_custo: string; grupo_custo: string; centro_custo: string }): LancamentoV2Form {
  const p = d.proposta;
  return {
    fazenda_id: e.fazendaId, conta_bancaria_id: e.contaBancariaId, conta_destino_id: null,
    data_competencia: p.competencia, data_vencimento: vencimento, data_pagamento: null,
    valor: p.valorCent / 100, tipo_operacao: p.tipoOperacao, status_transacao: 'programado', descricao: p.descricao,
    plano_conta_id: e.planoContaId, subcentro: textos.subcentro, macro_custo: textos.macro_custo, grupo_custo: textos.grupo_custo,
    centro_custo: textos.centro_custo, escopo_negocio: e.escopoNegocio ?? undefined,
    numero_documento: p.numeroDocumento, tipo_documento: 'Nota Fiscal', favorecido_id: e.favorecidoId,
    forma_pagamento: p.formaPagamento || null, safra_id: e.safraId || null, cultura: e.cultura || null, fase: null,
    ...(e.observacao ? { observacao: e.observacao } : {}),
  };
}

export interface Gravadores {
  gravar: (payload: PayloadParcelamento, clienteId: string) => Promise<string | null>;
  parcelas: (financiamentoId: string) => Promise<ParcelaGravada[]>;
  documentosDoParcelamento: (clienteId: string, parcelas: readonly ParcelaGravada[], pendentes: readonly DocumentoPendente[]) => Promise<DocumentoPendente[]>;
  documentosDoLancamento: (clienteId: string, lancamentoId: string, pendentes: readonly DocumentoPendente[]) => Promise<DocumentoPendente[]>;
  numeroNoLancamento: (clienteId: string, ids: readonly string[], numero: string) => Promise<string | null>;
  /** FIN-NOTA-PDF-01b — a RPC do "Atualizar e parcelar"; devolve o financiamento (ou lanca a recusa do banco). */
  parcelarExistente: (lancamentoId: string, payload: PayloadParcelamento) => Promise<string | null>;
  /** FIN-NOTA-PDF-01b — o gravador do lancamento unico: o da TELA (`handleSave`), que devolve o id criado. Sem ele, nao cria. */
  lancamento?: (form: LancamentoV2Form) => Promise<string | null>;
  /** NOTA-JA-LANCADA-01 — troca o fornecedor dos lancamentos pela funcao do lote (FORN-TROCAR-LOTE-01, com trilha). */
  trocarFornecedor?: (clienteId: string, ids: readonly string[], fornecedorId: string, motivo: string) => Promise<string | null>;
}

/** NOTA-JA-LANCADA-01 — a troca do fornecedor pela funcao do lote (simular=false, com o motivo). Devolve a frase da recusa, ou `null`. */
async function trocarFornecedorNoBanco(clienteId: string, ids: readonly string[], fornecedorId: string, motivo: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_lancamentos_trocar_favorecido', {
    p_cliente: clienteId, p_ids: [...ids], p_fornecedor: fornecedorId, p_motivo: motivo, p_simular: false,
  });
  if (error) return typeof error.message === 'string' && error.message ? error.message : 'O fornecedor não foi trocado.';
  notificarLancamentosMudaram(clienteId);
  return null;
}

/** Grava o numero da NF (e o tipo) SO' onde o lancamento nao tem documento. Devolve a mensagem de erro, ou `null`. */
async function numeroNoLancamentoDoBanco(clienteId: string, ids: readonly string[], numero: string): Promise<string | null> {
  if (!ids.length) return null;
  const { error } = await supabase.from('financeiro_lancamentos_v2').update({ numero_documento: numero, tipo_documento: 'Nota Fiscal' })
    .eq('cliente_id', clienteId).in('id', [...ids]).or('numero_documento.is.null,numero_documento.eq.');
  if (error) return error.message;
  notificarLancamentosMudaram(clienteId);
  return null;
}

async function parcelarExistenteNoBanco(lancamentoId: string, payload: PayloadParcelamento): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_parcelamento_a_partir_do_lancamento', { p_lancamento: lancamentoId, p_payload: payload, p_simular: false });
  if (error) throw error;
  notificarLancamentosMudaram(payload.cliente_id);
  const id: unknown = data && typeof data === 'object' ? Reflect.get(data, 'financiamento_id') : null;
  return typeof id === 'string' ? id : null;
}

export const GRAVADORES: Gravadores = {
  gravar: (payload, clienteId) => gravarParcelamento(payload, clienteId, async () => undefined),
  parcelas: lancamentosDoParcelamento,
  documentosDoParcelamento: gravarDocumentosDoParcelamento,
  documentosDoLancamento: gravarDocumentosPendentes,
  numeroNoLancamento: numeroNoLancamentoDoBanco,
  parcelarExistente: parcelarExistenteNoBanco,
  trocarFornecedor: trocarFornecedorNoBanco,
};

export type ResultadoDaNota = { ok: true; parcelas: number; erroDoDocumento: string | null } | { ok: false; erro: string };

const erroDe = (e: unknown, padrao: string) => (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message ? e.message : padrao);
const falhaDosDocumentos = (lista: DocumentoPendente[]) => (todosGravados(lista) ? null : (lista.find((x) => !x.gravado)?.erro ?? 'o documento não foi gravado'));

export async function criarParcelasDaNota(clienteId: string, d: DoXml, e: EscolhasDaNota, g: Gravadores = GRAVADORES): Promise<ResultadoDaNota> {
  let financiamentoId: string | null;
  try {
    financiamentoId = await g.gravar(payloadDaNota(clienteId, d, e), clienteId);
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'Falha ao criar as parcelas.') };
  }
  const n = d.proposta.duplicatas.length;
  try {
    const parcelas = financiamentoId ? await g.parcelas(financiamentoId) : [];
    if (!parcelas.length) return { ok: true, parcelas: n, erroDoDocumento: 'As parcelas foram criadas, mas não foram achadas para anexar a nota — anexe pelo Editar.' };
    const lista = await g.documentosDoParcelamento(clienteId, parcelas, [pendenteDaNota(d, e.favorecidoId)]);
    const falha = falhaDosDocumentos(lista);
    return { ok: true, parcelas: n, erroDoDocumento: falha ? `As ${n} parcelas foram criadas, mas a nota não foi anexada: ${falha}` : null };
  } catch (x) {
    return { ok: true, parcelas: n, erroDoDocumento: `As ${n} parcelas foram criadas, mas a nota não foi anexada: ${erroDe(x, 'falha')}` };
  }
}

/** O lancamento que ja' existe recebe a nota: no parcelamento, a NF na parcela 1 e ligada a todas; avulso, nele. */
export async function atualizarComANota(
  clienteId: string, alvo: { id: string; financiamentoId: string | null }, d: DoXml, favorecidoId: string, g: Gravadores = GRAVADORES,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const parcelas = alvo.financiamentoId ? await g.parcelas(alvo.financiamentoId) : [];
    const pendente = pendenteDaNota(d, favorecidoId);
    const lista = parcelas.length
      ? await g.documentosDoParcelamento(clienteId, parcelas, [pendente])
      : await g.documentosDoLancamento(clienteId, alvo.id, [pendente]);
    const falha = falhaDosDocumentos(lista);
    if (falha) return { ok: false, erro: `A nota não foi anexada: ${falha}` };
    const ids = parcelas.length ? parcelas.map((x) => x.lancamentoId) : [alvo.id];
    const erro = await g.numeroNoLancamento(clienteId, ids, d.proposta.numeroDocumento);
    return erro ? { ok: false, erro: `A nota foi anexada, mas o número do documento não foi gravado: ${erro}` } : { ok: true };
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'Falha ao atualizar o lançamento.') };
  }
}

/** FIN-NOTA-PDF-01b — UM lancamento (nota de uma parcela, ou sem duplicata): o gravador da tela, e a nota anexada a ele. */
export async function criarLancamentoDaNota(clienteId: string, d: DoXml, form: LancamentoV2Form, favorecidoId: string, g: Gravadores = GRAVADORES): Promise<ResultadoDaNota> {
  if (!g.lancamento) return { ok: false, erro: 'Gravador do lançamento indisponível. Nada foi gravado.' };
  let id: string | null;
  try { id = await g.lancamento(form); } catch (x) { return { ok: false, erro: erroDe(x, 'Falha ao criar o lançamento.') }; }
  if (!id) return { ok: false, erro: 'O lançamento não foi gravado (veja o aviso ao lado).' };
  try {
    const lista = await g.documentosDoLancamento(clienteId, id, [pendenteDaNota(d, favorecidoId)]);
    const falha = falhaDosDocumentos(lista);
    return { ok: true, parcelas: 1, erroDoDocumento: falha ? `O lançamento foi criado, mas a nota não foi anexada: ${falha}` : null };
  } catch (x) {
    return { ok: true, parcelas: 1, erroDoDocumento: `O lançamento foi criado, mas a nota não foi anexada: ${erroDe(x, 'falha')}` };
  }
}

/** FIN-NOTA-PDF-01b — "Atualizar e parcelar": o a' vista existente vira a parcela 1/N (mesmo id), nascem as demais, a nota em todas. */
export async function atualizarEParcelar(
  clienteId: string, alvoId: string, d: DoXml, e: EscolhasDaNota, parcelas: ParcelaDoPayload[], g: Gravadores = GRAVADORES,
): Promise<ResultadoDaNota> {
  let financiamentoId: string | null;
  try {
    financiamentoId = await g.parcelarExistente(alvoId, payloadDaNota(clienteId, d, e, parcelas));
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'Falha ao parcelar o lançamento.') };
  }
  const n = parcelas.length;
  try {
    const gravadas = financiamentoId ? await g.parcelas(financiamentoId) : [];
    if (!gravadas.length) return { ok: true, parcelas: n, erroDoDocumento: 'O lançamento foi parcelado, mas as parcelas não foram achadas para anexar a nota — anexe pelo Editar.' };
    const lista = await g.documentosDoParcelamento(clienteId, gravadas, [pendenteDaNota(d, e.favorecidoId)]);
    const falha = falhaDosDocumentos(lista);
    return { ok: true, parcelas: n, erroDoDocumento: falha ? `O lançamento foi parcelado em ${n}, mas a nota não foi anexada: ${falha}` : null };
  } catch (x) {
    return { ok: true, parcelas: n, erroDoDocumento: `O lançamento foi parcelado em ${n}, mas a nota não foi anexada: ${erroDe(x, 'falha')}` };
  }
}

/**
 * FIN-NOTA-PDF-01b (caso do Gabriel, 21/10 16h49: NF sem duplicata caiu no Novo lancamento e ele teve de escolher tudo de novo) —
 * NADA ESCOLHIDO NO MODAL SE PERDE. Se o operador segue para o Novo lancamento de sempre, o `prefill` leva o que a nota leu
 * (`prefillDaNota`: tipo, competencia, valor, descricao com os itens, documento, parcelas, o PDF como a NF pendente) MAIS o que ele
 * escolheu: fazenda, conta, status, subcentro/classificacao, safra/cultura, fornecedor (inclusive o cadastrado agora) e o vencimento.
 */
export function prefillDoModal(d: DoXml, e: {
  fazendaId: string; contaBancariaId: string | null; favorecidoId: string | null; favorecidoNome: string | null;
  plano: { id: string; subcentro: string; macro_custo: string; grupo_custo: string; centro_custo: string; escopo_negocio: string } | null;
  safraId: string | null; cultura: string | null; vencimento: string | null;
}) {
  /* o fornecedor escolhido vale tambem para a NF pendente (emitente) e para a faixa do fornecedor no Novo lancamento */
  const proposta = { ...d.proposta, favorecidoId: e.favorecidoId ?? d.proposta.favorecidoId,
    documento: { ...d.proposta.documento, emitenteId: e.favorecidoId ?? d.proposta.documento.emitenteId } };
  const resolucao = e.favorecidoId && e.favorecidoId !== d.resolucao.propostoId
    ? { achadoPor: 'documento' as const, candidatos: [{ id: e.favorecidoId, nome: e.favorecidoNome ?? d.emitenteNome }], propostoId: e.favorecidoId,
        inativo: false, cadastroSemDocumento: false, filialDiferente: false }
    : d.resolucao;
  const doXml: DoXml = { ...d, proposta, resolucao };
  const base = prefillDaNota(doXml);
  return {
    ...base,
    fazenda_id: e.fazendaId || base.fazenda_id,
    status_transacao: 'programado',
    ...(e.contaBancariaId ? { conta_bancaria_id: e.contaBancariaId } : {}),
    ...(e.favorecidoId ? { favorecido_id: e.favorecidoId } : {}),
    ...(e.vencimento ? { data_vencimento: e.vencimento } : {}),
    ...(e.plano ? {
      plano_conta_id: e.plano.id, subcentro: e.plano.subcentro, macro_custo: e.plano.macro_custo, grupo_custo: e.plano.grupo_custo,
      centro_custo: e.plano.centro_custo, escopo_negocio: e.plano.escopo_negocio,
    } : {}),
    ...(e.safraId ? { safra_id: e.safraId } : {}),
    ...(e.cultura != null ? { cultura: e.cultura } : {}),
    doXml,
  };
}

/**
 * NOTA-JA-LANCADA-01 — "Anexar a nota a estes N": a nota (PDF/XML) entra como NF num deles e fica LIGADA a todos; o numero do documento
 * so' onde esta' vazio. NAO muda valor, data, status, conta nem conciliacao. As parcelas que FALTAM (se o operador pediu) nascem antes,
 * uma por uma, pelo gravador da tela (o valor e o vencimento da parcela da nota), e recebem a nota junto. Trocar o fornecedor e' opcao
 * marcada, pela funcao do lote (com trilha e desfazer).
 */
export async function anexarAosJaLancados(
  clienteId: string, d: DoXml, alvos: readonly { id: string; numero: number }[], favorecidoDaNota: string,
  opcoes: { faltam?: { form: LancamentoV2Form; numero: number }[]; trocarPara?: string | null; motivoTroca?: string },
  g: Gravadores = GRAVADORES,
): Promise<{ ok: true; criados: number; avisos: string[] } | { ok: false; erro: string }> {
  const avisos: string[] = [];
  const todos = [...alvos];
  let criados = 0;
  for (const f of opcoes.faltam ?? []) {
    if (!g.lancamento) return { ok: false, erro: 'Gravador do lançamento indisponível. Nada foi criado.' };
    let id: string | null;
    try { id = await g.lancamento(f.form); } catch (x) { return { ok: false, erro: erroDe(x, 'Falha ao criar a parcela que faltava.') }; }
    if (!id) return { ok: false, erro: `A parcela ${f.numero} não foi criada (veja o aviso ao lado).` };
    todos.push({ id, numero: f.numero });
    criados += 1;
  }
  try {
    const parcelas: ParcelaGravada[] = todos.map((x, i) => ({ numero: x.numero || i + 1, lancamentoId: x.id }));
    const lista = await g.documentosDoParcelamento(clienteId, parcelas, [pendenteDaNota(d, favorecidoDaNota)]);
    const falha = falhaDosDocumentos(lista);
    if (falha) return { ok: false, erro: `A nota não foi anexada: ${falha}` };
    const e = await g.numeroNoLancamento(clienteId, todos.map((x) => x.id), d.proposta.numeroDocumento);
    if (e) avisos.push(`A nota foi anexada, mas o número do documento não foi gravado: ${e}`);
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'Falha ao anexar a nota.') };
  }
  if (opcoes.trocarPara) {
    if (!g.trocarFornecedor) avisos.push('A troca do fornecedor não está disponível aqui.');
    else {
      const e = await g.trocarFornecedor(clienteId, todos.map((x) => x.id), opcoes.trocarPara, opcoes.motivoTroca ?? 'fornecedor da nota');
      if (e) avisos.push(`A nota foi anexada, mas o fornecedor não foi trocado: ${e}`);
    }
  }
  return { ok: true, criados, avisos };
}
