/**
 * POPUP-PASTO-01 + FECH-BARRA-HOVER-01 — o popup do pasto (um componente para os cards e o mapa): cabeçalho com o nome grande e a área,
 * o meio em colunas (categoria pelo NOME COMPLETO · cab · kg), rodapé com o total · peso médio e a lotação; azul leve e bem transparente
 * (adendo 18:00). Os números do P11 são os do mock (docs/mocks/fech-barra-hover.html) e os do P09 os do adendo; o resto é SINTÉTICO.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PopupDoPasto, type DadosDoPopupDoPasto } from './PopupDoPasto';

const P11: DadosDoPopupDoPasto = {
  nome: 'P_11', areaHa: 34.8, totalCab: 27, pesoMedioKg: 290, uaHa: 0.5,
  categorias: [{ nome: 'Desmama F', cab: 27, pesoMedioKg: 290 }],
};
const P09: DadosDoPopupDoPasto = {
  nome: 'P_09', areaHa: 27, totalCab: 42, pesoMedioKg: 9500 / 42, uaHa: 9500 / 450 / 27,
  categorias: [{ nome: 'Mamotes M', cab: 10, pesoMedioKg: 40 }, { nome: 'Mamotes F', cab: 11, pesoMedioKg: 35 }, { nome: 'Novilhas', cab: 21, pesoMedioKg: 415 }],
};
const P12: DadosDoPopupDoPasto = {
  nome: 'P_12', areaHa: 59.7, totalCab: 121, pesoMedioKg: 241.7, uaHa: 0.82,
  categorias: [{ nome: 'Mamotes M', cab: 30, pesoMedioKg: 95 }, { nome: 'Mamotes F', cab: 31, pesoMedioKg: null }, { nome: 'Vacas', cab: 60, pesoMedioKg: 410 }],
};

describe('PopupDoPasto (FECH-BARRA-HOVER-01)', () => {
  it('cabeçalho: o nome GRANDE (18px) e a área "34,8 ha" à direita; sem a linha do lote', () => {
    render(<PopupDoPasto d={P11} />);
    const cab = screen.getByTestId('popup-do-pasto-cabecalho');
    expect(cab.textContent).toBe('P_1134,8 ha');
    expect(within(cab).getByText('P_11').className).toContain('text-[18px]');
    expect(screen.getByTestId('popup-do-pasto').textContent).not.toContain('Lote');
  });
  it('o meio em colunas: a categoria pelo NOME COMPLETO (nunca a sigla, sem corte) · cab · kg (sem peso = "—")', () => {
    render(<PopupDoPasto d={P12} />);
    const linhas = within(screen.getByTestId('popup-do-pasto-categorias')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => [...l.querySelectorAll('td')].map((c) => c.textContent))).toEqual([['Mamotes M', '30', '95'], ['Mamotes F', '31', '—'], ['Vacas', '60', '410']]);
    expect(linhas[0].querySelector('td')?.className).not.toContain('truncate');
  });
  it('o caso do adendo (P_09 da 3M out/26): Mamotes M 10 · 40, Mamotes F 11 · 35, Novilhas 21 · 415; 42 cab · 226,2 kg · 0,78 UA/ha; 27,0 ha', () => {
    render(<PopupDoPasto d={P09} />);
    expect(screen.getByTestId('popup-do-pasto-cabecalho').textContent).toBe('P_0927,0 ha');
    const linhas = within(screen.getByTestId('popup-do-pasto-categorias')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => [...l.querySelectorAll('td')].map((c) => c.textContent))).toEqual([['Mamotes M', '10', '40'], ['Mamotes F', '11', '35'], ['Novilhas', '21', '415']]);
    expect(screen.getByTestId('popup-do-pasto-rodape').textContent).toBe('42 cab · 226,2 kg0,78 UA/ha');
  });
  it('rodapé: "27 cab · 290,0 kg" à esquerda e "0,50 UA/ha" à direita', () => {
    render(<PopupDoPasto d={P11} />);
    const rod = screen.getByTestId('popup-do-pasto-rodape');
    expect(rod.textContent).toBe('27 cab · 290,0 kg0,50 UA/ha');
    expect([...rod.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['27', '290,0', '0,50']);
  });
  it('as cores do mock, bem mais transparentes (adendo 18:00): azul a 0,55 no cabeçalho e rodapé, o meio branco a 55%, blur de 6px, 220px', () => {
    render(<PopupDoPasto d={P11} />);
    expect(screen.getByTestId('popup-do-pasto').className).toContain('w-[220px]');
    expect(screen.getByTestId('popup-do-pasto').className).toContain('backdrop-blur-[6px]');
    expect(screen.getByTestId('popup-do-pasto-cabecalho').className).toContain('bg-[rgba(52,96,160,0.55)]');
    expect(screen.getByTestId('popup-do-pasto-rodape').className).toContain('bg-[rgba(52,96,160,0.55)]');
    expect(screen.getByTestId('popup-do-pasto-categorias').className).toContain('bg-white/55');
  });
  it('sem gado: só o cabeçalho; quem só recebe o lote mostra a origem no rodapé', () => {
    const { unmount } = render(<PopupDoPasto d={{ ...P12, areaHa: null, totalCab: 0, pesoMedioKg: null, categorias: [], uaHa: null }} />);
    expect(screen.getByTestId('popup-do-pasto-cabecalho').textContent).toBe('P_12— ha');
    expect(screen.queryByTestId('popup-do-pasto-categorias')).toBeNull();
    expect(screen.queryByTestId('popup-do-pasto-rodape')).toBeNull();
    unmount();
    render(<PopupDoPasto d={{ ...P12, totalCab: 0, categorias: [], uaHa: 1.1, recebeDe: ['P_11'] }} />);
    expect(screen.getByTestId('popup-do-pasto-rodape').textContent).toBe('Recebe o lote do P_111,10 UA/ha');
  });
  it('o card do Fechamento passa a área do mês (a regra do lote) e o tooltip não pinta fundo por baixo do popup', () => {
    const f = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(f).toContain('areaHa: isPastoDivergencia(fech?.tipo_uso_mes || p.tipo_uso) ? null : paraLote(p).area');
    expect(f).toContain('collisionPadding={4} className="p-0 border-0 bg-transparent shadow-none">');
    expect(f).not.toContain('lote: fech?.lote_mes ?? null, totalCab');
    /* o nome da categoria vem da fonte única (`catMap`, de categorias_rebanho), nunca da sigla das colunas */
    expect(f).toContain("categorias: resumo.catBreakdown.map(cb => ({ nome: catMap.get(cb.codigo) ?? '—', cab: cb.qty, pesoMedioKg: cb.pesoMedio })),");
    expect(f).toContain('const catMap = useMemo(\n    () => new Map((categorias || []).map(c => [c.codigo, c.nome])),');
  });
});
