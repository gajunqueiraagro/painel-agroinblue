/**
 * O ORÁCULO DA MESA DE ANTES — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (testes e prova; nada de produção importa isto).
 *
 * `montarMesa` e os tipos dela COMO ESTAVAM no HEAD 6ccd86e9 (`EspelhoConciliacaoTab.tsx`), copiados byte a byte; só os
 * nomes mudaram (sufixo `Antes`) para conviver com os novos. Serve a duas provas: o T8 (a âncora antiga da lib, a do
 * Extrato da planilha, tem a MESMA saída que isto) e a varredura antes × depois do relatório.
 */
import type { EspOfx } from '@/components/conciliacao/TabelaExtratoDoMes';
import { vinculoVencedor } from '@/v2/lib/origemLancamento';
import { ordenar, sinalDoAplicado, type EspCandidato, type EspelhadosReais, type EspSis, type EspVinculo } from '@/lib/conciliacao/mesaDoDia';

interface FilhaConfAntes { lancamento_id: string; valor_aplicado: number; sis?: EspSis; deN: number; }
interface PareadoAntes {
  extrato: EspOfx; filhas: FilhaConfAntes[]; grupoId: string | null;
  tipoVencedor: string | null; soma: number; diferenca: number;
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
interface ParedoN1Antes {
  sis: EspSis;
  /* `grupoId` do VÍNCULO de cada extrato (CONC-N1-DESCONCILIAR-01): sem grupo, a filha se desconcilia sozinha. */
  extratos: { extrato: EspOfx; valorAplicado: number; grupoId: string | null }[];
  grupoId: string | null;
  soma: number;
  diferenca: number;
}

export interface DiaConfAntes {
  data: string | null;
  pareados: PareadoAntes[];
  paredosN1: ParedoN1Antes[];
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
  banco: number;
  sistema: number;
}


export function montarMesaAntes(data: EspelhadosReais, internos: ReadonlySet<string>) {
  const vinculos = data.vinculos ?? [];
  const sisPorId = new Map(data.sistema_completo.map((s) => [s.lancamento_id, s]));
  const extratosPorLanc = new Map<string, number>();
  for (const v of vinculos) extratosPorLanc.set(v.lancamento_id, (extratosPorLanc.get(v.lancamento_id) ?? 0) + 1);

  const porExtrato = new Map<string, EspVinculo[]>();
  for (const v of vinculos) {
    const l = porExtrato.get(v.extrato_id);
    if (l) l.push(v); else porExtrato.set(v.extrato_id, [v]);
  }
  const comVinculo = new Set(vinculos.map((v) => v.lancamento_id));

  const dias = new Map<string, DiaConfAntes>();
  const dia = (d: string | null): DiaConfAntes => {
    const k = d ?? 'sem-data';
    let atual = dias.get(k);
    if (!atual) { atual = { data: d, pareados: [], paredosN1: [], extratosSemPar: [], lancsSemPar: [], internas: [], candidatos: [], banco: 0, sistema: 0 }; dias.set(k, atual); }
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
    extratos.forEach((x) => consumidos.add(x.extrato.extrato_id));
    const soma = extratos.reduce((a, x) => a + x.valorAplicado, 0);
    const d = dia(sis.data);
    d.sistema += sis.valor_assinado;
    d.paredosN1.push({
      sis, extratos,
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      soma,
      diferenca: soma - Math.abs(sis.valor_assinado),
    });
  });

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
      filhas: vs.map((v) => ({
        lancamento_id: v.lancamento_id,
        valor_aplicado: Number(v.valor_aplicado ?? 0),
        sis: sisPorId.get(v.lancamento_id),
        deN: extratosPorLanc.get(v.lancamento_id) ?? 1,
      })),
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      tipoVencedor: vinculoVencedor(vs, (v) => v.tipo_aprovacao)?.tipo_aprovacao ?? null,
      soma,
      diferenca: Math.abs(extrato.valor) - Math.abs(soma),
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
  }
  return lista;
}
