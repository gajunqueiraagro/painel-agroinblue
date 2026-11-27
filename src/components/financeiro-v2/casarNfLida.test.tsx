/**
 * CONC-CRIAR-COM-NOTA-02 D1 (homologação 14:32: "NF —" nas 5 linhas do Casar) — o levado que chega SEM o nº (os marcados pelo "Casar
 * selecionados", os do Procurar) tem o nº lido pelos ids (`lerComplementoDasLinhas`); o que veio com o nº manda. Sintético.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const LINHAS = [{ id: 'a', data_pagamento: null, fazenda_id: null, tipo_documento: 'Nota Fiscal', numero_documento: '000000404' },
  { id: 'b', data_pagamento: null, fazenda_id: null, tipo_documento: 'Nota Fiscal', numero_documento: '000000402' }];
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string) => Promise.resolve({ data: fn === 'fn_espelho_casar' ? { ok: false, motivo: 'soma_nao_bate', no_extrato: -6000, soma: -8150, diferenca: -2150 } : null, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: LINHAS, error: null }) }), in: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

import { CasarComBancoModal } from './CasarComBancoModal';

/* gate 26/11: a tabela dos levados só tem as colunas extras (Fornecedor · NF · Faz. · Ativ. · Plano) de 1100px; o jsdom abre a 1024 */
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });

describe('D1 — o nº da NF no Casar quando o levado chega sem ele', () => {
  it('2 levados sem o nº: a coluna NF mostra 000.000.404 e 000.000.402 (lidos); nunca "—" quando o lançamento tem NF', async () => {
    render(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco do Brasil" clienteId="cli"
      extrato={{ extrato_id: 'x', data: '2031-10-08', historico: 'PIX MECANICA LIDER', valor: -6000 }}
      iniciais={[{ lancamento_id: 'a', descricao: 'Serviço 404', fornecedor: 'Oficina', valor_assinado: -5250 },
        { lancamento_id: 'b', descricao: 'Serviço 402', fornecedor: 'Oficina', valor_assinado: -2900 }]}
      onConciliado={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId('levado-linha-nf').map((x) => x.textContent)).toEqual(['000.000.404', '000.000.402']));
  });
});
