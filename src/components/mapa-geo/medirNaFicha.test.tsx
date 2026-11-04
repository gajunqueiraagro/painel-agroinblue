/**
 * MEDIR-NO-MAPA-01 (Gabriel 03/11 20:54) — a ficha da infraestrutura: o campo de área (m²) tem "Medir no mapa", o de comprimento (m) a "Régua";
 * a medida só preenche o campo (com as casas dele); o Esc (null) não muda nada; a profundidade do poço não tem régua.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { FichaEditar, medidaNoCampo } from './FichaDaInfra';
import type { Ficha } from '@/lib/mapa/fichasDaInfra';
import type { TipoInfra } from '@/lib/mapa/infraestrutura';

function Host({ tipo, inicial, medir, aoMudar }: { tipo: TipoInfra; inicial: Ficha; medir?: (f: 'area' | 'linha') => Promise<number | null>; aoMudar?: (f: Ficha) => void }) {
  const [ficha, setFicha] = useState<Ficha>(inicial);
  return <FichaEditar tipo={tipo} ficha={ficha} medir={medir} onChange={f => { setFicha(f); aoMudar?.(f); }} />;
}
/** a medida que o mapa devolveria, resolvida quando o teste quiser */
function medidaNaMao() {
  let resolver: (v: number | null) => void = () => {};
  const medir = vi.fn((_f: 'area' | 'linha') => new Promise<number | null>(r => { resolver = r; }));
  return { medir, devolver: async (v: number | null) => { await act(async () => { resolver(v); }); } };
}

describe('MEDIR-NO-MAPA-01 · os botões da ficha', () => {
  it('galpão: "Medir no mapa" ao lado da área construída; a área medida entra inteira (m²) e o material fica', async () => {
    const { medir, devolver } = medidaNaMao();
    const aoMudar = vi.fn();
    render(<Host tipo="galpao" inicial={{ material: 'Metálico' }} medir={medir} aoMudar={aoMudar} />);
    const botao = screen.getByTestId('infra-medir-area_construida_m2');
    expect(botao.textContent).toBe('Medir no mapa');
    fireEvent.click(botao);
    expect(medir).toHaveBeenCalledWith('area');
    expect(botao.textContent).toBe('Medindo…');
    await devolver(612.6);
    expect(aoMudar).toHaveBeenLastCalledWith({ material: 'Metálico', area_construida_m2: 613 });
    expect(botao.textContent).toBe('Medir no mapa');
  });

  it('cocho: a "Régua" no comprimento (1 casa); o Esc (null) não muda o campo', async () => {
    const { medir, devolver } = medidaNaMao();
    const aoMudar = vi.fn();
    render(<Host tipo="cocho" inicial={{ comprimento_m: 12 }} medir={medir} aoMudar={aoMudar} />);
    const regua = screen.getByTestId('infra-medir-comprimento_m');
    expect(regua.textContent).toBe('Régua');
    fireEvent.click(regua);
    expect(medir).toHaveBeenCalledWith('linha');
    await devolver(null);
    expect(aoMudar).not.toHaveBeenCalled();
    fireEvent.click(regua);
    await devolver(31.27);
    expect(aoMudar).toHaveBeenLastCalledWith({ comprimento_m: 31.3 });
  });

  it('o valor medido segue editável: o campo mostra o número e aceita digitar', async () => {
    const { medir, devolver } = medidaNaMao();
    render(<Host tipo="galpao" inicial={{}} medir={medir} />);
    fireEvent.click(screen.getByTestId('infra-medir-area_construida_m2'));
    await devolver(600.2);
    const campo = screen.getByTestId('infra-medir-area_construida_m2').parentElement!.querySelector('input')!;
    expect(campo.value).toMatch(/^600/);
    expect(campo.disabled).toBe(false);
  });

  it('só os campos de medida têm botão: a profundidade do poço e a capacidade não; sem `medir` (a ficha fora do mapa), nenhum', () => {
    const { medir } = medidaNaMao();
    const { unmount } = render(<Host tipo="poco" inicial={{}} medir={medir} />);
    expect(screen.queryAllByTestId(/^infra-medir-/)).toHaveLength(0);
    unmount();
    const r2 = render(<Host tipo="porteira" inicial={{}} medir={medir} />);
    expect(screen.queryAllByTestId(/^infra-medir-/).map(b => b.textContent)).toEqual(['Régua']);
    r2.unmount();
    render(<Host tipo="galpao" inicial={{}} />);
    expect(screen.queryAllByTestId(/^infra-medir-/)).toHaveLength(0);
  });

  it('as casas do campo: m² inteiro, m com 1 casa', () => {
    expect(medidaNoCampo(612.5, 0)).toBe(613);
    expect(medidaNoCampo(31.25, 1)).toBe(31.3);
  });
});
