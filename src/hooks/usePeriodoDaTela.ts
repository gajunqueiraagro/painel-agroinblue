/**
 * FECH-MES-SELECIONADO-01 — o ano/mês de uma tela que pode ser CONTROLADO pelo shell.
 * Com `periodo` + `onPeriodoChange` (o V2Index passa o `ano`/`mes` dele), a tela lê e escreve na fonte do shell — uma fonte só,
 * e o mês sobrevive à ida e volta entre seções. Sem eles (hospedeiro legado), o estado é da própria tela, como sempre foi.
 * ⚠ Nada de cópia sincronizada: controlada, a tela não guarda ano nem mês.
 */
import { useState } from 'react';

export interface PeriodoDaTela { ano: string; mes: number }
export interface PeriodoControlado { periodo?: PeriodoDaTela; onPeriodoChange?: (ano: string, mes: number) => void }

export function usePeriodoDaTela(externo: PeriodoControlado, inicial: PeriodoDaTela) {
  const [local, setLocal] = useState<PeriodoDaTela>(inicial);
  const fora = externo.periodo && externo.onPeriodoChange ? { periodo: externo.periodo, mudar: externo.onPeriodoChange } : null;
  const atual = fora ? fora.periodo : local;
  const setAno = (ano: string) => (fora ? fora.mudar(ano, atual.mes) : setLocal(p => ({ ...p, ano })));
  const setMes = (mes: number) => (fora ? fora.mudar(atual.ano, mes) : setLocal(p => ({ ...p, mes })));
  return { ano: atual.ano, mes: atual.mes, setAno, setMes, controlado: fora !== null };
}
