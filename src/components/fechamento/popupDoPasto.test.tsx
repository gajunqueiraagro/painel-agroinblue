/**
 * POPUP-PASTO-01 — o popup do pasto (um componente para o Fechamento e o mapa): faixas em cima e embaixo, o meio claro em colunas
 * (categoria · cab · kg). POPUP-ORIGINAL-COR (Gabriel 08/11 07:58): o layout ORIGINAL, largura fixa de 220px, só a cor nova; categoria
 * pelo nome completo e a linha do lote. Dados SINTÉTICOS.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PopupDoPasto, type DadosDoPopupDoPasto } from './PopupDoPasto';

const P12: DadosDoPopupDoPasto = {
  nome: 'P_12', lote: 'Vacas CAR09', totalCab: 121, pesoMedioKg: 241.7, uaHa: 0.82,
  categorias: [{ nome: 'Mamotes M', cab: 30, pesoMedioKg: 95 }, { nome: 'Mamotes F', cab: 31, pesoMedioKg: null }, { nome: 'Vacas', cab: 60, pesoMedioKg: 410 }],
};

describe('PopupDoPasto', () => {
  it('cabeçalho (o original): nome, lote e "121 cab · 241,7 kg" com os números em negrito', () => {
    render(<PopupDoPasto d={P12} />);
    const cab = screen.getByTestId('popup-do-pasto-cabecalho');
    expect(cab.textContent).toBe('P_12121 cab · 241,7 kgLote Vacas CAR09');
    expect([...cab.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['121', '241,7']);
    expect(within(cab).getByText('P_12').className).toContain('text-[11px] font-bold');
  });
  it('o meio em colunas: a categoria pelo NOME COMPLETO (numa linha, sem cortar) · cab · kg (sem peso = "—")', () => {
    render(<PopupDoPasto d={P12} />);
    const linhas = within(screen.getByTestId('popup-do-pasto-categorias')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => [...l.querySelectorAll('td')].map((c) => c.textContent))).toEqual([['Mamotes M', '30', '95'], ['Mamotes F', '31', '—'], ['Vacas', '60', '410']]);
    expect(linhas[0].querySelector('td')?.className).toContain('whitespace-nowrap');
    expect(linhas[0].querySelector('td')?.className).not.toContain('truncate');
    expect(linhas[0].className).toContain('h-[11px] leading-[11px]');
  });
  it('rodapé (o original): "Lotação 0,82 UA/ha" com o número grande em negrito', () => {
    render(<PopupDoPasto d={P12} />);
    const rod = screen.getByTestId('popup-do-pasto-rodape');
    expect(rod.textContent).toBe('Lotação0,82 UA/ha');
    expect(rod.querySelector('b')?.className).toContain('text-[10px]');
    expect(rod.querySelector('b')?.textContent).toBe('0,82 UA/ha');
  });
  it('sem gado: só o cabeçalho, com "—" e o lote "—"; quem só recebe o lote mostra a origem no rodapé', () => {
    const { unmount } = render(<PopupDoPasto d={{ ...P12, lote: null, totalCab: 0, pesoMedioKg: null, categorias: [], uaHa: null }} />);
    expect(screen.getByTestId('popup-do-pasto-cabecalho').textContent).toBe('P_12—Lote —');
    expect(screen.queryByTestId('popup-do-pasto-categorias')).toBeNull();
    expect(screen.queryByTestId('popup-do-pasto-rodape')).toBeNull();
    unmount();
    render(<PopupDoPasto d={{ ...P12, totalCab: 0, categorias: [], uaHa: 1.1, recebeDe: ['P_11'] }} />);
    expect(screen.getByTestId('popup-do-pasto-rodape').textContent).toBe('Recebe o lote do P_111,10 UA/ha');
  });
  it('POPUP-MINI-01 — a COR (azul .72 nas faixas, branco .80 no meio, blur leve) e o tamanho FIXO da metade: 120px, cantos 6px, folga 3px 6px', () => {
    render(<PopupDoPasto d={P12} />);
    const raiz = screen.getByTestId('popup-do-pasto');
    expect(raiz.className).toContain('w-[120px]');
    expect(raiz.className).toContain('rounded-[6px]');
    expect(raiz.className).not.toContain('w-max');
    expect(raiz.className).toContain('font-sans text-[8.5px] leading-[11px] backdrop-blur-[3px]');
    expect(screen.getByTestId('popup-do-pasto-cabecalho').className).toContain('px-[6px] py-[3px]');
    /* o cabeçalho das categorias 8px, o lote 8px */
    expect(within(screen.getByTestId('popup-do-pasto-categorias')).getAllByRole('row')[0].className).toContain('text-[8px]');
    expect(within(screen.getByTestId('popup-do-pasto-cabecalho')).getByTitle('Vacas CAR09').className).toContain('text-[8px]');
    expect(screen.getByTestId('popup-do-pasto-cabecalho').className).toContain('bg-[rgba(52,96,160,0.72)] text-white');
    expect(screen.getByTestId('popup-do-pasto-rodape').className).toContain('bg-[rgba(52,96,160,0.72)] text-white');
    expect(screen.getByTestId('popup-do-pasto-categorias').className).toContain('bg-[rgba(255,255,255,0.80)]');
  });
  it('o lote comprido corta SÓ ele, com o texto inteiro no title', () => {
    const lote = 'CRI-NOV-NEL-01 · Novilhas de reposição do lote de outubro';
    render(<PopupDoPasto d={{ ...P12, lote }} />);
    const linha = within(screen.getByTestId('popup-do-pasto-cabecalho')).getByTitle(lote);
    expect(linha.className).toContain('truncate');
    expect(linha.textContent).toBe(`Lote ${lote}`);
  });
  it('a tela passa o lote pelo MESMO leitor do modal e a categoria pelo nome da fonte única; o tooltip não pinta fundo', () => {
    const f = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(f).toContain('lote: loteDoPopup(fech ? itensMap.get(fech.id) ?? [] : [], lotesDaFazenda.lotes),');
    expect(f).toContain("const lotesDaFazenda = useLotesDaFazenda(fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null, anoMes);");
    expect(f).toContain("categorias: resumo.catBreakdown.map(cb => ({ nome: catMap.get(cb.codigo) ?? '—', cab: cb.qty, pesoMedioKg: cb.pesoMedio })),");
    expect(f).toContain('collisionPadding={4} className="p-0 border-0 bg-transparent shadow-none">');
    expect(f).not.toContain('areaHa:');
  });
});
