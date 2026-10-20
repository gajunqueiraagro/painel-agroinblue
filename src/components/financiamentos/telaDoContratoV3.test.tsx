/**
 * FIN-FINANC-28 · TELA DO CONTRATO v3 → v4 (Gabriel 18/10/2026; v4 às 16:11) — o que a tela promete:
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
  <TopoDoContrato numero="SINT-78.179" descricao="Armazém" status="ativo" tela={t} onEditar={() => undefined}
    parcelas={{ total: 15, pagas: 0 }} quinta={{ rotulo: 'Vencido', valor: 'R$ 8.119,00', vermelho: true }}
    pendencias={pendencias} onAbrirPendencias={onAbrirPendencias}
    saldo={{ aplicaSaldo: true, regra: 'calculado', contratado: 6412049, liberado: 6412049, liberacoes: 3, amortizado: 0, saldo: 6412049, jurosPagos: 0,
      jurosPrevistos: 0, foraDasSomas: false, pendencias: [] }} />);

describe('(1) cabeçalho e total fora da rolagem', () => {
  it('Pagamentos: o scrollport é a área da tabela; thead preso no topo e tfoot no fundo; encargo em linha própria', () => {
    render(<TabelaDePagamentos tela={tela()} onAbrirLancamento={() => undefined} />);
    const area = screen.getByTestId('area-que-rola-pagamentos');
    /* FIN-CONTRATO-TELA-FONTE-01: a área rola nos dois eixos e a tabela tem largura mínima (janela estreita rola dentro do cartão) */
    expect(area.className).toMatch(/\boverflow-auto\b/);
    expect(screen.getByTestId('tabela-pagamentos').className).toMatch(/min-w-\[720px\]/);
    expect(area.className).toMatch(/\bh-full\b/);
    for (const th of within(screen.getByTestId('cabecalho-pagamentos')).getAllByRole('columnheader')) expect(th.className).toMatch(/sticky top-0/);
    for (const td of screen.getByTestId('total-pagamentos').querySelectorAll('td')) expect(td.className).toMatch(/sticky bottom-0/);
    expect(screen.getAllByTestId('linha-pagamento').map((l) => l.textContent?.includes('Encargo · IOF'))).toEqual([false, true]);
    expect(screen.getByTestId('total-pagamentos').textContent).toContain('1.088,00');
  });
  it('Histórico: só eventos com data, cabeçalho preso', () => {
    render(<TabelaDoHistorico tela={tela()} />);
    expect(screen.getByTestId('area-que-rola-historico').className).toMatch(/\boverflow-auto\b/);
    expect(screen.getAllByTestId('linha-historico').length).toBe(2);
  });
});

describe('(2) a página não rola; (3) o cronograma é o de antes', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
  it('a raiz da tela é h-full overflow-hidden e o painel do cronograma rola por dentro', () => {
    const raiz = /<div className=\{`([^`]*)`\} data-testid="tela-do-contrato">/.exec(fonte);
    expect(raiz).not.toBeNull();
    expect(raiz![1]).toMatch(/\bh-full\b/);
    expect(raiz![1]).toMatch(/\boverflow-hidden\b/);
    expect(raiz![1]).not.toMatch(/overflow-y-auto/);
    const painel = /data-testid="painel-cronograma"/.test(fonte);
    expect(painel).toBe(true);
  });
  it('as colunas do cronograma do crédito são as da régua de sempre', () => {
    /* v4: "Total (R$)" virou "Total" e a coluna própria do lápis saiu (o lápis mora na célula Lançamento) */
    expect(colunasDasParcelas(false).map((c) => c.rotulo)).toEqual(['Parc.', 'Venc.', 'Pgto.', 'Prazo', 'Principal', 'Juros', 'Total', 'Saldo após', 'Situação', 'Lançamento']);
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
    /* v4: a última liberação sem lançamento: a DATA em laranja com o title (sem selo); o credor inteiro com o title */
    const aConfirmar = within(screen.getByTestId('campo-ultima-liberacao')).getByTestId('data-a-confirmar');
    expect(aConfirmar.getAttribute('title')).toBe('a confirmar: liberação sem lançamento vinculado');
    expect(aConfirmar.className).toContain('text-[#b45309]');
    expect(screen.queryByTestId('selo-a-confirmar')).toBeNull();
    /* FIN-CONTRATO-TELA-FONTE-01: o credor inteiro NA TELA (rola dentro do lugar dele), nunca só no `title` */
    expect(screen.getByTestId('credor-do-contrato').textContent).toBe('SINT BANCO REGIONAL DE DESENVOLVIMENTO');
    expect(screen.getByTestId('credor-do-contrato').className).toContain('uma-linha-que-rola');
  });
  it('carência gravada = "até dd/mm/aaaa"; sistema SAC', () => {
    topo(tela(undefined, undefined, { sistema: 'sac', carencia_ate: '2027-01-31' }));
    expect(screen.getByTestId('campo-carencia').textContent).toBe('Carênciaaté 31/01/2027');
    expect(screen.getByTestId('campo-sistema').textContent).toBe('SistemaSAC');
  });
  it('linha do título: só a seta, "nº · descrição" 13px (FIN-CONTRATO-TELA-FONTE-01), sem o selo das vencidas, o lugar reservado do Juntar', () => {
    topo(tela());
    expect(screen.getByTestId('titulo-do-contrato').textContent).toBe('SINT-78.179 · Armazém');
    expect(screen.getByTestId('titulo-do-contrato').className).toContain('text-[13px]');
    expect(screen.getByTestId('voltar-do-contrato').textContent).toBe('');
    expect(screen.getByTestId('voltar-do-contrato').getAttribute('aria-label')).toBe('Voltar para Financiamentos');
    expect(screen.queryByTestId('selo-das-vencidas')).toBeNull();
    expect(screen.getByTestId('lugar-do-juntar').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('(5) "A resolver" é ABA (B3): nenhum bloco de pendências no corpo; o selo do título abre a aba', () => {
  it('o topo não tem bloco de pendências; o selo laranja "N pendências" chama a abertura da aba', () => {
    const abrir = vi.fn();
    topo(tela(), { qtde: 3, vencido: true }, abrir);
    expect(screen.queryByTestId('bloco-a-resolver')).toBeNull();
    expect(screen.queryByTestId('pendente-vencidas')).toBeNull();
    const selo = screen.getByTestId('selo-das-pendencias');
    expect(selo.textContent).toBe('3 pendências');
    expect(selo.className).toContain('text-[#b45309]');
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

describe('(5b) v4 — a FICHA: Resumo em 5 células + fatos em 3 colunas', () => {
  it('um card só; o Resumo tem 5 células iguais (Vencido vermelho); os fatos, 3 colunas de 4 linhas', () => {
    topo(tela());
    const ficha = screen.getByTestId('ficha-do-contrato');
    const resumo = within(ficha).getByTestId('bloco-resumo');
    expect(resumo.className).toContain('grid-cols-5');
    expect(resumo.children.length).toBe(5);
    expect([...resumo.children].map((c) => c.firstElementChild?.textContent)).toEqual(['Contratado', 'Liberado', 'Principal pago', 'Saldo devedor', 'Vencido']);
    expect(resumo.children[4].lastElementChild?.className).toContain('text-[#b42318]');
    const grade = within(ficha).getByTestId('colunas-do-contrato');
    expect(grade.className).toContain('grid-cols-[max-content_minmax(0,max-content)_max-content]');
    expect(grade.className).toContain('gap-x-6');
    const colunas = screen.getAllByTestId('coluna-do-contrato');
    expect(colunas).toHaveLength(3);
    /* cada coluna: rótulo da largura do maior DAQUELA coluna (max-content) e o valor colado a 10px */
    for (const c of colunas) expect(c.className).toContain('grid-cols-[max-content_minmax(0,max-content)] content-start gap-x-[10px]');
    expect(colunas.map((c) => c.children.length)).toEqual([4, 4, 4]);
    expect(screen.getByTestId('campo-parcelas').textContent).toBe('Parcelas15 · 0 pagas');
    expect(screen.getByTestId('campo-atividade').textContent).toContain('Agricultura');
  });
  it('sem vencido a 5ª célula é a que a tela mandar (próximo pagamento / quitado em)', () => {
    render(<TopoDoContrato numero="X" descricao="Y" status="quitado" tela={tela()} onEditar={() => undefined} parcelas={{ total: 1, pagas: 1 }}
      quinta={{ rotulo: 'Quitado em', valor: '21/07/2025' }} pendencias={{ qtde: 0, vencido: false }} onAbrirPendencias={() => undefined} saldo={null} />);
    const resumo = screen.getByTestId('bloco-resumo');
    expect(resumo.children[4].textContent).toBe('Quitado em21/07/2025');
  });
});

describe('(5c) v4 — a página (fonte): uma faixa de caminho só, abas sem quebra, lápis na célula Lançamento, Total preso', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
  it('a faixa navy "Financeiro / … / <contrato>" saiu da página (o caminho é a barra do app)', () => {
    expect(fonte).not.toMatch(/<header className="shrink-0 bg-primary/);
    expect(fonte).not.toContain("'Parcelamentos e Financiamentos'");
  });
  it('abas numa linha (sem quebra) com a contagem ao lado e "Editar parcelas" na mesma linha', () => {
    expect(fonte).toContain('<div className="min-w-0 shrink overflow-x-auto whitespace-nowrap [scrollbar-width:none]" data-testid="segmentado-das-abas">');
    expect(fonte).toContain('<RotuloDaAba nome="Cronograma" n={cartoes?.parcelas} />');
    const barra = fonte.slice(fonte.indexOf('data-testid="abas-do-credito"'), fonte.indexOf('data-testid="painel-liberacoes"'));
    expect(barra).toContain('data-testid="editar-parcelas"');
  });
  it('o lápis mora DENTRO da célula Lançamento; Total preso no rodapé; vazio = uma linha', () => {
    const cel = fonte.slice(fonte.indexOf('data-testid="lancamento-da-parcela" title={d?.contaNome'), fonte.indexOf('{linhas.length > 0 && ('));
    expect(cel).toContain('data-testid="lapis-da-parcela"');
    expect(fonte).toContain('const TF_V4 = `sticky bottom-0 z-10');
    expect(fonte).toContain('const TH_V4 = `sticky top-0 z-10');
    expect(fonte).toContain('Sem parcelas. Use ✎ Editar parcelas ou Editar para gerar o cronograma.');
  });
});

describe('(6) o leitor', () => {
  it('peça torta = leitura nula inteira (nunca zeros inventados)', () => {
    expect(lerTelaDoContrato(RAW({ liberacoes_total: { qtde: 'x' } }))).toBeNull();
    expect(lerTelaDoContrato(RAW({ a_resolver: [{ chave: 'x', tom: 'vencido', valor: null, acao: 'apagar', texto: 't' }] }))).toBeNull();
    expect(lerTelaDoContrato(null)).toBeNull();
  });
});
