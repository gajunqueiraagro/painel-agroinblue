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
  lerContaCorrente, descricaoDoEvento, rotuloDeducao, rotuloRecebimento, rotuloDoSaldo, ROTULO_AGUARDANDO_SAIDA,
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
  it('"Funrural"; componente desconhecido = "Dedução"; o "Receb. n/N" nao conta a deducao', () => {
    const c = cc();
    expect(descricaoDoEvento(deducaoDe(c), c.linhas, 'abate', s => s ?? '')).toBe('Funrural');
    expect(rotuloDeducao('xyz')).toBe('Dedução');
    expect(rotuloDeducao(null)).toBe('Dedução');
    expect(rotuloRecebimento(c.linhas, 'r1', 'abate')).toBe('Receb. 1/1');
  });
});

describe('T3 — o saldo do abate fala do frigorifico', () => {
  it('falta receber / adiantado pelo frigorífico / quitado / aguardando saída', () => {
    expect(rotuloDoSaldo(-1, 'abate')).toBe('Saldo · falta receber');
    expect(rotuloDoSaldo(1, 'abate')).toBe('Saldo · adiantado pelo frigorífico');
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
    expect(a[1].motivo).toBe('a dedução acompanha o acerto do abate · corrija o Funrural na aba Abate');
    const sem = acoesDaLinha({ ...d, lancamentoId: null }, 'abate', false);
    expect(sem[0].motivo).toBe(MOTIVO_ACAO.semLancamento);
  });
});

describe('T6 — o extrato do abate', () => {
  it('a linha Dedução, o rodape "Funrural retido", o titulo e o card do frigorifico; o clique abre o lancamento', () => {
    const abrir = vi.fn();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="abate" onAbrirLancamento={abrir} />);
    const tabela = screen.getByTestId('conta-corrente-tabela');
    const tr = tabela.querySelector('tr[data-tipo="deducao"]');
    if (!tr) throw new Error('sem a linha deducao');
    const tds = [...tr.querySelectorAll('td')];
    expect(tds[3].textContent).toBe('Dedução');
    expect(tds[4].textContent).toBe('Funrural');
    expect(tds[2].textContent).toBe('');
    expect(tr.querySelector('[data-celula="banco"]')?.textContent).toBe('');
    expect(tds[7].textContent).toBe('2.500,10');
    expect(tr.className).toContain('bg-[#fff7ed]');
    expect(screen.getByTestId('total-deduzido').textContent).toBe('Funrural retido +2.500,10');
    expect(screen.getAllByText('Conta corrente do frigorífico').length).toBeGreaterThan(0);
    expect(screen.getByTestId('card-entrega').textContent).toContain('Entregue · bruto no DRE');
    expect(tr.getAttribute('data-clicavel')).toBe('sim');
    fireEvent.click(tr);
    expect(abrir).toHaveBeenCalledWith('ld1');
  });
});

describe('T7 — o rodape do Funrural e\' so\' do abate', () => {
  it('o MESMO envelope (com deduzido): na venda a celula nao existe; no abate, "Funrural retido +2.500,10"', () => {
    const r = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="venda" />);
    expect(screen.queryByTestId('total-deduzido')).toBeNull();
    expect(within(screen.getByTestId('conta-corrente-tabela')).queryAllByText(/Funrural retido/)).toHaveLength(0);
    r.unmount();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="abate" />);
    expect(screen.getByTestId('total-deduzido').textContent).toBe('Funrural retido +2.500,10');
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
