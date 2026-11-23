/**
 * CONC-PAINEL-02 (Gabriel 23/11 17:11) — NAV-VOLTA-ORIGEM-01 no painel da conta: ida e volta de cada botão que sai dele.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useSaidasDoPainel, type VistaDaConciliacao } from './useSaidasDoPainel';

const montar = () => {
  const tela = { vista: 'conciliacao' as VistaDaConciliacao, conta: '', aba: '' };
  const { result, rerender } = renderHook(() => useSaidasDoPainel({
    vista: tela.vista,
    irParaVista: (v) => { tela.vista = v; },
    escolherConta: (id) => { tela.conta = id; },
    abrirConferencia: () => { tela.aba = 'conferencia'; },
  }));
  return { tela, result, rerender };
};

describe('as saídas do painel voltam para ele', () => {
  it('N1 Conferência lado a lado → fechar → o PAINEL aberto (a mesma conta), na vista de onde saiu — nunca a aba Casar', () => {
    const { tela, result, rerender } = montar();
    act(() => result.current.abrirPainel('bb'));
    act(() => result.current.conferencia('bb'));
    rerender();
    expect([tela.vista, tela.conta, tela.aba]).toEqual(['enriquecer_sistema', 'bb', 'conferencia']);
    expect([result.current.aberto, result.current.contaId, result.current.escondido]).toEqual([true, 'bb', false]); // o painel NÃO fechou
    let voltou = false;
    act(() => { voltou = result.current.voltar('conferencia'); });
    rerender();
    expect(voltou).toBe(true);
    expect(tela.vista).toBe('conciliacao');
    expect([result.current.aberto, result.current.contaId]).toEqual([true, 'bb']);
    expect(result.current.vindoDoPainel('conferencia')).toBe(false);
  });

  it('N2 Importar banco: o painel se esconde (montado) e volta pelo "voltar"; ✎ saldo: o diálogo por cima, a vista não muda', () => {
    const { tela, result, rerender } = montar();
    act(() => result.current.abrirPainel('bb'));
    act(() => result.current.importar('bb'));
    rerender();
    expect([tela.vista, result.current.escondido, result.current.aberto]).toEqual(['importar', true, true]);
    act(() => { result.current.voltar('importar'); });
    rerender();
    expect([tela.vista, result.current.escondido, result.current.aberto]).toEqual(['conciliacao', false, true]);
    act(() => result.current.saldo());
    rerender();
    expect(tela.vista).toBe('conciliacao');
    act(() => { result.current.voltar('saldo'); });
    expect(result.current.aberto).toBe(true);
  });

  it('N3 fechar a Conferência aberta pela aba (sem o painel) não mexe em nada', () => {
    const { tela, result } = montar();
    const irPara = vi.fn();
    let voltou = true;
    act(() => { voltou = result.current.voltar('conferencia'); });
    expect([voltou, tela.vista, irPara.mock.calls.length]).toEqual([false, 'conciliacao', 0]);
  });

  it('N4 a Conciliação liga cada saída do painel por aqui (nenhuma fecha o painel)', () => {
    const F = readFileSync(resolve(process.cwd(), 'src/pages/ConciliacaoBancariaTab.tsx'), 'utf8');
    expect(F).toContain('aoCasar={(id) => painel.conferencia(id)}');
    expect(F).toContain('aoImportar={(id, arquivo) => { setArquivoParaImportar(arquivo ?? null); painel.importar(id); }}');
    expect(F).toContain("onAbaChange={(a) => { setAbaEspelho(a); if (a !== 'conferencia') painel.voltar('conferencia'); }}");
    expect(F).toContain("painel.voltar('saldo');");
    expect(F).toContain('escondido={painel.escondido}');
    expect(F).not.toContain('setPainelContaId(null)');
  });
});
