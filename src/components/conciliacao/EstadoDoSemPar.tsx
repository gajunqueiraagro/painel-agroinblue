/**
 * CONC-SUGESTOES-V2 B (mock aprovado 25/11) — a linha sem par da Conferência DIZ O QUE TEM: "✓ exata" (verde: Casar + Ver), "N possíveis"
 * (âmbar: Sugestões) ou "nenhuma" (cinza: Criar + Procurar, com o motivo curto). O estado vem de `estadoDaLinhaSemPar` (motorAmpliado.ts).
 * ⚠ NUNCA CASA SOZINHA: "Casar" abre o "Casar com o banco" de hoje com a exata levada; o operador confere e concilia.
 * ⚠ LUGAR FIXO: o selo e os botões ficam numa linha só; o texto do meio corta com "…" e o inteiro no `title` (regra de corte em tabela).
 */
import { cn } from '@/lib/utils';
import type { EstadoDaLinhaSemPar } from '@/lib/conciliacao/motorAmpliado';

const BTN = 'h-[15px] shrink-0 rounded-[4px] border border-blue-600 bg-card px-1.5 text-[9.5px] leading-[13px] text-blue-700';
const BTN_CHEIO = 'h-[15px] shrink-0 rounded-[4px] border border-emerald-700 bg-emerald-700 px-1.5 text-[9.5px] font-semibold leading-[13px] text-white';
const SELO = 'inline-flex h-[14px] shrink-0 items-center rounded-full px-[6px] text-[9.5px] font-semibold leading-[12px] whitespace-nowrap';

const ddmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export function EstadoDoSemPar({ estado, onCasar, onSugestoes, onCriar }: {
  estado: EstadoDaLinhaSemPar; onCasar: () => void; onSugestoes: () => void; onCriar: () => void;
}) {
  if (estado.tipo === 'exata') {
    const c = estado.candidato;
    const texto = [c.favorecido, c.numeroDocumento ? `NF ${c.numeroDocumento}` : null, `venc. ${ddmm(c.vencimento)}`].filter(Boolean).join(' · ');
    return (
      <span className="flex min-w-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()} data-testid="estado-sem-par" data-estado="exata">
        <span className={cn(SELO, 'bg-emerald-700 text-white')}>✓ exata</span>
        <span className="min-w-0 truncate text-foreground" title={texto}>{texto}</span>
        <button type="button" className={BTN_CHEIO} onClick={onCasar} data-testid="sem-par-casar-exata" title="Abre o “Casar com o banco” com a exata (valor + CNPJ)">Casar</button>
        <button type="button" className={BTN} onClick={onSugestoes} data-testid="sem-par-sugestoes" data-com-sugestoes="sim">Ver</button>
      </span>
    );
  }
  if (estado.tipo === 'possiveis') {
    return (
      <span className="flex min-w-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()} data-testid="estado-sem-par" data-estado="possiveis">
        <span className={cn(SELO, 'border border-amber-300 bg-amber-50 font-medium text-amber-800')}>{estado.n} possíve{estado.n === 1 ? 'l' : 'is'}</span>
        <button type="button" className={BTN} onClick={onSugestoes} data-testid="sem-par-sugestoes" data-com-sugestoes="sim">Sugestões</button>
        <button type="button" className={BTN} onClick={onCriar} data-testid="sem-par-criar">Criar</button>
      </span>
    );
  }
  const motivo = estado.tipo === 'nenhuma' ? estado.motivo : estado.tipo === 'procurando' ? 'procurando…' : 'não consegui ver as sugestões';
  return (
    <span className="flex min-w-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()} data-testid="estado-sem-par" data-estado={estado.tipo}>
      <span className={cn(SELO, 'bg-muted font-medium text-muted-foreground')}>{estado.tipo === 'nenhuma' ? 'nenhuma' : estado.tipo === 'procurando' ? '…' : '!'}</span>
      <span className="min-w-0 truncate text-muted-foreground" title={motivo}>{motivo}</span>
      <button type="button" className={BTN} onClick={onCriar} data-testid="sem-par-criar">Criar</button>
      <button type="button" className={cn(BTN, 'border-border')} onClick={onSugestoes} data-testid="sem-par-sugestoes" data-com-sugestoes="nao">Procurar</button>
    </span>
  );
}
