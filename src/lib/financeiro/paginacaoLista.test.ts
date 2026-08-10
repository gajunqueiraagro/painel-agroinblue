/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-4 — V6, V7, V9 e V13 no wiring.
 *
 * Aqui se prova o que liga a máquina de estados ao servidor: a grade recebe no
 * máximo 30, cada página pede só o seu range, a exportação lê o APLICADO (nunca
 * o rascunho) e uma resposta atrasada não sobrescreve a atual.
 */
import { describe, it, expect } from 'vitest';
import {
  consultarPagina,
  buscarConjuntoCompleto,
  filtrosAplicadosDaLista,
  TAMANHO_PAGINA_LISTA,
  TODOS,
  type AbrirView,
  type BuilderView,
  type LinhaViewDoc,
  type RespostaView,
} from './listaPaginadaV2';
import {
  reduzirLista, ESTADO_INICIAL, calcularPaginacao,
} from './estadoFiltrosLista';
import type { FiltrosV2 } from './filtrosBaseV2';
import { formatDocumento } from './documentoHelper';

// ── simulador (mesma semântica dos demais arquivos da frente) ────────────────
type Linha = Record<string, unknown>;
interface Chamada { metodo: string; args: unknown[] }

function descitar(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return v;
}
function partirTopo(s: string): string[] {
  const out: string[] = []; let atual = ''; let prof = 0; let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) { if (c === '\\') { atual += c + (s[++i] ?? ''); continue; } if (c === '"') aspas = false; atual += c; continue; }
    if (c === '"') { aspas = true; atual += c; continue; }
    if (c === '(') prof++; if (c === ')') prof--;
    if (c === ',' && prof === 0) { out.push(atual); atual = ''; continue; }
    atual += c;
  }
  if (atual) out.push(atual);
  return out;
}
function avaliarTermo(l: Linha, termo: string): boolean {
  const t = termo.trim();
  if (t.startsWith('and(') && t.endsWith(')')) return partirTopo(t.slice(4, -1)).every((x) => avaliarTermo(l, x));
  const p1 = t.indexOf('.'); const col = t.slice(0, p1); const resto = t.slice(p1 + 1); const v = l[col];
  if (resto === 'is.null') return v === null || v === undefined;
  if (resto === 'not.is.null') return v !== null && v !== undefined;
  const p2 = resto.indexOf('.'); const op = resto.slice(0, p2); const bruto = resto.slice(p2 + 1);
  switch (op) {
    case 'eq':  return String(v) === descitar(bruto);
    case 'gte': return v != null && String(v) >= descitar(bruto);
    case 'lt':  return v != null && String(v) < descitar(bruto);
    case 'gt':  return v != null && Number(v) > Number(descitar(bruto));
    case 'in': { const it = partirTopo(bruto.replace(/^\(/, '').replace(/\)$/, '')).map(descitar); return v != null && it.includes(String(v)); }
    case 'not': return v != null && !avaliarTermo(l, `${col}.${bruto}`);
    case 'imatch': return v != null && new RegExp(descitar(bruto), 'i').test(String(v));
    default: throw new Error(`operador ${op}`);
  }
}
function criarBuilder(fonte: readonly Linha[], reg: Chamada[], op?: { count?: 'exact'; head?: boolean }): BuilderView {
  const preds: ((l: Linha) => boolean)[] = [];
  const ordens: { coluna: string; asc: boolean; nullsFirst: boolean }[] = [];
  let faixa: [number, number] | null = null;
  const r = (m: string, ...a: unknown[]) => { reg.push({ metodo: m, args: a }); };
  const exec = (): RespostaView => {
    let itens = preds.reduce<Linha[]>((acc, p) => acc.filter(p), [...fonte]);
    for (const o of [...ordens].reverse()) {
      itens = [...itens].sort((a, b) => {
        const va = a[o.coluna] ?? null; const vb = b[o.coluna] ?? null;
        if (va === vb) return 0;
        if (va === null) return o.nullsFirst ? -1 : 1;
        if (vb === null) return o.nullsFirst ? 1 : -1;
        return (String(va) < String(vb) ? -1 : 1) * (o.asc ? 1 : -1);
      });
    }
    const total = itens.length;
    if (faixa) itens = itens.slice(faixa[0], faixa[1] + 1);
    return { data: (op?.head ? [] : itens) as unknown as LinhaViewDoc[], count: op?.count === 'exact' ? total : null, error: null };
  };
  const self: BuilderView = {
    eq(c, v) { r('eq', c, v); preds.push((l) => String(l[c]) === String(v)); return self; },
    neq(c, v) { r('neq', c, v); preds.push((l) => String(l[c]) !== String(v)); return self; },
    in(c, vs) { r('in', c, vs); preds.push((l) => vs.map(String).includes(String(l[c]))); return self; },
    not(c, o, v) { r('not', c, o, v); preds.push((l) => !(o === 'is' && (l[c] ?? null) === v)); return self; },
    or(f) { r('or', f); preds.push((l) => partirTopo(f).some((t) => avaliarTermo(l, t))); return self; },
    order(c, o) { r('order', c, o); ordens.push({ coluna: c, asc: o.ascending, nullsFirst: o.nullsFirst !== false }); return self; },
    range(a, b) { r('range', a, b); faixa = [a, b]; return self; },
    then(ok, falha) { return Promise.resolve(exec()).then(ok, falha); },
  };
  return self;
}
function simulador(linhas: readonly Linha[]) {
  const registro: Chamada[] = [];
  const abrir: AbrirView = (colunas, op) => { registro.push({ metodo: 'select', args: [colunas, op] }); return criarBuilder(linhas, registro, op); };
  return { abrir, registro };
}

const CLIENTE = 'c-1';
function linha(over: Partial<Linha> & { id: string }): Linha {
  const base: Linha = {
    cliente_id: CLIENTE, fazenda_id: 'f-1', cancelado: false, cenario: 'real',
    status_transacao: 'previsto', conciliado_em: null, tipo_operacao: '2-Saídas',
    sinal: '-1', valor: 10, data_competencia: '2026-03-10', data_pagamento: '2026-03-10',
    data_vencimento: '2026-03-10', descricao: 'item', numero_documento: null,
    tipo_documento: null, favorecido_id: null, grupo_custo: 'Nutricao',
    escopo_negocio: 'pecuaria', lote_importacao_id: null, ...over,
  };
  base.documento_formatado = formatDocumento((base.tipo_documento as string | null) ?? null, (base.numero_documento as string | null) ?? null);
  const mes = (d: unknown) => (d ? Number(String(d).slice(5, 7)) : null);
  base.mes_competencia = mes(base.data_competencia);
  base.mes_vencimento = mes(base.data_vencimento);
  base.mes_pagamento = mes(base.data_pagamento);
  base.mes_financeira = mes(base.data_pagamento ?? base.data_vencimento);
  return base;
}

const ACERVO: Linha[] = Array.from({ length: 87 }, (_, i) => linha({
  id: `x${String(i).padStart(3, '0')}`,
  data_vencimento: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
  descricao: i % 2 === 0 ? 'racao bovina' : 'milho grao',
}));
const MARCO: FiltrosV2 = { ano: '2026', mes: '03' };

// ─────────────────────────────────────────────────────────────────────────────

describe('V6 — a grade recebe no máximo 30', () => {
  it.each([0, 1, 2])('página %i devolve no máximo 30', async (pg) => {
    const { abrir } = simulador(ACERVO);
    const linhas = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: pg });
    expect(linhas.length).toBeLessThanOrEqual(TAMANHO_PAGINA_LISTA);
  });

  it('a última página traz o resto, não o conjunto', async () => {
    const { abrir } = simulador(ACERVO);
    expect((await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 2 })).length).toBe(27);
  });

  it('87 disponíveis nunca chegam juntos à grade', async () => {
    const { abrir } = simulador(ACERVO);
    const p0 = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 });
    expect(p0.length).toBe(30);
    expect(p0.length).not.toBe(87);
  });
});

describe('V7 — troca de página pede só o range daquela página', () => {
  it.each([[0, [0, 29]], [1, [30, 59]], [2, [60, 89]]] as [number, number[]][])(
    'página %i → range %j', async (pg, esperado) => {
      const { abrir, registro } = simulador(ACERVO);
      await consultarPagina(abrir, CLIENTE, MARCO, { pagina: pg });
      const faixas = registro.filter((c) => c.metodo === 'range');
      expect(faixas).toHaveLength(1);
      expect(faixas[0].args).toEqual(esperado);
    });

  it('navegar NÃO carrega tudo: nenhuma página pede range aberto', async () => {
    const { abrir, registro } = simulador(ACERVO);
    for (const pg of [0, 1, 2, 1, 0]) {
      await consultarPagina(abrir, CLIENTE, MARCO, { pagina: pg });
    }
    const faixas = registro.filter((c) => c.metodo === 'range').map((c) => c.args as number[]);
    expect(faixas).toHaveLength(5);
    for (const [de, ate] of faixas) expect(ate - de + 1).toBe(30);
  });

  it('trocar de página não altera os filtros emitidos', async () => {
    const f = { ...MARCO, lista_produto: 'racao' };
    const { abrir, registro } = simulador(ACERVO);
    await consultarPagina(abrir, CLIENTE, f, { pagina: 0 });
    const orsP0 = registro.filter((c) => c.metodo === 'or').map((c) => c.args[0]);
    registro.length = 0;
    await consultarPagina(abrir, CLIENTE, f, { pagina: 2 });
    const orsP2 = registro.filter((c) => c.metodo === 'or').map((c) => c.args[0]);
    expect(orsP2).toEqual(orsP0);
  });
});

describe('V9 — a exportação lê o APLICADO, nunca o rascunho', () => {
  it('rascunho digitado depois de aplicar não entra no arquivo', async () => {
    // aplicado = produto 'racao'; rascunho passa a 'milho' sem aplicar
    let estado = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'racao' });
    estado = reduzirLista(estado, { tipo: 'aplicar' });
    estado = reduzirLista(estado, { tipo: 'editar', campo: 'produto', valor: 'milho' });

    const doAplicado = filtrosAplicadosDaLista(MARCO, estado.aplicado);
    const doRascunho = filtrosAplicadosDaLista(MARCO, estado.rascunho);
    expect(doAplicado.lista_produto).toBe('racao');
    expect(doRascunho.lista_produto).toBe('milho');

    const { abrir } = simulador(ACERVO);
    const exportado = await buscarConjuntoCompleto(abrir, CLIENTE, doAplicado, { tamanhoLote: 50 });
    expect(exportado.length).toBe(44);
    expect(exportado.every((l) => String(l.descricao).includes('racao'))).toBe(true);
  });

  it('depois de aplicar de novo, o arquivo acompanha', async () => {
    let estado = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'produto', valor: 'milho' });
    estado = reduzirLista(estado, { tipo: 'aplicar' });
    const { abrir } = simulador(ACERVO);
    const exportado = await buscarConjuntoCompleto(
      abrir, CLIENTE, filtrosAplicadosDaLista(MARCO, estado.aplicado), { tamanhoLote: 50 });
    expect(exportado.length).toBe(43);
    expect(exportado.every((l) => String(l.descricao).includes('milho'))).toBe(true);
  });

  it('a opção sem-vencimento também só vale depois de aplicar', () => {
    const e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'incluirSemVencimento', valor: true });
    expect(e.rascunho.incluirSemVencimento).toBe(true);
    expect(e.aplicado.incluirSemVencimento).toBe(false);
  });

  it('sentinela __all__ do rascunho não vira filtro no aplicado', () => {
    let e = reduzirLista(ESTADO_INICIAL, { tipo: 'editar', campo: 'atividade', valor: TODOS });
    e = reduzirLista(e, { tipo: 'aplicar' });
    expect(filtrosAplicadosDaLista(MARCO, e.aplicado).lista_atividade).toBeUndefined();
  });
});

describe('V13 — corrida: resposta antiga não sobrescreve a atual', () => {
  /** Reproduz o token monotônico do hook, isolado do React. */
  function guarda() {
    let token = 0;
    let visivel: string[] = [];
    return {
      visivel: () => visivel,
      async carregar(atraso: number, ids: string[]) {
        const meu = ++token;
        await new Promise((r) => setTimeout(r, atraso));
        if (meu !== token) return 'descartada';
        visivel = ids;
        return 'aplicada';
      },
    };
  }

  it('a página antiga, mais lenta, é descartada', async () => {
    const g = guarda();
    const lenta = g.carregar(40, ['pagina-1']);
    await new Promise((r) => setTimeout(r, 5));
    const rapida = g.carregar(5, ['pagina-2']);
    expect(await lenta).toBe('descartada');
    expect(await rapida).toBe('aplicada');
    expect(g.visivel()).toEqual(['pagina-2']);
  });

  it('trocar de filtro no meio de uma paginação descarta o resultado antigo', async () => {
    const g = guarda();
    const filtroAntigo = g.carregar(30, ['do-filtro-antigo']);
    await new Promise((r) => setTimeout(r, 2));
    const filtroNovo = g.carregar(3, ['do-filtro-novo']);
    await Promise.all([filtroAntigo, filtroNovo]);
    expect(g.visivel()).toEqual(['do-filtro-novo']);
  });

  it('sem a guarda, a tela ficaria com o resultado errado', async () => {
    let visivel: string[] = [];
    const semGuarda = async (atraso: number, v: string[]) => {
      await new Promise((r) => setTimeout(r, atraso));
      visivel = v;
    };
    await Promise.all([semGuarda(40, ['antigo']), semGuarda(5, ['novo'])]);
    expect(visivel).toEqual(['antigo']);   // o defeito que a guarda evita
  });
});

describe('a paginação acompanha o count do servidor, não a grade', () => {
  it('87 no servidor, 30 na tela', async () => {
    const { abrir } = simulador(ACERVO);
    const pagina = await consultarPagina(abrir, CLIENTE, MARCO, { pagina: 0 });
    const p = calcularPaginacao(87, 0, TAMANHO_PAGINA_LISTA);
    expect(pagina.length).toBe(30);
    expect(p.totalPaginas).toBe(3);
    expect(p.ate).toBe(30);
  });
});
