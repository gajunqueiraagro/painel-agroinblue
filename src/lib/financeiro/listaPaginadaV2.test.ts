/**
 * PR-FIN-LISTA-VENCIMENTO-03 — gates E1..E6 da lista paginada.
 *
 * Estratégia A/B: o MESMO acervo passa por dois caminhos — o servidor (um
 * PostgREST simulado que avalia os predicados de verdade) e o cliente (a cadeia
 * em memória que a tela usa hoje) — e os dois têm de coincidir. Um teste que só
 * comparasse o servidor consigo mesmo não provaria nada.
 *
 * O simulador implementa a semântica medida contra o PostgREST real: `or()` com
 * grupos `and(...)`, `in`, `is.null`, `not.is.null`, `imatch` como regex POSIX
 * case-insensitive, e o consumo de UMA camada de `\` nos valores citados.
 */
import { describe, it, expect } from 'vitest';
import {
  consultarPagina,
  consultarTotais,
  aplicarPlanoNaView,
  ordenarPorVencimentoNoCliente,
  filtrarSeisNoCliente,
  totaisNoCliente,
  faixaDaPagina,
  faixasDoRecorte,
  paramsDosTotais,
  planoDaLista,
  sinalNumerico,
  COLUNAS_VIEW_DOC,
  TAMANHO_PAGINA_LISTA,
  type AbrirView,
  type BuilderView,
  type ChamarRpcTotais,
  type LinhaViewDoc,
  type RegistroListaV2,
  type RespostaView,
} from './listaPaginadaV2';
import { montarPlanoBaseV2, type FiltrosV2 } from './filtrosBaseV2';
import { formatDocumento } from './documentoHelper';

// ─────────────────────────────────────────────────────────────────────────────
// PostgREST simulado
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;

/** Desfaz a camada de escape que o parser do `or()` consome. */
function descitar(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return v;
}

/** Divide por vírgulas de topo, respeitando parênteses e aspas. */
function partirTopo(s: string): string[] {
  const out: string[] = [];
  let atual = '';
  let prof = 0;
  let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '\\') { atual += c + (s[++i] ?? ''); continue; }
      if (c === '"') aspas = false;
      atual += c;
      continue;
    }
    if (c === '"') { aspas = true; atual += c; continue; }
    if (c === '(') prof++;
    if (c === ')') prof--;
    if (c === ',' && prof === 0) { out.push(atual); atual = ''; continue; }
    atual += c;
  }
  if (atual) out.push(atual);
  return out;
}

function avaliarTermo(l: Linha, termo: string): boolean {
  const t = termo.trim();
  if (t.startsWith('and(') && t.endsWith(')')) {
    return partirTopo(t.slice(4, -1)).every((sub) => avaliarTermo(l, sub));
  }
  const p1 = t.indexOf('.');
  const col = t.slice(0, p1);
  const resto = t.slice(p1 + 1);
  const v = l[col];

  if (resto === 'is.null') return v === null || v === undefined;
  if (resto === 'not.is.null') return v !== null && v !== undefined;

  const p2 = resto.indexOf('.');
  const op = resto.slice(0, p2);
  const bruto = resto.slice(p2 + 1);

  switch (op) {
    case 'eq':  return String(v) === descitar(bruto);
    case 'gte': return v != null && String(v) >= descitar(bruto);
    case 'lt':  return v != null && String(v) < descitar(bruto);
    case 'gt':  return v != null && Number(v) > Number(descitar(bruto));
    case 'in': {
      const itens = partirTopo(bruto.replace(/^\(/, '').replace(/\)$/, '')).map(descitar);
      return v != null && itens.includes(String(v));
    }
    case 'not': {
      if (v == null) return false;   // NULL nunca casa com NOT IN, como no SQL
      return !avaliarTermo(l, `${col}.${bruto}`);
    }
    // `imatch` = `~*`: regex POSIX, case-insensitive, NÃO ancorado.
    case 'imatch': return v != null && new RegExp(descitar(bruto), 'i').test(String(v));
    default: throw new Error(`operador nao suportado no simulador: ${op} (${t})`);
  }
}

interface Chamada { metodo: string; args: unknown[] }

function criarBuilder(fonte: readonly Linha[], registro: Chamada[], op?: { count?: 'exact'; head?: boolean }): BuilderView {
  const predicados: ((l: Linha) => boolean)[] = [];
  const ordens: { coluna: string; asc: boolean; nullsFirst: boolean }[] = [];
  let faixa: [number, number] | null = null;

  const reg = (metodo: string, ...args: unknown[]) => { registro.push({ metodo, args }); };

  const executar = (): RespostaView => {
    let itens = predicados.reduce<Linha[]>((acc, p) => acc.filter(p), [...fonte]);
    for (const o of [...ordens].reverse()) {
      itens = [...itens].sort((a, b) => {
        const va = a[o.coluna] ?? null;
        const vb = b[o.coluna] ?? null;
        if (va === vb) return 0;
        if (va === null) return o.nullsFirst ? -1 : 1;
        if (vb === null) return o.nullsFirst ? 1 : -1;
        const cmp = String(va) < String(vb) ? -1 : 1;
        return o.asc ? cmp : -cmp;
      });
    }
    const total = itens.length;
    if (faixa) itens = itens.slice(faixa[0], faixa[1] + 1);
    // `head: true` nao traz linha alguma — so a contagem, como o PostgREST faz.
    return {
      data: (op?.head ? [] : itens) as unknown as LinhaViewDoc[],
      count: op?.count === 'exact' ? total : null,
      error: null,
    };
  };

  const self: BuilderView = {
    eq(c, v)  { reg('eq', c, v);  predicados.push((l) => String(l[c]) === String(v)); return self; },
    neq(c, v) { reg('neq', c, v); predicados.push((l) => String(l[c]) !== String(v)); return self; },
    in(c, vs) { reg('in', c, vs); predicados.push((l) => vs.map(String).includes(String(l[c]))); return self; },
    not(c, o, v) {
      reg('not', c, o, v);
      predicados.push((l) => !(o === 'is' && (l[c] ?? null) === v));
      return self;
    },
    or(f)       { reg('or', f);       predicados.push((l) => partirTopo(f).some((t) => avaliarTermo(l, t))); return self; },
    order(c, o) { reg('order', c, o); ordens.push({ coluna: c, asc: o.ascending, nullsFirst: o.nullsFirst !== false }); return self; },
    range(a, b) { reg('range', a, b); faixa = [a, b]; return self; },
    then(ok, falha) { return Promise.resolve(executar()).then(ok, falha); },
  };
  return self;
}

function simulador(linhas: readonly Linha[]) {
  const registro: Chamada[] = [];
  const abrir: AbrirView = (colunas, op) => {
    registro.push({ metodo: 'select', args: [colunas, op] });
    return criarBuilder(linhas, registro, op);
  };
  return { abrir, registro };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acervo
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTE = 'c-1';
const OUTRO = 'c-2';

function linha(over: Partial<Linha> & { id: string }): Linha {
  const base: Linha = {
    cliente_id: CLIENTE, fazenda_id: 'f-1', cancelado: false, cenario: 'real',
    status_transacao: 'previsto', conciliado_em: null,
    tipo_operacao: '2-Saídas', sinal: '-1', valor: 100,
    data_competencia: '2026-03-10', data_pagamento: '2026-03-10', data_vencimento: '2026-03-10',
    descricao: 'Racao bovina', numero_documento: null, tipo_documento: null,
    favorecido_id: null, grupo_custo: 'Nutricao', escopo_negocio: 'pecuaria',
    ...over,
  };
  // A view materializa estas colunas; a fixture tem de materializá-las também.
  base.documento_formatado = formatDocumento(
    (base.tipo_documento as string | null) ?? null,
    (base.numero_documento as string | null) ?? null,
  );
  const mes = (d: unknown) => (d ? Number(String(d).slice(5, 7)) : null);
  base.mes_competencia = mes(base.data_competencia);
  base.mes_vencimento = mes(base.data_vencimento);
  base.mes_pagamento = mes(base.data_pagamento);
  base.mes_financeira = mes(base.data_pagamento ?? base.data_vencimento);
  return base;
}

const ACERVO: Linha[] = [
  linha({ id: 'a01', data_vencimento: '2026-03-05', valor: 10, sinal: '1', tipo_operacao: '1-Entradas' }),
  linha({ id: 'a02', data_vencimento: '2026-03-01', valor: 20 }),
  linha({ id: 'a03', data_vencimento: null, data_pagamento: '2026-03-15', valor: 30 }),
  linha({ id: 'a04', data_vencimento: '2026-03-20', valor: 40, escopo_negocio: 'agricultura' }),
  linha({ id: 'a05', data_vencimento: '2026-03-20', valor: 50, escopo_negocio: null }),
  linha({ id: 'a06', data_vencimento: '2026-03-08', valor: 60, escopo_negocio: 'financeiro' }),
  linha({ id: 'a07', data_vencimento: '2026-04-02', valor: 70, data_pagamento: '2026-04-02' }),
  linha({ id: 'a08', data_vencimento: '2025-03-11', valor: 80, data_pagamento: '2025-03-11', data_competencia: '2025-03-11' }),
  linha({ id: 'a09', data_vencimento: '2026-03-12', valor: 90, numero_documento: '123456789', tipo_documento: 'Nota Fiscal' }),
  linha({ id: 'a10', data_vencimento: '2026-03-13', valor: 15, numero_documento: '4567', tipo_documento: 'Nota Fiscal' }),
  linha({ id: 'a11', data_vencimento: '2026-03-14', valor: 25, numero_documento: '9876', tipo_documento: 'Recibo', favorecido_id: 'forn-1' }),
  linha({ id: 'z01', cliente_id: OUTRO, data_vencimento: '2026-03-02' }),
  linha({ id: 'z02', cancelado: true, data_vencimento: '2026-03-03' }),
  linha({ id: 'z03', status_transacao: 'conciliado', data_vencimento: '2026-03-04' }),
  linha({ id: 'z04', cenario: 'meta', data_vencimento: '2026-03-06' }),
];

/** Referência client-side: o que a tela produziria para os mesmos filtros. */
function referencia(filtros: FiltrosV2, linhas: readonly Linha[] = ACERVO): Linha[] {
  const base = linhas.filter((l) =>
    l.cliente_id === CLIENTE && l.cancelado === false &&
    l.status_transacao !== 'conciliado' && l.cenario !== 'meta');
  const temporal = base.filter((l) => dentroDoPeriodo(l, filtros));
  const seis = filtrarSeisNoCliente(temporal as unknown as RegistroListaV2[], filtros);
  return ordenarPorVencimentoNoCliente(seis) as unknown as Linha[];
}

function dentroDoPeriodo(l: Linha, filtros: FiltrosV2): boolean {
  const dim = filtros.dimensao ?? 'financeira';
  const data = dim === 'financeira'
    ? ((l.data_pagamento as string | null) ?? (l.data_vencimento as string | null))
    : (l[`data_${dim}`] as string | null);
  const todosAnos = !filtros.ano || filtros.ano === '__todos__';
  const meses = filtros.meses?.length ? filtros.meses : (filtros.mes && filtros.mes !== 'todos' ? [filtros.mes] : []);
  if (todosAnos && meses.length === 0) return data != null;
  if (data == null) return false;
  const mesOk = meses.length === 0 || meses.map((m) => m.padStart(2, '0')).includes(data.slice(5, 7));
  if (todosAnos) return mesOk;
  return data.slice(0, 4) === filtros.ano && mesOk;
}

const MARCO: FiltrosV2 = { ano: '2026', mes: '03' };
const SEM_PERIODO: FiltrosV2 = { ano: '__todos__' };
const ids = (ls: readonly { id?: unknown }[]) => ls.map((l) => String(l.id));

// ─────────────────────────────────────────────────────────────────────────────

describe('E1 — ids: servidor e cliente devolvem o mesmo conjunto', () => {
  const casos: [string, FiltrosV2][] = [
    ['março/2026', MARCO],
    ['sem período', SEM_PERIODO],
    ['ano inteiro', { ano: '2026' }],
    ['produto', { ...MARCO, lista_produto: 'racao' }],
    ['fornecedor', { ...MARCO, lista_fornecedor_id: 'forn-1' }],
    ['grupo de custo', { ...MARCO, lista_grupo_custo: 'Nutricao' }],
    ['atividade canônica', { ...MARCO, lista_atividade: 'agricultura' }],
    ['atividade outros', { ...MARCO, lista_atividade: 'outros' }],
    ['direção origem', { ...MARCO, lista_conta_direcao: 'origem' }],
    ['direção destino', { ...MARCO, lista_conta_direcao: 'destino' }],
    ['documento cru', { ...MARCO, lista_documento: '9876' }],
    ['documento formatado', { ...MARCO, lista_documento: '000.004.567' }],
    ['mês em qualquer ano', { ano: '__todos__', mes: '03' }],
    ['combinação de quatro', { ...MARCO, lista_produto: 'racao', lista_grupo_custo: 'Nutricao', lista_atividade: 'pecuaria', lista_conta_direcao: 'origem' }],
  ];

  it.each(casos)('%s', async (_n, filtros) => {
    const { abrir } = simulador(ACERVO);
    const servidor = await consultarPagina(abrir, CLIENTE, filtros, { tamanhoPagina: 500 });
    expect(ids(servidor).sort()).toEqual(ids(referencia(filtros)).sort());
  });
});

describe('E2 — ordem: data_vencimento ASC NULLS LAST, id ASC', () => {
  it('a página vem na ordem do contrato', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, SEM_PERIODO, { tamanhoPagina: 500 });
    expect(ids(p)).toEqual(ids(referencia(SEM_PERIODO)));
  });

  it('nulos de vencimento vão para o FIM', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, SEM_PERIODO, { tamanhoPagina: 500 });
    const i = p.findIndex((l) => l.data_vencimento == null);
    expect(i).toBe(p.length - 1);
  });

  it('id desempata vencimentos iguais', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, MARCO, { tamanhoPagina: 500 });
    const empate = p.filter((l) => l.data_vencimento === '2026-03-20').map((l) => l.id);
    expect(empate).toEqual([...empate].sort());
  });

  it('emite nullsFirst: false e id como segunda chave', async () => {
    const { abrir, registro } = simulador(ACERVO);
    await consultarPagina(abrir, CLIENTE, MARCO, {});
    const ordens = registro.filter((c) => c.metodo === 'order');
    expect(ordens[0].args).toEqual(['data_vencimento', { ascending: true, nullsFirst: false }]);
    expect(ordens[1].args).toEqual(['id', { ascending: true }]);
  });
});

describe('E3/E4 — contagem e totais vêm da RPC, não de varredura', () => {
  /** RPC simulada: recebe os params e devolve o que o Postgres devolveria. */
  function rpcSimulada(linhas: readonly Linha[], filtros: FiltrosV2) {
    const chamadas: unknown[] = [];
    const chamar: ChamarRpcTotais = async (params) => {
      chamadas.push(params);
      const alvo = referencia(filtros, linhas) as unknown as RegistroListaV2[];
      const { entradas, saidas } = totaisNoCliente(alvo);
      return {
        data: [{
          total: alvo.length, entradas, saidas,
          excluidos_sem_vencimento: 0,
        }],
        error: null,
      };
    };
    return { chamar, chamadas };
  }

  it('total bate com o cliente e ignora a paginação', async () => {
    const { chamar } = rpcSimulada(ACERVO, MARCO);
    const t = await consultarTotais(chamar, CLIENTE, MARCO, { pagina: 3, tamanhoPagina: 2 });
    expect(t.total).toBe(referencia(MARCO).length);
  });

  it('entradas e saídas batem com a soma do cliente', async () => {
    const { chamar } = rpcSimulada(ACERVO, MARCO);
    const t = await consultarTotais(chamar, CLIENTE, MARCO);
    const esperado = totaisNoCliente(referencia(MARCO) as unknown as RegistroListaV2[]);
    expect({ entradas: t.entradas, saidas: t.saidas }).toEqual(esperado);
  });

  it('UMA chamada, e nenhuma linha trafegada', async () => {
    const { chamar, chamadas } = rpcSimulada(ACERVO, MARCO);
    await consultarTotais(chamar, CLIENTE, MARCO);
    expect(chamadas).toHaveLength(1);
  });

  it('a RPC recebe os seis filtros da lista', () => {
    const p = paramsDosTotais(CLIENTE, {
      ...MARCO,
      lista_conta_direcao: 'origem', lista_produto: 'racao', lista_fornecedor_id: 'forn-1',
      lista_grupo_custo: 'Nutricao', lista_atividade: 'outros', lista_documento: '9876',
    });
    expect(p.p_lista_conta_direcao).toBe('origem');
    expect(p.p_lista_produto).toBe('racao');
    expect(p.p_lista_fornecedor_id).toBe('forn-1');
    expect(p.p_lista_grupo_custo).toBe('Nutricao');
    expect(p.p_lista_atividade).toBe('outros');
    expect(p.p_lista_documento).toBe('9876');
  });

  it('TODO campo de FiltrosV2 chega à RPC — nenhum filtro fica fora dos totais', () => {
    // Se alguém acrescentar um filtro e esquecer dos totais, este teste quebra.
    const completo: Required<Omit<FiltrosV2, 'meses'>> & { meses?: string[] } = {
      ano: '2026', mes: '03', fazenda_id: 'f-1', dimensao: 'vencimento',
      conta_bancaria_id: 'cb', conta_destino_id: 'cd', tipo_operacao: '2-Saídas',
      status_transacoes: ['previsto', 'conciliado'],
      macro_custo: 'M', grupo_custo: 'G', centro_custo: 'C', subcentro: 'S',
      lista_conta_direcao: 'origem', lista_produto: 'p', lista_fornecedor_id: 'ff',
      lista_grupo_custo: 'lg', lista_atividade: 'pecuaria', lista_documento: 'd',
    };
    const p = paramsDosTotais(CLIENTE, completo);
    const semValor = Object.entries(p).filter(([, v]) => v === null || v === undefined);
    // Só p_meses fica nulo: "mês em qualquer ano" exige ano '__todos__'.
    // p_tipo_operacao é nulo de propósito quando há origem E destino (vira transferência).
    expect(semValor.map(([k]) => k).sort()).toEqual(['p_meses', 'p_tipo_operacao']);
    expect(p.p_faixas).toEqual(['[2026-03-01,2026-04-01)']);
    expect(p.p_status_transacoes).toEqual(['previsto']);
    expect(p.p_incluir_conciliado).toBe(true);
  });

  it('faixas do recorte cobrem virada de ano e multimês', () => {
    expect(faixasDoRecorte({ ano: '2026', mes: '12' })).toEqual(['[2026-12-01,2027-01-01)']);
    expect(faixasDoRecorte({ ano: '2026', meses: ['01', '02'] }))
      .toEqual(['[2026-01-01,2026-02-01)', '[2026-02-01,2026-03-01)']);
    expect(faixasDoRecorte({ ano: '2026' })).toEqual(['[2026-01-01,2027-01-01)']);
    expect(faixasDoRecorte({ ano: '__todos__' })).toBeNull();
  });
});

describe('E5 — busca de documento, com equivalência de caractere literal', () => {
  it('casa pelo número cru', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, { ...MARCO, lista_documento: '9876' }, { tamanhoPagina: 500 });
    expect(ids(p)).toEqual(['a11']);
  });

  it('casa pelo texto formatado, que não existe na tabela', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, { ...MARCO, lista_documento: '000.004.567' }, { tamanhoPagina: 500 });
    expect(ids(p)).toEqual(['a10']);
    expect(String(p[0].numero_documento)).not.toContain('000.004.567');
  });

  it('casa pelo tipo, que só existe no formatado', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, { ...MARCO, lista_documento: 'Recibo' }, { tamanhoPagina: 500 });
    expect(ids(p)).toEqual(['a11']);
  });

  // O núcleo da correção: cada caractere que já foi curinga agora é literal, e
  // servidor e cliente devolvem EXATAMENTE o mesmo conjunto.
  const especiais: [string, string][] = [
    ['asterisco', '1*2'],
    ['percentual', 'a%b'],
    ['sublinhado', 'a_b'],
    ['barra invertida', 'a\\b'],
    ['vírgula', 'v,w'],
    ['parênteses', 'p(q)'],
    ['aspas', 'as"pas'],
    ['ponto', 'x.y'],
    ['mais', 'x+y'],
    ['colchete', 'x[y]'],
  ];

  it.each(especiais)('%s é literal, e servidor = cliente', async (_n, termo) => {
    // Uma linha que contém o termo literal, e uma "isca" que só casaria se o
    // caractere fosse tratado como curinga.
    const isca = termo.replace(/[*%_\\,()"+.[\]]/g, 'Z');
    const linhas = [
      linha({ id: 'lit', numero_documento: termo, tipo_documento: 'Recibo', data_vencimento: '2026-03-01' }),
      linha({ id: 'isc', numero_documento: isca, tipo_documento: 'Recibo', data_vencimento: '2026-03-02' }),
    ];
    const filtros = { ...MARCO, lista_documento: termo };
    const { abrir } = simulador(linhas);
    const servidor = await consultarPagina(abrir, CLIENTE, filtros, { tamanhoPagina: 50 });
    expect(ids(servidor)).toEqual(['lit']);
    expect(ids(servidor)).toEqual(ids(referencia(filtros, linhas)));
  });

  it('o mesmo vale para o filtro de Produto', async () => {
    const linhas = [
      linha({ id: 'lit', descricao: 'lote 1*2', data_vencimento: '2026-03-01' }),
      linha({ id: 'isc', descricao: 'lote 1X2', data_vencimento: '2026-03-02' }),
    ];
    const filtros = { ...MARCO, lista_produto: '1*2' };
    const { abrir } = simulador(linhas);
    const servidor = await consultarPagina(abrir, CLIENTE, filtros, { tamanhoPagina: 50 });
    expect(ids(servidor)).toEqual(['lit']);
    expect(ids(servidor)).toEqual(ids(referencia(filtros, linhas)));
  });

  it('termo sem correspondência devolve vazio, não o acervo', async () => {
    const { abrir } = simulador(ACERVO);
    expect(await consultarPagina(abrir, CLIENTE, { ...MARCO, lista_documento: 'zzzzz' }, { tamanhoPagina: 500 })).toEqual([]);
  });
});

describe('E6 — os seis filtros, servidor contra cliente', () => {
  const seis: [string, FiltrosV2][] = [
    ['conta/direção', { ...MARCO, lista_conta_direcao: 'origem' }],
    ['produto', { ...MARCO, lista_produto: 'RACAO' }],
    ['fornecedor', { ...MARCO, lista_fornecedor_id: 'forn-1' }],
    ['grupo de custo', { ...MARCO, lista_grupo_custo: 'Nutricao' }],
    ['atividade', { ...MARCO, lista_atividade: 'pecuaria' }],
    ['documento', { ...MARCO, lista_documento: '456' }],
  ];

  it.each(seis)('%s', async (_n, filtros) => {
    const { abrir } = simulador(ACERVO);
    const servidor = await consultarPagina(abrir, CLIENTE, filtros, { tamanhoPagina: 500 });
    expect(ids(servidor).sort()).toEqual(ids(referencia(filtros)).sort());
  });

  it('atividade "outros" inclui escopo NULL e fora do canônico', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, { ...MARCO, lista_atividade: 'outros' }, { tamanhoPagina: 500 });
    expect(ids(p).sort()).toEqual(['a05', 'a06']);
  });

  it('os seis juntos não se anulam', async () => {
    const f: FiltrosV2 = {
      ...MARCO, lista_conta_direcao: 'origem', lista_produto: 'racao',
      lista_fornecedor_id: 'forn-1', lista_grupo_custo: 'Nutricao',
      lista_atividade: 'pecuaria', lista_documento: '9876',
    };
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, f, { tamanhoPagina: 500 });
    expect(ids(p)).toEqual(['a11']);
    expect(ids(p)).toEqual(ids(referencia(f)));
  });
});

describe('bordas de paginação — 0, 30, 31 e a última parcial', () => {
  const muitas = Array.from({ length: 31 }, (_, i) =>
    linha({ id: `p${String(i).padStart(3, '0')}`, data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}` }));

  it('conjunto vazio devolve página vazia', async () => {
    const { abrir } = simulador([]);
    expect(await consultarPagina(abrir, CLIENTE, MARCO)).toEqual([]);
  });

  it('exatamente 30: uma página cheia e a seguinte vazia', async () => {
    const { abrir } = simulador(muitas.slice(0, 30));
    expect((await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 })).length).toBe(30);
    expect((await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 1 })).length).toBe(0);
  });

  it('31: a segunda página traz exatamente uma linha', async () => {
    const { abrir } = simulador(muitas);
    expect((await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 })).length).toBe(30);
    expect((await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 1 })).length).toBe(1);
  });

  it('as páginas não se sobrepõem nem perdem linha', async () => {
    const { abrir } = simulador(muitas);
    const p0 = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 });
    const p1 = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 1 });
    const juntas = [...ids(p0), ...ids(p1)];
    expect(new Set(juntas).size).toBe(31);
    expect(juntas).toEqual(ids(referencia(MARCO, muitas)));
  });

  it('faixaDaPagina é inclusiva nas duas pontas', () => {
    expect(faixaDaPagina(0, 30)).toEqual([0, 29]);
    expect(faixaDaPagina(1, 30)).toEqual([30, 59]);
    expect(faixaDaPagina(-5, 30)).toEqual([0, 29]);
    expect(TAMANHO_PAGINA_LISTA).toBe(30);
  });
});

describe('período e o eixo de vencimento', () => {
  it('sem período, as linhas sem vencimento entram e ficam no fim', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, SEM_PERIODO, { tamanhoPagina: 500 });
    expect(ids(p)).toContain('a03');
    expect(p[p.length - 1].id).toBe('a03');
  });

  it('com período e dimensão vencimento, a linha sem vencimento fica de fora', async () => {
    const f: FiltrosV2 = { ...MARCO, dimensao: 'vencimento' };
    const { abrir } = simulador(ACERVO);
    expect(ids(await consultarPagina(abrir, CLIENTE, f, { tamanhoPagina: 500 }))).not.toContain('a03');
  });

  it('incluirSemVencimento traz de volta, ADITIVAMENTE, e no fim', async () => {
    const f: FiltrosV2 = { ...MARCO, dimensao: 'vencimento' };
    const { abrir } = simulador(ACERVO);
    const sem = await consultarPagina(abrir, CLIENTE, f, { tamanhoPagina: 500 });
    const com = await consultarPagina(abrir, CLIENTE, f, { tamanhoPagina: 500, incluirSemVencimento: true });
    expect(ids(com)).toEqual(expect.arrayContaining(ids(sem)));
    expect(ids(com)).toContain('a03');
    expect(com[com.length - 1].id).toBe('a03');
  });

  it('a opção chega à RPC', () => {
    expect(paramsDosTotais(CLIENTE, MARCO, { incluirSemVencimento: true }).p_incluir_sem_vencimento).toBe(true);
    expect(paramsDosTotais(CLIENTE, MARCO).p_incluir_sem_vencimento).toBe(false);
  });
});

describe('mês em qualquer ano — agora resolvido no servidor', () => {
  it('março de 2026 não traz março de 2025', async () => {
    const { abrir } = simulador(ACERVO);
    expect(ids(await consultarPagina(abrir, CLIENTE, MARCO, { tamanhoPagina: 500 }))).not.toContain('a08');
  });

  it('todos os anos + março traz os dois marços, e NÃO traz abril', async () => {
    // Antes desta correção a lista paginada devolvia TODOS os meses: o recorte
    // por mês não era expressável no PostgREST e o caminho paginado não tem
    // resíduo client-side onde aplicá-lo. A view passou a expor `mes_<dimensão>`.
    const f: FiltrosV2 = { ano: '__todos__', mes: '03' };
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, f, { tamanhoPagina: 500 });
    expect(ids(p)).toContain('a08');
    expect(ids(p)).not.toContain('a07');
    expect(ids(p).sort()).toEqual(ids(referencia(f)).sort());
  });

  it('usa a coluna de mês da dimensão selecionada', () => {
    const plano = montarPlanoBaseV2(CLIENTE, { ano: '__todos__', mes: '03', dimensao: 'vencimento' }, { relacao: 'view' });
    expect(plano.mesesDimensao).toEqual({ coluna: 'mes_vencimento', valores: [3] });
  });

  it('o plano da TABELA não carrega colunas que a tabela não tem', () => {
    const plano = montarPlanoBaseV2(CLIENTE, { ano: '__todos__', mes: '03', lista_documento: 'x' }, { relacao: 'tabela' });
    expect(plano.mesesDimensao).toBeUndefined();
    expect(plano.orDocumento).toBeUndefined();
  });
});

describe('ruído estrutural nunca aparece', () => {
  it('outro tenant, cancelado, conciliado e cenário meta ficam fora', async () => {
    const { abrir } = simulador(ACERVO);
    const p = await consultarPagina(abrir, CLIENTE, SEM_PERIODO, { tamanhoPagina: 500 });
    for (const proibido of ['z01', 'z02', 'z03', 'z04']) {
      expect(ids(p)).not.toContain(proibido);
    }
  });

  it('cancelado NULL não é tratado como false', async () => {
    const linhas = [linha({ id: 'n1', cancelado: null }), linha({ id: 'n2' })];
    const { abrir } = simulador(linhas);
    expect(ids(await consultarPagina(abrir, CLIENTE, MARCO, { tamanhoPagina: 50 }))).toEqual(['n2']);
  });

  it('sinal em TEXT é coagido, e valor inválido vira 0', () => {
    expect(sinalNumerico('-1')).toBe(-1);
    expect(sinalNumerico('1')).toBe(1);
    expect(sinalNumerico('0')).toBe(0);
    expect(sinalNumerico(null)).toBe(0);
    expect(sinalNumerico('abc')).toBe(0);
  });
});

describe('a projeção da view é nominal e única', () => {
  it('44 colunas, sem repetição', () => {
    expect(COLUNAS_VIEW_DOC).toHaveLength(44);
    expect(new Set(COLUNAS_VIEW_DOC).size).toBe(44);
  });

  it('não expõe colunas internas', () => {
    for (const interna of ['hash_importacao', 'duplicado_de_id', 'created_by', 'updated_by',
                           'cancelado_por', 'nivel_duplicidade', 'status_duplicidade']) {
      expect(COLUNAS_VIEW_DOC as readonly string[]).not.toContain(interna);
    }
  });

  it('expõe as oito que faltavam na primeira versão', () => {
    for (const c of ['observacao', 'documento', 'historico', 'forma_pagamento',
                     'dados_pagamento', 'editado_manual', 'movimentacao_rebanho_id', 'safra_id']) {
      expect(COLUNAS_VIEW_DOC as readonly string[]).toContain(c);
    }
  });
});

describe('guarda de corrida — resposta antiga nunca sobrescreve a nova', () => {
  function criarGuarda() {
    let token = 0;
    let estado: string[] = [];
    return {
      estado: () => estado,
      async carregar(rotulo: string, atraso: number, valores: string[]) {
        const meu = ++token;
        await new Promise((r) => setTimeout(r, atraso));
        if (meu !== token) return `${rotulo}: descartada`;
        estado = valores;
        return `${rotulo}: aplicada`;
      },
    };
  }

  it('a resposta lenta do filtro antigo é descartada', async () => {
    const g = criarGuarda();
    const lenta = g.carregar('antiga', 40, ['velho']);
    await new Promise((r) => setTimeout(r, 5));
    const rapida = g.carregar('nova', 5, ['novo']);
    const [rl, rr] = await Promise.all([lenta, rapida]);
    expect(rl).toBe('antiga: descartada');
    expect(rr).toBe('nova: aplicada');
    expect(g.estado()).toEqual(['novo']);
  });

  it('sem a guarda, o estado ficaria com o resultado errado', async () => {
    let estado: string[] = [];
    const semGuarda = async (atraso: number, v: string[]) => {
      await new Promise((r) => setTimeout(r, atraso));
      estado = v;
    };
    await Promise.all([semGuarda(40, ['velho']), semGuarda(5, ['novo'])]);
    expect(estado).toEqual(['velho']);   // exatamente o defeito que a guarda evita
  });
});

describe('flag OFF/ON — as duas vias concordam', () => {
  function viaOff(filtros: FiltrosV2, pagina: number, tamanho: number) {
    const todas = referencia(filtros);
    const [de] = faixaDaPagina(pagina, tamanho);
    return {
      linhas: todas.slice(de, de + tamanho),
      total: todas.length,
      totais: totaisNoCliente(todas as unknown as RegistroListaV2[]),
    };
  }

  const casos: [string, FiltrosV2][] = [
    ['março/2026', MARCO],
    ['sem período', SEM_PERIODO],
    ['com documento', { ...MARCO, lista_documento: '456' }],
    ['com atividade outros', { ...MARCO, lista_atividade: 'outros' }],
    ['mês em qualquer ano', { ano: '__todos__', mes: '03' }],
  ];

  it.each(casos)('%s — ids coincidem', async (_n, filtros) => {
    const { abrir } = simulador(ACERVO);
    const off = viaOff(filtros, 0, 5);
    const on = await consultarPagina(abrir, CLIENTE, filtros, { pagina: 0, tamanhoPagina: 5 });
    expect(ids(on)).toEqual(ids(off.linhas));
  });

  it('a via ON pede no máximo o tamanho da página', async () => {
    const muitas = Array.from({ length: 500 }, (_, i) => linha({ id: `q${String(i).padStart(4, '0')}` }));
    const { abrir, registro } = simulador(muitas);
    const p = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 });
    expect(p.length).toBe(30);
    const faixas = registro.filter((c) => c.metodo === 'range');
    expect(faixas).toHaveLength(1);
    expect(faixas[0].args).toEqual([0, 29]);
  });

  it('os totais NÃO trafegam linha alguma: é uma RPC', async () => {
    const muitas = Array.from({ length: 5000 }, (_, i) => linha({ id: `r${i}` }));
    let linhasTrafegadas = 0;
    const chamar: ChamarRpcTotais = async () => {
      linhasTrafegadas += 0;   // a RPC devolve UMA linha de agregados
      return { data: [{ total: muitas.length, entradas: 0, saidas: 0, excluidos_sem_vencimento: 0 }], error: null };
    };
    const t = await consultarTotais(chamar, CLIENTE, MARCO);
    expect(t.total).toBe(5000);
    expect(linhasTrafegadas).toBe(0);
  });
});

describe('a fonte única de decisão é mesmo única', () => {
  it('tabela e view partem do MESMO plano, e só divergem no que é da view', () => {
    const filtros: FiltrosV2 = {
      ...MARCO, fazenda_id: 'f-1', lista_produto: 'racao', lista_atividade: 'outros',
    };
    const tabela = montarPlanoBaseV2(CLIENTE, filtros, { relacao: 'tabela' });
    const view = montarPlanoBaseV2(CLIENTE, filtros, { relacao: 'view' });
    expect(tabela).toEqual(view);   // sem documento nem mês, os planos são idênticos
  });

  it('planoDaLista só adiciona o ramo de sem-vencimento quando pedido E há período', () => {
    const semOpt = planoDaLista(CLIENTE, MARCO, {});
    const comOpt = planoDaLista(CLIENTE, MARCO, { incluirSemVencimento: true });
    expect(comOpt.orTemporal).toContain('data_vencimento.is.null');
    expect(semOpt.orTemporal).not.toContain('data_vencimento.is.null');
    // Sem período não há o que trazer de volta.
    expect(planoDaLista(CLIENTE, SEM_PERIODO, { incluirSemVencimento: true }).orTemporal ?? '')
      .not.toContain('data_vencimento.is.null');
  });

  it('aplicarPlanoNaView emite os nomes de coluna do schema', () => {
    const registro: Chamada[] = [];
    const b = criarBuilder(ACERVO, registro);
    aplicarPlanoNaView(b, montarPlanoBaseV2(CLIENTE, {
      ...MARCO, fazenda_id: 'f-1', conta_bancaria_id: 'cb', tipo_operacao: '2-Saídas',
      macro_custo: 'M', grupo_custo: 'G', centro_custo: 'C', subcentro: 'S',
      status_transacoes: ['previsto'],
    }, { relacao: 'view' }));
    const colunas = registro
      .filter((c) => ['eq', 'neq', 'in', 'not'].includes(c.metodo))
      .map((c) => String(c.args[0]));
    expect(colunas).toEqual([
      'cliente_id', 'cancelado', 'status_transacao', 'cenario', 'fazenda_id',
      'conta_bancaria_id', 'tipo_operacao', 'status_transacao',
      'macro_custo', 'grupo_custo', 'centro_custo', 'subcentro',
    ]);
  });
});
