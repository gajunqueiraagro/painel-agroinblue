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

export type Granularidade = 'dia' | 'mes';

/**
 * Teto de pontos no modo diário.
 *
 * ⚠ ELE NASCE DE UMA MEDIÇÃO, não de cautela: o horizonte "Vencidos" do Agnaldo Cedenho vai
 * até 03/02/2020 — 2.420 dias. Um gráfico com 2.420 colunas não é denso, é ilegível, e ainda
 * derruba o navegador do produtor. Acima do teto a série cai para mensal e DIZ que caiu; o
 * chamador mostra isso, porque um gráfico que troca de régua em silêncio é pior que um
 * gráfico grosso.
 */
export const MAX_PONTOS_DIA = 180;

export interface PontoFluxo {
  /** `'inicio'`, `'YYYY-MM-DD'` (diário) ou `'YYYY-MM'` (mensal). */
  chave: string;
  /** `'Hoje'`, `'19/09'` (diário) ou `'set/26'` (mensal). */
  rotulo: string;
  /**
   * A faixa de baixo do eixo X: `'set/26'` no diário, `'2026'` no mensal.
   * ⚠ ELA MORA NO PONTO, e não é derivada no componente: é o que permite o tick customizado
   * desenhar o traço vertical exatamente onde a faixa muda, sem reinterpretar a chave.
   */
  faixa: string;
  /** Primeiro ponto de uma faixa nova — onde o tick desenha o traço de virada. */
  abreFaixa: boolean;
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
  /**
   * O saldo partido em duas séries, para a área trocar de cor NO CRUZAMENTO — PR-CPR-2B.2.
   *
   * ⚠ ELAS EXISTEM PARA CONSERTAR UM BUG DE GRADIENTE, e a causa vale registrar: a versão
   * anterior desenhava UMA área (`baseValue={0}`) pintada por um `linearGradient` cujo offset
   * era a posição do zero no DOMÍNIO. Só que o gradiente de um `fill` usa `objectBoundingBox`
   * — ele mede a caixa da PRÓPRIA FORMA, não o plot. Numa série sempre positiva a área ocupa
   * só o terço de cima do gráfico, e o offset de 71% caía dentro dela: metade da área positiva
   * saía vermelha, sem a linha jamais ter ido abaixo de zero.
   * ⚠ DUAS SÉRIES RESOLVEM SEM PIXEL NENHUM. `saldoPos` é o saldo quando positivo e zero
   * quando não; `saldoNeg`, o contrário. Cada uma vira uma área com base no zero: onde a linha
   * é positiva só a azul tem altura, onde é negativa só a vermelha. No cruzamento as duas
   * valem zero, então a troca acontece exatamente no ponto — por construção, não por
   * aproximação de cor.
   */
  saldoPos: number;
  saldoNeg: number;
}

export interface FluxoPrevisto {
  pontos: PontoFluxo[];
  /** A granularidade EFETIVAMENTE usada — pode diferir da pedida (ver `MAX_PONTOS_DIA`). */
  granularidade: Granularidade;
  /** `true` quando a pedida era diária e a série teve de cair para mensal. */
  rebaixada: boolean;
  /**
   * Lançamentos com vencimento ANTERIOR a hoje, que não entram na projeção.
   * ⚠ Contados, não escondidos: no horizonte "Vencidos" eles são a lista inteira, e o gráfico
   * precisa poder dizer por que está mostrando outra coisa.
   */
  anteriores: number;
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

/** `'2026-09-19'` → `'19/09'`. */
export function rotuloDoDia(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Soma dias a uma data ISO, sem passar por `Date` local. */
function somarDiasIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  const a = new Date(`${de}T12:00:00Z`).getTime();
  const b = new Date(`${ate}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function montarFluxoPrevisto(
  linhas: readonly LinhaFluxoPrevisto[],
  saldoInicial: number,
  opcoes: { granularidade: Granularidade; hoje: string },
): FluxoPrevisto {
  const porChave = new Map<string, { entradas: number; saidas: number }>();
  let semVencimento = 0;
  let anteriores = 0;
  let menorVenc: string | null = null;
  let maiorVenc: string | null = null;

  for (const l of linhas) {
    const tipo = (l.tipo_operacao ?? '');
    /* Só entrada e saída. Transferência já não chega aqui (o recorte da tela a exclui), e
       qualquer tipo desconhecido fica de fora em vez de virar dinheiro por omissão. */
    const ehEntrada = tipo.startsWith('1-');
    const ehSaida = tipo.startsWith('2-');
    if (!ehEntrada && !ehSaida) continue;

    const venc = (l.data_vencimento ?? '').slice(0, 10);
    if (!venc) { semVencimento += 1; continue; }
    /* ⚠ O FLUXO É SÓ PARA A FRENTE — PR-CPR-2B.2. Ele responde "o caixa aguenta daqui em
       diante?", e um vencimento que já passou não está no futuro de ninguém: ele ou foi pago
       (e já está no saldo de partida) ou está vencido (e é assunto da Lista). Deixá-lo entrar
       descontava duas vezes a mesma obrigação e ainda puxava o eixo para jul/2025. */
    if (venc < opcoes.hoje) { anteriores += 1; continue; }
    if (!menorVenc || venc < menorVenc) menorVenc = venc;
    if (!maiorVenc || venc > maiorVenc) maiorVenc = venc;

    const v = Math.abs(Number(l.valor ?? 0));
    if (!Number.isFinite(v)) continue;
    const chave = opcoes.granularidade === 'dia' ? venc : venc.slice(0, 7);
    const atual = porChave.get(chave) ?? { entradas: 0, saidas: 0 };
    if (ehEntrada) atual.entradas += v; else atual.saidas += v;
    porChave.set(chave, atual);
  }

  /* ⚠ A SÉRIE DIÁRIA É CONTÍNUA, e é isso que a torna um saldo. Só os dias COM movimento
     dariam uma linha que salta de 05/10 para 13/11 com a mesma inclinação de um dia para o
     outro — o eixo deixaria de ser tempo. Dia sem movimento entra com barra zero e o saldo
     anterior, que é a verdade: naquele dia nada aconteceu. */
  /* ⚠ SEM COMPROMISSO FUTURO A SÉRIE CONTINUA DIÁRIA. Amarrar a granularidade à existência de
     um vencimento fazia um cliente sem nada a vencer cair para mensal — e levava junto o
     PASSADO, que é diário e tem o que mostrar. O intervalo vira só o dia de hoje; o passado
     acrescenta os dias dele por fora. */
  const precisaDia = opcoes.granularidade === 'dia';
  /* O eixo ABRE EM HOJE, sempre: o horizonte diz até onde ir para a frente, nunca o quanto
     voltar. Sem isto o "Tudo" começava em jul/2025 e o "Vencidos" olhava para trás. */
  /* ⚠ O LAÇO DIÁRIO COMEÇA EM HOJE+1, e não em hoje: o ponto "Hoje" já É o dia de hoje. Até a
     2B.2 os dois coexistiam e o dia atual saía duplicado — invisível enquanto a série abria
     nele, óbvio agora que o passado chega até ali e a junção tem de ser um ponto só. */
  const de = precisaDia ? somarDiasIso(opcoes.hoje, 1) : '';
  const ate = precisaDia ? (maiorVenc! > opcoes.hoje ? maiorVenc! : opcoes.hoje) : '';
  const totalDias = precisaDia && ate >= de ? diasEntre(de, ate) + 1 : 0;
  const granularidade: Granularidade =
    opcoes.granularidade === 'dia' && totalDias <= MAX_PONTOS_DIA ? 'dia' : 'mes';
  const rebaixada = opcoes.granularidade === 'dia' && granularidade === 'mes' && totalDias > MAX_PONTOS_DIA;

  /* Caiu para mensal depois de agrupar por dia: reagrupar pelas chaves de mês. */
  const mapa = granularidade === 'dia' ? porChave : (() => {
    if (opcoes.granularidade === 'mes') return porChave;
    const m = new Map<string, { entradas: number; saidas: number }>();
    for (const [k, v] of porChave) {
      const mes = k.slice(0, 7);
      const atual = m.get(mes) ?? { entradas: 0, saidas: 0 };
      atual.entradas += v.entradas; atual.saidas += v.saidas;
      m.set(mes, atual);
    }
    return m;
  })();

  /* ⚠ O PONTO "HOJE" ABRE A SÉRIE, e não é enfeite: sem ele a linha nasceria já descontada do
     primeiro período, e o operador não veria de onde ela partiu. É o mesmo `{ dia: 'Início' }`
     que a evolução do Extrato Gerencial usa. */
  /**
   * ⚠ O QUE VENCE HOJE FICA NO PONTO "HOJE", mas NÃO no saldo dele. O saldo de hoje é o do
   * card — o dinheiro que está na conta agora —, e uma obrigação que vence hoje e ainda não
   * foi paga não saiu de lá. Ela aparece como BARRA no dia de hoje e desconta a linha a partir
   * do ponto seguinte.
   * ⚠ E NÃO É DETALHE: no NJ são R$ 600.500,00 vencendo hoje (a amortização Sicredi mais os
   * juros). Sem isto, o laço diário começando amanhã as perderia por inteiro.
   */
  const deHoje = granularidade === 'dia'
    ? mapa.get(opcoes.hoje) ?? { entradas: 0, saidas: 0 }
    : { entradas: 0, saidas: 0 };

  const pontos: PontoFluxo[] = [{
    chave: 'inicio', rotulo: 'Hoje', faixa: '', abreFaixa: false,
    entradas: arredondar(deHoje.entradas), saidas: arredondar(-deHoje.saidas),
    ...partesDoSaldo(saldoInicial),
  }];

  const chaves: string[] = granularidade === 'dia'
    ? Array.from({ length: totalDias }, (_, i) => somarDiasIso(de, i))
    : Array.from(mapa.keys()).sort();

  let acumulado = saldoInicial + deHoje.entradas - deHoje.saidas;
  let faixaAnterior = '';
  for (const chave of chaves) {
    const { entradas, saidas } = mapa.get(chave) ?? { entradas: 0, saidas: 0 };
    acumulado += entradas - saidas;
    const faixa = granularidade === 'dia' ? rotuloDoMes(chave.slice(0, 7)) : chave.slice(0, 4);
    pontos.push({
      chave,
      rotulo: granularidade === 'dia' ? rotuloDoDia(chave) : rotuloDoMes(chave),
      faixa,
      abreFaixa: faixa !== faixaAnterior,
      entradas: arredondar(entradas),
      saidas: arredondar(-saidas),
      ...partesDoSaldo(acumulado),
    });
    faixaAnterior = faixa;
  }

  return { pontos, granularidade, rebaixada, semVencimento, anteriores };
}

/**
 * O primeiro mês em que a linha fura o zero — onde a zona vermelha começa.
 *
 * ⚠ O PONTO "Hoje" ENTRA NA BUSCA: um cliente já negativo hoje tem de aparecer negativo desde
 * o começo, e não a partir do primeiro mês com movimento.
 */
export function primeiroNegativo<T extends PontoFluxo>(pontos: readonly T[]): T | null {
  /* Genérica para servir tanto à série crua quanto à das três zonas (`PontoLinha`), sem
     obrigar o chamador a um cast para recuperar o tipo que ele já tinha. */
  return pontos.find((p) => p.saldo < 0) ?? null;
}

function arredondar(n: number): number {
  const r = Math.round(n * 100) / 100;
  /* ⚠ `-0` NÃO É `0` para `Object.is`, e é o que `-(0)` produz ao inverter o sinal das saídas.
     Ele não muda desenho nenhum, mas faz uma comparação de igualdade falhar sem motivo — e
     seria um enigma para quem lesse o teste. */
  return r === 0 ? 0 : r;
}

/** O saldo e as suas duas metades, para a área azul e a vermelha. */
function partesDoSaldo(v: number): { saldo: number; saldoPos: number; saldoNeg: number } {
  const saldo = arredondar(v);
  return { saldo, saldoPos: Math.max(saldo, 0), saldoNeg: Math.min(saldo, 0) };
}

/* ─────────────────────────────────────────────────────────────────────────────
   A ESCALA DO EIXO Y — PR-CPR-2B.1

   ⚠ O DEFEITO QUE ELA CONSERTA: com o domínio automático do recharts, um cliente cujas saídas
   são pequenas ao lado do saldo ganhava um zero COLADO na borda de baixo, e o gráfico virava
   um deserto branco com a linha rente ao teto. Pior, os passos saíam quebrados — 400k para
   cima e 150k para baixo —, e duas divisões de tamanho diferente na mesma grade fazem o olho
   comparar alturas que não são comparáveis.

   As três regras, nesta ordem:
     1. PASSO ÚNICO. O intervalo entre linhas de grade é o mesmo acima e abaixo do zero.
     2. RESPIRO NO TOPO. O maior valor para cima não encosta: ~15% de folga.
     3. PISO DE RESPIRO EMBAIXO. Mesmo sem saída nenhuma, o zero fica a pelo menos ~25% da
        altura do gráfico da borda inferior — é isso que impede o zero de virar rodapé.
   ───────────────────────────────────────────────────────────────────────────── */

/** Fração mínima da altura do gráfico reservada abaixo do zero. */
export const PISO_RESPIRO_ABAIXO = 0.25;

/** Folga acima do maior valor. */
export const FOLGA_ACIMA = 0.15;

/** Divisões-alvo da grade. Menos que isso fica pobre; mais, poluído. */
const DIVISOES_ALVO = 7;

/**
 * O "passo redondo" imediatamente acima de um valor cru.
 * ⚠ 1 · 2 · 2,5 · 5 × 10^k — a série que produz grade legível em dinheiro (200k, 250k, 500k).
 * Um passo de 137k é matematicamente válido e ilegível.
 */
export function passoRedondo(bruto: number): number {
  if (!Number.isFinite(bruto) || bruto <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / potencia;
  const escolhido = normalizado <= 1 ? 1
    : normalizado <= 2 ? 2
    : normalizado <= 2.5 ? 2.5
    : normalizado <= 5 ? 5
    : 10;
  return escolhido * potencia;
}

export interface EscalaY {
  dominio: [number, number];
  ticks: number[];
  passo: number;
}

export function escalaSimetrica(pontos: readonly PontoFluxo[]): EscalaY {
  let maiorCima = 0;
  let maiorBaixo = 0;
  for (const p of pontos) {
    maiorCima = Math.max(maiorCima, p.saldo, p.entradas);
    /* `saidas` já é negativo; o saldo negativo também empurra para baixo. */
    maiorBaixo = Math.max(maiorBaixo, -p.saidas, -p.saldo);
  }
  if (maiorCima === 0 && maiorBaixo === 0) {
    return { dominio: [-1, 1], ticks: [-1, 0, 1], passo: 1 };
  }

  const alvoCima = maiorCima * (1 + FOLGA_ACIMA);
  /* ⚠ O PISO É RELATIVO À ALTURA TOTAL, não ao valor de baixo: `baixo >= 25% de (cima+baixo)`
     resolve para `baixo >= cima/3`. É a forma fechada da regra "o zero não cola na borda". */
  const alvoBaixo = Math.max(
    maiorBaixo * (1 + FOLGA_ACIMA),
    alvoCima * (PISO_RESPIRO_ABAIXO / (1 - PISO_RESPIRO_ABAIXO)),
  );

  const passo = passoRedondo((alvoCima + alvoBaixo) / DIVISOES_ALVO);
  const acima = Math.max(1, Math.ceil(alvoCima / passo));
  const abaixo = Math.max(1, Math.ceil(alvoBaixo / passo));

  const ticks: number[] = [];
  for (let i = -abaixo; i <= acima; i++) ticks.push(arredondar(i * passo));
  return { dominio: [-abaixo * passo, acima * passo], ticks, passo };
}

/* ─────────────────────────────────────────────────────────────────────────────
   AS TRÊS ZONAS DE TEMPO — PR-CPR-2B.3

   A linha deixa de começar em hoje e passa a contar a história inteira:

     CONCILIADO  o passado confirmado com o banco, até a posição conciliada mais atrasada
     REALIZADO   o que já aconteceu e ainda não foi conciliado, dali até hoje
     PREVISTO    de hoje em diante

   ⚠ O VALOR EM "HOJE" É O MESMO PONTO, não dois. O passado termina em hoje e o futuro começa
   em hoje, com o mesmo saldo — que é o do card. Duplicar o dia faria a linha ter um degrau de
   largura zero exatamente onde ela precisa ser contínua.
   ⚠ E É POR ISSO QUE UM DEGRAU VISÍVEL ALI É DADO, NÃO DESENHO: `serieDoSaldoPassado` fecha no
   total do card por construção (há teste). Se a tela mostrar um salto em hoje, o que está
   furado é a conciliação.
   ───────────────────────────────────────────────────────────────────────────── */

export type ZonaFluxo = 'conciliado' | 'realizado' | 'previsto';

/** Um ponto do passado, como `serieDoSaldoPassado` entrega. */
export interface PontoPassadoEntrada {
  data: string;
  saldo: number;
  conciliado: boolean;
  /** Realizados do dia — as barras do passado. Entradas >= 0, saídas <= 0. */
  entradas: number;
  saidas: number;
}

export interface PontoLinha extends PontoFluxo {
  zona: ZonaFluxo;
  /**
   * O saldo repetido em três séries, nulo fora da sua zona.
   *
   * ⚠ TRÊS SÉRIES, E NÃO UMA COM COR POR PONTO: o recharts pinta uma `Line` inteira com um
   * `stroke` só, e o `dot` colorido não muda o traço ENTRE os pontos. Com três séries e
   * `connectNulls={false}` cada trecho é um caminho próprio, com a sua cor e o seu tracejado.
   * ⚠ CADA ZONA REPETE O PRIMEIRO PONTO DA SEGUINTE, senão fica um vão de um segmento entre
   * elas — a linha apareceria partida nas viradas.
   */
  saldoConciliado: number | null;
  saldoRealizado: number | null;
  saldoPrevisto: number | null;
}

/**
 * Junta o passado à projeção numa série só.
 *
 * No modo mensal o passado é reduzido ao ÚLTIMO dia de cada mês: misturar oitenta pontos
 * diários com cinquenta e sete mensais no mesmo eixo categórico esmagaria o futuro contra a
 * margem direita.
 */
export function combinarComPassado(
  fluxo: FluxoPrevisto,
  passado: readonly PontoPassadoEntrada[],
  hoje: string,
): PontoLinha[] {
  const vestir = (p: PontoFluxo, zona: ZonaFluxo): PontoLinha => ({
    ...p, zona, saldoConciliado: null, saldoRealizado: null, saldoPrevisto: null,
  });

  if (passado.length === 0) {
    const so = fluxo.pontos.map((p) => vestir(p, 'previsto'));
    return preencherSeries(so);
  }

  const doDia = fluxo.granularidade === 'dia';
  /* No mensal, um ponto por mês: o último dia de cada um. */
  const reduzido = doDia ? passado : passado.filter((p, i) =>
    i === passado.length - 1 || p.data.slice(0, 7) !== passado[i + 1].data.slice(0, 7));

  const anteriores: PontoLinha[] = reduzido
    /* Hoje NÃO entra aqui: ele é o primeiro ponto do futuro, e um só. */
    .filter((p) => p.data < hoje)
    .map((p) => ({
      chave: p.data,
      rotulo: doDia ? rotuloDoDia(p.data) : rotuloDoMes(p.data.slice(0, 7)),
      faixa: doDia ? rotuloDoMes(p.data.slice(0, 7)) : p.data.slice(0, 4),
      abreFaixa: false,
      /* ⚠ AS BARRAS DO PASSADO SÃO REALIZADOS, não previsões — mesma forma, outro tempo. Sem
         elas o mês anterior seria uma linha andando sem que nada explicasse por quê. */
      entradas: p.entradas,
      saidas: p.saidas,
      saldo: p.saldo,
      saldoPos: Math.max(p.saldo, 0),
      saldoNeg: Math.min(p.saldo, 0),
      zona: p.conciliado ? 'conciliado' : 'realizado',
      saldoConciliado: null, saldoRealizado: null, saldoPrevisto: null,
    }));

  /* O primeiro ponto do futuro é "Hoje" e traz o saldo do card — é a costura das duas metades. */
  const futuro = fluxo.pontos.map((p) => vestir(p, 'previsto'));

  /**
   * ⚠ O DEGRAU EM "HOJE" É INFORMAÇÃO, e por isso o ponto carrega DOIS valores. A caminhada do
   * passado (regra de mês fixo) e o card (âncora por conta) são construções diferentes: quando
   * toda conta está conciliada até o fim do mês anterior elas coincidem — medido, NJ e Vera com
   * diferença zero —, e quando não coincidem a diferença é uma conta cuja conciliação não
   * fecha. O trecho azul termina no valor caminhado e o laranja começa no valor do card; o
   * salto entre os dois, na mesma vertical, é a denúncia.
   * ⚠ E A TELA NÃO NOMEIA A CONTA: isso é trabalho da Conciliação. Aqui só se mostra que há.
   */
  const passadoEmHoje = passado.find((p) => p.data === hoje) ?? null;

  const juntos = [...anteriores, ...futuro];
  /* A faixa é recalculada sobre a série inteira: o passado acrescentou meses à esquerda. */
  let faixaAnterior = '';
  for (const p of juntos) {
    p.abreFaixa = !!p.faixa && p.faixa !== faixaAnterior;
    if (p.faixa) faixaAnterior = p.faixa;
  }
  const series = preencherSeries(juntos);
  if (passadoEmHoje) {
    const emHoje = series.find((p) => p.rotulo === 'Hoje');
    /* O `saldo` do ponto continua sendo o do card — é ele que o tooltip, a área e a tag dizem.
       O que muda é só onde o traço azul termina. */
    if (emHoje) emHoje.saldoRealizado = passadoEmHoje.saldo;
  }
  return series;
}

/** Espalha o saldo nas três séries, repetindo a virada para os trechos se tocarem. */
function preencherSeries(pontos: PontoLinha[]): PontoLinha[] {
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    const proxima = pontos[i + 1]?.zona;
    const ponte = proxima && proxima !== p.zona ? proxima : null;
    if (p.zona === 'conciliado' || ponte === 'conciliado') p.saldoConciliado = p.saldo;
    if (p.zona === 'realizado' || ponte === 'realizado') p.saldoRealizado = p.saldo;
    if (p.zona === 'previsto' || ponte === 'previsto') p.saldoPrevisto = p.saldo;
  }
  return pontos;
}
