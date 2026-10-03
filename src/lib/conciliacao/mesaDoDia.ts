/**
 * A MESA DO DIA DA CONFERÊNCIA — o fechamento banco × sistema por dia (PR-CONC-CONFERENCIA-FECHAMENTO-DIA).
 *
 * ⚠ CÓDIGO MOVIDO DE `src/components/financeiro-v2/EspelhoConciliacaoTab.tsx` (tipos do Espelho, `ordenar`,
 *   `totaisDoEspelho`, `sinalDoAplicado`, `montarMesa`), byte a byte; as únicas palavras novas no move são os dois `export`
 *   (`EspCandidato` e `ordenar` eram locais e a tela os usa). A tela importa daqui e reexporta para quem já importava dela.
 * ⚠ LIB PURA: nenhum React, nenhuma consulta. Quem desenha é a tela; quem decide em que dia cada linha mora e quanto o dia
 *   soma é esta lib.
 */
import type { EspOfx } from '@/components/conciliacao/TabelaExtratoDoMes';
import { vinculoVencedor } from '@/v2/lib/origemLancamento';

export interface EspSis {
  lancamento_id: string; data: string | null; descricao: string | null;
  centro: string | null; subcentro: string | null; valor_assinado: number;
  sinal: string | null; status: 'conciliado' | 'sem_vinculo';
  /* Opcionais porque a tela já sabe o que fazer com a ausência — "—". Em 09/09/2026 a RPC não os
     emitia; hoje `fn_extratos_espelhados` devolve `fornecedor` no `sistema_completo` (conferido no
     `prosrc` em 30/09, PR-CONC-CONFERENCIA-MODAL-01-fix1), e a sub-aba Sistema tem coluna para ele. */
  fornecedor?: string | null;
  origem_lancamento?: string | null;
  competencia?: string | null;
}
/**
 * UM CANDIDATO DO SISTEMA — PR-ESPELHO-CANDIDATOS-FRONT-01 (Etapa 1 do Espelho evoluído).
 *
 * Lançamento previsto/agendado/programado que pode casar com o extrato: os do mês e todos os
 * vencidos em aberto. Vem de `sistema_candidatos` (`fn_extratos_espelhados`, versão
 * `espelhados-04-candidatos`, migration 20261027122100). Nesta etapa a tela só MOSTRA; casar
 * é a Etapa 2.
 */
export interface EspCandidato {
  lancamento_id: string;
  data_vencimento: string | null;
  competencia: string | null;
  valor: number;
  valor_assinado: number;
  sinal: string | null;
  descricao: string | null;
  centro: string | null;
  subcentro: string | null;
  status_transacao: string | null;
  cenario: string | null;
  cultura: string | null;
  numero_documento: string | null;
  tipo_documento: string | null;
  favorecido_id: string | null;
  fornecedor: string | null;
  safra_codigo: string | null;
  safra_descricao: string | null;
  vencido: boolean;
  ja_conciliado: boolean;
  sem_conta: boolean;
}
export interface EspVinculo {
  extrato_id: string; lancamento_id: string; valor_aplicado: number;
  tipo_aprovacao: string | null; grupo_id: string | null;
}
export interface EspelhadosReais {
  escopo: { cliente_id: string; conta_id: string; ano_mes: string; nome_conta: string | null };
  saldos: { inicial: number | null; final_oficial: number | null; periodo_ini: string | null; periodo_fim: string | null; extrato_ini: string | null; extrato_fim: string | null };
  ofx_completo: EspOfx[];
  sistema_completo: EspSis[];
  /* ⚠ A CHAVE QUE MATOU A HEURÍSTICA (migration 20260909120258). Diz qual lançamento casa
     com qual extrato, com quanto foi aplicado e sob que tipo — tudo o que a Conferência
     precisava e antes tinha de adivinhar. */
  vinculos?: EspVinculo[];
  /* Opcional: uma RPC anterior à `espelhados-04-candidatos` não emite a chave, e a tela
     trata a ausência como lista vazia. */
  sistema_candidatos?: EspCandidato[];
  /* PR-CONC-CONFERENCIA-FECHAMENTO-DIA: a regra do caixa do banco (CONC-CAIXA-PONTA-01, `espelhados-05-caixa`) — uma
     linha por ponta e data. A mesa NÃO a lê para somar (o dia soma o que desenha); os testes provam que o sistema do dia
     é igual a ela, menos as internas e os sobre-aplicados (ver `lancamentosSobreAplicados`). */
  sistema_caixa?: EspCaixa[];
  versao: string;
  gerado_em: string;
}
export interface EspCaixa {
  lancamento_id: string; data: string | null; valor: number;
  origem: string | null; parcial: boolean; falta: number;
}

// ── Conferência — a mesa do dia ────────────────────────────────────────────
export interface FilhaConf {
  lancamento_id: string; valor_aplicado: number; sis?: EspSis; deN: number;
  /** R4 (D4): a data do LANÇAMENTO quando difere da do extrato — aviso na filha, nunca diferença no fechamento. */
  lancadoEm: string | null;
  /** D3: o lançamento também é pago por OUTROS extratos desta conta — o valor cheio dele e as datas desses extratos. */
  parte: { valorCheio: number; restoEm: string[] } | null;
  /** R5: a soma dos aplicados nos extratos DA CONTA passa do valor do lançamento (`lancamentosSobreAplicados`). */
  sobreAplicado: boolean;
}
export interface Pareado {
  extrato: EspOfx; filhas: FilhaConf[]; grupoId: string | null;
  tipoVencedor: string | null; soma: number; diferenca: number;
  /** R5: alguma filha é de lançamento sobre-aplicado — a linha do extrato escreve "aplicado acima do lançamento". */
  sobreAplicado: boolean;
}
/**
 * O SENTIDO INVERSO — PR-ESPELHO-05. Um lançamento explicado por VÁRIOS extratos.
 *
 * ⚠ A MÃE TROCA DE LADO. No 1:N a âncora é o extrato e as filhas são lançamentos; aqui é o
 * contrário, e a tela tem de dizer isso sem palavra nenhuma: a mãe aparece do lado do
 * SISTEMA, as filhas do lado do BANCO, e a seta do meio vira `↰` — apontando para o OFX em
 * vez de para o sistema. Desenhar os dois casos igual faria o operador ler "um extrato
 * pagou N lançamentos" onde houve "N depósitos pagaram um título".
 */
export interface ParedoN1 {
  sis: EspSis;
  /* `grupoId` do VÍNCULO de cada extrato (CONC-N1-DESCONCILIAR-01): sem grupo, a filha se desconcilia sozinha. */
  extratos: { extrato: EspOfx; valorAplicado: number; grupoId: string | null }[];
  grupoId: string | null;
  soma: number;
  diferenca: number;
  /** R4: a data do lançamento quando difere do dia dos extratos (na âncora do extrato). */
  lancadoEm: string | null;
  /** R5: os extratos da conta aplicam mais do que o lançamento vale. */
  sobreAplicado: boolean;
}

export interface DiaConf {
  data: string | null;
  pareados: Pareado[];
  paredosN1: ParedoN1[];
  extratosSemPar: EspOfx[];
  lancsSemPar: EspSis[];
  /**
   * ⚠ TRANSFERÊNCIA COM CONTA INTERNA NÃO É "SEM PAR" — PR-ESPELHO-07 item D. O banco
   * consolida a interna nesta conta e NÃO exporta o movimento entre as duas: cobrar par de
   * um movimento que o extrato nunca teve é alarme onde não havia como acertar, e alarme
   * assim ensina a ignorar o alarme. Ela sai do contador, sai da soma do dia e aparece no
   * fim com sinal próprio — visível, porque o dinheiro andou; fora da conta, porque o banco
   * não a mostra.
   */
  internas: EspSis[];
  /**
   * Os candidatos (previsto/agendado/programado) que VENCEM neste dia — PR-ESPELHO-CANDIDATOS-
   * POR-DATA-05.
   *
   * ⚠ ELES NÃO ENTRAM EM `banco` NEM EM `sistema`, e essa é a regra que o pool separado
   * protegia: candidato é SUGESTÃO, não realizado. Somá-lo no dia faria o fechamento deixar de
   * bater com o extrato — e "confere" é a afirmação mais cara desta tela.
   * ⚠ AGRUPAMENTO POR DATA, NÃO PAREAMENTO: o candidato entra no dia do vencimento dele porque
   * é ali que o operador procura, ao lado do movimento do banco do mesmo dia. Quem casa com
   * quem continua sendo decisão dele, na marcação.
   */
  candidatos: EspCandidato[];
  /**
   * O RESTO NÃO APLICADO DE UM REALIZADO — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (R5, decisão do Gabriel 03/10). O lançamento
   * diz um valor e os extratos desta conta aplicam menos: o aplicado fica no dia do extrato, e o resto vira "lançamento sem
   * par (resto)" no dia do LANÇAMENTO, somando — a diferença real, com o motivo "aplicado abaixo do lançamento".
   * Ver `lancamentosSubAplicados`. Só na âncora do extrato.
   */
  restos: RestoSemPar[];
  banco: number;
  sistema: number;
}

/** O resto de um sub-aplicado: o lançamento, quanto os extratos da conta aplicaram e quanto falta (magnitudes). */
export interface RestoSemPar { sis: EspSis; aplicado: number; resto: number; }

/**
 * ⚠ ENTRADAS ANTES DAS SAÍDAS, MAIORES PRIMEIRO — dentro de cada grupo do dia. A ordem não é
 * estética: quem confere um dia procura o valor grande primeiro, porque é o que explica a
 * diferença. Ordenar por data dentro do dia não ordenaria nada (é o mesmo dia).
 */
export function ordenar<T>(itens: T[], valor: (t: T) => number): T[] {
  const entradas = itens.filter((i) => valor(i) > 0).sort((a, b) => Math.abs(valor(b)) - Math.abs(valor(a)));
  const saidas = itens.filter((i) => valor(i) <= 0).sort((a, b) => Math.abs(valor(b)) - Math.abs(valor(a)));
  return [...entradas, ...saidas];
}

/**
 * A mesa: um dia por bloco, com os dois lados na mesma cronologia.
 *
 * ⚠ SEM PAR DOS DOIS LADOS FICA DENTRO DO DIA. A versão anterior empurrava os lançamentos sem
 * extrato para um bloco no fim da lista, e ali eles não conversavam com nada — o operador via
 * "falta alguém" sem ver ao lado de quê. Dentro do dia, o extrato órfão e o lançamento órfão
 * aparecem a três linhas um do outro, que é como se descobre que são o mesmo dinheiro.
 */
/**
 * Os quatro números do topo.
 *
 * ⚠ FUNÇÃO, E EXPORTADA, PARA PODER SER PROVADA. Isto era um cálculo solto no corpo do
 * componente, e foi por isso que ninguém percebeu que ele somava um conjunto diferente do
 * fechamento por dia logo abaixo: não havia onde escrever o teste que os compara. O
 * `internos` é o MESMO que a mesa recebe — é o que faz "o mesmo conjunto" ser verdade por
 * construção, e não por coincidência mantida à mão em dois lugares.
 */
export function totaisDoEspelho(data: EspelhadosReais, internos: ReadonlySet<string>) {
  const doSistema = data.sistema_completo.filter((s) => !internos.has(s.lancamento_id));
  const soma = (xs: number[], positivo: boolean) =>
    xs.filter((v) => (positivo ? v > 0 : v < 0)).reduce((a, v) => a + v, 0);
  const banco = data.ofx_completo.map((o) => o.valor);
  const sistema = doSistema.map((s) => s.valor_assinado);
  const entradasBanco = soma(banco, true);
  const entradasSistema = soma(sistema, true);
  const saidasBanco = soma(banco, false);
  const saidasSistema = soma(sistema, false);
  return {
    entradasBanco, entradasSistema, saidasBanco, saidasSistema,
    difEntradas: entradasBanco - entradasSistema,
    difSaidas: saidasBanco - saidasSistema,
  };
}

/**
 * O SINAL DE UM VALOR APLICADO — CONC-MESA-SINAL-01. É o do LANÇAMENTO na conta (`valor_assinado` de `sistema_completo`);
 * só sem ele (lançamento fora do recorte) cai no sinal do extrato, que era a regra de antes para todos.
 * ⚠ NASCE DE 2× AS DEDUÇÕES: o depósito de venda de grão casado em bloco (bruto + Senar + descontos; e, desde o
 *   MANDIOCA-RETENCAO-NF-01, a venda + o Funrural) põe no MESMO extrato lançamentos de sinal oposto. Com o sinal do extrato
 *   para todos, a dedução entrava somando: NJ Sicredi Lavoura 06/04 mostrava -51.982,66 (= 2 × 25.991,33) num dia em que o
 *   caixa do banco (`sistema_caixa`) fecha igual ao extrato. Os dados estavam certos; a mesa, não.
 * ⚠ UMA FUNÇÃO SÓ para a soma do dia (`montarMesa`) e para o desenho da filha: a dedução aparece negativa dentro do bloco
 *   do depósito pelo mesmo cálculo que a tira do total.
 */
export function sinalDoAplicado(sis: Pick<EspSis, 'valor_assinado'> | undefined, valorExtrato: number): number {
  if (sis && sis.valor_assinado !== 0 && Number.isFinite(sis.valor_assinado)) return Math.sign(sis.valor_assinado);
  return Math.sign(valorExtrato || 1);
}

/**
 * OS LANÇAMENTOS SOBRE-APLICADOS DA CONTA — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (R5, decisão do Gabriel 03/10).
 * Sobre-aplicado = a soma dos aplicados nos extratos DESTA conta (`ofx_completo`) passa do valor do lançamento. A
 * transferência com um vínculo por ponta (a outra ponta é extrato de OUTRA conta, fora de `ofx_completo`) NÃO entra.
 * ⚠ É ERRO DE DADO, e a mesa o mostra como diferença real (o dia soma por vínculo). O caixa do banco (`sistema_caixa`,
 *   CONC-CAIXA-PONTA-01) trata esses "como hoje" — valor cheio na data de pagamento — e por isso a igualdade dia a dia com
 *   ele os exclui, pelo MESMO conjunto que esta função devolve.
 */
export function lancamentosSobreAplicados(data: EspelhadosReais): Set<string> {
  const daConta = new Set(data.ofx_completo.map((o) => o.extrato_id));
  const aplicado = new Map<string, number>();
  for (const v of data.vinculos ?? []) {
    if (!daConta.has(v.extrato_id)) continue;
    aplicado.set(v.lancamento_id, (aplicado.get(v.lancamento_id) ?? 0) + Number(v.valor_aplicado ?? 0));
  }
  const sobre = new Set<string>();
  for (const s of data.sistema_completo) {
    const a = aplicado.get(s.lancamento_id);
    if (a !== undefined && a - Math.abs(s.valor_assinado) > 0.005) sobre.add(s.lancamento_id);
  }
  return sobre;
}

/**
 * A ÂNCORA DO N:1 — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (R1, "a data do banco manda", Gabriel 03/10).
 * - 'extrato' (o PADRÃO): todo movimento do banco fica no dia em que caiu e NENHUM extrato é consumido — os vínculos dele
 *   são as filhas, inclusive os dos blocos N×N (fecha a dívida CONC-MESA-NN-01). O N:1 (mãe = lançamento, filhas =
 *   extratos, o desenho do PR-ESPELHO-05) só sobrevive quando TODOS os extratos do lançamento caem no MESMO dia e nenhum
 *   deles tem outro lançamento; o dia soma os APLICADOS, como o caixa.
 * - 'lancamento' (a de antes, intacta): o N:1 vai para o dia do lançamento e consome os extratos. ⚠ SÓ o Extrato da
 *   planilha do Enriquecer a usa, e é dívida: o "Desmembrar" de lá depende do N:1 consumir as linhas da planilha.
 */
export type AncoraN1 = 'extrato' | 'lancamento';

/**
 * OS LANÇAMENTOS SUB-APLICADOS DA CONTA — o espelho de `lancamentosSobreAplicados` (R5, decisão do Gabriel 03/10).
 * Sub-aplicado = REALIZADO (todo `sistema_completo` é realizado: a RPC filtra `status_transacao = 'realizado'`), SEM
 * vínculo com extrato de OUTRA conta, com a soma dos aplicados nos extratos DESTA conta MENOR que o valor. Programado e
 * agendado parciais não estão aqui (não são `sistema_completo`; o caixa os trata pelo aplicado).
 * ⚠ É ERRO DE DADO (o lançamento diz 2,09 e o banco pagou 0,13): a mesa mostra o resto como diferença; o caixa
 *   (CONC-CAIXA-PONTA-01) o trata "como hoje" — valor cheio na data de pagamento —, e a igualdade com ele o exclui.
 */
export function lancamentosSubAplicados(data: EspelhadosReais): Map<string, { aplicado: number; resto: number }> {
  const daConta = new Set(data.ofx_completo.map((o) => o.extrato_id));
  const aplicado = new Map<string, number>();
  const foraDaConta = new Set<string>();
  for (const v of data.vinculos ?? []) {
    if (!daConta.has(v.extrato_id)) { foraDaConta.add(v.lancamento_id); continue; }
    aplicado.set(v.lancamento_id, (aplicado.get(v.lancamento_id) ?? 0) + Number(v.valor_aplicado ?? 0));
  }
  const sub = new Map<string, { aplicado: number; resto: number }>();
  for (const s of data.sistema_completo) {
    const a = aplicado.get(s.lancamento_id);
    if (a === undefined || foraDaConta.has(s.lancamento_id)) continue;
    const resto = Math.abs(s.valor_assinado) - a;
    if (resto > 0.005) sub.set(s.lancamento_id, { aplicado: a, resto: Math.round(resto * 100) / 100 });
  }
  return sub;
}

export function montarMesa(data: EspelhadosReais, internos: ReadonlySet<string>, opcoes: { ancoraN1?: AncoraN1 } = {}) {
  const ancoraN1: AncoraN1 = opcoes.ancoraN1 ?? 'extrato';
  const sobreAplicados = lancamentosSobreAplicados(data);
  const vinculos = data.vinculos ?? [];
  const sisPorId = new Map(data.sistema_completo.map((s) => [s.lancamento_id, s]));
  const extratosPorLanc = new Map<string, number>();
  for (const v of vinculos) extratosPorLanc.set(v.lancamento_id, (extratosPorLanc.get(v.lancamento_id) ?? 0) + 1);

  const porExtrato = new Map<string, EspVinculo[]>();
  for (const v of vinculos) {
    const l = porExtrato.get(v.extrato_id);
    if (l) l.push(v); else porExtrato.set(v.extrato_id, [v]);
  }
  /* ⚠ O VÍNCULO CONTA PARA A CONTA DO EXTRATO — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (decisão do Gabriel, 03/10). Na âncora
     do extrato, "tem vínculo" é ter vínculo com um extrato DESTA conta (`ofx_completo`). O lançamento vinculado só ao
     extrato de OUTRA conta (a meia transferência: a ponta de lá casada, a daqui solta) era tratado como casado e não era
     desenhado em lugar nenhum — sumia da Conferência. Agora é "lançamento sem par" aqui (R5), ao lado do extrato sem par.
     A transferência com as DUAS pontas casadas tem vínculo com um extrato de cada conta e continua casada nas duas.
     Na âncora antiga (o Extrato da planilha, D6) fica como era: qualquer vínculo. */
  const daConta = new Set(data.ofx_completo.map((o) => o.extrato_id));
  const comVinculo = new Set(vinculos
    .filter((v) => ancoraN1 === 'lancamento' || daConta.has(v.extrato_id))
    .map((v) => v.lancamento_id));

  const dias = new Map<string, DiaConf>();
  const dia = (d: string | null): DiaConf => {
    const k = d ?? 'sem-data';
    let atual = dias.get(k);
    if (!atual) { atual = { data: d, pareados: [], paredosN1: [], extratosSemPar: [], lancsSemPar: [], internas: [], candidatos: [], restos: [], banco: 0, sistema: 0 }; dias.set(k, atual); }
    return atual;
  };

  /* ⚠ O N:1 É DECIDIDO PELO VÍNCULO, NÃO PELO `grupo_id`. Um lançamento com dois vínculos
     ativos em extratos diferentes É um N:1, tenha ou não grupo — e os 9 casos antigos da
     base não têm. Ler o grupo primeiro deixaria esses nove desenhados como nove pares
     independentes que repetem o mesmo lançamento. */
  const porLanc = new Map<string, EspVinculo[]>();
  for (const v of vinculos) {
    const l = porLanc.get(v.lancamento_id);
    if (l) l.push(v); else porLanc.set(v.lancamento_id, [v]);
  }
  const ofxPorId = new Map(data.ofx_completo.map((o) => [o.extrato_id, o]));
  const consumidos = new Set<string>();

  porLanc.forEach((vs, lancId) => {
    if (vs.length < 2) return;
    const sis = sisPorId.get(lancId);
    if (!sis) return;
    const extratos = vs
      .map((v) => ({ extrato: ofxPorId.get(v.extrato_id), valorAplicado: Number(v.valor_aplicado ?? 0), grupoId: v.grupo_id }))
      .filter((x): x is { extrato: EspOfx; valorAplicado: number; grupoId: string | null } => !!x.extrato);
    if (extratos.length < 2) return;
    /* PR-CONC-CONFERENCIA-FECHAMENTO-DIA (D3): na âncora do extrato o bloco só fica se for do MESMO dia e PURO — nenhum
       extrato dele explica outro lançamento. Senão cada extrato vira linha no seu dia, com este lançamento entre as
       filhas ("parte de … · resto em …"), e nada some do dia. */
    if (ancoraN1 === 'extrato') {
      if (new Set(extratos.map((x) => x.extrato.data)).size !== 1) return;
      if (extratos.some((x) => (porExtrato.get(x.extrato.extrato_id) ?? []).some((v) => v.lancamento_id !== lancId))) return;
    }
    extratos.forEach((x) => consumidos.add(x.extrato.extrato_id));
    const soma = extratos.reduce((a, x) => a + x.valorAplicado, 0);
    const diaDosExtratos = extratos[0].extrato.data;
    const d = dia(ancoraN1 === 'extrato' ? diaDosExtratos : sis.data);
    /* D2: na âncora do extrato o dia recebe os APLICADOS (com o sinal do lançamento), como o caixa; na de antes, o valor do
       lançamento. Iguais quando o bloco aplica o lançamento inteiro. */
    d.sistema += ancoraN1 === 'extrato' ? sinalDoAplicado(sis, extratos[0].extrato.valor) * soma : sis.valor_assinado;
    d.paredosN1.push({
      sis, extratos,
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      soma,
      diferenca: soma - Math.abs(sis.valor_assinado),
      lancadoEm: sis.data && sis.data !== diaDosExtratos ? sis.data : null,
      sobreAplicado: sobreAplicados.has(lancId),
    });
  });

  /* As datas dos extratos DESTA conta que pagam cada lançamento — o "resto em DD/MM" da filha (D3). */
  const datasDoLanc = new Map<string, { extratoId: string; data: string | null }[]>();
  for (const v of vinculos) {
    const e = ofxPorId.get(v.extrato_id);
    if (!e) continue;
    const l = datasDoLanc.get(v.lancamento_id);
    if (l) l.push({ extratoId: e.extrato_id, data: e.data }); else datasDoLanc.set(v.lancamento_id, [{ extratoId: e.extrato_id, data: e.data }]);
  }

  for (const extrato of data.ofx_completo) {
    const d = dia(extrato.data);
    d.banco += extrato.valor;
    /* Já contado no banco do dia, mas desenhado dentro do bloco N:1 — não vira linha aqui. */
    if (consumidos.has(extrato.extrato_id)) continue;
    const vs = porExtrato.get(extrato.extrato_id) ?? [];
    if (vs.length === 0) { d.extratosSemPar.push(extrato); continue; }
    /* O aplicado é magnitude; o sinal é o do LANÇAMENTO (`sinalDoAplicado`), não o do extrato — a dedução de um depósito
       de venda casado em bloco entra negativa. `soma` segue na direção do extrato (a de sempre: diferença = |extrato| −
       soma, zero no bloco certo); o dia recebe a soma assinada. */
    const sinalExtrato = Math.sign(extrato.valor || 1);
    const somaAssinada = vs.reduce((a, v) =>
      a + sinalDoAplicado(sisPorId.get(v.lancamento_id), extrato.valor) * Number(v.valor_aplicado ?? 0), 0);
    const soma = sinalExtrato * somaAssinada;
    d.sistema += somaAssinada;
    d.pareados.push({
      extrato,
      filhas: vs.map((v) => {
        const sis = sisPorId.get(v.lancamento_id);
        /* D3: os OUTROS extratos desta conta que pagam o mesmo lançamento — o valor cheio e as datas deles */
        const outros = (datasDoLanc.get(v.lancamento_id) ?? []).filter((x) => x.extratoId !== extrato.extrato_id);
        const restoEm = [...new Set(outros.map((x) => x.data).filter((x): x is string => !!x))].sort();
        return {
          lancamento_id: v.lancamento_id,
          valor_aplicado: Number(v.valor_aplicado ?? 0),
          sis,
          deN: extratosPorLanc.get(v.lancamento_id) ?? 1,
          lancadoEm: sis?.data && sis.data !== extrato.data ? sis.data : null,
          parte: sis && outros.length > 0 ? { valorCheio: sis.valor_assinado, restoEm } : null,
          sobreAplicado: sobreAplicados.has(v.lancamento_id),
        };
      }),
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      tipoVencedor: vinculoVencedor(vs, (v) => v.tipo_aprovacao)?.tipo_aprovacao ?? null,
      soma,
      diferenca: Math.abs(extrato.valor) - Math.abs(soma),
      sobreAplicado: vs.some((v) => sobreAplicados.has(v.lancamento_id)),
    });
  }

  for (const s of data.sistema_completo) {
    if (comVinculo.has(s.lancamento_id)) continue;
    const d = dia(s.data);
    /* ⚠ FORA DA SOMA, E É O `continue` QUE FAZ O CABEÇALHO FECHAR. Medido em agosto/2026 no
       Bradesco do Agnaldo: as 17 transferências da Invest Fácil valem 1.206.567,85 de
       entrada e 1.022.515,14 de saída — exatamente a distância entre o sistema e o banco nos
       dois lados. Somá-las é comparar o que o banco tem com o que ele nunca exportou. */
    if (internos.has(s.lancamento_id)) { d.internas.push(s); continue; }
    d.lancsSemPar.push(s);
    d.sistema += s.valor_assinado;
  }

  /* R5: o resto não aplicado de um realizado, no dia do LANÇAMENTO, somando (a diferença real). Só na âncora do extrato. */
  if (ancoraN1 === 'extrato') {
    lancamentosSubAplicados(data).forEach(({ aplicado, resto }, lancId) => {
      const sis = sisPorId.get(lancId);
      if (!sis || internos.has(lancId)) return;
      const d = dia(sis.data);
      d.restos.push({ sis, aplicado, resto });
      d.sistema += Math.sign(sis.valor_assinado || 1) * resto;
    });
  }

  /**
   * ⚠ O RECORTE É VENCIDO × A VENCER — PR-ESPELHO-VENCIDOS-NO-TOPO-08, e ele SUBSTITUI o
   * critério anterior ("tem dia no extrato ou não"), de PR-ESPELHO-CANDIDATOS-POR-DATA-05.
   *
   * O critério antigo misturava duas coisas numa faixa só: o agendado de 25/09 (futuro, 591 mil)
   * caía ao lado do previsto vencido de 05/06, porque nenhum dos dois tinha movimento do banco
   * na sua data — e a faixa ordenava por valor, então o futuro aparecia ACIMA do atrasado. Ter
   * ou não OFX no mesmo dia é acidente do extrato; vencer ou não é fato do lançamento, e é o
   * que o operador decide em cima.
   *
   * ⚠ A VENCER CRIA O DIA (`dia()`, não `dias.get`): o agendado de 25/09 vira um bloco próprio,
   * na posição cronológica do corpo, mesmo sem nenhum movimento do banco naquela data. Era
   * justamente o que o critério antigo impedia.
   * ⚠ VENCIDO NÃO ENTRA EM DIA NENHUM: ele é do passado e não pertence ao fluxo deste mês —
   * vai para a faixa do topo, onde o render o mostra sob demanda.
   * ⚠ E NADA DISSO SOMA em `d.banco`/`d.sistema`: candidato segue fora do subtotal, como desde
   * o primeiro PR. O "confere" dos dias com OFX não muda.
   */
  for (const c of data.sistema_candidatos ?? []) {
    if (c.vencido) continue;
    dia(c.data_vencimento).candidatos.push(c);
  }

  const lista = [...dias.values()].sort((a, b) => (a.data ?? '') < (b.data ?? '') ? -1 : (a.data ?? '') > (b.data ?? '') ? 1 : 0);
  for (const d of lista) {
    d.pareados = ordenar(d.pareados, (p) => p.extrato.valor);
    d.paredosN1 = ordenar(d.paredosN1, (p) => p.sis.valor_assinado);
    d.extratosSemPar = ordenar(d.extratosSemPar, (e) => e.valor);
    d.lancsSemPar = ordenar(d.lancsSemPar, (s) => s.valor_assinado);
    d.internas = ordenar(d.internas, (s) => s.valor_assinado);
    /* ⚠ A MESMA `ordenar` DAS OUTRAS CINCO — PR-ESPELHO-CANDIDATOS-ORDEM-06. Os candidatos
       vinham na ordem crua da RPC (por vencimento), e dentro de um DIA o vencimento é o mesmo
       para todos: a ordem virava acaso. Na Vera, 04/09, isso punha −33,61 acima de −12.000,00.
       ⚠ E É `ordenar`, NÃO UM COMPARADOR NOVO: entrada antes de saída, cada grupo do maior para
       o menor. Um segundo critério aqui faria a lista do sistema mudar de regra no meio do
       mesmo dia — o candidato numa ordem, o lançamento sem par logo acima noutra. */
    d.candidatos = ordenar(d.candidatos, (c) => c.valor_assinado);
    d.restos = ordenar(d.restos, (r) => Math.sign(r.sis.valor_assinado || 1) * r.resto);
  }
  return lista;
}
