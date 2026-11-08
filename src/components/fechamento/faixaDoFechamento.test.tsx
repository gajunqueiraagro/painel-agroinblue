/**
 * FECH-FAIXA-01 (Gabriel 08/11 07:17) — o mês único e a faixa do fechamento (Fechamento área → Valor do Rebanho → Mapa do rebanho).
 * Os estados dos casos reais (BG set/26 e out/26 invalidados; 3M out/26 com os 17 fechados e o valor a validar; NJ PUR out/26 aberto)
 * entram SINTÉTICOS aqui; os prints da bancada provisória mostram as telas com os dados do proto.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, act, screen } from '@testing-library/react';
import { FaixaDoFechamento } from './FaixaDoFechamento';
import { contarPastosFechados, mesDaFaixa, passosDaFaixa, type EstadoDaFaixa } from '@/lib/fechamento/faixaDoFechamento';
import { usePeriodoDaTela } from '@/hooks/usePeriodoDaTela';

const BG_SET: EstadoDaFaixa = { anoMes: '2026-09', pastos: { fechados: 16, total: 16 }, valor: { situacao: 'invalidado', valorTotal: null, precoArroba: null } };
const M3_OUT: EstadoDaFaixa = { anoMes: '2026-10', pastos: { fechados: 17, total: 17 }, valor: { situacao: 'sem_snapshot', valorTotal: null, precoArroba: null } };
const PUR_OUT: EstadoDaFaixa = { anoMes: '2026-10', pastos: { fechados: 0, total: 74 }, valor: { situacao: 'sem_snapshot', valorTotal: null, precoArroba: null } };
const VALIDADO: EstadoDaFaixa = { anoMes: '2026-08', pastos: { fechados: 16, total: 16 }, valor: { situacao: 'validado', valorTotal: 3245120, precoArroba: 310.5 } };

describe('os textos da faixa (só das fontes que já existem)', () => {
  it('3M out/26: "Out/26 · ① Pastos 17/17 fechados ✓ → ② Valor do rebanho ⏳ falta validar → ③ Mapa do rebanho"', () => {
    expect(mesDaFaixa('2026-10')).toBe('Out/26');
    expect(passosDaFaixa(M3_OUT).map(p => `${p.numero} ${p.texto}`)).toEqual([
      '① Pastos 17/17 fechados ✓', '② Valor do rebanho ⏳ falta validar', '③ Mapa do rebanho']);
    expect(passosDaFaixa(M3_OUT).map(p => p.tom)).toEqual(['ok', 'pendente', 'neutro']);
  });
  it('BG set/26 (reaberto): o ② diz "⚠ aberto — valide de novo", vermelho (REABRIR-AUTOMATICO-01)', () => {
    const v = passosDaFaixa(BG_SET)[1];
    expect(v.texto).toBe('Valor do rebanho ⚠ aberto — valide de novo');
    expect(v.tom).toBe('alerta');
    expect(passosDaFaixa({ ...BG_SET, valor: { situacao: 'cadeia_quebrada', valorTotal: null, precoArroba: null } })[1].texto).toBe('Valor do rebanho ⚠ cadeia quebrada');
  });
  it('validado: ② mostra o valor do mês e o R$/@ que o snapshot guarda', () => {
    expect(passosDaFaixa(VALIDADO)[1].texto).toMatch(/^Valor do rebanho ✓ R\$\s3\.245\.120 · R\$\s310,50\/@$/);
  });
  it('NJ PUR out/26: pastos abertos = pendente, sem o ✓', () => {
    expect(passosDaFaixa(PUR_OUT)[0]).toMatchObject({ texto: 'Pastos 0/74 fechados', tom: 'pendente' });
  });
  it('① pela regra da tela do Fechamento: dos pastos do mês, os cards com status "fechado" (card de fora do mês não conta)', () => {
    const status = new Map([['p1', 'fechado'], ['p2', 'rascunho'], ['fora', 'fechado']]);
    expect(contarPastosFechados(['p1', 'p2', 'p3'], status)).toEqual({ fechados: 1, total: 3 });
  });
});

describe('a faixa na tela', () => {
  it('a etapa da tela aberta é destacada e SEM clique; as outras abrem a tela delas', () => {
    const pastos = vi.fn(); const mapa = vi.fn(); const valor = vi.fn();
    /* o destino da própria etapa existe, mas a atual nunca vira botão */
    render(<FaixaDoFechamento estado={BG_SET} atual="valor" abrir={{ pastos, valor, mapa }} />);
    expect(screen.getByTestId('faixa-do-fechamento-mes').textContent).toBe('Set/26 ·');
    const atual = screen.getByTestId('faixa-etapa-valor');
    expect(atual.tagName).toBe('SPAN');
    expect(atual.getAttribute('aria-current')).toBe('step');
    expect(atual.className).toContain('text-red-700');
    fireEvent.click(screen.getByTestId('faixa-etapa-pastos'));
    fireEvent.click(screen.getByTestId('faixa-etapa-mapa'));
    expect(pastos).toHaveBeenCalledTimes(1);
    expect(mapa).toHaveBeenCalledTimes(1);
    fireEvent.click(atual);
    expect(valor).not.toHaveBeenCalled();
  });
  it('sem destino (sem acesso à tela), a etapa é só texto; no Global (estado nulo), nada', () => {
    render(<FaixaDoFechamento estado={M3_OUT} atual="pastos" abrir={{}} />);
    expect(screen.getByTestId('faixa-etapa-valor').tagName).toBe('SPAN');
    const { container } = render(<FaixaDoFechamento estado={null} atual="pastos" />);
    expect(container.innerHTML).toBe('');
  });
  it('uma linha de 22px, sem quebrar', () => {
    render(<FaixaDoFechamento estado={M3_OUT} atual="mapa" />);
    expect(screen.getByTestId('faixa-do-fechamento').className).toContain('h-[22px]');
    expect(screen.getByTestId('faixa-do-fechamento').className).toContain('whitespace-nowrap');
  });
});

describe('o mês único', () => {
  it('ano e mês JUNTOS (jan → dez do ano anterior) não perdem o ano no modo controlado', () => {
    const mudar = vi.fn();
    const { result } = renderHook(() => usePeriodoDaTela({ periodo: { ano: '2026', mes: 1 }, onPeriodoChange: mudar }, { ano: '2026', mes: 1 }));
    act(() => result.current.setPeriodo('2025', 12));
    expect(mudar).toHaveBeenLastCalledWith('2025', 12);
  });
  it('o Valor do Rebanho lê o mês do shell (nunca mais o mês de hoje por padrão) e o Resolver troca os dois juntos', () => {
    const vr = readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8');
    expect(vr).toContain('const periodoDaTela = usePeriodoDaTela({ periodo, onPeriodoChange }, {');
    expect(vr).not.toMatch(/const \[mesFiltro, setMesFiltro\] = useState/);
    expect(vr).toContain('periodoDaTela.setPeriodo(String(anoAnterior), mesAnterior);');
  });
  it('as três telas recebem as etapas do V2Index, cada uma marcando a sua', () => {
    const v2 = readFileSync('src/v2/V2Index.tsx', 'utf8');
    for (const de of ['fechamento', 'valor-rebanho', 'mapa-pastos']) expect(v2).toContain(`etapasDoFechamento={etapasDoFechamento('${de}')}`);
    /* acesso: só a etapa que a pessoa pode abrir (ACESSOS-FIN-01) */
    for (const s of ['fechamento', 'valor-rebanho', 'mapa-pastos']) expect(v2).toContain(`podeAbrirTela('${s}')`);
    for (const [arq, atual] of [['src/pages/FechamentoTab.tsx', 'pastos'], ['src/pages/ValorRebanhoTab.tsx', 'valor'], ['src/pages/MapaPastosTab.tsx', 'mapa']]) {
      expect(readFileSync(arq, 'utf8')).toContain(`<FaixaDoFechamento estado={faixaDoMes} atual="${atual}" abrir={etapasDoFechamento} />`);
    }
  });
  it('REABRIR-AUTOMATICO-01: o modal que reabre o Valor do Rebanho manda a faixa reler (o ② passa a "aberto" na hora)', () => {
    const d = readFileSync('src/components/FechamentoPastoDialog.tsx', 'utf8');
    const i = d.indexOf('toast.success(fraseValorRebanhoReaberto(fechamento.ano_mes));');
    expect(i).toBeGreaterThan(0);
    expect(d.slice(i, i + 200)).toContain('void qc.invalidateQueries({ queryKey: [CHAVE_DA_FAIXA] });');
  });
  it('o Valor do Rebanho tem o "ver pastos" ao lado do Total, pela etapa ① (o Fechamento do mesmo mês)', () => {
    const vr = readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8');
    expect(vr).toContain('<button type="button" onClick={etapasDoFechamento.pastos}');
    expect(vr).toContain('data-testid="vr-ver-pastos">ver pastos</button>');
  });
});
