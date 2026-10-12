import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES_COLS } from '@/lib/calculos/labels';

/**
 * A FITA ANO + DOZE MESES do Fechamento Área — FECH-GLOBAL-RESUMO-01 (12/10/2026).
 *
 * ⚠ CÓDIGO MOVIDO VERBATIM de `FechamentoTab.tsx` (o bloco do FECH-AREA-ANO-01), para a tela por fazenda e o resumo Global usarem
 *   a MESMA fita: nenhuma classe, cor ou largura mudou. Os nomes das props são os das variáveis de lá, de propósito.
 * ⚠ A FITA NÃO SE MEXE — regra A23: o card de ano tem largura FIXA (56px) e há um espelho da mesma largura do outro lado.
 */
export type StatusDoMesNaFita = 'fechado' | 'rascunho' | 'vazio';

export interface FechamentoFitaMesesProps {
  anoFiltro: string;
  setAnoFiltro: (ano: string) => void;
  anosDisp: string[];
  mesFiltro: number;
  setMesFiltro: (mes: number) => void;
  statusPorMes: Partial<Record<number, StatusDoMesNaFita>>;
}

export function FechamentoFitaMeses({ anoFiltro, setAnoFiltro, anosDisp, mesFiltro, setMesFiltro, statusPorMes }: FechamentoFitaMesesProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Select value={anoFiltro} onValueChange={setAnoFiltro}>
        <SelectTrigger
          className="h-6 w-[56px] shrink-0 justify-center gap-0.5 rounded border border-border bg-muted px-1 text-[10px] font-bold text-muted-foreground [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-100"
          title="Ano do fechamento"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {anosDisp.map(a => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-12 gap-0.5 w-full max-w-[400px] mx-auto">
      {MESES_COLS.map((m, idx) => {
        const mesNum = idx + 1;
        const status = statusPorMes[mesNum] || 'vazio';
        const isSelected = mesFiltro === mesNum;
        let cls = '';
        let dotCls = '';
        if (isSelected) {
          cls = 'bg-[#185FA5] text-white border border-[#185FA5]';
          dotCls = 'bg-white/60';
        } else if (status === 'fechado') {
          cls = 'bg-[#EAF3DE] text-[#3B6D11] border border-[#639922] hover:brightness-95';
          dotCls = 'bg-[#639922]';
        } else if (status === 'rascunho') {
          cls = 'bg-[#FAEEDA] text-[#854F0B] border border-[#BA7517] hover:brightness-95';
          dotCls = 'bg-[#BA7517]';
        } else {
          cls = 'bg-muted text-muted-foreground border border-border hover:bg-muted/80';
          dotCls = 'bg-transparent border border-border';
        }
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => setMesFiltro(mesNum)}
            className={`flex flex-col items-center justify-center py-1 px-0 min-w-[28px] rounded text-[10px] font-bold transition-colors ${cls}`}
          >
            <span>{m.label}</span>
            <span className={`mt-0.5 h-1 w-1 rounded-full ${dotCls}`} />
          </button>
        );
      })}
      </div>
      {/* O espelho do card de ano: existe para a fita não se deslocar. Não é
          decoração — é a metade direita da conta que a mantém centrada. */}
      <div className="h-6 w-[56px] shrink-0" aria-hidden="true" />
    </div>
  );
}
