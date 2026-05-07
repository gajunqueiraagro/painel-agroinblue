/**
 * useBaixaViaExtrato — converte lançamento Agendado/Programado em Realizado via OFX.
 *
 * REGRAS:
 *   - SOMENTE altera: status_transacao, data_pagamento (se vier), numero_documento (se vazio), updated_at.
 *   - NÃO altera: categoria, centro, macro, grupo, conta, fazenda, valor original, sinal.
 *   - NÃO converte cenário 'meta' nem cancelados.
 *   - Se o lançamento já está 'realizado', apenas vincula ao extrato (sem update).
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

    let convertido = false;

    // 3) Conversão de status apenas para agendado/programado.
    const status = (lanc.status_transacao || '').toLowerCase();
    if (status === 'agendado' || status === 'programado') {
      const update: Record<string, unknown> = {
        status_transacao: 'realizado',
        updated_at: new Date().toISOString(),
      };
      if (p.dataPagamentoReal) update.data_pagamento = p.dataPagamentoReal;
      if (p.documentoBanco && !lanc.numero_documento) update.numero_documento = p.documentoBanco;

      const { error: e2 } = await supabase
        .from('financeiro_lancamentos_v2')
        .update(update)
        .eq('id', p.lancamentoId);
      if (e2) throw e2;
      convertido = true;
    } else if (status !== 'realizado') {
      throw new Error(`Status inválido para baixa via OFX: ${lanc.status_transacao}`);
    }

    // 4) Vínculo em conciliacao_bancaria_itens (se extratoId fornecido).
    let vinculado = false;
    if (p.extratoId) {
      const valorAplicado = p.valorPagoReal ?? Math.abs(Number(lanc.valor) || 0);
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

    return { convertido, vinculado };
  }

  return { baixarLancamentoViaExtrato };
}
