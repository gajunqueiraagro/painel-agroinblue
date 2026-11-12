/** FECH-CARDS-QUEBRA-01 (Gabriel 11/11 15:15, PUR out/26) — o aviso diz QUAIS pastos; o card tem o mesmo esqueleto em todo estado. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fonteDoNomeDoCard, nomesAteOito } from './nomesAteOito';

const tela = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');

describe('FECH-CARDS-QUEBRA-01', () => {
  it('(4) até 8 nomes inteiros; do 9º em diante vira "+N"', () => {
    expect(nomesAteOito(['P8', 'P16', 'P21A', 'P26', 'P30'])).toBe('P8, P16, P21A, P26, P30');
    const doze = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
    expect(nomesAteOito(doze)).toBe('P1, P2, P3, P4, P5, P6, P7, P8 +4');
    expect(nomesAteOito(doze.slice(0, 8))).toBe('P1, P2, P3, P4, P5, P6, P7, P8');
    expect(nomesAteOito([])).toBe('');
  });
  it('(4) o aviso "Pastos sem Tipo de Uso" mostra os nomes', () => {
    expect(tela).toContain('data-testid="pastos-sem-tipo"');
    expect(tela).toContain('{nomesAteOito(pastosVaziosIds.map(');
  });
  it('(2) o conteúdo do card começa no topo e a linha do peso existe sempre', () => {
    expect(tela).toContain('className={`flex w-full flex-col justify-start [container-type:inline-size] rounded-lg border text-left');
    expect(tela.match(/border-2 px-\[7px\] py-\[5px\]/g)).toHaveLength(2);
    expect(tela).toContain('<div className="h-2 mt-0.5" data-testid="linha-do-peso-vazia" />');
    expect(tela).toContain(": tipoNorm === 'vedado' ? '0 cab' : '—'}");
  });
  it('o nome do card: nunca "…" — longo desce a 11px e quebra', () => {
    expect(fonteDoNomeDoCard('P10A')).toBe('text-xs');
    expect(fonteDoNomeDoCard('P21A ABCD')).toBe('text-[11px]');
    expect(fonteDoNomeDoCard('P12 Retiro do córrego de baixo')).toBe('text-[11px]');
    const nome = tela.slice(tela.indexOf('data-testid="nome-do-card"') - 260, tela.indexOf('data-testid="nome-do-card"'));
    expect(nome).toContain('min-w-0 break-words font-bold');
    expect(nome).not.toContain('truncate');
  });
  it('(1) o selo do tipo tem lugar próprio e a área cede', () => {
    expect(tela).toContain('data-testid="selo-do-tipo" className={`flex-none ');
    expect(tela).toContain('<div className="mt-auto flex items-center justify-between gap-1 pt-0.5" data-testid="linha-de-baixo-do-card">');
    expect(tela).toContain('<span className="min-w-0 overflow-hidden whitespace-nowrap text-[8px] text-muted-foreground leading-none"');
  });
});

describe('FECH-CARDS-QUEBRA-01 (3) — o popup do vedado', () => {
  it('vedado sem gado = "0 cab" no popup, como no card', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { PopupDoPasto } = await import('@/components/fechamento/PopupDoPasto');
    const base = { nome: 'P8', lote: null, totalCab: 0, pesoMedioKg: null, categorias: [], uaHa: null };
    const { unmount } = render(<PopupDoPasto d={{ ...base, vedado: true }} />);
    expect(screen.getByTestId('popup-do-pasto-cabecalho').textContent).toContain('0 cab');
    unmount();
    render(<PopupDoPasto d={base} />);
    expect(screen.getByTestId('popup-do-pasto-cabecalho').textContent).toContain('—');
  });
});
