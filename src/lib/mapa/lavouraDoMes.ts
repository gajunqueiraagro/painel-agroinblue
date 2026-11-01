/**
 * MAPA-ATIVIDADE-LAVOURA-01 — a LAVOURA do pasto no mês do mapa (só leitura; `agri_safra_area` + `financeiro_safras`). Puro.
 * D4 (Gabriel 01/11): com mais de um registro de safra no pasto, vale a safra cujo período CONTÉM o mês do mapa; nenhuma contém = sem
 * lavoura cadastrada (o painel diz "Lavoura", sem cultura). Duas safras contendo o mês (não deveria): a que começa por último.
 * Vários registros da MESMA safra no pasto (ex.: duas variedades) se juntam: as culturas e variedades sem repetir, a área plantada somada,
 * o plantio mais cedo e a colheita prevista mais tarde.
 */
export interface RegistroDeLavoura {
  pasto_id: string;
  cultura: string | null;
  variedade: string | null;
  area_plantada_ha: number | null;
  data_plantio: string | null;
  data_colheita_prevista: string | null;
  data_colheita_real: string | null;
  status: string | null;
  safra_id: string;
  safra_nome: string | null;
  safra_inicio: string | null;
  safra_fim: string | null;
}

export interface LavouraDoMes {
  safra: string;
  culturas: string[];
  variedades: string[];
  areaPlantadaHa: number | null;
  plantio: string | null;
  colheitaPrevista: string | null;
  colheitaReal: string | null;
  status: string | null;
  registros: number;
}

function ultimoDiaDoMes(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${anoMes}-${String(d).padStart(2, '0')}`;
}

/** A safra contém o mês: começa até o último dia do mês e termina no primeiro dia ou depois (data vazia = sem limite daquele lado). */
function contemOMes(r: RegistroDeLavoura, anoMes: string): boolean {
  const ini = `${anoMes}-01`; const fim = ultimoDiaDoMes(anoMes);
  return (!r.safra_inicio || r.safra_inicio <= fim) && (!r.safra_fim || r.safra_fim >= ini) && !!(r.safra_inicio || r.safra_fim);
}

/** A 1ª letra maiúscula ("amendoim" → "Amendoim"). */
export function nomeDaCultura(c: string): string {
  const t = c.trim().replace(/_/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export function lavouraDoPastoNoMes(registros: readonly RegistroDeLavoura[], pastoId: string, anoMes: string): LavouraDoMes | null {
  const doMes = registros.filter(r => r.pasto_id === pastoId && contemOMes(r, anoMes));
  if (doMes.length === 0) return null;
  const safraId = doMes.reduce((m, r) => ((r.safra_inicio ?? '') > (m.safra_inicio ?? '') ? r : m)).safra_id;
  const daSafra = doMes.filter(r => r.safra_id === safraId);
  const unicos = (l: (string | null)[]) => [...new Set(l.filter((x): x is string => !!x && !!x.trim()).map(nomeDaCultura))];
  const areas = daSafra.map(r => r.area_plantada_ha).filter((x): x is number => x != null);
  const datas = (l: (string | null)[]) => l.filter((x): x is string => !!x).sort();
  const plantios = datas(daSafra.map(r => r.data_plantio));
  const previstas = datas(daSafra.map(r => r.data_colheita_prevista));
  const reais = datas(daSafra.map(r => r.data_colheita_real));
  const status = unicos(daSafra.map(r => r.status));
  return {
    safra: daSafra[0].safra_nome ?? 'Safra sem nome',
    culturas: unicos(daSafra.map(r => r.cultura)),
    variedades: unicos(daSafra.map(r => r.variedade)),
    areaPlantadaHa: areas.length ? areas.reduce((s, a) => s + a, 0) : null,
    plantio: plantios[0] ?? null,
    colheitaPrevista: previstas[previstas.length - 1] ?? null,
    /* a colheita real só quando TODOS os registros da safra já colheram */
    colheitaReal: reais.length === daSafra.length ? reais[reais.length - 1] : null,
    status: status.length ? status.join(' / ') : null,
    registros: daSafra.length,
  };
}

/** O rótulo do pasto de lavoura no mapa: "Lavoura · Amendoim" (sem cultura cadastrada no mês, só "Lavoura"). */
export function rotuloDaLavoura(l: LavouraDoMes | null): string {
  return l && l.culturas.length ? `Lavoura · ${l.culturas.join(' + ')}` : 'Lavoura';
}

