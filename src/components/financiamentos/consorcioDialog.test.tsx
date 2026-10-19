/**
 * FIN-CONSORCIO-02 — o cadastro do consórcio. A tela e o gerador vêm do banco (a fixture SINTÉTICA da bancada, lida num bloco revertido);
 * aqui se prova o que a tela faz com eles: as abas (Parcelas e Documentos só depois de salvar), as faixas como linhas de título, a parcela
 * adiada dizendo "contemplação", o resumo lateral que some abaixo de 900px, e que a tela não soma componente.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fixture from '../../../scripts/ui-cortes/dados/consorcio.json';
import {
  lerTelaDoConsorcio, lerCronograma, linhasDoResumo, mostraResumo, textoDoVencimento, regrasDoForm, formDaTela, fundoComumDoContrato,
} from '@/lib/financiamentos/consorcio';

const estado: { tela: unknown } = { tela: fixture.tela };
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({}) }));
vi.mock('@/components/financiamentos/ContratoDeCredito', () => ({ BlocoDocumentos: () => <div data-testid="bloco-documentos" /> }));
vi.mock('@/components/shared/FavorecidoSelect', () => ({ FavorecidoSelect: () => <div /> }));
vi.mock('@/components/shared/FazendaSelect', () => ({ FazendaSelect: () => <div /> }));
vi.mock('@/components/shared/ContaBancariaSelect', () => ({ ContaBancariaSelect: () => <div /> }));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({ PlanoSubcentroSelect: () => <div /> }));
vi.mock('@/hooks/useConsorcio', () => ({
  useTelaDoConsorcio: (id: string | null) => ({ data: id ? lerTelaDoConsorcioReal(estado.tela) : undefined }),
  useCronogramaDoConsorcio: () => lerCronogramaReal(fixture.cronograma),
  useGestosDoConsorcio: () => ({}),
}));
import { lerTelaDoConsorcio as lerTelaDoConsorcioReal, lerCronograma as lerCronogramaReal } from '@/lib/financiamentos/consorcio';
import { ConsorcioDialog, FaixasGeradas, ParcelasDoConsorcio } from './ConsorcioDialog';

const tela = lerTelaDoConsorcio(fixture.tela)!;
const largura = (w: number) => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: w }); act(() => { window.dispatchEvent(new Event('resize')); }); };

beforeEach(() => { estado.tela = fixture.tela; largura(1440); });

describe('o leitor', () => {
  it('lê a tela e o gerador do banco; peça torta invalida a leitura inteira', () => {
    expect(tela.parcelas).toHaveLength(80);
    expect(tela.faixas.map((f) => [f.de, f.ate, f.adiada])).toEqual([[1, 12, false], [13, 46, false], [47, 79, true], [80, 80, true]]);
    /* FIN-CONSORCIO-03b: a última adiada leva os centavos do fundo comum e vira faixa própria */
    expect(lerCronograma(fixture.cronograma)?.faixas).toHaveLength(4);
    expect(lerCronograma(fixture.cronograma)?.faixas[3].ajusteArredondamento).toBe(-0.02);
    expect(lerTelaDoConsorcio({ ...fixture.tela, parcelas: [{ id: 'x', numero: 1, situacao: 'quitada' }] })).toBeNull();
  });
  it('as regras vão e voltam (formulário ↔ regras do contrato)', () => {
    const f = formDaTela(tela);
    expect(f.reserva).toEqual({ modo: 'pct_parcela', valor: 0.0063, totalPct: 0.5 });
    expect(f.formaTaxa).toBe('antecipada');
    const r = regrasDoForm(f);
    expect(r.fundo_reserva).toEqual({ modo: 'pct_parcela', valor: 0.0063, total_pct: 0.5 });
    expect(r.transcorridas).toBe('adiadas');
  });
  it('a parcela adiada vence "contemplação"; datas em dd/mm/aaaa', () => {
    expect(textoDoVencimento(null)).toBe('contemplação');
    expect(textoDoVencimento('2026-07-16')).toBe('16/07/2026');
  });
  it('o resumo lateral é lido do banco: uma linha por faixa e o adiado com as parcelas no rótulo', () => {
    const l = linhasDoResumo(tela);
    expect(l.filter((x) => x.rotulo.startsWith('Faixa'))).toHaveLength(4);
    expect(l.find((x) => x.rotulo === 'Faixa 80 adiada')?.valor).toBe('2.482,53');
    expect(l.find((x) => x.rotulo.startsWith('Adiado'))?.rotulo).toBe('Adiado · 34 parc.');
    expect(fundoComumDoContrato(tela.saldo)).toBeCloseTo(197607.98, 2);
  });
  it('o resumo só aparece com janela de 900px ou mais', () => {
    expect(mostraResumo(899)).toBe(false);
    expect(mostraResumo(900)).toBe(true);
  });
});

describe('a aba Parcelas', () => {
  const montar = () => render(<ParcelasDoConsorcio parcelas={tela.parcelas} faixas={tela.faixas} saldo={tela.saldo} ultimaOperacao={null}
    onReajuste={() => {}} onRegerar={() => {}} onDesfazer={() => {}} onEditar={() => {}} />);
  it('cada faixa abre com a linha de título dela', () => {
    montar();
    const titulos = screen.getAllByTestId('titulo-da-faixa').map((e) => e.textContent);
    expect(titulos).toEqual([expect.stringMatching(/^Faixa 1 · parcelas 1–12/), expect.stringMatching(/^Faixa 2 · parcelas 13–46/),
      expect.stringMatching(/^Faixa 3 · parcelas 47–79 · adiadas até a contemplação/),
      expect.stringMatching(/^Faixa 4 · parcela 80 · adiadas até a contemplação · .* · ajuste de arredondamento$/)]);
    /* a parcela com os centavos tem a marca à vista e o porquê no title */
    const ajuste = screen.getByTestId('parcela-com-ajuste');
    expect(ajuste.textContent).toBe('ajuste2.470,08');
    expect(ajuste.getAttribute('title')).toBe('ajuste de arredondamento: −R$ 0,02 — os centavos da divisão da carta ficam na última parcela do grupo');
  });
  it('a parcela adiada sem data diz "contemplação" e a situação "Adiada"', () => {
    montar();
    const linhas = screen.getAllByTestId('parcela-do-consorcio');
    const ultima = linhas[linhas.length - 1];
    expect(within(ultima).getByTestId('vencimento-da-parcela').textContent).toBe('contemplação');
    expect(within(ultima).getByTestId('vencimento-da-parcela').hasAttribute('data-sem-data')).toBe(true);
    expect(ultima.textContent).toContain('Adiada');
  });
  it('a parcela paga tem o lápis apagado com a trava; "Desfazer" apagado sem operação', () => {
    montar();
    expect(screen.getAllByTestId('lapis-da-parcela')[0]).toBeDisabled();
    expect(screen.getAllByTestId('lapis-da-parcela')[2]).not.toBeDisabled();
    expect(screen.getByTestId('abrir-desfazer')).toBeDisabled();
  });
  it('o Total é o do banco (o saldo), não a soma das linhas', () => {
    montar();
    const total = screen.getByRole('table').querySelector('tfoot tr')!;
    expect(total.textContent).toContain('224.293,02');
    expect(total.textContent).toContain('25.689,04');
  });
});

describe('as faixas geradas e os avisos', () => {
  it('as faixas do gerador e os avisos numa linha só', () => {
    render(<FaixasGeradas faixas={tela.faixas} avisos={['fundo comum: a', 'reserva: b']} recusa={null} />);
    expect(screen.getAllByTestId('faixa-gerada')).toHaveLength(4);
    expect(screen.getByTestId('faixa-com-ajuste').textContent).toBe('ajuste2.470,08');
    expect(screen.getByTestId('avisos-do-gerador').textContent).toBe('! fundo comum: a · reserva: b');
  });
  it('sem faixa, a recusa do gerador fica escrita', () => {
    render(<FaixasGeradas faixas={[]} avisos={[]} recusa="Informe a carta." />);
    expect(screen.getByText('Informe a carta.')).toBeInTheDocument();
  });
});

describe('o modal', () => {
  it('editar: título, linha curta e as quatro abas com as contagens', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    expect(screen.getByTestId('titulo-do-consorcio').textContent).toBe('Editar consórcio · Consórcio Trator Exemplo');
    expect(screen.getByTestId('linha-curta').textContent).toMatch(/grupo 009999 · cota 0123 · não contemplado$/);
    for (const n of ['Consórcio', 'Custos e prazos', 'Parcelas (80)', 'Documentos (0)']) expect(screen.getByRole('button', { name: n })).not.toBeDisabled();
  });
  it('novo: Parcelas e Documentos apagados até salvar', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId={null} />);
    expect(screen.getByTestId('titulo-do-consorcio').textContent).toBe('Novo consórcio');
    expect(screen.getByRole('button', { name: /^Parcelas/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Documentos/ })).toBeDisabled();
  });
  it('o resumo lateral some abaixo de 900px de janela e volta acima', () => {
    render(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId="cons-sint" />);
    expect(screen.getByTestId('resumo-do-consorcio')).toBeInTheDocument();
    largura(899);
    expect(screen.queryByTestId('resumo-do-consorcio')).toBeNull();
    largura(1000);
    expect(screen.getByTestId('resumo-do-consorcio')).toBeInTheDocument();
  });
});

describe('a fonte', () => {
  const fonte = readFileSync(resolve(__dirname, 'ConsorcioDialog.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  it('não soma dinheiro (o detector sabe achar) e não corta com reticências', () => {
    const temSoma = (s: string) => /\.reduce\(|\+=/.test(s);
    expect(temSoma('a.reduce((s, x) => s + x, 0)')).toBe(true);
    expect(temSoma(fonte)).toBe(false);
    expect(/\btruncate\b/.test('x truncate y')).toBe(true);
    expect(/\btruncate\b/.test(fonte)).toBe(false);
  });
  it('nenhum rótulo em maiúsculas ou espaçado', () => {
    expect(/\buppercase\b|tracking-/.test('x uppercase')).toBe(true);
    expect(/\buppercase\b|tracking-/.test(fonte)).toBe(false);
  });
  it('modal de tamanho fixo limitado pela janela; só a lista de parcelas rola', () => {
    expect(fonte).toMatch(/h-\[min\(560px,calc\(100dvh-32px\)\)\] w-\[min\(1120px,calc\(100vw-32px\)\)\]/);
    /* FIN-CONSORCIO-03: além da lista, só o recado do rodapé rola por dentro (e só se passar de duas linhas de 11px) */
    expect((fonte.match(/overflow-y-auto/g) ?? []).length).toBe(2);
    expect(fonte).toMatch(/max-h-\[32px\] min-w-0 flex-1 overflow-y-auto break-words text-\[11px\]/);
    expect(fonte).toMatch(/min-h-0 flex-1 overflow-y-auto rounded border bg-card" data-testid="lista-parcelas-consorcio"/);
  });
  it('as portas: o detalhe e o cadastro novo abrem o modal do consórcio', () => {
    expect(readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8')).toMatch(/fin\.natureza === 'consorcio' && id\) \{\n\s+return <ConsorcioDialog/);
    expect(readFileSync(resolve(__dirname, 'CadastroDeContratoDialog.tsx'), 'utf8')).toMatch(/if \(escolha === 'consorcio'\) \{\n\s+return <ConsorcioDialog/);
  });
});
