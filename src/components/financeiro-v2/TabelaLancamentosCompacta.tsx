/**
 * TabelaLancamentosCompacta — tabela padrão (compacta) da Análise Executiva.
 * PR-FIN-V2-ANALISE-DRAWERS-UX-01A.
 *
 * Layout oficial: Data | Descrição | Favorecido | Centro | Doc | Valor.
 * SOMENTE apresentação — nenhuma regra de classificação/cálculo. Densa: corpo text-[10px],
 * cabeçalho text-[8px] uppercase, linhas py-1, valor à direita.
 */
import { formatMoeda } from '@/lib/calculos/formatters';

export interface LancamentoLinha {
  id: string;
  data: string;
  produto: string | null;
  fornecedor: string;
  centro: string | null;
  doc: string;
  mov: number;
}
const diaBR = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const COLS = ['Data', 'Descrição', 'Favorecido', 'Centro', 'Doc', 'Valor'];

export function TabelaLancamentosCompacta({ itens }: { itens: LancamentoLinha[] }) {
  return (
    <table className="w-full border-collapse text-[10px]">
      <thead className="sticky top-0 bg-muted/60">
        <tr>
          {COLS.map((h, i) => (
            <th key={h} className={`px-1.5 py-1 font-semibold uppercase text-[8px] ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {itens.map((it) => (
          <tr key={it.id} className="border-t">
            <td className="px-1.5 py-1 whitespace-nowrap tabular-nums">{diaBR(it.data)}</td>
            <td className="px-1.5 py-1 max-w-[140px] truncate" title={it.produto || '—'}>{it.produto || '—'}</td>
            <td className="px-1.5 py-1 max-w-[120px] truncate" title={it.fornecedor || '—'}>{it.fornecedor || '—'}</td>
            <td className="px-1.5 py-1 max-w-[100px] truncate text-muted-foreground" title={it.centro || '—'}>{it.centro || '—'}</td>
            <td className="px-1.5 py-1 max-w-[80px] truncate text-muted-foreground" title={it.doc || '—'}>{it.doc || '—'}</td>
            <td className="px-1.5 py-1 text-right tabular-nums whitespace-nowrap">{formatMoeda(Math.abs(it.mov))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
