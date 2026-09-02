import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * useExtratoDaConta — o saldo do mês e as importações da conta.
 * FIN-CONCIL-PORTAR-01, rodada 1.
 */

/**
 * O SALDO DO MÊS — decisão do Gabriel (opção B do B-20).
 *
 * ⚠ NÃO É "DECLARADO PELO BANCO", e o rótulo da tela diz isso. O original lê o
 * LEDGERBAL do OFX; medimos que ele não chega ao Proto — `saldo_apos` é NULO nos
 * 3.685 movimentos, `extrato_bancario_staging` está vazia e o parser não lê a
 * tag. O que existe é `financeiro_saldos_bancarios_v2`: 4.695 linhas de saldo
 * GERENCIAL por conta/mês, de 2019-01 a 2026-08.
 *
 * ⚠ A ORIGEM VIAJA JUNTO, e é ela que impede a confusão: medido, `origem_saldo`
 * é nula em 3.932 linhas, `historico_legado` em 487, `manual` em 116,
 * `sem_movimento` em 96, `migracao` em 62 e `extrato` em apenas 2. Mostrar o
 * número sem a procedência faria um saldo digitado à mão passar por extrato de
 * banco.
 */
/** Último dia do mês, em data civil — sem `toISOString`, que muda o dia por fuso. */
export function fimDoMes(ano: number, mes: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

export function useSaldoGerencialDoMes(
  clienteId: string | null, contaId: string | null, ano: number, mes: number,
) {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const [saldoInicial, setSaldoInicial] = useState<number | null>(null);
  /**
   * FIN-SALDO-POSICAO-01 — a DATA da posição declarada.
   *
   * ⚠ NULL SIGNIFICA "FIM DO MÊS", e é o que as 4.700 linhas antigas dizem: elas
   * nasceram sem posição, e inventar uma data para elas seria a tela afirmando
   * uma conferência que ninguém fez. O `coalesce` mora na leitura, como na
   * referência — nunca no banco.
   */
  const [saldoData, setSaldoData] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  useEffect(() => {
    let cancelado = false;
    if (!clienteId || !contaId) {
      setSaldo(null); setOrigem(null); setSaldoData(null); setSaldoInicial(null); return;
    }
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `saldo_data` é nova; types.ts defasado
      const { data } = await (supabase as any)
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final, saldo_inicial, origem_saldo, saldo_data')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .eq('ano_mes', anoMes)
        .maybeSingle();
      if (cancelado) return;
      const r = data as {
        saldo_final?: unknown; saldo_inicial?: unknown;
        origem_saldo?: unknown; saldo_data?: unknown;
      } | null;
      setSaldo(r?.saldo_final == null ? null : Number(r.saldo_final));
      setSaldoInicial(r?.saldo_inicial == null ? null : Number(r.saldo_inicial));
      /* Origem nula é o caso mais comum (3.932 de 4.695) e NÃO vira "manual"
         por conveniência: sem procedência declarada, a pílula não aparece. */
      setOrigem(typeof r?.origem_saldo === 'string' ? r.origem_saldo : null);
      setSaldoData(typeof r?.saldo_data === 'string' ? r.saldo_data : null);
    })();
    return () => { cancelado = true; };
  }, [clienteId, contaId, anoMes, recarga]);

  /** A data que a comparação usa: a declarada, ou o fim do mês. */
  const posicaoEm = saldoData ?? fimDoMes(ano, mes);

  return {
    saldo, origem, anoMes, saldoInicial, saldoData, posicaoEm,
    /** `true` quando a data é declarada; `false` quando é o fim do mês por omissão. */
    posicaoDeclarada: saldoData !== null,
    recarregarSaldo: () => setRecarga((n) => n + 1),
  };
}

/**
 * GRAVAR O SALDO REAL E A POSIÇÃO — o lápis da conciliação.
 *
 * ⚠ TOCA TRÊS COLUNAS E SÓ ELAS: `saldo_final`, `saldo_data` e `origem_saldo`.
 * A linha do mês carrega também `saldo_inicial`, `fechado`, `status_mes` e a
 * cadeia que os liga ao mês seguinte; um upsert de objeto inteiro os apagaria
 * para quem informasse um saldo pela tela de conciliação.
 *
 * ⚠ E NÃO MEXE NA CADEIA MENSAL. `saldo_final N = inicial N+1` continua lendo
 * fim de mês; a posição governa só a leitura da tela — decisão de 02/09, gravada
 * no COMMENT da coluna. Posição no meio do mês é declaração temporária, e o
 * aviso de "realizados após" é o que cobra a atualização no fechamento.
 *
 * ⚠ SEGUNDO GRAVADOR DESTA TABELA, declarado: o primeiro é `FinV2SaldosTab`,
 * cuja escrita está acoplada ao formulário daquela tela (payload completo,
 * fazenda, status do mês). Extraí-la seria refatorar aquela tela inteira; o
 * escopo mínimo aqui é mais seguro. Se um terceiro aparecer, é hora de extrair.
 */
export async function gravarSaldoReal(params: {
  clienteId: string; contaId: string; anoMes: string;
  saldo: number; saldoData: string | null;
}): Promise<{ ok: boolean; erro: string | null }> {
  const patch = {
    saldo_final: params.saldo,
    saldo_data: params.saldoData,
    origem_saldo: 'manual',
    updated_at: new Date().toISOString(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `saldo_data` é nova; types.ts defasado
  const q = (supabase as any).from('financeiro_saldos_bancarios_v2');
  const { data: existente, error: erroBusca } = await q
    .select('id')
    .eq('cliente_id', params.clienteId)
    .eq('conta_bancaria_id', params.contaId)
    .eq('ano_mes', params.anoMes)
    .maybeSingle();
  if (erroBusca) return { ok: false, erro: erroBusca.message };

  const alvo = (existente as { id?: string } | null)?.id;
  const { error } = alvo
    ? await q.update(patch).eq('id', alvo)
    /* Linha nova: `saldo_inicial` fica de fora de propósito — quem o define é a
       cadeia mensal, não o lápis. */
    : await q.insert({
        cliente_id: params.clienteId,
        conta_bancaria_id: params.contaId,
        ano_mes: params.anoMes,
        ...patch,
      });
  return { ok: !error, erro: error?.message ?? null };
}

/** Remover a declaração — volta a "sem saldo informado", não a "saldo zero". */
export async function removerSaldoReal(params: {
  clienteId: string; contaId: string; anoMes: string;
}): Promise<{ ok: boolean; erro: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `saldo_data` é nova; types.ts defasado
  const { error } = await (supabase as any)
    .from('financeiro_saldos_bancarios_v2')
    .update({ saldo_final: null, saldo_data: null, origem_saldo: null, updated_at: new Date().toISOString() })
    .eq('cliente_id', params.clienteId)
    .eq('conta_bancaria_id', params.contaId)
    .eq('ano_mes', params.anoMes);
  return { ok: !error, erro: error?.message ?? null };
}

export interface ImportacaoDaConta {
  id: string;
  nomeArquivo: string;
  data: string;
  importados: number;
  comVinculo: number;
}

/**
 * AS IMPORTAÇÕES DESTA CONTA — e o alcance honesto do Desfazer.
 *
 * ⚠ O RASTRO É PARCIAL, e a tela diz isso em vez de fingir. Medido no Proto:
 * `importacao_id` está preenchido em 47 dos 3.685 movimentos (1,3%) — três
 * arquivos, todos de 25/08/2026. Os outros 3.638 nasceram sem o vínculo de
 * importação (bug P0 registrado), e nenhum Desfazer os alcança.
 *
 * ⚠ DESFAZER NÃO APAGA EM SILÊNCIO. Movimento com vínculo ativo não sai: o
 * caminho é avisar e listar. Apagar um movimento conciliado levaria junto a
 * evidência de uma conciliação que continua existindo do outro lado.
 */
export function useImportacoesDaConta(clienteId: string | null, contaId: string | null) {
  const [importacoes, setImportacoes] = useState<ImportacaoDaConta[]>([]);
  const [loading, setLoading] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId || !contaId) { setImportacoes([]); return; }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data: movs } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, importacao_id')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .not('importacao_id', 'is', null);
      const linhas: { id: string; importacao_id: string }[] = movs ?? [];
      if (linhas.length === 0) { setImportacoes([]); return; }

      const ids = Array.from(new Set(linhas.map(l => l.importacao_id)));
      const [{ data: imps }, { data: vinc }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        (supabase as any).from('financeiro_importacoes_v2')
          .select('id, nome_arquivo, created_at').in('id', ids),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        (supabase as any).from('conciliacao_bancaria_itens')
          .select('extrato_id').in('extrato_id', linhas.map(l => l.id)).is('desfeito_em', null),
      ]);
      const comVinculo = new Set((vinc ?? []).map((v: { extrato_id: string }) => v.extrato_id));
      const porImp: Record<string, { n: number; v: number }> = {};
      for (const l of linhas) {
        const acc = porImp[l.importacao_id] ?? { n: 0, v: 0 };
        acc.n += 1;
        if (comVinculo.has(l.id)) acc.v += 1;
        porImp[l.importacao_id] = acc;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas fora de types.ts
      setImportacoes(((imps ?? []) as any[]).map(i => ({
        id: i.id,
        nomeArquivo: i.nome_arquivo ?? '(sem nome)',
        data: (i.created_at ?? '').slice(0, 10),
        importados: porImp[i.id]?.n ?? 0,
        comVinculo: porImp[i.id]?.v ?? 0,
      })).sort((a, b) => b.data.localeCompare(a.data)));
    } finally {
      setLoading(false);
    }
  }, [clienteId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const desfazer = useCallback(async (importacaoId: string) => {
    const alvo = importacoes.find(i => i.id === importacaoId);
    if (!alvo) return;
    /* ⚠ A RECUSA VEM ANTES DA ESCRITA, e nomeia o que impede — a regra da casa:
       antecipar a recusa, não deixar o operador descobrir depois. */
    if (alvo.comVinculo > 0) {
      toast.error(
        `${alvo.nomeArquivo}: ${alvo.comVinculo} movimento${alvo.comVinculo === 1 ? '' : 's'} ` +
        'já conciliado. Desfaça os vínculos antes de desfazer a importação.',
      );
      return;
    }
    setDesfazendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { error } = await (supabase as any)
        .from('extrato_bancario_v2')
        .update({ cancelado_em: new Date().toISOString(), cancelado_motivo: 'importacao_desfeita' })
        .eq('importacao_id', importacaoId)
        .is('cancelado_em', null);
      if (error) { toast.error(error.message); return; }
      toast.success(`Importação desfeita — ${alvo.importados} movimento${alvo.importados === 1 ? '' : 's'}.`);
      await carregar();
    } finally {
      setDesfazendo(false);
    }
  }, [importacoes, carregar]);

  return { importacoes, loading, desfazendo, desfazer, recarregar: carregar };
}

/**
 * O SALDO DO SISTEMA NA POSIÇÃO — somado ATÉ a data declarada.
 * FIN-SALDO-POSICAO-01, peça 2.
 *
 * ⚠ POSIÇÃO CONTRA POSIÇÃO, e é isso que faltava: hoje a tela compara um saldo
 * digitado com o mês INTEIRO. Um extrato consultado em 13/08 declara a posição
 * daquele dia; confrontá-lo com o fechamento de 31/08 acusa uma diferença que é
 * só o resto do mês — e foi o que obrigou a arqueologia no Bradesco.
 *
 * ⚠ A CONTA É `saldo_inicial` DO MÊS MAIS O MOVIMENTO ATÉ A DATA. O inicial vem
 * da cadeia mensal (preenchido nas 4.700 linhas) e é o único ponto de partida
 * confiável — somar o histórico inteiro desde 2019 daria o mesmo número ao preço
 * de milhares de linhas, e divergiria no primeiro mês em que a cadeia tivesse um
 * ajuste que os lançamentos não explicam.
 *
 * ⚠ SÓ REALIZADO E SÓ CAIXA, a mesma régua do vínculo: previsto não moveu
 * dinheiro, cancelado não é lançamento, e `sem_movimentacao_caixa` não toca a
 * conta. Incluir qualquer um deles faria o sistema divergir do extrato por
 * construção.
 *
 * ⚠ A CONTA DESTINO CONTA COMO ENTRADA. Uma transferência tem duas pernas, e a
 * conta que recebe vê o dinheiro entrar — ignorá-la faria toda transferência
 * parecer uma diferença.
 */
/** Uma linha de lançamento, no mínimo que a soma da posição olha. */
export interface LinhaDaPosicao {
  valor: number | string | null;
  data_pagamento: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
}

/**
 * A CONTA DA POSIÇÃO, pura e testável — o que decide se o mês fecha.
 *
 * ⚠ FUNÇÃO PURA de propósito: é aqui que "o mês fecha" ou "há diferença", e uma
 * conta que só existe dentro de um efeito não pode ser exercitada sem navegador.
 * O hook busca; esta função decide.
 *
 * ⚠ COMPARAÇÃO DE STRING ISO, não de `Date`: 'YYYY-MM-DD' ordena
 * lexicograficamente, e construir `Date` aqui reintroduziria o fuso — o mesmo
 * motivo pelo qual `fimDoMes` usa `Date.UTC`.
 */
export function somarAtePosicao(
  linhas: readonly LinhaDaPosicao[], contaId: string, posicaoEm: string,
): { ate: number; depois: number } {
  let ate = 0, depois = 0;
  for (const l of linhas) {
    const d = (l.data_pagamento ?? '').slice(0, 10);
    /* Sem data de pagamento a linha não tem posição no tempo: não entra na soma
       nem é contada como "depois" — contá-la cobraria do operador uma
       atualização que nenhuma data mais recente resolveria. */
    if (!d) continue;
    /* A perna de destino entra positiva nesta conta; a de origem vai com o sinal
       que o lançamento já tem. Ignorar o destino faria toda transferência
       recebida parecer uma diferença. */
    const v = l.conta_destino_id === contaId && l.conta_bancaria_id !== contaId
      ? Math.abs(Number(l.valor ?? 0))
      : Number(l.valor ?? 0);
    if (d <= posicaoEm) ate += v; else depois += 1;
  }
  return { ate, depois };
}

export function useSaldoSistemaNaPosicao(
  clienteId: string | null, contaId: string | null,
  anoMes: string, saldoInicial: number | null, posicaoEm: string,
) {
  const [saldoSistema, setSaldoSistema] = useState<number | null>(null);
  /** Realizados DEPOIS da posição — o que o aviso conta. */
  const [aposPosicao, setAposPosicao] = useState(0);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!clienteId || !contaId || saldoInicial == null) {
      setSaldoSistema(null); setAposPosicao(0); return;
    }
    const primeiroDia = `${anoMes}-01`;
    const ultimoDia = fimDoMes(Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)));
    setCarregando(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_lancamentos_v2')
        .select('valor, data_pagamento, conta_bancaria_id, conta_destino_id')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .eq('cenario', 'realizado')
        .or(`conta_bancaria_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
        .gte('data_pagamento', primeiroDia)
        .lte('data_pagamento', ultimoDia);
      if (cancelado) return;
      const linhas = (data ?? []) as LinhaDaPosicao[];
      const { ate, depois } = somarAtePosicao(linhas, contaId, posicaoEm);
      setSaldoSistema(Math.round((saldoInicial + ate) * 100) / 100);
      setAposPosicao(depois);
      setCarregando(false);
    })();
    return () => { cancelado = true; setCarregando(false); };
  }, [clienteId, contaId, anoMes, saldoInicial, posicaoEm]);

  return { saldoSistema, aposPosicao, carregando };
}
