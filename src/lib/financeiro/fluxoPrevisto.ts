/**
 * FLUXO DE CAIXA PREVISTO — o acumulado dos mesmos compromissos da Lista. PR-CPR-2B.
 *
 * ⚠ NÃO É UMA SEGUNDA PROJEÇÃO, e essa é a única coisa que importa saber deste módulo. Ele
 * recebe as MESMAS linhas que a Lista já carregou (mesmo horizonte, mesmo segmento, mesmos
 * status, mesmo recorte por `data_vencimento`) e o MESMO saldo do card, e só soma. Se a Lista e
 * o gráfico discordarem, é porque alguém deu uma segunda fonte a um dos dois.
 *
 * ⚠ E O EIXO É O VENCIMENTO, o que faz do gráfico uma frase precisa: "assumindo que tudo cai no
 * dia em que vence". Não é previsão de comportamento — ninguém aqui sabe se o produtor vai
 * atrasar —, é a régua do compromisso.
 *
 * ⚠ `serieEvolucao` DO EXTRATO NÃO SERVIA, e foi medido: ela é por DIA dentro de UM mês
 * (recebe `ano, mes` e percorre `diasNoMes`), sobre a data de PAGAMENTO de UMA conta. Aqui o
 * eixo é por mês, ao longo de um horizonte que em "Tudo" atravessa quinze anos, sobre o
 * vencimento de todas as contas. Duas perguntas diferentes.
 */

/** O mínimo que o fluxo olha em cada lançamento. */
export interface LinhaFluxoPrevisto {
  data_vencimento: string | null;
  valor: number | null;
  tipo_operacao: string | null;
}

export interface PontoFluxo {
  /** `'inicio'` ou `'YYYY-MM'`. */
  chave: string;
  /** `'Hoje'` ou `'set/26'`. */
  rotulo: string;
  /** Entradas do mês, sempre >= 0. */
  entradas: number;
  /**
   * Saídas do mês, sempre <= 0.
   * ⚠ NEGATIVAS DE PROPÓSITO: é o que faz a coluna crescer PARA BAIXO a partir da linha do
   * zero quando as duas séries compartilham a mesma pilha. Guardar positivo e inverter no
   * componente poria a regra do desenho em dois lugares.
   */
  saidas: number;
  /** Saldo projetado ao fim do período. */
  saldo: number;
}

export interface FluxoPrevisto {
  pontos: PontoFluxo[];
  /**
   * Lançamentos sem `data_vencimento`, que NÃO entram no gráfico.
   * ⚠ ELES EXISTEM E PRECISAM SER DITOS. Um compromisso sem data não tem posição num eixo de
   * tempo — mas somir com ele em silêncio faria o total do gráfico divergir do da Lista sem
   * explicação. A tela mostra a contagem.
   */
  semVencimento: number;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `'2026-09'` → `'set/26'`. */
export function rotuloDoMes(anoMes: string): string {
  const ano = anoMes.slice(2, 4);
  const mes = Number(anoMes.slice(5, 7));
  return `${MESES[mes - 1] ?? anoMes}/${ano}`;
}

export function montarFluxoPrevisto(
  linhas: readonly LinhaFluxoPrevisto[],
  saldoInicial: number,
): FluxoPrevisto {
  const porMes = new Map<string, { entradas: number; saidas: number }>();
  let semVencimento = 0;

  for (const l of linhas) {
    const tipo = (l.tipo_operacao ?? '');
    /* Só entrada e saída. Transferência já não chega aqui (o recorte da tela a exclui), e
       qualquer tipo desconhecido fica de fora em vez de virar dinheiro por omissão. */
    const ehEntrada = tipo.startsWith('1-');
    const ehSaida = tipo.startsWith('2-');
    if (!ehEntrada && !ehSaida) continue;

    const venc = (l.data_vencimento ?? '').slice(0, 7);
    if (!venc) { semVencimento += 1; continue; }

    const v = Math.abs(Number(l.valor ?? 0));
    if (!Number.isFinite(v)) continue;
    const atual = porMes.get(venc) ?? { entradas: 0, saidas: 0 };
    if (ehEntrada) atual.entradas += v; else atual.saidas += v;
    porMes.set(venc, atual);
  }

  /* ⚠ O PONTO "HOJE" ABRE A SÉRIE, e não é enfeite: sem ele a linha nasceria já descontada do
     primeiro mês, e o operador não veria de onde ela partiu. É o mesmo `{ dia: 'Início' }` que
     a evolução do Extrato Gerencial usa. */
  const pontos: PontoFluxo[] = [{
    chave: 'inicio', rotulo: 'Hoje', entradas: 0, saidas: 0, saldo: arredondar(saldoInicial),
  }];

  let acumulado = saldoInicial;
  for (const mes of Array.from(porMes.keys()).sort()) {
    const { entradas, saidas } = porMes.get(mes)!;
    acumulado += entradas - saidas;
    pontos.push({
      chave: mes,
      rotulo: rotuloDoMes(mes),
      entradas: arredondar(entradas),
      saidas: arredondar(-saidas),
      saldo: arredondar(acumulado),
    });
  }

  return { pontos, semVencimento };
}

/**
 * O primeiro mês em que a linha fura o zero — onde a zona vermelha começa.
 *
 * ⚠ O PONTO "Hoje" ENTRA NA BUSCA: um cliente já negativo hoje tem de aparecer negativo desde
 * o começo, e não a partir do primeiro mês com movimento.
 */
export function primeiroNegativo(pontos: readonly PontoFluxo[]): PontoFluxo | null {
  return pontos.find((p) => p.saldo < 0) ?? null;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}
