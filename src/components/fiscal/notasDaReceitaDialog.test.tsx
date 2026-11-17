/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — a tela "Notas da Receita" e o selo do "+ Novo" (dados SINTÉTICOS).
 *   T1 lista, abas com contagem, rodapé · T2 "Lançar" entrega o XML ao "Da nota fiscal" (D1) · T3 resumo: sem Lançar, PDF desligado
 *   T4 "Ver" abre os dados, sem XML na tela · T5 XML que falha: aviso, nada entregue · T6 selo do "+ Novo" = boletos + notas (D2)
 *   C1–C4 NOTA-RECEITA-CASAR-01: "Pode estar lançada"; "Lançar" com candidatos abre o quadro; 1 do mesmo CNPJ pré-marcado e "Vincular" manda
 *   o id certo; vários = nenhum marcado; "lançar nova" segue o caminho de hoje; frase da porta 2 aparece no quadro
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NotasDaReceitaDialog } from './NotasDaReceitaDialog';
import { montarLista, type CandidatoDaNota, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';
import { somaDoSelo, textoDoSelo } from '@/components/financeiro-v2/NovoMenuLancamentos';
import type { DadosDaReceita } from '@/hooks/useNotasDaReceita';

const chave = (n: number) => `502611${'12345678000190'}55001${String(n).padStart(9, '0')}1123456780`;
const linha = (n: number, o: Partial<LinhaRecebida> = {}): LinhaRecebida => ({
  id: `id-${n}`, titularId: 't1', chave: chave(n), situacao: 'xml', emitenteDocumento: '12345678000190', emitenteNome: `Emitente Exemplo ${n}`,
  emissao: `2026-11-${String(10 + n).padStart(2, '0')}`, valorCent: n * 10000, notaId: null, recebidoEm: null, eventos: [], temXml: false, ...o,
});
const dados = (): DadosDaReceita => ({
  lista: montarLista([linha(1), linha(2, { situacao: 'resumo' }), linha(3), linha(4, { situacao: 'cancelado_na_sefaz' })],
    new Map([['t1', 'Produtora Exemplo']]), new Set([chave(3)])),
  titulares: [{ id: 't1', nome: 'Produtora Exemplo' }], ultimaBusca: '2026-11-16T22:46:00Z', proximaBusca: null,
});
const abrir = (o: { aoLancar?: (f: File) => void; aoVincular?: (f: File, id: string) => Promise<string | null>; lerXml?: (id: string) => Promise<string>;
  d?: DadosDaReceita; abrirDanfe?: () => Window | null; mostrarNaAba?: (aba: Window | null, f: File) => Promise<void> } = {}) =>
  render(<NotasDaReceitaDialog clienteNome="Cliente Bancada" dados={o.d ?? dados()} carregando={false} erro={null} aoFechar={() => {}}
    aoLancar={o.aoLancar ?? (() => {})} aoVincular={o.aoVincular ?? (async () => null)} lerXml={o.lerXml ?? (async () => '<nfeProc/>')}
    abrirDanfe={o.abrirDanfe ?? (() => null)} mostrarNaAba={o.mostrarNaAba ?? (async () => {})} />);
const linhaDe = (n: number) => screen.getAllByTestId('receita-linha').find((tr) => tr.textContent?.includes(`Emitente Exemplo ${n}`)) as HTMLElement;

describe('NOTAS-RECEITA F3.4 — a tela', () => {
  it('T1 lista as 4, situações certas, rodapé sem a cancelada', () => {
    abrir();
    expect(screen.getAllByTestId('receita-linha')).toHaveLength(4);
    expect(linhaDe(1).dataset.situacao).toBe('nova');
    expect(linhaDe(2).dataset.situacao).toBe('pede_ciencia');
    expect(linhaDe(3).dataset.situacao).toBe('no_sistema');
    expect(linhaDe(4).dataset.situacao).toBe('cancelada');
    const rodape = screen.getByTestId('receita-rodape').textContent ?? '';
    expect(rodape).toContain('4 notas');
    expect(rodape).toContain('Total R$ 600,00');
    expect(rodape).toContain('1 pedem ciência · 1 a lançar');
  });
  it('T2 "Lançar" lê o XML e entrega UM arquivo ao "Da nota fiscal"', async () => {
    const aoLancar = vi.fn();
    const lerXml = vi.fn(async () => '<nfeProc>sintetico</nfeProc>');
    abrir({ aoLancar, lerXml });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    await waitFor(() => expect(aoLancar).toHaveBeenCalledTimes(1));
    expect(lerXml).toHaveBeenCalledWith('id-1');
    const f = aoLancar.mock.calls[0][0] as File;
    expect(f.name).toBe(`NFe${chave(1)}.xml`);
    const texto = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsText(f); });
    expect(texto).toBe('<nfeProc>sintetico</nfeProc>');
  });
  it('T3 resumo: Lançar escondido e PDF desligado; cancelada e já no sistema sem Lançar', () => {
    abrir();
    expect(within(linhaDe(2)).getByTestId('receita-lancar')).toBeDisabled();
    expect(within(linhaDe(2)).getByTestId('receita-lancar').className).toContain('invisible');
    expect(within(linhaDe(2)).getByTestId('receita-pdf')).toBeDisabled();
    expect(within(linhaDe(4)).getByTestId('receita-lancar')).toBeDisabled();
    expect(within(linhaDe(3)).getByTestId('receita-lancar')).toBeDisabled();
    expect(within(linhaDe(1)).getByTestId('receita-pdf')).not.toBeDisabled();
  });
  it('T4 "Ver" abre os dados (chave, valor, situação), sem XML', () => {
    abrir();
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-ver'));
    const d = screen.getByTestId('receita-dados');
    expect(d.textContent).toContain('R$ 100,00');
    expect(d.textContent).toContain('Nova');
    expect(d.textContent).not.toContain('<nfeProc');
  });
  it('T5 o XML que não se lê: aviso no rodapé, nada entregue', async () => {
    const aoLancar = vi.fn();
    abrir({ aoLancar, lerXml: async () => { throw new Error('Esta nota ainda não tem o XML completo.'); } });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    await waitFor(() => expect(screen.getByTestId('receita-aviso').textContent).toBe('Esta nota ainda não tem o XML completo.'));
    expect(aoLancar).not.toHaveBeenCalled();
  });
  it('T5b aba "A lançar" mostra só a nova; busca por emitente filtra', () => {
    abrir();
    fireEvent.click(screen.getByText('A lançar'));
    expect(screen.getAllByTestId('receita-linha')).toHaveLength(1);
    fireEvent.click(screen.getByText('Todas'));
    fireEvent.change(screen.getByTestId('receita-busca'), { target: { value: 'exemplo 2' } });
    expect(screen.getAllByTestId('receita-linha').map((tr) => tr.dataset.situacao)).toEqual(['pede_ciencia']);
  });
  it('T6 o selo do "+ Novo" soma boletos e notas (D2); nada lido = vazio', () => {
    expect(textoDoSelo(somaDoSelo(3, 2))).toBe('5');
    expect(textoDoSelo(somaDoSelo(null, 2))).toBe('2');
    expect(textoDoSelo(somaDoSelo(null, null))).toBe('');
    expect(textoDoSelo(somaDoSelo(90, 20))).toBe('99+');
  });
});

const cand = (id: string, classe: CandidatoDaNota['classe']): CandidatoDaNota => ({ id, classe, competencia: '2026-11-11', vencimento: null,
  pagamento: '2026-12-10', descricao: `Lançamento ${id}`, status: 'realizado', conciliado: false, valorCent: 10000, conta: 'Cartão Exemplo', fornecedorNome: 'Fornecedor Exemplo' });
const comCand = (cs: CandidatoDaNota[]): DadosDaReceita => ({ ...dados(), lista: montarLista([linha(1), linha(2, { situacao: 'resumo' })],
  new Map([['t1', 'Produtora Exemplo']]), new Set(), new Map([[chave(1), cs]])) });

describe('NOTA-RECEITA-CASAR-01 — o quadro "pode já estar lançada"', () => {
  it('C1 candidato do mesmo CNPJ: a linha é "Pode estar lançada", Lançar abre o quadro pré-marcado e "Vincular" manda o XML + o id', async () => {
    const aoVincular = vi.fn(async () => null); const aoLancar = vi.fn();
    abrir({ d: comCand([cand('L1', 'mesmo_cnpj')]), aoVincular, aoLancar });
    expect(linhaDe(1).dataset.situacao).toBe('pode_estar');
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    expect(screen.getByTestId('receita-casar')).toBeTruthy();
    expect(aoLancar).not.toHaveBeenCalled();
    expect(screen.getByTestId('receita-vincular')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('receita-vincular'));
    await waitFor(() => expect(aoVincular).toHaveBeenCalledTimes(1));
    const [f, id] = aoVincular.mock.calls[0] as unknown as [File, string];
    expect(id).toBe('L1');
    expect(f.name).toBe(`NFe${chave(1)}.xml`);
    await waitFor(() => expect(screen.queryByTestId('receita-casar')).toBeNull());
  });
  it('C2 vários candidatos: nenhum marcado (Vincular desligado) até escolher; o escolhido é o que vai', async () => {
    const aoVincular = vi.fn(async () => null);
    abrir({ d: comCand([cand('L1', 'mesmo_cnpj'), cand('L2', 'sem_fornecedor')]), aoVincular });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    expect(screen.getByTestId('receita-vincular')).toBeDisabled();
    fireEvent.click(screen.getAllByTestId('receita-candidato')[1]);
    fireEvent.click(screen.getByTestId('receita-vincular'));
    await waitFor(() => expect(aoVincular).toHaveBeenCalledTimes(1));
    expect((aoVincular.mock.calls[0] as unknown as [File, string])[1]).toBe('L2');
  });
  it('C3 "É outra compra: lançar nova" segue o caminho de hoje (aoLancar), sem id; só "outro fornecedor" fica "Nova" mas o quadro aparece', async () => {
    const aoVincular = vi.fn(async () => null); const aoLancar = vi.fn();
    abrir({ d: comCand([cand('L9', 'outro_fornecedor')]), aoVincular, aoLancar });
    expect(linhaDe(1).dataset.situacao).toBe('nova');
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    expect(screen.getByTestId('receita-vincular')).toBeDisabled();
    fireEvent.click(screen.getByTestId('receita-lancar-nova'));
    await waitFor(() => expect(aoLancar).toHaveBeenCalledTimes(1));
    expect(aoVincular).not.toHaveBeenCalled();
  });
  it('C4 a porta 2 recusa: a frase fica no quadro, que não fecha', async () => {
    abrir({ d: comCand([cand('L1', 'mesmo_cnpj')]), aoVincular: async () => 'A chave da nota não confere.' });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    fireEvent.click(screen.getByTestId('receita-vincular'));
    await waitFor(() => expect(screen.getByTestId('receita-casar-rodape').textContent).toBe('A chave da nota não confere.'));
    expect(screen.getByTestId('receita-casar')).toBeTruthy();
  });
});

describe('NOTA-DANFE-01 — o botão "PDF"', () => {
  it('P1 abre a aba NO CLIQUE e escreve nela o DANFE do XML da nota', async () => {
    const aba = {} as Window;
    const abrirDanfe = vi.fn(() => aba);
    const mostrarNaAba = vi.fn(async () => {});
    abrir({ abrirDanfe, mostrarNaAba, lerXml: async () => '<nfeProc>x</nfeProc>' });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-pdf'));
    expect(abrirDanfe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mostrarNaAba).toHaveBeenCalledTimes(1));
    const [a, f] = mostrarNaAba.mock.calls[0] as unknown as [Window, File];
    expect(a).toBe(aba);
    expect(f.name).toBe(`NFe${chave(1)}.xml`);
  });
  it('P2 o DANFE que não sai: a frase no rodapé', async () => {
    abrir({ mostrarNaAba: async () => { throw new Error('Este arquivo não é uma NF-e.'); } });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-pdf'));
    await waitFor(() => expect(screen.getByTestId('receita-aviso').textContent).toBe('Este arquivo não é uma NF-e.'));
  });
});
