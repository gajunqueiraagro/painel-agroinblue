/**
 * NOTA-NFSE-LEITURA-02 (Gabriel 08/11, NF 402 · D1 a · D2 a · D4 a) — a NFS-e nacional inteira: a IM do prestador, o ISSQN e o IBS/CBS
 * (gravados nos campos da NF-e: `nota_fiscal_itens.ibs_cbs` com as chaves do `IBSCBS`, o ISSQN no `totais.servico`, o tomador no
 * `destinatario`); a descricao curta do servico (so' NFS-e); a fazenda pelo historico do fornecedor; os avisos que somem com o campo
 * preenchido; a faixa da filial pelo CNPJ da nota; o formato do campo antes do banco (nunca o toast generico). Dados SINTETICOS
 * (o PDF real fica fora do repo: dado de cliente), com a forma da NF 402.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { danfseSintetico } from './__fixtures__/danfseSintetico';
import { aliquotasDoTexto, ibsCbsDoDanfse, notaDoDanfse } from './danfse';
import { itensDoPdf, lidosDoBanco, payloadDaNotaFiscal } from './itensDaNota';
import {
  FRASE_FAZENDA_NAO_IDENTIFICADA, FRASE_SEM_DUPLICATAS, ORIGEM_FAZENDA_PELO_HISTORICO, ORIGEM_FAZENDA_PELO_TOMADOR, avisosQueValem, fraseTomadorEmVarias, descricaoCurtaDoItem, descricaoCurtaDoServico, proporLancamento,
} from './proporLancamento';
import { resolverEmitente } from './resolverEmitente';
import { fazendaMaisUsada, fazendasVigentes } from '@/lib/financeiro/nfeConsultas';
import { campoDoErroDeFormato, campoEmFormatoInvalido, dataValida } from '@/lib/financeiro/formatoDoLancamento';
import { completarPeloEmitente } from '@/lib/fornecedores/cadastroDoFornecedor';
import { AvisosDoXml, FaixaDoFornecedor } from '@/components/financeiro-v2/LancamentoDoXml';
import { prefillDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import type { NotaLida } from './tipos';

/* a "Descrição do Serviço" da NF 402, linha a linha (serviço · deslocamento · objeto) */
const LINHAS_402 = [
  'DESMONTAGEM E MONTAGEM CUBO E TROCA DOS PARAFUSO RODA VAGÃO BRUTALICO', '02 DESLOCAM,ENTOS', 'VAGÃO BRUTALICO',
  'TROCA MANGUEIRA COMANDO DA CARREGADEIRA WI30', '02 DESLOCAMENTOS', 'CARREGADEIRA W130', 'TROCA BOMBA ALIMENTADORA DA CARREGADEIRA W130',
  '02 DESLOCAMENTOS', 'CARREGADEIRA W130',
];
/* no DANFSe sintético cabem 3 linhas antes do quadro do ISSQN: o leitor lê estas; a regra da curta é provada com as 9 da NF 402 (L2) */
const LINHAS_LIDAS = ['TROCA BOMBA ALIMENTADORA DA CARREGADEIRA W130', '02 DESLOCAMENTOS', 'CARREGADEIRA W130'];
const OPC_402 = { bruto: '2.900,00', issApurado: '71,05', liquido: '2.900,00', ibsCbs: true, descricao: LINHAS_LIDAS, semIe: true };
function lida402(): NotaLida {
  const r = notaDoDanfse(danfseSintetico(OPC_402));
  if (r.ok === false) throw new Error(r.frase);
  return r.nota;
}

describe('L1 — o leitor do DANFSe: IM, ISSQN e IBS/CBS', () => {
  const n = lida402();
  it('a IM do prestador e o quadro do ISSQN inteiro (não retido: o líquido não muda)', () => {
    expect(n.emitente.inscricaoMunicipal).toBe('1234');
    expect(n.servico?.issqn).toEqual({ baseCent: 290000, aliquota: '2.45', apuradoCent: 7105, retido: false });
    expect([n.servico?.liquidoCent, n.totais.notaCent]).toEqual([290000, 290000]);
  });
  it('o IBS/CBS nas chaves do grupo IBSCBS da NF-e (ponto decimal, como no XML)', () => {
    expect(n.servico?.ibsCbs).toEqual({ CST: '000', cClassTrib: '000001', vBC: '2828.95', pIBSUF: '0.10', vIBSUF: '2.83', pIBSMun: '0.00',
      vIBSMun: '0.00', vIBS: '2.83', pCBS: '0.90', vCBS: '25.46' });
  });
  it('as alíquotas do texto; o quadro sem nada = null', () => {
    expect(aliquotasDoTexto('0,10 % / 0,00 %')).toEqual(['0.10', '0.00']);
    expect(aliquotasDoTexto('-')).toEqual([]);
    expect(ibsCbsDoDanfse({ cstClass: '-', base: '-', aliqIbs: '-', ibsUf: '-', ibsMun: '-', ibsTotal: '-', aliqCbs: '-', cbs: '-' })).toBeNull();
  });
  it('a gravação: IBS/CBS no item (ibs_cbs), ISSQN no totais.servico, o tomador no destinatario; volta do banco com o ISSQN', () => {
    const l = itensDoPdf(n);
    const p = payloadDaNotaFiscal(n, l, null);
    expect(p.itens[0].ibs_cbs).toEqual(n.servico?.ibsCbs);
    expect(p.itens[0].codigo).toBe('14.01.01');
    expect(p.nota.totais.servico).toMatchObject({ issqn: { base_cent: 290000, aliquota: '2.45', valor_cent: 7105, retido: false } });
    expect(p.nota).toMatchObject({ destinatario: { documento: '11144477735', nome: 'PRODUTOR SINTETICO DE TESTE', ie: null } });
    const volta = lidosDoBanco({ ...p.nota }, p.itens.map((i) => ({ ...i })));
    expect(volta.lidos.totais.servico?.issqn).toEqual(n.servico?.issqn);
    expect(volta.lidos.itens[0].ibsCbs).toEqual(n.servico?.ibsCbs);
  });
  it('XML não manda o destinatario (o banco o tira do próprio XML)', () => {
    const l = { ...itensDoPdf(n), origem: 'xml' as const };
    expect(payloadDaNotaFiscal(n, l, '<x/>').nota).not.toHaveProperty('destinatario');
  });
});

describe('L2 — a descrição curta (só NFS-e; a NF-e abre vazia, 30/10)', () => {
  const n = lida402();
  it('NF 402: o verbo do código (14.01 = manutenção) e os objetos, sem os deslocamentos', () => {
    expect(n.servico?.linhas).toEqual(LINHAS_LIDAS);
    expect(descricaoCurtaDoServico(n)).toBe('Manutenção carregadeira W130');
    const s = n.servico;
    if (!s) throw new Error('sem servico');
    expect(descricaoCurtaDoServico({ itens: n.itens, servico: { ...s, linhas: LINHAS_402 } })).toBe('Manutenção vagão brutalico e carregadeira W130');
  });
  it('sem objeto repetido: a 1ª linha que não é deslocamento; nada legível: o código', () => {
    const s = n.servico;
    if (!s) throw new Error('sem servico');
    expect(descricaoCurtaDoServico({ itens: n.itens, servico: { ...s, linhas: ['02 DESLOCAMENTOS', 'CONSERTO DA BOMBA DO POCO'] } })).toBe('Conserto da bomba do poco');
    expect(descricaoCurtaDoServico({ itens: [], servico: { ...s, linhas: ['02 DESLOCAMENTOS'] } })).toBe('Serviço 14.01.01');
  });
  it('até 60 caracteres, sem cortar palavra', () => {
    const s = n.servico;
    if (!s) throw new Error('sem servico');
    const longa = descricaoCurtaDoServico({ itens: n.itens, servico: { ...s, codigoTributacao: '07.02.01', linhas: ['REFORMA COMPLETA DO GALPAO DE MAQUINAS COM TROCA DE TELHAS E CALHAS DA COBERTURA'] } });
    expect(longa.length).toBeLessThanOrEqual(60);
    expect(longa).toBe('Reforma completa do galpao de maquinas com troca de telhas e');
  });
  it('a proposta: NFS-e com a curta (origem "do serviço da nota"); NF-e com a do 1o item', () => {
    const ok = proporLancamento({ nota: n, avisosDoLeitor: ['sem_duplicatas'], fazendas: [], emitente: resolverEmitente(n.emitente, [], null), favorecidoId: null, ultima: null });
    if (ok.ok === false) throw new Error(ok.frase);
    expect([ok.proposta.descricaoInicial, ok.proposta.origens.descricao]).toEqual(['Manutenção carregadeira W130', 'do serviço da nota']);
    const nfe = proporLancamento({ nota: { ...n, modelo: '55' }, avisosDoLeitor: [], fazendas: [], emitente: resolverEmitente(n.emitente, [], null), favorecidoId: null, ultima: null });
    if (nfe.ok === false) throw new Error(nfe.frase);
    /* NOTA-PDF-REGRESSAO-01 (12/11): a NF-e abre com a sugerida pelo 1o item (antes, 30/10, vazia) */
    expect(nfe.proposta.descricaoInicial).toBe(descricaoCurtaDoItem(n));
    expect(nfe.proposta.descricaoInicial).not.toBe('');
    /* o modal abre com o que a proposta diz: a curta na NFS-e, a do item na NF-e */
    const d = (proposta: typeof ok.proposta) => ({ proposta, emitenteNome: '', emitenteDocumento: '', resolucao: resolverEmitente(n.emitente, [], null),
      ocorrencias: [], arquivo: new File([''], 'n.pdf') });
    expect([prefillDaNota(d(ok.proposta)).descricao, prefillDaNota(d(nfe.proposta)).descricao]).toEqual(['Manutenção carregadeira W130', descricaoCurtaDoItem(n)]);
  });
});

describe('L3 — a fazenda pelo histórico do fornecedor (D2 a)', () => {
  const n = lida402();
  const FAZ = [{ id: 'pur', nome: 'Faz. Pureza', ie: '280000002' }, { id: 'ret', nome: 'Retiro', ie: null }];
  const propor = (fazendaDoHistorico: string | null, nota: NotaLida = n, fazendasDoTomador: string[] = []) => {
    const r = proporLancamento({ nota, avisosDoLeitor: [], fazendas: FAZ, emitente: resolverEmitente(nota.emitente, [], null), favorecidoId: null, ultima: null,
      fazendaDoHistorico, fazendasDoTomador });
    if (r.ok === false) throw new Error(r.frase);
    return r.proposta;
  };
  it('a mais usada, só quando é uma (empate ou nada = null)', () => {
    expect(fazendaMaisUsada(['pur', 'pur', 'ret', null, 'adm', 'pur'])).toBe('pur');
    expect(fazendaMaisUsada(['pur', 'ret'])).toBeNull();
    expect(fazendaMaisUsada([])).toBeNull();
  });
  it('sem IE e sem nome no endereço: a do histórico, em âmbar "confira", sem o aviso', () => {
    const p = propor('pur');
    expect([p.fazendaId, p.origens.fazenda]).toEqual(['pur', ORIGEM_FAZENDA_PELO_HISTORICO]);
    expect(p.avisos).not.toContain(FRASE_FAZENDA_NAO_IDENTIFICADA);
  });
  it('a IE da nota vence o histórico; histórico fora das fazendas do cliente não entra', () => {
    const comIe = propor('ret', { ...n, destinatario: { ...n.destinatario, ie: '280000002' } });
    expect(comIe.fazendaId).toBe('pur');
    const fora = propor('outra');
    expect([fora.fazendaId, fora.avisos.includes(FRASE_FAZENDA_NAO_IDENTIFICADA)]).toEqual([null, true]);
  });
});

describe('L3b — o tomador passa na frente do histórico (Gabriel 12:36)', () => {
  const n = lida402();
  const FAZ = [{ id: 'pur', nome: 'Faz. Pureza', ie: null }, { id: 'ret', nome: 'Retiro', ie: null }, { id: 'exp', nome: 'Expedito', ie: null }];
  const propor = (fazendaDoHistorico: string | null, fazendasDoTomador: string[]) => {
    const r = proporLancamento({ nota: n, avisosDoLeitor: [], fazendas: FAZ, emitente: resolverEmitente(n.emitente, [], null), favorecidoId: null, ultima: null,
      fazendaDoHistorico, fazendasDoTomador });
    if (r.ok === false) throw new Error(r.frase);
    return r.proposta;
  };
  it('uma fazenda do tomador vence o histórico', () => {
    const p = propor('pur', ['ret']);
    expect([p.fazendaId, p.origens.fazenda]).toEqual(['ret', ORIGEM_FAZENDA_PELO_TOMADOR]);
  });
  it('várias: o histórico só se for uma delas; senão a frase pede escolher', () => {
    expect(propor('pur', ['pur', 'ret']).fazendaId).toBe('pur');
    const p = propor('exp', ['pur', 'ret']);
    expect([p.fazendaId, p.avisos.includes(fraseTomadorEmVarias(2)), p.avisos.includes(FRASE_FAZENDA_NAO_IDENTIFICADA)]).toEqual([null, true, false]);
  });
  it('a participação vale na data da nota (início, fim, sem repetir)', () => {
    expect(fazendasVigentes([
      { fazenda_id: 'pur', vigencia_inicio: '2026-01-01', vigencia_fim: null }, { fazenda_id: 'ret', vigencia_inicio: '2026-11-01', vigencia_fim: null },
      { fazenda_id: 'exp', vigencia_inicio: '2025-01-01', vigencia_fim: '2026-09-30' }, { fazenda_id: 'pur', vigencia_inicio: null, vigencia_fim: null },
    ], '2026-10-06')).toEqual(['pur']);
  });
});

describe('L4 — os avisos que pedem um campo somem quando ele foi preenchido', () => {
  const avisos = [FRASE_SEM_DUPLICATAS, FRASE_FAZENDA_NAO_IDENTIFICADA, 'outro'];
  it('fazenda e vencimento, cada um o seu', () => {
    expect(avisosQueValem(avisos, { fazenda: false, vencimento: false })).toEqual(avisos);
    expect(avisosQueValem(avisos, { fazenda: true, vencimento: false })).toEqual([FRASE_SEM_DUPLICATAS, 'outro']);
    expect(avisosQueValem(avisos, { fazenda: false, vencimento: true })).toEqual([FRASE_FAZENDA_NAO_IDENTIFICADA, 'outro']);
  });
});

describe('L5 — o formato do campo, nunca o toast genérico', () => {
  it('data que não existe e valor que não é número: o campo e a frase', () => {
    expect(dataValida('2026-02-31')).toBe(false);
    expect(dataValida('2026-10-06')).toBe(true);
    expect(campoEmFormatoInvalido({ data_competencia: '2026-10-06', data_vencimento: '2026-1-06' }))
      .toEqual({ campo: 'vencimento', frase: 'Vencimento: data inválida. Use dd/mm/aaaa.' });
    expect(campoEmFormatoInvalido({ data_competencia: '2026-10-06', valor: Number.NaN })).toEqual({ campo: 'valor', frase: 'Valor: número inválido.' });
    expect(campoEmFormatoInvalido({ data_competencia: '2026-10-06', data_vencimento: '', valor: 2900 })).toBeNull();
  });
  it('o 22P02 do banco vira o campo pela coluna citada; o texto do Postgres não aparece', () => {
    const e = { code: '22P02', message: 'invalid input syntax for type uuid: "pur-x"', details: null, hint: null };
    expect(campoDoErroDeFormato(e, { valor: 2900, fazenda_id: 'pur-x' }))
      .toEqual({ campo: 'fazenda', frase: 'Fazenda: formato inválido. Corrija o campo e salve de novo.' });
    expect(campoDoErroDeFormato({ ...e, code: '23505' }, { fazenda_id: 'pur-x' })).toBeNull();
    expect(campoDoErroDeFormato(e, { descricao: 'pur-x' })).toBeNull();
  });
});

describe('L6 — a IM completa o cadastro (só campo vazio)', () => {
  it('vazio recebe; preenchido fica', () => {
    const e = { documento: '11222333000424', nome: 'X', fantasia: null, ie: null, inscricaoMunicipal: '444' };
    expect(completarPeloEmitente({ inscricao_municipal: '' }, e)).toMatchObject({ inscricao_municipal: '444' });
    expect(completarPeloEmitente({ inscricao_municipal: '9' }, e)).not.toHaveProperty('inscricao_municipal');
  });
});

describe('L7 — a faixa da filial começa pelo CNPJ da nota', () => {
  const n = lida402();
  const OUTRA = { id: 'filial-2', nome: 'OFICINA SINTETICA DE TESTE LTDA', cpf_cnpj: '11.222.333/0002-62', ativo: true };
  const resolucao = resolverEmitente(n.emitente, [OUTRA], 'filial-2');
  const xml = { proposta: { avisos: [FRASE_SEM_DUPLICATAS, FRASE_FAZENDA_NAO_IDENTIFICADA], rotuloNota: 'NF 000.000.057' }, emitenteNome: n.emitente.nome,
    emitenteDocumento: n.emitente.documento, emitente: n.emitente, resolucao, ocorrencias: [],
    arquivo: new File(['%PDF'], 'nf.pdf', { type: 'application/pdf' }) } as unknown as DoXml;
  it('"Nota do CNPJ … (cidade/UF) · cadastrado só o 0002-62", Criar e Usar', () => {
    expect(resolucao.filialDiferente).toBe(true);
    const onCriar = vi.fn(); const onEscolher = vi.fn();
    render(<FaixaDoFornecedor xml={xml} fechada={false} onTrocar={() => {}} onEscolher={onEscolher} onCriar={onCriar} criando={false} />);
    expect(screen.getByTestId('xml-outra-filial').textContent).toBe('Nota do CNPJ 11.222.333/0004-24 (CAMPO GRANDE/MS) · cadastrado só o 0002-62');
    fireEvent.click(screen.getByTestId('xml-criar-filial'));
    fireEvent.click(screen.getByTestId('xml-usar-filial'));
    expect([onCriar.mock.calls.length, onEscolher.mock.calls]).toEqual([1, [['filial-2']]]);
    expect(screen.getByTestId('xml-usar-filial').textContent).toBe('Usar o 0002-62');
  });
  it('os avisos na tela seguem o campo: com fazenda e vencimento, nenhum', () => {
    const { rerender } = render(<AvisosDoXml xml={xml} registradaDispensada onDispensarRegistrada={() => {}} onAbrirOcorrencia={() => {}} />);
    expect(screen.getAllByTestId('xml-aviso')).toHaveLength(2);
    rerender(<AvisosDoXml xml={xml} registradaDispensada onDispensarRegistrada={() => {}} onAbrirOcorrencia={() => {}} preenchido={{ fazenda: true, vencimento: true }} />);
    expect(screen.queryAllByTestId('xml-aviso')).toHaveLength(0);
  });
});

describe('L8 — a ligação no modal (lida da fonte)', () => {
  const ler = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  const dialogo = ler('../../../components/financeiro-v2/LancamentoV2Dialog.tsx');
  const tela = ler('../../../pages/FinanceiroV2Tab.tsx');
  const hook = ler('../../../hooks/useFinanceiroV2.ts');
  it('os avisos recebem o estado de agora (fazenda e vencimento)', () => {
    expect(dialogo).toContain('preenchido={{ fazenda: !!fazendaId, vencimento: /^\\d{4}-\\d{2}-\\d{2}$/.test(dataVencimento) }}');
  });
  it('o formato antes do banco e o 22P02 do banco vão ao campo e ao rodapé, sem toast', () => {
    const antes = dialogo.slice(dialogo.indexOf('const formato = campoEmFormatoInvalido('), dialogo.indexOf('setCampoInvalido(null);\n\n    setSaving(true);'));
    expect(antes).toContain('setErroAntesDeSalvar(formato.frase);');
    expect(antes).not.toContain('toast');
    expect(dialogo).toContain("const ok = await onSave(form, currentEditId || undefined, (e) => { setCampoInvalido(e); setErroAntesDeSalvar(e.frase); setAbaAtiva('geral'); });");
    expect(tela).toContain("await hook.criarLancamentoComId(form, { origem: 'manual', onErroDeCampo })");
    expect(tela).toContain('await hook.editarLancamento(id, form, { onErroDeCampo })');
    expect(hook).toContain('const doCampo = opts?.onErroDeCampo ? campoDoErroDeFormato(error, row) : null;');
    expect(hook).toContain('const doCampo = opts?.onErroDeCampo ? campoDoErroDeFormato(error, updatePayload) : null;');
  });
  it('a descrição da NFS-e em âmbar enquanto é a da nota', () => {
    expect(dialogo).toContain("case 'descricao': return !!p.descricaoInicial && descricao === p.descricaoInicial;");
  });
});
