/**
 * NOTA-RECEITA-DANFE-ANEXO-01 — o gesto "DANFE das notas já guardadas" (Gabriel 19/11: todo XML sem PDF, com prévia). Dados SINTÉTICOS.
 *   G1 a candidata = a NF só em XML (nenhum PDF da mesma chave no cliente), uma por chave, com os lançamentos LIGADOS ao XML
 *   G2 o modal: Simular gera sem gravar (o Gerar só depois); Gerar e anexar grava só as que geraram; a que falhou diz a frase
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { candidatasSemPdf, FRASE_SEM_XML, type CandidataDoDanfe, type DocDaNota, type ResultadoDoDanfe } from './danfeDasNotasGuardadas';
import { DanfeDasNotasGuardadasDialog } from '@/components/financeiro-v2/DanfeDasNotasGuardadasDialog';

const chave = (n: number) => `5026091122233300042455001${String(n).padStart(9, '0')}1000000010`;
const doc = (id: string, n: number, nome: string, o: Partial<DocDaNota> = {}): DocDaNota => ({
  id, lancamento_id: `l-${id}`, chave_acesso: chave(n), nome, tipo: nome.endsWith('.xml') ? 'application/xml' : 'application/pdf', url: `cli/${id}`,
  especie: 'nf', numero: String(n), serie: '1', data_emissao: '2026-09-29', valor_documento: 259.5, emitente_id: null, emitente_nome: 'Exemplo Ltda',
  emitente_documento: '01440000000200', ...o });

describe('G1 — as candidatas', () => {
  it('só a NF sem PDF da mesma chave; uma por chave; os lançamentos ligados ao XML vão junto (sem repetir o do próprio XML)', () => {
    const docs = [
      doc('x1', 98390, 'NFe-98390.xml'),
      doc('x2', 8702, 'NFe-8702.xml', { data_emissao: '2026-08-12' }),
      doc('x3', 518, 'nf 518.xml'), doc('p3', 518, 'nf 518.pdf'),        /* já tem o PDF: fora */
      doc('x4', 7, 'sem arquivo.xml', { url: null }),                     /* NOTA-ENTREGA-FUTURA-01 (Gabriel 25/11): sem arquivo ENTRA (o XML da caixa) */
      doc('b5', 9, 'boleto.pdf', { chave_acesso: null }),                  /* sem chave: fora */
      doc('x6', 98390, 'NFe-98390 (2).xml'),                               /* a mesma chave: uma só */
    ];
    const vinc = [{ documento_id: 'x2', lancamento_id: 'l-x2' }, { documento_id: 'x2', lancamento_id: 'p2' }, { documento_id: 'x2', lancamento_id: 'p3' },
      { documento_id: 'x2', lancamento_id: 'p2' }];
    const c = candidatasSemPdf(docs, vinc);
    expect(c.map((x) => [x.doc.id, x.ligados])).toEqual(expect.arrayContaining([['x2', ['p2', 'p3']], ['x1', []], ['x4', []]]));
    expect(c).toHaveLength(3);
    /* a com arquivo vem primeiro na mesma chave (a sem arquivo só quando não há outra) */
    expect(candidatasSemPdf([doc('y1', 5, 'a.xml', { url: null }), doc('y2', 5, 'b.xml')], []).map((x) => x.doc.id)).toEqual(['y2']);
  });
});

describe('G2 — o modal', () => {
  const C = (id: string, n: number): CandidataDoDanfe => ({ doc: doc(id, n, `NFe-${n}.xml`), chave: chave(n), ligados: [] });
  it('Simular gera sem gravar; Gerar e anexar grava só as que geraram; a falha diz a frase', async () => {
    const gerar = vi.fn(async (_cli: string, c: CandidataDoDanfe, simular: boolean): Promise<ResultadoDoDanfe> =>
      (c.doc.id === 'b' ? { ok: false, frase: 'XML não encontrado no armazenamento' } : { ok: true, bytes: simular ? 81920 : 81920 }));
    render(<DanfeDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} gerar={gerar} proxima={async () => null}
      ler={async () => ({ ok: true, valor: [C('a', 1), C('b', 2), C('c', 3)] })} />);
    expect(await screen.findAllByTestId('danfe-guardadas-linha')).toHaveLength(3);
    expect(screen.getByTestId('danfe-guardadas-gravar').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByTestId('danfe-guardadas-simular'));
    await waitFor(() => expect(screen.getByTestId('danfe-guardadas-contagem').textContent).toContain('2 geram o PDF'));
    expect(gerar.mock.calls.map((x) => x[2])).toEqual([true, true, true]);
    expect(screen.getByText('XML não encontrado no armazenamento')).toBeTruthy();
    fireEvent.click(screen.getByTestId('danfe-guardadas-gravar'));
    await waitFor(() => expect(screen.getByTestId('danfe-guardadas-frase').textContent).toContain('2 DANFEs anexados'));
    expect(gerar.mock.calls.slice(3).map((x) => [x[1].doc.id, x[2]])).toEqual([['a', false], ['c', false]]);
  });
});

describe('G3 — "Buscar na Receita" (FILA 12:04)', () => {
  const C = (id: string, n: number): CandidataDoDanfe => ({ doc: doc(id, n, `NFe-${n}.xml`), chave: chave(n), ligados: [] });
  it('a nota "sem XML guardado" oferece Buscar na Receita (com certificado); a consulta pela chave e, trazido o XML, a linha gera de novo', async () => {
    let temXml = false;
    const gerar = vi.fn(async (): Promise<ResultadoDoDanfe> => (temXml ? { ok: true, bytes: 70000 } : { ok: false, frase: FRASE_SEM_XML }));
    const buscar = vi.fn(async () => { temXml = true; return { ok: true, frase: 'XML trazido da Receita.' }; });
    render(<DanfeDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} gerar={gerar} buscar={buscar} titulares={async () => ['tit-1']}
      proxima={async () => null} ler={async () => ({ ok: true, valor: [C('a', 1)] })} />);
    await screen.findAllByTestId('danfe-guardadas-linha');
    fireEvent.click(screen.getByTestId('danfe-guardadas-simular'));
    const botao = await screen.findByTestId('danfe-buscar-receita');
    await waitFor(() => expect(botao.hasAttribute('disabled')).toBe(false));
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByTestId('danfe-guardadas-contagem').textContent).toContain('1 geram o PDF'));
    expect(buscar).toHaveBeenCalledWith('tit-1', chave(1));
    expect(screen.queryByTestId('danfe-buscar-receita')).toBeNull();
  });
  it('BLOQUEIO-01: antes da hora liberada pela Receita o botão diz "próxima às HH:MM", fica apagado e NÃO chama a Receita', async () => {
    const buscar = vi.fn(async () => ({ ok: true, frase: 'x' }));
    const futuro = new Date(Date.now() + 40 * 60_000).toISOString();
    render(<DanfeDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} buscar={buscar} titulares={async () => ['tit-1']} proxima={async () => futuro}
      gerar={async () => ({ ok: false, frase: FRASE_SEM_XML })} ler={async () => ({ ok: true, valor: [C('a', 1)] })} />);
    await screen.findAllByTestId('danfe-guardadas-linha');
    fireEvent.click(screen.getByTestId('danfe-guardadas-simular'));
    const botao = await screen.findByTestId('danfe-buscar-receita');
    await waitFor(() => expect(botao.textContent).toMatch(/^próxima às \d\d:\d\d$/));
    expect(botao.hasAttribute('disabled')).toBe(true);
    fireEvent.click(botao);
    expect(buscar).not.toHaveBeenCalled();
  });
  it('sem produtor com certificado o botão fica apagado (e diz por quê)', async () => {
    render(<DanfeDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} titulares={async () => []} buscar={vi.fn()} proxima={async () => null}
      gerar={async () => ({ ok: false, frase: FRASE_SEM_XML })} ler={async () => ({ ok: true, valor: [C('a', 1)] })} />);
    await screen.findAllByTestId('danfe-guardadas-linha');
    fireEvent.click(screen.getByTestId('danfe-guardadas-simular'));
    const botao = await screen.findByTestId('danfe-buscar-receita');
    expect(botao.hasAttribute('disabled')).toBe(true);
    expect(botao.getAttribute('title')).toContain('Sem certificado');
  });
});
