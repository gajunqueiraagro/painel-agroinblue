/**
 * A CLASSIFICACAO DIVIDIDA NA ABA GERAL — FIN-CLASSIF-DIVIDIDA-01b (mock, vista 2). No lugar do seletor de conta, a tabela das partes:
 * conta (subcentro) · centro · valor · % e o total ("= valor do lancamento"). As acoes ("Dividir…", "Voltar para 1 conta", "Desfazer")
 * moram no titulo do bloco (quem monta e' o modal). Altura pelo numero de partes; com muitas, a fonte desce (nunca rola).
 */
import type { ParteGravada } from '@/lib/financeiro/divisaoDaClassificacao';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CORES_DAS_CONTAS } from './ContasDosItens';
import { cn } from '@/lib/utils';

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const ORIGEM: Record<ParteGravada['origem'], string> = { nota: 'itens da nota', manual: 'à mão', pai: 'do cadastro' };

export function PartesDaClassificacao({ partes, total }: { partes: readonly ParteGravada[]; total: number }) {
  const miuda = partes.length > 4;
  const td = cn('px-1 py-0 leading-none', miuda ? 'h-[14px] text-[8.5px]' : 'h-[17px] text-[10px]');
  const soma = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  return (
    <div className="overflow-hidden rounded-md border" data-testid="partes-da-classificacao">
      <div className="flex h-[10px] overflow-hidden bg-muted" data-testid="partes-barra">
        {partes.map((p, k) => <span key={p.ordem} className="h-full" style={{ width: `${p.percentual}%`, background: CORES_DAS_CONTAS[k % CORES_DAS_CONTAS.length] }} />)}
      </div>
      <table className="w-full table-fixed border-collapse">
        <colgroup><col style={{ width: 14 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 92 }} /><col style={{ width: 48 }} /><col style={{ width: 84 }} /></colgroup>
        <thead className="bg-primary"><tr>
          {['', 'Conta (subcentro)', 'Centro', 'Valor', '%', 'Origem'].map((h, k) => (
            <th key={k} className={cn('h-[16px] px-1 text-[9px] font-medium text-primary-foreground', k === 3 || k === 4 ? 'text-right' : 'text-left')}>{h}</th>))}
        </tr></thead>
        <tbody>
          {partes.map((p, k) => (
            <tr key={p.ordem} className="border-t" data-testid="parte-linha">
              <td className={td}><i className="block h-2 w-2 rounded-full" style={{ background: CORES_DAS_CONTAS[k % CORES_DAS_CONTAS.length] }} /></td>
              <td className={cn(td, 'truncate font-semibold')} title={p.subcentro ?? ''}>{p.subcentro ?? '—'}</td>
              <td className={cn(td, 'truncate text-muted-foreground')} title={p.centro_custo ?? ''}>{p.centro_custo ?? '—'}</td>
              <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>{formatMoeda(p.valor)}</td>
              <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>{pct(p.percentual)}</td>
              <td className={cn(td, 'truncate text-muted-foreground')} title={p.origem === 'nota' ? `${p.itens} itens da nota` : ORIGEM[p.origem]}>
                {p.origem === 'nota' ? `${p.itens} ${p.itens === 1 ? 'item' : 'itens'} da nota` : ORIGEM[p.origem]}
              </td>
            </tr>
          ))}
          <tr className="border-t bg-muted/40" data-testid="partes-total">
            <td className={td} /><td className={cn(td, 'font-semibold')}>Total</td><td className={td} />
            <td className={cn(td, 'whitespace-nowrap text-right font-semibold tabular-nums')}>{formatMoeda(soma)}</td>
            <td className={cn(td, 'text-right tabular-nums')}>100%</td>
            <td className={cn(td, 'truncate', Math.abs(soma - total) < 0.005 ? 'text-emerald-700' : 'text-amber-800')}>{Math.abs(soma - total) < 0.005 ? '✓ = lançamento' : 'difere'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
