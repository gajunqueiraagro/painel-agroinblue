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
}

export function validarAreaPastosPecuarios(
  pastos: PastoAreaInput[],
  areaPecuariaHa: number,
) {
  // Vedado: ativo, não-agricultura, não-divergencia → INCLUI (área pecuária operacional)
  // Inativo (ativo=false) → EXCLUI
  // Agricultura (tipo_uso contém 'agric') → EXCLUI
  // Divergencia → EXCLUI (pasto sem definição)
  const pastosPecuarios = pastos.filter((p) => {
    if (p.ativo === false) return false;
    const tipo = String(p.tipoUso ?? '').toLowerCase();
    if (tipo.includes('agric')) return false;
    if (tipo === 'divergencia') return false;
    return true;
  });
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
