import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * useExtratoDaConta — o saldo do mês e as importações da conta.
 * FIN-CONCIL-PORTAR-01, rodada 1.
 */

/**
 * O SALDO DO MÊS — decisão do Gabriel (opção B do B-20).
 *
 * ⚠ NÃO É "DECLARADO PELO BANCO", e o rótulo da tela diz isso. O original lê o
 * LEDGERBAL do OFX; medimos que ele não chega ao Proto — `saldo_apos` é NULO nos
 * 3.685 movimentos, `extrato_bancario_staging` está vazia e o parser não lê a
 * tag. O que existe é `financeiro_saldos_bancarios_v2`: 4.695 linhas de saldo
 * GERENCIAL por conta/mês, de 2019-01 a 2026-08.
 *
 * ⚠ A ORIGEM VIAJA JUNTO, e é ela que impede a confusão: medido, `origem_saldo`
 * é nula em 3.932 linhas, `historico_legado` em 487, `manual` em 116,
 * `sem_movimento` em 96, `migracao` em 62 e `extrato` em apenas 2. Mostrar o
 * número sem a procedência faria um saldo digitado à mão passar por extrato de
 * banco.
 */
export function useSaldoGerencialDoMes(
  clienteId: string | null, contaId: string | null, ano: number, mes: number,
) {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  useEffect(() => {
    let cancelado = false;
    if (!clienteId || !contaId) { setSaldo(null); setOrigem(null); return; }
    (async () => {
      const { data } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final, origem_saldo')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .eq('ano_mes', anoMes)
        .maybeSingle();
      if (cancelado) return;
      setSaldo(data?.saldo_final == null ? null : Number(data.saldo_final));
      /* Origem nula é o caso mais comum (3.932 de 4.695) e NÃO vira "manual"
         por conveniência: sem procedência declarada, a pílula não aparece. */
      setOrigem(data?.origem_saldo ?? null);
    })();
    return () => { cancelado = true; };
  }, [clienteId, contaId, anoMes]);

  return { saldo, origem, anoMes };
}

export interface ImportacaoDaConta {
  id: string;
  nomeArquivo: string;
  data: string;
  importados: number;
  comVinculo: number;
}

/**
 * AS IMPORTAÇÕES DESTA CONTA — e o alcance honesto do Desfazer.
 *
 * ⚠ O RASTRO É PARCIAL, e a tela diz isso em vez de fingir. Medido no Proto:
 * `importacao_id` está preenchido em 47 dos 3.685 movimentos (1,3%) — três
 * arquivos, todos de 25/08/2026. Os outros 3.638 nasceram sem o vínculo de
 * importação (bug P0 registrado), e nenhum Desfazer os alcança.
 *
 * ⚠ DESFAZER NÃO APAGA EM SILÊNCIO. Movimento com vínculo ativo não sai: o
 * caminho é avisar e listar. Apagar um movimento conciliado levaria junto a
 * evidência de uma conciliação que continua existindo do outro lado.
 */
export function useImportacoesDaConta(clienteId: string | null, contaId: string | null) {
  const [importacoes, setImportacoes] = useState<ImportacaoDaConta[]>([]);
  const [loading, setLoading] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId || !contaId) { setImportacoes([]); return; }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data: movs } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, importacao_id')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .not('importacao_id', 'is', null);
      const linhas: { id: string; importacao_id: string }[] = movs ?? [];
      if (linhas.length === 0) { setImportacoes([]); return; }

      const ids = Array.from(new Set(linhas.map(l => l.importacao_id)));
      const [{ data: imps }, { data: vinc }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        (supabase as any).from('financeiro_importacoes_v2')
          .select('id, nome_arquivo, created_at').in('id', ids),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        (supabase as any).from('conciliacao_bancaria_itens')
          .select('extrato_id').in('extrato_id', linhas.map(l => l.id)).is('desfeito_em', null),
      ]);
      const comVinculo = new Set((vinc ?? []).map((v: { extrato_id: string }) => v.extrato_id));
      const porImp: Record<string, { n: number; v: number }> = {};
      for (const l of linhas) {
        const acc = porImp[l.importacao_id] ?? { n: 0, v: 0 };
        acc.n += 1;
        if (comVinculo.has(l.id)) acc.v += 1;
        porImp[l.importacao_id] = acc;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas fora de types.ts
      setImportacoes(((imps ?? []) as any[]).map(i => ({
        id: i.id,
        nomeArquivo: i.nome_arquivo ?? '(sem nome)',
        data: (i.created_at ?? '').slice(0, 10),
        importados: porImp[i.id]?.n ?? 0,
        comVinculo: porImp[i.id]?.v ?? 0,
      })).sort((a, b) => b.data.localeCompare(a.data)));
    } finally {
      setLoading(false);
    }
  }, [clienteId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const desfazer = useCallback(async (importacaoId: string) => {
    const alvo = importacoes.find(i => i.id === importacaoId);
    if (!alvo) return;
    /* ⚠ A RECUSA VEM ANTES DA ESCRITA, e nomeia o que impede — a regra da casa:
       antecipar a recusa, não deixar o operador descobrir depois. */
    if (alvo.comVinculo > 0) {
      toast.error(
        `${alvo.nomeArquivo}: ${alvo.comVinculo} movimento${alvo.comVinculo === 1 ? '' : 's'} ` +
        'já conciliado. Desfaça os vínculos antes de desfazer a importação.',
      );
      return;
    }
    setDesfazendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { error } = await (supabase as any)
        .from('extrato_bancario_v2')
        .update({ cancelado_em: new Date().toISOString(), cancelado_motivo: 'importacao_desfeita' })
        .eq('importacao_id', importacaoId)
        .is('cancelado_em', null);
      if (error) { toast.error(error.message); return; }
      toast.success(`Importação desfeita — ${alvo.importados} movimento${alvo.importados === 1 ? '' : 's'}.`);
      await carregar();
    } finally {
      setDesfazendo(false);
    }
  }, [importacoes, carregar]);

  return { importacoes, loading, desfazendo, desfazer, recarregar: carregar };
}
