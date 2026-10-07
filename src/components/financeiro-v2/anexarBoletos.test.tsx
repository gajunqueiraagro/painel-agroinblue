/**
 * FIN-NFE-PARCELAS-01 PR 2b — "Anexar vários boletos" (tela B) e a grade de parcelas do novo parcelado
 * (tela A), montadas de verdade. O PDF é lido por um `extractPdfText` falso que devolve a linha digitável
 * REAL do boleto da Vera conforme o nome do arquivo — a leitura em si está em `linhaDigitavel.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const LINHAS: Record<string, string> = {
  'boleto_a.pdf': '34191.09008 04881.820049 19646.100008 8 16110000300650', // 26/10/26
  'boleto_b.pdf': '34191.09008 04882.240049 19646.100008 6 17370000300650', // 01/03/27
};
vi.mock('@/lib/financeiro/parser/extractPdfText', () => ({
  extractPdfText: (f: File) => Promise.resolve(
    LINHAS[f.name] ? { text: `Linha ${LINHAS[f.name]}`, pageCount: 1, hasTextLayer: true } : { text: '', pageCount: 1, hasTextLayer: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { AnexarBoletosDialog } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';
import { novoPendente } from '@/lib/financeiro/documentosPendentes';

/* As 8 parcelas da Vera como estão no banco (dia 5); a 1ª já tem boleto. */
const PARCELAS = ['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05']
  .map((vencimento, i) => ({ numero: i + 1, vencimento, valor: 3006.5, temBoleto: i === 0 }));
const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });

function soltar(arquivos: File[]) {
  fireEvent.change(screen.getByTestId('input-boletos'), { target: { files: arquivos } });
}

describe('tela B — Anexar vários boletos', () => {
  it('lê o vencimento, casa pela ordem com as parcelas SEM boleto e mostra a diferença acima de 7 dias', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(null);
    render(<AnexarBoletosDialog parcelas={PARCELAS} onConfirmar={onConfirmar} onFechar={() => {}} />);
    soltar([pdf('boleto_b.pdf'), pdf('boleto_a.pdf')]);
    await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
    const linhas = screen.getAllByTestId('linha-boleto');
    /* a parcela 1 já tem boleto: o de 26/10 vai para a 2, o de 01/03 para a 3 — pela ordem, nunca pelo mês */
    const a = linhas.find(l => l.textContent?.includes('boleto_a.pdf'));
    const b = linhas.find(l => l.textContent?.includes('boleto_b.pdf'));
    expect(a?.textContent).toContain('Parcela 2/8');
    expect(b?.textContent).toContain('Parcela 3/8');
    expect(a?.textContent).toContain('vencimento');
    expect(a?.textContent).toContain('26/10/26');
    expect(a?.textContent).toContain('3.006,50');
    /* 26/10 contra a parcela 2 (05/11): -10 dias -> âmbar; 01/03 contra 05/12: +86 */
    expect(a?.querySelector('[data-testid="diferenca-dias"]')?.textContent).toBe('-10 dias');
    expect(b?.querySelector('[data-testid="diferenca-dias"]')?.textContent).toBe('+86 dias');
    expect(a?.className).toContain('bg-amber-50');

    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    const itens = onConfirmar.mock.calls[0][0] as { arquivo: File; parcela: number }[];
    expect(itens.map(i => [i.arquivo.name, i.parcela]).sort()).toEqual([['boleto_a.pdf', 2], ['boleto_b.pdf', 3]]);
  });

  it('sem leitura: casa pelo nome; sem nome, fica "escolher" em âmbar e o botão trava com a pendência ao lado', async () => {
    render(<AnexarBoletosDialog parcelas={PARCELAS} onConfirmar={vi.fn()} onFechar={() => {}} />);
    soltar([pdf('boleto_004.pdf'), pdf('scan.pdf')]);
    await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
    const linhas = screen.getAllByTestId('linha-boleto');
    const nome = linhas.find(l => l.textContent?.includes('boleto_004.pdf'));
    const sem = linhas.find(l => l.textContent?.includes('scan.pdf'));
    expect(nome?.textContent).toContain('Parcela 4/8');
    expect(nome?.textContent).toContain('nome do arquivo');
    expect(sem?.textContent).toContain('escolher');
    expect(sem?.textContent).toContain('não leu');
    expect(sem?.className).toContain('bg-amber-50');
    expect(screen.getByTestId('anexar-boletos').closest('button')?.disabled).toBe(true);
    expect(screen.getByTestId('pendencia-boletos').textContent).toBe('Falta escolher a parcela de 1 arquivo.');
  });

  it('arquivo em formato errado é recusado NA LINHA, sem toast, e não conta', async () => {
    render(<AnexarBoletosDialog parcelas={PARCELAS} onConfirmar={vi.fn()} onFechar={() => {}} />);
    soltar([new File(['x'], 'planilha.xlsx', { type: 'application/vnd.ms-excel' })]);
    await waitFor(() => expect(screen.getByText('Formato não aceito. Envie PDF, JPG ou PNG.')).toBeTruthy());
    expect(screen.getByTestId('resumo-boletos').textContent).toContain('0 arquivos');
  });

  it('a falha de quem grava fica ao lado do botão, e o diálogo não fecha', async () => {
    const onFechar = vi.fn();
    render(<AnexarBoletosDialog parcelas={PARCELAS} onConfirmar={vi.fn().mockResolvedValue('Não gravados — parcela 2: falha')} onFechar={onFechar} />);
    soltar([pdf('boleto_a.pdf')]);
    await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(screen.getByTestId('pendencia-boletos').textContent).toBe('Não gravados — parcela 2: falha'));
    expect(onFechar).not.toHaveBeenCalled();
  });
});

describe('tela A — grade de parcelas do novo parcelado', () => {
  const previa = [
    { numero: 1, dataVencimento: '2026-10-26', valor: 3006.5 },
    { numero: 2, dataVencimento: '2026-11-26', valor: 3006.5 },
    { numero: 3, dataVencimento: '2026-12-26', valor: 3006.5 },
  ];

  it('mostra a prévia (vencimento e valor), a NF no formato da casa em todas e o boleto de cada uma', () => {
    const b2 = novoPendente({ especie: 'boleto' }, pdf('boleto_002.pdf'), 2);
    render(<ParcelasDaCompra parcelas={previa} notaFiscal="18112" qtdNotas={1} boletos={[b2]} foraDoPlano={[]}
      onBoleto={vi.fn()} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    const linhas = screen.getAllByTestId('linha-parcela');
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain('1/3');
    expect(linhas[0].textContent).toContain('26/10/26');
    expect(linhas[0].textContent).toContain('3.006,50');
    expect(linhas.every(l => l.textContent?.includes('000.018.112'))).toBe(true);
    expect(linhas[1].textContent).toContain('boleto_002.pdf');
    expect(linhas[0].textContent).toContain('sem boleto');
    expect(screen.getByTestId('com-boleto').textContent).toBe('1 de 3 com boleto');
    expect(screen.getByText('1 nota')).toBeTruthy();
    expect(screen.getByText('9.019,50')).toBeTruthy();
  });

  it('"+ Boleto" na linha guarda o boleto DAQUELA parcela; arquivo errado é recusado na linha', () => {
    const onBoleto = vi.fn();
    render(<ParcelasDaCompra parcelas={previa} notaFiscal={null} qtdNotas={0} boletos={[]} foraDoPlano={[]}
      onBoleto={onBoleto} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    fireEvent.click(screen.getByTestId('mais-boleto-3'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [pdf('b3.pdf')] } });
    expect(onBoleto).toHaveBeenCalledWith(3, expect.objectContaining({ name: 'b3.pdf' }));

    fireEvent.click(screen.getByTestId('mais-boleto-2'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(onBoleto).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('linha-parcela')[1].textContent).toContain('Formato não aceito');
  });

  /* PARC-LIVRES-01 fechamento D — "sumiu a opção de incluir boleto": sem valor ou sem vencimento o lançamento não tem parcela
     prevista, e a grade ficava VAZIA sem dizer por quê. Opção que não vale fica apagada com o motivo, nunca some. */
  it('sem parcela listada: a grade diz o motivo e o "Anexar vários boletos" fica apagado com ele; com parcela, a de sempre', () => {
    const { unmount } = render(<ParcelasDaCompra parcelas={[]} notaFiscal={null} qtdNotas={0} boletos={[]} foraDoPlano={[]}
      onBoleto={vi.fn()} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    expect(screen.getByTestId('sem-parcelas-para-boleto').textContent).toBe('Informe o valor e o vencimento do lançamento para listar as parcelas e anexar os boletos.');
    const botao = screen.getByTestId('abrir-anexar-varios') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe('Informe o valor e o vencimento do lançamento para listar as parcelas e anexar os boletos.');
    unmount();
    render(<ParcelasDaCompra parcelas={previa} notaFiscal={null} qtdNotas={0} boletos={[]} foraDoPlano={[]}
      onBoleto={vi.fn()} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    expect(screen.queryByTestId('sem-parcelas-para-boleto')).toBeNull();
    expect((screen.getByTestId('abrir-anexar-varios') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByTestId(/^mais-boleto-/).length).toBe(previa.length);
  });

  it('boleto de parcela fora do plano (o operador baixou o número de parcelas) aparece em vermelho', () => {
    const b5 = novoPendente({ especie: 'boleto' }, pdf('b5.pdf'), 5);
    render(<ParcelasDaCompra parcelas={previa} notaFiscal={null} qtdNotas={0} boletos={[]} foraDoPlano={[b5]}
      onBoleto={vi.fn()} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    expect(screen.getByTestId('boleto-fora-do-plano').textContent).toContain('parcela 5');
  });
});
