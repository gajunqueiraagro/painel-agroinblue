import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { ocorrenciaEstimada, type OcorrenciaDoMes, type CompetenciaCancelada } from '@/lib/financeiro/recorrenciasDoMes';

/**
 * useRecorrencias — as regras de repetição e o que elas já produziram.
 * FIN-RECORRENCIA-01, Tempo 1.
 *
 * ⚠ A ÂNCORA SÃO DUAS DATAS, E NÃO HÁ CAMPO DE DESLOCAMENTO. `data_inicio` é a
 * competência do primeiro lançamento e `primeiro_vencimento` é o vencimento real
 * dele; a distância entre as duas é o que a geração preserva mês a mês. Uma
 * terceira cópia — um `offset_meses` gravado — poderia discordar das duas, e
 * seria o segundo lugar onde a mesma verdade mora.
 *
 * ⚠ O ESTADO É DERIVADO, NUNCA COLUNA. `proximaCompetencia` sai da marca d'água,
 * `situacao` sai de `ativo` mais a comparação da marca com `data_fim`, e
 * `gerados` é contagem. Gravá-los criaria três campos que envelhecem sozinhos —
 * exatamente o que esta casa já caçou cinco vezes nesta frente.
 */

export type SituacaoRecorrencia = 'ativa' | 'concluida' | 'cancelada';

export interface Recorrencia {
  id: string;
  descricao: string;
  favorecidoId: string | null;
  favorecidoNome: string | null;
  contaBancariaId: string;
  subcentro: string;
  safraId: string | null;
  formaPagamento: string | null;
  observacao: string | null;
  valorBase: number;
  tipoOperacao: string | null;
  diaVencimento: number;
  dataInicio: string;
  primeiroVencimento: string;
  dataFim: string;
  ativo: boolean;
  ultimoLancamentoGerado: string | null;
  fazendaId: string;
  /** REC-VALOR-CERTO-01 — `tipo_valor = 'estimado'` no banco: o valor base é estimativa até o valor do mês ser informado. */
  valorAConfirmar: boolean;
  /** REC-VALOR-CERTO-01 — folha de pagamento (atributo da regra). */
  folha: boolean;
  /** Derivados — leitura, não coluna. */
  proximaCompetencia: string | null;
  situacao: SituacaoRecorrencia;
  gerados: number;
}

/**
 * ⚠ O DESLOCAMENTO É LIDO, NÃO GRAVADO — a mesma conta que a RPC faz, para a
 * tela poder narrar o que vai acontecer. Meses inteiros entre os dois meses das
 * datas âncora; negativo é válido e significa pagamento adiantado.
 */
export function deslocamentoMeses(dataInicio: string, primeiroVencimento: string): number {
  const [ai, mi] = dataInicio.slice(0, 7).split('-').map(Number);
  const [av, mv] = primeiroVencimento.slice(0, 7).split('-').map(Number);
  return (av - ai) * 12 + (mv - mi);
}

const MES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * DE QUE MÊS É O QUE SE PAGA — a pergunta que substituiu a digitação da data.
 *
 * ⚠ SÃO DUAS RESPOSTAS, NÃO UM NÚMERO. A água consumida em agosto vence em
 * setembro, e o fato econômico é agosto. O operador responde de quem é a conta,
 * que é o que ele sabe; a mecânica — âncora, deslocamento, primeiro vencimento —
 * não aparece em campo nenhum.
 *
 * ⚠ E O QUE ISSO CUSTA, dito às claras: com dois cartões, a tela só declara
 * deslocamento 0 ou 1. Uma regra paga dois meses depois deixa de ser
 * cadastrável por aqui. O banco continua aceitando qualquer distância — quem
 * perdeu o alcance foi a tela, não a âncora. Medido antes de trocar: as duas
 * recorrências existentes no Proto têm deslocamento 1, e nenhuma é reescrita
 * por isto. Se o caso de dois meses aparecer, vira um terceiro cartão.
 */
export type MesDoFato = 'proprio' | 'anterior';

export const DESLOCAMENTO: Record<MesDoFato, number> = { proprio: 0, anterior: 1 };

/**
 * O vencimento do primeiro lançamento, derivado no submit — nunca digitado e
 * nunca gravado como deslocamento.
 *
 * ⚠ O APARO DE FIM DE MÊS é calendário, não régua da casa: dia 31 em fevereiro
 * não existe, e o menor entre o dia pretendido e o último daquele mês é o
 * Gregoriano, não uma segunda verdade sobre a recorrência.
 */
export function primeiroVencimentoDe(
  dataInicioIso: string, diaVencimento: number, mesDoFato: MesDoFato,
): string {
  const [ano, mes] = dataInicioIso.slice(0, 7).split('-').map(Number);
  const alvo = mes + DESLOCAMENTO[mesDoFato];
  const anoAlvo = ano + Math.floor((alvo - 1) / 12);
  const mesAlvo = ((alvo - 1) % 12) + 1;
  /* Dia 0 do mês seguinte = último dia do mês alvo. */
  const ultimoDia = new Date(Date.UTC(anoAlvo, mesAlvo, 0)).getUTCDate();
  const dia = Math.min(Math.max(diaVencimento, 1), ultimoDia);
  return `${anoAlvo}-${String(mesAlvo).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** O caminho de volta: qual cartão representa a regra já gravada. */
export function mesDoFatoDe(dataInicioIso: string, primeiroVencimentoIso: string): MesDoFato {
  return deslocamentoMeses(dataInicioIso, primeiroVencimentoIso) >= 1 ? 'anterior' : 'proprio';
}

/**
 * O RESUMO VIVO — a explicação do deslocamento em português.
 *
 * ⚠ ELE É A ÚNICA EXPLICAÇÃO QUE O OPERADOR RECEBE, e por isso existe: sem campo
 * de offset na tela, a relação entre as três datas fica implícita. A frase a
 * torna explícita ANTES de gravar — "consumo de setembro, pago em 10 de outubro;
 * repete até fev/27" — e quem lê confere a intenção, não a mecânica.
 */
export function resumoVivo(
  /* ⚠ O DIA SAIU DA ASSINATURA: ele agora vem dentro de `primeiroVencimento`,
     já aparado. Recebê-lo de novo abriria a chance de a frase mostrar um dia e
     a gravação usar outro. */
  dataInicio: string, primeiroVencimento: string, dataFim: string,
): string | null {
  if (!dataInicio || !primeiroVencimento || !dataFim) return null;
  const [, mi] = dataInicio.slice(0, 7).split('-').map(Number);
  const [, mv, dv] = primeiroVencimento.slice(0, 10).split('-').map(Number);
  const desl = deslocamentoMeses(dataInicio, primeiroVencimento);
  const [af, mf] = dataFim.slice(0, 7).split('-').map(Number);
  const consumo = MES_EXT[mi - 1];
  /* ⚠ O MÊS DO PAGAMENTO VAI NOMEADO, não "do mês seguinte". Enquanto a data
     era digitada, o relativo bastava; agora que ela é DERIVADA do cartão, o
     operador precisa ver o mês concreto para conferir se o cartão que escolheu
     é o que ele queria. "Pago em 5 de outubro" se confere; "pago em 5 do mês
     seguinte" repete o cartão em outras palavras.
     ⚠ E O DIA VAI O DERIVADO, não o pretendido: em mês curto o aparo já
     aconteceu, e mostrar 31 quando o lançamento nasce dia 28 seria a frase
     desmentindo o que vai ser gravado. */
  const pago = desl === 0
    ? `pago em ${dv} do mesmo mês (${MES_EXT[mv - 1]})`
    : `pago em ${dv} de ${MES_EXT[mv - 1]}`;
  return `Consumo de ${consumo}, ${pago}; repete até ${MES_CURTO[mf - 1]}/${String(af).slice(2)}.`;
}

/** A próxima competência: o mês seguinte à marca d'água, ou o início se nunca gerou. */
function proximaDaMarca(ultimo: string | null, dataInicio: string, dataFim: string): string | null {
  if (!ultimo) return dataInicio.slice(0, 7) + '-01';
  const [a, m] = ultimo.slice(0, 7).split('-').map(Number);
  const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  /* Passou do fim: não há próxima — a regra cumpriu o que prometeu. */
  return prox.slice(0, 7) > dataFim.slice(0, 7) ? null : prox;
}

export function useRecorrencias() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) { setRecorrencias([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('financeiro_recorrencias')
        .select('*, financeiro_fornecedores(nome)')
        .eq('cliente_id', clienteId)
        .order('descricao');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas, fora de types.ts
      const rows: any[] = data ?? [];
      if (rows.length === 0) { setRecorrencias([]); return; }

      /* ⚠ UMA CONSULTA PARA O CONJUNTO, nunca uma por regra: a contagem do que
         cada uma gerou vem em lote pelos ids já carregados. */
      const { data: gerados } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('recorrencia_id')
        .in('recorrencia_id', rows.map(r => r.id))
        .eq('cancelado', false);
      const porRegra: Record<string, number> = {};
      for (const g of (gerados ?? []) as { recorrencia_id: string }[]) {
        porRegra[g.recorrencia_id] = (porRegra[g.recorrencia_id] ?? 0) + 1;
      }

      setRecorrencias(rows.map(r => {
        const prox = proximaDaMarca(r.ultimo_lancamento_gerado, r.data_inicio, r.data_fim);
        /* ⚠ CANCELADA VENCE CONCLUÍDA: uma regra desligada no meio do caminho não
           é uma regra que terminou o trabalho, e o operador precisa ver a
           diferença. */
        const situacao: SituacaoRecorrencia =
          !r.ativo ? 'cancelada' : prox === null ? 'concluida' : 'ativa';
        return {
          id: r.id,
          descricao: r.descricao,
          favorecidoId: r.favorecido_id ?? null,
          favorecidoNome: r.financeiro_fornecedores?.nome ?? null,
          contaBancariaId: r.conta_bancaria_id,
          subcentro: r.subcentro,
          safraId: r.safra_id ?? null,
          formaPagamento: r.forma_pagamento ?? null,
          observacao: r.observacao ?? null,
          valorBase: Number(r.valor_base ?? 0),
          tipoOperacao: r.tipo_operacao ?? null,
          diaVencimento: Number(r.dia_vencimento ?? 1),
          dataInicio: r.data_inicio,
          primeiroVencimento: r.primeiro_vencimento,
          dataFim: r.data_fim,
          ativo: r.ativo === true,
          ultimoLancamentoGerado: r.ultimo_lancamento_gerado ?? null,
          fazendaId: r.fazenda_id,
          valorAConfirmar: r.tipo_valor === 'estimado',
          folha: r.folha === true,
          proximaCompetencia: prox,
          situacao,
          gerados: porRegra[r.id] ?? 0,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { recorrencias, loading, recarregar: carregar, clienteId };
}

/**
 * AS OCORRÊNCIAS VIVAS QUE VENCEM NUM MÊS — REC-VALOR-CERTO-01. O que o dono do mês (`recorrenciasDoMes.ts`) precisa para
 * dizer o valor e a situação de cada recorrência: uma consulta por mês, pelo VENCIMENTO.
 * ⚠ `(supabase as any).from`: `valor_do_mes_em` nasceu depois do `types.ts` (REC-PROPAGAR-VALOR-DO-MES-01) — o idioma do
 *   `RecorrenciaDialog`, que grava a regra do mesmo jeito. As linhas são lidas campo a campo, sem `as`.
 * ⚠ `incompleto` QUANDO A RESPOSTA BATE NO TETO DE 1.000: a tela diz que o mês pode estar cortado em vez de somar calada
 *   (medido em 06/10/2026: o maior mês do proto tem 99 ocorrências).
 */
export const TETO_OCORRENCIAS_DO_MES = 1000;
/** Quantos meses para trás do mês pedido se leem as competências canceladas (o deslocamento competência -> vencimento cabe com folga). */
const MESES_DE_CANCELADAS = 12;
export function useOcorrenciasDoMes(clienteId: string | null, mes: string) {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaDoMes[]>([]);
  /* RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01: o dono do mês precisa distinguir "competência cancelada" (não é previsão) de
     "competência nunca gerada" (aparece como NÃO GERADO), e saber quais meses estão fechados (o motivo). */
  const [canceladas, setCanceladas] = useState<CompetenciaCancelada[]>([]);
  const [mesesFechados, setMesesFechados] = useState<string[]>([]);
  const [incompleto, setIncompleto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const carregar = useCallback(async () => {
    if (!clienteId || !/^\d{4}-\d{2}$/.test(mes)) { setOcorrencias([]); setCanceladas([]); setMesesFechados([]); setIncompleto(false); return; }
    const [a, m] = mes.split('-').map(Number);
    const fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const tras = a * 12 + (m - 1) - MESES_DE_CANCELADAS;
    const desde = `${Math.floor(tras / 12)}-${String((tras % 12) + 1).padStart(2, '0')}-01`;
    setCarregando(true);
    try {
      const [vivas, mortas, fechados] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna fora de types.ts; idioma do RecorrenciaDialog
        (supabase as any)
          .from('financeiro_lancamentos_v2')
          .select('recorrencia_id, valor, data_vencimento, status_transacao, valor_do_mes_em')
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
          .not('recorrencia_id', 'is', null)
          .gte('data_vencimento', `${mes}-01`)
          .lte('data_vencimento', fim)
          .limit(TETO_OCORRENCIAS_DO_MES),
        supabase
          .from('financeiro_lancamentos_v2')
          .select('recorrencia_id, data_competencia')
          .eq('cliente_id', clienteId)
          .eq('cancelado', true)
          .not('recorrencia_id', 'is', null)
          .gte('data_competencia', desde)
          .lte('data_competencia', fim)
          .limit(TETO_OCORRENCIAS_DO_MES),
        supabase
          .from('financeiro_fechamentos')
          .select('ano_mes')
          .eq('cliente_id', clienteId)
          .eq('status_fechamento', 'fechado'),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas
      const linhas: any[] = Array.isArray(vivas.data) ? vivas.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas
      const canc: any[] = Array.isArray(mortas.data) ? mortas.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas
      const fech: any[] = Array.isArray(fechados.data) ? fechados.data : [];
      setIncompleto(linhas.length >= TETO_OCORRENCIAS_DO_MES || canc.length >= TETO_OCORRENCIAS_DO_MES);
      setOcorrencias(linhas.map(lerOcorrencia));
      setCanceladas(canc
        .map((c) => ({ recorrenciaId: String(c?.recorrencia_id ?? ''), competencia: typeof c?.data_competencia === 'string' ? c.data_competencia : '' }))
        .filter((c) => c.recorrenciaId !== '' && c.competencia !== ''));
      setMesesFechados(fech.map((f) => String(f?.ano_mes ?? '')).filter((x) => x !== ''));
    } finally {
      setCarregando(false);
    }
  }, [clienteId, mes]);
  useEffect(() => { void carregar(); }, [carregar]);
  return { ocorrencias, canceladas, mesesFechados, incompleto, carregando, recarregar: carregar };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha crua do PostgREST
export const lerOcorrencia = (l: any): OcorrenciaDoMes => ({
  recorrenciaId: String(l?.recorrencia_id ?? ''),
  valor: Number(l?.valor ?? 0),
  dataVencimento: typeof l?.data_vencimento === 'string' ? l.data_vencimento : null,
  status: typeof l?.status_transacao === 'string' ? l.status_transacao : null,
  valorDoMesEm: typeof l?.valor_do_mes_em === 'string' ? l.valor_do_mes_em : null,
});

/**
 * OS LANÇAMENTOS AINDA ESTIMADOS DE UM CLIENTE — REC-VALOR-CERTO-02. O que Contas a Pagar e Receber precisa para dizer "isto é
 * estimativa": o conjunto de ids de lançamento cuja ocorrência a regra única (`ocorrenciaEstimada`) julga estimada.
 * ⚠ DUAS LEITURAS POR CLIENTE, NUNCA POR LINHA: (1) os ids das recorrências A CONFIRMAR (`tipo_valor = 'estimado'`); (2) SÓ se
 *   houver alguma, as ocorrências vivas delas (id, status, marca do valor do mês). Sem recorrência a confirmar — o estado do
 *   proto em 06/10/2026 — a segunda leitura NÃO acontece.
 * ⚠ POR QUE NÃO É "A MESMA CONSULTA" DA CPR: ela lê a view `vw_financeiro_lancamentos_v2_doc`, que não expõe `recorrencia_id` nem
 *   `valor_do_mes_em` (medido). Mudar a view é banco; isto é só tela.
 * ⚠ `incompleto` quando a segunda leitura bate no teto: quem chama diz, em vez de classificar calado.
 */
export const TETO_OCORRENCIAS_ESTIMADAS = 5000;
export async function lerEstimadasDoCliente(clienteId: string): Promise<{ ids: Set<string>; incompleto: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `tipo_valor`/`valor_do_mes_em` fora de types.ts; idioma do RecorrenciaDialog
  const cliente = supabase as any;
  const { data: regras, error: e1 } = await cliente.from('financeiro_recorrencias')
    .select('id').eq('cliente_id', clienteId).eq('tipo_valor', 'estimado');
  if (e1) throw e1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas
  const idsDasRegras: string[] = (Array.isArray(regras) ? regras : []).map((r: any) => String(r?.id ?? '')).filter(Boolean);
  if (idsDasRegras.length === 0) return { ids: new Set(), incompleto: false };
  const { data, error: e2 } = await cliente.from('financeiro_lancamentos_v2')
    .select('id, recorrencia_id, valor, data_vencimento, status_transacao, valor_do_mes_em')
    .eq('cliente_id', clienteId).eq('cancelado', false).in('recorrencia_id', idsDasRegras)
    .range(0, TETO_OCORRENCIAS_ESTIMADAS - 1);
  if (e2) throw e2;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas
  const linhas: any[] = Array.isArray(data) ? data : [];
  return { ids: idsEstimados(linhas), incompleto: linhas.length >= TETO_OCORRENCIAS_ESTIMADAS };
}

/** Das ocorrências vivas de recorrências A CONFIRMAR, os ids que a regra única julga estimados. Pura: é o que o teste exercita. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas do PostgREST
export function idsEstimados(linhas: readonly any[]): Set<string> {
  const ids = new Set<string>();
  for (const l of linhas) {
    const o = lerOcorrencia(l);
    const id = String(l?.id ?? '');
    if (id && ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: o.valorDoMesEm, status: o.status })) ids.add(id);
  }
  return ids;
}

/**
 * O QUE SE PROPAGA — REC-VALOR-CERTO-01. O tipo do valor (certo | a confirmar) e a folha são atributos da REGRA: trocá-los
 * não altera lançamento nenhum e NÃO abre a pergunta do Propagar. Só os campos que o Propagar leva aos lançamentos contam.
 */
export type CampoQueSePropaga = 'fazenda_id' | 'descricao' | 'favorecido_id' | 'conta_bancaria_id' | 'subcentro' | 'safra_id'
  | 'forma_pagamento' | 'observacao' | 'valor_base' | 'dia_vencimento' | 'data_inicio' | 'primeiro_vencimento' | 'data_fim';
export type PayloadDaRegra = Record<CampoQueSePropaga, string | number | null>
  & { cliente_id: string; tipo_valor: 'exato' | 'estimado'; folha: boolean };
export function mudouOQueSePropaga(ed: Recorrencia, p: PayloadDaRegra): boolean {
  const data = (d: string | null) => (d ? d.slice(0, 10) : null);
  return ed.fazendaId !== p.fazenda_id || ed.descricao !== p.descricao || (ed.favorecidoId ?? null) !== p.favorecido_id
    || ed.contaBancariaId !== p.conta_bancaria_id || ed.subcentro !== p.subcentro || (ed.safraId ?? null) !== p.safra_id
    || (ed.formaPagamento ?? null) !== p.forma_pagamento || (ed.observacao ?? null) !== p.observacao
    || Math.round(ed.valorBase * 100) !== Math.round(Number(p.valor_base) * 100) || ed.diaVencimento !== Number(p.dia_vencimento)
    || data(ed.dataInicio) !== p.data_inicio || data(ed.primeiroVencimento) !== p.primeiro_vencimento || data(ed.dataFim) !== p.data_fim;
}

/**
 * PRÉVIA E EXECUÇÃO SÃO A MESMA CHAMADA — só `p_simular` muda.
 *
 * ⚠ E é o ponto: uma prévia que responde por um caminho e grava por outro pode
 * prometer N e entregar M. Aqui a pergunta é literalmente a mesma; a diferença é
 * se o banco confirma a transação.
 */
/** Uma competência VAGA que o Gerar preenche abaixo da marca — FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01. */
export interface VagaRecorrencia { competencia: string; vencimento: string }

/* ⚠ LIDA CAMPO A CAMPO, sem `as`: o que não tiver a forma esperada vira lista vazia, nunca uma vaga inventada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
const lerVagas = (v: any): VagaRecorrencia[] => (Array.isArray(v) ? v : [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  .map((x: any) => ({ competencia: String(x?.competencia ?? ''), vencimento: String(x?.vencimento ?? '') }))
  .filter((x) => x.competencia !== '');

/** "preenche 12/26 (venc 05/01/27)" — a MESMA frase no Gerar e na prévia da propagação. */
export const textoVagas = (vagas: readonly VagaRecorrencia[]): string =>
  'preenche ' + vagas.map((v) => {
    const c = v.competencia.length >= 7 ? `${v.competencia.slice(5, 7)}/${v.competencia.slice(2, 4)}` : v.competencia;
    const d = v.vencimento.length >= 10 ? `${v.vencimento.slice(8, 10)}/${v.vencimento.slice(5, 7)}/${v.vencimento.slice(2, 4)}` : '—';
    return `${c} (venc ${d})`;
  }).join(', ');

/**
 * O que o Gerar NÃO criou, com o motivo — RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 (Gabriel, 10/10/2026): o sistema nunca omite
 * em silêncio. Hoje o único motivo é "mês fechado"; quem o escreve é o banco (`fn_recorrencia_gerar`, chave `nao_gerados`).
 */
export interface NaoGeradoRecorrencia { competencia: string; vencimento: string; motivo: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
const lerNaoGerados = (v: any): NaoGeradoRecorrencia[] => (Array.isArray(v) ? v : [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  .map((x: any) => ({ competencia: String(x?.competencia ?? ''), vencimento: String(x?.vencimento ?? ''), motivo: String(x?.motivo ?? '') }))
  .filter((x) => x.competencia !== '');

const mesAno = (comp: string): string => (comp.length >= 7 ? `${comp.slice(5, 7)}/${comp.slice(2, 4)}` : comp);
const diaMesAno = (d: string): string => (d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—');

/** "não gerado: 08/26 (venc 10/09/26) — mês fechado"; vários, separados por vírgula. Sem motivo do banco: "sem motivo informado". */
export const textoNaoGerados = (lista: readonly NaoGeradoRecorrencia[]): string =>
  'não gerado: ' + lista.map((n) => `${mesAno(n.competencia)} (venc ${diaMesAno(n.vencimento)}) — ${n.motivo || 'sem motivo informado'}`).join(', ');

/** "gerou 12: 07/26 a 06/27" · "gerou 1: 07/26" · sem as pontas (RPC antiga) "gerou 3" · zero: a frase de sempre. */
export const FRASE_NADA_A_GERAR = 'Nada a gerar — este horizonte já está todo lançado.';
export function textoDoGerado(r: { gerados: number; geradoDe: string | null; geradoAte: string | null }): string {
  if (r.gerados <= 0) return FRASE_NADA_A_GERAR;
  if (!r.geradoDe || !r.geradoAte) return `gerou ${r.gerados}`;
  return r.geradoDe === r.geradoAte ? `gerou ${r.gerados}: ${mesAno(r.geradoDe)}` : `gerou ${r.gerados}: ${mesAno(r.geradoDe)} a ${mesAno(r.geradoAte)}`;
}

export interface RespostaDoGerar {
  ok: boolean; gerados: number; de: string | null; ate: string | null; vagas: VagaRecorrencia[];
  /** A primeira e a última competência criadas (ou que a simulação criaria), 'AAAA-MM' — meses passados inclusive. */
  geradoDe: string | null; geradoAte: string | null;
  naoGerados: NaoGeradoRecorrencia[];
  erro: string | null;
}

export async function gerarRecorrencia(recorrenciaId: string, ate: string | null, simular: boolean): Promise<RespostaDoGerar> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_recorrencia_gerar', {
    p_recorrencia_id: recorrenciaId,
    p_ate: ate,
    p_simular: simular,
  });
  if (error) return { ok: false, gerados: 0, de: null, ate: null, vagas: [], geradoDe: null, geradoAte: null, naoGerados: [], erro: error.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  const r: any = data ?? {};
  return {
    ok: r.ok !== false, gerados: Number(r.gerados ?? 0), de: r.de ?? null, ate: r.ate ?? null,
    vagas: lerVagas(r.vagas),
    geradoDe: typeof r.gerado_de === 'string' ? r.gerado_de : null,
    geradoAte: typeof r.gerado_ate === 'string' ? r.gerado_ate : null,
    naoGerados: lerNaoGerados(r.nao_gerados), erro: null,
  };
}

/** Até onde a edição da regra alcança os lançamentos que ela gerou. */
export type EscopoPropagacao = 'futuros' | 'todos' | 'nenhum';

/** Um lançamento cuja competência a regra recalcula (datas ISO). */
export interface CompetenciaRecalculada { lancamentoId: string; venc: string; compAntiga: string | null; compNova: string }

/** O que muda na competência — FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01. Tudo vem do banco. */
export interface CompetenciaPropagacao {
  /** Por grupo (futuros / passados), independente do escopo escolhido: quantas mudam, quantas o mês fechado pula. */
  grupos: Record<'futuros' | 'passados', { alteradas: number; puladasMesFechado: number; lista: CompetenciaRecalculada[] }>;
  /** Meses fechados (`financeiro_fechamentos`) que fizeram pular algum lançamento, 'YYYY-MM'. */
  mesesFechados: string[];
  marcaAntes: string | null;
  /** O que cada escopo faria: quantas mudam, a marca resultante, o que o próximo gerar cria, competência repetida. */
  projecao: Record<'futuros' | 'todos', {
    alteradas: number; marcaDepois: string | null; aGerar: string[]; duplicidades: { competencia: string; n: number }[];
    /** fix2: a colisão real, em frase pronta do banco — o mesmo texto com que a execução recusa. `null` = sem colisão. */
    aviso: string | null;
    /** As vagas que o próximo Gerar preenche abaixo da marca resultante (mesma função do banco que grava). */
    vagas: VagaRecorrencia[];
  }>;
  /** Só na execução: quantas foram gravadas. */
  aplicadas: number | null;
}

export interface ResultadoPropagacao {
  /** Quantos se enquadram em cada grupo — a contagem é do banco, nunca da tela. */
  futuros: number;
  passados: number;
  aplicadosFuturos: number;
  aplicadosPassados: number;
  simulado: boolean;
  /** Ausente quando a RPC é anterior à FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01. */
  competencia: CompetenciaPropagacao | null;
  /**
   * REC-PROPAGAR-VALOR-DO-MES-01 — quantas ocorrências com o VALOR DO MÊS ajustado (planilha ou à mão) cada escopo PULA: o
   * Propagar não toca nenhum campo delas. Contagem do banco, pelo predicado do próprio update; zero quando a RPC é anterior.
   */
  valorDoMes: Record<'futuros' | 'todos', number>;
  /** As que o escopo PEDIDO pulou (na execução) ou pularia (na simulação). */
  puladasValorDoMes: number;
}

/* ⚠ O JSON DA RPC SE LÊ CAMPO A CAMPO, sem `as`: o que não tiver a forma esperada vira vazio/zero, nunca um
   objeto de outro formato fingindo ser este. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
function lerCompetencia(c: any): CompetenciaPropagacao | null {
  if (!c || typeof c !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  const lista = (l: any): CompetenciaRecalculada[] => (Array.isArray(l) ? l : []).map((x) => ({
    lancamentoId: String(x?.lancamento_id ?? ''), venc: String(x?.venc ?? ''),
    compAntiga: x?.comp_antiga == null ? null : String(x.comp_antiga), compNova: String(x?.comp_nova ?? ''),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  const grupo = (g: any) => ({
    alteradas: Number(g?.alteradas ?? 0), puladasMesFechado: Number(g?.puladas_mes_fechado ?? 0), lista: lista(g?.lista),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  const proj = (p: any) => ({
    alteradas: Number(p?.alteradas ?? 0),
    marcaDepois: p?.marca_depois == null ? null : String(p.marca_depois),
    aGerar: (Array.isArray(p?.a_gerar) ? p.a_gerar : []).map(String),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
    duplicidades: (Array.isArray(p?.duplicidades) ? p.duplicidades : []).map((d: any) => ({ competencia: String(d?.competencia ?? ''), n: Number(d?.n ?? 0) })),
    aviso: typeof p?.aviso === 'string' && p.aviso ? p.aviso : null,
    vagas: lerVagas(p?.vagas),
  });
  return {
    grupos: { futuros: grupo(c.futuros), passados: grupo(c.passados) },
    mesesFechados: (Array.isArray(c.meses_fechados) ? c.meses_fechados : []).map(String),
    marcaAntes: c.marca_antes == null ? null : String(c.marca_antes),
    projecao: { futuros: proj(c.projecao?.futuros), todos: proj(c.projecao?.todos) },
    aplicadas: c.aplicadas == null ? null : Number(c.aplicadas),
  };
}

/**
 * Propagar a regra aos lançamentos gerados — FIN-RECORR-PROPAGA-01.
 *
 * ⚠ A CONTAGEM E A GRAVAÇÃO SÃO A MESMA CONSULTA, e é por isso que isto é uma RPC e não
 * dois `update` do front. Se o diálogo dissesse "12 futuros" com um predicado e o update
 * usasse outro, a tela prometeria um número e faria outro — e ninguém descobriria.
 * ⚠ E É UMA TRANSAÇÃO SÓ. "Valor apenas nos futuros" são dois `update` com recortes
 * diferentes; pelo PostgREST seriam duas requisições, e falhar na segunda deixaria metade
 * propagado, sem como desfazer.
 * ⚠ SIMULAR COM `'futuros'` É DE PROPÓSITO, e não com `'nenhum'`: a recusa de sinal trocado
 * acontece ANTES do desvio de simulação, então simular assim é o que faz a recusa aparecer
 * na tela antes de qualquer escrita. Com `'nenhum'` a RPC devolveria as contagens e calaria
 * sobre o sinal — que é a única coisa que o operador precisa saber antes de escolher.
 */
export async function propagarRecorrencia(
  recorrenciaId: string, escopo: EscopoPropagacao, simular: boolean,
): Promise<{ ok: boolean; dados: ResultadoPropagacao | null; erro: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_recorrencia_propagar', {
    p_recorrencia_id: recorrenciaId,
    p_escopo: escopo,
    p_simular: simular,
  });
  if (error) return { ok: false, dados: null, erro: error.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  const r: any = data ?? {};
  return {
    ok: true,
    dados: {
      futuros: Number(r.futuros ?? 0),
      passados: Number(r.passados ?? 0),
      aplicadosFuturos: Number(r.aplicados_futuros ?? 0),
      aplicadosPassados: Number(r.aplicados_passados ?? 0),
      simulado: r.simulado === true,
      competencia: lerCompetencia(r.competencia),
      valorDoMes: { futuros: Number(r.valor_do_mes?.futuros ?? 0), todos: Number(r.valor_do_mes?.todos ?? 0) },
      puladasValorDoMes: Number(r.puladas_valor_do_mes ?? 0),
    },
    erro: null,
  };
}

/**
 * A FRASE DAS PULADAS — REC-PROPAGAR-VALOR-DO-MES-01. Um dono: o diálogo a escreve e o `title` a repete inteira.
 * `null` com zero — sem conta ajustada a tela é a de sempre.
 */
export function frasePuladasValorDoMes(n: number): string | null {
  if (!(n > 0)) return null;
  return n === 1
    ? '1 conta com o valor do mês ajustado fica como está.'
    : `${n} contas com o valor do mês ajustado ficam como estão.`;
}

/** Cancelar é `ativo = false` — e NÃO apaga o que já foi gerado. */
export async function cancelarRecorrencia(recorrenciaId: string): Promise<{ ok: boolean; erro: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_recorrencia_cancelar', { p_recorrencia_id: recorrenciaId });
  return { ok: !error, erro: error?.message ?? null };
}
