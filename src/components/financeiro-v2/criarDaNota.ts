/**
 * O "CRIAR N PARCELAS" E O "ATUALIZAR ESTE" DA NOTA FISCAL — FIN-NOTA-PDF-01. Nenhum gravador novo:
 *   criar     = `montarPayloadParcelamento` -> `gravarParcelamento` (a RPC `fn_parcelamento_cadastrar`, a mesma do "parcelada" do
 *               Novo lancamento) -> `lancamentosDoParcelamento` -> `gravarDocumentosDoParcelamento` (a NF na parcela 1, LIGADA a todas);
 *   atualizar = a cadeia de documentos de sempre no lancamento que ja' existe (e nas irmas, se for parcela) + o numero da NF onde
 *               o lancamento nao tem documento.
 * ⚠ O DOCUMENTO NAO E' TRANSACIONAL COM AS PARCELAS (o storage nao entra em transacao): parcelas gravadas e documento recusado
 *   voltam como `{ ok: true, erroDoDocumento }` — as parcelas FICAM, e a frase diz o que faltou.
 * ⚠ FICA AO LADO DO DIALOGO (e nao em `src/lib`) porque `gravarParcelamento` mora no arquivo do `LancamentoV2Dialog`.
 */
import { supabase } from '@/integrations/supabase/client';
import { montarPayloadParcelamento, type PayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';
import {
  gravarDocumentosDoParcelamento, gravarDocumentosPendentes, lancamentosDoParcelamento, todosGravados, type DocumentoPendente, type ParcelaGravada,
} from '@/lib/financeiro/documentosPendentes';
import { pendenteDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { gravarParcelamento } from './LancamentoV2Dialog';

export interface EscolhasDaNota {
  fazendaId: string;
  favorecidoId: string;
  contaBancariaId: string | null;
  /** A linha do plano escolhida (o subcentro) e o escopo dela. */
  planoContaId: string;
  escopoNegocio: string | null;
}

/** O payload do parcelamento da nota — PURO. Mensal (as duplicatas cabem no parcelamento de hoje) ou as parcelas como na nota. */
export function payloadDaNota(clienteId: string, d: DoXml, e: EscolhasDaNota): PayloadParcelamento {
  const p = d.proposta;
  const livres = p.parcelamento.tipo === 'livres'
    ? p.duplicatas.map((x, i) => ({ numero: i + 1, data_vencimento: x.vencimento, valor: x.valorCent / 100 }))
    : null;
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
    observacao: null,
  }, { plano_conta_id: e.planoContaId, safra_id: null, cultura: null, fase: null });
}

export interface Gravadores {
  gravar: (payload: PayloadParcelamento, clienteId: string) => Promise<string | null>;
  parcelas: (financiamentoId: string) => Promise<ParcelaGravada[]>;
  documentosDoParcelamento: (clienteId: string, parcelas: readonly ParcelaGravada[], pendentes: readonly DocumentoPendente[]) => Promise<DocumentoPendente[]>;
  documentosDoLancamento: (clienteId: string, lancamentoId: string, pendentes: readonly DocumentoPendente[]) => Promise<DocumentoPendente[]>;
  numeroNoLancamento: (clienteId: string, ids: readonly string[], numero: string) => Promise<string | null>;
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

export const GRAVADORES: Gravadores = {
  gravar: (payload, clienteId) => gravarParcelamento(payload, clienteId, async () => undefined),
  parcelas: lancamentosDoParcelamento,
  documentosDoParcelamento: gravarDocumentosDoParcelamento,
  documentosDoLancamento: gravarDocumentosPendentes,
  numeroNoLancamento: numeroNoLancamentoDoBanco,
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
