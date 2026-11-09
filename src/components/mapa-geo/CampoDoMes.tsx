/**
 * PASTO-CONDICAO-01 — o campo de MÊS (granularidade mensal: nunca o calendário de dia, PADROES-UI A5): mês + ano pelos dois `Select` da
 * casa, o mesmo par do seletor de mês do mapa. `permiteAberto` põe "em aberto" no lugar do mês (o "até" vazio); aberto, o ano fica
 * desligado mas no lugar dele (nada se desloca).
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES_COLS } from '@/lib/calculos/labels';
import { anoMesDe } from '@/lib/mapa/condicaoDoPasto';

const ABERTO = 'aberto';

export function CampoDoMes({ valor, onMudar, anos, anoDeReferencia, permiteAberto = false, testid, invalido = false }: {
  /** 'AAAA-MM'; null = em aberto (só com `permiteAberto`) */
  valor: string | null;
  onMudar: (v: string | null) => void;
  anos: readonly number[];
  /** o ano que o "em aberto" mostra (desligado) e que vale ao escolher um mês de novo */
  anoDeReferencia: number;
  permiteAberto?: boolean;
  testid: string;
  invalido?: boolean;
}) {
  const ano = valor ? Number(valor.slice(0, 4)) : null;
  const mes = valor ? Number(valor.slice(5, 7)) : null;
  const anoPadrao = ano ?? anoDeReferencia;
  const borda = invalido ? 'border-[#B03A2E]' : '';
  return (
    <div className="flex flex-none items-center gap-1" data-testid={testid}>
      <Select value={mes == null ? ABERTO : String(mes)} onValueChange={v => onMudar(v === ABERTO ? null : anoMesDe(anoPadrao, Number(v)))}>
        <SelectTrigger className={`h-7 w-[92px] text-[11px] ${borda}`} data-testid={`${testid}-mes`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {permiteAberto && <SelectItem value={ABERTO}>em aberto</SelectItem>}
          {MESES_COLS.map((m, i) => <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={String(anoPadrao)} disabled={mes == null} onValueChange={v => onMudar(anoMesDe(Number(v), mes ?? 1))}>
        <SelectTrigger className={`h-7 w-[70px] text-[11px] ${borda}`} data-testid={`${testid}-ano`}><SelectValue /></SelectTrigger>
        <SelectContent>{anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

/** Os anos do campo: de 5 anos atrás até 3 à frente do mês de referência ('AAAA-MM'). */
export function anosDoCampo(referencia: string): number[] {
  const a = Number(referencia.slice(0, 4));
  return Array.from({ length: 9 }, (_, i) => a - 5 + i);
}
