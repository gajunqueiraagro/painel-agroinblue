import { isOperacionalPecuaria } from '@/lib/pastos/tiposUso';
import { isPastoAtivoNoMes } from '@/hooks/usePastos';

export interface AreaFazendaInput {
  areaTotalHa: number;
  areaPecuariaHa: number;
  areaAgriculturaHa: number;
  areaAppHa: number;
  areaReservaHa: number;
  areaBenfeitoriasHa: number;
  areaOutrasHa: number;
}

export function validarComposicaoAreaFazenda(input: AreaFazendaInput) {
  const soma =
    input.areaPecuariaHa +
    input.areaAgriculturaHa +
    input.areaAppHa +
    input.areaReservaHa +
    input.areaBenfeitoriasHa +
    input.areaOutrasHa;
  const diferenca = soma - input.areaTotalHa;
  return {
    ok: Math.abs(diferenca) < 0.01,
    soma,
    diferenca,
  };
}

export interface PastoAreaInput {
  areaHa: number;
  tipoUso?: string | null;
  situacao?: string | null;
  ativo?: boolean | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

/**
 * Compara a soma dos pastos PECUÁRIOS contra a área pecuária declarada no cadastro.
 *
 * PR-AREA-VALIDACAO-01 — a classificação passou de EXCLUSÃO para INCLUSÃO.
 * A regra anterior era `if (tipo.includes('agric')) return false` mais uma
 * exceção para 'divergencia', e tudo o que sobrasse virava pecuária: reserva,
 * APP, benfeitorias e eucalipto entravam na conta. Na Sta. Luzia isso somava
 * 822,93 ha de eucalipto como pecuária e produzia um alerta de diferença numa
 * fazenda sem um único pasto pecuário desde julho/2023 — o alerta era artefato
 * da heurística, não divergência real.
 *
 * Agora a fonte é `isOperacionalPecuaria` (tiposUso.ts), que devolve exatamente
 * cria, recria, engorda, vedado e reforma_pecuaria. Família nova na taxonomia
 * entra aqui sozinha, sem string a ajustar.
 *
 * `anoMes` é opcional porque o V2Fazendas não tem seletor de mês. Sem ele a
 * vigência não é aplicada — pasto encerrado ainda conta —, mas o filtro de
 * tipo_uso vale sempre. Passar o mês quando a tela tiver um.
 */
export function validarAreaPastosPecuarios(
  pastos: PastoAreaInput[],
  areaPecuariaHa: number,
  anoMes?: string,
) {
  const pastosPecuarios = pastos.filter(p =>
    p.ativo !== false &&
    isOperacionalPecuaria(p.tipoUso) &&
    (anoMes ? isPastoAtivoNoMes({ data_inicio: p.dataInicio, data_fim: p.dataFim }, anoMes) : true),
  );
  const somaPastos = pastosPecuarios.reduce(
    (s, p) => s + Number(p.areaHa || 0),
    0,
  );
  const diferenca = somaPastos - areaPecuariaHa;
  return {
    ok: Math.abs(diferenca) < 0.01,
    somaPastos,
    diferenca,
    quantidadePastos: pastosPecuarios.length,
  };
}
