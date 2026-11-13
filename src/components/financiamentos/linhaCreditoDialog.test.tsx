/**
 * FIN-GUARDA-CHUVA G2 — os 3 acertos do Chat (13/11 00:40) no modal da linha de crédito:
 * (2) a Revisão NÃO ocupa lugar antes do "Revisar" (a tabela dos contratos fica com a altura) e aparece depois;
 * (3) o aviso de contrato de outro banco DIZ o nº e o nº abre o contrato (fecha o modal antes);
 * (1) o Banco tem a 1ª linha inteira da grade de 12 (o nome não corta); Programa · Nº · Descrição na 2ª.
 * SINTÉTICO.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => {
  const tela = {
    linha: { id: 'l1', credor_id: 'b1', credor: 'Banco Exemplo', numero: 'PR-1', programa: 'FCO', descricao: null, limite: 1000, vigencia_inicio: null, vigencia_fim: null },
    contratos: [
      { id: 'c1', numero: 'C-1', descricao: 'Do banco', status: 'ativo', contratado: 500, liberado: 500, liberado_por_liquidacao: 0, saldo: 400, juros_pagos: 10, credor_diferente: false },
      { id: 'c2', numero: 'CT-OUTRO', descricao: 'Do outro', status: 'ativo', contratado: 300, liberado: 300, liberado_por_liquidacao: 0, saldo: 300, juros_pagos: 0, credor_diferente: true },
    ],
    totais: { contratos: 2, contratado: 800, liberado: 800, liberado_por_liquidacao: 0, falta_liberar: 200, saldo: 700, juros_pagos: 10 },
    avisos: [{ codigo: 'contrato_de_outro_credor' }],
  };
  const previa = { ok: true, simulado: true, sem_mudanca: false, id: 'l1', antes: { limite: 1000 }, depois: { limite: 2000 }, avisos: [] };
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => Promise.resolve({ data: [], error: null }), then: (r: (v: unknown) => void) => r({ data: [], error: null }) };
  return { supabase: { from: () => q, rpc: (fn: string) => Promise.resolve({ data: fn === 'fn_linha_credito_tela' ? tela : fn === 'fn_linha_credito_salvar' ? previa : null, error: null }) } };
});

import { LinhaCreditoDialog } from './LinhaCreditoDialog';

const LINHA = { id: 'l1', credorId: 'b1', credorNome: 'Banco Exemplo', numero: 'PR-1', programa: 'FCO', descricao: null, limite: 1000, vigenciaInicio: null, vigenciaFim: null, cancelada: false };

describe('LinhaCreditoDialog — acertos do Chat 00:40', () => {
  it('(2) a Revisão só aparece depois do Revisar', async () => {
    render(<LinhaCreditoDialog aberto aoFechar={() => {}} clienteId="cli" linha={LINHA} aoGravar={() => {}} />);
    await screen.findByTestId('tabela-contratos-da-linha');
    expect(screen.queryByTestId('bloco-revisao')).toBeNull();
    fireEvent.click(screen.getByTestId('revisar-linha'));
    await waitFor(() => expect(screen.getByTestId('bloco-revisao')).toBeTruthy());
    expect(screen.getByTestId('area-da-revisao').textContent).toContain('R$ 2.000,00');
  });

  it('(3) o aviso diz o nº do contrato de outro banco e o nº abre o contrato (fecha o modal antes)', async () => {
    const aoFechar = vi.fn(); const aoAbrirContrato = vi.fn();
    render(<LinhaCreditoDialog aberto aoFechar={aoFechar} clienteId="cli" linha={LINHA} aoGravar={() => {}} aoAbrirContrato={aoAbrirContrato} />);
    const aviso = await screen.findByTestId('avisos-da-linha');
    expect(aviso.textContent).toContain('Contrato de outro banco nesta linha: CT-OUTRO');
    expect(aviso.textContent).not.toContain('C-1');
    fireEvent.click(screen.getByTestId('abrir-contrato-de-outro-banco'));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoAbrirContrato).toHaveBeenCalledWith('c2');
  });

  it('(3) sem quem abra, o nº aparece sem link', async () => {
    render(<LinhaCreditoDialog aberto aoFechar={() => {}} clienteId="cli" linha={LINHA} aoGravar={() => {}} />);
    const aviso = await screen.findByTestId('avisos-da-linha');
    expect(aviso.textContent).toContain('CT-OUTRO');
    expect(screen.queryByTestId('abrir-contrato-de-outro-banco')).toBeNull();
  });

  it('(1) o Banco tem a 1ª linha inteira da grade de 12 (o nome não corta); o Programa tem 5 de 12', async () => {
    render(<LinhaCreditoDialog aberto aoFechar={() => {}} clienteId="cli" linha={LINHA} aoGravar={() => {}} />);
    const cedula = await screen.findByTestId('bloco-cedula');
    expect(cedula.querySelector('fieldset')?.className).toContain('grid-cols-12');
    const texto = (sel: string) => Array.from(cedula.querySelectorAll(sel)).map((d) => d.textContent ?? '');
    expect(texto('.col-span-12').some((t) => t.includes('Banco (credor)'))).toBe(true);
    expect(texto('.col-span-5').some((t) => t.includes('Programa'))).toBe(true);
  });
});
