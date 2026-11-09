/**
 * FECH-PASTO-UNIDADE-01 F2 (Gabriel 08/11 07:26 + o ajuste do terminal) — o modal do pasto com piquetes: a GRADE DE SEMPRE (Machos/Fêmeas),
 * "Pasto inteiro | Por piquetes" só no pasto com piquetes; por piquetes, ABAS [7A] [7B] … [Total] no lugar da grade (cada aba a mesma grade;
 * o Total soma e só lê); o mês anterior somado no topo com "Usar"/"Usar tudo"; voltar a pasto inteiro pela `fn_fechamento_pasto_inteiro`
 * com prévia. Casos reais: PUR P7 (7A–7D, out/26), PUR P5 (P5-A/P5-B, card vazio), EXP R_07 (7A–7D desde nov/26), e um pasto sem piquete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { banco, salvarCard, pastoInteiro } = vi.hoisted(() => ({
  banco: {
    linhas: [] as Record<string, unknown>[],
    piquetes: [] as { id: string; nome: string; area_ha: number }[],
    anterior: { anoMes: '2026-09', semCard: true, linhas: [] as Record<string, unknown>[], nomes: new Map<string, string>() },
  },
  salvarCard: vi.fn(async (_id: string, _campos: unknown, _itens: unknown) => ({ ok: true, erro: null as string | null })),
  pastoInteiro: vi.fn(async (_id: string, simular: boolean) => ({ ok: true as const, valor: { frase: simular ? 'P7 volta a pasto inteiro: 148 cab em 3 categoria(s); nenhum piquete fica marcado.' : '', cabecas: 148 } })),
}));
/* as funções do hook são ESTÁVEIS (como no hook de verdade): o `loadItens` está nas dependências da carga do modal */
const { acoesDoHook } = vi.hoisted(() => ({ acoesDoHook: {} as Record<string, unknown> }));
vi.mock('@/hooks/useFechamento', () => ({ useFechamento: () => acoesDoHook }));
Object.assign(acoesDoHook, { loadItens: async () => banco.linhas, salvarCardDoPasto: salvarCard, salvarCardComAlocacao: vi.fn(), reabrirCardDoPasto: vi.fn() });
vi.mock('@/lib/fechamento/piquetesDoPasto', async (original) => ({
  ...(await original<typeof import('@/lib/fechamento/piquetesDoPasto')>()),
  lerPiquetesDoPasto: vi.fn(async () => ({ ok: true, valor: { doMes: banco.piquetes, nomes: new Map(banco.piquetes.map(p => [p.id, p.nome])) } })),
  lerMesAnteriorDoPasto: vi.fn(async () => ({ ok: true, valor: banco.anterior })),
  pastoInteiroNoBanco: pastoInteiro,
}));
const { lotesDoHook } = vi.hoisted(() => ({ lotesDoHook: { lotes: [{ id: 'L-R07', codigo: 'EX-CR-VA-07', nomeCampeiro: null, situacao: 'ativo', codigosAntigos: [] },
  { id: 'L-VELHO', codigo: 'EX-CR-VA-01', nomeCampeiro: null, situacao: 'encerrado', codigosAntigos: [] }], recarregar: () => {} } }));
vi.mock('@/hooks/useLotesDaFazenda', () => ({ useLotesDaFazenda: () => lotesDoHook }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useMasterLock', () => ({ useMasterLock: () => ({ isReadOnly: () => false, isMaster: true, isMesLocked: () => false }) }));
vi.mock('@/components/MasterLockBanner', () => ({ MasterLockBanner: () => null }));
vi.mock('@/components/agri/AreaPlantadaPanel', () => ({ AreaPlantadaPanel: () => null }));
vi.mock('@/lib/fechamento/travaDoP2', async (original) => ({
  ...(await original<typeof import('@/lib/fechamento/travaDoP2')>()), lerEstadoDoP2: vi.fn(async () => ({ ok: true, valor: { travado: false, revalidar: false } })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { FechamentoPastoDialog, FRASE_SALVE_ANTES, FRASE_PASTO_INTEIRO } from '@/components/FechamentoPastoDialog';

/* as categorias reais do caso (mamotes M é macho; mamotes F e vacas, fêmeas): na grade, a ordem dos campos é M, F, vacas */
const CATS = [
  { id: 'mf', nome: 'Mamotes F', codigo: 'mamotes_f', ordem_exibicao: 1 },
  { id: 'mm', nome: 'Mamotes M', codigo: 'mamotes_m', ordem_exibicao: 2 },
  { id: 'va', nome: 'Vacas', codigo: 'vacas', ordem_exibicao: 3 },
];
const P7 = { id: 'p7', fazenda_id: 'pur', nome: 'P7', area_produtiva_ha: 97.54, tipo_uso: 'cria', ativo: true };
const PIQ_P7 = [{ id: '7a', nome: '7A', area_ha: 24.76 }, { id: '7b', nome: '7B', area_ha: 25.11 },
  { id: '7c', nome: '7C', area_ha: 24.35 }, { id: '7d', nome: '7D', area_ha: 23.32 }];
const CARD = (pastoId: string, mes: string) => ({ id: `fp-${pastoId}`, pasto_id: pastoId, fazenda_id: 'pur', ano_mes: mes, status: 'rascunho', tipo_uso_mes: 'cria', lote_mes: null, qualidade_mes: 5, observacao_mes: null });
const linha = (cat: string, q: number, peso: number | null, piq: string | null, lote: string | null = null) =>
  ({ id: `${cat}-${piq}`, fechamento_id: 'fp', categoria_id: cat, quantidade: q, peso_medio_kg: peso, lote: null, observacoes: null, origem_dado: 'manual', peso_atualizado: false, lote_id: lote, piquete_id: piq });

function abrir(pasto: Record<string, unknown> = P7, mes = '2026-10') {
  render(<QueryClientProvider client={new QueryClient()}>
    <FechamentoPastoDialog open onOpenChange={vi.fn()} pasto={pasto as never} fechamento={CARD(String(pasto.id), mes) as never}
      categorias={CATS as never} onFechar={vi.fn()} onCopiar={vi.fn()} />
  </QueryClientProvider>);
}
const qtds = () => screen.getAllByPlaceholderText('0') as HTMLInputElement[];
const valores = () => qtds().map(i => i.value);
const botao = (nome: string) => within(screen.getByTestId('abas-dos-piquetes')).getByRole('button', { name: nome });

beforeEach(() => {
  vi.clearAllMocks();
  banco.linhas = []; banco.piquetes = []; banco.anterior = { anoMes: '2026-09', semCard: true, linhas: [], nomes: new Map() };
});

describe('PUR P7 out/26 lançado por piquetes (4 piquetes)', () => {
  beforeEach(() => {
    banco.piquetes = PIQ_P7;
    banco.linhas = [linha('va', 40, 450, '7a'), linha('va', 34, 440, '7b'), linha('mf', 28, 30, '7b'), linha('mm', 46, 30, '7c')];
  });

  it('abre "Por piquetes" com as abas 7A 7B 7C 7D Total; cada aba é a grade de sempre com as cabeças daquele piquete', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('abas-dos-piquetes')).toBeTruthy());
    expect(botao('Por piquetes').getAttribute('aria-pressed') ?? botao('Por piquetes').className).toMatch(/true|bg-primary/);
    for (const n of ['7A', '7B', '7C', '7D', 'Total']) expect(botao(n)).toBeTruthy();
    await waitFor(() => expect(valores()).toEqual(['', '', '40'])); // 7A: M, F, vacas
    expect(screen.getByTestId('subtotal-da-aba').textContent).toBe('7A · 24,8 ha · 40 cab');
    fireEvent.click(botao('7B'));
    expect(valores()).toEqual(['', '28', '34']);
    expect(screen.getByText('Machos')).toBeTruthy(); expect(screen.getByText('Fêmeas')).toBeTruthy(); // sem caixa alta
  });

  it('a aba Total soma os piquetes e só lê; o subtotal é o do PASTO (área, cab e lotação)', async () => {
    abrir();
    await waitFor(() => expect(valores()).toEqual(['', '', '40']));
    fireEvent.click(botao('Total'));
    expect(valores()).toEqual(['46', '28', '74']);
    expect(qtds().every(i => i.disabled)).toBe(true);
    expect(screen.getByTestId('subtotal-da-aba').textContent).toMatch(/^P7 · 97,5 ha · 148 cab · \d+,\d\d UA\/ha$/);
  });

  it('editar a aba 7B e salvar grava cada linha com o piquete dela (o gravador de sempre)', async () => {
    abrir();
    await waitFor(() => expect(valores()).toEqual(['', '', '40']));
    fireEvent.click(botao('7B'));
    const [, , vacas] = qtds();
    fireEvent.focus(vacas); fireEvent.change(vacas, { target: { value: '30' } }); fireEvent.blur(vacas);
    /* o Total e o rodapé acompanham a aba editada (vacas 40 + 30) */
    fireEvent.click(botao('Total'));
    expect(valores()).toEqual(['46', '28', '70']);
    expect(screen.getByTestId('subtotal-da-aba').textContent).toMatch(/^P7 · 97,5 ha · 144 cab/);
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(salvarCard).toHaveBeenCalledTimes(1));
    const enviadas = salvarCard.mock.calls[0][2] as { categoria_id: string; quantidade: number; piquete_id?: string | null }[];
    expect(enviadas.map(x => `${x.piquete_id} ${x.categoria_id} ${x.quantidade}`)).toEqual(['7a va 40', '7b mf 28', '7b va 30', '7c mm 46']);
  });

  it('voltar a "Pasto inteiro": a prévia do banco (simular) e, confirmado, a gravação pela fn_fechamento_pasto_inteiro; a grade única volta', async () => {
    abrir();
    await waitFor(() => expect(valores()).toEqual(['', '', '40']));
    fireEvent.click(botao('Pasto inteiro'));
    await waitFor(() => expect(screen.getByTestId('previa-pasto-inteiro')).toBeTruthy());
    expect(pastoInteiro).toHaveBeenCalledWith('fp-p7', true);
    expect(screen.getByTestId('previa-pasto-inteiro').textContent).toContain('148 cab');
    expect(screen.getByTestId('previa-pasto-inteiro').textContent).toContain(FRASE_PASTO_INTEIRO);
    /* o banco já juntou: a releitura traz as linhas sem piquete */
    banco.linhas = [linha('mm', 46, 30, null), linha('mf', 28, 30, null), linha('va', 74, 445.41, null)];
    fireEvent.click(screen.getByTestId('confirmar-pasto-inteiro'));
    await waitFor(() => expect(pastoInteiro).toHaveBeenCalledWith('fp-p7', false));
    await waitFor(() => expect(valores()).toEqual(['46', '28', '74']));
    expect(within(screen.getByTestId('abas-dos-piquetes')).queryByRole('button', { name: 'Total' })).toBeNull();
    expect(salvarCard).not.toHaveBeenCalled();
  });

  it('mudou uma aba e não salvou: voltar a pasto inteiro NÃO chama o banco e diz para salvar antes', async () => {
    abrir();
    await waitFor(() => expect(valores()).toEqual(['', '', '40']));
    const [, , vacas] = qtds();
    fireEvent.focus(vacas); fireEvent.change(vacas, { target: { value: '41' } }); fireEvent.blur(vacas);
    fireEvent.click(botao('Pasto inteiro'));
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toBe(FRASE_SALVE_ANTES));
    expect(pastoInteiro).not.toHaveBeenCalled();
    expect(screen.queryByTestId('previa-pasto-inteiro')).toBeNull();
  });
});

describe('PUR P5 out/26 (P5-A 101 · P5-B 86,1; card vazio)', () => {
  beforeEach(() => { banco.piquetes = [{ id: 'p5a', nome: 'P5-A', area_ha: 101 }, { id: 'p5b', nome: 'P5-B', area_ha: 86.1 }]; });

  it('abre em "Pasto inteiro" (a grade de sempre); "Por piquetes" mostra as abas P5-A, P5-B e Total; voltar sem salvar não chama o banco', async () => {
    abrir({ ...P7, id: 'p5', nome: 'P5', area_produtiva_ha: 187.1 });
    await waitFor(() => expect(screen.getByTestId('abas-dos-piquetes')).toBeTruthy());
    expect(within(screen.getByTestId('abas-dos-piquetes')).queryByRole('button', { name: 'P5-A' })).toBeNull();
    fireEvent.click(botao('Por piquetes'));
    for (const n of ['P5-A', 'P5-B', 'Total']) expect(botao(n)).toBeTruthy();
    expect(screen.getByTestId('subtotal-da-aba').textContent).toBe('P5-A · 101,0 ha · 0 cab');
    const [, , vacas] = qtds();
    fireEvent.focus(vacas); fireEvent.change(vacas, { target: { value: '12' } }); fireEvent.blur(vacas);
    fireEvent.click(botao('Pasto inteiro'));
    await waitFor(() => expect(valores()).toEqual(['', '', '12'])); // a soma das abas, na tela (nada no banco a desfazer)
    expect(pastoInteiro).not.toHaveBeenCalled();
  });
});

describe('mês anterior no topo (somado no pasto, com o lote de cada piquete)', () => {
  beforeEach(() => {
    banco.piquetes = PIQ_P7;
    banco.anterior = { anoMes: '2026-09', semCard: false, nomes: new Map([['7a', '7A'], ['7c', '7C']]),
      linhas: [linha('va', 40, 450, '7a', 'L-R07'), linha('va', 34, 440, '7c', 'L-VELHO'), linha('mm', 46, 30, '7c')] };
  });

  it('o botão diz o total do mês anterior; "Usar tudo" em Por piquetes leva cada linha à aba do piquete dela', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('mes-anterior-do-pasto').textContent).toContain('Mês anterior · set/26 · 120 cab'));
    fireEvent.click(botao('Por piquetes'));
    fireEvent.click(screen.getByTestId('mes-anterior-do-pasto'));
    await waitFor(() => expect(screen.getByTestId('tabela-mes-anterior')).toBeTruthy());
    expect(screen.getAllByTestId('linha-mes-anterior').map(r => r.textContent)).toEqual(['7AEX-CR-VA-07Vacas40450Usar', '7CEX-CR-VA-01Vacas34440Usar', '7C—Mamotes M4630Usar']);
    expect(screen.getByTestId('total-mes-anterior').textContent).toBe('P7120286'); // 120 cab · peso ponderado (40×450 + 34×440 + 46×30) / 120 = 286
    fireEvent.click(screen.getByTestId('usar-tudo'));
    expect(valores()).toEqual(['', '', '40']); // 7A
    expect(screen.getByTestId('campo-lote-do-pasto').textContent).toBe('EX-CR-VA-07');
    fireEvent.click(botao('7C'));
    expect(valores()).toEqual(['46', '', '34']);
    /* o lote encerrado aparece na tabela do mês anterior, mas não segue na cópia */
    expect(screen.getByTestId('campo-lote-do-pasto').textContent).toBe('Sem lote');
  });

  it('em Pasto inteiro, "Usar" por linha SOMA na categoria e a linha fica "Usado" (não soma duas vezes)', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('mes-anterior-do-pasto')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mes-anterior-do-pasto'));
    await waitFor(() => expect(screen.getByTestId('tabela-mes-anterior')).toBeTruthy());
    const usar = () => screen.getAllByTestId('usar-linha') as HTMLButtonElement[];
    fireEvent.click(usar()[0]); fireEvent.click(usar()[1]);
    expect(usar()[0].disabled).toBe(true); expect(usar()[0].textContent).toBe('Usado');
    fireEvent.click(usar()[0]);
    expect(valores()).toEqual(['', '', '74']);
  });
});

describe('EXP R_07 nov/26 (piquetes 7A–7D desde nov; out/26 lançado em pasto inteiro com lote)', () => {
  it('"Usar tudo" em Pasto inteiro copia o mês anterior com o lote ativo; a linha do mês anterior diz "pasto inteiro"', async () => {
    banco.piquetes = [{ id: 'r7a', nome: '7A', area_ha: 24.06 }, { id: 'r7b', nome: '7B', area_ha: 23.67 },
      { id: 'r7c', nome: '7C', area_ha: 26.26 }, { id: 'r7d', nome: '7D', area_ha: 26.42 }];
    banco.anterior = { anoMes: '2026-10', semCard: false, nomes: new Map(),
      linhas: [linha('mf', 35, 60, null, 'L-R07'), linha('mm', 35, 60, null, 'L-R07'), linha('va', 70, 450, null, 'L-R07')] };
    abrir({ ...P7, id: 'r07', nome: 'R_07', area_produtiva_ha: 100.41 }, '2026-11');
    await waitFor(() => expect(screen.getByTestId('mes-anterior-do-pasto').textContent).toContain('out/26 · 140 cab'));
    fireEvent.click(screen.getByTestId('mes-anterior-do-pasto'));
    await waitFor(() => expect(screen.getByTestId('painel-mes-anterior').textContent).toContain('pasto inteiro'));
    fireEvent.click(screen.getByTestId('usar-tudo'));
    expect(valores()).toEqual(['35', '35', '70']);
    expect(screen.getByTestId('campo-lote-do-pasto').textContent).toBe('EX-CR-VA-07');
  });
});

describe('pasto sem piquete (M10)', () => {
  it('modal como hoje: sem o seletor nem as abas, com o "Copiar anterior"', async () => {
    banco.linhas = [linha('va', 92, 380, null)];
    abrir({ ...P7, id: 'p1', nome: 'P1', area_produtiva_ha: 48.2 });
    await waitFor(() => expect(valores()).toEqual(['', '', '92']));
    expect(screen.queryByTestId('abas-dos-piquetes')).toBeNull();
    expect(screen.queryByTestId('mes-anterior-do-pasto')).toBeNull();
    expect(screen.getByRole('button', { name: /Copiar anterior/ })).toBeTruthy();
  });
});
