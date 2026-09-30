/**
 * AS IMPORTAÇÕES DESTA CONTA, E O DESFAZER DE ARQUIVO — PR-IMPORT-DESFAZER-01.
 *
 * ⚠ FECHA UMA PROMESSA QUE A TELA JÁ FAZIA. Os rodapés do minimodal de origem mandam o
 * operador para "Conciliação › Desfazer por arquivo" desde o PR-CONC-B-2, e o caminho não
 * existia: a RPC estava versionada (20260909112741) e ninguém a chamava.
 *
 * ⚠ SÓ APARECE O QUE TEM VÍNCULO COM ARQUIVO. `extrato_bancario_v2.importacao_id` só passou
 * a ser preenchido em 25/08/2026: das 75 importações do proto, 22 têm extratos ligados, e
 * 3.638 extratos não têm arquivo nenhum. Listar uma importação sem extratos ofereceria um
 * "desfazer" que não desfaz nada.
 *
 * ⚠ O RELATÓRIO É DA RPC, NUNCA DA TELA. `p_simular = true` devolve as contagens; a tela só
 * as escreve em português. Recalcular aqui daria dois números para a mesma pergunta — e o
 * que confirma o gesto irreversível seria o do front, não o do banco.
 *
 * ⚠ ESTE COMPONENTE NÃO É MONTADO POR NINGUÉM desde o PR-IMPORTAR-CORPO-01. O modal que ele
 * abria saiu para `DesfazerArquivoModal.tsx` no PR-CONC-DESFAZER-ARQUIVO-01 e é o "Ver
 * importações" (`ImportacoesDialog`) quem o abre agora. Apagar este arquivo é frente própria.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { DesfazerArquivoModal } from '@/components/conciliacao/DesfazerArquivoModal';

const brData = (iso: string | null | undefined) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const ddmm = (iso: string | null | undefined) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const num = (v: number) => v.toLocaleString('pt-BR');

interface ImportacaoLinha {
  id: string;
  nome_arquivo: string | null;
  data_importacao: string | null;
  cancelado_em: string | null;
  extratos: number;
  crus: number;
  substituidos: number;
  manuais: number;
  semPar: number;
}

export function ImportacoesDaConta({ clienteId, contaId, onDesfeito }: {
  clienteId: string | null;
  contaId: string | null;
  onDesfeito?: () => void;
}) {
  const [alvo, setAlvo] = useState<ImportacaoLinha | null>(null);

  const { data: linhas = [], refetch } = useQuery({
    queryKey: ['importacoes-da-conta', clienteId, contaId],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<ImportacaoLinha[]> => {
      /* ⚠ UMA CONSULTA POR CONTA, e o agrupamento acontece aqui: são 499 extratos com
         arquivo no proto inteiro e no máximo 4 importações por conta — trazer as linhas e
         contar em memória custa menos que uma view nova. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data: exts, error } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, importacao_id, cancelado_em')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .not('importacao_id', 'is', null);
      if (error) throw error;
      const rows = (exts ?? []) as { id: string; importacao_id: string; cancelado_em: string | null }[];
      const ids = [...new Set(rows.map((r) => r.importacao_id))];
      if (ids.length === 0) return [];

      /* eslint-disable @typescript-eslint/no-explicit-any -- idioma documentado do repo */
      const [rImp, rVinc] = await Promise.all([
        (supabase as any).from('financeiro_importacoes_v2')
          .select('id, nome_arquivo, data_importacao, cancelado_em').in('id', ids),
        (supabase as any).from('conciliacao_bancaria_itens')
          .select('extrato_id, tipo_aprovacao').is('desfeito_em', null)
          .in('extrato_id', rows.map((r) => r.id)),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const vincPorExtrato = new Map<string, string[]>();
      for (const v of ((rVinc.data ?? []) as { extrato_id: string; tipo_aprovacao: string | null }[])) {
        const l = vincPorExtrato.get(v.extrato_id);
        if (l) l.push(v.tipo_aprovacao ?? ''); else vincPorExtrato.set(v.extrato_id, [v.tipo_aprovacao ?? '']);
      }

      const porImp = new Map<string, ImportacaoLinha>();
      for (const imp of ((rImp.data ?? []) as { id: string; nome_arquivo: string | null; data_importacao: string | null; cancelado_em: string | null }[])) {
        porImp.set(imp.id, {
          id: imp.id, nome_arquivo: imp.nome_arquivo, data_importacao: imp.data_importacao,
          cancelado_em: imp.cancelado_em, extratos: 0, crus: 0, substituidos: 0, manuais: 0, semPar: 0,
        });
      }
      for (const r of rows) {
        const linha = porImp.get(r.importacao_id);
        if (!linha) continue;
        linha.extratos += 1;
        const tipos = vincPorExtrato.get(r.id) ?? [];
        if (tipos.length === 0) { linha.semPar += 1; continue; }
        for (const t of tipos) {
          if (t === 'ofx_cru') linha.crus += 1;
          else if (t === 'ofx_substituiu') linha.substituidos += 1;
          else linha.manuais += 1;
        }
      }
      return [...porImp.values()].sort((a, b) =>
        (b.data_importacao ?? '') < (a.data_importacao ?? '') ? -1 : 1);
    },
  });

  if (!contaId) return null;
  if (linhas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 px-3 py-3 text-center text-[10px] text-muted-foreground">
        Nenhuma importação desta conta tem vínculo com arquivo.
        {' '}Os extratos anteriores a 25/08/2026 foram gravados sem essa marca e não podem ser desfeitos por arquivo.
      </div>
    );
  }

  const CEL = 'px-1.5 py-[3px] whitespace-nowrap';

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b bg-muted/40 px-3 py-1 text-[11px] font-medium">Importações desta conta</div>
      {/* A régua vive no `<table>`: célula sem tamanho herda dela, não do documento. */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-muted text-[10px] text-muted-foreground">
            <th className={cn(CEL, 'text-left font-normal')}>Importado em</th>
            <th className={cn(CEL, 'text-left font-normal')}>Arquivo</th>
            <th className={cn(CEL, 'text-right font-normal')}>Linhas</th>
            <th className={cn(CEL, 'text-right font-normal')}>Crus</th>
            <th className={cn(CEL, 'text-right font-normal')}>Substituídos</th>
            <th className={cn(CEL, 'text-right font-normal')}>Manuais</th>
            <th className={cn(CEL, 'text-right font-normal')}>Sem par</th>
            <th className={cn(CEL, 'text-right font-normal')} />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const desfeita = !!l.cancelado_em;
            return (
              <tr key={l.id} className={cn('h-[21px] border-b last:border-b-0', desfeita && 'text-muted-foreground')}>
                <td className={cn(CEL, 'text-[10px] text-muted-foreground')}>{brData(l.data_importacao?.slice(0, 10))}</td>
                <td className={cn(CEL, 'max-w-[220px] truncate')} title={l.nome_arquivo ?? ''}>{l.nome_arquivo ?? '—'}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.extratos)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.crus)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.substituidos)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.manuais)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.semPar)}</td>
                <td className={cn(CEL, 'text-right')}>
                  {desfeita
                    ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">desfeita {ddmm(l.cancelado_em?.slice(0, 10))}</span>
                    : <button type="button" onClick={() => setAlvo(l)}
                        className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-destructive">
                        desfazer
                      </button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <DesfazerArquivoModal
        alvo={alvo}
        onClose={() => setAlvo(null)}
        onDesfeito={() => { void refetch(); onDesfeito?.(); }}
      />
    </div>
  );
}
