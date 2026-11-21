/**
 * FIN-REGRA-VARIAVEL-FAZENDA-01 — a tela da regra fazenda × conta: as leituras puras (quando a regra vale, o selo, as parcelas do mesmo
 * contrato, os grupos por destino), o modal de correção (sugestão marcada, "você decide" desmarcado, irmãs andam juntas, prévia do banco,
 * motivo, o que vai gravar) e a trava no modal de lançamento (pela fonte). O banco é falso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => banco.rpc(...a), from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { CorrecaoRegraFazendaDialog } from './CorrecaoRegraFazenda';
import {
  aceitaConta, chaveDoContrato, gruposPorDestino, lerPendentes, linhaParaDestacar, motivoSugerido, porQueCurto, regraValeAqui, rotuloDaOrigem, textoDoSelo,
} from '@/lib/financeiro/regraFazenda';

const FAZENDAS = [{ id: 'f-adm', nome: 'Administrativo' }, { id: 'f-sr', nome: 'Faz. Sintetica SR' }, { id: 'f-pur', nome: 'Faz. Sintetica PUR' }];
const ADM = 'Custo variável (Vacinas e Vermífugos) não vai para o Administrativo: escolha a fazenda produtiva.';
const base = (o: Record<string, unknown>) => ({ competencia: '2026-06-24', valor: 375.36, status: 'programado', fornecedor: 'Fornecedor Sintetico',
  subcentro: 'Vacinas e Vermífugos', grupo_custo: 'Custo Variável Pecuária', fazenda_id: 'f-adm', regra: ADM, financiamento_id: null,
  conciliado: false, mes_fechado: false, sugestao: { fazenda_id: 'f-sr', vezes: 14, de: 14, origem: 'histórico do fornecedor' }, conta_adm: null, ...o });
const RESPOSTA = [
  base({ id: 'st2', descricao: 'Vacina sintetica 2/5' }),
  base({ id: 'st3', descricao: 'Vacina sintetica 3/5' }),
  base({ id: 'adubo', descricao: 'Adubo sintetico', valor: 276600, subcentro: 'Manutenção de Pasto', conciliado: true, sugestao: null }),
  base({ id: 'esocial', descricao: 'E-Social sintetico', valor: 15531.22, subcentro: 'Encargos Pecuária', grupo_custo: 'Custo Fixo Pecuária',
    regra: 'Custo fixo da atividade (Encargos Pecuária) não vai para o Administrativo: escolha a fazenda ou a conta administrativa.', sugestao: null,
    conta_adm: { plano_conta_id: 'pl-enc-adm', subcentro: 'Encargos Administrativo' } }),
];
const PENDENTES = lerPendentes(RESPOSTA);

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  banco.rpc.mockReset();
  banco.rpc.mockImplementation(async (fn: string, a: { p_ids: string[]; p_simular: boolean }) => (fn === 'fn_lancamentos_trocar_fazenda'
    ? { data: { ok: true, simulado: a.p_simular, troca_id: a.p_simular ? null : `t-${a.p_ids.join('-')}`, linhas: a.p_ids.map((id) => ({ id })), recusas: [] }, error: null }
    : { data: null, error: null }));
});

describe('regraFazenda — leituras puras', () => {
  it('a regra só vale no NOVO ou quando a fazenda/conta MUDAM (o legado segue editável)', () => {
    expect(regraValeAqui({ novo: true, fazendaDe: null, planoDe: null, fazenda: 'f-adm', plano: 'p1' })).toBe(true);
    expect(regraValeAqui({ novo: false, fazendaDe: 'f-adm', planoDe: 'p1', fazenda: 'f-adm', plano: 'p1' })).toBe(false);
    expect(regraValeAqui({ novo: false, fazendaDe: 'f-sr', planoDe: 'p1', fazenda: 'f-adm', plano: 'p1' })).toBe(true);
    expect(regraValeAqui({ novo: false, fazendaDe: 'f-adm', planoDe: 'p0', fazenda: 'f-adm', plano: 'p1' })).toBe(true);
    expect(regraValeAqui({ novo: true, fazendaDe: null, planoDe: null, fazenda: 'f-adm', plano: null })).toBe(false);
  });
  it('lê a lista do banco (sugestão, conta ADM, conciliado) e o texto do selo', () => {
    expect(PENDENTES.map((p) => p.id)).toEqual(['st2', 'st3', 'adubo', 'esocial']);
    expect(PENDENTES[0].sugestao).toEqual({ fazendaId: 'f-sr', vezes: 14, de: 14, origem: 'histórico do fornecedor' });
    expect(PENDENTES[3].contaAdm).toEqual({ planoContaId: 'pl-enc-adm', subcentro: 'Encargos Administrativo' });
    expect(PENDENTES[2].conciliado).toBe(true);
    expect(textoDoSelo(PENDENTES)).toBe('4 despesas no Administrativo');
    expect(textoDoSelo(lerPendentes([base({ id: 'd', descricao: 'Retirada', regra: 'Dividendos/retiradas (X) vão para o Administrativo, não para a Faz.' })])))
      .toBe('1 lançamento com a fazenda fora da regra');
  });
  it('as parcelas do MESMO contrato têm a mesma chave ("k/N", "– parc. k", financiamento); outra compra não', () => {
    const [a, b] = PENDENTES;
    expect(chaveDoContrato(a)).toBe(chaveDoContrato(b));
    const p = (d: string, extra: Record<string, unknown> = {}) => lerPendentes([base({ id: d, descricao: d, ...extra })])[0];
    expect(chaveDoContrato(p('Seguro Vida Grupo 1/12'))).toBe(chaveDoContrato(p('Seguro Vida Grupo 7/12')));
    expect(chaveDoContrato(p('Vacinas – parc. 3'))).toBe(chaveDoContrato(p('Vacinas – parc. 4')));
    expect(chaveDoContrato(p('Vacina sintetica 2/5'))).not.toBe(chaveDoContrato(p('Vacina sintetica 2/5', { valor: 999 })));
    expect(chaveDoContrato(p('x', { financiamento_id: 'fin-1' }))).toBe(chaveDoContrato(p('y', { financiamento_id: 'fin-1' })));
  });
  it('agrupa as marcadas por destino (a função troca UM destino por chamada)', () => {
    expect(gruposPorDestino([{ id: 'a', destino: { tipo: 'fazenda', fazendaId: 'f-sr' } }, { id: 'b', destino: { tipo: 'conta', planoContaId: 'p' } },
      { id: 'c', destino: { tipo: 'fazenda', fazendaId: 'f-sr' } }])).toEqual([
      { destino: { tipo: 'fazenda', fazendaId: 'f-sr' }, ids: ['a', 'c'] }, { destino: { tipo: 'conta', planoContaId: 'p' }, ids: ['b'] }]);
  });
});

describe('CorrecaoRegraFazendaDialog', () => {
  const marcadas = () => screen.getAllByTestId('correcao-marcar').map((c) => c.getAttribute('aria-checked') === 'true');
  it('com sugestão nasce marcada; sem sugestão ("você decide") desmarcada; a regra de cada linha à vista; prévia do banco', async () => {
    render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} onClose={() => {}} />);
    expect(marcadas()).toEqual([true, true, false, false]);
    expect(screen.getByTestId('correcao-resumo').textContent).toContain('2 sem sugestão (você decide)');
    /* FIN-REGRA-MODAL-02 (d): o Por quê é CURTO; a frase inteira do banco vai no title */
    expect(screen.getAllByTestId('correcao-regra').map((c) => c.textContent)).toEqual(['custo variável no ADM', 'custo variável no ADM', 'custo variável no ADM', 'custo fixo no ADM']);
    expect(screen.getAllByTestId('correcao-regra')[3].getAttribute('title')).toContain('conta administrativa');
    await waitFor(() => expect(screen.getByTestId('correcao-previa').textContent).toContain('Prévia: 2 lançamentos · R$ 750,72'));
    expect(banco.rpc.mock.calls.find((c) => c[0] === 'fn_lancamentos_trocar_fazenda')?.[1]).toMatchObject({
      p_cliente: 'cli', p_ids: ['st2', 'st3'], p_fazenda: 'f-sr', p_plano: null, p_simular: true });
    /* (e) o motivo nasce com a regra das marcadas (editável): não trava o operador */
    expect(screen.getByTestId('correcao-motivo')).toHaveValue('Regra fazenda × conta: custo variável no ADM');
    expect(screen.getByTestId('correcao-confirmar')).toBeEnabled();
  });
  it('desmarcar uma parcela desmarca as irmãs do contrato', async () => {
    render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTestId('correcao-marcar')[0]);
    expect(marcadas()).toEqual([false, false, false, false]);
    expect(screen.getByTestId('correcao-previa').textContent).toBe('Marque as linhas a corrigir.');
  });
  it('a recusa do banco aparece na prévia e não deixa corrigir', async () => {
    banco.rpc.mockImplementation(async () => ({ data: { ok: false, simulado: true, linhas: [], recusas: ['Vacina sintetica 2/5 (24/06/2026): 06/2026 fechado: reabra o mês para trocar'] }, error: null }));
    render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('correcao-motivo'), { target: { value: 'regra 19/11' } });
    await waitFor(() => expect(screen.getByTestId('correcao-previa').textContent).toContain('1 recusa: Vacina sintetica 2/5'));
    expect(screen.getByTestId('correcao-confirmar')).toBeDisabled();
  });
  it('Corrigir: grava por destino com o motivo (simular=false), avisa e fecha', async () => {
    const onClose = vi.fn(); const onCorrigido = vi.fn();
    render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} onClose={onClose} onCorrigido={onCorrigido} />);
    fireEvent.change(screen.getByTestId('correcao-motivo'), { target: { value: 'variável não vai para o ADM' } });
    await waitFor(() => expect(screen.getByTestId('correcao-confirmar')).toBeEnabled());
    expect(screen.getByTestId('correcao-confirmar').textContent).toBe('Corrigir 2 lançamentos');
    fireEvent.click(screen.getByTestId('correcao-confirmar'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const gravou = banco.rpc.mock.calls.filter((c) => c[0] === 'fn_lancamentos_trocar_fazenda' && c[1].p_simular === false);
    expect(gravou.map((c) => c[1])).toEqual([{ p_cliente: 'cli', p_ids: ['st2', 'st3'], p_fazenda: 'f-sr', p_plano: null, p_motivo: 'variável não vai para o ADM', p_simular: false }]);
    expect(onCorrigido).toHaveBeenCalled();
  });
});

describe('LancamentoV2Dialog — a trava da regra (pela fonte)', () => {
  const src = readFileSync(resolve(__dirname, 'LancamentoV2Dialog.tsx'), 'utf8');
  it('pergunta ao banco só quando a regra vale, mostra a frase ao lado do Salvar e não grava', () => {
    expect(src).toMatch(/regraValeAqui\(\{ novo: !lancamento\?\.id/);
    expect(src).toMatch(/perguntarRegraFazenda\(planoContaId, fazendaDaRegra\)/);
    expect(src).toMatch(/if \(regraFazenda\) \{\s*setErroAntesDeSalvar\(regraFazenda\);/);
    expect(src).toContain('data-testid="regra-fazenda-frase"');
    expect(src).toContain('erroDaRegra={regraFazenda}');
  });
});

/* ═══ FIN-REGRA-MODAL-02 (Gabriel 21/11, Vera: "ficou burra, não permite arrumar") ═══ */
describe('FIN-REGRA-MODAL-02 — as regras puras', () => {
  it('(d) o Por quê curto pela regra; (b) só o custo fixo aceita ficar no ADM trocando a conta', () => {
    expect(PENDENTES.map(porQueCurto)).toEqual(['custo variável no ADM', 'custo variável no ADM', 'custo variável no ADM', 'custo fixo no ADM']);
    expect(porQueCurto({ grupoCusto: 'Dividendos', regra: 'Dividendos/retiradas (X) vão para o Administrativo, não para a Y.' })).toBe('dividendo fora do ADM');
    expect(porQueCurto({ grupoCusto: 'Custo Fixo Pecuária', regra: 'Conta de pecuária (X) numa fazenda sem pecuária (Y): escolha outra fazenda.' })).toBe('fazenda sem pecuária');
    expect(PENDENTES.map(aceitaConta)).toEqual([false, false, false, true]);
  });
  it('(c) a origem da sugestão em palavras (o código do banco; o texto antigo ainda lido)', () => {
    const s = (origem: string, vezes = 0, de = 0) => rotuloDaOrigem({ fazendaId: 'f', vezes, de, origem });
    expect([s('descricao'), s('fornecedor'), s('itr_unica'), s('itr_maior'), s('historico', 14, 14), s('histórico do fornecedor', 3, 5)])
      .toEqual(['citada na descrição', 'citada no fornecedor', 'ITR: a única fazenda', 'ITR: a de maior área', '14 de 14 do fornecedor', '3 de 5 do fornecedor']);
  });
  it('(e) o motivo com a regra das marcadas, sem repetir; nada marcado = vazio', () => {
    expect(motivoSugerido(PENDENTES)).toBe('Regra fazenda × conta: custo variável no ADM, custo fixo de atividade no ADM');
    expect(motivoSugerido([])).toBe('');
  });
  it('(a) na volta: a mesma linha se ainda está fora da regra; senão a próxima (ou a anterior, se era a última)', () => {
    expect(linhaParaDestacar('b', ['a', 'b', 'c'], ['a', 'b', 'c'])).toBe('b');
    expect(linhaParaDestacar('b', ['a', 'b', 'c'], ['a', 'c'])).toBe('c');
    expect(linhaParaDestacar('c', ['a', 'b', 'c'], ['a', 'b'])).toBe('b');
    expect(linhaParaDestacar('a', ['a'], [])).toBeNull();
    expect(linhaParaDestacar(null, [], ['a'])).toBeNull();
  });
});

describe('FIN-REGRA-MODAL-02 — o modal', () => {
  it('(a) clicar na LINHA abre o lançamento; a caixa e os seletores não abrem', () => {
    const abrir = vi.fn();
    render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} onAbrirLancamento={abrir} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTestId('correcao-regra')[2]);
    expect(abrir).toHaveBeenCalledWith('adubo');
    fireEvent.click(screen.getAllByTestId('correcao-marcar')[0]);
    fireEvent.click(screen.getAllByTestId('correcao-para-conta')[3]);
    fireEvent.click(screen.getAllByTestId('correcao-para-fazenda')[1]);
    expect(abrir).toHaveBeenCalledTimes(1);
  });
  it('(a) voltou e a linha saiu da lista: a próxima fica destacada', () => {
    const { rerender } = render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} onAbrirLancamento={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTestId('correcao-regra')[2]);
    rerender(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES.filter((p) => p.id !== 'adubo')} onAbrirLancamento={() => {}} onClose={() => {}} />);
    expect(screen.getAllByTestId('correcao-linha').filter((l) => l.hasAttribute('data-destaque')).map((l) => l.getAttribute('data-id'))).toEqual(['esocial']);
  });
  it('(b) duas saídas por linha: Fazenda sempre; Conta só no custo fixo (no variável, "—")', () => {
    render(<CorrecaoRegraFazendaDialog clienteId="cli" fazendas={FAZENDAS} pendentes={PENDENTES} contasAdm={[{ id: 'pl-tax-adm', subcentro: 'Taxas e Impostos Administrativos' }]} onClose={() => {}} />);
    expect(screen.getAllByTestId('correcao-para-fazenda').map((c) => !!c.querySelector('button'))).toEqual([true, true, true, true]);
    expect(screen.getAllByTestId('correcao-para-conta').map((c) => (c.querySelector('button') ? 'seletor' : c.textContent))).toEqual(['—', '—', '—', 'seletor']);
    expect(screen.getAllByTestId('correcao-para-conta')[3].getAttribute('title')).toBe('Equivalente: Encargos Administrativo');
  });
});

describe('FIN-REGRA-MODAL-02 — a camada no Financeiro (fonte)', () => {
  it('a linha abre o Editar lançamento POR CIMA (\'lanc\' sobre \'regra\') e a volta diz se salvou', () => {
    const fin = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
    expect(fin).toContain("useCamadas<'receita' | 'xml' | 'nota' | 'regra' | 'lanc'>()");
    expect(fin).toContain("camadas.abrir('lanc', 'regra');");
    expect(fin).toContain("camadas.fechar('lanc', salvouPorCimaDaRegra.current ? 'salvou' : 'fechou', idAberto)");
    expect(fin).toContain("if (r !== false && camadas.aberta('lanc')) salvouPorCimaDaRegra.current = true;");
    expect(fin).toMatch(/c\.escopo_negocio === 'administrativo' && c\.grupo_custo\.startsWith\('Custo Fixo '\)/);
  });
});
