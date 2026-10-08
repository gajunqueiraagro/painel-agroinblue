/**
 * FIN-DOCUMENTO-FORM-01 — o formulário do documento muda com o TIPO, o emitente tem busca e o arquivo é a área verde.
 *
 * ⚠ A QUEIXA DO GABRIEL (04/10): "quando altero de nota fiscal para boleto, recibo, comprovante, ele mantém número, série, data
 *   de emissão, valor do documento como se fosse tudo nota fiscal". E: "o dropdown do emitente aparece a lista, mas sem poder
 *   digitar e procurar".
 * ⚠ O QUE SE PROVA É O QUE APARECE E O PAYLOAD que vai ao `registrar`/`editar` — as RPCs e as colunas são as de sempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { AbaDocumentosLancamento, FormDocumento, CAMPOS_POR_ESPECIE, type SugestaoDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { MemoryRouter } from 'react-router-dom';
import { ESPECIES_LANC_DOC, type LancDocumento, type LancDocPayload, type LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
/* FORN-SELETOR-PADRAO-01 fatia 2a — o emitente lê do leitor único (de mentira no teste) */
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

const FORNECEDORES = [
  { id: 'pan', nome: 'Comercial Pantanal de Rio Verde Ltda' },
  { id: 'agn', nome: 'Agnaldo da Cruz Cunegundes' },
  { id: 'cle', nome: 'Cleodir Supermercados Eireli-EPP' },
];
const SUGESTAO: SugestaoDocumento = { numero: '31776', dataEmissao: '2026-08-18', valor: 852.65, emitenteId: 'pan', dataPagamento: '2026-10-05' };
const doc = (x: Partial<LancDocumento>): LancDocumento => ({
  id: 'd1', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf', numero: '31776', serie: '1',
  chaveAcesso: '5026 0809 2481 7900', dataEmissao: '2026-08-18', valorDocumento: 1705.3, url: 'x.pdf', tipo: 'application/pdf',
  tamanhoBytes: 1, observacao: null, emitenteId: 'pan', emitenteNome: 'Comercial Pantanal de Rio Verde Ltda', emitenteDocumento: null,
  cancelado: false, canceladoMotivo: null, versao: 3, ligadoAQtd: 1, ...x,
});

function monta(p: { documento?: LancDocumento | null; sugestao?: SugestaoDocumento; semBoleto?: boolean; operacaoId?: string | null } = {}) {
  const registrar = vi.fn(async (_p: LancDocPayload) => ({ id: 'novo', origem: 'lancamento' as const, operacaoId: null }));
  const editar = vi.fn(async (_id: string, _v: number, _p: LancDocPayload) => true);
  const api: LancamentoDocumentosApi = {
    documentos: [], confronto: null, loading: false, saving: false, operacaoId: p.operacaoId ?? null, operacaoTipo: null,
    registrar, editar, cancelar: vi.fn().mockResolvedValue(true), anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
  };
  const onFechar = vi.fn();
  render(<FormDocumento api={api} documento={p.documento ?? null} clienteId="cli" onFechar={onFechar}
    sugestao={p.sugestao} semBoleto={p.semBoleto} />);
  return { registrar, editar, onFechar };
}
const tipo = (rotulo: string) => screen.getByRole('button', { name: rotulo });
/** Os rótulos dos campos, na ordem da tela (sem o asterisco do tipo). */
const rotulos = () => [...document.querySelectorAll('[role="dialog"] label')].map(l => (l.textContent ?? '').replace(' *', ''));
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Registrar documento|Salvar documento/ }));

beforeEach(() => {
  definirFornecedoresDoLeitor(FORNECEDORES);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('cada tipo tem os SEUS campos, com os seus rótulos', () => {
  const FIXOS = ['Observação', 'Arquivo'];
  it('Nota fiscal (o padrão): Número, Série, emissão, valor da nota, emitente e chave', () => {
    monta();
    expect(rotulos()).toEqual(['Tipo de documento', 'Número', 'Série', 'Data de emissão', 'Valor da nota', 'Emitente', 'Chave de acesso', ...FIXOS]);
  });
  it('Boleto: data, valor, nº do documento e beneficiário — sem Série, sem Chave', () => {
    monta(); fireEvent.click(tipo('Boleto'));
    expect(rotulos()).toEqual(['Tipo de documento', 'Data do documento', 'Valor do boleto', 'Nº do documento', 'Beneficiário', ...FIXOS]);
  });
  it('Recibo: data, valor recebido, nº do recibo e quem recebeu', () => {
    monta(); fireEvent.click(tipo('Recibo'));
    expect(rotulos()).toEqual(['Tipo de documento', 'Data do recibo', 'Valor recebido', 'Nº do recibo', 'Quem recebeu (emitente)', ...FIXOS]);
  });
  it('Comprovante: data do pagamento, valor pago e autenticação — sem emitente', () => {
    monta(); fireEvent.click(tipo('Comprovante'));
    expect(rotulos()).toEqual(['Tipo de documento', 'Data do pagamento', 'Valor pago', 'Autenticação / ID da transação', ...FIXOS]);
    expect(screen.queryByTestId('doc-emitente')).toBeNull();
  });
  it('Outro: data, valor, identificação e emitente', () => {
    monta(); fireEvent.click(tipo('Outro'));
    expect(rotulos()).toEqual(['Tipo de documento', 'Data', 'Valor', 'Identificação', 'Emitente', ...FIXOS]);
  });
  it('o controle de tipo é o primeiro campo, com os cinco do vocabulário (quatro com `semBoleto`), o ativo em navy', () => {
    monta();
    const segmentos = ESPECIES_LANC_DOC.map(e => tipo(e.label));
    expect(segmentos.map(b => b.textContent)).toEqual(['Nota fiscal', 'Boleto', 'Recibo', 'Comprovante', 'Outro']);
    expect(tipo('Nota fiscal').className).toContain('bg-primary');
    expect(tipo('Boleto').className).not.toContain('bg-primary ');
    /* a tabela cobre o vocabulário inteiro — tipo novo sem linha aqui seria erro de compilação, e este é o lembrete */
    expect(Object.keys(CAMPOS_POR_ESPECIE).sort()).toEqual(ESPECIES_LANC_DOC.map(e => e.value).sort());
  });
  it('semBoleto: sem o segmento Boleto', () => {
    monta({ semBoleto: true });
    expect(screen.queryByRole('button', { name: 'Boleto' })).toBeNull();
    expect(tipo('Recibo')).toBeInTheDocument();
  });
});

describe('trocar o tipo troca os campos, preserva o digitado e ZERA no payload o que o tipo não tem', () => {
  it('NF → Recibo: Série e Chave somem e vão nulas; número, data e valor permanecem', async () => {
    const { registrar } = monta({ sugestao: SUGESTAO });
    fireEvent.change(screen.getByTestId('doc-numero'), { target: { value: '000.031.776' } });
    fireEvent.change(screen.getByTestId('doc-serie'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('doc-chave'), { target: { value: '5026 0809 2481 7900 0175' } });
    fireEvent.click(tipo('Recibo'));
    expect(screen.queryByTestId('doc-serie')).toBeNull();
    expect(screen.queryByTestId('doc-chave')).toBeNull();
    expect((screen.getByTestId('doc-numero') as HTMLInputElement).value).toBe('000.031.776');
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({
      especie: 'recibo', numero: '000.031.776', serie: null, chaveAcesso: null, dataEmissao: '2026-08-18', valorDocumento: 852.65,
      emitenteId: 'pan', emitenteNome: 'Comercial Pantanal de Rio Verde Ltda',
    });
  });
  it('a busca sabe achar: como NF, a série e a chave digitadas VÃO no payload', async () => {
    const { registrar } = monta({ sugestao: SUGESTAO });
    fireEvent.change(screen.getByTestId('doc-serie'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('doc-chave'), { target: { value: '5026 0809' } });
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ especie: 'nf', serie: '1', chaveAcesso: '5026 0809' });
  });
  it('editar uma NF existente e mudar para Boleto: série e chave do documento vão nulas', async () => {
    const { editar } = monta({ documento: doc({}) });
    expect((screen.getByTestId('doc-serie') as HTMLInputElement).value).toBe('1');
    fireEvent.click(tipo('Boleto'));
    salvar();
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    expect(editar.mock.calls[0][2]).toMatchObject({ especie: 'boleto', numero: '31776', serie: null, chaveAcesso: null, emitenteId: 'pan' });
  });
  it('ir e voltar preserva o que foi digitado na série', () => {
    monta();
    fireEvent.change(screen.getByTestId('doc-serie'), { target: { value: '7' } });
    fireEvent.click(tipo('Recibo')); fireEvent.click(tipo('Nota fiscal'));
    expect((screen.getByTestId('doc-serie') as HTMLInputElement).value).toBe('7');
  });
});

describe('Comprovante: sem emitente, e a data sugerida é a do PAGAMENTO', () => {
  it('payload sem emitente (nulo nos três) e com a data de pagamento do lançamento; a faixa diz "data do pagamento"', async () => {
    const { registrar } = monta({ sugestao: SUGESTAO });
    expect(screen.getByTestId('sugestao-do-lancamento').textContent).toContain('número, emissão, valor, emitente');
    fireEvent.click(tipo('Comprovante'));
    expect(screen.getByTestId('sugestao-do-lancamento').textContent).toContain('número, data do pagamento, valor)');
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({
      especie: 'comprovante', dataEmissao: '2026-10-05', valorDocumento: 852.65,
      emitenteId: null, emitenteNome: null, emitenteDocumento: null, serie: null, chaveAcesso: null,
    });
  });
  it('voltar para NF devolve a data sugerida de NF; sem pagamento no lançamento, o comprovante fica com a de sempre', async () => {
    const a = monta({ sugestao: SUGESTAO });
    fireEvent.click(tipo('Comprovante')); fireEvent.click(tipo('Nota fiscal'));
    salvar();
    await waitFor(() => expect(a.registrar).toHaveBeenCalledTimes(1));
    expect(a.registrar.mock.calls[0][0]).toMatchObject({ especie: 'nf', dataEmissao: '2026-08-18', emitenteId: 'pan' });
  });
  it('sem data de pagamento no lançamento: a data do comprovante fica VAZIA (competência não é data de comprovante); o valor continua', async () => {
    const { registrar } = monta({ sugestao: { ...SUGESTAO, dataPagamento: null } });
    fireEvent.click(tipo('Comprovante'));
    expect(screen.getByTestId('sugestao-do-lancamento').textContent).toContain('(número, valor)');
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ especie: 'comprovante', dataEmissao: null, valorDocumento: 852.65 });
  });
});

describe('emitente com busca — o DONO do seletor de fornecedor (FORN-SELETOR-PADRAO-01 fatia 2a)', () => {
  const campo = () => within(screen.getByTestId('doc-emitente')).getByRole('combobox');
  const abrir = () => fireEvent.click(campo());
  const nomesNaLista = () => screen.queryAllByTestId('favorecido-opcao').map(o => o.querySelector('span')?.textContent);
  const buscar = (q: string) => fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { target: { value: q } });
  it('abre com os fornecedores e "Outro (informar…)" como ação fixa no pé da lista; digitar filtra', () => {
    monta();
    expect(campo().textContent).toBe('Selecione');
    abrir();
    expect(nomesNaLista()).toEqual(FORNECEDORES.map(f => f.nome));
    const outro = screen.getByTestId('favorecido-acao-final');
    expect(outro.textContent).toBe('Outro (informar nome e CNPJ/CPF)');
    expect(screen.getByTestId('favorecido-lista').contains(outro)).toBe(false);   /* fora da rolagem */
    buscar('pant');
    expect(nomesNaLista()).toEqual(['Comercial Pantanal de Rio Verde Ltda']);
    expect(screen.getByTestId('favorecido-acao-final')).toBeInTheDocument();      /* a ação fica mesmo com a busca */
  });
  it('escolher um fornecedor grava emitenteId e o nome', async () => {
    const { registrar } = monta();
    abrir();
    buscar('cleo');
    fireEvent.click(screen.getByText('Cleodir Supermercados Eireli-EPP'));
    expect(campo().textContent).toBe('Cleodir Supermercados Eireli-EPP');
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ emitenteId: 'cle', emitenteNome: 'Cleodir Supermercados Eireli-EPP', emitenteDocumento: null });
  });
  it('"Outro" abre Nome e CNPJ/CPF, o campo diz "Outro (…)", e grava os dois, sem emitenteId', async () => {
    const { registrar } = monta({ sugestao: SUGESTAO });
    expect(screen.queryByTestId('doc-emitente-nome')).toBeNull();
    abrir();
    fireEvent.click(screen.getByTestId('favorecido-acao-final'));
    expect(campo().textContent).toBe('Outro (informar nome e CNPJ/CPF)');
    fireEvent.change(screen.getByTestId('doc-emitente-nome'), { target: { value: 'Borracharia do Zé' } });
    fireEvent.change(screen.getByTestId('doc-emitente-documento'), { target: { value: '123.456.789-00' } });
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ emitenteId: null, emitenteNome: 'Borracharia do Zé', emitenteDocumento: '123.456.789-00' });
  });
  it('emitente sugerido pelo lançamento: nome no campo, marcado em âmbar', () => {
    monta({ sugestao: SUGESTAO });
    expect(campo().textContent).toBe('Comercial Pantanal de Rio Verde Ltda');
    expect(campo().className).toContain('bg-amber-50');
    expect(campo().className).toContain('border-amber-300');
  });
  it('o campo é opcional: "— nenhum —" esvazia o emitente', async () => {
    const { registrar } = monta({ sugestao: SUGESTAO });
    abrir();
    fireEvent.click(screen.getByText('— nenhum —'));
    expect(campo().textContent).toBe('Selecione');
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ emitenteId: null, emitenteNome: null });
  });
});

describe('documento da OPERAÇÃO: espécie travada e valor que não é campo, como antes', () => {
  const DA_OC = doc({ origem: 'operacao', operacaoId: 'op1', especie: 'outro', especieOC: 'recibo', serie: '9', chaveAcesso: 'ch-oc' });
  it('os segmentos ficam desligados, a nota diz onde se troca, e o valor "vem dos componentes"', () => {
    monta({ documento: DA_OC });
    for (const e of ESPECIES_LANC_DOC) expect(tipo(e.label)).toBeDisabled();
    expect(screen.getByTestId('especie-da-oc').textContent).toContain('se troca na aba da OC');
    expect(within(screen.getByTestId('doc-valor-da-oc')).getByText('Vem dos componentes, na aba Documentos da operação.')).toBeInTheDocument();
    fireEvent.click(tipo('Nota fiscal'));
    expect(screen.queryByTestId('doc-serie')).toBeNull();                 // o clique não troca nada
  });
  it('salvar não manda espécie nem valor, e PRESERVA a série e a chave que esta tela não mostra', async () => {
    const { editar } = monta({ documento: DA_OC });
    salvar();
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    const p = editar.mock.calls[0][2];
    expect(p.especie).toBeUndefined();
    expect(p.valorDocumento).toBeUndefined();
    expect(p).toMatchObject({ serie: '9', chaveAcesso: 'ch-oc' });
  });
});

describe('a área de arquivo', () => {
  it('vazia convida a clicar ou arrastar; com arquivo mostra o nome e "remover"; o seletor aceita os tipos da regra', () => {
    monta();
    const area = screen.getByTestId('area-arquivo');
    /* UI-ARRASTAR-ARQUIVO-01a — o convite é o do sistema, numa linha: clicar OU arrastar, com os tipos e o limite */
    expect(area.textContent).toBe('Clique ou arraste o arquivo · PDF, imagem ou XML · até 10 MB');
    for (const c of ['border-dashed', 'border-success', 'bg-success/10']) expect(area.className).toContain(c);
    const input = screen.getByTestId('doc-arquivo') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('application/pdf,image/jpeg,image/png,application/xml,text/xml,.pdf,.jpg,.jpeg,.png,.xml');
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'NFe 31776 Comercial Pantanal.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByTestId('arquivo-escolhido').textContent).toBe('NFe 31776 Comercial Pantanal.pdf');
    fireEvent.click(within(area).getByText('remover'));
    expect(screen.queryByTestId('arquivo-escolhido')).toBeNull();
    expect(area.textContent).toBe('Clique ou arraste o arquivo · PDF, imagem ou XML · até 10 MB');
    /* a ajuda vem da REGRA: cita XML, que a aba aceita */
    expect(screen.getByText(/PDF, JPG, PNG ou XML, até 10 MB\. Pode ficar para depois/)).toBeInTheDocument();
  });
  it('documento que já tem arquivo: "arquivo anexado · substituir"; sem arquivo, o convite', () => {
    monta({ documento: doc({}) });
    expect(screen.getByTestId('area-arquivo').textContent).toBe('arquivo anexado · substituir');
  });
});

describe('a sugestão também no lançamento JÁ SALVO (a aba Documentos entrega a do modal)', () => {
  function montaAba(sugestao: SugestaoDocumento | undefined, documentos: LancDocumento[] = []) {
    const registrar = vi.fn(async (_p: LancDocPayload) => ({ id: 'novo', origem: 'lancamento' as const, operacaoId: null }));
    const api: LancamentoDocumentosApi = {
      documentos, confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
      registrar, editar: vi.fn().mockResolvedValue(true), cancelar: vi.fn().mockResolvedValue(true),
      anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
    };
    render(<MemoryRouter><AbaDocumentosLancamento api={api} clienteId="cli" sugestao={sugestao} /></MemoryRouter>);
    return { registrar };
  }
  it('lançamento realizado → Novo documento → Comprovante: data de pagamento e valor do lançamento, com a faixa âmbar', async () => {
    const { registrar } = montaAba(SUGESTAO);
    fireEvent.click(screen.getByText('Adicionar documento'));
    fireEvent.click(tipo('Comprovante'));
    expect(screen.getByTestId('sugestao-do-lancamento').textContent).toContain('data do pagamento, valor');
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ especie: 'comprovante', dataEmissao: '2026-10-05', valorDocumento: 852.65 });
  });
  it('lançamento sem pagamento → Comprovante com a data vazia', async () => {
    const { registrar } = montaAba({ ...SUGESTAO, dataPagamento: null });
    fireEvent.click(screen.getByText('Adicionar documento'));
    fireEvent.click(tipo('Comprovante'));
    salvar();
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0][0]).toMatchObject({ especie: 'comprovante', dataEmissao: null, valorDocumento: 852.65 });
  });
  it('EDITAR um documento existente nunca recebe a sugestão', () => {
    montaAba(SUGESTAO, [doc({ numero: '999', valorDocumento: 10, emitenteId: 'agn', emitenteNome: 'Agnaldo da Cruz Cunegundes' })]);
    fireEvent.click(screen.getByLabelText('Editar documento'));
    expect(screen.queryByTestId('sugestao-do-lancamento')).toBeNull();
    expect((screen.getByTestId('doc-numero') as HTMLInputElement).value).toBe('999');
  });
});

describe('emitente: só fornecedores ATIVOS, mais o já gravado no documento em edição', () => {
  const COM_INATIVOS = [
    { id: 'pan', nome: 'Comercial Pantanal de Rio Verde Ltda', ativo: true },
    { id: 'pan-velho', nome: 'Comercial Pantanal Rio Verde', ativo: false },
    { id: 'pec', nome: 'Pec.3M-Comercial Pantanal', ativo: false },
    { id: 'agn', nome: 'Agnaldo da Cruz Cunegundes' },                        // sem a chave = ativo
  ];
  function montaCom(documento: LancDocumento | null) {
    const api: LancamentoDocumentosApi = {
      documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
      registrar: vi.fn(), editar: vi.fn().mockResolvedValue(true), cancelar: vi.fn().mockResolvedValue(true),
      anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
    };
    render(<FormDocumento api={api} documento={documento} clienteId="cli" onFechar={() => {}} />);
  }
  const itensDaBusca = (texto: string) => {
    fireEvent.click(within(screen.getByTestId('doc-emitente')).getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { target: { value: texto } });
    return screen.queryAllByTestId('favorecido-opcao').map(o => o.querySelector('span')?.textContent);
  };
  it('inativo não aparece na busca: "pant" traz só o ativo (eram quatro cadastros do mesmo fornecedor)', () => {
    definirFornecedoresDoLeitor(COM_INATIVOS);
    montaCom(null);
    expect(COM_INATIVOS.filter(f => /pant/i.test(f.nome))).toHaveLength(3);   /* a base tem três "pant": a busca sabe achar */
    expect(itensDaBusca('pant')).toEqual(['Comercial Pantanal de Rio Verde Ltda']);
  });
  it('documento com emitente INATIVO abre mostrando o nome com a marca "inativo" — e ele NÃO entra na lista (regra do dono)', () => {
    definirFornecedoresDoLeitor(COM_INATIVOS);
    montaCom(doc({ emitenteId: 'pec', emitenteNome: 'Pec.3M-Comercial Pantanal' }));
    const campo = within(screen.getByTestId('doc-emitente')).getByRole('combobox');
    expect(campo.textContent).toBe('Pec.3M-Comercial Pantanalinativo');
    expect(within(campo).getByTestId('favorecido-inativo').textContent).toBe('inativo');
    expect(itensDaBusca('pant')).toEqual(['Comercial Pantanal de Rio Verde Ltda']);
  });
  it('salvar o documento com o emitente inativo, sem mexer nele, mantém id e nome', async () => {
    definirFornecedoresDoLeitor(COM_INATIVOS);
    const editar = vi.fn().mockResolvedValue(true);
    const api: LancamentoDocumentosApi = {
      documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
      registrar: vi.fn(), editar, cancelar: vi.fn().mockResolvedValue(true), anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
    };
    render(<FormDocumento api={api} documento={doc({ emitenteId: 'pec', emitenteNome: 'Pec.3M-Comercial Pantanal' })} clienteId="cli" onFechar={() => {}} />);
    salvar();
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    expect(editar.mock.calls[0][2]).toMatchObject({ emitenteId: 'pec', emitenteNome: 'Pec.3M-Comercial Pantanal' });
  });
});
