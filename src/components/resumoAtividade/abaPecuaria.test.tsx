/**
 * RESUMO-ATIVIDADE-01b — a aba Pecuária desenha o que a lib entrega: cores da diferença, "—" sem fonte, as duas divergências
 * no rodapé e a régua da tabela "Por fase". A tela não faz conta (lida da fonte).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { AbaPecuaria } from './AbaPecuaria';
import { montarResumoDoMes, totalDaPecuariaDoCache, type CardDoResumo, type PastoDoResumo } from '@/lib/fechamento/resumoPorAtividade';
import { montarPorFase, rebanhoDoPeriodo, linhasDoRebanho, numerosRapidos, type LinhaMovimentoCache } from '@/lib/fechamento/resumoPecuaria';

const MES = '2026-09';
const pastos: PastoDoResumo[] = [
  { id: 'a', nome: 'a', tipo_uso: 'cria', area_produtiva_ha: 100, ativo: true },
  { id: 'v', nome: 'v', tipo_uso: 'cria', area_produtiva_ha: 25, ativo: true },
];
const cards: CardDoResumo[] = [
  { id: 'c1', pasto_id: 'a', ano_mes: MES, status: 'fechado', tipo_uso_mes: 'cria' },
  { id: 'c2', pasto_id: 'v', ano_mes: MES, status: 'fechado', tipo_uso_mes: 'vedado' },
];
const itens = [{ fechamento_id: 'c1', quantidade: 100, peso_medio_kg: 300 }];
const mov = (cenario: string, o: Partial<LinhaMovimentoCache>): LinhaMovimentoCache => ({
  ano_mes: MES, cenario, saldo_inicial: 0, saldo_final: 0, cab_nascimento: 0, cab_compra: 0, cab_transf_entrada: 0, cab_abate: 0,
  cab_venda: 0, cab_venda_pe: 0, cab_consumo: 0, cab_morte: 0, cab_transf_saida: 0, peso_venda: 0, peso_venda_pe: 0, ...o,
});

function montar(comMeta: boolean) {
  const resumo = montarResumoDoMes({ anoMes: MES, pastos, cards, itens });
  const total = totalDaPecuariaDoCache([{ ano: 2026, mes: 9, saldo_inicial: 95, saldo_final: 101, peso_total_final: 101 * 290, producao_biologica: 0, dias_mes: 30 }], 125);
  const porFase = montarPorFase({ anoMes: MES, pastos, cards, resumo, total, areaPecuariaHa: 125 });
  const cache = [mov('realizado', { saldo_inicial: 95, saldo_final: 101, cab_nascimento: 10, cab_abate: 2, cab_morte: 2 })];
  if (comMeta) cache.push(mov('meta', { saldo_inicial: 95, saldo_final: 99, cab_nascimento: 8, cab_abate: 4 }));
  const reb = rebanhoDoPeriodo([MES], cache, []);
  render(<AbaPecuaria rotuloMes="set/26" anoMes={MES} areaPecuariaHa={125} porFase={porFase}
    areaPorFase={[{ chave: 'cria', rotulo: 'Cria', valor: 100 }, { chave: 'vedado', rotulo: 'Vedado', valor: 25 }]} areaPorFaseTotal={125}
    colunasArea={[]} colunasCabecas={[]} linhasRebanho={linhasDoRebanho(reb)} naoFecha={reb.naoFecha} foraVendaGeral={0}
    rapidos={numerosRapidos(reb)} erroReceitas={null} />);
}

describe('aba Pecuária', () => {
  it('Dif. cab pela cor do efeito: mais nascimento verde, menos abate vermelho', () => {
    montar(true);
    const nasc = within(screen.getByTestId('rebanho-nascimentos')).getAllByRole('cell')[3];
    expect(nasc.textContent).toBe('+2');
    expect(nasc.querySelector('span')?.className).toContain('#15803d');
    const ab = within(screen.getByTestId('rebanho-abate')).getAllByRole('cell')[3];
    expect(ab.textContent).toBe('−2');
    expect(ab.querySelector('span')?.className).toContain('#b91c1c');
  });

  it('"—" sem fonte: sem meta e sem DRE', () => {
    montar(false);
    const cells = within(screen.getByTestId('rebanho-abate')).getAllByRole('cell');
    expect(cells[2].textContent).toBe('—');
    expect(cells[4].textContent).toBe('—');
    expect(within(screen.getByTestId('numeros-rapidos')).getByText('R$/@ venda').nextSibling?.textContent).toBe('—');
  });

  it('a divergência sai no rodapé, sem ajuste; a régua da tabela é a do mock', () => {
    montar(true);
    expect(screen.getByTestId('rodape-por-fase').textContent).toContain('Σ fases 100 × cache 101 cab');
    const cols = [...screen.getByTestId('tabela-por-fase').querySelectorAll('col')].map(c => c.getAttribute('style'));
    expect(cols).toEqual(['width: 196px;', 'width: 84px;', 'width: 84px;', 'width: 84px;', 'width: 90px;']);
    expect(screen.queryByTestId('rebanho-transfSaida')).toBeNull();
  });

  it('a tela não faz conta (fonte)', () => {
    const src = readFileSync('src/components/resumoAtividade/AbaPecuaria.tsx', 'utf8');
    /* nenhuma soma de dado (o `+=` que resta e' a geometria do donut e das colunas) */
    expect(src).not.toMatch(/\.reduce\(/);
    expect('a.reduce(x)').toMatch(/\.reduce\(/);
  });
});
