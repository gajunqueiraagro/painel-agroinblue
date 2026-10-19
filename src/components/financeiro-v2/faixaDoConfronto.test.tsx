/**
 * FIN-DOC-SOMA-01 (Gabriel 19/10/2026) — a faixa do topo da aba Documentos escreve o que o banco devolveu
 * (`fin_documento_confronto`): a nota contra a base dela, cada boleto/comprovante à parte, a nota repetida.
 * Os envelopes abaixo são os do teste SQL `supabase/tests/fin_doc_soma_01_test.sql` (S1–S5), na forma que o banco devolve.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { daConfronto, type LancamentoDocumentosApi, type Confronto } from '@/hooks/useLancamentoDocumentos';
import type { Json } from '@/integrations/supabase/types';
import { faixaDoConfronto } from '@/lib/financeiro/faixaDoConfronto';

/** o `formatMoeda` separa "R$" do número com espaço fixo (U+00A0) */
const sp = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');
const fiscal = (x: { [k: string]: Json }): { [k: string]: Json } => ({ total: 100, qtd: 1, recibos: 0, base: 'lancamento', base_valor: 100, base_qtd: 1, diferenca: 0, situacao: 'fecha', ...x });
const envelope = (x: { [k: string]: Json }): { [k: string]: Json } => ({ valor_lancamento: 100, valor_documentado: 100, docs_ativos: 1, docs_com_valor: 1, diferenca: 0, confere: true,
  fiscal: fiscal({}), pagamentos: [], informativos: 0, repetidas: [], ...x });

function api(confronto: Confronto | null): LancamentoDocumentosApi {
  return { documentos: [], confronto, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar: vi.fn(), editar: vi.fn(), cancelar: vi.fn(), anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn() };
}
const faixa = (env: Json) => {
  render(<MemoryRouter><AbaDocumentosLancamento api={api(daConfronto(env))} clienteId="cli" /></MemoryRouter>);
  return screen.getByTestId('topo-confronto');
};

describe('a faixa do confronto, pelo banco', () => {
  it('S1 NF + boleto iguais: a nota confere com o lançamento, o boleto confere à parte (e não soma)', () => {
    const t = faixa(envelope({ pagamentos: [{ documento_id: 'b1', especie: 'boleto', numero: '1', valor: 100, diferenca: 0, confere: true }], docs_com_valor: 2 }));
    expect(sp(screen.getByTestId('faixa-fiscal').textContent)).toBe('Nota fiscal R$ 100,00✓ confere com o lançamento');
    expect(sp(screen.getByTestId('faixa-pag-b1').textContent)).toBe('Boleto R$ 100,00✓ confere');
    expect(sp(t.textContent)).not.toMatch(/200,00/);
  });

  it('S2 duas NFs: somam, e o rótulo diz quantas', () => {
    faixa(envelope({ fiscal: fiscal({ qtd: 2 }) }));
    expect(sp(screen.getByTestId('faixa-fiscal').textContent)).toBe('2 notas fiscais R$ 100,00✓ confere com o lançamento');
  });

  it('S3 boleto diferente da NF: a nota fecha, o boleto diz quanto difere', () => {
    faixa(envelope({ confere: false, pagamentos: [{ documento_id: 'b3', especie: 'boleto', numero: '3', valor: 90, diferenca: -10, confere: false }] }));
    expect(sp(screen.getByTestId('faixa-fiscal').textContent)).toContain('✓ confere com o lançamento');
    const bol = screen.getByTestId('faixa-pag-b3');
    expect(sp(bol.textContent)).toBe('Boleto R$ 90,00difere R$ 10,00');
    expect(bol.lastElementChild?.className).toContain('text-amber-700');
  });

  it('S4 nota inteira numa parcela de 3: contra as parcelas da compra, por extenso; "Outro" não aparece', () => {
    faixa(envelope({ valor_documentado: 300, informativos: 1,
      fiscal: fiscal({ total: 300, base: 'contrato', base_valor: 300, base_qtd: 3 }) }));
    expect(sp(screen.getByTestId('faixa-fiscal').textContent)).toBe('Nota fiscal R$ 300,00 · parcelas da compra somam R$ 300,00✓ fecha');
    const falta = faixaDoConfronto(daConfronto(envelope({ fiscal: fiscal({ total: 300, base: 'contrato', base_valor: 310, diferenca: -10, situacao: 'falta' }) })));
    expect(sp(falta?.[0].veredito)).toBe('falta R$ 10,00');
    expect(falta?.[0].tom).toBe('difere');
    const passa = faixaDoConfronto(daConfronto(envelope({ fiscal: fiscal({ total: 300, base: 'contrato', base_valor: 290, diferenca: 10, situacao: 'passa' }) })));
    expect(sp(passa?.[0].veredito)).toBe('passa R$ 10,00');
  });

  it('S5 nota repetida: conta uma vez (o total é o do banco) e a faixa avisa "cancele uma"', () => {
    faixa(envelope({ valor_documentado: 300, repetidas: [{ numero: '233089', vezes: 2 }],
      fiscal: fiscal({ total: 300, base: 'grupo', base_valor: 300, base_qtd: 5 }) }));
    expect(sp(screen.getByTestId('faixa-fiscal').textContent)).toBe('Nota fiscal R$ 300,00 · 5 parcelas ativas somam R$ 300,00✓ fecha');
    expect(sp(screen.getByTestId('faixa-rep-233089').textContent)).toBe('nota 233089 registrada 2 vezes— cancele uma');
  });

  it('recibo tem o nome dele; sem nada com valor a faixa diz isso; sem envelope, "—"', () => {
    expect(faixaDoConfronto(daConfronto(envelope({ fiscal: fiscal({ recibos: 1 }) })))?.[0].texto.replace(/\u00a0/g, ' ')).toBe('Recibo R$ 100,00');
    faixa(envelope({ fiscal: null, docs_com_valor: 0 }));
    expect(sp(screen.getByTestId('topo-sem-valor').textContent)).toBe('Nenhum documento com valor a conferir');
    expect(faixaDoConfronto(null)).toBeNull();
  });
});
