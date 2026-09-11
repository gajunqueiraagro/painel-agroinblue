/**
 * TabelaLancamentosCompacta — tabela padrão (compacta) da Análise Executiva.
 * PR-FIN-V2-ANALISE-DRAWERS-UX-01A.
 *
 * Layout oficial: Data | Descrição | Favorecido | Centro | Doc | Valor.
 * SOMENTE apresentação — nenhuma regra de classificação/cálculo. Densa: corpo text-[10px],
 * cabeçalho text-[8px] uppercase, linhas py-1, valor à direita.
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { CampoOrdemLanc, Direcao } from '@/lib/analise/drillEconomico';

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
/* Alinhamento e campo de ordenação por coluna. O `campo` é o que liga o cabeçalho à régua de
   `drillEconomico`: sem ele o cabeçalho seria decorativo, com ele o clique tem para onde ir. */
const COLS: { h: string; align: string; campo: CampoOrdemLanc; centro?: true }[] = [
  { h: 'Data', align: 'text-left', campo: 'data' },
  { h: 'Descrição', align: 'text-left', campo: 'produto' },
  { h: 'Favorecido', align: 'text-left', campo: 'fornecedor' },
  { h: 'Centro', align: 'text-left', campo: 'produto', centro: true },
  { h: 'Doc', align: 'text-center', campo: 'doc' },
  { h: 'Valor', align: 'text-right', campo: 'mov' },
];
const SEP = 'border-r border-slate-100';

/**
 * ⚠ `onAbrir` É OPCIONAL POR NECESSIDADE, NÃO POR CONVENIÊNCIA — e a distinção importa, porque
 * "prop opcional que ninguém passa" já foi defeito duas vezes neste repo. Aqui o Extrato
 * Gerencial DELIBERADAMENTE não a passa: ele tem o seu próprio diálogo de leitura, e a linha
 * do drawer lá não abre nada. Quem passa é o Painel por período, onde o drill-down existe
 * para corrigir. Sem callback, a linha continua exatamente como era — sem cursor, sem hover
 * de clique, sem `onClick`.
 */
export function TabelaLancamentosCompacta({
  itens, onAbrir, mostrarCentro = true, ordem, onOrdenar,
}: {
  itens: LancamentoLinha[];
  onAbrir?: (id: string) => void;
  /**
   * ⚠ A COLUNA "CENTRO" SAI ONDE ELA JÁ É O CONTEXTO. Nos Maiores compromissos o drawer É um
   * centro, e repeti-lo em toda linha gasta 100px para dizer o que o título já disse; no
   * nível folha do drill-down, idem. Onde o recorte não fixa o centro, ele volta.
   */
  mostrarCentro?: boolean;
  /** Ordenação CONTROLADA: quem monta é dono, para que abrir um lançamento e voltar não a perca. */
  ordem?: { campo: CampoOrdemLanc; direcao: Direcao };
  onOrdenar?: (campo: CampoOrdemLanc) => void;
}) {
  const cols = mostrarCentro ? COLS : COLS.filter((c) => !c.centro);
  const ordenavel = !!onOrdenar && !!ordem;
  return (
    <table className="w-full border-collapse text-[10px]">
      <thead className="sticky top-0 bg-[#1e3a5f]/[0.06]">
        <tr>
          {cols.map((c, i) => {
            const ativo = ordenavel && ordem.campo === c.campo;
            return (
              <th key={c.h}
                className={`px-1.5 py-1 font-semibold uppercase text-[8px] text-[#1e3a5f] ${c.align}`
                  + `${i < cols.length - 1 ? ` ${SEP}` : ''}${ordenavel ? ' cursor-pointer select-none' : ''}`}
                title={ordenavel ? `Ordenar por ${c.h}` : undefined}
                onClick={ordenavel ? () => onOrdenar(c.campo) : undefined}>
                <span className={`inline-flex items-center gap-0.5 ${c.align === 'text-right' ? 'flex-row-reverse' : ''}`}>
                  {c.h}
                  {/* A seta só aparece na coluna ativa — seis setas cinzas competem com o dado. */}
                  {ativo && (ordem.direcao === 'asc'
                    ? <ArrowUp className="h-2.5 w-2.5" />
                    : <ArrowDown className="h-2.5 w-2.5" />)}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {itens.map((it) => (
          <tr key={it.id}
            className={`border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03] hover:bg-[#1e3a5f]/[0.06]${onAbrir ? ' cursor-pointer' : ''}`}
            title={onAbrir ? 'Abrir o lançamento para corrigir' : undefined}
            onClick={onAbrir ? () => onAbrir(it.id) : undefined}>
            <td className={`px-1.5 py-1 whitespace-nowrap tabular-nums ${SEP}`}>{diaBR(it.data)}</td>
            <td className={`px-1.5 py-1 max-w-[140px] truncate ${SEP}`} title={it.produto || '—'}>{it.produto || '—'}</td>
            <td className={`px-1.5 py-1 max-w-[120px] truncate ${SEP}`} title={it.fornecedor || '—'}>{it.fornecedor || '—'}</td>
            {mostrarCentro && (
              <td className={`px-1.5 py-1 max-w-[100px] truncate text-muted-foreground ${SEP}`} title={it.centro || '—'}>{it.centro || '—'}</td>
            )}
            <td className={`px-1.5 py-1 max-w-[80px] truncate text-center text-muted-foreground ${SEP}`} title={it.doc || '—'}>{it.doc || '—'}</td>
            <td className="px-1.5 py-1 text-right tabular-nums whitespace-nowrap">{formatMoeda(Math.abs(it.mov))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
