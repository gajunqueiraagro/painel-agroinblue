/**
 * PARC-CONTRATO-01 item 3 — documentos ao CRIAR o contrato: as mesmas peças do Novo lançamento parcelado, com os pendentes em
 * memória; nada é gravado até o Salvar; o XML só é LIDO e entregue a quem preenche o contrato.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { CTE, montarNFe } from '@/lib/financeiro/nfe/__fixtures__/notas';
import { novoPendente, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';
import { MOTIVO_SEM_PARCELAS } from '@/components/financeiro-v2/ParcelasDaCompra';
import { DocumentosNaCriacao } from './DocumentosNaCriacao';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
/* FORN-SELETOR-PADRAO-01 fatia 2a — o emitente lê do leitor único (de mentira no teste) */
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

const textoDoXml = new Map<string, string>();
Object.defineProperty(Blob.prototype, 'arrayBuffer', { configurable: true, value: async function (this: File) {
  return new TextEncoder().encode(textoDoXml.get(this.name) ?? '').buffer;
} });
function xml(texto: string, nome = `nota-${textoDoXml.size + 1}.xml`) { textoDoXml.set(nome, texto); return new File([texto], nome, { type: '' }); }
const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });

const PARCELAS = [
  { numero: 1, dataVencimento: '2026-11-10', valor: 100 }, { numero: 2, dataVencimento: '2026-12-10', valor: 100 }, { numero: 3, dataVencimento: '2027-01-10', valor: 100 },
];
const aoLer = vi.fn<(nota: NotaLida, arquivo: File) => void>();
let lista: DocumentoPendente[] = [];
function Hospedeiro({ inicio = [], parcelas = PARCELAS, travado = false, recado = null, credorId = null }: { inicio?: DocumentoPendente[]; parcelas?: typeof PARCELAS; travado?: boolean; recado?: string | null; credorId?: string | null }) {
  const [pendentes, setPendentes] = useState<DocumentoPendente[]>(inicio);
  lista = pendentes;
  return <DocumentosNaCriacao pendentes={pendentes} onMudar={setPendentes} parcelas={parcelas} clienteId="cli" credorId={credorId}
    travado={travado} onNotaDoXml={aoLer} recadoDoXml={recado} />;
}

beforeEach(() => { aoLer.mockReset(); lista = []; });
afterEach(() => cleanup());

describe('DocumentosNaCriacao', () => {
  it('2a-fix1 — o documento NOVO nasce com o CREDOR do contrato no emitente, em âmbar e editável; sem credor, nasce vazio', async () => {
    definirFornecedoresDoLeitor([{ id: 'cred-1', nome: 'Credor Do Contrato' }, { id: 'out-2', nome: 'Outro Fornecedor' }]);
    const { unmount } = render(<Hospedeiro credorId="cred-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar documento/ }));
    const faixa = await screen.findByTestId('sugestao-do-lancamento');
    expect(faixa.textContent).toContain('o contrato diz (emitente)');
    expect(faixa.textContent).toContain('não muda o contrato');
    expect(faixa.textContent).not.toContain('lançamento');
    expect(screen.getAllByRole('combobox').some((c) => c.textContent?.includes('Credor Do Contrato'))).toBe(true);
    unmount();
    render(<Hospedeiro />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar documento/ }));
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('sugestao-do-lancamento')).toBeNull();
    expect(screen.getAllByRole('combobox').some((c) => c.textContent?.includes('Credor Do Contrato'))).toBe(false);
  });
  it('sem valor ou sem parcelas definidas: a grade ESCREVE o motivo (não some)', () => {
    render(<Hospedeiro parcelas={[]} />);
    expect(screen.getByText(MOTIVO_SEM_PARCELAS)).toBeTruthy();
  });

  it('com parcelas: uma linha por parcela, e o boleto anexado numa linha vira PENDENTE daquela parcela (nada é gravado)', async () => {
    render(<Hospedeiro />);
    expect([1, 2, 3].map((n) => !!screen.queryByTestId(`mais-boleto-${n}`))).toEqual([true, true, true]);
    fireEvent.click(screen.getByTestId('mais-boleto-2'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [pdf('boleto-2.pdf')] } });
    await waitFor(() => expect(lista.length).toBe(1));
    expect([lista[0].parcela, lista[0].payload.especie, lista[0].gravado, lista[0].arquivo?.name]).toEqual([2, 'boleto', false, 'boleto-2.pdf']);
  });

  it('VER antes de salvar: o arquivo da NF e o do boleto abrem do navegador, sem subir', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    const criar = vi.fn(() => 'blob:teste'); const soltar = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: criar });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: soltar });
    render(<Hospedeiro inicio={[novoPendente({ especie: 'nf', numero: '5510' }, pdf('nf-5510.pdf'), null), novoPendente({ especie: 'boleto' }, pdf('b2.pdf'), 2)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ver nf-5510.pdf' }));
    expect(criar).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('blob:teste', '_blank', 'noopener');
    fireEvent.click(screen.getByTitle('Abrir b2.pdf'));
    expect(criar).toHaveBeenCalledTimes(2);
    abrir.mockRestore();
  });

  it('Importar XML: a nota é LIDA e entregue (com o arquivo .xml pronto); nada vira pendente sozinho', async () => {
    render(<Hospedeiro />);
    fireEvent.change(screen.getByTestId('criacao-xml-input'), { target: { files: [xml(montarNFe(), 'Nota Da Compra.XML')] } });
    await waitFor(() => expect(aoLer).toHaveBeenCalledTimes(1));
    const [nota, arquivo] = aoLer.mock.calls[0];
    expect(nota.modelo).toBe('55');
    /* o arquivo entregue é o PRONTO para o bucket (`arquivoXmlDaNota`): nome terminado em `.xml` minúsculo e tipo explícito */
    expect([arquivo.name, arquivo.type]).toEqual(['Nota Da Compra.xml', 'application/xml']);
    expect(lista).toEqual([]);
  });

  it('XML que não é nota: a frase do leitor fica escrita ao lado da área, em vermelho, e nada é entregue', async () => {
    render(<Hospedeiro recado="Da NF 1: valor" />);
    expect(screen.getByTestId('recado-do-xml').className).toContain('text-amber-700');
    fireEvent.change(screen.getByTestId('criacao-xml-input'), { target: { files: [xml(CTE)] } });
    await waitFor(() => expect(screen.getByTestId('recado-do-xml').className).toContain('text-destructive'));
    expect(screen.getByTestId('recado-do-xml').textContent).not.toBe('');
    expect(aoLer).not.toHaveBeenCalled();
  });
});

describe('a ligação no Editar/Nova obrigação e no gravador (a fonte prende)', () => {
  const dialogo = readFileSync(resolve(__dirname, 'ObrigacaoDialog.tsx'), 'utf8');
  const gravador = readFileSync(resolve(__dirname, '../../hooks/useFinanciamentoCadastro.ts'), 'utf8');
  it('o gravador entrega o id do parcelamento criado ANTES do aviso, e só quando há quem o peça', () => {
    const i = gravador.indexOf("if (typeof data === 'string' && data && aoCriarParcelamento) await aoCriarParcelamento(data);");
    expect(i).toBeGreaterThan(-1);
    expect(gravador.indexOf("toast.success('Parcelamento cadastrado');")).toBeGreaterThan(i);
  });
  it('os documentos são gravados pelo pós-salvar do parcelado (os donos de sempre), só com pendentes; a falha guarda o id e NÃO fecha', () => {
    expect(dialogo).toContain('const lista = await gravarDocumentosDoParcelamento(clienteId, gravadas, pendentesDaCriacao);');
    expect(dialogo).toContain('const gravadas = await lancamentosDoParcelamento(id);');
    expect(dialogo).toContain('ehParcelamento && pendentesDaCriacao.length > 0');
    expect(dialogo).toContain("if (ok && criado && falha) { setPosCriacao({ id: criado, erro: falha }); setAba('documentos'); return; }");
    /* contrato já gravado: o Salvar tenta de novo SÓ os documentos — o `salvar(` do contrato vem DEPOIS do retorno */
    const retry = dialogo.indexOf('if (posCriacao) {');
    const criar = dialogo.indexOf('const ok = await salvar(destinacoes');
    expect(retry).toBeGreaterThan(-1);
    expect(criar).toBeGreaterThan(retry);
    expect(dialogo.slice(retry, criar)).toContain('setPosCriacao(null);\n      onSalvo?.();\n      return;\n    }');
    expect(dialogo).toContain('data-testid="erro-dos-documentos"');
  });
  it('a aba Documentos existe na criação E na edição de parcelamento; financiamento com juros segue sem ela', () => {
    expect(dialogo).toContain("ehParcelamento ? [{ key: 'documentos', label: 'Documentos' }] : []");
    expect(dialogo).toContain('{!ehEdicao ? (\n                        <DocumentosNaCriacao');
  });
});
