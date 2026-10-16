/**
 * FECH-MES-SELECIONADO-01 — Fechamento, Resumo por Atividade e Mapa de Pastos com UM mês, o do shell.
 * O V2Index e as duas telas não se montam em teste (dezenas de hooks de dado): o mecanismo é provado num shell de mentira que
 * troca de seção como o de verdade (desmonta uma tela, monta a outra), com o hook de verdade; a ligação real é lida da FONTE.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { usePeriodoDaTela, type PeriodoControlado } from './usePeriodoDaTela';

function Tela({ nome, ...ctl }: { nome: string } & PeriodoControlado) {
  const p = usePeriodoDaTela(ctl, { ano: String(new Date().getFullYear()), mes: new Date().getMonth() + 1 });
  return (
    <div>
      <span data-testid={`mes-${nome}`}>{p.ano}-{p.mes}</span>
      <button onClick={() => p.setMes(8)}>agosto em {nome}</button>
      <button onClick={() => p.setAno('2025')}>2025 em {nome}</button>
    </div>
  );
}
/* O Fechamento desenha o Resumo DENTRO dele (mesmo estado); o Mapa é outra seção. */
function Fechamento(ctl: PeriodoControlado) {
  const [resumo, setResumo] = useState(false);
  return (
    <div>
      {resumo ? <Tela nome="resumo" {...ctl} /> : <Tela nome="fechamento" {...ctl} />}
      <button onClick={() => setResumo(r => !r)}>alternar resumo</button>
    </div>
  );
}
function Shell() {
  const [ano, setAno] = useState('2026');
  const [mes, setMes] = useState('9');
  const [secao, setSecao] = useState<'fechamento' | 'mapa'>('fechamento');
  const ctl = { periodo: { ano, mes: Number(mes) }, onPeriodoChange: (a: string, m: number) => { setAno(a); setMes(String(m)); } };
  return (
    <div>
      {secao === 'fechamento' ? <Fechamento {...ctl} /> : <Tela nome="mapa" {...ctl} />}
      <button onClick={() => setSecao(s => (s === 'fechamento' ? 'mapa' : 'fechamento'))}>trocar seção</button>
    </div>
  );
}
const mesDe = (n: string) => screen.getByTestId(`mes-${n}`).textContent;
const clicar = (t: string) => fireEvent.click(screen.getByText(t));

describe('o mês do shell vale para as três telas', () => {
  it('Fechamento → Resumo → Fechamento: o mesmo mês', () => {
    render(<Shell />);
    clicar('agosto em fechamento');
    clicar('alternar resumo');
    expect(mesDe('resumo')).toBe('2026-8');
    clicar('alternar resumo');
    expect(mesDe('fechamento')).toBe('2026-8');
  });

  it('Fechamento → Mapa → Fechamento: o mês sobrevive ao desmontar a seção', () => {
    render(<Shell />);
    clicar('agosto em fechamento');
    clicar('trocar seção');
    expect(mesDe('mapa')).toBe('2026-8');
    clicar('trocar seção');
    expect(mesDe('fechamento')).toBe('2026-8');
  });

  it('Resumo ↔ Mapa, e a troca numa tela aparece na outra', () => {
    render(<Shell />);
    clicar('alternar resumo');
    clicar('2025 em resumo');
    clicar('trocar seção');
    expect(mesDe('mapa')).toBe('2025-9');
    clicar('agosto em mapa');
    clicar('trocar seção'); /* a volta do Mapa cai no Fechamento (a seção remonta), e dali o Resumo */
    clicar('alternar resumo');
    expect(mesDe('resumo')).toBe('2025-8');
  });

  it('padrão: sem o shell, a tela nasce no mês atual (hospedeiro legado); com o shell, no mês dele', () => {
    const { unmount } = render(<Tela nome="solta" />);
    expect(mesDe('solta')).toBe(`${new Date().getFullYear()}-${new Date().getMonth() + 1}`);
    clicar('agosto em solta');
    expect(mesDe('solta')).toBe(`${new Date().getFullYear()}-8`);
    unmount();
    render(<Shell />);
    expect(mesDe('fechamento')).toBe('2026-9');
  });
});

describe('a ligação de verdade', () => {
  const v2 = readFileSync('src/v2/V2Index.tsx', 'utf8');
  const fech = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
  const mapa = readFileSync('src/pages/MapaPastosTab.tsx', 'utf8');
  it('o V2Index entrega o MESMO ano/mês às duas seções', () => {
    expect(v2).toContain('const periodoDoFechamento = { ano, mes: mesVisivel };');
    expect(v2.split('periodo={periodoDoFechamento} onPeriodoChange={mudarPeriodoDoFechamento}').length - 1).toBe(2);
  });
  it('Fechamento e Mapa não guardam mês próprio quando o shell manda', () => {
    for (const src of [fech, mapa]) {
      expect(src).toContain('usePeriodoDaTela({ periodo, onPeriodoChange }');
      expect(src).not.toMatch(/const \[mesFiltro, setMesFiltro\] = useState/);
      expect(src).not.toMatch(/const \[anoFiltro, setAnoFiltro\] = useState/);
    }
    /* o Resumo por Atividade é desenhado pelo Fechamento com os MESMOS setters */
    expect(fech).toContain('mesFiltro={mesFiltro} setMesFiltro={setMesFiltro} statusPorMes={statusPorMes}\n        onBack={() => setShowResumoAtividades(false)}');
  });
});
