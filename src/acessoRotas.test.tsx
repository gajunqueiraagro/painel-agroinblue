/**
 * ACESSOS-02b — (M1) as quatro rotas fora do V2 so' para o admin; (M3) o sistema abre em "/" e o endereco antigo `/v2` vira "/"
 * na barra, com query string e hash intactos, SEM desmontar a tela.
 * As telas pesadas sao trocadas por marcadores: aqui se prova o ROTEADOR, nao as telas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import AppRouter, { ehEnderecoV2 } from './AppRouter';

const quem = vi.hoisted(() => ({ isAdmin: false, montagensV2: 0 }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ loading: false, isAdmin: quem.isAdmin }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'f1' }, loading: false }) }));
vi.mock('@/pages/AuthPage', () => ({ default: () => <div>tela: login</div> }));
vi.mock('@/pages/FazendaSetup', () => ({ default: () => <div>tela: setup</div> }));
vi.mock('@/pages/CadernoImportTab', () => ({ default: () => <div>tela: caderno</div> }));
vi.mock('@/pages/ResumoOperacionalPage', () => ({ default: () => <div>tela: resumo operacional</div> }));
vi.mock('@/pages/LayoutLab', () => ({ default: () => <div>tela: layout lab</div> }));
vi.mock('@/v3/V3Index', () => ({ default: () => <div>tela: v3</div> }));
vi.mock('@/v2/pages/V2NaoEncontrada', () => ({ default: () => <div>tela: nao encontrada</div> }));
vi.mock('@/v2/V2Index', async () => {
  const React = await import('react');
  /* componente COM NOME: hook dentro de funcao anonima e' o que o `check:hooks` acusa */
  function V2IndexDeTeste() { React.useEffect(() => { quem.montagensV2 += 1; }, []); return <div>tela: sistema</div>; }
  return { default: V2IndexDeTeste };
});

let irPara: (p: string) => void = () => {};
function Onde() {
  const l = useLocation();
  irPara = useNavigate();
  return <span data-testid="onde">{l.pathname + l.search + l.hash}</span>;
}
const abrir = (endereco: string) => render(<MemoryRouter initialEntries={[endereco]}><Onde /><AppRouter /></MemoryRouter>);
const onde = () => screen.getByTestId('onde').textContent;

beforeEach(() => { quem.isAdmin = false; quem.montagensV2 = 0; });

const FORA_DO_V2: Array<[string, string]> = [
  ['/caderno-importacao', 'tela: caderno'], ['/v3', 'tela: v3'], ['/v3/qualquer', 'tela: v3'],
  ['/layout-lab', 'tela: layout lab'], ['/resumo-operacional', 'tela: resumo operacional'],
];

describe('M1 — rotas fora do V2 so para o admin', () => {
  it.each(FORA_DO_V2)('%s com NAO admin: vai para o sistema, sem ver a tela', (rota, tela) => {
    abrir(rota);
    expect(screen.queryByText(tela)).toBeNull();
    expect(screen.getByText('tela: sistema')).toBeTruthy();
    expect(onde()).toBe('/');
  });
  it.each(FORA_DO_V2)('%s com admin: abre, no endereco dela', (rota, tela) => {
    quem.isAdmin = true;
    abrir(rota);
    expect(screen.getByText(tela)).toBeTruthy();
    expect(onde()).toBe(rota);
  });
});

describe('M3 — o endereco sem /v2', () => {
  it('"/" abre o sistema, sem redirecionar', () => {
    abrir('/?oc_id=abc');
    expect(screen.getByText('tela: sistema')).toBeTruthy();
    expect(onde()).toBe('/?oc_id=abc');
  });
  it('/v2?x=1#h vira /?x=1#h; /v2 vira /; /v2/qualquer-coisa?y=2 vira /?y=2', () => {
    const a = abrir('/v2?x=1#h'); expect(onde()).toBe('/?x=1#h'); expect(screen.getByText('tela: sistema')).toBeTruthy(); a.unmount();
    const b = abrir('/v2'); expect(onde()).toBe('/'); b.unmount();
    abrir('/v2/painel-consultor?y=2'); expect(onde()).toBe('/?y=2');
  });
  it('abrir lancamento / OC pelo endereco antigo continua chegando ao sistema com os parametros', () => {
    abrir('/v2?oc_venda=1&oc_id=1940de90&oc_aba=financeiro');
    expect(onde()).toBe('/?oc_venda=1&oc_id=1940de90&oc_aba=financeiro');
    expect(screen.getByText('tela: sistema')).toBeTruthy();
  });
  it('navegar para `/v2?…` de DENTRO do sistema troca o endereco SEM desmontar a tela (a secao de origem e estado dela)', () => {
    abrir('/');
    expect(quem.montagensV2).toBe(1);
    act(() => irPara('/v2?section=financeiro-lanc&flancId=L1&returnZooId=Z1'));
    expect(onde()).toBe('/?section=financeiro-lanc&flancId=L1&returnZooId=Z1');
    expect(quem.montagensV2).toBe(1);
  });
  it('endereco que nao existe continua sendo "nao encontrada" (o /v2 nao virou curinga)', () => {
    abrir('/v22');
    expect(screen.getByText('tela: nao encontrada')).toBeTruthy();
    expect(ehEnderecoV2('/v2')).toBe(true);
    expect(ehEnderecoV2('/v2/x')).toBe(true);
    expect(ehEnderecoV2('/v22')).toBe(false);
    expect(ehEnderecoV2('/')).toBe(false);
    expect(ehEnderecoV2('/v3')).toBe(false);
  });
});
