/**
 * FIN-FINANC-28 · TELA DO CONTRATO v3 (Gabriel 18/10/2026) — o que a tela promete:
 * (1) cabeçalho e total das tabelas das abas ficam FORA da rolagem (presos no scrollport da tabela);
 * (2) a página não rola: a raiz da tela é `h-full overflow-hidden` e o cronograma rola por dentro;
 * (3) o cronograma é EXATAMENTE o de antes (colunas da régua do crédito);
 * (4) campo vazio diz "não cadastrado" (nunca "sem carência"); taxa gravada com a unidade e a taxa a.a. do banco;
 * (5) "A resolver" some sem pendência; com pendência, cada linha tem o botão da ação;
 * (6) o leitor: peça torta = leitura nula inteira.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ListaDePendencias, TabelaDePagamentos, TabelaDoHistorico, TopoDoContrato } from './TelaDoContratoV3';
import { lerTelaDoContrato, type TelaDoContrato } from '@/lib/financiamentos/telaDoContrato';
import { colunasDasParcelas } from '@/lib/financiamentos/reguaDasParcelas';

const RAW = (o: Record<string, unknown> = {}, c: Record<string, unknown> = {}, k: Record<string, unknown> = {}) => ({
  condicoes: { taxa: 0.6821, unidade: 'a.m.', taxa_aa: 8.4986, sistema: null, carencia_ate: null, tipo_taxa: null, periodicidade: 'mensal', ...k },
  contrato: { data_contrato: '2025-11-10', vencimento_final: '2040-11-15', atividade: 'agricultura', credor: 'SINT BANCO REGIONAL DE DESENVOLVIMENTO',
    credor_documento: null, primeira_liberacao: { data: '2025-11-21', a_confirmar: false }, ultima_liberacao: { data: '2026-02-10', a_confirmar: true }, vencidas: 1, ...c },
  liberacoes: [], liberacoes_total: { qtde: 0, liberado: 0, entrou: 0, a_identificar: 0, excedente: 0 },
  pagamentos: [
    { data: '2026-07-21', tipo: 'parcela', item: 'Parcela 1/15', principal: 1000, juros: 50, encargos: 0, total: 1050, conta: 'SINT Conta', lancamento_id: 'l-1' },
    { data: '2026-07-22', tipo: 'encargo', item: 'Encargo · IOF', principal: 0, juros: 0, encargos: 38, total: 38, conta: 'SINT Conta', lancamento_id: 'l-2' },
  ],
  pagamentos_total: { qtde: 2, principal: 1000, juros: 50, encargos: 38, total: 1088 },
  historico: [{ data: '2026-07-22', evento: 'Encargo · IOF', valor: 38 }, { data: '2025-11-21', evento: 'Liberação · em conta', valor: 2966000 }],
  a_resolver: [
    { chave: 'vencidas', tom: 'vencido', valor: 8119, acao: 'buscar_pagamento', parcela_id: 'p-3', texto: '1 parcela vencida sem pagamento' },
    { chave: 'sem_cedula', tom: 'dado', valor: null, acao: 'anexar', texto: 'Cédula do contrato não anexada' },
  ],
  ...o,
});
const tela = (o?: Record<string, unknown>, c?: Record<string, unknown>, k?: Record<string, unknown>): TelaDoContrato => {
  const t = lerTelaDoContrato(RAW(o, c, k)); if (!t) throw new Error('leitura torta'); return t;
};
const topo = (t: TelaDoContrato | null, pendencias = { qtde: 2, vencido: true }, onAbrirPendencias = vi.fn()) => render(
  <TopoDoContrato numero="SINT-78.179" descricao="Armazém" status="ativo" vencido={8119} tela={t} onEditar={() => undefined}
    pendencias={pendencias} onAbrirPendencias={onAbrirPendencias}
    saldo={{ aplicaSaldo: true, regra: 'calculado', contratado: 6412049, liberado: 6412049, liberacoes: 3, amortizado: 0, saldo: 6412049, jurosPagos: 0,
      jurosPrevistos: 0, foraDasSomas: false, pendencias: [] }} />);

describe('(1) cabeçalho e total fora da rolagem', () => {
  it('Pagamentos: o scrollport é a área da tabela; thead preso no topo e tfoot no fundo; encargo em linha própria', () => {
    render(<TabelaDePagamentos tela={tela()} onAbrirLancamento={() => undefined} />);
    const area = screen.getByTestId('area-que-rola-pagamentos');
    expect(area.className).toMatch(/\boverflow-y-auto\b/);
    expect(area.className).toMatch(/\bh-full\b/);
    for (const th of within(screen.getByTestId('cabecalho-pagamentos')).getAllByRole('columnheader')) expect(th.className).toMatch(/sticky top-0/);
    for (const td of screen.getByTestId('total-pagamentos').querySelectorAll('td')) expect(td.className).toMatch(/sticky bottom-0/);
    expect(screen.getAllByTestId('linha-pagamento').map((l) => l.textContent?.includes('Encargo · IOF'))).toEqual([false, true]);
    expect(screen.getByTestId('total-pagamentos').textContent).toContain('1.088,00');
  });
  it('Histórico: só eventos com data, cabeçalho preso', () => {
    render(<TabelaDoHistorico tela={tela()} />);
    expect(screen.getByTestId('area-que-rola-historico').className).toMatch(/\boverflow-y-auto\b/);
    expect(screen.getAllByTestId('linha-historico').length).toBe(2);
  });
});

describe('(2) a página não rola; (3) o cronograma é o de antes', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
  it('a raiz da tela é h-full overflow-hidden e o painel do cronograma rola por dentro', () => {
    const raiz = /<div className="([^"]*)" data-testid="tela-do-contrato">/.exec(fonte);
    expect(raiz).not.toBeNull();
    expect(raiz![1]).toMatch(/\bh-full\b/);
    expect(raiz![1]).toMatch(/\boverflow-hidden\b/);
    expect(raiz![1]).not.toMatch(/overflow-y-auto/);
    const painel = /data-testid="painel-cronograma"/.test(fonte);
    expect(painel).toBe(true);
  });
  it('as colunas do cronograma do crédito são as da régua de sempre', () => {
    expect(colunasDasParcelas(false).map((c) => c.rotulo)).toEqual(['Parc.', 'Venc.', 'Pgto.', 'Prazo', 'Principal', 'Juros', 'Total (R$)', 'Saldo após', 'Situação', 'Lançamento', '']);
  });
});

describe('(4) "não cadastrado" e as condições do banco', () => {
  it('sistema, carência e CNPJ vazios dizem "não cadastrado"; a taxa vem gravada com a unidade e a a.a. do banco', () => {
    topo(tela());
    expect(screen.getByTestId('campo-sistema').textContent).toContain('não cadastrado');
    expect(screen.getByTestId('campo-carencia').textContent).toContain('não cadastrado');
    expect(screen.getByTestId('campo-carencia').textContent).not.toContain('sem carência');
    expect(screen.getByTestId('campo-documento').textContent).toContain('não cadastrado');
    expect(screen.getByTestId('campo-taxa').textContent).toContain('0,6821 % a.m.');
    expect(screen.getByTestId('campo-taxa-aa').textContent).toContain('8,4986 % a.a.');
    /* a última liberação sem lançamento leva o selo "a confirmar"; o credor inteiro com o title */
    expect(within(screen.getByTestId('campo-ultima-liberacao')).getByTestId('selo-a-confirmar')).toBeTruthy();
    expect(screen.getByTestId('credor-do-contrato').getAttribute('title')).toBe('SINT BANCO REGIONAL DE DESENVOLVIMENTO');
  });
  it('carência gravada = "até dd/mm/aaaa"; sistema SAC', () => {
    topo(tela(undefined, undefined, { sistema: 'sac', carencia_ate: '2027-01-31' }));
    expect(screen.getByTestId('campo-carencia').textContent).toBe('Carênciaaté 31/01/2027');
    expect(screen.getByTestId('campo-sistema').textContent).toBe('SistemaSAC');
  });
  it('linha do título: "nº · descrição", o selo das vencidas e o lugar reservado do Juntar', () => {
    topo(tela());
    expect(screen.getByTestId('titulo-do-contrato').textContent).toBe('SINT-78.179 · Armazém');
    expect(screen.getByTestId('selo-das-vencidas').textContent).toBe('1 parcela vencida');
    expect(screen.getByTestId('lugar-do-juntar').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('(5) "A resolver" é ABA (B3): nenhum bloco de pendências no corpo; o selo do título abre a aba', () => {
  it('o topo não tem bloco de pendências; o selo "N pendências" (vermelho com vencido) chama a abertura da aba', () => {
    const abrir = vi.fn();
    topo(tela(), { qtde: 3, vencido: true }, abrir);
    expect(screen.queryByTestId('bloco-a-resolver')).toBeNull();
    expect(screen.queryByTestId('pendente-vencidas')).toBeNull();
    const selo = screen.getByTestId('selo-das-pendencias');
    expect(selo.textContent).toBe('3 pendências');
    expect(selo.className).toContain('text-[#b91c1c]');
    fireEvent.click(selo);
    expect(abrir).toHaveBeenCalledTimes(1);
  });
  it('sem pendência, sem selo', () => {
    topo(tela({ a_resolver: [] }), { qtde: 0, vencido: false });
    expect(screen.queryByTestId('selo-das-pendencias')).toBeNull();
  });
  it('a lista da aba: as do banco com o botão da ação, e os avisos do cronograma como itens', () => {
    const onResolver = vi.fn();
    render(<ListaDePendencias pendencias={tela().aResolver} avisos={['O principal das parcelas soma R$ 1,00 — R$ 2,00 abaixo do contratado (R$ 3,00).']} onResolver={onResolver} />);
    expect(screen.getByTestId('pendente-vencidas').textContent).toContain('8.119,00');
    expect(screen.getByTestId('resolver-vencidas').textContent).toBe('Buscar pagamento');
    expect(screen.getByTestId('resolver-sem_cedula').textContent).toBe('Anexar');
    expect(screen.getByTestId('pendente-aviso').textContent).toContain('abaixo do contratado');
    fireEvent.click(screen.getByTestId('resolver-vencidas'));
    expect(onResolver).toHaveBeenCalledWith('buscar_pagamento', expect.objectContaining({ parcelaId: 'p-3' }));
  });
  it('a página: a aba "A resolver (N)" só entra com pendência, e sob o cronograma não há aviso (fonte)', () => {
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
    expect(fonte).toContain("...(pendencias.qtde > 0 ? [{ valor: 'a_resolver' as const");
    expect(fonte).toContain("onAbrirPendencias={() => setAbaDoCredito('a_resolver')}");
    expect(fonte).not.toContain('<AvisosDoCronograma');
    expect(fonte).not.toContain("'principal · juros · cada parcela casa com o lançamento do Financeiro (↔)')}");
  });
});

describe('(5b) bloco Contrato em três colunas', () => {
  it('três colunas de rótulo fixo + valor, na largura do conteúdo: 4 · 4 · 3 linhas', () => {
    topo(tela());
    const grade = screen.getByTestId('colunas-do-contrato');
    expect(grade.className).toContain('grid-cols-[repeat(3,max-content)]');
    expect(grade.className).toContain('gap-x-8');
    expect(screen.getAllByTestId('coluna-do-contrato').map((c) => c.children.length)).toEqual([4, 4, 3]);
    expect(screen.getByTestId('campo-atividade').textContent).toContain('Agricultura');
    expect(screen.getByTestId('bloco-resumo').className).toContain('min-[600px]:w-[280px]');
  });
});

describe('(6) o leitor', () => {
  it('peça torta = leitura nula inteira (nunca zeros inventados)', () => {
    expect(lerTelaDoContrato(RAW({ liberacoes_total: { qtde: 'x' } }))).toBeNull();
    expect(lerTelaDoContrato(RAW({ a_resolver: [{ chave: 'x', tom: 'vencido', valor: null, acao: 'apagar', texto: 't' }] }))).toBeNull();
    expect(lerTelaDoContrato(null)).toBeNull();
  });
});
