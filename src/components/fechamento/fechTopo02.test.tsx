/**
 * FECH-TOPO-02 (Gabriel 07/11 17:52) — o topo do Fechamento área: o ano à ESQUERDA dos meses (a fita na largura da tabela, sem o
 * espelho) e o "Preço do rebanho →" que abre o Valor do Rebanho NO MÊS DO FILTRO, com a volta "← Fechamento set/26" para o mesmo mês.
 * Dados SINTÉTICOS.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FechamentoFitaMeses } from '@/components/FechamentoFitaMeses';
import { mesCurto } from '@/lib/pecuaria/fechamentoGlobal';

const fita = (alinhadaAEsquerda?: boolean) => render(
  <FechamentoFitaMeses anoFiltro="2026" setAnoFiltro={() => {}} anosDisp={['2025', '2026']} mesFiltro={9} setMesFiltro={() => {}}
    statusPorMes={{ 9: 'fechado' }} alinhadaAEsquerda={alinhadaAEsquerda} />,
);

describe('a fita dos meses', () => {
  it('no Fechamento área: o ano é o 1º, os meses ocupam o resto da linha e não há espelho', () => {
    const { container } = fita(true);
    const linha = container.firstElementChild!;
    expect(linha.firstElementChild?.getAttribute('title')).toBe('Ano do fechamento');
    expect(linha.lastElementChild?.getAttribute('data-testid')).toBe('fita-dos-meses');
    expect(screen.getByTestId('fita-dos-meses').className).toContain('flex-1');
    expect(screen.getByTestId('fita-dos-meses').className).not.toContain('mx-auto');
  });
  it('sem a prop (as outras telas): como sempre, centrada e com o espelho do ano', () => {
    const { container } = fita();
    const linha = container.firstElementChild!;
    expect(linha.lastElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('fita-dos-meses').className).toContain('mx-auto');
  });
});

describe('"Preço do rebanho →": ida no mês do filtro e volta ao mesmo mês', () => {
  const rota = readFileSync('src/v2/V2Index.tsx', 'utf8');
  it('a ida guarda o mês do filtro e a origem (antes só o ano ia: o Valor do Rebanho abria no mês atual)', () => {
    const i = rota.indexOf('onNavigateToValorRebanho={(filtro) => {');
    expect(i).toBeGreaterThan(0);
    const ida = rota.slice(i, rota.indexOf('}}', i));
    expect(ida).toContain('setAno(filtro.ano);');
    expect(ida).toContain('setMes(String(filtro.mes));');
    expect(ida).toContain('mesDoValorRebanhoRef.current = filtro.mes;');
    expect(ida).toContain("origemPendenciaRef.current = 'fechamento';");
    expect(ida).toContain("setSection('valor-rebanho');");
    /* o Valor do Rebanho abre nesse mês e a volta vai para a origem (o Fechamento lê o mês do shell, que a ida pôs no do filtro) */
    /* FECH-FAIXA-01: o Valor do Rebanho lê o MESMO ano/mês do shell (a ida acima já pôs o mês do filtro nele) */
    const vr = rota.slice(rota.indexOf('<ValorRebanhoTab'), rota.indexOf('/>', rota.indexOf('<ValorRebanhoTab')));
    expect(vr).toContain('periodo={periodoDoFechamento} onPeriodoChange={mudarPeriodoDoFechamento}');
    expect(rota).toContain("? () => { const o = voltarParaOrigem(); setSection(o ?? 'rebanho-home'); }");
  });
  it('a volta diz para onde: "← Fechamento set/26" no lugar da seta', () => {
    /* FECH-FAIXA-01: o rótulo usa o mês do shell (o mesmo que o Valor do Rebanho mostra e que o Fechamento abre na volta) */
    expect(rota).toContain("rotuloDaVolta={!voltaAoResumoRef.current && origemPendenciaRef.current === 'fechamento'");
    expect(rota).toContain("? `Fechamento ${mesCurto(`${ano}-${String(mesVisivel).padStart(2, '0')}`)}` : undefined}");
    expect(`Fechamento ${mesCurto(`2026-${String(9).padStart(2, '0')}`)}`).toBe('Fechamento set/26');
    const vr = readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8');
    expect(vr).toContain('{onBack && rotuloDaVolta ? (');
    expect(vr).toContain('← {rotuloDaVolta}');
  });
});

describe('acertos do Chat 07/11 21:55', () => {
  const tela = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
  const iBotoes = tela.indexOf('data-testid="botoes-do-topo"');
  const botoes = tela.slice(iBotoes, tela.indexOf('data-testid="lugar-ajustar"', iBotoes));
  it('1 — os 6 botões com LUGAR FIXO: sem o destino o BOTÃO não existe (ACESSOS-FIN-01), fica um span invisível do mesmo tamanho', () => {
    expect(iBotoes).toBeGreaterThan(0);
    for (const [cond, t] of [['!onNavigateToConferenciaGmd', 'lugar-gmd'], ['!onNavigateToMapaPastos', 'lugar-mapa'], ['(isGlobal || !fazendaAtual)', 'lugar-pdf']]) {
      expect(botoes).toContain(`{${cond} && <span className={LUGAR_DO_BOTAO} aria-hidden data-testid="${t}">`);
    }
    expect(tela).toContain("const LUGAR_DO_BOTAO = `${buttonVariants({ variant: 'outline', size: 'sm', className: BOTAO_DA_BARRA })} invisible`;");
    /* o lugar não é botão: nenhum <Button> invisível além do do Ajustar */
    expect((botoes.match(/invisible`\} aria-hidden tabIndex=\{-1\} disabled/g) ?? []).length).toBe(1);
  });
  it('2 — o popup do card: o limite da colisão é a página (à direita do menu lateral), não a janela', () => {
    expect(tela).toContain('<div ref={setAreaDaTela} className="pb-24" data-testid="area-do-fechamento">');
    expect(tela).toContain('<TooltipContent side="top" collisionBoundary={areaDaTela} collisionPadding={4}');
  });
  it('2 — o popup do mapa: o lado se escolhe ANTES de o Leaflet abrir/mover a dica (registrado antes do bindTooltip)', () => {
    const m = readFileSync('src/components/mapa-geo/MapaDosPastos.tsx', 'utf8');
    const iBind = m.indexOf('camada.bindTooltip(');
    expect(m.indexOf("camada.on('mouseover', ajustarDica);")).toBeGreaterThan(0);
    expect(m.indexOf("camada.on('mouseover', ajustarDica);")).toBeLessThan(iBind);
    expect(m.indexOf("camada.on('mousemove', ajustarDica);")).toBeLessThan(iBind);
    expect(m).toContain('dica.options.direction = lado.direcao;');
  });
  it('os rótulos em todo zoom, como o Geo (com o padrão 14 do hook, a fazenda inteira no quadro — zoom 13,5 na 3M — saía sem rótulo)', () => {
    const m = readFileSync('src/components/mapa-geo/MapaDosPastos.tsx', 'utf8');
    const geo = readFileSync('src/components/mapa-geo/MapaGestorView.tsx', 'utf8');
    expect(geo).toContain("useStableLeafletMap({ debugName: 'MapaGestor', labelZoomThreshold: 0 })");
    expect(m).toContain("useStableLeafletMap({ debugName: 'MapaDosPastos', labelZoomThreshold: 0 })");
  });
});
