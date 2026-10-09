/**
 * OC-RECLASSIFICAR-ITEM-01 — "Reclassificar item da operação" e a volta do drill para a OC.
 *
 * ⚠ A RPC E' MOCKADA; a regra mora no banco e foi provada em rollback (frete 5ef570ec da 77d963be, 5010 adiantamento ->
 *   5030 frete: valor, datas, pagamento, hash, vinculos, liquidacao e rebanho identicos; DRE RRCC civil 2023 com
 *   deducoes +6.000,00 e resultados -6.000,00). Aqui se trava o que a TELA faz com a resposta.
 * ⚠ O SELETOR DE SUBCENTRO E' TROCADO por botoes, como no teste do Desvincular: ele tem teste proprio; o que importa e'
 *   o `onSelected` levar a CHAVE do plano, e o filtro de DIRECAO chegar nele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const CLIENTE = 'cli-rrcc';
const COMP = 'dec7e17d-ee7b-4010-b076-71c9a6d3862e';
const P5010 = '10d84129-1b05-4459-8ff5-c158511f8a0f';
const P5030 = '70d5708e-9577-4c9a-b392-6372ba429f36';
const P1150 = '13bb42b9-b3de-466e-864a-bd8c2c61f45a';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
const notificar = vi.fn();
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: (id: string) => notificar(id) }));
vi.mock('@/lib/financeiro/planoContasBuilder', () => ({
  DIVIDENDO_MACRO: 'Dividendos',
  loadPlanoContasCompleto: vi.fn(async () => []),
  planoToClassificacoes: () => [
    { id: P5010, subcentro: 'Adiantamento de Boitel', macro_custo: 'Saída Financeira', tipo_operacao: '2-Saídas' },
    { id: P5030, subcentro: 'Impostos e Despesas de Abates e Vendas', macro_custo: 'Deduções de Receitas', tipo_operacao: '2-Saídas' },
    { id: P1150, subcentro: 'Venda em Boitel', macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas' },
  ],
}));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({
  PlanoSubcentroSelect: ({ classificacoes, onSelected, tipoOperacao }: {
    classificacoes: Array<{ id?: string; subcentro: string }>; tipoOperacao: string;
    onSelected: (s: string, c?: { id?: string; subcentro: string }) => void;
  }) => (
    <div data-testid="seletor" data-tipo={tipoOperacao}>
      {classificacoes.map(c => (
        <button key={c.id} type="button" data-testid={`conta-${c.id}`} onClick={() => onSelected(c.subcentro, c)}>{c.subcentro}</button>
      ))}
    </div>
  ),
}));

/* O Select do Radix nao abre no jsdom (pede pointer capture e scrollIntoView): trocado por botoes, como o seletor acima.
   O que se trava e' o valor escolhido chegar a' simulacao. */
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Ctx = React.createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: React.ReactNode }) =>
      <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
    SelectTrigger: ({ children, ...r }: { children: React.ReactNode; 'data-testid'?: string }) => <div data-testid={r['data-testid']}>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const escolher = React.useContext(Ctx);
      return <button type="button" role="option" onClick={() => escolher(value)}>{children}</button>;
    },
  };
});

import { ReclassificarItemDialog } from '@/components/financeiro-v2/ReclassificarItemDialog';
import { fraseDoDre, efeitoNoResultado, opcoesDeComponente, type LinhaMapaOC } from '@/lib/oc/reclassificarItem';
import { paramsAberturaOC, origemDaVolta } from '@/lib/oc/paramsAberturaOC';

const MAPA = [
  { subcentro: 'Adiantamento de Boitel', tipos_oc: ['venda'], natureza: 'obrigacao', componentes: ['adiantamento'], tipo_operacao: '2-Saídas' },
  { subcentro: 'Impostos e Despesas de Abates e Vendas', tipos_oc: ['venda', 'abate'], natureza: 'obrigacao',
    componentes: ['taxas_impostos', 'frete', 'comissao', 'taxa_aquisicao'], tipo_operacao: '2-Saídas' },
  { subcentro: 'Venda em Boitel', tipos_oc: ['venda'], natureza: 'principal', componentes: ['principal'], tipo_operacao: '1-Entradas' },
];

/** O envelope provado em rollback na 77d963be, com a conta e o componente pedidos. */
function envelope(a: Record<string, unknown>) {
  return {
    ok: true, acao: a.p_simular ? 'simulado' : 'reclassificado', simulado: !!a.p_simular, operacao_id: '77d963be',
    operacao_versao: a.p_simular ? 21 : 22, compromisso_id: COMP, valor: 6000, direcao: '2-Saídas',
    conta: { de: { id: P5010, subcentro: 'Adiantamento de Boitel', macro_custo: 'Saída Financeira' },
      para: { id: P5030, subcentro: 'Impostos e Despesas de Abates e Vendas', macro_custo: 'Deduções de Receitas' } },
    componente: { de: 'adiantamento', para: a.p_componente, opcoes: ['taxas_impostos', 'frete', 'comissao', 'taxa_aquisicao'] },
    dre: { de: { compoe_dre: false, bloco_dre: null }, para: { compoe_dre: true, bloco_dre: 'deducao' } },
    partes: ['19ec59df'],
    titulos: { de: [{ id: '5ef570ec', fazenda_id: 'f', fazenda_nome: 'Faz. Ursa Maior', subcentro: 'Adiantamento de Boitel', compoe_dre: false, hash: 'htq7jsd' }],
      para: [{ id: '5ef570ec', fazenda_id: 'f', fazenda_nome: 'Faz. Ursa Maior', subcentro: 'Impostos e Despesas de Abates e Vendas', compoe_dre: true, hash: 'htq7jsd' }] },
  };
}
const chamadas = () => rpc.mock.calls.filter(c => c[0] === 'oc_reclassificar_item').map(c => c[1] as Record<string, unknown>);

beforeEach(() => {
  rpc.mockReset(); notificar.mockReset();
  rpc.mockImplementation(async (nome: string, args: Record<string, unknown>) => {
    if (nome === '_oc_vinculo_mapa') return { data: MAPA, error: null };
    if (nome === 'oc_reclassificar_item') return { data: envelope(args), error: null };
    return { data: null, error: null };
  });
});

const ITEM = { compromissoId: COMP, descricao: 'Venda 193 cab - Frete boitel', natureza: 'obrigacao', componente: 'adiantamento',
  planoContaId: P5010, valor: 6000 };
const montar = (onReclassificado = vi.fn(), onClose = vi.fn()) => {
  render(<ReclassificarItemDialog open item={ITEM} rotuloOperacao="OC de 05/07/2023" clienteId={CLIENTE}
    onClose={onClose} onReclassificado={onReclassificado} />);
  return { onReclassificado, onClose };
};
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

describe('o dialogo de reclassificar', () => {
  it('o seletor recebe a direcao do item (saida) e o 5030 pede o componente antes de simular', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('seletor').getAttribute('data-tipo')).toBe('2-Saídas'));
    fireEvent.click(screen.getByTestId(`conta-${P5030}`));
    expect(screen.getByTestId('recl-falta-componente')).toBeTruthy();
    expect(chamadas()).toHaveLength(0);
    expect((screen.getByTestId('recl-confirmar') as HTMLButtonElement).disabled).toBe(true);
  });

  it('com o componente escolhido, simula e o resumo diz o DRE na lingua da tela', async () => {
    montar();
    await waitFor(() => screen.getByTestId(`conta-${P5030}`));
    fireEvent.click(screen.getByTestId(`conta-${P5030}`));
    fireEvent.click(await screen.findByRole('option', { name: 'Frete' }));
    await waitFor(() => expect(chamadas()).toHaveLength(1));
    expect(chamadas()[0]).toMatchObject({ p_compromisso_id: COMP, p_plano_conta_id: P5030, p_componente: 'frete', p_simular: true, p_motivo: null });
    const resumo = await screen.findByTestId('recl-resumo');
    await waitFor(() => expect(txt(resumo.textContent)).toContain(
      'Hoje fora do DRE → passa a entrar em Deduções: o resultado do período cai R$ 6.000,00'));
    expect(txt(resumo.textContent)).toContain('Adiantamento ao Boitel → Frete');
  });

  it('sem motivo nao grava; com motivo grava, avisa a lista e o chamador rele a OC', async () => {
    const { onReclassificado, onClose } = montar();
    await waitFor(() => screen.getByTestId(`conta-${P5030}`));
    fireEvent.click(screen.getByTestId(`conta-${P5030}`));
    fireEvent.click(await screen.findByRole('option', { name: 'Frete' }));
    await waitFor(() => expect(txt(screen.getByTestId('recl-resumo').textContent)).toContain('Deduções'));
    expect((screen.getByTestId('recl-confirmar') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Informe o motivo')).toBeTruthy();
    fireEvent.change(screen.getByTestId('recl-motivo'), { target: { value: 'frete lancado como adiantamento' } });
    fireEvent.click(screen.getByTestId('recl-confirmar'));
    await waitFor(() => expect(onReclassificado).toHaveBeenCalledTimes(1));
    expect(chamadas().at(-1)).toMatchObject({ p_simular: false, p_motivo: 'frete lancado como adiantamento', p_componente: 'frete' });
    expect(notificar).toHaveBeenCalledWith(CLIENTE);
    expect(onClose).toHaveBeenCalled();
  });

  it('a recusa do banco fica ao lado do botao, sem fechar e sem avisar a lista', async () => {
    const { onReclassificado } = montar();
    await waitFor(() => screen.getByTestId(`conta-${P5030}`));
    fireEvent.click(screen.getByTestId(`conta-${P5030}`));
    fireEvent.click(await screen.findByRole('option', { name: 'Frete' }));
    await waitFor(() => expect(txt(screen.getByTestId('recl-resumo').textContent)).toContain('Deduções'));
    rpc.mockImplementation(async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'oc_reclassificar_item' && !args.p_simular) return { data: null, error: { message: 'Operação cancelada: o item não se reclassifica.' } };
      return { data: nome === '_oc_vinculo_mapa' ? MAPA : envelope(args), error: null };
    });
    fireEvent.change(screen.getByTestId('recl-motivo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('recl-confirmar'));
    await waitFor(() => expect(screen.getByTestId('recl-erro-gravar').textContent).toContain('Operação cancelada'));
    expect(onReclassificado).not.toHaveBeenCalled();
    expect(notificar).not.toHaveBeenCalled();
  });

  it('a recusa da simulacao (direcao) aparece no aside', async () => {
    rpc.mockImplementation(async (nome: string) => (nome === '_oc_vinculo_mapa'
      ? { data: MAPA, error: null }
      : { data: null, error: { message: '"Venda em Boitel" é conta de entrada, e o item é de saída. Escolha uma conta de saída.' } }));
    montar();
    await waitFor(() => screen.getByTestId(`conta-${P1150}`));
    fireEvent.click(screen.getByTestId(`conta-${P1150}`));
    await waitFor(() => expect(screen.getByTestId('recl-erro-sim').textContent).toContain('é conta de entrada'));
  });
});

describe('o texto do DRE e as opcoes de componente', () => {
  const base = { valor: 6000, direcao: '2-Saídas' };
  it('fora -> dentro derruba o resultado na saida e sobe na entrada', () => {
    const d = { de: { compoe_dre: false, bloco_dre: null }, para: { compoe_dre: true, bloco_dre: 'deducao' } };
    expect(efeitoNoResultado({ ...base, dre: d })).toBe(-6000);
    expect(efeitoNoResultado({ ...base, direcao: '1-Entradas', dre: d })).toBe(6000);
  });
  it('troca de linha dentro do resultado nao muda o resultado; investimento esta fora dele', () => {
    expect(fraseDoDre({ ...base, dre: { de: { compoe_dre: true, bloco_dre: 'fixo' }, para: { compoe_dre: true, bloco_dre: 'deducao' } } }))
      .toBe('Sai de Custo fixo e entra em Deduções: o resultado do período não muda');
    expect(txt(fraseDoDre({ ...base, dre: { de: { compoe_dre: true, bloco_dre: 'fixo' }, para: { compoe_dre: true, bloco_dre: 'investimento' } } })))
      .toBe('Sai de Custo fixo e entra em Investimento: o resultado do período sobe R$ 6.000,00');
    expect(txt(fraseDoDre({ ...base, dre: { de: { compoe_dre: true, bloco_dre: 'fixo' }, para: { compoe_dre: false, bloco_dre: null } } })))
      .toBe('Hoje em Custo fixo → sai do DRE: o resultado do período sobe R$ 6.000,00');
    expect(fraseDoDre({ ...base, dre: { de: { compoe_dre: false, bloco_dre: null }, para: { compoe_dre: false, bloco_dre: null } } }))
      .toBe('Continua fora do DRE: o resultado do período não muda');
  });
  it('opcoes: varias no 5030, uma no 5010, nenhuma fora do mapa ou com natureza diferente', () => {
    const m: LinhaMapaOC[] = MAPA.map(x => ({ subcentro: x.subcentro, natureza: x.natureza, componentes: x.componentes }));
    expect(opcoesDeComponente(m, 'Impostos e Despesas de Abates e Vendas', 'obrigacao')).toHaveLength(4);
    expect(opcoesDeComponente(m, 'Adiantamento de Boitel', 'obrigacao')).toEqual(['adiantamento']);
    expect(opcoesDeComponente(m, 'Manutenção Fazenda', 'obrigacao')).toEqual([]);
    expect(opcoesDeComponente(m, 'Venda em Boitel', 'obrigacao')).toEqual([]);
  });
});

describe('a volta do drill para a OC', () => {
  it('abrir da OC -> fechar o lancamento -> volta na OC, e fechar a OC volta a origem verdadeira (nao ao Financeiro)', () => {
    /* A URL depois do `editarTitulo` e do consumo do flancId: sem oc_venda/oc_id, com o oc_return de quem abriu a OC. */
    const naVolta = '?f_de=2023-07&oc_return=operacoes-comerciais';
    const p = paramsAberturaOC(naVolta, { ocId: '77d963be', aba: 'financeiro', tipo: 'venda', retorno: origemDaVolta(naVolta) });
    expect(p.get('oc_venda')).toBe('1');
    expect(p.get('oc_id')).toBe('77d963be');
    expect(p.get('oc_aba')).toBe('financeiro');
    expect(p.get('oc_return')).toBe('operacoes-comerciais');
    expect(p.get('f_de')).toBe('2023-07');
    /* a busca sabe achar: sem origem na URL, nada e' inventado */
    expect(origemDaVolta('?f_de=2023-07')).toBeUndefined();
  });

  it('lido da FONTE: o retornarDoDrill passa a origem, e sair pelo link limpa o drillReturn antes de abrir a OC', () => {
    const fonte = readFileSync('src/v2/V2Index.tsx', 'utf-8');
    /* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2: a sub-aba (`ret.sub`) passou a ir junto; a origem continua sendo a da URL */
    expect(fonte).toContain('abrirOperacaoOC(ret.id, ret.tab, ret.tipo, origemDaVolta(window.location.search), ret.sub);');
    const link = fonte.slice(fonte.indexOf('onAbrirOperacaoOCFinanceiro='), fonte.indexOf('onLancamentoAlvoConsumido='));
    expect(link.indexOf('setDrillReturn(null)')).toBeGreaterThan(-1);
    expect(link.indexOf('setDrillReturn(null)')).toBeLessThan(link.indexOf('abrirOperacaoOC('));
  });
});
