/**
 * P74b — "Voltar para à vista". O caso do P74 (R$ 3.284,88 em 4 × 821,22; o original vencia em 10/08/2026), dados SINTÉTICOS; o banco é
 * falso — prova-se o que a tela mostra e o que ela manda gravar.
 *   W1 a leitura da resposta (pronta, recusa, torta) · W2 a confirmação antes (4) → depois (1 à vista + 3 canceladas), total igual, e a
 *   gravação · W3 parcela paga: botão apagado com a frase do banco (title e embaixo) · W4 não é compra parcelada: nada se oferece
 *   · W5 a aba Pagamento: o bloco "Parcelamento" · W6 as ligações (fonte): a parcela no Editar lançamento e o rodapé do Editar obrigação
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VoltarParaAVista } from './VoltarParaAVista';
import { lerVoltaAVista, type GravadoresDaVolta } from '@/lib/financeiro/voltarAVista';

const ANTES = [1, 2, 3, 4].map((numero) => ({ numero, lancamento_id: `l${numero}`, vencimento: `2026-${String(8 + numero).padStart(2, '0')}-10`, valor: 821.22 }));
const PRONTA = { ok: true, simulado: true, financiamento_id: 'fin-1', lancamento_id: 'l1', valor: 3284.88, vencimento: '2026-08-10', competencia: '2026-08-10',
  descricao: 'Compra sintetica de vacinas', canceladas: 3, original_guardado: true, antes: ANTES };
const RECUSA = { ok: false, simulado: true, financiamento_id: 'fin-1', antes: ANTES,
  recusa: { motivo: 'ha_paga', parcela: 2, frase: 'A parcela 2/4 já foi paga em 15/10/2026: desfaça o pagamento antes.' } };

function falso(simulada: unknown, gravada: unknown = { ...PRONTA, simulado: false }) {
  const chamar = vi.fn(async (_f: string, simular: boolean): Promise<unknown> => (simular ? simulada : gravada));
  const g: GravadoresDaVolta = { chamar };
  return { chamar, g };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('P74b — Voltar para à vista', () => {
  it('W1 a leitura: pronta, recusa e torta', () => {
    expect(lerVoltaAVista(PRONTA)).toMatchObject({ ok: true, lancamentoId: 'l1', valorCent: 328488, vencimento: '2026-08-10', canceladas: 3 });
    expect(lerVoltaAVista(RECUSA)).toMatchObject({ ok: false, frase: 'A parcela 2/4 já foi paga em 15/10/2026: desfaça o pagamento antes.' });
    expect(lerVoltaAVista({ ok: true })).toBeNull();
    expect(lerVoltaAVista(null)).toBeNull();
  });
  it('W2 a confirmação antes → depois e a gravação', async () => {
    const { chamar, g } = falso(PRONTA);
    const onVoltou = vi.fn();
    render(<VoltarParaAVista clienteId="cli" financiamentoId="fin-1" onVoltou={onVoltou} gravadores={g} />);
    const botao = screen.getByTestId('voltar-a-vista-botao');
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    expect(screen.getAllByTestId('voltar-a-vista-antes').map((l) => l.textContent)).toEqual([
      'Antes1/410/09/2026−821,22', '2/410/10/2026−821,22', '3/410/11/2026−821,22', '4/410/12/2026−821,22']);
    expect(screen.getByTestId('voltar-a-vista-depois').textContent).toBe('Depoisà vista (este)10/08/2026−3.284,88');
    expect(screen.getByTestId('voltar-a-vista-canceladas').textContent).toContain('as outras 3 ficam canceladas');
    expect(screen.getByTestId('voltar-a-vista-antes-depois').textContent).toContain('igual ao antes');
    expect(chamar).toHaveBeenCalledWith('fin-1', true);
    fireEvent.click(screen.getByTestId('voltar-a-vista-gravar'));
    await waitFor(() => expect(onVoltou).toHaveBeenCalled());
    expect(chamar).toHaveBeenLastCalledWith('fin-1', false);
  });
  it('W3 parcela paga: o botão apagado com a frase do banco', async () => {
    const { g } = falso(RECUSA);
    render(<VoltarParaAVista clienteId="cli" financiamentoId="fin-1" onVoltou={vi.fn()} comFrase gravadores={g} />);
    const frase = 'A parcela 2/4 já foi paga em 15/10/2026: desfaça o pagamento antes.';
    await waitFor(() => expect(screen.getByTestId('voltar-a-vista-botao').getAttribute('title')).toBe(frase));
    expect(screen.getByTestId('voltar-a-vista-botao')).toBeDisabled();
    expect(screen.getByTestId('voltar-a-vista-frase').textContent).toBe(frase);
  });
  it('W4 não é compra parcelada (o banco recusa a natureza): nada se oferece', async () => {
    const chamar = vi.fn(async (): Promise<unknown> => { throw new Error('Só a compra parcelada volta para à vista. Nada foi gravado.'); });
    render(<VoltarParaAVista clienteId="cli" financiamentoId="fin-x" onVoltou={vi.fn()} emBloco gravadores={{ chamar }} />);
    await waitFor(() => expect(chamar).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('voltar-a-vista')).toBeNull());
    expect(screen.queryByTestId('voltar-a-vista-bloco')).toBeNull();
  });
  it('W5 na aba Pagamento: o bloco "Parcelamento · compra parcelada em 4"', async () => {
    const { g } = falso(PRONTA);
    render(<VoltarParaAVista clienteId="cli" financiamentoId="fin-1" onVoltou={vi.fn()} emBloco comFrase gravadores={g} />);
    await waitFor(() => expect(screen.getByTestId('voltar-a-vista-bloco').textContent).toContain('compra parcelada em 4'));
  });
  it('W6 as ligações: a parcela no Editar lançamento; o rodapé do Editar obrigação (só parcelamento em edição)', () => {
    const dialogo = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
    expect(dialogo).toMatch(/\{isEdit && lancamento && clienteAtual\?\.id && financiamentoDoLanc && !lancamento\.cancelado && \(\s+<VoltarParaAVista clienteId=\{clienteAtual\.id\} financiamentoId=\{financiamentoDoLanc\} emBloco comFrase/);
    const obrigacao = readFileSync(resolve(__dirname, '../financiamentos/ObrigacaoDialog.tsx'), 'utf8');
    expect(obrigacao).toMatch(/\{edicaoDeParcelamento && financiamentoId && clienteId && \(\s+<VoltarParaAVista clienteId=\{clienteId\} financiamentoId=\{financiamentoId\}/);
  });
});

/* P96a — a compra que veio da JUNÇÃO de soltas: a volta para à vista recusa ('juncao') e no lugar fica "Desfazer a junção" */
describe('P96a — Desfazer a junção', () => {
  const JUNCAO = { ok: false, simulado: true, financiamento_id: 'fin-j', antes: [],
    recusa: { motivo: 'juncao', frase: 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção".' } };
  it('W7 o botão vira "Desfazer a junção"; a confirmação diz o que volta; gravar chama a função do banco', async () => {
    const chamar = vi.fn(async (): Promise<unknown> => JUNCAO);
    const desfazer = vi.fn(async (_f: string, simular: boolean): Promise<unknown> =>
      ({ ok: true, simulado: simular, financiamento_id: 'fin-j', lancamentos: 6, competencia_volta: 5, competencia_mantida: 1 }));
    const onVoltou = vi.fn();
    render(<VoltarParaAVista clienteId="cli" financiamentoId="fin-j" onVoltou={onVoltou} gravadores={{ chamar, desfazer }} />);
    const botao = await screen.findByTestId('desfazer-juncao-botao');
    await waitFor(() => expect(botao).toBeEnabled());
    expect(screen.queryByTestId('voltar-a-vista-botao')).toBeNull();
    expect(desfazer).toHaveBeenCalledWith('fin-j', true);
    fireEvent.click(botao);
    expect((await screen.findByTestId('desfazer-juncao-texto')).textContent).toBe('Os 6 lançamentos voltam a ser soltos, sem parcelamento. '
      + 'Nenhum é cancelado; valor, vencimento, pagamento e conciliação não mudam. A competência volta à de antes em 5. 1 teve a competência mexida depois e fica como está.');
    fireEvent.click(screen.getByTestId('desfazer-juncao-gravar'));
    await waitFor(() => expect(onVoltou).toHaveBeenCalled());
    expect(desfazer).toHaveBeenCalledWith('fin-j', false);
  });
});
