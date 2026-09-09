/**
 * O RESUMO DAS OPERAÇÕES COMERCIAIS — PR-OC-RESUMO-01.
 *
 * ⚠ NENHUM CÁLCULO PARALELO. "falta pagar" é `saldo_operacao`, "pago" é
 * `total_liquidado_valido` (que já soma dinheiro e permuta), "vence" é o par
 * `vencimento`/`saldo_titulo` da parcela. Somar isso aqui daria uma segunda régua: a tela do
 * resumo diria um número e a lista das OCs outro, para o mesmo mês, e ninguém saberia qual
 * está certo. As views decidem; este arquivo agrupa e ordena.
 *
 * ⚠ CINCO CONSULTAS, NUNCA POR LINHA. Tudo com `in (...ids)` sobre o recorte já filtrado da
 * lista. Um resumo de 200 operações que fizesse uma consulta por operação seriam 200
 * viagens — o N+1 que o [PERF-DB-01] proibiu.
 */
import { supabase } from '@/integrations/supabase/client';
import { verboOC, siglaCategoria } from '@/lib/financeiro/produtoOC';

export interface OcResumoLinha {
  operacao_id: string;
  data: string | null;
  descricao: string;
  fornecedor: string;
  tipo: string;
  qtdNegociada: number | null;
  qtdRecebida: number;
  /** A primeira data de movimentação; `n` diz quantas houve, para o " (+N)". */
  dataRecebimento: { primeira: string | null; n: number };
  valor: number;
  pago: number;
  faltaPagar: number;
  situacao: string;
}

export interface OcResumoParcela {
  operacao_id: string;
  vencimento: string | null;
  descricao: string;
  fornecedor: string;
  sequencia: number | null;
  totalParcelas: number;
  /** "entrou dd/mm" · "entrou X de Y" · "não entrou" — a resposta do gado nesta parcela. */
  gado: string;
  valor: number;
  situacao: string;
  diasVencida: number;
}

export interface OcResumoBloco {
  tipo: string;
  entrou: OcResumoLinha[];
  naoEntrou: OcResumoLinha[];
  faltaPagar: OcResumoParcela[];
}

export interface OcResumo {
  blocos: OcResumoBloco[];
  geradoEm: Date;
}

interface OpBase {
  id: string; tipo_operacao: string; data_operacao: string;
  contraparte_id: string | null; qtd_negociada: number | null;
  valor_acordado: number | null; valor_total: number | null;
  status_comercial: string;
}

/**
 * "Compra 024 DF" — a identidade canônica da operação.
 *
 * ⚠ REUSA `verboOC` E `siglaCategoria` de `@/lib/financeiro/produtoOC`, que se declara "único
 * ponto de verdade do formato". Reescrever o padrão aqui daria duas identidades para a mesma
 * compra: uma no título do compromisso, outra no resumo — e o operador que buscasse pelo
 * nome de uma não acharia a outra.
 *
 * ⚠ VÁRIOS LOTES SOMAM A QUANTIDADE E UNEM AS SIGLAS: "Compra 095 DM+DF". A quantidade é a
 * total porque é isso que a operação negociou; as siglas se acumulam porque esconder uma
 * faria duas compras diferentes terem o mesmo nome.
 *
 * ⚠ NUNCA UUID, NUNCA FAZENDA. A versão anterior usava os três primeiros caracteres do id —
 * que não identifica nada para quem opera e é justamente o que a regra da casa proíbe na
 * tela.
 */
function descricaoPadrao(
  op: OpBase,
  lotes: readonly { categoria: string; qtd: number }[],
): string {
  const qtdTotal = lotes.reduce((a, l) => a + l.qtd, 0) || (op.qtd_negociada ?? 0);
  const siglas = [...new Set(lotes.map((l) => siglaCategoria(l.categoria)).filter(Boolean))];
  const qtd3 = String(Math.max(0, Math.trunc(qtdTotal))).padStart(3, '0');
  const parte = siglas.length ? ` ${siglas.join('+')}` : '';
  return `${verboOC(op.tipo_operacao)} ${qtd3}${parte}`;
}

const dias = (deISO: string | null): number => {
  if (!deISO) return 0;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(`${deISO.slice(0, 10)}T00:00:00`);
  return Math.floor((hoje.getTime() - d.getTime()) / 86400000);
};

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export async function carregarResumoOC(
  clienteId: string,
  operacoes: readonly OpBase[],
  nomeContraparte: (id: string | null) => string,
): Promise<OcResumo> {
  const ids = operacoes.map((o) => o.id);
  if (ids.length === 0) return { blocos: [], geradoEm: new Date() };

  /* eslint-disable @typescript-eslint/no-explicit-any -- idioma documentado: as views não
     estão em types.ts (regeneração é frente própria). */
  const [rLotes, rLiq, rParc, rMov] = await Promise.all([
    (supabase as any).from('vw_oc_lotes_recebimento')
      .select('operacao_id, categoria_negociada, qtd_negociada, qtd_recebida').eq('cliente_id', clienteId).in('operacao_id', ids),
    (supabase as any).from('vw_oc_operacao_liquidacao')
      .select('operacao_id, valor_total, total_liquidado_valido, saldo_operacao, estado_liquidacao')
      .eq('cliente_id', clienteId).in('operacao_id', ids),
    (supabase as any).from('vw_oc_parcelas_materializacao')
      .select('operacao_id, sequencia, valor, vencimento, saldo_titulo, status, titulo_status_transacao')
      .eq('cliente_id', clienteId).in('operacao_id', ids),
    (supabase as any).from('zoo_operacao_movimentacoes')
      .select('operacao_id, movimentacao_id').in('operacao_id', ids),
  ]);

  /* ⚠ A DATA VEM NUMA SEGUNDA VIAGEM, e não num embed. A coluna é `movimentacao_id` (não
     `lancamento_id`) e a FK para `lancamentos` é COMPOSTA — `(movimentacao_id, cliente_id)`.
     Embed com chave composta exige a dica do nome da constraint no PostgREST, e um embed que
     falhasse voltaria `null` em silêncio: a coluna "data receb." mostraria "—" em toda linha
     e pareceria dado ausente em vez de consulta errada. Duas viagens certas valem mais que
     uma incerta. */
  const movIds = ((rMov.data ?? []) as { movimentacao_id: string | null }[])
    .map((m) => m.movimentacao_id).filter((x): x is string => !!x);
  const rLanc = movIds.length
    ? await (supabase as any).from('lancamentos').select('id, data').in('id', movIds)
    : { data: [] };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const dataPorMov = new Map(
    ((rLanc.data ?? []) as { id: string; data: string | null }[]).map((l) => [l.id, l.data]),
  );

  const lotes = (rLotes.data ?? []) as { operacao_id: string; categoria_negociada: string | null; qtd_negociada: number; qtd_recebida: number }[];
  const liq = (rLiq.data ?? []) as {
    operacao_id: string; valor_total: number; total_liquidado_valido: number;
    saldo_operacao: number; estado_liquidacao: string | null;
  }[];
  const parcelas = (rParc.data ?? []) as {
    operacao_id: string; sequencia: number | null; valor: number; vencimento: string | null;
    saldo_titulo: number; status: string | null; titulo_status_transacao: string | null;
  }[];
  const movs = (rMov.data ?? []) as { operacao_id: string; movimentacao_id: string | null }[];

  /* Recebimento: a view é por LOTE; a operação soma os lotes dela. É contagem de cabeça,
     não de dinheiro — a regra que proíbe somar no React vale para valor, não para bicho. */
  const recebido = new Map<string, { negociada: number; recebida: number }>();
  for (const l of lotes) {
    const atual = recebido.get(l.operacao_id) ?? { negociada: 0, recebida: 0 };
    recebido.set(l.operacao_id, {
      negociada: atual.negociada + Number(l.qtd_negociada ?? 0),
      recebida: atual.recebida + Number(l.qtd_recebida ?? 0),
    });
  }

  /* Os lotes de cada operação, na ordem em que a view os devolve — é dela a ordenação. */
  const lotesPorOp = new Map<string, { categoria: string; qtd: number }[]>();
  for (const l of lotes) {
    if (!l.categoria_negociada) continue;
    const lista = lotesPorOp.get(l.operacao_id);
    const item = { categoria: l.categoria_negociada, qtd: Number(l.qtd_negociada ?? 0) };
    if (lista) lista.push(item); else lotesPorOp.set(l.operacao_id, [item]);
  }

  const liqPorOp = new Map(liq.map((l) => [l.operacao_id, l]));

  /* A data de entrada é a MENOR das movimentações; `n` conta quantas houve. */
  const datasMov = new Map<string, string[]>();
  for (const m of movs) {
    const d = m.movimentacao_id ? dataPorMov.get(m.movimentacao_id) : null;
    if (!d) continue;
    const lista = datasMov.get(m.operacao_id);
    if (lista) lista.push(d); else datasMov.set(m.operacao_id, [d]);
  }

  const parcPorOp = new Map<string, typeof parcelas>();
  for (const p of parcelas) {
    const lista = parcPorOp.get(p.operacao_id);
    if (lista) lista.push(p); else parcPorOp.set(p.operacao_id, [p]);
  }

  const linhaDe = (op: OpBase): OcResumoLinha => {
    const rec = recebido.get(op.id) ?? { negociada: 0, recebida: 0 };
    const l = liqPorOp.get(op.id);
    const ds = (datasMov.get(op.id) ?? []).sort();
    return {
      operacao_id: op.id,
      data: op.data_operacao,
      descricao: descricaoPadrao(op, lotesPorOp.get(op.id) ?? []),
      fornecedor: nomeContraparte(op.contraparte_id),
      tipo: op.tipo_operacao,
      qtdNegociada: op.qtd_negociada ?? (rec.negociada || null),
      qtdRecebida: rec.recebida,
      dataRecebimento: { primeira: ds[0] ?? null, n: ds.length },
      valor: Number(l?.valor_total ?? op.valor_acordado ?? op.valor_total ?? 0),
      pago: Number(l?.total_liquidado_valido ?? 0),
      faltaPagar: Number(l?.saldo_operacao ?? 0),
      situacao: l?.estado_liquidacao ?? op.status_comercial,
    };
  };

  const porTipo = new Map<string, OpBase[]>();
  for (const op of operacoes) {
    const lista = porTipo.get(op.tipo_operacao);
    if (lista) lista.push(op); else porTipo.set(op.tipo_operacao, [op]);
  }

  const blocos: OcResumoBloco[] = [];
  porTipo.forEach((ops, tipo) => {
    const linhas = ops.map(linhaDe);
    const entrou = linhas.filter((l) => l.qtdRecebida > 0);
    const naoEntrou = linhas.filter((l) => l.qtdRecebida === 0);

    const emAberto: OcResumoParcela[] = [];
    for (const op of ops) {
      const lista = (parcPorOp.get(op.id) ?? []).filter((p) => Number(p.saldo_titulo ?? 0) > 0);
      const total = (parcPorOp.get(op.id) ?? []).length;
      const rec = recebido.get(op.id) ?? { negociada: 0, recebida: 0 };
      const ds = (datasMov.get(op.id) ?? []).sort();
      const gado = rec.recebida === 0 ? 'não entrou'
        : rec.negociada > 0 && rec.recebida < rec.negociada ? `entrou ${rec.recebida} de ${rec.negociada}`
        : `entrou ${ddmm(ds[0] ?? null)}`;
      for (const p of lista) {
        emAberto.push({
          operacao_id: op.id,
          vencimento: p.vencimento,
          descricao: descricaoPadrao(op, lotesPorOp.get(op.id) ?? []),
          fornecedor: nomeContraparte(op.contraparte_id),
          sequencia: p.sequencia,
          totalParcelas: total,
          gado,
          valor: Number(p.saldo_titulo ?? 0),
          situacao: p.titulo_status_transacao ?? p.status ?? '—',
          diasVencida: Math.max(0, dias(p.vencimento)),
        });
      }
    }
    /* ⚠ ORDENADA POR VENCIMENTO, sempre: a pergunta desta lista é "o que vence primeiro". */
    emAberto.sort((a, b) => (a.vencimento ?? '') < (b.vencimento ?? '') ? -1 : (a.vencimento ?? '') > (b.vencimento ?? '') ? 1 : 0);

    blocos.push({ tipo, entrou, naoEntrou, faltaPagar: emAberto });
  });

  /* Ordem fixa dos blocos — nunca a de chegada do banco. */
  const ORDEM = ['compra', 'venda', 'abate', 'boitel'];
  blocos.sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));

  return { blocos, geradoEm: new Date() };
}

/** O total de uma lista, para a faixa do título e a linha de fechamento. */
export function totalLinhas(linhas: readonly OcResumoLinha[]) {
  return linhas.reduce((a, l) => ({
    n: a.n + 1,
    cab: a.cab + (l.qtdNegociada ?? 0),
    cabReceb: a.cabReceb + l.qtdRecebida,
    valor: a.valor + l.valor,
    pago: a.pago + l.pago,
    falta: a.falta + l.faltaPagar,
  }), { n: 0, cab: 0, cabReceb: 0, valor: 0, pago: 0, falta: 0 });
}
