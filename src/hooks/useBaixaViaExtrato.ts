/**
 * useBaixaViaExtrato — converte lançamento Agendado/Programado em Realizado via OFX.
 *
 * REGRAS:
 *   - SOMENTE altera (e ainda assim opcionalmente):
 *       status_transacao, data_pagamento, numero_documento (se vazio),
 *       valor (apenas quando o caller passa atualizarValorLancamento),
 *       updated_at.
 *   - NÃO altera: categoria, centro, macro, grupo, conta, fazenda, sinal,
 *                 fornecedor, descrição, classificação.
 *   - NÃO converte cenário 'meta' nem cancelados.
 *   - Se o lançamento já está 'realizado', apenas vincula ao extrato (sem
 *     mexer no status). Pode atualizar valor se atualizarValorLancamento
 *     for passado explicitamente (fluxo de divergência opção B).
 *   - Sempre exige ação manual do caller — este hook não automatiza nada.
 *
 * Quando `extratoId` é fornecido, cria também o vínculo N:N em
 * `conciliacao_bancaria_itens` via `useConciliacaoBancariaItens.insert`,
 * que recomputa o status do extrato (`conciliado` / `parcial`).
 */
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useConciliacaoBancariaItens } from './useConciliacaoBancariaItens';

export interface BaixaParams {
  lancamentoId: string;
  /** Quando fornecido, cria vínculo em conciliacao_bancaria_itens. */
  extratoId?: string;
  /** Data efetiva de pagamento (do extrato). Se omitida, mantém data atual. */
  dataPagamentoReal?: string;
  /** Documento bancário (FITID/CHECKNUM). Só preenche se lançamento estiver vazio. */
  documentoBanco?: string;
  /** Valor a aplicar no vínculo de conciliação. Default: |valor| do lançamento. */
  valorPagoReal?: number;
  /**
   * Atualiza `valor` do lançamento (em módulo) quando passado explicitamente.
   * Usado no fluxo de divergência de valor (Opção B): o usuário aprovou
   * adotar o valor real do extrato. NÃO mexe em fornecedor, descrição,
   * conta, fazenda, categoria, centro, macro, grupo, sinal ou classificação.
   */
  atualizarValorLancamento?: number;
}

interface LancamentoLido {
  id: string;
  cliente_id: string;
  status_transacao: string | null;
  cenario: string | null;
  cancelado: boolean;
  data_pagamento: string | null;
  numero_documento: string | null;
  valor: number;
}

export function useBaixaViaExtrato() {
  const { clienteAtual } = useCliente();
  const { insert: insertConciliacao } = useConciliacaoBancariaItens();

  async function baixarLancamentoViaExtrato(p: BaixaParams): Promise<{
    convertido: boolean;
    vinculado: boolean;
    valorAtualizado: boolean;
  }> {
    if (!clienteAtual?.id) {
      throw new Error('Cliente não selecionado — recarregue a tela e tente novamente.');
    }
    if (!p.lancamentoId) throw new Error('Lançamento não informado');

    // 1) Carregar lançamento.
    const { data: row, error: e1 } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, cliente_id, status_transacao, cenario, cancelado, data_pagamento, numero_documento, valor')
      .eq('id', p.lancamentoId)
      .maybeSingle();
    if (e1) throw e1;
    if (!row) throw new Error('Lançamento não encontrado');
    const lanc = row as unknown as LancamentoLido;

    // 2) Guards.
    if (lanc.cancelado) throw new Error('Lançamento cancelado — não pode ser baixado');
    if (lanc.cenario === 'meta') throw new Error('Lançamento META não pode ser convertido em realizado');

    const status = (lanc.status_transacao || '').toLowerCase();
    if (status !== 'agendado' && status !== 'programado' && status !== 'realizado') {
      throw new Error(`Status inválido para baixa via OFX: ${lanc.status_transacao}`);
    }

    // 3) Construir update condicional. Status, data, doc, valor — cada um
    //    avaliado independentemente. Nada é alterado fora deste bloco.
    const update: Record<string, unknown> = {};
    let convertido = false;
    let valorAtualizado = false;

    // 3a) Conversão de status (somente agendado/programado → realizado).
    if (status === 'agendado' || status === 'programado') {
      update.status_transacao = 'realizado';
      if (p.dataPagamentoReal) update.data_pagamento = p.dataPagamentoReal;
      if (p.documentoBanco && !lanc.numero_documento) update.numero_documento = p.documentoBanco;
      convertido = true;
    }

    // 3b) Atualização opcional de valor (Opção B do fluxo de divergência).
    //     Disparada SOMENTE quando o caller passa atualizarValorLancamento.
    //     Aplica apenas se diferir do valor atual em > 0.01 (em módulo).
    if (p.atualizarValorLancamento !== undefined) {
      const novoValor = Math.abs(p.atualizarValorLancamento);
      const valorAtual = Math.abs(Number(lanc.valor) || 0);
      if (Math.abs(novoValor - valorAtual) > 0.01) {
        update.valor = novoValor;
        valorAtualizado = true;
      }
    }

    // 3c) Aplica update se há algum campo a alterar.
    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      const { error: e2 } = await supabase
        .from('financeiro_lancamentos_v2')
        .update(update)
        .eq('id', p.lancamentoId);
      if (e2) throw e2;
    }

    // 4) Vínculo em conciliacao_bancaria_itens (se extratoId fornecido).
    //    Quando o usuário escolheu Opção B (atualizar valor), o vínculo
    //    usa o novo valor — assim o extrato fica conciliado por completo.
    //    Caso contrário, mantém o valor original do lançamento (Opção A —
    //    extrato pode ficar parcial).
    let vinculado = false;
    if (p.extratoId) {
      const valorAplicado =
        p.atualizarValorLancamento !== undefined
          ? Math.abs(p.atualizarValorLancamento)
          : (p.valorPagoReal ?? Math.abs(Number(lanc.valor) || 0));
      try {
        await insertConciliacao({
          cliente_id: clienteAtual.id,
          extrato_id: p.extratoId,
          lancamento_id: p.lancamentoId,
          valor_aplicado: valorAplicado,
        });
        vinculado = true;
      } catch (err: any) {
        // Se UNIQUE (extrato_id, lancamento_id) já existe, não é erro fatal.
        const msg = String(err?.message ?? err ?? '');
        if (!msg.includes('duplicate key') && !msg.includes('idx_conciliacao_itens_par_unico')) {
          throw err;
        }
      }
    }

    return { convertido, vinculado, valorAtualizado };
  }

  return { baixarLancamentoViaExtrato };
}
