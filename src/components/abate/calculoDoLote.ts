import type { AbateCalculation } from '@/lib/calculos/abate';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';

/**
 * A ponte entre o lote da tela e a lib do abate — a ÚNICA, de propósito.
 *
 * ⚠ MOVIDO VERBATIM de `AbaNegociacaoAbate` quando a grade do abate passou a existir
 * (ABATE-UX-01b). Duas telas leem os mesmos lotes e precisam do MESMO número; duas cópias
 * desta função seriam duas respostas para "quanto vale este lote", e a primeira vez que
 * divergissem ninguém saberia qual manda. O conteúdo não mudou uma vírgula.
 */
/** A linha zerada de um lote — movida verbatim junto de `paraCalculo`, pelo mesmo
 *  motivo: as duas telas precisam partir do MESMO vazio. */
export const linhaVazia = (loteId: string): LinhaAbate => ({
  operacaoLoteId: loteId,
  pesoCarcacaKg: null, pesoCarcacaFonte: null, rendimentoCarcacaPct: null, pesoTotalKgNf: null,
  precoArroba: null, precoFonte: null, valorBaseOverride: null, valorLiquido: null,
  bonusPrecoce: { valor: null, fonte: null },
  bonusQualidade: { valor: null, fonte: null },
  bonusListaTrace: { valor: null, fonte: null },
  descontoQualidade: { valor: null, fonte: null },
  outrosDescontos: { valor: null, fonte: null },
  funrural: { valor: null, fonte: null },
});

export interface LoteAbate {
  id: string;
  ordem: number;
  categoria: string | null;
  categoriaLabel: string;
  quantidade: number;
  pesoMedioKg: number;
}

export function paraCalculo(l: LinhaAbate, lote: LoteAbate) {
  const porFonte = (v: { valor: number | null; fonte: string | null }, unidade: string) =>
    v.valor != null && v.fonte === unidade ? v.valor : null;
  return {
    quantidade: lote.quantidade,
    pesoKg: lote.pesoMedioKg,
    /* ⚠ A LIB TRABALHA POR CABEÇA E O BANCO GUARDA O TOTAL — a conversão mora aqui, e
       errá-la erra tudo por um fator de `quantidade`. A aritmética é que prova a unidade
       da lib, não o nome do campo: `abate.ts` faz `carcaça / 15` e chama o resultado de
       `pesoArrobaCab`, e só DEPOIS multiplica por `quantidade`. Do outro lado, a RPC faz
       `sum(peso_carcaca_kg)` entre os lotes para o `peso_carcaca_kg_total` do cabeçalho —
       ali é total. `pesoKg` é o peso médio, então o rendimento (carcaça ÷ vivo) compara
       por cabeça dos dois lados. */
    pesoCarcacaKg: l.pesoCarcacaKg != null && lote.quantidade > 0
      ? l.pesoCarcacaKg / lote.quantidade
      : null,
    rendCarcaca: l.rendimentoCarcacaPct,
    precoArroba: l.precoArroba,
    valorBaseOverride: l.valorBaseOverride ?? undefined,
    bonusPrecoce: porFonte(l.bonusPrecoce, 'arroba'),
    bonusPrecoceReais: porFonte(l.bonusPrecoce, 'reais'),
    bonusQualidade: porFonte(l.bonusQualidade, 'arroba'),
    bonusQualidadeReais: porFonte(l.bonusQualidade, 'reais'),
    bonusListaTrace: porFonte(l.bonusListaTrace, 'arroba'),
    bonusListaTraceReais: porFonte(l.bonusListaTrace, 'reais'),
    descontoQualidade: porFonte(l.descontoQualidade, 'arroba'),
    descontoQualidadeReais: porFonte(l.descontoQualidade, 'reais'),
    outrosDescontos: porFonte(l.outrosDescontos, 'reais'),
    outrosDescontosArroba: porFonte(l.outrosDescontos, 'arroba'),
    funruralPct: porFonte(l.funrural, 'pct'),
    funruralReais: porFonte(l.funrural, 'reais'),
  };
}

/**
 * Os totais da operação, a partir das PARCELAS que a lib já devolveu por lote.
 *
 * ⚠ UMA CONTA SÓ para a grade e para o resumo lateral. Enquanto cada um somava por si,
 * bastava um esquecer de proteger a divisão por zero para os dois mostrarem números
 * diferentes na mesma tela — e o operador não teria como saber qual acreditar.
 * ⚠ NADA AQUI RECALCULA A CASCATA: só soma `valorBruto`, `valorLiquido`, `totalArrobas`
 * e afins, que saíram de `buildAbateCalculation`. Divisão sem base devolve 0, e quem
 * exibe decide se isso vira "—".
 */
export function totaisDoAbate(lotes: LoteAbate[], calculos: Map<string, AbateCalculation>) {
  /* ⚠ SOMA DE PARCELAS DA LIB, nunca conta nova. Cada `c` já é o resultado de
     `buildAbateCalculation` para aquele lote. */
    const soma = (f: (c: AbateCalculation) => number) =>
      lotes.reduce((s, l) => { const c = calculos.get(l.id); return s + (c ? f(c) : 0); }, 0);
    const cabecas = lotes.reduce((s, l) => s + l.quantidade, 0);
    const pesoVivo = soma(c => c.totalKg);
    const carcaca = soma(c => c.carcacaCalc * c.quantidade);
    const arrobas = soma(c => c.totalArrobas);
    return {
      cabecas, pesoVivo, carcaca, arrobas,
      bruto: soma(c => c.valorBruto),
      liquido: soma(c => c.valorLiquido),
      /* Divisões protegidas: sem cabeça ou sem arroba o certo é `—`, não infinito. */
      pesoMedio: cabecas > 0 ? pesoVivo / cabecas : 0,
      carcacaCab: cabecas > 0 ? carcaca / cabecas : 0,
      arrobaCab: cabecas > 0 ? arrobas / cabecas : 0,
      rc: pesoVivo > 0 ? (carcaca / pesoVivo) * 100 : 0,
    };
}
