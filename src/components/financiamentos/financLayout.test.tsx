/**
 * FIN-FINANC-LAYOUT-01 (Gabriel 05/11/2026) — o detalhe do contrato e o "Editar contrato":
 * (F1) o nome do contrato numa FAIXA DO TÍTULO dentro do card (#f7f9fc, borda #eef0f3, cantos de cima, 9/12/7; nome 15px negrito,
 *      credor · Nº 11px cinza, selos); no topo da página só a seta e os botões. Datas um passo abaixo (10,5px);
 * (b)  taxa 0 com juros no cronograma = "não cadastrado" (laranja), nunca "0 % a.m.";
 * (F1) o cronograma do crédito com as divisórias dos grupos (Principal · Situação);
 * (F2) o modal: campos visíveis (fundo #f5f8fc, borda #94a3b8) no corpo #e4e9f0.
 * FIN-PARCELA-VALOR-ZERO-01 (achado (a)): parcela de valor zero não paga = "sem pagamento", cinza, sem "sem lançamento".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/hooks/useEdicaoDoContrato', () => ({ useEdicaoDoContrato: () => ({ salvarCabecalho: vi.fn(), editarParcelas: vi.fn(), regerar: vi.fn(), desfazer: vi.fn(), ultimaOperacao: null }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1', nome: 'Cliente Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({ documentos: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
vi.mock('./ConsorcioDialog', () => ({ ConsorcioDialog: () => <div data-testid="consorcio-dialog" /> }));
vi.mock('@/integrations/supabase/client', () => {
  const q = { select: () => q, eq: () => Promise.resolve({ data: [], error: null }) };
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } };
});

import { TopoDoContrato } from './TelaDoContratoV3';
import { CadastroDeContratoDialog } from './CadastroDeContratoDialog';
import { lerTelaDoContrato, textoDaTaxa, textoDaTaxaAa, type TelaDoContrato } from '@/lib/financiamentos/telaDoContrato';
import { ABRE_GRUPO_DAS_PARCELAS } from '@/lib/financiamentos/reguaDasParcelas';
import { lerSituacaoDoContrato, semLancamento } from '@/lib/financiamentos/situacaoDoContrato';

const RAW = (k: Record<string, unknown> = {}) => ({
  condicoes: { taxa: 0, unidade: 'a.m.', taxa_aa: 0, sistema: null, carencia_ate: null, tipo_taxa: null, periodicidade: 'anual', ...k },
  contrato: { data_contrato: '2025-11-10', vencimento_final: '2037-11-01', atividade: 'pecuaria', credor: 'SINT BANCO DO CERRADO',
    credor_documento: null, primeira_liberacao: { data: '2025-11-21', a_confirmar: false }, ultima_liberacao: { data: '2026-02-10', a_confirmar: false }, vencidas: 0 },
  liberacoes: [], liberacoes_total: { qtde: 0, liberado: 0, entrou: 0, a_identificar: 0, excedente: 0 },
  pagamentos: [], pagamentos_total: { qtde: 0, principal: 0, juros: 0, encargos: 0, total: 0 }, historico: [], a_resolver: [],
});
const tela = (k?: Record<string, unknown>): TelaDoContrato => { const t = lerTelaDoContrato(RAW(k)); if (!t) throw new Error('leitura torta'); return t; };
const topo = (jurosNoCronograma = false, k?: Record<string, unknown>) => render(
  <TopoDoContrato numero="SINT-C541" descricao="FCO - Curral" status="ativo" tela={tela(k)} onEditar={() => undefined}
    parcelas={{ total: 12, pagas: 0 }} quinta={null} pendencias={{ qtde: 2, vencido: false }} onAbrirPendencias={() => undefined}
    saldo={null} jurosNoCronograma={jurosNoCronograma} />);

describe('F1 — a faixa do título dentro do card', () => {
  it('a faixa é a 1ª linha da ficha, com a cor, a borda, os cantos e o respiro da referência', () => {
    topo();
    const ficha = screen.getByTestId('ficha-do-contrato');
    const faixa = within(ficha).getByTestId('faixa-do-titulo');
    expect(ficha.firstElementChild).toBe(faixa);
    for (const c of ['bg-[#f7f9fc]', 'border-b', 'border-[#eef0f3]', 'rounded-t-lg', 'pt-[9px]', 'px-3', 'pb-[7px]']) expect(faixa.className.split(' ')).toContain(c);
  });
  it('na faixa: o nome 15px negrito, os selos e "credor · Nº" 11px cinza', () => {
    topo();
    const faixa = screen.getByTestId('faixa-do-titulo');
    const nome = within(faixa).getByTestId('titulo-do-contrato');
    expect(nome.textContent).toBe('FCO - Curral');
    expect(nome.className).toContain('text-[15px]');
    expect(nome.className).toContain('font-semibold');
    expect(within(faixa).getByTestId('selo-da-situacao').textContent).toBe('Ativo');
    expect(within(faixa).getByTestId('selo-das-pendencias').textContent).toBe('2 pendências');
    const aoLado = within(faixa).getByTestId('credor-e-cedula');
    expect(aoLado.textContent).toBe('SINT BANCO DO CERRADO · Nº SINT-C541');
    expect(aoLado.className).toContain('text-[11px]');
  });
  it('no topo da página ficam só a seta e os botões', () => {
    topo();
    const linha = screen.getByTestId('linha-do-titulo-credito');
    expect(within(linha).queryByTestId('titulo-do-contrato')).toBeNull();
    expect(within(linha).queryByTestId('selo-da-situacao')).toBeNull();
    expect(within(linha).getByTestId('voltar-do-contrato')).toBeTruthy();
    expect(within(linha).getByTestId('botoes-do-credito')).toBeTruthy();
  });
  it('as datas do bloco Dados um passo abaixo (10,5px)', () => {
    topo();
    const data = screen.getByTestId('campo-data-do-contrato').querySelector('span.tabular-nums');
    expect(data?.className).toContain('text-[10.5px]');
    expect(data?.textContent).toBe('10/11/2025');
  });
});

describe('(b) taxa 0 com juros no cronograma', () => {
  it('é "não cadastrado" (a regra e a tela)', () => {
    const c = tela().condicoes;
    expect(textoDaTaxa(c, true)).toBeNull();
    expect(textoDaTaxaAa(c, true)).toBeNull();
    topo(true);
    expect(screen.getByTestId('campo-taxa').textContent).toContain('não cadastrado');
    expect(screen.getByTestId('campo-taxa-aa').textContent).toContain('não cadastrado');
  });
  it('sem juros no cronograma a taxa 0 continua escrita; taxa gravada > 0 nunca some', () => {
    expect(textoDaTaxa(tela().condicoes, false)).toMatch(/^0[,\d]* % a\.m\.$/);
    expect(textoDaTaxa(tela({ taxa: 0.5 }).condicoes, true)).toContain('% a.m.');
    expect(textoDaTaxaAa(tela({ taxa_aa: 6 }).condicoes, true)).toContain('% a.a.');
  });
});

describe('F1 — divisórias dos grupos no cronograma do crédito', () => {
  it('os grupos abrem em Principal e em Situação (cabeçalho, linha e total na fonte)', () => {
    expect([...ABRE_GRUPO_DAS_PARCELAS]).toEqual(['principal', 'situacao']);
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
    expect(fonte).toContain('${ABRE_GRUPO_DAS_PARCELAS.includes(c.chave) ? SEP_TH');
    expect(fonte).toContain('<td className={`${TF_V4} ${SEP_TD} text-right tabular-nums`}>{cartoes ? num2(cartoes.somaPrincipal)');
  });
});

describe('F2 — o modal Editar contrato: campos visíveis', () => {
  it('corpo #e4e9f0; campo de texto e gatilho de seleção com fundo #f5f8fc e borda #94a3b8', () => {
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza: 'financiamento' }} />);
    const corpo = screen.getByTestId('corpo-do-cadastro');
    expect(corpo.className).toContain('bg-[#e4e9f0]');
    expect(corpo.className).toContain('[&_input:not([type=checkbox]):not([type=radio]):not(:disabled)]:bg-[#f5f8fc]');
    expect(corpo.className).toContain('[&_input:not([type=checkbox]):not([type=radio]):not(:disabled)]:border-[#94a3b8]');
    const gatilhos = [...corpo.querySelectorAll('button[role="combobox"]')];
    expect(gatilhos.length).toBeGreaterThan(0);
    for (const g of gatilhos) { expect(g.className).toContain('bg-[#f5f8fc]'); expect(g.className).toContain('border-[#94a3b8]'); }
  });
});

describe('(a) FIN-PARCELA-VALOR-ZERO-01 — parcela de valor zero não vence', () => {
  const PARC = (o: Record<string, unknown> = {}) => ({ id: 'p1', numero: 1, data_vencimento: '2026-11-01', valor_principal: 0, valor_juros: 0, valor_total: 0,
    situacao: 'pendente', pago_em: null, valor_pago: 0, lancamento_id: null, lancamento_juros_id: null, fonte: 'parcela', diverge: false, ...o });
  const SIT = (p: Record<string, unknown>) => ({ parcelas: [p], cartoes: { valor_contrato: 0, pago: 0, a_vencer: 0, vencido: 0, pagas: 0, parcelas: 1,
    juros_previstos: 0, soma_principal: 0, soma_total: 0, divergentes: 0 } });
  it('o leitor lê `sem_valor`; ausente = falso (banco de antes)', () => {
    expect(lerSituacaoDoContrato(SIT(PARC({ sem_valor: true })))?.parcelas[0].semValor).toBe(true);
    expect(lerSituacaoDoContrato(SIT(PARC()))?.parcelas[0].semValor).toBe(false);
  });
  it('sem valor não é "sem lançamento"; a de valor sem lançamento continua', () => {
    const zero = lerSituacaoDoContrato(SIT(PARC({ sem_valor: true })))?.parcelas[0];
    const comValor = lerSituacaoDoContrato(SIT(PARC({ valor_principal: 10, valor_total: 10 })))?.parcelas[0];
    expect(zero && semLancamento(zero)).toBe(false);
    expect(comValor && semLancamento(comValor)).toBe(true);
  });
  it('a página escreve "sem pagamento" cinza nas duas tabelas e não oferece Buscar', () => {
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
    expect(fonte).toContain("const SELO_V4_SEM_VALOR = 'border border-[#d5dbe3] text-[#8a96a8]';");
    expect(fonte).toContain('title={MOTIVO_SEM_VALOR} data-testid="situacao-da-parcela">{ROTULO_SEM_VALOR}</span>');
    expect(fonte).toContain('title={origemDaSituacao(p)} data-testid="situacao-da-parcela">{ROTULO_SITUACAO[p.situacao]}</span>');
    expect(fonte).toContain('{orfa ? ROTULO_SEM_LANCAMENTO : p.semValor ? ROTULO_SEM_VALOR : ROTULO_SITUACAO[p.situacao]}');
    expect(fonte).toContain('const podeBuscar = vs.length === 0 && !p.semValor &&');
    /* o selo é mais largo que a Situação: nessa linha a célula junta Situação + Lançamento (colSpan 2), o selo cabe sem vazar
       (o check-ui-cortes acusava "vaza: pede 82px, tem 55" no contrato-parcela-zero) e os gestos (lápis) moram nela; nada de overflow */
    expect(fonte).toContain('<td colSpan={p.semValor ? 2 : undefined} className={`${TD_V4} ${SEP_TD}`}>');
    expect(fonte).toContain('<div className="ml-[6px] min-w-0 flex-1" data-testid="lancamento-da-parcela">{gestos}</div>');
    /* FIN-FINANC-LAYOUT-02: a célula Lançamento é uma linha só (a régua da linha, 22px), nada transborda para a vizinha */
    expect(fonte).toMatch(/\{!p\.semValor && \(\s*<td className=\{TD_V4\} data-testid="lancamento-da-parcela">/);
    expect(fonte).not.toContain("'relative z-[1] !overflow-visible'");
    /* FIN-FINANC-LAYOUT-02: sem lançamento nenhum = "sem lançamento" laranja (o porquê no title); a de valor zero não diz isso */
    expect(fonte).toContain('{semLanc && <span className={COR_V4.laranja}>{ROTULO_SEM_LANCAMENTO}</span>}');
    expect(fonte).toContain('const semLanc = semLancamento(p) || (nenhum && !p.semValor);');
  });
});
