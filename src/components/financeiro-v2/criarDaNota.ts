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
  /** P167 — liga um documento que JÁ EXISTE aos lançamentos (`fin_documento_vincular`, idempotente). Devolve a frase da recusa, ou `null`. */
  vincular?: (clienteId: string, documentoId: string, ids: readonly string[]) => Promise<string | null>;
}

/** P167 — a nota que a compra já tem se LIGA às outras parcelas dela; nunca nasce um segundo documento da mesma nota (o 32ffd9af do NJ). */
async function vincularNoBanco(clienteId: string, documentoId: string, ids: readonly string[]): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fin_documento_vincular', { p_documento: documentoId, p_cliente: clienteId, p_lancamentos: [...ids] });
  if (error) { console.error('fin_documento_vincular', error); return 'A nota que já existe não foi ligada às parcelas.'; }
  return null;
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
  vincular: vincularNoBanco,
};

const erroDe = (e: unknown, padrao: string) => (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message ? e.message : padrao);
const falhaDosDocumentos = (lista: DocumentoPendente[]) => (todosGravados(lista) ? null : (lista.find((x) => !x.gravado)?.erro ?? 'o documento não foi gravado'));

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
  /** NOTA-NOVA-MODAL-REAL — o "duplica": o motivo de criar mesmo com a nota parecendo já lançada (vai na observação) */
  observacao?: string | null;
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
    ...(e.observacao ? { observacao: e.observacao } : {}),
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
  opcoes: { faltam?: { form: LancamentoV2Form; numero: number }[]; trocarPara?: string | null; motivoTroca?: string;
    /** P167 — o documento desta nota que a compra JÁ TEM: liga-se este às parcelas (nunca outro registro da mesma nota) */
    notaExistente?: string | null },
  g: Gravadores = GRAVADORES,
): Promise<{ ok: true; criados: number; avisos: string[]; idsCriados: string[]; documentoIds: string[] } | { ok: false; erro: string }> {
  const avisos: string[] = [];
  const todos = [...alvos];
  let criados = 0;
  /* P128b — os ids do que nasceu aqui (as que faltavam, os documentos da nota): a operação do "Completar" os registra para o desfazer */
  const idsCriados: string[] = [];
  let documentoIds: string[] = [];
  for (const f of opcoes.faltam ?? []) {
    if (!g.lancamento) return { ok: false, erro: 'Gravador do lançamento indisponível. Nada foi criado.' };
    let id: string | null;
    try { id = await g.lancamento(f.form); } catch (x) { return { ok: false, erro: erroDe(x, 'Falha ao criar a parcela que faltava.') }; }
    if (!id) return { ok: false, erro: `A parcela ${f.numero} não foi criada (veja o aviso ao lado).` };
    todos.push({ id, numero: f.numero });
    idsCriados.push(id);
    criados += 1;
  }
  try {
    if (opcoes.notaExistente && g.vincular) {
      /* P167 — a nota já está na compra (o documento de antes, com ou sem a chave): só se liga às parcelas que faltam; nada novo nasce */
      const e = await g.vincular(clienteId, opcoes.notaExistente, todos.map((x) => x.id));
      if (e) return { ok: false, erro: e };
    } else {
      const parcelas: ParcelaGravada[] = todos.map((x, i) => ({ numero: x.numero || i + 1, lancamentoId: x.id }));
      const lista = await g.documentosDoParcelamento(clienteId, parcelas, [pendenteDaNota(d, favorecidoDaNota)]);
      const falha = falhaDosDocumentos(lista);
      if (falha) return { ok: false, erro: `A nota não foi anexada: ${falha}` };
      documentoIds = lista.flatMap((x) => (x.documentoId ? [x.documentoId] : []));
    }
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
  return { ok: true, criados, avisos, idsCriados, documentoIds };
}
