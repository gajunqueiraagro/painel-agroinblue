/**
 * P121 (FIN-MODAL-RESUMO-01, mock `mock-resumo-lancamento-v1_1.html` aprovado 27/10) — o Resumo do lançamento com os 3 casos do mock
 * (Elos · Alvorada · Nomes bem longos). O jsdom não mede: as alturas iguais com nome curto e longo são do `check:ui-cortes`
 * (`alturasComo`) e do `check:ui-desloca` (`lancamento-resumo-longo`); aqui fica o contrato — o que cada linha mostra, o `title` com o
 * texto inteiro, o "—" e o MESMO esqueleto (mesmas classes) com nomes curtos e longos. Dados SINTÉTICOS nos nomes do mock.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumoDoLancamento, type ResumoDoLancamentoProps } from './ResumoDoLancamento';

const BASE: ResumoDoLancamentoProps = {
  tipo: { rotulo: 'Saídas', cor: 'text-red-500' }, competencia: '16/10/2026', favorecido: 'Elos Comercio de Materiais de Construcao Ltda',
  favorecidoDocumento: '33.759.218/0002-64', descricao: 'Joelho c/rosca 90x1.1/2 20101946 Tigre, Registro Esfera VS Compacto', fazenda: 'Faz. Pureza',
  valor: 'R$ 804,40', sentido: 'saida', conta: [{ rotulo: 'Conta', nome: 'Banco do Brasil' }], atividade: 'Pecuária', safra: 'Safra 26/27 Pecuária',
  fase: 'Todas (rateia)', centro: 'Manutenção Fazenda', subcentro: 'Ferramentas e Equipamentos Pecuária', status: { rotulo: 'Programado', cor: 'text-x font-semibold' },
  forma: null, vencimento: '10/11/2026', pagamento: null, modalidade: null, parcelas: null, documento: 'Nota Fiscal · 000.544.330',
};
const ALVORADA: ResumoDoLancamentoProps = {
  ...BASE, competencia: '10/08/2026', favorecido: 'Alvorada Com. de Produtos Agropecuários Ltda - CG', favorecidoDocumento: '11.222.333/0001-81 · Campo Grande/MS',
  descricao: 'Produce FR 1 L, Lontal Pour On FR 1 L · 10 itens 1/4', fazenda: 'Faz. Sta. Tereza', valor: 'R$ 821,22', conta: [{ rotulo: 'Conta', nome: 'Cartão Elo' }],
  fase: null, centro: 'Sanidade', subcentro: 'Vacinas e Vermífugos', status: { rotulo: 'Realizado', cor: 'inline-block rounded-[7px] pilula' }, forma: 'Cartão',
  vencimento: '10/09/2026', pagamento: '10/09/2026', modalidade: 'Compra parcelada', parcelas: '1/4', documento: 'Nota Fiscal · 000.778.618',
};
const LONGO: ResumoDoLancamentoProps = {
  ...BASE, favorecido: 'Cooperativa Agroindustrial dos Produtores Rurais do Vale do Rio Paraná e Região Ltda',
  favorecidoDocumento: '00.000.000/0001-00 · Presidente Prudente/SP',
  descricao: 'Peças de reposição para trator e implementos, conforme pedido de compra 4521 e orçamento aprovado',
  fazenda: 'Faz. Santa Maria da Boa Esperança', valor: 'R$ 1.234.567,89', conta: [{ rotulo: 'Conta', nome: 'Itaú Personalite Investimentos' }],
  centro: 'Manutenção de Máquinas e Implementos Agrícolas', subcentro: 'Peças, Pneus e Manutenção de Tratores e Implementos Pecuária',
};

const montar = (p: ResumoDoLancamentoProps) => render(<ResumoDoLancamento {...p} />);
/** as células de valor (2ª coluna) de um bloco, na ordem: [texto, title] */
const celulas = (bloco: string) => [...screen.getByTestId(`resumo-${bloco}`).querySelectorAll('tr')]
  .map((tr) => { const td = tr.querySelectorAll('td')[1]; return [td.textContent ?? '', td.getAttribute('title')]; });
/** o esqueleto: as classes de todo elemento, na ordem do documento (o texto fora) */
const esqueleto = (c: HTMLElement) => [...c.querySelectorAll('*')].map((e) => `${e.tagName}.${e.getAttribute('class') ?? ''}`).join('\n');

describe('P121 — o Resumo do lançamento, os 3 casos do mock', () => {
  it('Elos: cada linha da Identificação com o texto e o title; CNPJ colado sob o nome; a nota numa linha', () => {
    montar(BASE);
    expect(celulas('identificacao')).toEqual([
      ['Saídas', 'Saídas'], ['16/10/2026', '16/10/2026'],
      ['Elos Comercio de Materiais de Construcao Ltda33.759.218/0002-64', 'Elos Comercio de Materiais de Construcao Ltda'],
      [BASE.descricao, BASE.descricao], ['Faz. Pureza', 'Faz. Pureza']]);
    expect(screen.getByTestId('resumo-favorecido').className).toContain('line-clamp-2');
    expect(screen.getByTestId('resumo-favorecido-documento').textContent).toBe('33.759.218/0002-64');
    expect(screen.getByTestId('resumo-descricao').className).toContain('truncate');
    expect(screen.getByTestId('resumo-nota').textContent).toBe('Nota Fiscal · 000.544.330');
    expect(screen.getByTestId('resumo-valor').textContent).toBe('R$ 804,40');
    expect(screen.getByTestId('resumo-valor').className).toContain('text-destructive');
    expect(celulas('classificacao').map((c) => c[0])).toEqual(['Pecuária', 'Safra 26/27 Pecuária', 'Todas (rateia)', 'Manutenção Fazenda',
      'Ferramentas e Equipamentos Pecuária']);
    expect(screen.getByTestId('resumo-subcentro').className).toContain('font-semibold');
  });
  it('Alvorada: o pagamento em pares (Status/Forma, Venc./Pgto., Modalid./Parcelas) e o status com a cor recebida', () => {
    montar(ALVORADA);
    const pares = [...screen.getByTestId('resumo-pagamento').querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(pares).toEqual([['Status', 'Realizado', 'Forma', 'Cartão'], ['Venc.', '10/09/2026', 'Pgto.', '10/09/2026'],
      ['Modalid.', 'Compra parcelada', 'Parcelas', '1/4']]);
    expect(screen.getByTestId('resumo-status').className).toContain('pilula');
    expect(screen.getByTestId('resumo-favorecido-documento').textContent).toBe('11.222.333/0001-81 · Campo Grande/MS');
    /* sem Fase: "—" em cinza, sem title */
    expect(celulas('classificacao')[2]).toEqual(['—', null]);
  });
  it('Nomes bem longos: o texto inteiro no title, o MESMO esqueleto do caso curto (nenhuma classe a mais ou a menos)', () => {
    const curto = montar(BASE);
    const antes = esqueleto(curto.container);
    curto.unmount();
    const longo = montar(LONGO);
    expect(esqueleto(longo.container)).toBe(antes);
    expect(screen.getByTestId('resumo-favorecido').parentElement?.getAttribute('title')).toBe(LONGO.favorecido);
    expect(screen.getByTestId('resumo-descricao').getAttribute('title')).toBe(LONGO.descricao);
    expect(screen.getByTestId('resumo-subcentro').getAttribute('title')).toBe(LONGO.subcentro);
    expect(screen.getByTestId('resumo-valor').textContent).toBe('R$ 1.234.567,89');
  });
  it('o favorecido sem cadastro: "—" e a linha do documento vazia (o lugar fica: altura fixa do bloco)', () => {
    montar({ ...BASE, favorecido: null, favorecidoDocumento: '' });
    expect(screen.getByTestId('resumo-favorecido').textContent).toBe('—');
    expect(screen.getByTestId('resumo-favorecido-documento').textContent).toBe('');
  });
  it('"sem CNPJ/CPF" vem pronto do cadastro (`linhaDoDocumento`) e aparece como está', () => {
    montar({ ...BASE, favorecidoDocumento: 'sem CNPJ/CPF' });
    expect(screen.getByTestId('resumo-favorecido-documento').textContent).toBe('sem CNPJ/CPF');
  });
  it('transferência: Origem e Destino no Financeiro; entrada em azul', () => {
    montar({ ...BASE, sentido: 'transferencia', conta: [{ rotulo: 'Origem', nome: 'Banco do Brasil' }, { rotulo: 'Destino', nome: 'Sicredi' }] });
    expect([...screen.getByTestId('resumo-financeiro').querySelectorAll('tr')].map((tr) => tr.textContent)).toEqual(['OrigemBanco do Brasil', 'DestinoSicredi']);
    montar({ ...BASE, sentido: 'entrada' });
    expect(screen.getAllByTestId('resumo-valor')[1].className).toContain('text-blue-600');
  });
  it('cada bloco tem ALTURA FIXA e esconde o que passa; nada no resumo rola', () => {
    const { container } = montar(LONGO);
    for (const b of ['identificacao', 'financeiro', 'classificacao', 'pagamento', 'documento']) {
      const c = screen.getByTestId(`resumo-${b}`).className;
      expect(c).toMatch(/(^| )h-\[\d+px\]/);
      expect(c).toContain('overflow-hidden');
    }
    expect(container.querySelectorAll('[class*="overflow-auto"], [class*="overflow-y-auto"], [class*="overflow-scroll"]')).toHaveLength(0);
  });
});
