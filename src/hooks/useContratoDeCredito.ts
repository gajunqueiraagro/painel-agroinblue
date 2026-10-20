/**
 * FIN-FINANC-28 · PASSO 4 — as leituras e os gestos da tela do contrato de crédito: liberações, destinações e documentos do
 * contrato. A tela NÃO grava em tabela: todo gesto é uma RPC do banco (migration 20261027200200), e cada um tem o contrário
 * (remover liberação · remover destinação · remover documento). Depois de cada gesto relê as três listas, a situação (cartões e
 * saldo) e a lista de contratos — sem F5.
 *
 * ⚠ LEITURAS SEPARADAS, SEM EMBED: `financiamento_liberacoes` tem DUAS chaves para `financiamentos` (o contrato e o liquidado), e o
 *   embed sem dica ficaria ambíguo. As quatro leituras extras (lançamentos, contas, fornecedores, contratos) são por id.
 * ⚠ `financiamento_documentos` nasceu depois do `types.ts`: lido com `(supabase as any).from` (dívida declarada, como as `lr_*`).
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ESPECIES_DO_CONTRATO, FORMAS_DA_LIBERACAO,
  type DestinacaoDoContrato, type DocumentoDoContrato, type EncargoDoContrato, type EspecieDoContrato, type FormaDaLiberacao, type LiberacaoDoContrato,
} from '@/lib/financiamentos/contratoDeCredito';
import { extensaoDoArquivo } from '@/lib/oc/caminhoDocumento';
import {
  encargosPertoDasLiberacoes, janelaDosEncargos, lerBuscaNoContrato, lerResultadoDoVinculo, opcoesParaOBanco,
  type OpcoesDaBusca,
  type BuscaNoContrato, type EncargoSugerido, type PapelDoPagamento, type ResultadoDoVinculo,
} from '@/lib/financiamentos/buscaNoContrato';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { lerTelaDoContrato, type TelaDoContrato } from '@/lib/financiamentos/telaDoContrato';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { lerBaixaViva, lerResultadoDaBaixa, type BaixaViva, type ResultadoDaBaixa, type TipoDeBaixa } from '@/lib/financiamentos/baixaDoContrato';
import {
  lerResultadoDaJuncao, lerResultadoDoDesfazerJuncao, type ResultadoDaJuncao, type ResultadoDoDesfazerJuncao,
} from '@/lib/financiamentos/juntarContratos';

export const BUCKET_DO_CONTRATO = 'fin-documentos';
const CHAVES_DA_TELA = ['contrato-liberacoes', 'contrato-destinacoes', 'contrato-documentos', 'contrato-captacoes-livres', 'contrato-encargos',
  'contrato-vinculos-pagamento', 'financiamento-parcelas', 'contrato-baixa-viva', 'financiamento-detalhe'];
const CHAVES_QUE_LEEM_O_SALDO = ['contrato-tela', 'financiamento-situacao', 'financiamentos-lista', 'financiamento-primeira-liberacao', 'painel-financiamentos'];
/** EDITAR = CADASTRO NOVO v2: quem grava no contrato por fora deste hook (a edição) relê as mesmas chaves */
export const CHAVES_DO_CONTRATO: readonly string[] = [...CHAVES_DA_TELA, ...CHAVES_QUE_LEEM_O_SALDO, 'contrato-operacoes-parcelas'];

type Linha = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0);
const forma = (v: unknown): FormaDaLiberacao => FORMAS_DA_LIBERACAO.find((f) => f === v) ?? 'conta';
const especie = (v: unknown): EspecieDoContrato => ESPECIES_DO_CONTRATO.find((e) => e === v) ?? 'outro';
/** a mensagem do banco (P0001 já vem em português) — nunca o objeto cru */
const fraseDoErro = (e: unknown): string => {
  const m = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return m.replace(/^(ERROR:\s*)?(P0001|42501):\s*/i, '').trim() || 'Não foi possível gravar.';
};

export interface CaptacaoLivre { id: string; data: string | null; valor: number; descricao: string | null; conta: string | null; status: string | null }
export interface ContratoAnterior { id: string; numero: string | null; descricao: string | null }

/** o pagamento que o operador vinculou à parcela (passo 4b) — a trilha viva, por parcela */
export interface VinculoDePagamento { id: string; parcelaId: string; lancamentoId: string; papel: PapelDoPagamento }

export interface PedidoDeLiberacao {
  id: string | null; data: string; valor: number; forma: FormaDaLiberacao;
  lancamentoId: string | null; fornecedorId: string | null; contratoLiquidadoId: string | null; destinacaoId: string | null; observacao: string | null;
}

/** os pagamentos vinculados pelo operador (a trilha viva). FIN-CONTRATO-CRONOGRAMA-01: a MESMA leitura (e a mesma chave
 *  `contrato-vinculos-pagamento`) serve a tela do contrato e a aba Condições do cadastro. */
export async function lerVinculosDePagamento(financiamentoId: string): Promise<VinculoDePagamento[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, fora do types.ts
  const { data, error } = await (supabase as any).from('financiamento_parcela_vinculos')
    .select('id, parcela_id, lancamento_id, papel').eq('financiamento_id', financiamentoId).is('desfeito_em', null);
  if (error) throw error;
  const rows: Linha[] = data ?? [];
  return rows.flatMap((r) => {
    const p = r.papel === 'principal' || r.papel === 'juros' || r.papel === 'total' ? r.papel : null;
    return p ? [{ id: String(r.id), parcelaId: String(r.parcela_id), lancamentoId: String(r.lancamento_id), papel: p }] : [];
  });
}

export function useContratoDeCredito(financiamentoId: string | null | undefined, clienteId: string | null | undefined) {
  const qc = useQueryClient();
  const ligado = !!financiamentoId && !!clienteId;

  const liberacoes = useQuery({
    queryKey: ['contrato-liberacoes', financiamentoId],
    enabled: ligado,
    queryFn: async (): Promise<LiberacaoDoContrato[]> => {
      const { data, error } = await supabase.from('financiamento_liberacoes')
        .select('id, data, valor, forma, lancamento_id, fornecedor_id, contrato_liquidado_id, destinacao_id, observacao')
        .eq('financiamento_id', financiamentoId!).is('cancelado_em', null).order('data', { ascending: true });
      if (error) throw error;
      const rows: Linha[] = data ?? [];
      const ids = (k: string) => [...new Set(rows.map((r) => txt(r[k])).filter((v): v is string => !!v))];
      const lancIds = ids('lancamento_id'); const fornIds = ids('fornecedor_id'); const finIds = ids('contrato_liquidado_id');
      const lancs = new Map<string, { descricao: string | null; data: string | null; contaId: string | null }>();
      if (lancIds.length) {
        const r = await supabase.from('financeiro_lancamentos_v2').select('id, descricao, data_pagamento, data_vencimento, conta_destino_id, conta_bancaria_id').in('id', lancIds);
        for (const l of r.data ?? []) lancs.set(l.id, { descricao: l.descricao, data: l.data_pagamento ?? l.data_vencimento, contaId: l.conta_destino_id ?? l.conta_bancaria_id });
      }
      const contaIds = [...new Set([...lancs.values()].map((l) => l.contaId).filter((v): v is string => !!v))];
      const contas = new Map<string, string>();
      if (contaIds.length) {
        const r = await supabase.from('financeiro_contas_bancarias').select('id, nome_conta, nome_exibicao').in('id', contaIds);
        for (const c of r.data ?? []) contas.set(c.id, c.nome_exibicao || c.nome_conta);
      }
      const forns = new Map<string, string>();
      if (fornIds.length) {
        const r = await supabase.from('financeiro_fornecedores').select('id, nome').in('id', fornIds);
        for (const f of r.data ?? []) forns.set(f.id, f.nome);
      }
      const fins = new Map<string, string | null>();
      if (finIds.length) {
        const r = await supabase.from('financiamentos').select('id, numero_contrato').in('id', finIds);
        for (const f of r.data ?? []) fins.set(f.id, f.numero_contrato);
      }
      return rows.map((r) => {
        const lid = txt(r.lancamento_id); const l = lid ? lancs.get(lid) : undefined;
        const fid = txt(r.fornecedor_id); const cid = txt(r.contrato_liquidado_id);
        return {
          id: String(r.id), data: String(r.data), valor: num(r.valor), forma: forma(r.forma),
          lancamentoId: lid, lancamento: l ? { descricao: l.descricao, data: l.data, conta: l.contaId ? contas.get(l.contaId) ?? null : null } : null,
          fornecedorId: fid, fornecedorNome: fid ? forns.get(fid) ?? null : null,
          contratoLiquidadoId: cid, contratoLiquidadoNumero: cid ? fins.get(cid) ?? null : null,
          destinacaoId: txt(r.destinacao_id), observacao: txt(r.observacao),
        };
      });
    },
  });

  /* TELA DO CONTRATO v3 — a leitura única da tela (`fn_contrato_tela`): condições com a taxa a.a., liberações com "entrou" e "a
     identificar", pagamentos, histórico e o "A resolver" — tudo pronto do banco. Relida junto com o saldo (`CHAVES_QUE_LEEM_O_SALDO`). */
  const tela = useQuery({
    queryKey: ['contrato-tela', financiamentoId],
    enabled: ligado,
    queryFn: async (): Promise<TelaDoContrato | null> => {
      const { data, error } = await (supabase as any).rpc('fn_contrato_tela', { p_financiamento_id: financiamentoId, p_hoje: hojeLocal() });
      if (error) throw error;
      return lerTelaDoContrato(data);
    },
  });

  const destinacoes = useQuery({
    queryKey: ['contrato-destinacoes', financiamentoId],
    enabled: ligado,
    queryFn: async (): Promise<DestinacaoDoContrato[]> => {
      const { data, error } = await supabase.from('financiamento_destinacoes').select('id, descricao, valor, valor_orcado, created_at')
        .eq('financiamento_id', financiamentoId!).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({ id: d.id, descricao: d.descricao, orcado: num(d.valor_orcado ?? d.valor) }));
    },
  });

  /* os encargos VIVOS do contrato (o vínculo da FIN-CONTRATO-VINCULAR-ENCARGO-01), com o valor do lançamento — a linha das destinações */
  const encargos = useQuery({
    queryKey: ['contrato-encargos', financiamentoId],
    enabled: ligado,
    queryFn: async (): Promise<EncargoDoContrato[]> => {
      const { data, error } = await supabase.from('financiamento_encargos').select('papel, lancamento_id').eq('financiamento_id', financiamentoId!).is('desfeito_em', null);
      if (error) throw error;
      const ids = (data ?? []).map((e) => e.lancamento_id);
      if (ids.length === 0) return [];
      const r = await supabase.from('financeiro_lancamentos_v2').select('id, valor, cancelado').in('id', ids);
      const valor = new Map((r.data ?? []).filter((l) => !l.cancelado).map((l) => [l.id, num(l.valor)]));
      return (data ?? []).filter((e) => valor.has(e.lancamento_id)).map((e) => ({ papel: e.papel, valor: valor.get(e.lancamento_id) ?? 0 }));
    },
  });

  const documentos = useQuery({
    queryKey: ['contrato-documentos', financiamentoId],
    enabled: ligado,
    queryFn: async (): Promise<DocumentoDoContrato[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, fora do types.ts
      const { data, error } = await (supabase as any).from('financiamento_documentos')
        .select('id, especie, nome, storage_path, criado_em, enviado_por').eq('financiamento_id', financiamentoId!)
        .is('cancelado_em', null).order('criado_em', { ascending: true });
      if (error) throw error;
      const rows: Linha[] = data ?? [];
      const quem = [...new Set(rows.map((r) => txt(r.enviado_por)).filter((v): v is string => !!v))];
      const nomes = new Map<string, string>();
      if (quem.length) {
        const r = await supabase.from('profiles').select('user_id, nome').in('user_id', quem);
        for (const p of r.data ?? []) if (p.nome) nomes.set(p.user_id, p.nome);
      }
      return rows.map((r) => ({
        id: String(r.id), especie: especie(r.especie), nome: String(r.nome), storagePath: txt(r.storage_path), criadoEm: String(r.criado_em),
        enviadoPor: txt(r.enviado_por) ? nomes.get(String(r.enviado_por)) ?? null : null,
      }));
    },
  });

  /* passo 4b: os pagamentos vinculados pelo operador (a trilha viva) — a linha do cronograma oferece "desvincular" por eles */
  const vinculos = useQuery({
    queryKey: ['contrato-vinculos-pagamento', financiamentoId],
    enabled: ligado,
    queryFn: () => lerVinculosDePagamento(financiamentoId!),
  });

  /* passo 5: a baixa viva (a que o "Desfazer baixa" desfaz) */
  const baixaViva = useQuery({
    queryKey: ['contrato-baixa-viva', financiamentoId],
    enabled: ligado,
    queryFn: async (): Promise<BaixaViva | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, fora do types.ts
      const { data, error } = await (supabase as any).from('financiamento_baixas').select('id, tipo, data, motivo')
        .eq('financiamento_id', financiamentoId!).is('desfeita_em', null).maybeSingle();
      if (error) throw error;
      return lerBaixaViva(data);
    },
  });

  const reler = useCallback(() => {
    for (const k of [...CHAVES_DA_TELA, ...CHAVES_QUE_LEEM_O_SALDO]) void qc.invalidateQueries({ queryKey: [k] });
  }, [qc]);

  /** cada gesto devolve a frase do banco quando recusa (escrita ao lado do botão), ou nulo */
  const rpc = useCallback(async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc(fn, args);
    if (error) return fraseDoErro(error);
    reler();
    return null;
  }, [reler]);

  const salvarLiberacao = useCallback((p: PedidoDeLiberacao) => rpc('fn_financiamento_liberacao_salvar', {
    p_financiamento_id: financiamentoId, p_id: p.id, p_data: p.data, p_valor: p.valor, p_forma: p.forma,
    p_lancamento_id: p.forma === 'conta' ? p.lancamentoId : null, p_fornecedor_id: p.forma === 'fornecedor' ? p.fornecedorId : null,
    p_contrato_liquidado_id: p.forma === 'liquidacao' ? p.contratoLiquidadoId : null, p_destinacao_id: p.destinacaoId, p_observacao: p.observacao,
  }), [rpc, financiamentoId]);
  const removerLiberacao = useCallback((id: string, motivo: string) => rpc('fn_financiamento_liberacao_remover', { p_id: id, p_motivo: motivo }), [rpc]);
  const salvarDestinacao = useCallback((id: string | null, descricao: string, orcado: number) => rpc('fn_financiamento_destinacao_salvar', {
    p_financiamento_id: financiamentoId, p_id: id, p_descricao: descricao, p_valor_orcado: orcado,
  }), [rpc, financiamentoId]);
  const removerDestinacao = useCallback((id: string) => rpc('fn_financiamento_destinacao_remover', { p_id: id }), [rpc]);
  const removerDocumento = useCallback((id: string, motivo: string) => rpc('fn_financiamento_documento_remover', { p_id: id, p_motivo: motivo }), [rpc]);

  /** REGISTRAR PRIMEIRO, SUBIR DEPOIS (a lei do molde): o caminho vem do banco. Falhou a subida, o registro é cancelado. */
  const enviarDocumento = useCallback(async (arquivo: File, esp: EspecieDoContrato): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_documento_registrar', {
      p_financiamento_id: financiamentoId, p_especie: esp, p_nome: arquivo.name, p_extensao: extensaoDoArquivo(arquivo) ?? 'bin', p_tipo: arquivo.type || null, p_tamanho: arquivo.size,
    });
    if (error) return fraseDoErro(error);
    const caminho = typeof data?.storage_path === 'string' ? data.storage_path : null;
    const docId = typeof data?.id === 'string' ? data.id : null;
    if (!caminho || !docId) return 'O banco não devolveu o caminho do arquivo.';
    const up = await supabase.storage.from(BUCKET_DO_CONTRATO).upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined });
    if (up.error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      await (supabase as any).rpc('fn_financiamento_documento_remover', { p_id: docId, p_motivo: 'o arquivo não subiu' });
      reler();
      return `O arquivo "${arquivo.name}" não subiu: ${up.error.message}. Nada ficou registrado.`;
    }
    reler();
    return null;
  }, [financiamentoId, reler]);

  const urlDoDocumento = useCallback(async (caminho: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET_DO_CONTRATO).createSignedUrl(caminho, 60);
    return error ? null : data?.signedUrl ?? null;
  }, []);

  const lerCaptacoesLivres = useCallback(async (): Promise<CaptacaoLivre[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_captacoes_livres', { p_financiamento_id: financiamentoId });
    if (error || !Array.isArray(data)) return [];
    return data.map((r: Linha) => ({ id: String(r.id), data: txt(r.data), valor: num(r.valor), descricao: txt(r.descricao), conta: txt(r.conta), status: txt(r.status) }));
  }, [financiamentoId]);

  /* ═══ passo 4b — buscar entradas e pagamentos (o banco sugere e decide; a tela só lê e confirma) ═══ */
  const buscar = useCallback(async (alvo: 'liberacao' | 'parcela', parcelaId: string | null, opcoes?: OpcoesDaBusca): Promise<BuscaNoContrato | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_candidatas', { p_financiamento_id: financiamentoId, p_alvo: alvo, p_parcela_id: parcelaId,
      ...(opcoes ? { p_opcoes: opcoesParaOBanco(opcoes) } : {}) });
    if (error) return fraseDoErro(error);
    return lerBuscaNoContrato(data) ?? 'Não foi possível ler as candidatas.';
  }, [financiamentoId]);

  const aposGravarNoFinanceiro = useCallback(() => {
    reler();
    if (clienteId) notificarLancamentosMudaram(clienteId);
  }, [reler, clienteId]);

  const vincularPagamento = useCallback(async (parcelaId: string, lancamentoId: string, papelDoPagamento: PapelDoPagamento, mover: boolean, simular: boolean,
    atualizarValor?: boolean | null): Promise<ResultadoDoVinculo | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_parcela_vincular', {
      p_parcela_id: parcelaId, p_lancamento_id: lancamentoId, p_papel: papelDoPagamento, p_mover: mover, p_simular: simular,
      ...(atualizarValor === true || atualizarValor === false ? { p_atualizar_valor: atualizarValor } : {}),
    });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDoVinculo(data);
    if (!r) return 'Resposta do banco fora do formato.';
    if (!simular) aposGravarNoFinanceiro();
    return r;
  }, [aposGravarNoFinanceiro]);

  const desvincularPagamento = useCallback(async (vinculoId: string, motivo: string, simular: boolean): Promise<ResultadoDoVinculo | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_parcela_desvincular', { p_vinculo_id: vinculoId, p_motivo: motivo, p_simular: simular });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDoVinculo(data);
    if (!r) return 'Resposta do banco fora do formato.';
    if (!simular) aposGravarNoFinanceiro();
    return r;
  }, [aposGravarNoFinanceiro]);

  /** os encargos soltos do credor (IOF, tarifa, seguro) perto das liberações — pelo dono de "vinculável a encargo" */
  const lerEncargosPerto = useCallback(async (datas: readonly string[]): Promise<EncargoSugerido[] | string> => {
    const j = janelaDosEncargos(datas);
    if (!j) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_contrato_encargos_vinculaveis', { p_financiamento_id: financiamentoId, p_de: j.de, p_ate: j.ate });
    if (error) return fraseDoErro(error);
    const linhas = typeof data === 'object' && data !== null && 'linhas' in data ? data.linhas : null;
    return encargosPertoDasLiberacoes(linhas, datas);
  }, [financiamentoId]);

  const vincularEncargo = useCallback(async (e: EncargoSugerido): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_contrato_encargo_vincular', {
      p_financiamento_id: financiamentoId, p_itens: [{ lancamento_id: e.lancamentoId, papel: e.papel }], p_simular: false,
    });
    if (error) return fraseDoErro(error);
    aposGravarNoFinanceiro();
    return null;
  }, [financiamentoId, aposGravarNoFinanceiro]);

  /* ═══ passo 5 — dar baixa e o gesto contrário (o banco decide; simular = a gravação desfeita) ═══ */
  const darBaixa = useCallback(async (tipo: TipoDeBaixa, dados: Record<string, unknown>, simular: boolean): Promise<ResultadoDaBaixa | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_baixa', { p_financiamento_id: financiamentoId, p_tipo: tipo, p_dados: dados, p_simular: simular });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDaBaixa(data);
    if (!r) return 'Resposta do banco fora do formato.';
    if (!simular) aposGravarNoFinanceiro();
    return r;
  }, [financiamentoId, aposGravarNoFinanceiro]);

  const desfazerBaixa = useCallback(async (baixaId: string, motivo: string): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_baixa_desfazer', { p_baixa_id: baixaId, p_motivo: motivo, p_simular: false });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDaBaixa(data);
    if (r?.recusa) return r.recusa;
    aposGravarNoFinanceiro();
    return null;
  }, [aposGravarNoFinanceiro]);

  /** os contratos que podem ser o NOVO numa rolagem: financiamento / empréstimo vigente do cliente, menos este */
  const lerSucessores = useCallback(async (): Promise<ContratoAnterior[]> => {
    const { data } = await supabase.from('financiamentos').select('id, numero_contrato, descricao, natureza, status')
      .eq('cliente_id', clienteId!).neq('natureza', 'parcelamento').neq('id', financiamentoId!).in('status', ['ativo', 'prorrogado'])
      .order('data_contrato', { ascending: false });
    return (data ?? []).map((f) => ({ id: f.id, numero: f.numero_contrato, descricao: f.descricao }));
  }, [clienteId, financiamentoId]);

  /* ═══ FIN-CONTRATO-JUNTAR-01 — juntar o outro cadastro do mesmo contrato (o banco decide; simular = a gravação desfeita) ═══ */
  /** os que podem ser absorvidos: vigentes do MESMO cliente, credor e natureza, menos este (o banco recusa o resto) */
  const lerJuntaveis = useCallback(async (): Promise<(ContratoAnterior & { valor: number })[]> => {
    const { data: este } = await supabase.from('financiamentos').select('credor_id, natureza').eq('id', financiamentoId!).maybeSingle();
    if (!este?.credor_id) return [];
    const { data } = await supabase.from('financiamentos').select('id, numero_contrato, descricao, valor_total')
      .eq('cliente_id', clienteId!).eq('credor_id', este.credor_id).eq('natureza', este.natureza ?? 'financiamento').neq('id', financiamentoId!)
      .in('status', ['ativo', 'prorrogado']).order('data_contrato', { ascending: true });
    return (data ?? []).map((f) => ({ id: f.id, numero: f.numero_contrato, descricao: f.descricao, valor: Number(f.valor_total) }));
  }, [clienteId, financiamentoId]);

  const juntar = useCallback(async (absorverId: string, simular: boolean): Promise<ResultadoDaJuncao | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_juntar', { p_manter: financiamentoId, p_absorver: absorverId, p_simular: simular });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDaJuncao(data);
    if (!r) return 'Resposta do banco fora do formato.';
    if (!simular && !r.recusa) aposGravarNoFinanceiro();
    return r;
  }, [financiamentoId, aposGravarNoFinanceiro]);

  const desfazerJuncao = useCallback(async (juncaoId: string, simular: boolean): Promise<ResultadoDoDesfazerJuncao | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_juntar_desfazer', { p_juncao_id: juncaoId, p_simular: simular });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDoDesfazerJuncao(data);
    if (!r) return 'Resposta do banco fora do formato.';
    if (!simular && !r.recusa) aposGravarNoFinanceiro();
    return r;
  }, [aposGravarNoFinanceiro]);

  const lerContratosAnteriores = useCallback(async (): Promise<ContratoAnterior[]> => {
    const { data } = await supabase.from('financiamentos').select('id, numero_contrato, descricao, natureza')
      .eq('cliente_id', clienteId!).neq('natureza', 'parcelamento').neq('id', financiamentoId!).order('data_contrato', { ascending: false });
    return (data ?? []).map((f) => ({ id: f.id, numero: f.numero_contrato, descricao: f.descricao }));
  }, [clienteId, financiamentoId]);

  return {
    tela: tela.data ?? null, erroDaTela: tela.error ? 'Não foi possível ler o contrato.' : null, relerTela: () => void tela.refetch(),
    liberacoes: liberacoes.data ?? null, destinacoes: destinacoes.data ?? null, documentos: documentos.data ?? null, encargos: encargos.data ?? [],
    erroDeLeitura: liberacoes.error || destinacoes.error || documentos.error ? 'Não foi possível ler liberações, destinações ou documentos.' : null,
    salvarLiberacao, removerLiberacao, salvarDestinacao, removerDestinacao, enviarDocumento, removerDocumento, urlDoDocumento,
    lerCaptacoesLivres, lerContratosAnteriores,
    baixaViva: baixaViva.data ?? null, darBaixa, desfazerBaixa, lerSucessores,
    lerJuntaveis, juntar, desfazerJuncao,
    vinculos: vinculos.data ?? [], buscar, vincularPagamento, desvincularPagamento, lerEncargosPerto, vincularEncargo,
  };
}
