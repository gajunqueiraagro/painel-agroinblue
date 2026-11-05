/**
 * MAPA-IMPRESSAO-01 — o quadro "Resumo de áreas" da folha. UMA fonte (sem segunda): a repartição SOBERANA dos pastos por família
 * (`agruparPastosPorFamilia`, a da aba Área) com a vigência do MÊS e a área DO MÊS (`areaNoMesOuHoje` + `areaDe`, PASTO-AREA-OFICIAL-02a). Pai e
 * piquetes se revezam pela vigência — nunca contam os dois no mesmo mês (o erro do mock de 02/11 foi somar sem o mês).
 * D4 (Gabriel 03/11): reserva/APP sem pasto cadastrado = "—" no quadro; a medida do DESENHO aparece à parte, como informativa.
 */
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
import { areaNoMesOuHoje, type AreaDoPastoNoMes } from '@/lib/pastos/areaDoPastoNoMes';
import type { Pasto } from '@/hooks/usePastos';

export interface LinhaDoResumo { chave: string; rotulo: string; ha: number | null; pastos: number }

export interface ResumoDeAreas {
  linhas: LinhaDoResumo[];
  soma: number;
  matricula: number | null;
  /** soma − matrícula; null sem matrícula */
  diferenca: number | null;
  /** |diferença| < 0,01 ha */
  confere: boolean;
  /** medidas do DESENHO (informativas, D4): reserva e APP desenhadas, em ha */
  desenho: { reserva: number; app: number };
}

const TOL = 0.01;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * `pastos` = os pastos ATIVOS da fazenda (do `usePastos`); `areaDe` = a área do mês (`useAreaDosPastosNoMes`); `desenho` = as somas da
 * medida dos polígonos `reserva_legal`/`app` (`areaDoBancoHa`).
 */
export function resumoDeAreas(e: {
  pastos: readonly Pasto[];
  anoMes: string;
  areaDe: AreaDoPastoNoMes;
  matricula: number | null;
  desenho: { reserva: number; app: number };
}): ResumoDeAreas {
  /* a repartição decide QUEM conta no mês (família + vigência); a área de cada um é a DO MÊS, na soma (uma vez só) */
  const { familias, divergencia, legado } = agruparPastosPorFamilia(e.pastos.filter((p) => p.ativo), e.anoMes);
  const familia = (g: string) => familias.find((f) => f.grupo === g);
  const tipo = (g: string, t: string) => familia(g)?.tipos.find((x) => x.tipo === t);
  const somaDe = (lista: readonly { pastos: readonly Pasto[] }[]) =>
    lista.reduce((s, l) => s + l.pastos.reduce((a, p) => a + areaNoMesOuHoje(p, e.anoMes, e.areaDe), 0), 0);
  const linha = (chave: string, rotulo: string, grupos: { pastos: readonly Pasto[] }[], sempre: boolean): LinhaDoResumo | null => {
    const n = grupos.reduce((s, g) => s + g.pastos.length, 0);
    if (n === 0 && !sempre) return null;
    const ha = n === 0 ? null : r2(somaDe(grupos));
    /* linha opcional que soma zero (o "Divergência do Campeiro", área 0) não entra: só faria ruído no quadro; a soma não muda */
    if (!sempre && ha === 0) return null;
    return { chave, rotulo, ha, pastos: n };
  };
  const pec = familia('pecuaria');
  const agri = familia('agricultura');
  const silvi = familia('silvicultura');
  const infra = familia('infraestrutura');
  const reserva = tipo('ambiental', 'reserva');
  const app = tipo('ambiental', 'app');
  const linhas = [
    linha('pastagem', 'Pastagem', pec ? pec.tipos : [], true),
    linha('lavoura', 'Lavoura', agri ? agri.tipos : [], false),
    linha('silvicultura', 'Silvicultura', silvi ? silvi.tipos : [], false),
    linha('reserva', 'Reserva legal', reserva ? [reserva] : [], true),
    linha('app', 'APP', app ? [app] : [], true),
    linha('estruturas', 'Estruturas e benfeitorias', infra ? infra.tipos : [], true),
    linha('sem_uso', 'Sem uso definido', [{ pastos: [...divergencia, ...legado] }], false),
  ].filter((l): l is LinhaDoResumo => l !== null);
  const soma = r2(linhas.reduce((s, l) => s + (l.ha ?? 0), 0));
  const diferenca = e.matricula == null ? null : r2(soma - e.matricula);
  return {
    linhas, soma, matricula: e.matricula, diferenca,
    confere: diferenca != null && Math.abs(diferenca) < TOL,
    desenho: { reserva: r2(e.desenho.reserva), app: r2(e.desenho.app) },
  };
}
