/**
 * OC-BUSCAR-RECEBIMENTO-01 (adendo 07/11 08:34) — o lançamento da OC ainda não salvo mostra os documentos DA OPERAÇÃO (só leitura), no
 * lugar de "Salve o lançamento para anexar". Documentos sintéticos.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const docs = vi.hoisted(() => ({ lista: [] as unknown[], loading: false }));
vi.mock('@/hooks/useOperacaoDocumentos', () => ({ useOperacaoDocumentos: () => ({ documentos: docs.lista, loading: docs.loading }) }));
import { DocumentosDaOperacaoAntesDeSalvar } from './DocumentosDaOperacaoAntesDeSalvar';

const D = (id: string, especie: string, numero: string | null, extra: Record<string, unknown> = {}) => ({
  documentoId: id, especie, numero, serie: null, dataEmissao: '2026-10-22', cancelado: false, valorLiquido: 1000, ...extra });

describe('os documentos da OC antes de salvar', () => {
  it('lista os ativos com o selo "da operação"; o cancelado não aparece', () => {
    docs.lista = [D('a', 'nf_principal', '000.001.234', { valorLiquido: 229033.59 }), D('b', 'romaneio', null), D('c', 'acerto', '9', { cancelado: true })];
    render(<DocumentosDaOperacaoAntesDeSalvar operacaoId="op" clienteId="cli" />);
    const linhas = screen.getAllByTestId('documento-da-operacao');
    expect(linhas.map((l) => l.firstElementChild?.textContent)).toEqual(['NF 000.001.234', 'Romaneio']);
    expect(linhas[0].textContent).toContain('22/10/2026');
    expect(linhas[0].textContent).toContain('da operação');
    expect(screen.getByTestId('documentos-da-operacao-antes').textContent).not.toContain('Salve o lançamento para anexar');
  });
  it('sem documento: diz e manda salvar para anexar', () => {
    docs.lista = [];
    render(<DocumentosDaOperacaoAntesDeSalvar operacaoId="op" clienteId="cli" />);
    expect(screen.getByTestId('documentos-da-operacao-antes').textContent).toBe('A operação não tem documento. Salve o lançamento para anexar.');
  });
});
