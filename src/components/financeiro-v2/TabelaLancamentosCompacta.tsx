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
// Alinhamento por coluna (Data/Descrição/Favorecido/Centro à esquerda; Doc centralizado; Valor à direita).
const COLS: { h: string; align: string }[] = [
  { h: 'Data', align: 'text-left' },
  { h: 'Descrição', align: 'text-left' },
  { h: 'Favorecido', align: 'text-left' },
  { h: 'Centro', align: 'text-left' },
  { h: 'Doc', align: 'text-center' },
  { h: 'Valor', align: 'text-right' },
];
const SEP = 'border-r border-slate-100';

export function TabelaLancamentosCompacta({ itens }: { itens: LancamentoLinha[] }) {
  return (
    <table className="w-full border-collapse text-[10px]">
      <thead className="sticky top-0 bg-[#1e3a5f]/[0.06]">
        <tr>
          {COLS.map((c, i) => (
            <th key={c.h} className={`px-1.5 py-1 font-semibold uppercase text-[8px] text-[#1e3a5f] ${c.align} ${i < COLS.length - 1 ? SEP : ''}`}>{c.h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {itens.map((it) => (
          <tr key={it.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03] hover:bg-[#1e3a5f]/[0.06]">
            <td className={`px-1.5 py-1 whitespace-nowrap tabular-nums ${SEP}`}>{diaBR(it.data)}</td>
            <td className={`px-1.5 py-1 max-w-[140px] truncate ${SEP}`} title={it.produto || '—'}>{it.produto || '—'}</td>
            <td className={`px-1.5 py-1 max-w-[120px] truncate ${SEP}`} title={it.fornecedor || '—'}>{it.fornecedor || '—'}</td>
            <td className={`px-1.5 py-1 max-w-[100px] truncate text-muted-foreground ${SEP}`} title={it.centro || '—'}>{it.centro || '—'}</td>
            <td className={`px-1.5 py-1 max-w-[80px] truncate text-center text-muted-foreground ${SEP}`} title={it.doc || '—'}>{it.doc || '—'}</td>
            <td className="px-1.5 py-1 text-right tabular-nums whitespace-nowrap">{formatMoeda(Math.abs(it.mov))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
