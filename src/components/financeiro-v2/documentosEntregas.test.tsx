/**
 * NOTA-ENTREGA-FUTURA-01 (B) — a aba Documentos de uma compra com entrega futura (mock aprovado 25/11 07:44; dados SINTÉTICOS no molde
 * Pastoforma): o PAPEL de cada documento (do banco), "gera a conta" só na Compra, "sem financeiro" na Entrega, o SALDO A ENTREGAR, o
 * "+ Ligar entrega da Caixa" e o diálogo (a que cita a compra marcada; ligar = o gravador de sempre, com os lançamentos da compra).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { LigarEntregaDaCaixaDialog } from '@/components/financeiro-v2/LigarEntregaDaCaixaDialog';
import type { LancDocumento, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import type { EntregasApi } from '@/hooks/useEntregasDoLancamento';
import { lerEntregas, type EntregasDoLancamento } from '@/lib/financeiro/entregasDoLancamento';
import type { RemessaNaCaixa } from '@/lib/fiscal/entregasDaCaixa';

const doc = (x: Partial<LancDocumento>): LancDocumento => ({
  id: 'd', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf', numero: null, serie: null,
  chaveAcesso: null, dataEmissao: null, valorDocumento: null, url: 'x.pdf', tipo: 'application/pdf', tamanhoBytes: 1,
  observacao: null, emitenteId: null, emitenteNome: 'Sementes Sintéticas', emitenteDocumento: '11222333000181', cancelado: false, canceladoMotivo: null,
  versao: 1, ligadoAQtd: 1, ...x,
});
const COMPRA = doc({ id: 'c', numero: '000.030.150', chaveAcesso: '1'.repeat(44), url: null, tipo: 'application/xml', valorDocumento: 18800 });
const ENTREGA = doc({ id: 'e', numero: '000.030.436', chaveAcesso: '2'.repeat(44), valorDocumento: 18800 });
const BOLETO = doc({ id: 'b', especie: 'boleto', valorDocumento: 18800 });
const api = (documentos: LancDocumento[]): LancamentoDocumentosApi => ({
  documentos, confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
  registrar: vi.fn(), editar: vi.fn(), cancelar: vi.fn(), anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
});
const valor = (x: unknown): EntregasDoLancamento => { const e = lerEntregas(x); if (!e) throw new Error('fixture'); return e; };
const PASTO = valor({ compra: { chave: '1'.repeat(44), nf: '30150' }, entregas: 1,
  papeis: [{ documento_id: 'c', papel: 'compra' }, { documento_id: 'e', papel: 'entrega', n: 1 }, { documento_id: 'b', papel: 'boleto' }],
  itens: [{ produto: 'Semente sintética', unidade: 'kg', comprado: 1000, entregue: 400, falta: 600 }], motivo: null });
const monta = (e: EntregasApi['entregas'], recarregar = vi.fn()) => render(<MemoryRouter>
  <AbaDocumentosLancamento api={api([COMPRA, ENTREGA, BOLETO])} clienteId="cli" lancamentoId="l1" entregasApi={{ entregas: e, recarregar }} /></MemoryRouter>);

describe('a aba Documentos com entregas', () => {
  it('o papel de cada documento, "gera a conta" só na Compra, "sem financeiro" na Entrega', () => {
    monta({ ok: true, valor: PASTO });
    expect(screen.getByTestId('cabecalho-papel').textContent).toBe('Papel');
    const papeis = screen.getAllByTestId('linha-documento').map((l) => within(l).getByTestId('doc-papel').textContent);
    expect(papeis).toEqual(['Compra', 'Entrega 1', 'Boleto']);
    expect(screen.getAllByTestId('doc-gera-conta')).toHaveLength(1);
    expect(screen.getAllByTestId('doc-sem-financeiro')).toHaveLength(1);
    expect(screen.getByTestId('doc-gera-conta').getAttribute('title')).toContain('LCDPR');
  });
  it('o saldo a entregar: comprado · entregue · falta (e "completa" quando fecha)', () => {
    const { unmount } = monta({ ok: true, valor: PASTO });
    const linha = screen.getByTestId('saldo-linha');
    expect([...linha.querySelectorAll('td')].slice(0, 4).map((t) => t.textContent)).toEqual(['Semente sintética', '1.000 kg', '400 kg', '600 kg']);
    unmount();
    monta({ ok: true, valor: { ...PASTO, itens: [{ produto: 'Semente sintética', unidade: 'kg', comprado: 1000, entregue: 1000, falta: 0 }] } });
    expect(screen.getByTestId('saldo-falta').textContent).toBe('completa');
  });
  it('sem a compra: a frase no lugar da tabela; sem entrega: nada de saldo', () => {
    const { unmount } = monta({ ok: true, valor: { ...PASTO, compra: null, itens: null, motivo: 'sem_compra' } });
    expect(screen.getByTestId('saldo-sem-itens').textContent).toMatch(/Sem a NF da compra/);
    unmount();
    monta({ ok: true, valor: { ...PASTO, entregas: 0 } });
    expect(screen.queryByTestId('saldo-a-entregar')).toBeNull();
  });
  it('a leitura que falha: papel "—" e nenhum aviso sem remessa no confronto (nunca papel inventado)', () => {
    monta({ ok: false, motivo: 'sem conexão com o servidor' });
    expect(screen.getAllByTestId('doc-papel').map((t) => t.textContent)).toEqual(['—', '—', '—']);
    expect(screen.queryByTestId('saldo-a-entregar')).toBeNull();
  });
  it('"+ Ligar entrega da Caixa" abre o diálogo', async () => {
    monta({ ok: true, valor: PASTO });
    fireEvent.click(screen.getByTestId('ligar-entrega-abrir'));
    expect(await screen.findByTestId('ligar-entrega-caixa')).toBeInTheDocument();
  });
});

describe('o diálogo Ligar entrega da Caixa', () => {
  const rem = (numero: string, o: Partial<RemessaNaCaixa> = {}): RemessaNaCaixa => ({ chave: numero.padStart(44, '9'), numero, emissao: '2026-11-18',
    valorCent: 1880000, emitenteNome: 'Sementes Sintéticas', xml: '<x/>', citaACompra: false, citaOutra: false, ...o });
  it('a que cita a compra vem marcada; ligar manda as marcadas para os lançamentos da compra; ligou = o dono relê', async () => {
    const ligar = vi.fn().mockResolvedValue({ ligadas: 1, falhas: [] });
    const ids = vi.fn().mockResolvedValue(['l1', 'l2']);
    const aoLigar = vi.fn();
    render(<LigarEntregaDaCaixaDialog clienteId="cli" lancamentoId="l1" compra={{ documentoId: 'c', chave: '1'.repeat(44), nf: '30150' }}
      emitenteDocumento="11222333000181" emitenteNome="Sementes Sintéticas" aoFechar={vi.fn()} aoLigar={aoLigar}
      carregar={vi.fn().mockResolvedValue({ ok: true, valor: [rem('30436', { citaACompra: true }), rem('30500')] })} ligar={ligar} idsDaCompra={ids} />);
    const linhas = await screen.findAllByTestId('ligar-entrega-linha');
    expect(linhas.map((l) => l.textContent)).toEqual(['30.43618/11/202618.800,00cita esta compra', '30.50018/11/202618.800,00sem referência · confira']);
    expect(screen.getByTestId('ligar-entrega-gravar').textContent).toBe('Ligar 1 entrega');
    fireEvent.click(screen.getByTestId('ligar-entrega-gravar'));
    await waitFor(() => expect(aoLigar).toHaveBeenCalledTimes(1));
    expect(ids).toHaveBeenCalledWith('cli', 'c', 'l1');
    expect(ligar).toHaveBeenCalledWith('cli', [{ numero: '30436', chave: '30436'.padStart(44, '9'), xml: '<x/>' }], ['l1', 'l2']);
    expect(screen.getByTestId('ligar-entrega-resultado').textContent).toBe('1 entrega ligada');
  });
  it('a Caixa que não responde: "Não consegui ler" e o Tentar de novo (nunca "nenhuma")', async () => {
    render(<LigarEntregaDaCaixaDialog clienteId="cli" lancamentoId="l1" compra={null} emitenteDocumento="11222333000181" emitenteNome="X"
      aoFechar={vi.fn()} aoLigar={vi.fn()} carregar={vi.fn().mockResolvedValue({ ok: false, motivo: 'sem conexão' })} />);
    expect((await screen.findByTestId('ligar-entrega-falhou')).textContent).toContain('Não consegui ler a Caixa');
    expect(screen.queryByTestId('ligar-entrega-vazia')).toBeNull();
  });
});

describe('Ligar o XML da Receita (Gabriel 25/11 09:26: a NF 30.150 "sem arquivo")', () => {
  it('a chave confere: anexa o XML e gera o DANFE ligado às parcelas; a chave que não confere não grava nada', async () => {
    const { ligarXmlDaReceitaAoDocumento } = await import('@/lib/fiscal/danfeDasNotasGuardadas');
    const ch = '1'.repeat(44);
    const anexar = vi.fn().mockResolvedValue(true);
    const xml = new TextEncoder().encode('<x/>').buffer;
    const r = await ligarXmlDaReceitaAoDocumento('cli', 'c', ch, true, anexar, { daCaixa: vi.fn().mockResolvedValue(xml), lerChave: () => ch });
    expect(r).toEqual({ ok: true, frase: 'XML ligado ao documento.' });
    expect(anexar.mock.calls[0][0].name).toBe(`NFe${ch}.xml`);
    const anexar2 = vi.fn();
    const r2 = await ligarXmlDaReceitaAoDocumento('cli', 'c', ch, true, anexar2, { daCaixa: vi.fn().mockResolvedValue(xml), lerChave: () => '2'.repeat(44) });
    expect(r2.ok).toBe(false);
    expect(r2.frase).toMatch(/chave não confere/);
    expect(anexar2).not.toHaveBeenCalled();
    const r3 = await ligarXmlDaReceitaAoDocumento('cli', 'c', ch, true, anexar2, { daCaixa: vi.fn().mockResolvedValue(null) });
    expect(r3.frase).toMatch(/não está na caixa/);
  });
  it('a NF sem arquivo mostra "ligar o XML da Receita"', () => {
    monta({ ok: true, valor: PASTO });
    expect(screen.getAllByTestId('doc-ligar-xml-receita')).toHaveLength(1);
  });
});
