/**
 * OC-CC-ABATE-01 PR 2 — a tela do conta corrente fala abate. A regra mora no banco (`oc_conta_corrente`, PR 1): a linha
 * 'deducao' (Funrural), a chave `deduzido` e o saldo. Aqui se trava o que a TELA faz com elas: o quarto tipo de linha no leitor
 * e no extrato, o lado 'abate' nos textos, o menu da deducao, o rodape "Funrural retido", o espelho das categorias do abate
 * (preso a' migration) e as ligacoes nos hospedeiros (lidas da fonte).
 * ⚠ Nenhum abate esta' em conta corrente ate' o PR 3: a prova de runtime e' a do primeiro abate migrado.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AbaContaCorrenteOC, acoesDaLinha, MOTIVO_ACAO } from './AbaContaCorrenteOC';
import {
  lerContaCorrente, descricaoDoEvento, rotuloDeducao, liquidoNaTela, rotuloRecebimento, rotuloDoSaldo, ROTULO_AGUARDANDO_SAIDA,
  TIPOS_EXPLICACAO_DO_LADO, type ContaCorrente, type LinhaContaCorrente,
} from '@/lib/oc/contaCorrente';
import {
  subcentroAbatePorCategoria, SEXO_POR_CATEGORIA, SUBCENTRO_ABATE_MACHOS, SUBCENTRO_ABATE_FEMEAS,
} from '@/hooks/useOperacaoLiquidacao';
import type { OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';

const DEDUCAO = {
  tipo: 'deducao', subtipo: 'funrural', data: '2025-03-19', parte_id: 'd1', lancamento_id: 'ld1', lote_ordem: 1,
  categoria: 'desmama_m', conta_ordem: 5030, conta: 'Impostos e Despesas de Abates e Vendas', mov_entrega: 2500.10,
  status: 'sem_caixa', no_saldo: true, saldo: -564379.45,
};
/* O fixture `cc()` de `abaContaCorrente.test.tsx`, com a deducao logo depois da primeira entrega (ordem 0,5 do banco). */
function cc(extra: Record<string, unknown> = {}, comDeducao = true): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 25, valor_acordado: 993496.13, entregue: 993496.13, cab_entregue: 317,
    recebido: 992138.24, programado: 0, devolvido: 0, saldo: -1357.89, explicado: 0, saldo_a_explicar: -1357.89,
    falta_explicar: -1357.89, situacao: 'falta_receber', a_entregar: 0, ultima_entrega: '2025-03-20',
    recebimentos_sem_conta_bancaria: 1, saidas_sem_entrega: 0,
    ...(comDeducao ? { deduzido: 2500.10 } : {}),
    linhas: [
      { tipo: 'entrega', data: '2025-03-19', parte_id: 'e1', lote_ordem: 1, cab: 178, categoria: 'desmama_m', conta_ordem: 1120,
        conta: 'Venda de Desmama Machos', mov_entrega: -566879.55, status: 'sem_caixa', no_saldo: true, saldo: -566879.55 },
      ...(comDeducao ? [DEDUCAO] : []),
      { tipo: 'entrega', data: '2025-03-20', parte_id: 'e2', lote_ordem: 2, cab: 139, categoria: 'desmama_m', conta_ordem: 1120,
        conta: 'Venda de Desmama Machos', mov_entrega: -426616.58, status: 'sem_caixa', no_saldo: true, saldo: -993496.13 },
      { tipo: 'recebimento', data: '2025-04-17', parte_id: 'r1', conta_ordem: 1120, conta: 'Venda de Desmama Machos',
        mov_recebido: 992138.24, status: 'sem_conta_bancaria', no_saldo: true, saldo: -1357.89 },
    ],
    explicacoes: [],
    ...extra,
  });
  if (!r) throw new Error('fixture');
  return r;
}

function api(c: ContaCorrente): OcContaCorrenteApi {
  return {
    contaCorrente: c, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null),
    listarVinculaveis: vi.fn(async () => ({ erro: null, itens: [] })),
    vincularRecebimento: vi.fn(async () => null),
    explicarSaldo: vi.fn(async () => null),
    desfazerExplicacao: vi.fn(async () => null),
    simularExplicacao: vi.fn(async () => ({ previa: null, erro: null })),
    lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })),
    listarLotes: vi.fn(async () => []),
    listarContas: vi.fn(async () => []),
  };
}
const deducaoDe = (c: ContaCorrente): LinhaContaCorrente => {
  const l = c.linhas.find(x => x.tipo === 'deducao');
  if (!l) throw new Error('sem deducao');
  return l;
};

describe('T1 — o leitor conhece a deducao e o deduzido', () => {
  it('a linha vem tipo deducao, componente funrural, subtipo null; deduzido 2500,10; sem a chave, null (nunca 0)', () => {
    const c = cc();
    const d = deducaoDe(c);
    expect(d.tipo).toBe('deducao');
    expect(d.componente).toBe('funrural');
    expect(d.subtipo).toBeNull();
    expect(d.movEntrega).toBe(2500.10);
    expect(c.deduzido).toBe(2500.10);
    expect(cc({}, false).deduzido).toBeNull();
    /* fora da deducao o componente e' sempre null */
    expect(c.linhas.filter(l => l.tipo !== 'deducao').every(l => l.componente === null)).toBe(true);
  });
});

describe('T2 — a Descricao da deducao', () => {
  it('"Retenções da NF"; componente desconhecido = "Dedução"; o "Receb. n/N" nao conta a deducao', () => {
    const c = cc();
    expect(descricaoDoEvento(deducaoDe(c), c.linhas, 'abate', s => s ?? '')).toBe('Retenções da NF');
    expect(rotuloDeducao('xyz')).toBe('Dedução');
    expect(rotuloDeducao(null)).toBe('Dedução');
    expect(rotuloRecebimento(c.linhas, 'r1', 'abate')).toBe('Receb. 1/1');
  });
});

describe('T3 — o saldo do abate fala do frigorifico', () => {
  it('falta receber / adiantado pelo frigorífico / quitado / aguardando saída', () => {
    /* OC-CC-SINAL-FAZENDA-01 — o rotulo recebe o saldo NA TELA: positivo falta, negativo adiantado */
    expect(rotuloDoSaldo(1, 'abate')).toBe('Saldo · falta receber');
    expect(rotuloDoSaldo(-1, 'abate')).toBe('Saldo · adiantado pelo frigorífico');
    expect(rotuloDoSaldo(0, 'abate')).toBe('Saldo · quitado');
    expect(rotuloDoSaldo(0, 'abate', 'aguardando_saida')).toBe(ROTULO_AGUARDANDO_SAIDA);
  });
});

describe('T4 — no abate nao ha ajuste de preco (o banco recusa)', () => {
  it('os quatro tipos, sem ajuste_preco', () => {
    expect(TIPOS_EXPLICACAO_DO_LADO.abate).not.toContain('ajuste_preco');
    expect([...TIPOS_EXPLICACAO_DO_LADO.abate].sort())
      .toEqual(['desconto_comercial', 'devolucao_comprador', 'outra_receita', 'permuta_despesa']);
  });
});

describe('T5 — o menu da deducao', () => {
  it('abrir (vale com lancamento; sem ele, o motivo de sempre) e desfazer apagado com o motivo do acerto', () => {
    const d = deducaoDe(cc());
    const a = acoesDaLinha(d, 'abate', false);
    expect(a.map(x => x.chave)).toEqual(['abrir', 'desfazer_explicacao']);
    expect(a[0].motivo).toBeNull();
    expect(a[1].motivo).toBe(MOTIVO_ACAO.deducaoDoAcerto);
    expect(a[1].motivo).toBe('a dedução acompanha o acerto do abate · corrija as retenções na aba Abate');
    const sem = acoesDaLinha({ ...d, lancamentoId: null }, 'abate', false);
    expect(sem[0].motivo).toBe(MOTIVO_ACAO.semLancamento);
  });
});

describe('T6 — o extrato do abate', () => {
  it('a linha Retenções, o rodape "bruto − retenções", o titulo e o card do frigorifico; o clique abre o lancamento', () => {
    const abrir = vi.fn();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="abate" onAbrirLancamento={abrir} />);
    const tabela = screen.getByTestId('conta-corrente-tabela');
    const tr = tabela.querySelector('tr[data-tipo="deducao"]');
    if (!tr) throw new Error('sem a linha deducao');
    const tds = [...tr.querySelectorAll('td')];
    expect(tds[3].textContent).toBe('Retenções');
    expect(tds[4].textContent).toBe('Retenções da NF');
    expect(tds[2].textContent).toBe('');
    expect(tr.querySelector('[data-celula="banco"]')?.textContent).toBe('');
    /* OC-CC-SINAL-FAZENDA-01 — no banco a deducao vem +2.500,10 (efeito no saldo); na tela ela REDUZ: negativa, vermelha */
    expect(tds[7].textContent).toBe('\u22122.500,10');
    expect(tds[7].className).toContain('text-[#b91c1c]');
    expect(tr.className).toContain('bg-[#fff7ed]');
    expect(screen.getByTestId('total-deduzido').textContent).toBe('bruto 993.496,13 \u2212 retenções 2.500,10');
    /* a entrega positiva verde (receita), o recebido positivo verde, o saldo do banco −1.357,89 vira +1.357,89 = falta, vermelho */
    const ent = tabela.querySelector('tr[data-tipo="entrega"]')?.querySelectorAll('td')[7];
    expect(ent?.textContent).toBe('566.879,55');
    expect(ent?.className).toContain('text-[#15803d]');
    const rec = tabela.querySelector('tr[data-tipo="recebimento"]')?.querySelectorAll('td');
    expect(rec?.[8].textContent).toBe('992.138,24');
    expect(rec?.[8].className).toContain('text-[#15803d]');
    expect(rec?.[9].textContent).toBe('1.357,89');
    expect(rec?.[9].className).toContain('text-[#b91c1c]');
    expect(screen.getByTestId('total-saldo').textContent).toBe('1.357,89');
    expect(screen.getByTestId('card-saldo').textContent).toContain('Saldo · falta receber');
    expect(screen.getAllByText('Conta corrente do frigorífico').length).toBeGreaterThan(0);
    expect(screen.getByTestId('card-entrega').textContent).toContain('Líquido entregue');
    expect(screen.getByTestId('card-entrega').textContent).toContain('990.996,03');
    expect(tr.getAttribute('data-clicavel')).toBe('sim');
    fireEvent.click(tr);
    expect(abrir).toHaveBeenCalledWith('ld1');
  });
});

describe('T7 — o rodape das retencoes e\' so\' do abate', () => {
  it('o MESMO envelope (com deduzido): na venda a celula nao existe; no abate, "bruto − retenções"', () => {
    const r = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="venda" />);
    expect(screen.queryByTestId('total-deduzido')).toBeNull();
    /* so' o RODAPE: o envelope de teste traz uma linha de deducao, que tambem se chama "Retenções" (na venda real nao ha). */
    const rodape = screen.getByTestId('conta-corrente-tabela').querySelector('tfoot');
    if (!rodape) throw new Error('sem rodape');
    expect(within(rodape as HTMLElement).queryAllByText(/retenções/i)).toHaveLength(0);
    r.unmount();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="abate" />);
    expect(screen.getByTestId('total-deduzido').textContent).toBe('bruto 993.496,13 \u2212 retenções 2.500,10');
  });
});

describe('T8 — o espelho das categorias do abate, preso a\' migration', () => {
  it('as categorias novas e o desconhecido', () => {
    expect(subcentroAbatePorCategoria('bezerros_m')).toBe(SUBCENTRO_ABATE_MACHOS);
    expect(subcentroAbatePorCategoria('machos_adultos')).toBe(SUBCENTRO_ABATE_MACHOS);
    expect(subcentroAbatePorCategoria('bezerras_f')).toBe(SUBCENTRO_ABATE_FEMEAS);
    expect(subcentroAbatePorCategoria('femeas_adultas')).toBe(SUBCENTRO_ABATE_FEMEAS);
    expect(subcentroAbatePorCategoria('xyz')).toBeNull();
  });
  it('cada sexo do front == a lista de `_oc_subcentro_abate` no banco', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261027197300_oc_cc_abate_01_banco.sql'), 'utf8');
    const re = /when p_categoria in \(([^)]*)\) then '(Abates de Machos|Abates de Fêmeas)'/g;
    const listas = [...sql.matchAll(re)];
    /* auto-teste do detector: exatamente as duas listas */
    expect(listas).toHaveLength(2);
    const doBanco = (rotulo: string) => {
      const m = listas.find(x => x[2] === rotulo);
      return (m?.[1] ?? '').split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
    };
    const doFront = (sexo: 'macho' | 'femea') =>
      Object.entries(SEXO_POR_CATEGORIA).filter(([, s]) => s === sexo).map(([k]) => k).sort();
    expect(doBanco('Abates de Machos')).toEqual(doFront('macho'));
    expect(doBanco('Abates de Fêmeas')).toEqual(doFront('femea'));
    expect(doFront('macho').length).toBeGreaterThan(0);
  });
});

describe('T10 — FIX: o modal do abate nao transborda (coluna principal encolhe, rotulos do tamanho da venda)', () => {
  const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  /* a classe da coluna logo abaixo do grid de duas colunas do shell */
  const colunaPrincipal = (src: string) => {
    /* UI-SEM-CORTE-02: a grade de duas colunas passou a valer a partir de `md` */
    const i = src.indexOf('md:grid-cols-[minmax(0,1fr)_240px]');
    if (i < 0) return null;
    const m = src.slice(i).match(/<div className="([^"]*)">/);
    return m ? m[1] : null;
  };
  it('auto-teste do leitor', () => {
    expect(colunaPrincipal('x md:grid-cols-[minmax(0,1fr)_240px]">\n  <div className="flex min-w-0">')).toBe('flex min-w-0');
    expect(colunaPrincipal('sem grid')).toBeNull();
  });
  it('a coluna principal do shell do abate tem min-w-0, como a da venda e a da compra', () => {
    for (const p of ['src/components/abate/AbateModalShell.tsx', 'src/components/venda/VendaModalShell.tsx', 'src/components/compra/CompraModalShell.tsx']) {
      const c = colunaPrincipal(ler(p));
      expect(c, p).not.toBeNull();
      expect((c ?? '').split(/\s+/), p).toContain('min-w-0');
    }
  });
  it('os rotulos do abate nao passam dos da venda (o titulo do frigorifico e o grupo do saldo sao as excecoes declaradas)', () => {
    const rotulos = (lado: 'abate' | 'venda') => {
      const r = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado={lado} />);
      const card = screen.getByTestId('card-entrega').querySelector('span')?.textContent ?? '';
      const botoes = [...document.querySelectorAll('button')].map(b => (b.textContent ?? '').trim()).filter(t => t.startsWith('+'));
      r.unmount();
      return { card, botoes };
    };
    const a = rotulos('abate'); const v = rotulos('venda');
    expect(a.card.length).toBeGreaterThan(0);
    expect(a.card.length).toBeLessThanOrEqual(v.card.length);
    expect(a.botoes.length).toBe(v.botoes.length);
    a.botoes.forEach((t, i) => expect(t.length).toBeLessThanOrEqual(v.botoes[i].length));
  });
});

describe('T9 — as ligacoes nos hospedeiros (fonte)', () => {
  const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const conta = (src: string, s: string) => src.split(s).length - 1;
  it('auto-teste do detector', () => {
    expect(conta('a x a x a', 'a')).toBe(3);
    expect(conta('nada', 'a x')).toBe(0);
  });
  it('AbaFinanceiroOC liga o abate em 3 lugares; o shell do abate monta o hook uma vez e o passa; o pai passa ocRascunho 2x', () => {
    expect(conta(ler('src/components/compra/AbaFinanceiroOC.tsx'), "api.tipoOperacao === 'abate'")).toBe(3);
    const shell = ler('src/components/abate/AbateModalShell.tsx');
    expect(conta(shell, 'useOcContaCorrente(')).toBe(1);
    expect(conta(shell, 'ccApiExterno={ccApi}')).toBe(1);
    expect(conta(ler('src/pages/LancamentosTab.tsx'), 'ocRascunho={ocRascunho}')).toBe(2);
  });
});

/* OC-CC-TOTAL-LIQUIDO-01 — o liquido do abate: bruto − retencoes, do envelope (nunca a soma das linhas, que tem explicacoes). */
describe('T11 — o liquido do abate no card, no total da coluna e no rodape', () => {
  /* O abate da Vera (2d39d7e9): entrega 104.712,87, retencoes 1.706,81, recebido 103.006,06, quitado. */
  const vera = () => {
    const r = lerContaCorrente({
      modelo: 'conta_corrente', versao: 9, valor_acordado: 104712.87, entregue: 104712.87, cab_entregue: 18,
      recebido: 103006.06, programado: 0, devolvido: 0, saldo: 0, explicado: 0, saldo_a_explicar: 0, falta_explicar: 0,
      situacao: 'quitado', a_entregar: 0, ultima_entrega: '2026-09-15', recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0,
      deduzido: 1706.81,
      linhas: [
        { tipo: 'entrega', data: '2026-09-15', parte_id: 'e1', lote_ordem: 1, cab: 18, categoria: 'vacas', conta_ordem: 1155,
          conta: 'Abates de Fêmeas', mov_entrega: -104712.87, status: 'sem_caixa', no_saldo: true, saldo: -104712.87 },
        { ...DEDUCAO, data: '2026-09-15', mov_entrega: 1706.81, saldo: -103006.06 },
        { tipo: 'recebimento', data: '2026-09-20', parte_id: 'r1', conta_ordem: 1155, conta: 'Abates de Fêmeas',
          mov_recebido: 103006.06, status: 'realizado', no_saldo: true, saldo: 0 },
      ],
      explicacoes: [],
    });
    if (!r) throw new Error('fixture');
    return r;
  };
  const totalEntrega = () => {
    const tf = screen.getByTestId('conta-corrente-tabela').querySelector('tfoot tr');
    const tds = [...(tf?.querySelectorAll('td') ?? [])];
    return { entrega: tds[4]?.textContent, recebido: tds[5]?.textContent };
  };
  it('o helper: abate = bruto − retencoes; venda e compra = entregue, mesmo com a chave (em centavos)', () => {
    expect(liquidoNaTela(vera(), 'abate')).toBe(103006.06);
    expect(liquidoNaTela(cc(), 'abate')).toBe(990996.03);
    expect(liquidoNaTela(cc(), 'venda')).toBe(993496.13);
    expect(liquidoNaTela(cc(), 'compra')).toBe(993496.13);
    expect(liquidoNaTela(cc({}, false), 'abate')).toBe(993496.13);
  });
  it('Vera: card e total 103.006,06 (= o recebido); rodape "bruto 104.712,87 − retenções 1.706,81"', () => {
    render(<AbaContaCorrenteOC api={api(vera())} somenteLeitura={false} lado="abate" />);
    expect(screen.getByTestId('card-entrega').textContent).toBe('Líquido entregue103.006,06');
    expect(totalEntrega()).toEqual({ entrega: '103.006,06', recebido: '103.006,06' });
    expect(screen.getByTestId('total-deduzido').textContent).toBe('bruto 104.712,87 \u2212 retenções 1.706,81');
    expect(screen.getByTestId('total-deduzido').className).toContain('text-[#c2410c]');
  });
  it('venda sem deducao: card e total = entregue, sem a celula do rodape (o de hoje)', () => {
    render(<AbaContaCorrenteOC api={api(cc({}, false))} somenteLeitura={false} lado="venda" />);
    expect(screen.getByTestId('card-entrega').textContent).toBe('Entregue · DRE R$993.496,13');
    expect(totalEntrega().entrega).toBe('993.496,13');
    expect(screen.queryByTestId('total-deduzido')).toBeNull();
  });
});
