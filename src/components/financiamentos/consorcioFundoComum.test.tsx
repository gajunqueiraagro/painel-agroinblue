/**
 * FIN-CONSORCIO-03 — o fundo comum por parcela do termo de adesão na tela, e o rodapé que lista SÓ o que falta ao gerador.
 * O caso é o do 002122 (Agnaldo), em dado SINTÉTICO: o envelope `cronograma_fundo_pct` é a resposta de `fn_consorcio_cronograma`
 * lida do banco (proto, bloco revertido, 19/10/2026) com fundo comum 1,1625% por parcela e reserva 0,0063% por parcela.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import fixture from '../../../scripts/ui-cortes/dados/consorcio.json';
import {
  FORM_VAZIO, regrasDoForm, dadosDoForm, formDaTela, lerCronograma, lerTelaDoConsorcio, faltaParaGerar, dicaDoFundoComum, type FormDoConsorcio,
} from '@/lib/financiamentos/consorcio';

const estado: { cron: unknown } = { cron: fixture.cronograma };
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({}) }));
vi.mock('@/components/financiamentos/ContratoDeCredito', () => ({ BlocoDocumentos: () => <div data-testid="bloco-documentos" /> }));
vi.mock('@/components/shared/FavorecidoSelect', () => ({ FavorecidoSelect: () => <div /> }));
vi.mock('@/components/shared/FazendaSelect', () => ({ FazendaSelect: () => <div /> }));
vi.mock('@/components/shared/ContaBancariaSelect', () => ({ ContaBancariaSelect: () => <div /> }));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({ PlanoSubcentroSelect: () => <div /> }));
const salvar = vi.fn(async () => ({ ok: true, recusa: null, dado: { financiamento_id: 'novo' } }));
vi.mock('@/hooks/useConsorcio', () => ({
  useTelaDoConsorcio: (id: string | null) => ({ data: id ? lerTelaReal(fixture.tela) : undefined }),
  useCronogramaDoConsorcio: () => lerCronogramaReal(estado.cron),
  useGestosDoConsorcio: () => ({ salvar }),
}));
import { lerTelaDoConsorcio as lerTelaReal, lerCronograma as lerCronogramaReal } from '@/lib/financiamentos/consorcio';
import { ConsorcioDialog } from './ConsorcioDialog';

const PCT = lerCronograma(fixture.cronograma_fundo_pct)!;
const AUTO = lerCronograma(fixture.cronograma)!;
const formDoTermo = (): FormDoConsorcio => ({ ...formDaTela(lerTelaDoConsorcio(fixture.tela)!), fundoComum: { modo: 'pct_parcela', valor: 1.1625 } });

beforeEach(() => { estado.cron = fixture.cronograma; salvar.mockClear(); });

describe('o fundo comum vai ao gerador como o termo diz', () => {
  it('% por parcela 1,1625 e reserva 0,0063 → as regras que o banco lê (4 casas, sem arredondar)', () => {
    const r = regrasDoForm(formDoTermo());
    expect(r.fundo_comum).toEqual({ modo: 'pct_parcela', valor: 1.1625 });
    expect(r.fundo_reserva).toEqual({ modo: 'pct_parcela', valor: 0.0063, total_pct: 0.5 });
    expect((dadosDoForm(formDoTermo(), 'cli').regras as Record<string, unknown>).fundo_comum).toEqual({ modo: 'pct_parcela', valor: 1.1625 });
  });
  it('a resposta do banco para o caso 002122 (FIN-CONSORCIO-03b): 2.803,66 / 2.890,84 / 2.716,49 e a 80 com os centavos; total 224.293,02', () => {
    expect(PCT.faixas.map((f) => [f.de, f.ate, f.fundoComum, f.taxaAdm, f.reserva, f.total, f.adiada, f.ajusteArredondamento])).toEqual([
      [1, 12, 2297.19, 494.02, 12.45, 2803.66, false, null], [13, 46, 2297.19, 581.2, 12.45, 2890.84, false, null],
      [47, 79, 2704.04, 0, 12.45, 2716.49, true, null], [80, 80, 2703.92, 0, 12.45, 2716.37, true, -0.12]]);
    expect(PCT.totais?.total).toBe(224293.02);
    expect(PCT.totais?.fundoComum).toBe(197607.98);
    /* fecha com a carta: o gerador não avisa mais o fundo comum (a reserva continua avisando, é outra regra) */
    expect(PCT.avisos.some((a) => a.startsWith('fundo comum:'))).toBe(false);
  });
  it('automático continua sendo a carta dividida (regras {modo:auto}); R$ fixo e % total vão como vieram', () => {
    expect(regrasDoForm({ ...formDoTermo(), fundoComum: { modo: 'auto', valor: null } }).fundo_comum).toEqual({ modo: 'auto' });
    expect(AUTO.faixas[0].fundoComum).toBe(2470.1);
    expect(regrasDoForm({ ...formDoTermo(), fundoComum: { modo: 'valor', valor: 2297.19 } }).fundo_comum).toEqual({ modo: 'valor', valor: 2297.19 });
    expect(regrasDoForm({ ...formDoTermo(), fundoComum: { modo: 'pct_total', valor: 53.475 } }).fundo_comum).toEqual({ modo: 'pct_total', valor: 53.475 });
  });
  it('a volta: o modo e o valor gravados em `regras` reabrem no formulário', () => {
    const t = lerTelaDoConsorcio({ ...fixture.tela, contrato: { ...fixture.tela.contrato, regras: { ...fixture.tela.contrato.regras, fundo_comum: { modo: 'pct_parcela', valor: 1.1625 } } } })!;
    expect(formDaTela(t).fundoComum).toMatchObject({ modo: 'pct_parcela', valor: 1.1625 });
  });
  it('a dica lê os números do gerador', () => {
    expect(dicaDoFundoComum({ ...formDoTermo(), fundoComum: { modo: 'auto', valor: null } }, AUTO)).toBe('automático: carta ÷ prazo = R$ 2.470,10');
    expect(dicaDoFundoComum(formDoTermo(), PCT)).toBe('restante nas 34 adiadas · R$ 2.704,04 cada (a última R$ 2.703,92)');
  });
});

describe('o rodapé lista só o que falta', () => {
  it('a regra', () => {
    expect(faltaParaGerar(FORM_VAZIO).map((x) => x.campo)).toEqual(['carta', 'primeiraParcela', 'prazoGrupo']);
    expect(faltaParaGerar({ ...FORM_VAZIO, carta: 197607.98, primeiraParcela: '2026-07-18' }).map((x) => x.campo)).toEqual(['prazoGrupo']);
    expect(faltaParaGerar({ ...FORM_VAZIO, carta: 1, primeiraParcela: '2026-07-18', prazoGrupo: 601 }).map((x) => x.campo)).toEqual(['prazoGrupo']);
    expect(faltaParaGerar(formDoTermo())).toEqual([]);
  });
  it('no novo, o Salvar não vai ao banco: escreve em vermelho só o que falta, e o item leva à aba', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId={null} />);
    fireEvent.click(screen.getByTestId('salvar-consorcio'));
    expect(salvar).not.toHaveBeenCalled();
    const rodape = screen.getByTestId('recado-do-consorcio');
    expect(rodape.textContent).toBe('Falta: valor da carta de crédito · 1ª parcela · prazo do grupo (1 a 600 meses)');
    expect(rodape.className).toContain('text-destructive');
    expect(rodape.className).toContain('break-words');
    act(() => { fireEvent.click(screen.getByTestId('falta-prazoGrupo')); });
    expect(screen.getByTestId('aba-custos')).toBeTruthy();
  });
  it('editando o 002122 (tudo preenchido) o rodapé não mostra erro', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    expect(screen.queryByTestId('falta-do-consorcio')).toBeNull();
    expect(screen.getByTestId('recado-do-consorcio').className).not.toContain('text-destructive');
  });
});

describe('a tela', () => {
  it('Custos e prazos: o fundo comum do termo aparece em %, com 4 casas, e a dica do restante', () => {
    estado.cron = fixture.cronograma_fundo_pct;
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    fireEvent.click(screen.getByRole('button', { name: 'Custos e prazos' }));
    expect(screen.getByTestId('dica-fundo-comum').textContent).toBe('a pagar agora 46 · automático: carta ÷ prazo = R$ 2.297,19');
    const prazos = within(screen.getByTestId('bloco-prazos'));
    fireEvent.click(prazos.getByRole('button', { name: '% parc.' }));
    expect(screen.getAllByDisplayValue('0,0063').length).toBe(1);
    expect(screen.getByTestId('dica-fundo-comum').textContent).toBe('a pagar agora 46 · restante nas 34 adiadas · R$ 2.704,04 cada (a última R$ 2.703,92)');
    fireEvent.click(prazos.getByRole('button', { name: 'Automático' }));
    expect(screen.getByTestId('fundo-comum-auto')).toBeTruthy();
  });
});
