export interface AbateParcela {
  data: string;
  valor: number;
}

export interface AbateCalculationInput {
  quantidade: number;
  pesoKg: number;
  pesoCarcacaKg?: string | number | null;
  rendCarcaca?: string | number | null;
  precoArroba?: string | number | null;
  bonusPrecoce?: string | number | null;
  bonusPrecoceReais?: string | number | null;
  bonusQualidade?: string | number | null;
  bonusQualidadeReais?: string | number | null;
  bonusListaTrace?: string | number | null;
  bonusListaTraceReais?: string | number | null;
  descontoQualidade?: string | number | null;
  descontoQualidadeReais?: string | number | null;
  funruralPct?: string | number | null;
  funruralReais?: string | number | null;
  outrosDescontos?: string | number | null;
  outrosDescontosArroba?: string | number | null;
  formaReceb?: 'avista' | 'prazo';
  qtdParcelas?: string | number | null;
  parcelas?: AbateParcela[];
  valorBaseOverride?: number;
}

export interface AbateCalculation {
  quantidade: number;
  pesoKg: number;
  carcacaCalc: number;
  rendCalc: number;
  pesoArrobaCab: number;
  totalArrobas: number;
  totalKg: number;
  precoArroba: number;
  valorBase: number;
  funruralTotal: number;
  valorBruto: number;
  bonusPrecoceTotal: number;
  bonusQualidadeTotal: number;
  bonusListaTraceTotal: number;
  totalBonus: number;
  descQualidadeTotal: number;
  descOutrosTotal: number;
  totalDescontos: number;
  valorLiquido: number;
  liqArroba: number;
  liqCabeca: number;
  liqKg: number;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: AbateParcela[];
  somaLiquida: number;
}

function roundValue(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

export function parseNumericValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const cleaned = value.toString().replace(/[^\d,.\-]/g, '').trim();
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseMaskedDecimalInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  const integerPart = digits.slice(0, -2) || '0';
  const decimalPart = digits.slice(-2).padStart(2, '0');
  return `${Number(integerPart)}.${decimalPart}`;
}

export function formatDecimalInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const numericValue = parseNumericValue(value);
  return numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrencyInput(value: string | number | null | undefined): string {
  const formatted = formatDecimalInput(value);
  return formatted ? `R$ ${formatted}` : '';
}

export function buildAbateCalculation(input: AbateCalculationInput): AbateCalculation {
  const quantidade = roundValue(parseNumericValue(input.quantidade), 0);
  const pesoKg = parseNumericValue(input.pesoKg);
  const pesoCarcacaKg = parseNumericValue(input.pesoCarcacaKg);
  const rendCarcaca = parseNumericValue(input.rendCarcaca);
  const precoArroba = parseNumericValue(input.precoArroba);

  // --- NO intermediate rounding: keep full precision until final output ---
  const carcacaRaw = pesoCarcacaKg > 0 ? pesoCarcacaKg : (rendCarcaca > 0 ? (pesoKg * rendCarcaca) / 100 : 0);
  const rendRaw = pesoCarcacaKg > 0 && pesoKg > 0 ? (pesoCarcacaKg / pesoKg) * 100 : rendCarcaca;
  const pesoArrobaCabRaw = carcacaRaw > 0 ? carcacaRaw / 15 : 0;
  const totalArrobasRaw = pesoArrobaCabRaw * quantidade;
  const totalKgRaw = pesoKg * quantidade;

  const valorBaseOverride = input.valorBaseOverride;
  const valorBaseRaw = (valorBaseOverride && valorBaseOverride > 0) ? valorBaseOverride : totalArrobasRaw * precoArroba;

  const funruralReais = parseNumericValue(input.funruralReais);
  const funruralPct = parseNumericValue(input.funruralPct);
  const funruralTotalRaw = funruralReais > 0 ? funruralReais : (valorBaseRaw * funruralPct) / 100;
  const valorBrutoRaw = valorBaseRaw - funruralTotalRaw;

  const bonusPrecoce = parseNumericValue(input.bonusPrecoce);
  const bonusPrecoceReais = parseNumericValue(input.bonusPrecoceReais);
  const bonusPrecoceTotalRaw = bonusPrecoce > 0 ? bonusPrecoce * totalArrobasRaw : bonusPrecoceReais;

  const bonusQualidade = parseNumericValue(input.bonusQualidade);
  const bonusQualidadeReais = parseNumericValue(input.bonusQualidadeReais);
  const bonusQualidadeTotalRaw = bonusQualidade > 0 ? bonusQualidade * totalArrobasRaw : bonusQualidadeReais;

  const bonusListaTrace = parseNumericValue(input.bonusListaTrace);
  const bonusListaTraceReais = parseNumericValue(input.bonusListaTraceReais);
  const bonusListaTraceTotalRaw = bonusListaTrace > 0 ? bonusListaTrace * totalArrobasRaw : bonusListaTraceReais;

  const totalBonusRaw = bonusPrecoceTotalRaw + bonusQualidadeTotalRaw + bonusListaTraceTotalRaw;

  const descontoQualidade = parseNumericValue(input.descontoQualidade);
  const descontoQualidadeReais = parseNumericValue(input.descontoQualidadeReais);
  const descQualidadeTotalRaw = descontoQualidade > 0 ? descontoQualidade * totalArrobasRaw : descontoQualidadeReais;

  const outrosDescontos = parseNumericValue(input.outrosDescontos);
  const outrosDescontosArroba = parseNumericValue(input.outrosDescontosArroba);
  const descOutrosTotalRaw = outrosDescontosArroba > 0 ? outrosDescontosArroba * totalArrobasRaw : outrosDescontos;

  const totalDescontosRaw = descQualidadeTotalRaw + descOutrosTotalRaw;
  const valorLiquidoRaw = valorBrutoRaw + totalBonusRaw - totalDescontosRaw;

  const liqArrobaRaw = totalArrobasRaw > 0 ? valorLiquidoRaw / totalArrobasRaw : 0;
  const liqCabecaRaw = quantidade > 0 ? valorLiquidoRaw / quantidade : 0;
  const liqKgRaw = totalKgRaw > 0 ? valorLiquidoRaw / totalKgRaw : 0;

  // --- Round ONLY for final output ---
  const carcacaCalc = roundValue(carcacaRaw, 4);
  const rendCalc = roundValue(rendRaw, 4);
  const pesoArrobaCab = roundValue(pesoArrobaCabRaw, 4);
  const totalArrobas = roundValue(totalArrobasRaw, 4);
  const totalKg = roundValue(totalKgRaw, 4);
  const valorBase = roundValue(valorBaseRaw);
  const funruralTotal = roundValue(funruralTotalRaw);
  const valorBruto = roundValue(valorBrutoRaw);
  const bonusPrecoceTotal = roundValue(bonusPrecoceTotalRaw);
  const bonusQualidadeTotal = roundValue(bonusQualidadeTotalRaw);
  const bonusListaTraceTotal = roundValue(bonusListaTraceTotalRaw);
  const totalBonus = roundValue(totalBonusRaw);
  const descQualidadeTotal = roundValue(descQualidadeTotalRaw);
  const descOutrosTotal = roundValue(descOutrosTotalRaw);
  const totalDescontos = roundValue(totalDescontosRaw);
  const valorLiquido = roundValue(valorLiquidoRaw);
  const liqArroba = roundValue(liqArrobaRaw);
  const liqCabeca = roundValue(liqCabecaRaw);
  const liqKg = roundValue(liqKgRaw);

  const parcelas = (input.parcelas || []).map((parcela) => ({
    data: parcela.data,
    valor: roundValue(parseNumericValue(parcela.valor)),
  }));
  const somaLiquida = roundValue(parcelas.reduce((total, parcela) => total + parcela.valor, 0));

  return {
    quantidade,
    pesoKg,
    carcacaCalc,
    rendCalc,
    pesoArrobaCab,
    totalArrobas,
    totalKg,
    precoArroba,
    valorBase,
    funruralTotal,
    valorBruto,
    bonusPrecoceTotal,
    bonusQualidadeTotal,
    bonusListaTraceTotal,
    totalBonus,
    descQualidadeTotal,
    descOutrosTotal,
    totalDescontos,
    valorLiquido,
    liqArroba,
    liqCabeca,
    liqKg,
    formaReceb: input.formaReceb === 'prazo' ? 'prazo' : 'avista',
    qtdParcelas: String(input.qtdParcelas || (parcelas.length > 0 ? parcelas.length : 1)),
    parcelas,
    somaLiquida,
  };
}