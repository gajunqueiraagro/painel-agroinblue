/** CONC-SUGESTOES-V2 B — a linha sem par diz o que tem (nomes SINTÉTICOS). */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EstadoDoSemPar } from './EstadoDoSemPar';
import type { CandidatoConciliacao } from '@/hooks/useConciliacaoDoMes';

const c: CandidatoConciliacao = {
  id: 'l1', descricao: 'Anel', favorecido: 'Z R Sintetica', numeroDocumento: '9.779', dataReferencia: '2026-12-10', valor: 2002.61,
  status: 'programado', jaConciliado: 0, saldo: 2002.61, deltaValor: 0, deltaDias: 17, score: 70, preMarcado: false, ambiguo: false,
  indisponivel: false, motivoIndisponivel: null, vencimento: '2026-12-10', exata: true, documentoCasa: 'cnpj', origem: 'lancamento',
};

describe('EstadoDoSemPar', () => {
  it('exata: selo verde, o que é (fornecedor · NF · venc.) e "Casar" cheio que só abre o casar (nunca casa sozinha)', () => {
    const onCasar = vi.fn();
    render(<EstadoDoSemPar estado={{ tipo: 'exata', n: 1, candidato: c }} onCasar={onCasar} onSugestoes={vi.fn()} onCriar={vi.fn()} />);
    const el = screen.getByTestId('estado-sem-par');
    expect(el.getAttribute('data-estado')).toBe('exata');
    expect(el.textContent).toContain('✓ exata');
    expect(el.textContent).toContain('Z R Sintetica · NF 9.779 · venc. 10/12');
    expect(onCasar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sem-par-casar-exata'));
    expect(onCasar).toHaveBeenCalledTimes(1);
  });
  it('possíveis: o número e "Sugestões"; nenhuma: o motivo, "Criar" e "Procurar"', () => {
    const { rerender } = render(<EstadoDoSemPar estado={{ tipo: 'possiveis', n: 3 }} onCasar={vi.fn()} onSugestoes={vi.fn()} onCriar={vi.fn()} />);
    expect(screen.getByTestId('estado-sem-par').textContent).toBe('3 possíveisSugestõesCriar');
    rerender(<EstadoDoSemPar estado={{ tipo: 'nenhuma', motivo: 'achado pelo CNPJ · nada em aberto' }} onCasar={vi.fn()} onSugestoes={vi.fn()} onCriar={vi.fn()} />);
    expect(screen.getByTestId('estado-sem-par').textContent).toBe('nenhumaachado pelo CNPJ · nada em abertoCriarProcurar');
    rerender(<EstadoDoSemPar estado={{ tipo: 'falhou' }} onCasar={vi.fn()} onSugestoes={vi.fn()} onCriar={vi.fn()} />);
    expect(screen.getByTestId('estado-sem-par').textContent).toContain('não consegui ver as sugestões');
  });
});
