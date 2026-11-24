/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — a PRÉVIA da fatura do cartão no painel da conta. SÓ LÊ:
 *   PDF → linhas (`extrairLinhasPdf`) → fatura (`lerFaturaOurocard`) → o que já está no sistema na janela da fatura (todas as contas do
 *   cliente: a compra do cartão lançada no outro cartão ou na conta corrente é "mover") → o casamento de 12/11 (`linhasDaFatura`) →
 *   os grupos do mock (`gruposDaFatura`) com a sugestão do histórico de 12 meses do mesmo estabelecimento.
 * ⚠ CONSULTA QUE DECIDE (P146): a leitura que falha vira `erro` com "Tentar de novo" — nunca lista vazia (vazia = tudo "lançar").
 * Fornecedor pelo leitor único (`leitorDeFornecedores`); plano pelo carregador dono (`loadContasDoPlanoDoCliente`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { extrairLinhasPdf, type LinhasDoPdf } from '@/lib/oc/leitura/linhasDoPdf';
import { lerFaturaOurocard, type FaturaLida } from '@/lib/financeiro/cartao/lerFaturaOurocard';
import { linhasDaFatura, palavrasDoEstabelecimento, type LancamentoNoCartao } from '@/lib/financeiro/cartao/linhasDaFatura';
import { gruposDaFatura, type GruposDaFatura } from '@/lib/financeiro/cartao/gruposDaFatura';
import {
  janelaDaFatura, lancamentoDoBanco, sugestaoPeloHistorico, termosDoHistorico, type CasoDoHistorico, type LinhaDoBanco,
} from '@/lib/financeiro/cartao/historicoDaFatura';
import { leitorDeFornecedores } from '@/hooks/useFornecedoresDoCliente';
import { loadContasDoPlanoDoCliente } from '@/lib/financeiro/planoContasBuilder';

export type EstadoDaPrevia =
  | { fase: 'lendo' }
  | { fase: 'nao_li'; motivo: string }
  | { fase: 'erro'; frase: string }
  | { fase: 'pronta'; fatura: FaturaLida; grupos: GruposDaFatura; avisos: string[] };

export const FRASE_NAO_LI = 'Não reconheci esta fatura. Por enquanto o sistema lê a fatura Ourocard do Banco do Brasil.';
export const FRASE_SEM_TEXTO = 'O PDF não tem texto (é uma imagem). Baixe a fatura em PDF pelo aplicativo do banco.';
export const FRASE_FALHOU = 'Não consegui ler os lançamentos do sistema para comparar. Nada foi gravado.';
export const LIMITE_DA_LEITURA = 1000;

const COLUNAS = 'id, conta_bancaria_id, data_vencimento, data_competencia, valor, descricao, favorecido_id, status_transacao, tipo_operacao, plano_conta_id, financiamento_id';

export function usePreviaDaFatura(o: {
  clienteId: string; contaId: string; arquivo: File; nomeDaConta: (id: string) => string;
  /** a leitura do PDF (o teste injeta linhas sintéticas) */
  lerLinhas?: (f: File) => Promise<LinhasDoPdf>;
}): { estado: EstadoDaPrevia; tentarDeNovo: () => void } {
  const { clienteId, contaId, arquivo, nomeDaConta, lerLinhas = extrairLinhasPdf } = o;
  const [estado, setEstado] = useState<EstadoDaPrevia>({ fase: 'lendo' });
  const [vez, setVez] = useState(0);
  const tentarDeNovo = useCallback(() => setVez((v) => v + 1), []);
  /* o nome da conta chega como função nova a cada render do painel: lida na hora, nunca dispara outra leitura */
  const nomeAtual = useRef(nomeDaConta);
  nomeAtual.current = nomeDaConta;

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: 'lendo' });
    void (async () => {
      let pdf: LinhasDoPdf;
      try { pdf = await lerLinhas(arquivo); } catch (e) {
        console.error('[previa da fatura] pdf', e);
        if (vivo) setEstado({ fase: 'nao_li', motivo: FRASE_NAO_LI });
        return;
      }
      if (!vivo) return;
      if (!pdf.temTexto) { setEstado({ fase: 'nao_li', motivo: FRASE_SEM_TEXTO }); return; }
      const fatura = lerFaturaOurocard(pdf.linhas);
      const janela = janelaDaFatura(fatura);
      if (!janela || fatura.linhas.length === 0) { setEstado({ fase: 'nao_li', motivo: FRASE_NAO_LI }); return; }
      try {
        const [lidos, fornecedores, plano] = await Promise.all([
          supabase.from('financeiro_lancamentos_v2').select(COLUNAS).eq('cliente_id', clienteId).eq('cancelado', false)
            .gte('data_vencimento', janela.de).lte('data_vencimento', janela.ate).limit(LIMITE_DA_LEITURA),
          leitorDeFornecedores.ler(clienteId),
          loadContasDoPlanoDoCliente(clienteId),
        ]);
        if (lidos.error) throw lidos.error;
        const nomePorId = new Map(fornecedores.map((f) => [f.id, f.nome]));
        const nomeDoFornecedor = (id: string) => nomePorId.get(id) ?? null;
        const existentes: LancamentoNoCartao[] = [];
        for (const r of lidos.data ?? []) { const e = lancamentoDoBanco(r, nomeDoFornecedor); if (e) existentes.push(e); }

        /* o histórico de 12 meses só do que pode casar (as palavras do estabelecimento; o fornecedor de nome parecido) */
        const termos = termosDoHistorico(fatura.linhas);
        const idsParecidos = fornecedores.filter((f) => palavrasDoEstabelecimento(f.nome).some((p) => termos.includes(p))).slice(0, 100).map((f) => f.id);
        const filtros = [...termos.map((t) => `descricao.ilike.*${t}*`), ...(idsParecidos.length ? [`favorecido_id.in.(${idsParecidos.join(',')})`] : [])];
        let historico: CasoDoHistorico[] = [];
        if (filtros.length) {
          const h = await supabase.from('financeiro_lancamentos_v2').select(COLUNAS).eq('cliente_id', clienteId).eq('cancelado', false)
            .not('plano_conta_id', 'is', null).gte('data_competencia', janela.historicoDe).or(filtros.join(',')).limit(LIMITE_DA_LEITURA);
          if (h.error) throw h.error;
          historico = (h.data ?? []).flatMap((r: LinhaDoBanco) => (r.plano_conta_id
            ? [{ descricao: r.descricao ?? '', fornecedor: r.favorecido_id ? nomeDoFornecedor(r.favorecido_id) : null, planoContaId: r.plano_conta_id }] : []));
        }
        const rotulos = new Map(plano.map((c) => [c.id, c.subcentro || c.centro_custo]));
        const previa = linhasDaFatura(fatura, contaId, existentes);
        const grupos = gruposDaFatura(previa, { contaDaFatura: contaId, nomeDaConta: (id) => nomeAtual.current(id), sugestaoDe: sugestaoPeloHistorico(historico, (id) => rotulos.get(id) ?? null) });
        const avisos: string[] = [];
        if (!fatura.somaConfere) avisos.push('A soma das linhas não fecha com o total da fatura: confira o PDF.');
        if ((lidos.data ?? []).length >= LIMITE_DA_LEITURA) avisos.push(`Mais de ${LIMITE_DA_LEITURA} lançamentos na janela: a comparação pode estar incompleta.`);
        if (vivo) setEstado({ fase: 'pronta', fatura, grupos, avisos });
      } catch (e) {
        console.error('[previa da fatura] leitura', e);
        if (vivo) setEstado({ fase: 'erro', frase: FRASE_FALHOU });
      }
    })();
    return () => { vivo = false; };
  }, [clienteId, contaId, arquivo, lerLinhas, vez]);

  return { estado, tentarDeNovo };
}
