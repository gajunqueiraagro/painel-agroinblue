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
  const precisaDia = opcoes.granularidade === 'dia' && !!maiorVenc;
  /* O eixo ABRE EM HOJE, sempre: o horizonte diz até onde ir para a frente, nunca o quanto
     voltar. Sem isto o "Tudo" começava em jul/2025 e o "Vencidos" olhava para trás. */
  const de = precisaDia ? opcoes.hoje : '';
  const ate = precisaDia ? (maiorVenc! > opcoes.hoje ? maiorVenc! : opcoes.hoje) : '';
  const totalDias = precisaDia ? diasEntre(de, ate) + 1 : 0;
  const granularidade: Granularidade =
    opcoes.granularidade === 'dia' && totalDias > 0 && totalDias <= MAX_PONTOS_DIA ? 'dia' : 'mes';
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
  const pontos: PontoFluxo[] = [{
    chave: 'inicio', rotulo: 'Hoje', faixa: '', abreFaixa: false,
    entradas: 0, saidas: 0, ...partesDoSaldo(saldoInicial),
  }];

  const chaves: string[] = granularidade === 'dia'
    ? Array.from({ length: totalDias }, (_, i) => somarDiasIso(de, i))
    : Array.from(mapa.keys()).sort();

  let acumulado = saldoInicial;
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
export function primeiroNegativo(pontos: readonly PontoFluxo[]): PontoFluxo | null {
  return pontos.find((p) => p.saldo < 0) ?? null;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
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
