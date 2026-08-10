/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-3 — gates E1..E7.
 *
 * Exportação e cancelamento em massa deixaram de depender do array da tela.
 * Estes testes provam isso do jeito que importa: simulando o PostgREST com
 * MAIS de 30 registros, de modo que qualquer volta ao array visual apareça
 * como um número errado, não como uma opinião.
 *
 * O simulador reproduz a semântica medida contra o PostgREST real, a mesma de
 * `listaPaginadaV2.test.ts`: `or()` com grupos `and(...)`, `in`, `is.null`,
 * `not.is.null`, `imatch` como regex POSIX, `range` inclusivo.
 */
import { describe, it, expect } from 'vitest';
import {
  consultarPagina,
  buscarConjuntoCompleto,
  prepararCancelamentoEmLote,
  lotesDeCancelamento,
  ehElegivelParaCancelamento,
  LOTE_CANCELAMENTO,
  filtrosAplicadosDaLista,
  ordenarPorVencimentoNoCliente,
  filtrarSeisNoCliente,
  ErroConjuntoIncompleto,
  ErroConjuntoObsoleto,
  TAMANHO_PAGINA_LISTA,
  TODOS,
  type AbrirView,
  type BuilderView,
  type LinhaViewDoc,
  type RegistroListaV2,
  type RespostaView,
} from './listaPaginadaV2';
import type { FiltrosV2 } from './filtrosBaseV2';
import { formatDocumento } from './documentoHelper';

// ─────────────────────────────────────────────────────────────────────────────
// PostgREST simulado (idêntico em semântica ao de listaPaginadaV2.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;

function descitar(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return v;
}

function partirTopo(s: string): string[] {
  const out: string[] = [];
  let atual = ''; let prof = 0; let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '\\') { atual += c + (s[++i] ?? ''); continue; }
      if (c === '"') aspas = false;
      atual += c; continue;
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
    case 'not': return v != null && !avaliarTermo(l, `${col}.${bruto}`);
    case 'imatch': return v != null && new RegExp(descitar(bruto), 'i').test(String(v));
    default: throw new Error(`operador nao suportado: ${op}`);
  }
}

interface Chamada { metodo: string; args: unknown[] }

function criarBuilder(
  fonte: readonly Linha[],
  registro: Chamada[],
  op?: { count?: 'exact'; head?: boolean },
  forcar?: () => RespostaView,
): BuilderView {
  const predicados: ((l: Linha) => boolean)[] = [];
  const ordens: { coluna: string; asc: boolean; nullsFirst: boolean }[] = [];
  let faixa: [number, number] | null = null;
  const reg = (m: string, ...a: unknown[]) => { registro.push({ metodo: m, args: a }); };

  const executar = (): RespostaView => {
    // Resposta forçada sobrevive ao encadeamento — um `{...builder, then}` não
    // sobreviveria, porque cada método devolve `self`, não o objeto espalhado.
    if (forcar) return forcar();
    let itens = predicados.reduce<Linha[]>((acc, p) => acc.filter(p), [...fonte]);
    for (const o of [...ordens].reverse()) {
      itens = [...itens].sort((a, b) => {
        const va = a[o.coluna] ?? null; const vb = b[o.coluna] ?? null;
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
    not(c, o, v) { reg('not', c, o, v); predicados.push((l) => !(o === 'is' && (l[c] ?? null) === v)); return self; },
    or(f) { reg('or', f); predicados.push((l) => partirTopo(f).some((t) => avaliarTermo(l, t))); return self; },
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

/** Simulador que falha no N-ésimo lote — para provar que erro impede mutação. */
function simuladorQueFalha(linhas: readonly Linha[], loteQueFalha: number) {
  const registro: Chamada[] = [];
  let lotes = 0;
  const abrir: AbrirView = (_colunas, op) => {
    const b = criarBuilder(linhas, registro, op);
    const originalRange = b.range.bind(b);
    b.range = (de, ate) => {
      const r = originalRange(de, ate);
      if (lotes++ === loteQueFalha) {
        const falho = { ...r, then: (ok: (v: RespostaView) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'falha de rede' } }).then(ok) };
        return falho as unknown as BuilderView;
      }
      return r;
    };
    return b;
  };
  return { abrir, registro };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acervo com MAIS de 30 registros — a página visual não pode dar conta
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTE = 'c-1';

function linha(over: Partial<Linha> & { id: string }): Linha {
  const base: Linha = {
    cliente_id: CLIENTE, fazenda_id: 'f-1', cancelado: false, cenario: 'real',
    status_transacao: 'previsto', conciliado_em: null,
    tipo_operacao: '2-Saídas', sinal: '-1', valor: 10,
    data_competencia: '2026-03-10', data_pagamento: '2026-03-10', data_vencimento: '2026-03-10',
    descricao: 'item', numero_documento: null, tipo_documento: null,
    favorecido_id: null, grupo_custo: 'Nutricao', escopo_negocio: 'pecuaria',
    lote_importacao_id: null,
    ...over,
  };
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

/** 87 linhas: bem acima dos 30 da página e de um único lote pequeno. */
const MUITAS: Linha[] = Array.from({ length: 87 }, (_, i) =>
  linha({
    id: `x${String(i).padStart(3, '0')}`,
    data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
    descricao: i % 2 === 0 ? 'racao bovina' : 'milho grao',
  }));

const MARCO: FiltrosV2 = { ano: '2026', mes: '03' };
const ids = (ls: readonly { id?: unknown }[]) => ls.map((l) => String(l.id));

function referencia(filtros: FiltrosV2, linhas: readonly Linha[]): Linha[] {
  const base = linhas.filter((l) =>
    l.cliente_id === CLIENTE && l.cancelado === false
    && l.status_transacao !== 'conciliado' && l.cenario !== 'meta');
  const seis = filtrarSeisNoCliente(base as unknown as RegistroListaV2[], filtros);
  return ordenarPorVencimentoNoCliente(seis) as unknown as Linha[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('E1 — a lista visual continua pedindo apenas 30 por página', () => {
  it('uma página, um range de 30, mesmo com 87 disponíveis', async () => {
    const { abrir, registro } = simulador(MUITAS);
    const p = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 });
    expect(p.length).toBe(TAMANHO_PAGINA_LISTA);
    const faixas = registro.filter((c) => c.metodo === 'range');
    expect(faixas).toHaveLength(1);
    expect(faixas[0].args).toEqual([0, 29]);
  });

  it('a lista NÃO usa a busca de conjunto completo', async () => {
    const { abrir, registro } = simulador(MUITAS);
    await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 2 });
    const faixas = registro.filter((c) => c.metodo === 'range');
    expect(faixas).toHaveLength(1);
    expect(faixas[0].args).toEqual([60, 89]);
  });
});

describe('E2 — a exportação traz TODO o conjunto, não a página', () => {
  it('87 registros saem 87, não 30', async () => {
    const { abrir } = simulador(MUITAS);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 });
    expect(todos.length).toBe(87);
    expect(todos.length).toBeGreaterThan(TAMANHO_PAGINA_LISTA);
  });

  it('percorre quantos lotes forem necessários', async () => {
    const { abrir, registro } = simulador(MUITAS);
    await buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 });
    const faixas = registro.filter((c) => c.metodo === 'range').map((c) => c.args);
    expect(faixas).toEqual([[0, 29], [30, 59], [60, 89]]);
  });

  it('conjunto vazio devolve lista vazia, sem erro', async () => {
    const { abrir } = simulador([]);
    expect(await buscarConjuntoCompleto(abrir, CLIENTE, MARCO)).toEqual([]);
  });

  it('o conjunto coincide com a referência client-side', async () => {
    const { abrir } = simulador(MUITAS);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 25 });
    expect(ids(todos)).toEqual(ids(referencia(MARCO, MUITAS)));
  });

  it('lote cheio só com repetidos LEVANTA — não devolve parcial (G1)', async () => {
    // Acervo deslizando: toda página devolve as MESMAS 30 linhas.
    const registro: Chamada[] = [];
    const abrir: AbrirView = (colunas, op) => {
      const b = criarBuilder(MUITAS, registro, op);
      if (op?.head) return b;                     // o count continua honesto: 87
      const orig = b.range.bind(b);
      b.range = () => orig(0, 29);
      return b;
    };
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('conjunto acima do teto LEVANTA erro em vez de devolver parcial', async () => {
    const { abrir } = simulador(MUITAS);
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10, maxLotes: 3 }),
    ).rejects.toBeInstanceOf(ErroConjuntoIncompleto);
  });
});

describe('E3 — a exportação usa filtros APLICADOS, não rascunho', () => {
  const estadoAplicado = { produto: 'racao', atividade: TODOS, contaOrigem: TODOS, contaDestino: TODOS };
  const estadoRascunho = { produto: 'milho', atividade: TODOS, contaOrigem: TODOS, contaDestino: TODOS };

  it('o conjunto segue o instantâneo aplicado, e ignora o rascunho posterior', async () => {
    const aplicados = filtrosAplicadosDaLista(MARCO, estadoAplicado);
    // rascunho montado DEPOIS não pode influir: o instantâneo já foi tirado
    filtrosAplicadosDaLista(MARCO, estadoRascunho);

    const { abrir } = simulador(MUITAS);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, aplicados, { tamanhoLote: 50 });
    expect(todos.length).toBe(44);                                   // só as 'racao bovina'
    expect(todos.every((l) => String(l.descricao).includes('racao'))).toBe(true);
    expect(todos.some((l) => String(l.descricao).includes('milho'))).toBe(false);
  });

  it('os seis filtros da tela chegam ao conjunto', () => {
    const f = filtrosAplicadosDaLista(MARCO, {
      contaOrigem: 'cb-1', contaDestino: TODOS,
      produto: 'racao', documento: '123', fornecedor: 'forn-1',
      atividade: 'outros', grupo: 'Nutricao',
    });
    expect(f.lista_conta_direcao).toBe('origem');
    expect(f.lista_produto).toBe('racao');
    expect(f.lista_documento).toBe('123');
    expect(f.lista_fornecedor_id).toBe('forn-1');
    expect(f.lista_atividade).toBe('outros');
    expect(f.lista_grupo_custo).toBe('Nutricao');
  });

  it('sentinela __all__ e texto vazio não viram filtro', () => {
    const f = filtrosAplicadosDaLista(MARCO, {
      contaOrigem: TODOS, contaDestino: TODOS, produto: '   ',
      documento: '', fornecedor: TODOS, atividade: TODOS, grupo: TODOS,
    });
    expect(f.lista_conta_direcao).toBeUndefined();
    expect(f.lista_produto).toBeUndefined();
    expect(f.lista_documento).toBeUndefined();
    expect(f.lista_fornecedor_id).toBeUndefined();
    expect(f.lista_atividade).toBeUndefined();
    expect(f.lista_grupo_custo).toBeUndefined();
  });

  it('as duas contas ativas NÃO geram recorte direcional', () => {
    // Com origem e destino, o recorte vira transferência entre contas e quem
    // resolve é a base. Aplicar direção junto estreitaria a mais.
    const f = filtrosAplicadosDaLista(MARCO, { contaOrigem: 'cb-1', contaDestino: 'cb-2' });
    expect(f.lista_conta_direcao).toBeUndefined();
  });

  it('a base é preservada intacta', () => {
    const base: FiltrosV2 = { ano: '2026', mes: '03', fazenda_id: 'f-1', dimensao: 'vencimento' };
    const f = filtrosAplicadosDaLista(base, { produto: 'x' });
    expect(f.ano).toBe('2026');
    expect(f.mes).toBe('03');
    expect(f.fazenda_id).toBe('f-1');
    expect(f.dimensao).toBe('vencimento');
  });
});

describe('E4 — ordenação determinística e regra de NULL no período', () => {
  const comNulos: Linha[] = [
    ...Array.from({ length: 35 }, (_, i) =>
      linha({ id: `d${String(i).padStart(3, '0')}`, data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}` })),
    linha({ id: 'sem1', data_vencimento: null, data_pagamento: '2026-03-15' }),
    linha({ id: 'sem2', data_vencimento: null, data_pagamento: '2026-03-16' }),
  ];

  it('conjunto completo sai ordenado por vencimento, nulos ao fim, id como desempate', async () => {
    const { abrir } = simulador(comNulos);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, { ano: '__todos__' }, { tamanhoLote: 10 });
    expect(ids(todos)).toEqual(ids(referencia({ ano: '__todos__' }, comNulos)));
    expect(todos.slice(-2).map((l) => l.id).sort()).toEqual(['sem1', 'sem2']);
    expect(todos.slice(0, -2).every((l) => l.data_vencimento != null)).toBe(true);
  });

  it('emite a ordenação do contrato em TODOS os lotes', async () => {
    const { abrir, registro } = simulador(comNulos);
    await buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10 });
    const ordens = registro.filter((c) => c.metodo === 'order');
    expect(ordens.length % 2).toBe(0);
    for (let i = 0; i < ordens.length; i += 2) {
      expect(ordens[i].args).toEqual(['data_vencimento', { ascending: true, nullsFirst: false }]);
      expect(ordens[i + 1].args).toEqual(['id', { ascending: true }]);
    }
  });

  it('com período e dimensão vencimento, os sem-vencimento ficam FORA', async () => {
    const { abrir } = simulador(comNulos);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE,
      { ...MARCO, dimensao: 'vencimento' }, { tamanhoLote: 50 });
    expect(ids(todos)).not.toContain('sem1');
    expect(ids(todos)).not.toContain('sem2');
  });

  it('incluirSemVencimento traz de volta, aditivamente, e no fim', async () => {
    const { abrir } = simulador(comNulos);
    const f: FiltrosV2 = { ...MARCO, dimensao: 'vencimento' };
    const sem = await buscarConjuntoCompleto(abrir, CLIENTE, f, { tamanhoLote: 50 });
    const com = await buscarConjuntoCompleto(abrir, CLIENTE, f, { tamanhoLote: 50, incluirSemVencimento: true });
    expect(ids(com)).toEqual(expect.arrayContaining(ids(sem)));
    expect(com.length).toBe(sem.length + 2);
    expect(com.slice(-2).map((l) => l.id).sort()).toEqual(['sem1', 'sem2']);
  });
});

describe('E5 — a semântica dos filtros é a do núcleo 2C-2C', () => {
  const especiais: [string, string][] = [
    ['asterisco', '1*2'], ['percentual', 'a%b'], ['sublinhado', 'a_b'],
    ['barra', 'a\\b'], ['vírgula', 'v,w'], ['parênteses', 'p(q)'], ['aspas', 'as"pas'],
  ];

  it.each(especiais)('busca literal de Documento: %s', async (_n, termo) => {
    const isca = termo.replace(/[*%_\\,()"]/g, 'Z');
    const linhas = [
      linha({ id: 'lit', numero_documento: termo, tipo_documento: 'Recibo' }),
      linha({ id: 'isc', numero_documento: isca, tipo_documento: 'Recibo' }),
    ];
    const f = { ...MARCO, lista_documento: termo };
    const { abrir } = simulador(linhas);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, f, { tamanhoLote: 10 });
    expect(ids(todos)).toEqual(['lit']);
    expect(ids(todos)).toEqual(ids(referencia(f, linhas)));
  });

  it('Atividade: outros = financeiro + NULL + demais', async () => {
    const linhas = [
      linha({ id: 'pec', escopo_negocio: 'pecuaria' }),
      linha({ id: 'agr', escopo_negocio: 'agricultura' }),
      linha({ id: 'adm', escopo_negocio: 'administrativo' }),
      linha({ id: 'fin', escopo_negocio: 'financeiro' }),
      linha({ id: 'nul', escopo_negocio: null }),
      linha({ id: 'out', escopo_negocio: 'qualquer-outro' }),
    ];
    const { abrir } = simulador(linhas);
    const outros = await buscarConjuntoCompleto(abrir, CLIENTE,
      { ...MARCO, lista_atividade: 'outros' }, { tamanhoLote: 10 });
    expect(ids(outros).sort()).toEqual(['fin', 'nul', 'out']);

    for (const canonica of ['pecuaria', 'agricultura', 'administrativo']) {
      const r = await buscarConjuntoCompleto(abrir, CLIENTE,
        { ...MARCO, lista_atividade: canonica }, { tamanhoLote: 10 });
      expect(r).toHaveLength(1);
    }
  });

  it('conta direcional, fornecedor e grupo mantêm a semântica', async () => {
    const linhas = [
      linha({ id: 'sai', sinal: '-1', favorecido_id: 'f1', grupo_custo: 'G1' }),
      linha({ id: 'ent', sinal: '1', tipo_operacao: '1-Entradas', favorecido_id: 'f2', grupo_custo: 'G2' }),
      linha({ id: 'trf', sinal: '1', tipo_operacao: '3-Transferências', favorecido_id: 'f1', grupo_custo: 'G1' }),
    ];
    const { abrir } = simulador(linhas);
    const origem = await buscarConjuntoCompleto(abrir, CLIENTE, { ...MARCO, lista_conta_direcao: 'origem' }, { tamanhoLote: 10 });
    expect(ids(origem).sort()).toEqual(['sai', 'trf']);
    const forn = await buscarConjuntoCompleto(abrir, CLIENTE, { ...MARCO, lista_fornecedor_id: 'f1' }, { tamanhoLote: 10 });
    expect(ids(forn).sort()).toEqual(['sai', 'trf']);
    const grupo = await buscarConjuntoCompleto(abrir, CLIENTE, { ...MARCO, lista_grupo_custo: 'G2' }, { tamanhoLote: 10 });
    expect(ids(grupo)).toEqual(['ent']);
  });
});

describe('E6 — erro e obsolescência não contaminam nem geram arquivo parcial', () => {
  it('falha no 2º lote levanta erro; nada de conjunto parcial', async () => {
    const { abrir } = simuladorQueFalha(MUITAS, 1);
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeDefined();
  });

  it('sinal abortado interrompe com erro nomeado, não com conjunto curto', async () => {
    const sinal = { aborted: false };
    const { abrir } = simulador(MUITAS);
    const promessa = buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10, sinal });
    sinal.aborted = true;
    await expect(promessa).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('a lista visual continua funcionando depois de uma exportação que falhou', async () => {
    const { abrir: abrirFalho } = simuladorQueFalha(MUITAS, 1);
    await expect(buscarConjuntoCompleto(abrirFalho, CLIENTE, MARCO, { tamanhoLote: 30 })).rejects.toBeDefined();
    const { abrir } = simulador(MUITAS);
    const pagina = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 });
    expect(pagina.length).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E7 — cancelamento em massa
//
// Reproduz a sequência do hook, isolada do React: ler o conjunto INTEIRO,
// filtrar elegíveis, deduplicar, e só então mutar em lotes de 100.
// ─────────────────────────────────────────────────────────────────────────────

interface ResultadoCancelamento { cancelados: number; elegiveis: number; lotesMutados: string[][] }

/**
 * Espelha a sequência do hook usando as MESMAS funções que ele usa
 * (`prepararCancelamentoEmLote` e `lotesDeCancelamento`). O que fica aqui é só
 * a mutação, que no hook é o UPDATE do supabase — substituída por um registro
 * dos lotes, para que o teste veja exatamente o que seria escrito.
 */
async function cancelarComoNoHook(
  abrir: AbrirView,
  filtros: FiltrosV2,
  opcoes: { sinal?: { aborted: boolean }; tamanhoLote?: number; falharMutacaoNoLote?: number } = {},
): Promise<ResultadoCancelamento> {
  const lotesMutados: string[][] = [];
  const ids = await prepararCancelamentoEmLote(abrir, CLIENTE, filtros, {
    tamanhoLote: opcoes.tamanhoLote ?? 30,
    sinal: opcoes.sinal,
  });
  if (ids.length === 0) return { cancelados: 0, elegiveis: 0, lotesMutados };
  if (opcoes.sinal?.aborted) return { cancelados: 0, elegiveis: ids.length, lotesMutados };

  let cancelados = 0;
  for (const batch of lotesDeCancelamento(ids)) {
    if (opcoes.falharMutacaoNoLote === lotesMutados.length) break;
    lotesMutados.push(batch);
    cancelados += batch.length;
  }
  return { cancelados, elegiveis: ids.length, lotesMutados };
}

describe('E7 — cancelarRealizadosImportados opera sobre TODO o filtro', () => {
  /** 45 elegíveis + 42 inelegíveis: mais que os 30 da página visual. */
  const acervoCancel: Linha[] = [
    ...Array.from({ length: 45 }, (_, i) => linha({
      id: `el${String(i).padStart(3, '0')}`,
      status_transacao: 'realizado', lote_importacao_id: `lote-${i % 3}`,
      data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
    ...Array.from({ length: 20 }, (_, i) => linha({
      id: `np${String(i).padStart(3, '0')}`,
      status_transacao: 'previsto', lote_importacao_id: `lote-x`,
      data_vencimento: '2026-03-05',
    })),
    ...Array.from({ length: 22 }, (_, i) => linha({
      id: `nm${String(i).padStart(3, '0')}`,
      status_transacao: 'realizado', lote_importacao_id: null,
      data_vencimento: '2026-03-06',
    })),
  ];

  it('45 elegíveis são preparados, não 30', async () => {
    const { abrir } = simulador(acervoCancel);
    const r = await cancelarComoNoHook(abrir, MARCO);
    expect(r.elegiveis).toBe(45);
    expect(r.elegiveis).toBeGreaterThan(TAMANHO_PAGINA_LISTA);
    expect(r.cancelados).toBe(45);
  });

  it('a elegibilidade é preservada: só realizado + importado + não cancelado', async () => {
    const { abrir } = simulador(acervoCancel);
    const r = await cancelarComoNoHook(abrir, MARCO);
    const mutados = r.lotesMutados.flat();
    expect(mutados.every((id) => id.startsWith('el'))).toBe(true);
    expect(mutados.some((id) => id.startsWith('np'))).toBe(false);
    expect(mutados.some((id) => id.startsWith('nm'))).toBe(false);
  });

  it('respeita os filtros aplicados — não cancela fora do filtro', async () => {
    const marcados: Linha[] = acervoCancel.map((l, i) =>
      ({ ...l, descricao: i % 2 === 0 ? 'alvo' : 'fora' }));
    const { abrir } = simulador(marcados);
    const r = await cancelarComoNoHook(abrir, { ...MARCO, lista_produto: 'alvo' });
    const mutados = new Set(r.lotesMutados.flat());
    const forasElegiveis = marcados.filter((l) =>
      l.descricao === 'fora' && l.status_transacao === 'realizado' && l.lote_importacao_id);
    expect(forasElegiveis.length).toBeGreaterThan(0);
    for (const f of forasElegiveis) expect(mutados.has(String(f.id))).toBe(false);
  });

  it('zero elegíveis NÃO dispara mutação alguma', async () => {
    const semElegiveis = acervoCancel.filter((l) => !String(l.id).startsWith('el'));
    const { abrir } = simulador(semElegiveis);
    const r = await cancelarComoNoHook(abrir, MARCO);
    expect(r.elegiveis).toBe(0);
    expect(r.cancelados).toBe(0);
    expect(r.lotesMutados).toEqual([]);
  });

  it('ids repetidos na fonte agora falham FECHADO, em vez de mutar um conjunto ambíguo', async () => {
    // Antes do gate de contagem este caso devolvia 45 ids deduplicados e seguia.
    // Com o gate, um acervo que reporta 90 linhas mas só tem 65 ids distintos é
    // um conjunto que não se pode explicar — e cancelamento não age no escuro.
    const comDuplicata = [...acervoCancel, ...acervoCancel.filter((l) => String(l.id).startsWith('el'))];
    const { abrir } = simulador(comDuplicata);
    await expect(cancelarComoNoHook(abrir, MARCO)).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('a deduplicação em si continua provada, onde ela é observável', async () => {
    const { abrir } = simulador(acervoCancel);
    const ids = await prepararCancelamentoEmLote(abrir, CLIENTE, MARCO, { tamanhoLote: 30 });
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(45);
  });

  it('falha na LEITURA completa impede o início da mutação', async () => {
    const { abrir } = simuladorQueFalha(acervoCancel, 1);
    await expect(cancelarComoNoHook(abrir, MARCO, { tamanhoLote: 30 })).rejects.toBeDefined();
  });

  it('conjunto acima do teto também impede a mutação', async () => {
    const { abrir } = simulador(acervoCancel);
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10, maxLotes: 2 }),
    ).rejects.toBeInstanceOf(ErroConjuntoIncompleto);
  });

  it('troca de filtro durante a preparação aborta antes de mutar', async () => {
    const sinal = { aborted: false };
    const { abrir } = simulador(acervoCancel);
    const p = cancelarComoNoHook(abrir, MARCO, { sinal, tamanhoLote: 10 });
    sinal.aborted = true;
    await expect(p).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('lotes de 100 preservados', async () => {
    const muitosElegiveis = Array.from({ length: 250 }, (_, i) => linha({
      id: `e${String(i).padStart(4, '0')}`,
      status_transacao: 'realizado', lote_importacao_id: 'L',
      data_vencimento: '2026-03-10',
    }));
    const { abrir } = simulador(muitosElegiveis);
    const r = await cancelarComoNoHook(abrir, MARCO, { tamanhoLote: 1000 });
    expect(r.elegiveis).toBe(250);
    expect(r.lotesMutados.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it('falha parcial preserva o já persistido, sem zerar', async () => {
    const muitosElegiveis = Array.from({ length: 250 }, (_, i) => linha({
      id: `e${String(i).padStart(4, '0')}`,
      status_transacao: 'realizado', lote_importacao_id: 'L',
      data_vencimento: '2026-03-10',
    }));
    const { abrir } = simulador(muitosElegiveis);
    const r = await cancelarComoNoHook(abrir, MARCO, { tamanhoLote: 1000, falharMutacaoNoLote: 2 });
    expect(r.cancelados).toBe(200);      // dois lotes já persistidos
    expect(r.elegiveis).toBe(250);
  });
});

describe('E7 — as peças reais, testadas diretamente', () => {
  it('ehElegivelParaCancelamento exige os três critérios', () => {
    const ok = { status_transacao: 'realizado', lote_importacao_id: 'L', cancelado: false };
    expect(ehElegivelParaCancelamento(ok)).toBe(true);
    expect(ehElegivelParaCancelamento({ ...ok, status_transacao: 'previsto' })).toBe(false);
    expect(ehElegivelParaCancelamento({ ...ok, lote_importacao_id: null })).toBe(false);
    expect(ehElegivelParaCancelamento({ ...ok, cancelado: true })).toBe(false);
    // cancelado NULL não é false: fora, e é o correto
    expect(ehElegivelParaCancelamento({ ...ok, cancelado: null })).toBe(false);
  });

  it('lotesDeCancelamento preserva o lote de 100 e não inventa lote vazio', () => {
    expect(LOTE_CANCELAMENTO).toBe(100);
    expect(lotesDeCancelamento([])).toEqual([]);
    expect(lotesDeCancelamento(['a'])).toEqual([['a']]);
    const ids = Array.from({ length: 250 }, (_, i) => `i${i}`);
    expect(lotesDeCancelamento(ids).map((b) => b.length)).toEqual([100, 100, 50]);
    expect(lotesDeCancelamento(Array.from({ length: 200 }, (_, i) => `i${i}`)).length).toBe(2);
  });

  it('prepararCancelamentoEmLote devolve ids únicos e elegíveis, do filtro inteiro', async () => {
    const acervo = [
      ...Array.from({ length: 45 }, (_, i) => linha({
        id: `el${i}`, status_transacao: 'realizado', lote_importacao_id: 'L',
        data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      })),
      linha({ id: 'np', status_transacao: 'previsto', lote_importacao_id: 'L' }),
    ];
    const { abrir } = simulador(acervo);
    const ids = await prepararCancelamentoEmLote(abrir, CLIENTE, MARCO, { tamanhoLote: 30 });
    expect(ids).toHaveLength(45);
    expect(new Set(ids).size).toBe(45);
    expect(ids).not.toContain('np');
  });
});

describe('listarMigracaoParaCancelar continua FORA desta frente', () => {
  it('o cancelamento de migração não importa nada do módulo da lista', async () => {
    // Guarda documental: se alguém acoplar cancelarMigracao à busca de conjunto,
    // este teste deixa de fazer sentido e o revisor é obrigado a olhar.
    const modulo = await import('./listaPaginadaV2');
    expect(Object.keys(modulo)).not.toContain('cancelarMigracao');
    expect(Object.keys(modulo)).not.toContain('listarMigracaoParaCancelar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G1..G9 — correção do retorno parcial silencioso em buscarConjuntoCompleto
//
// O oráculo é um `count` exato tirado do MESMO plano. Sem ele, a paginação por
// offset não distingue "acabou" de "perdi linhas no caminho".
// ─────────────────────────────────────────────────────────────────────────────

/** Simulador cujo count e cujas páginas podem divergir de propósito. */
function simuladorDivergente(opts: {
  paginas: readonly Linha[];
  contarComo?: number;
  encolherApos?: number;
}) {
  const registro: Chamada[] = [];
  let lidas = 0;
  const abrir: AbrirView = (colunas, op) => {
    registro.push({ metodo: 'select', args: [colunas, op] });
    if (op?.head) {
      // count exato, possivelmente forçado a um valor diferente do real
      const total = opts.contarComo ?? opts.paginas.length;
      return criarBuilder(opts.paginas, registro, op,
        () => ({ data: [], count: total, error: null }));
    }
    // o acervo encolhe depois de N linhas lidas
    const fonte = opts.encolherApos !== undefined && lidas >= opts.encolherApos
      ? opts.paginas.slice(0, opts.encolherApos)
      : opts.paginas;
    const b = criarBuilder(fonte, registro, op);
    const orig = b.range.bind(b);
    b.range = (de, ate) => { lidas = ate + 1; return orig(de, ate); };
    return b;
  };
  return { abrir, registro };
}

describe('G — gate de contagem exata', () => {
  it('G1 página cheia só com repetidos → ErroConjuntoObsoleto', async () => {
    const registro: Chamada[] = [];
    const abrir: AbrirView = (colunas, op) => {
      const b = criarBuilder(MUITAS, registro, op);
      if (op?.head) return b;
      const orig = b.range.bind(b);
      b.range = () => orig(0, 29);
      return b;
    };
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('G2 conjunto encolhe entre páginas → ErroConjuntoObsoleto', async () => {
    // count diz 87; depois de 30 linhas lidas o acervo cai para 30.
    const { abrir } = simuladorDivergente({
      paginas: MUITAS, contarComo: 87, encolherApos: 30,
    });
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('G2b conjunto CRESCE entre count e leitura → também falha fechado', async () => {
    const { abrir } = simuladorDivergente({ paginas: MUITAS, contarComo: 50 });
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });

  it('G3 exatamente maxLotes × tamanhoLote, estável → devolve tudo', async () => {
    const trinta = MUITAS.slice(0, 30);
    const { abrir } = simulador(trinta);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, MARCO, {
      tamanhoLote: 10, maxLotes: 3,     // teto = 30, conjunto = 30
    });
    expect(todos.length).toBe(30);
    expect(new Set(ids(todos)).size).toBe(30);
  });

  it('G3b um a mais que o teto → ErroConjuntoIncompleto', async () => {
    const trintaEUm = MUITAS.slice(0, 31);
    const { abrir } = simulador(trintaEUm);
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10, maxLotes: 3 }),
    ).rejects.toBeInstanceOf(ErroConjuntoIncompleto);
  });

  it('G4 conjunto maior que o teto falha ANTES de ler página alguma', async () => {
    const { abrir, registro } = simulador(MUITAS);
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10, maxLotes: 2 }),
    ).rejects.toBeInstanceOf(ErroConjuntoIncompleto);
    // nenhuma leitura de linha aconteceu: só o count
    expect(registro.filter((c) => c.metodo === 'range')).toHaveLength(0);
  });

  it('G5 conjunto vazio → count 0, devolve [] sem erro', async () => {
    const { abrir } = simulador([]);
    await expect(buscarConjuntoCompleto(abrir, CLIENTE, MARCO)).resolves.toEqual([]);
  });

  it('G6 conjunto estável comum → idêntico ao aprovado, ordem e filtros preservados', async () => {
    const { abrir } = simulador(MUITAS);
    const todos = await buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 25 });
    expect(todos.length).toBe(87);
    expect(ids(todos)).toEqual(ids(referencia(MARCO, MUITAS)));

    const filtrado = await buscarConjuntoCompleto(abrir, CLIENTE,
      { ...MARCO, lista_produto: 'racao' }, { tamanhoLote: 25 });
    expect(filtrado.length).toBe(44);
    expect(ids(filtrado)).toEqual(ids(referencia({ ...MARCO, lista_produto: 'racao' }, MUITAS)));
  });

  it('o count usa head e o MESMO plano das páginas', async () => {
    const { abrir, registro } = simulador(MUITAS);
    await buscarConjuntoCompleto(abrir, CLIENTE,
      { ...MARCO, lista_produto: 'racao' }, { tamanhoLote: 50 });
    const selects = registro.filter((c) => c.metodo === 'select');
    expect(selects[0].args).toEqual(['id', { count: 'exact', head: true }]);
    // o ramo do filtro de produto aparece TAMBEM na consulta de contagem
    const ors = registro.filter((c) => c.metodo === 'or').map((c) => String(c.args[0]));
    expect(ors.filter((o) => o.includes('descricao.imatch')).length).toBeGreaterThanOrEqual(2);
  });

  it('count indisponível propaga erro — não exporta, não cancela', async () => {
    const registro: Chamada[] = [];
    const abrir: AbrirView = (colunas, op) => {
      if (!op?.head) return criarBuilder(MUITAS, registro, op);
      return criarBuilder(MUITAS, registro, op,
        () => ({ data: [], count: null, error: null }));
    };
    await expect(
      buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeInstanceOf(ErroConjuntoIncompleto);
  });

  it('erro na consulta de count propaga', async () => {
    const registro: Chamada[] = [];
    const abrir: AbrirView = (colunas, op) => {
      if (!op?.head) return criarBuilder(MUITAS, registro, op);
      return criarBuilder(MUITAS, registro, op,
        () => ({ data: null, count: null, error: { message: 'falha' } }));
    };
    await expect(buscarConjuntoCompleto(abrir, CLIENTE, MARCO)).rejects.toBeDefined();
  });
});

describe('G7/G8 — consumidores diante de ErroConjuntoObsoleto', () => {
  /** Espelha o handleExport: nada é gerado se o carregador levantar. */
  async function exportarComoNoMenu(carregar: () => Promise<unknown[]>) {
    const gerados: string[] = [];
    let mensagem = '';
    try {
      const linhas = await carregar();
      if (linhas.length === 0) { mensagem = 'vazio'; return { gerados, mensagem }; }
      gerados.push('arquivo');
    } catch (e) {
      mensagem = e instanceof ErroConjuntoIncompleto
        ? e.message
        : 'Não foi possível concluir a exportação.';
    }
    return { gerados, mensagem };
  }

  it('G7 exportação não gera arquivo e mostra mensagem acionável', async () => {
    const registro: Chamada[] = [];
    const abrir: AbrirView = (colunas, op) => {
      const b = criarBuilder(MUITAS, registro, op);
      if (op?.head) return b;
      const orig = b.range.bind(b);
      b.range = () => orig(0, 29);
      return b;
    };
    const r = await exportarComoNoMenu(
      () => buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 30 }));
    expect(r.gerados).toEqual([]);
    expect(r.mensagem).not.toBe('');
  });

  it('G7b acima do teto: mensagem diz o que fazer', async () => {
    const { abrir } = simulador(MUITAS);
    const r = await exportarComoNoMenu(
      () => buscarConjuntoCompleto(abrir, CLIENTE, MARCO, { tamanhoLote: 10, maxLotes: 2 }));
    expect(r.gerados).toEqual([]);
    expect(r.mensagem).toContain('Estreite o filtro');
  });

  it('G8 cancelamento não inicia mutação alguma', async () => {
    const elegiveis = Array.from({ length: 45 }, (_, i) => linha({
      id: `el${i}`, status_transacao: 'realizado', lote_importacao_id: 'L',
      data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const registro: Chamada[] = [];
    const abrir: AbrirView = (colunas, op) => {
      const b = criarBuilder(elegiveis, registro, op);
      if (op?.head) return b;
      const orig = b.range.bind(b);
      b.range = () => orig(0, 29);
      return b;
    };
    await expect(
      cancelarComoNoHook(abrir, MARCO, { tamanhoLote: 30 }),
    ).rejects.toBeInstanceOf(ErroConjuntoObsoleto);
  });
});
