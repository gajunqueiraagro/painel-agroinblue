/**
 * FIN-VALOR-CALC-01a — a conta DIRETO no campo Valor do lançamento (estilo Xero/QuickBooks): "16.238,00/2" + Enter = 8.119,00.
 *
 * ⚠ O `LancamentoV2Dialog` É MONTADO DE VERDADE; só as bordas são falsas (banco, cliente, modais filhos). O que se prova é
 *   o que o campo MOSTRA, o que o modal manda GRAVAR, e que SEM operador nada mudou (foto do modal igual à do commit publicado).
 * ⚠ GUARDA-SE SÓ O RESULTADO (decisão do Gabriel, 05/10/2026): a conta não vai para a observação nem para lugar nenhum.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

const banco = vi.hoisted(() => ({
  rpc: vi.fn(async (..._a: unknown[]) => ({ data: null as unknown, error: null as unknown })),
}));
vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains', 'update']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => vazio(),
      rpc: (...a: unknown[]) => banco.rpc(...a),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), upload: async () => ({ data: {}, error: null }), remove: async () => ({ error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/lib/financeiro/nfeConsultas', () => ({
  iePorFazenda: async () => ({}), fornecedorPeloNome: async () => null, notaJaRegistrada: async () => [],
  ultimaClassificacaoDoFornecedor: async () => null, gravarDocumentoNoCadastro: async () => null,
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { CampoValorComConta } from './CampoValorComConta';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { proporLancamento, type UltimaClassificacao } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { arquivoXmlDaNota, prefillDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { montarNFe, utf8 } from '@/lib/financeiro/nfe/__fixtures__/notas';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }, { id: 'f-exp', nome: 'Faz. Sto. Expedito' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'bb', nome_conta: 'Banco do Brasil', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco do Brasil', agencia: null, numero_conta: null, conta_digito: null }];
const AGRO = { id: 'agro', nome: 'Agropecuaria Exemplo', cpf_cnpj: '11.222.333/0001-81', fazenda_id: null, ativo: true, tipo_recebimento: null } as FornecedorV2;
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', grupo_custo: 'Nutrição', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
const ULTIMA: UltimaClassificacao = { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' };
const FAZ_IE = [{ id: 'f-pur', nome: 'Faz. Pureza', ie: '28.987.654-3' }, { id: 'f-exp', nome: 'Faz. Sto. Expedito', ie: null }];

/** Nota sintética à vista de 16.238,00 (as fixtures do 01a) — o jeito mais curto de ter um lançamento SALVÁVEL no teste. */
function doXml(): DoXml {
  const bytes = utf8(montarNFe({ duplicatas: null }));
  const lido = lerNFe(bytes);
  if (lido.ok === false) throw new Error(lido.motivo);
  const resolucao = resolverEmitente(lido.nota.emitente, [AGRO], null);
  const p = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: FAZ_IE, emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: ULTIMA });
  if (p.ok === false) throw new Error(p.frase);
  return { proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, resolucao, ocorrencias: [], arquivo: arquivoXmlDaNota(bytes, 'NFe-12345.XML') };
}
const prefillSalvavel = () => ({ ...prefillDaNota(doXml()), conta_bancaria_id: 'bb' });
const LANCAMENTO = {
  id: 'lanc-1', cliente_id: 'cli', fazenda_id: 'f-pur', conta_bancaria_id: 'bb', data_competencia: '2026-09-10', data_pagamento: null,
  data_vencimento: '2026-10-10', valor: 1345.5, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'programado',
  descricao: 'Sal mineral', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação',
  subcentro: 'Nutrição Engorda', escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-09', documento: null, historico: null,
  numero_documento: null, favorecido_id: 'agro', conta_destino_id: null, origem_lancamento: 'manual', lote_importacao_id: null,
  forma_pagamento: 'Boleto', dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false,
  created_by: 'u1', created_at: '2026-09-10T12:00:00Z', updated_at: '2026-09-10T12:00:00Z', plano_conta_id: 'pl-nut',
} as unknown as LancamentoV2;

function montar(props: Partial<React.ComponentProps<typeof LancamentoV2Dialog>> = {}) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string): Promise<boolean | string> => 'lanc-novo');
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open onClose={onClose} onSave={onSave} lancamento={null}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={[AGRO]} safras={[]}
        onCriarFornecedor={async () => null} {...props} />
    </MemoryRouter></QueryClientProvider>,
  );
  return { ...r, onSave, onClose };
}
const campo = () => document.querySelector('input[tabindex="10"]') as HTMLInputElement;
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
const assentar = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

beforeEach(() => {
  /* ⚠ RELÓGIO FIXO SÓ NA DATA: o modal novo nasce com a competência de hoje, e a foto não pode mudar com o dia. */
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00') });
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.rpc.mockReset(); banco.rpc.mockImplementation(async () => ({ data: null, error: null }));
});

/* ── PROVA 7 — SEM OPERADOR, NADA MUDOU ───────────────────────────────────────────────────────────────────────────────────
   A foto é o md5 + tamanho do HTML do modal inteiro. Foi gravada no commit publicado (`OBRIG_FOTO=gravar`), ANTES de o campo
   mudar; sem a variável o teste compara. Novo lançamento, edição e o prefill do XML (campo em âmbar). */
const ARQ_FOTOS = resolve(__dirname, 'valorComConta.fotos.json');
const limpar = (html: string) => html.replace(/radix-:r[0-9a-z]+:/g, 'radix-ID').replace(/:r[0-9a-z]+:/g, ':ID:');
async function conferirFoto(nome: string) {
  await assentar();
  const html = limpar(document.body.innerHTML);
  const foto = { md5: createHash('md5').update(Buffer.from(html, 'utf8')).digest('hex'), bytes: Buffer.byteLength(html, 'utf8') };
  const todas: Record<string, { md5: string; bytes: number }> = existsSync(ARQ_FOTOS) ? JSON.parse(readFileSync(ARQ_FOTOS, 'utf8')) : {};
  if (process.env.OBRIG_FOTO === 'gravar') { todas[nome] = foto; writeFileSync(ARQ_FOTOS, JSON.stringify(todas, null, 1)); return; }
  expect(foto.bytes).toBeGreaterThan(5000);
  expect(foto).toEqual(todas[nome]);
}

describe('prova 7 — sem operador, o modal é o do commit publicado', () => {
  it('novo lançamento', async () => {
    montar();
    await waitFor(() => expect(campo().value).toBe('0,00'));
    await conferirFoto('novo');
  });
  it('novo lançamento com valor digitado pela máscara', async () => {
    montar();
    await waitFor(() => expect(campo()).toBeTruthy());
    fireEvent.change(campo(), { target: { value: '1623800' } });
    expect(campo().value).toBe('16.238,00');
    await conferirFoto('novo-com-valor');
  });
  it('edição', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    await conferirFoto('edicao');
  });
  it('prefill do XML (campo em âmbar)', async () => {
    montar({ prefill: prefillSalvavel(), documentosAntesDeSalvar: true });
    await waitFor(() => expect(campo().value).toBe('16.238,00'));
    await conferirFoto('prefill-xml');
  });
});

const dica = () => screen.queryByTestId('valor-conta');
const rotuloDoCampo = () => (campo().parentElement?.querySelector('label')?.textContent ?? '');
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });
const colar = (texto: string) => { fireEvent.paste(campo()); fireEvent.change(campo(), { target: { value: texto } }); };
const tecla = (key: string) => fireEvent.keyDown(campo(), { key });
const resumoValor = () => document.body.textContent ?? '';

describe('prova 2 — digitar o valor, a conta, e Enter', () => {
  it('a máscara fica intacta; "/" e "2" mostram o resultado no rótulo; Enter aplica sem submeter', async () => {
    const m = montar({ prefill: prefillSalvavel(), documentosAntesDeSalvar: true });
    await waitFor(() => expect(campo().value).toBe('16.238,00'));
    digitar('0'); expect(campo().value).toBe('0,00');
    digitar('1623800'); expect(campo().value).toBe('16.238,00');
    expect(dica()).toBeNull();
    /* o operador entra: o valor mascarado é o primeiro operando, e daí em diante o texto é livre */
    digitar('16.238,00/');
    expect(campo().value).toBe('16.238,00/');
    expect(dica()?.textContent).toBe('= …');
    digitar('16.238,00/2');
    expect(campo().value).toBe('16.238,00/2');
    expect(dica()?.textContent).toBe('= 8.119,00');
    expect(dica()?.getAttribute('aria-live')).toBe('polite');
    expect(rotuloDoCampo()).toBe('Valor ·= 8.119,00');
    /* em modo conta dígito é dígito: "25" não vira 0,25 */
    digitar('16.238,00/25');
    expect(campo().value).toBe('16.238,00/25');
    expect(dica()?.textContent).toBe('= 649,52');
    digitar('16.238,00/2');
    tecla('Enter');
    expect(campo().value).toBe('8.119,00');
    expect(dica()).toBeNull();
    expect(rotuloDoCampo()).toContain('Valor (R$) *');
    /* Enter não gravou nem fechou nada */
    await assentar();
    expect(m.onSave).not.toHaveBeenCalled();
    expect(m.onClose).not.toHaveBeenCalled();
    expect(banco.rpc.mock.calls.filter((c) => c[0] === 'fn_parcelamento_cadastrar')).toEqual([]);
  });

  it('operador digitado com o campo todo selecionado (chega só "/"): o valor que estava é o primeiro operando', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('/');
    expect(campo().value).toBe('1.345,50/');
    digitar('1.345,50/2');
    expect(dica()?.textContent).toBe('= 672,75');
  });

  it('"x", "%" e parênteses entram em conta; o "-" só depois de um operando', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('1.345,50x'); expect(dica()?.textContent).toBe('= …');
    digitar('1.345,50x50%'); expect(dica()?.textContent).toBe('= 672,75');
    tecla('Escape');
    digitar('1.345,50-'); expect(campo().value).toBe('1.345,50-'); expect(dica()?.textContent).toBe('= …');
    digitar('1.345,50-10%'); expect(dica()?.textContent).toBe('= 1.210,95');
    tecla('Enter');
    expect(campo().value).toBe('1.210,95');
  });

  it('Enter com conta que não vale: não aplica, a conta fica aberta com a frase', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('1.345,50/0');
    expect(dica()?.textContent).toBe('divisão por zero');
    expect(dica()?.getAttribute('data-erro')).toBe('sim');
    tecla('Enter');
    expect(campo().value).toBe('1.345,50/0');
    digitar('1.345,50)'); expect(dica()?.textContent).toBe('conta inválida');
    digitar('5-10'); expect(dica()?.textContent).toBe('resultado negativo');
    digitar('999.999.999,99+1'); expect(dica()?.textContent).toBe('valor grande demais');
  });
});

describe('prova 3 — colar uma conta', () => {
  it('"16238/2" colado entra em modo conta com o resultado; sair do campo aplica', async () => {
    montar();
    await waitFor(() => expect(campo().value).toBe('0,00'));
    colar('16238/2');
    expect(campo().value).toBe('16238/2');
    expect(dica()?.textContent).toBe('= 8.119,00');
    fireEvent.blur(campo());
    expect(campo().value).toBe('8.119,00');
    expect(dica()).toBeNull();
  });
  it('"16.238,00 / 2" e "=1345,50*50%" colados', async () => {
    montar();
    await waitFor(() => expect(campo().value).toBe('0,00'));
    colar('16.238,00 / 2'); expect(dica()?.textContent).toBe('= 8.119,00'); tecla('Escape');
    colar('=1345,50*50%'); expect(dica()?.textContent).toBe('= 672,75');
    tecla('Enter');
    expect(campo().value).toBe('672,75');
  });
  it('colar um número com sinal ("-5") NÃO é conta: segue a máscara de sempre', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    colar('-5');
    expect(dica()).toBeNull();
    expect(campo().value).toBe('0,05');
  });
  it('colar um valor comum segue a máscara de sempre', async () => {
    montar();
    await waitFor(() => expect(campo().value).toBe('0,00'));
    colar('16.238,00');
    expect(dica()).toBeNull();
    expect(campo().value).toBe('16.238,00');
  });
});

describe('prova 4 — Esc cancela; conta inválida ao sair volta ao valor de antes, com a frase', () => {
  it('Esc volta ao valor anterior e NÃO fecha o modal', async () => {
    const m = montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('1.345,50/2');
    expect(dica()?.textContent).toBe('= 672,75');
    tecla('Escape');
    expect(campo().value).toBe('1.345,50');
    expect(dica()).toBeNull();
    await assentar();
    expect(m.onClose).not.toHaveBeenCalled();
    /* e a busca sabe achar: SEM conta aberta, o mesmo Esc fecha o modal */
    tecla('Escape');
    await waitFor(() => expect(m.onClose).toHaveBeenCalledTimes(1));
  });
  it('sair do campo com conta inválida: valor de antes, frase no rótulo até a próxima digitação', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('1.345,50/0');
    fireEvent.blur(campo());
    expect(campo().value).toBe('1.345,50');
    expect(dica()?.textContent).toBe('divisão por zero');
    expect(rotuloDoCampo()).toBe('Valor ·divisão por zero');
    digitar('134551');
    expect(campo().value).toBe('1.345,51');
    expect(dica()).toBeNull();
  });
  it('sair do campo com conta incompleta ("1.345,50/"): não aplica, diz conta inválida', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('1.345,50/');
    fireEvent.blur(campo());
    expect(campo().value).toBe('1.345,50');
    expect(dica()?.textContent).toBe('conta inválida');
  });
  it('apagar a conta inteira devolve o campo à máscara, zerado', async () => {
    montar({ lancamento: LANCAMENTO });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    digitar('1.345,50/2'); digitar('');
    expect(campo().value).toBe('0,00');
    expect(dica()).toBeNull();
  });
});

describe('provas 5 e 6 — o que vai gravar', () => {
  it('durante a conta o modal segue com o valor ANTERIOR; depois de aplicar, o payload leva o resultado', async () => {
    const m = montar({ prefill: prefillSalvavel(), documentosAntesDeSalvar: true });
    await waitFor(() => expect(campo().value).toBe('16.238,00'));
    await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
    digitar('16.238,00/2');
    /* o resumo lateral (que lê `valorNum`) ainda mostra o valor de antes — o texto parcial nunca é o valor do modal */
    expect(resumoValor()).toContain('16.238,00');
    expect(resumoValor()).not.toContain('R$ 8.119,00');
    /* clicar em Salvar: o campo perde o foco ANTES do clique, e o blur aplica */
    fireEvent.blur(campo());
    expect(campo().value).toBe('8.119,00');
    await waitFor(() => expect(resumoValor()).toContain('8.119,00'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({ valor: 8119, tipo_operacao: '2-Saídas', fazenda_id: 'f-pur' });
    /* só o resultado é guardado: a conta não aparece em campo nenhum do payload */
    expect(JSON.stringify(m.onSave.mock.calls[0][0])).not.toContain('/2');
  });
  it('Salvar com conta INVÁLIDA aberta: o blur devolve o valor de antes, e é ele que a tela mostra e grava', async () => {
    const m = montar({ prefill: prefillSalvavel(), documentosAntesDeSalvar: true });
    await waitFor(() => expect(campo().value).toBe('16.238,00'));
    await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
    digitar('16.238,00/0');
    fireEvent.blur(campo());
    expect(campo().value).toBe('16.238,00');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({ valor: 16238 });
  });
  it('sem conta, o payload é o de sempre', async () => {
    const m = montar({ prefill: prefillSalvavel(), documentosAntesDeSalvar: true });
    await waitFor(() => expect(campo().value).toBe('16.238,00'));
    await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({ valor: 16238 });
  });
  it('resultado aplicado sobre campo em âmbar do XML: o âmbar sai, como em qualquer edição', async () => {
    montar({ prefill: prefillSalvavel(), documentosAntesDeSalvar: true });
    await waitFor(() => expect(campo().value).toBe('16.238,00'));
    const classeAmbar = campo().className;
    expect(rotuloDoCampo()).not.toBe('Valor (R$) *');             // o rótulo traz a origem do XML
    digitar('16.238,00/2'); tecla('Enter');
    expect(campo().value).toBe('8.119,00');
    expect(campo().className).not.toBe(classeAmbar);
    expect(rotuloDoCampo()).toBe('Valor (R$) *');
  });
  it('campo desabilitado (valor travado) não entra em modo conta', async () => {
    montar({ lancamento: LANCAMENTO, lockedFields: ['valor'] });
    await waitFor(() => expect(campo().value).toBe('1.345,50'));
    expect(campo().disabled).toBe(true);
    digitar('1.345,50/2');
    expect(dica()).toBeNull();
    expect(campo().value).not.toContain('/');
  });
});

describe('o contrato do campo — o valor do modal só recebe valor MASCARADO', () => {
  /* ⚠ É AQUI QUE SE VÊ `valorNum`: o modal calcula o número a partir do que o campo lhe escreve. Enquanto a conta está aberta
     o campo não escreve NADA; ao aplicar, escreve uma vez, no formato da máscara. Texto parcial nunca sai do campo. */
  function Anfitriao({ espia, inicial = '16.238,00' }: { espia: (v: string) => void; inicial?: string }) {
    const [v, setV] = React.useState(inicial);
    return <div><CampoValorComConta rotulo="Valor (R$) *" valor={v} onValor={(x) => { espia(x); setV(x); }} /></div>;
  }
  const MASCARA = /^\d{1,3}(\.\d{3})*,\d{2}$/;
  it('durante a conta: nenhuma escrita; ao aplicar: uma, mascarada', () => {
    const espia = vi.fn();
    render(<Anfitriao espia={espia} />);
    for (const t of ['16.238,00/', '16.238,00/2', '16.238,00/25', '16.238,00/2']) digitar(t);
    expect(espia).not.toHaveBeenCalled();
    tecla('Enter');
    expect(espia.mock.calls).toEqual([['8.119,00']]);
    /* e a máscara, fora da conta, escreve a cada tecla — sempre mascarado (a busca sabe achar escrita) */
    digitar('811901'); digitar('8119012');
    expect(espia.mock.calls.slice(1)).toEqual([['8.119,01'], ['81.190,12']]);
    for (const [x] of espia.mock.calls) expect(x).toMatch(MASCARA);
  });
  it('Esc e conta inválida no blur: nenhuma escrita', () => {
    const espia = vi.fn();
    render(<Anfitriao espia={espia} />);
    digitar('16.238,00/2'); tecla('Escape');
    digitar('16.238,00/0'); fireEvent.blur(campo());
    expect(espia).not.toHaveBeenCalled();
    expect(campo().value).toBe('16.238,00');
  });
  it('a conta aberta marca o ref que o Esc do diálogo consulta, e o desmarca ao sair', () => {
    const ref = { current: false };
    render(<CampoValorComConta rotulo="Valor" valor="10,00" onValor={() => {}} contaAbertaRef={ref} />);
    digitar('10,00*'); expect(ref.current).toBe(true);
    tecla('Escape'); expect(ref.current).toBe(false);
    digitar('10,00*2'); expect(ref.current).toBe(true);
    tecla('Enter'); expect(ref.current).toBe(false);
    digitar('10,00*'); fireEvent.blur(campo()); expect(ref.current).toBe(false);
  });
});

describe('a fonte — um dono da conta, nenhum atalho de salvar no teclado', () => {
  const ler = (arq: string) => readFileSync(resolve(__dirname, arq), 'utf8');
  it('o campo chama a lib; não há eval nem Function em lugar nenhum', () => {
    const campoFonte = ler('./CampoValorComConta.tsx');
    const lib = ler('../../lib/calculos/contaNoCampo.ts');
    expect(campoFonte).toContain("from '@/lib/calculos/contaNoCampo'");
    for (const f of [campoFonte, lib]) { expect(f).not.toMatch(/\beval\s*\(/); expect(f).not.toMatch(/new\s+Function/); }
    expect(lib).toContain("import { parseMoeda, round2 } from '@/lib/calculos/numeroBR';");
  });
  it('o modal não tem <form> nem tecla que salve: Enter no campo não tem para onde subir', () => {
    const modal = ler('./LancamentoV2Dialog.tsx');
    expect(modal).not.toMatch(/<form[\s>]/);
    expect(modal).not.toContain('onSubmit');
    /* o único Enter tratado no modal é o do nº de parcelas, que só fecha o número */
    expect((modal.match(/key === 'Enter'/g) ?? []).length).toBe(1);
    expect(modal).toContain("onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharNumParcelas(); } }}");
  });
});
