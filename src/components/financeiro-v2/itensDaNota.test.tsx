/**
 * ITENS-NOTA-01 — a TELA dos itens da nota (a mesma no lancamento e na OC) e a dos itens das notas ja' guardadas (o backfill).
 * Fixtures SINTETICAS: a nota de 3 itens (366,50) do teste puro e o DANFE 937 sintetico (desconto rateado).
 *   · Valores: 3 linhas, rodape com o liquido = 366,50, a prova verde, a descricao inteira no `title` (com a info adicional)
 *   · Fiscal: as colunas fiscais no lugar das de valor; nada de linha a mais
 *   · a soma que nao fecha: a prova vira ambar com os dois numeros
 *   · PDF: "desconto/frete rateados" so' quando ha' rateio
 *   · backfill: Simular conta e nao grava; Aplicar abre a operacao e grava COM ela; Desfazer tira pela operacao
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  candidatasDoBackfill: vi.fn(),
  baixarArquivo: vi.fn(),
  gravarItensDoArquivo: vi.fn(),
  abrirOperacaoDoBackfill: vi.fn(),
  desfazerOperacaoDoBackfill: vi.fn(),
}));
vi.mock('@/lib/financeiro/itensDaNotaBanco', () => banco);

import { ItensDaNota } from './ItensDaNota';
import { ItensDasNotasGuardadasDialog } from './ItensDasNotasGuardadasDialog';
import { itensDoPdf, itensDoXml, type CabecalhoDaNota, type ItensLidos } from '@/lib/financeiro/nfe/itensDaNota';
import { notaDoDanfe } from '@/lib/financeiro/nfe/danfe';
import { XML_ITENS_SINTETICO } from '@/lib/financeiro/nfe/__fixtures__/xmlItensSintetico';
import { PAGINAS_DANFE_SINTETICO, danfeSinteticoSemDuplicata } from '@/lib/financeiro/nfe/__fixtures__/danfeSintetico';

const CAB: CabecalhoDaNota = {
  chave: '50260911222333000424550010000032411000000010', origem: 'xml', numero: '3241', serie: '1', emissao: '2026-09-29',
  natureza: 'VENDA', regime: '3', emitenteDocumento: '11222333000424', emitenteNome: 'EMITENTE SINTETICO LTDA',
};
function doXml(): ItensLidos {
  const l = itensDoXml(new TextEncoder().encode(XML_ITENS_SINTETICO).buffer);
  if (!l) throw new Error('XML nao lido');
  return l;
}
function doPdf(paginas = PAGINAS_DANFE_SINTETICO): ItensLidos {
  const r = notaDoDanfe(paginas);
  if (r.ok === false) throw new Error(r.frase);
  return itensDoPdf(r.nota, r.extras);
}
const cabecalhos = () => [...screen.getByTestId('itens-quadro').querySelectorAll('th')].map((t) => t.textContent);
const rodape = () => [...screen.getByTestId('itens-rodape').querySelectorAll('td')].map((t) => t.textContent);

describe('ItensDaNota — Valores e Fiscal', () => {
  it('Valores: 3 linhas, o liquido de cada uma, o rodape = 366,50, a prova verde, tributos aprox. e a conta do lancamento', () => {
    render(<ItensDaNota cabecalho={CAB} lidos={doXml()} contaDoLancamento="Nutrição Engorda" />);
    const linhas = screen.getAllByTestId('itens-linha');
    expect(linhas).toHaveLength(3);
    expect(linhas.map((l) => l.lastElementChild?.textContent)).toEqual(['99,50', '217,00', '50,00']);
    expect(cabecalhos()).toEqual(['Nº', 'Cód. forn.', 'Descrição na nota', 'Qtd', 'Un', 'Unitário', 'Total', 'Desc.', 'Acrésc.', 'Líquido']);
    expect(rodape()).toEqual(['', '', '3 itens', '', '', '', '350,00', '10,00', '26,50', '366,50']);
    expect(screen.getByTestId('itens-prova').textContent).toBe('✓ Soma dos itens = valor da nota');
    expect(screen.getByTestId('itens-tributos').textContent).toContain('R$ 20,00');
    expect(screen.getByText(/Conta do lançamento manda no DRE e no caixa · Nutrição Engorda/)).toBeTruthy();
    const desc = within(linhas[0]).getByText('PRODUTO SINTETICO UM');
    expect(desc.getAttribute('title')).toBe('PRODUTO SINTETICO UM · Informacao sintetica do item 1');
    expect(desc.className).toContain('truncate');
    expect(screen.queryByText('desconto/frete rateados')).toBeNull();
  });
  it('Fiscal: as colunas fiscais (NCM, CFOP, CST/CSOSN, ICMS, ST, IPI, PIS/COFINS, IBS/CBS) no lugar das de valor; as mesmas 3 linhas', () => {
    render(<ItensDaNota cabecalho={CAB} lidos={doXml()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fiscal' }));
    expect(cabecalhos()).toEqual(['Nº', 'Descrição na nota', 'NCM', 'CFOP', 'CST/CSOSN', 'BC ICMS', 'ICMS', 'ST', 'IPI', 'PIS/COFINS', 'IBS/CBS']);
    const linhas = screen.getAllByTestId('itens-linha');
    expect(linhas).toHaveLength(3);
    expect([...linhas[0].querySelectorAll('td')].map((t) => t.textContent)).toEqual(
      ['1', 'PRODUTO SINTETICO UM', '85381000', '5102', '00', '95,00', '16,15', '0,00', '4,50', '8,79', '000001']);
    expect([...linhas[2].querySelectorAll('td')].map((t) => t.textContent)[4]).toBe('102');
  });
  it('a soma que nao fecha: a prova vira ambar e mostra os dois numeros', () => {
    const l = doXml();
    render(<ItensDaNota cabecalho={CAB} lidos={{ ...l, totais: { ...l.totais, notaCent: 36700 } }} />);
    const prova = screen.getByTestId('itens-prova');
    expect(prova.textContent).toBe('Soma dos itens 366,50 · nota 367,00');
    expect(prova.className).toContain('bg-amber-50');
  });
  it('PDF com desconto do total: "desconto/frete rateados"; o PDF sem desconto nao marca', () => {
    const { unmount } = render(<ItensDaNota cabecalho={{ ...CAB, origem: 'pdf' }} lidos={doPdf()} />);
    expect(screen.getByText('desconto/frete rateados')).toBeTruthy();
    expect(screen.getByTestId('itens-prova').textContent).toBe('✓ Soma dos itens = valor da nota');
    unmount();
    render(<ItensDaNota cabecalho={{ ...CAB, origem: 'pdf' }} lidos={doPdf(danfeSinteticoSemDuplicata())} />);
    expect(screen.queryByText('desconto/frete rateados')).toBeNull();
  });
});

describe('ITENS-NOTA-FONTE-01 — o codigo nunca corta; a tabela compacta', () => {
  it('a coluna do codigo tem a largura do MAIOR codigo da nota (14 digitos -> 14ch), sem "…"; a descricao e\' que corta', () => {
    const l = doXml();
    const comCodigo = { ...l, itens: l.itens.map((i, k) => ({ ...i, codigo: k === 1 ? '78912345100013' : i.codigo })) };
    render(<ItensDaNota cabecalho={CAB} lidos={comCodigo} />);
    const cols = screen.getByTestId('itens-quadro').querySelector('table')?.querySelectorAll('col');
    expect(cols?.[1].getAttribute('style')).toContain('calc(14ch + 10px)');
    const cel = within(screen.getAllByTestId('itens-linha')[1]).getByText('78912345100013');
    expect(cel.className).not.toContain('truncate');
    expect(cel.className).toContain('whitespace-nowrap');
    expect(cel.className).toContain('text-[8.5px]');
  });
  it('codigos curtos: a coluna nao fica menor que o rotulo (9ch)', () => {
    render(<ItensDaNota cabecalho={CAB} lidos={doXml()} />);
    const cols = screen.getByTestId('itens-quadro').querySelector('table')?.querySelectorAll('col');
    expect(cols?.[1].getAttribute('style')).toContain('calc(9ch + 10px)');
  });
});

describe('ItensDasNotasGuardadasDialog — o backfill com trilha', () => {
  const C1 = { chave: '5'.repeat(44), numero: '000000010', bucket: 'fin-documentos', caminho: 'cli/a.xml', origem: 'lancamento' };
  const C2 = { chave: '4'.repeat(44), numero: '000000011', bucket: 'oc-documentos', caminho: 'cli/b.pdf', origem: 'oc' };
  const C3 = { chave: '3'.repeat(44), numero: null, bucket: 'oc-documentos', caminho: 'cli/sumiu.pdf', origem: 'oc' };
  beforeEach(() => {
    for (const f of Object.values(banco)) f.mockReset();
    banco.candidatasDoBackfill.mockResolvedValue([C1, C2, C3]);
    banco.baixarArquivo.mockImplementation(async (_b: string, c: string) => (c.includes('sumiu') ? null : new ArrayBuffer(4)));
    banco.gravarItensDoArquivo.mockImplementation(async (_cli: string, _b: ArrayBuffer, o: { simular?: boolean }) =>
      ({ ok: true, acao: 'criada', itens: 3, confere: true, somaCent: 1, notaCent: 1, chave: 'x', numero: '1', simulado: o.simular }));
    banco.abrirOperacaoDoBackfill.mockResolvedValue('op-1');
    banco.desfazerOperacaoDoBackfill.mockResolvedValue(null);
  });
  it('Simular: le^ as candidatas, conta (2 lidas, 1 sem arquivo) e NAO grava; o Aplicar so acende depois', async () => {
    render(<ItensDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} />);
    expect(screen.getByTestId('itens-guardadas-aplicar')).toBeDisabled();
    fireEvent.click(screen.getByTestId('itens-guardadas-simular'));
    await waitFor(() => expect(screen.getAllByTestId('itens-guardadas-linha')).toHaveLength(3));
    expect(screen.getByTestId('itens-guardadas-contagem').textContent).toContain('3 notas2 lidas2 com a soma = nota1 sem leitura');
    expect(banco.gravarItensDoArquivo.mock.calls.every((c) => c[2].simular === true && c[2].operacao === null)).toBe(true);
    expect(banco.abrirOperacaoDoBackfill).not.toHaveBeenCalled();
    expect(screen.getByText('arquivo não encontrado no armazenamento')).toBeTruthy();
    expect(screen.getByTestId('itens-guardadas-aplicar')).toBeEnabled();
  });
  it('Aplicar: abre a operacao com o resumo e grava SO as lidas, cada uma com a operacao; Desfazer tira pela operacao', async () => {
    render(<ItensDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('itens-guardadas-simular'));
    await waitFor(() => expect(screen.getByTestId('itens-guardadas-aplicar')).toBeEnabled());
    banco.gravarItensDoArquivo.mockClear();
    fireEvent.click(screen.getByTestId('itens-guardadas-aplicar'));
    await waitFor(() => expect(screen.getAllByText('gravada')).toHaveLength(2));
    expect(banco.abrirOperacaoDoBackfill).toHaveBeenCalledWith('cli', { notas: 2, itens: 6 });
    expect(banco.gravarItensDoArquivo.mock.calls.map((c) => c[2])).toEqual([{ simular: false, operacao: 'op-1' }, { simular: false, operacao: 'op-1' }]);
    expect(screen.getByTestId('itens-guardadas-contagem').textContent).toContain('operação op-1');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(banco.desfazerOperacaoDoBackfill).toHaveBeenCalledWith('op-1', expect.stringContaining('desfeito')));
    expect(screen.getByTestId('itens-guardadas-frase').textContent).toContain('Desfeito');
  });
  it('a operacao nao abriu: nada e gravado e a frase diz', async () => {
    banco.abrirOperacaoDoBackfill.mockResolvedValue(null);
    render(<ItensDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('itens-guardadas-simular'));
    await waitFor(() => expect(screen.getByTestId('itens-guardadas-aplicar')).toBeEnabled());
    banco.gravarItensDoArquivo.mockClear();
    fireEvent.click(screen.getByTestId('itens-guardadas-aplicar'));
    await waitFor(() => expect(screen.getByTestId('itens-guardadas-frase').textContent).toBe('A operação de trilha não abriu. Nada foi gravado.'));
    expect(banco.gravarItensDoArquivo).not.toHaveBeenCalled();
  });
});
