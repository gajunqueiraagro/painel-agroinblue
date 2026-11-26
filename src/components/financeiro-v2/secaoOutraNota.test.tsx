/** NOTA-ENTREGA-FUTURA-01 (3) — a seção "com outra nota" da etapa 1 (dados SINTÉTICOS no molde do caso Pastoforma). */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SecaoOutraNota, type LinhaDaOutraNota } from './SecaoOutraNota';

const linha: LinhaDaOutraNota = { id: 'a', competencia: '2026-11-01', vencimento: '2026-12-10', pagamento: null, descricao: 'Semente sintética',
  fornecedor: 'Sementes Sintéticas', fazAtiv: 'PUR · Pec.', fazendaNome: 'Fazenda Sintética', plano: 'Formação de pastagem', conta: 'Banco Sintético',
  nf: '30.436', valorCent: 1880000, status: 'Programado' };

describe('SecaoOutraNota', () => {
  it('a frase, as colunas da lista, a NF em âmbar, o porquê do faturamento e as 2 opções', () => {
    const escolher = vi.fn(); const procurar = vi.fn();
    render(<SecaoOutraNota nfDaNota="30.150" outras={['30.436']} linhas={[linha]} faturamento escolha="trocar" onEscolher={escolher} onProcurar={procurar} />);
    expect(screen.getByTestId('nota-outra-nf-frase').textContent).toBe('Esta nota (NF 30.150) ainda não está em nenhum lançamento.');
    expect([...screen.getByTestId('nota-outra-nf-tabela').querySelectorAll('th')].map((t) => t.textContent))
      .toEqual(['Comp.', 'Venc.', 'Pgto.', 'Descrição', 'Fornecedor', 'Faz.·Ativ.', 'Plano de contas', 'Conta', 'NF', 'Valor', 'Status']);
    const celulas = [...screen.getByTestId('nota-outra-nf-linha').querySelectorAll('td')].map((t) => t.textContent);
    expect(celulas).toEqual(['01/11/2026', '10/12/2026', '—', 'Semente sintética', 'Sementes Sintéticas', 'PUR · Pec.', 'Formação de pastagem', 'Banco Sintético', '30.436', '18.800,00', 'Programado']);
    expect(screen.getByTestId('nota-outra-nf-numero').className).toContain('text-amber-700');
    expect(screen.getByTestId('nota-outra-nf-porque').textContent).toContain('A NF 30.436 é a remessa');
    expect(screen.getByTestId('nota-outra-nf-trocar').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('nota-outra-nf-trocar').textContent).toContain('a 30.436 fica anexada como remessa');
    expect(screen.getByTestId('nota-outra-nf-criar').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByTestId('nota-outra-nf-criar'));
    expect(escolher).toHaveBeenCalledWith('criar');
    fireEvent.click(screen.getByTestId('nota-outra-nf-procurar'));
    expect(procurar).toHaveBeenCalledTimes(1);
    /* nada em caixa alta */
    expect(screen.getByTestId('nota-outra-nf').innerHTML).not.toMatch(/uppercase/);
  });
  it('a nota que não é faturamento: o porquê sem dizer "remessa"', () => {
    render(<SecaoOutraNota nfDaNota="30.150" outras={['30.436']} linhas={[linha]} faturamento={false} escolha="criar" onEscolher={() => {}} onProcurar={() => {}} />);
    expect(screen.getByTestId('nota-outra-nf-porque').textContent).toBe('Este lançamento já está com a NF 30.436. Se for a mesma compra, troque para a NF 30.150: a 30.436 continua anexada.');
    expect(screen.getByTestId('nota-outra-nf-trocar').textContent).not.toContain('remessa');
  });
});
