/**
 * FIN-CONSORCIO-04 — o consórcio pelas FAIXAS em R$. As respostas do gerador são as do banco (proto, 20/10/2026, `fn_consorcio_cronograma`
 * no modo faixas com as faixas do termo do 002122, em dado SINTÉTICO: `cronograma_faixas`, e a recusa do buraco: `cronograma_faixas_buraco`).
 * Aqui se prova o que a tela faz com elas: o novo abre nas Faixas com UMA faixa vazia de 1 ao prazo; Regras → Faixas leva as faixas geradas;
 * Faixas → Regras com valor digitado pergunta antes; a conferência ✓ / !; o Salvar só para pelo buraco / sobreposição (a conferência não
 * impede); reabrir no modo gravado.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import fixture from '../../../scripts/ui-cortes/dados/consorcio.json';
import {
  FORM_VAZIO, regrasDoForm, formDaTela, lerCronograma, lerTelaDoConsorcio, faixasDasRegras, faixasComPrazo, faixaVazia, temValorDigitado,
} from '@/lib/financiamentos/consorcio';

const estado: { faixas: unknown; regras: unknown; tela: unknown; ultimas: Record<string, unknown>[] } = {
  faixas: fixture.cronograma_faixas, regras: fixture.cronograma_fundo_pct, tela: fixture.tela, ultimas: [],
};
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({}) }));
vi.mock('@/components/financiamentos/ContratoDeCredito', () => ({ BlocoDocumentos: () => <div data-testid="bloco-documentos" /> }));
vi.mock('@/components/shared/FavorecidoSelect', () => ({ FavorecidoSelect: () => <div /> }));
vi.mock('@/components/shared/FazendaSelect', () => ({ FazendaSelect: () => <div /> }));
vi.mock('@/components/shared/ContaBancariaSelect', () => ({ ContaBancariaSelect: () => <div /> }));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({ PlanoSubcentroSelect: () => <div /> }));
const salvar = vi.fn(async (_id: string | null, _dados: Record<string, unknown>, _simular: boolean) => ({ ok: true, recusa: null, dado: { financiamento_id: 'cons-sint', cronograma_mudou: true } }));
vi.mock('@/hooks/useConsorcio', () => ({
  useTelaDoConsorcio: (id: string | null) => ({ data: id ? lerTelaReal(estado.tela) : undefined }),
  /* o gerador do banco simulado: responde pelo modo que a tela manda */
  useCronogramaDoConsorcio: (r: Record<string, unknown>) => { estado.ultimas.push(r); return lerCronogramaReal(r.modo === 'faixas' ? estado.faixas : estado.regras); },
  useGestosDoConsorcio: () => ({ salvar }),
}));
import { lerTelaDoConsorcio as lerTelaReal, lerCronograma as lerCronogramaReal } from '@/lib/financiamentos/consorcio';
import { ConsorcioDialog } from './ConsorcioDialog';

const telaFaixas = { ...fixture.tela, contrato: { ...fixture.tela.contrato, regras: fixture.regras_faixas } };
const abrirCustos = () => fireEvent.click(screen.getByRole('button', { name: 'Custos e parcelas' }));
const montarPor = () => within(screen.getByTestId('bloco-prazos').querySelector<HTMLElement>('[data-campo="montarPor"]')!);
const linhas = () => screen.queryAllByTestId('faixa-digitada');

beforeEach(() => {
  estado.faixas = fixture.cronograma_faixas; estado.regras = fixture.cronograma_fundo_pct; estado.tela = fixture.tela; estado.ultimas = [];
  salvar.mockClear();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
});

describe('a regra (pura)', () => {
  it('o novo nasce nas Faixas com uma faixa vazia, que acompanha o prazo até alguém digitar', () => {
    expect(FORM_VAZIO.modo).toBe('faixas');
    expect(FORM_VAZIO.faixas).toEqual([faixaVazia(null)]);
    expect(faixasComPrazo(FORM_VAZIO.faixas, 80)).toEqual([{ ...faixaVazia(80) }]);
    const digitada = [{ ...faixaVazia(80), fundoComum: 2297.19 }];
    expect(faixasComPrazo(digitada, 60)).toBe(digitada);
    expect(temValorDigitado(FORM_VAZIO.faixas)).toBe(false);
    expect(temValorDigitado(digitada)).toBe(true);
  });
  it('as faixas vão ao gerador como o termo diz (modo, de · até, os quatro valores, o tipo) e voltam', () => {
    const t = lerTelaDoConsorcio(telaFaixas)!;
    const f = formDaTela(t);
    expect(f.modo).toBe('faixas');
    expect(f.primeiraParcelaTermo).toBe(2803.66);
    expect(f.faixas.map((x) => [x.de, x.ate, x.taxaAdm, x.tipo])).toEqual([[1, 12, 494.02, 'a_pagar'], [13, 46, 581.2, 'a_pagar'], [47, 79, 0, 'adiada'], [80, 80, 0, 'adiada']]);
    const r = regrasDoForm(f);
    expect(r.modo).toBe('faixas');
    expect(r.primeira_parcela_termo).toBe(2803.66);
    expect(r.faixas).toEqual(fixture.regras_faixas.faixas);
    /* nas regras as faixas não vão (o gerador as gera) */
    expect(regrasDoForm({ ...f, modo: 'regras' }).faixas).toBeUndefined();
  });
  it('o contrato salvo antes (sem `modo`) reabre nas Regras; Regras → Faixas leva as faixas geradas, a do ajuste inclusive', () => {
    expect(formDaTela(lerTelaDoConsorcio(fixture.tela)!).modo).toBe('regras');
    const fx = faixasDasRegras(lerCronograma(fixture.cronograma_fundo_pct));
    expect(fx?.map((x) => [x.de, x.ate, x.fundoComum, x.tipo])).toEqual([[1, 12, 2297.19, 'a_pagar'], [13, 46, 2297.19, 'a_pagar'], [47, 79, 2704.04, 'adiada'], [80, 80, 2703.92, 'adiada']]);
    expect(faixasDasRegras(lerCronograma(fixture.cronograma_faixas_buraco))).toBeNull();
  });
});

describe('a tela', () => {
  it('o novo abre nas Faixas com a faixa 1 a <prazo> vazia; mudar o prazo leva a faixa junto', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId={null} />);
    abrirCustos();
    expect(montarPor().getByRole('button', { name: 'Faixas (R$)' }).className).toContain('bg-primary');
    expect(linhas()).toHaveLength(1);
    fireEvent.change(within(screen.getByTestId('bloco-prazos')).getAllByRole('textbox')[0], { target: { value: '80' } });
    expect(within(linhas()[0]).getByLabelText('até')).toHaveValue('80');
    expect(screen.getByTestId('digite-as-faixas').textContent).toBe('Digite as faixas como no termo ou no boleto · o sistema confere com a carta');
    /* no novo vazio o rodapé diz o que falta (o texto do modo volta quando nada falta) */
    expect(screen.getByTestId('recado-do-consorcio').textContent).toBe('Falta: valor da carta de crédito · 1ª parcela');
  });
  it('Regras → Faixas leva as faixas geradas; Faixas → Regras SEM valor digitado não pergunta', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    abrirCustos();
    expect(screen.getAllByTestId('faixa-gerada')).toHaveLength(4);
    fireEvent.click(montarPor().getByRole('button', { name: 'Faixas (R$)' }));
    expect(linhas()).toHaveLength(4);
    expect(within(linhas()[3]).getByLabelText('de')).toHaveValue('80');
    /* as faixas levadas TÊM valor: voltar pergunta (ver o caso seguinte); aqui, uma faixa vazia volta sem perguntar */
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getAllByTestId('tirar-faixa')[0]);
    const ultima = linhas()[0];
    for (const campo of within(ultima).getAllByTestId('campo-moeda')) {
      const inp = campo.querySelector('input')!;
      fireEvent.focus(inp); fireEvent.change(inp, { target: { value: '' } }); fireEvent.blur(inp);
    }
    fireEvent.click(montarPor().getByRole('button', { name: 'Regras (%)' }));
    expect(screen.queryByTestId('confirmar-regras')).toBeNull();
    expect(screen.getAllByTestId('faixa-gerada')).toHaveLength(4);
  });
  it('Faixas → Regras COM valor digitado pergunta: "Voltar" mantém as faixas, confirmar passa para as Regras', () => {
    estado.tela = telaFaixas;
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    abrirCustos();
    expect(linhas()).toHaveLength(4);
    fireEvent.click(montarPor().getByRole('button', { name: 'Regras (%)' }));
    expect(screen.getByTestId('confirmar-regras')).toBeTruthy();
    fireEvent.click(screen.getByTestId('voltar-faixas'));
    expect(linhas()).toHaveLength(4);
    fireEvent.click(montarPor().getByRole('button', { name: 'Regras (%)' }));
    act(() => { fireEvent.click(screen.getByTestId('confirmar-passar-regras')); });
    expect(linhas()).toHaveLength(0);
    expect(screen.getAllByTestId('faixa-gerada')).toHaveLength(4);
    expect(screen.getByTestId('recado-do-consorcio').textContent).toBe('regras geram as faixas · passe para "Faixas (R$)" para ajustar um valor');
  });
  it('reabre no modo gravado; a conferência do banco: ✓ verde e ! âmbar, os textos do banco', () => {
    estado.tela = telaFaixas;
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    abrirCustos();
    expect(montarPor().getByRole('button', { name: 'Faixas (R$)' }).className).toContain('bg-primary');
    expect(screen.getByTestId('confere-fundo_comum').textContent).toBe('✓ fundo comum = valor da carta');
    expect(screen.getByTestId('confere-primeira_parcela').textContent).toBe('✓ 1ª parcela 2.803,66 = termo');
    expect(screen.getByTestId('confere-reserva').textContent).toBe('! reserva 996,00 × 0,50% da carta 988,04');
    expect(screen.getByTestId('confere-reserva').className).toContain('text-amber-700');
    expect(screen.getByTestId('confere-taxa_adm').getAttribute('data-ok')).toBe('sim');
    /* o total de cada linha e o Total são do banco */
    expect(screen.getAllByTestId('total-da-faixa').map((e) => e.textContent)).toEqual(['2.803,66', '2.890,84', '2.716,49', '2.716,37']);
    expect(screen.getByTestId('lista-faixas-consorcio').querySelector('tfoot')!.textContent).toContain('224.293,02');
  });
  it('a conferência com "!" NÃO impede salvar; as faixas vão ao banco', async () => {
    estado.tela = telaFaixas;
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-consorcio')); });
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar.mock.calls[0][1]).toMatchObject({ regras: { modo: 'faixas', faixas: fixture.regras_faixas.faixas } });
    expect(screen.getByTestId('recado-do-consorcio').textContent).toBe('Salvo · as faixas mudaram: use "Regerar em aberto" nas Parcelas (só as em aberto mudam)');
  });
  it('o buraco impede salvar: o Salvar não vai ao banco, a frase do banco fica escrita e leva à linha', async () => {
    estado.tela = telaFaixas; estado.faixas = fixture.cronograma_faixas_buraco;
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-consorcio')); });
    expect(salvar).not.toHaveBeenCalled();
    const recusa = screen.getByTestId('recusa-das-faixas');
    expect(recusa.textContent).toBe('Faixas: a parcela 13 não está em nenhuma faixa.');
    expect(screen.getByTestId('recado-do-consorcio').className).toContain('text-destructive');
    await act(async () => { fireEvent.click(recusa); await new Promise((r) => setTimeout(r, 10)); });
    expect(screen.getByTestId('aba-custos')).toBeTruthy();
    expect(linhas()[1].className).toContain('outline-destructive');
    expect(document.activeElement).toBe(within(linhas()[1]).getByLabelText('de'));
  });
});
