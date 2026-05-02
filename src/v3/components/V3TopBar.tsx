import type { V3PeriodoTipo } from '../lib/v3PeriodoConfig';

const ANOS = Array.from({ length: 10 }, (_, i) => 2019 + i);
const MESES = [
  { v: 0,  l: 'Todos' },
  { v: 1,  l: 'Jan' }, { v: 2,  l: 'Fev' }, { v: 3,  l: 'Mar' },
  { v: 4,  l: 'Abr' }, { v: 5,  l: 'Mai' }, { v: 6,  l: 'Jun' },
  { v: 7,  l: 'Jul' }, { v: 8,  l: 'Ago' }, { v: 9,  l: 'Set' },
  { v: 10, l: 'Out' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dez' },
];

interface V3TopBarProps {
  periodoTipo: V3PeriodoTipo;
  ano: string;
  mes: string;
  onAnoChange: (v: string) => void;
  onMesChange: (v: string) => void;
}

export function V3TopBar({ periodoTipo, ano, mes, onAnoChange, onMesChange }: V3TopBarProps) {
  const showAno = periodoTipo === 'ano' || periodoTipo === 'ano-mes';
  const showMes = periodoTipo === 'ano-mes';

  return (
    <div className="shrink-0 h-11 border-b border-border bg-background flex items-center gap-2 px-4">
      {showAno && (
        <select
          value={ano}
          onChange={e => onAnoChange(e.target.value)}
          className="h-7 rounded border border-border bg-background px-2 text-sm"
        >
          {ANOS.map(a => (
            <option key={a} value={String(a)}>{a}</option>
          ))}
        </select>
      )}
      {showMes && (
        <select
          value={mes}
          onChange={e => onMesChange(e.target.value)}
          className="h-7 rounded border border-border bg-background px-2 text-sm"
        >
          {MESES.map(m => (
            <option key={m.v} value={String(m.v)}>{m.l}</option>
          ))}
        </select>
      )}
      {periodoTipo === 'nenhum' && (
        <span className="text-sm text-muted-foreground">Agroinblue V3</span>
      )}
    </div>
  );
}
