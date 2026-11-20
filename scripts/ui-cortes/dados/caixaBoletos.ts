/**
 * BOLETO D3d — a bancada da CAIXA POR E-MAIL v2 (dado SINTÉTICO: fornecedores inventados, documentos de exemplo, e-mails .invalid).
 * As APIs em memória respondem como as RPCs de verdade (as mesmas chaves) e o leitor falso devolve a leitura pelo NOME do arquivo (o
 * conteúdo do arquivo é o próprio nome). Os casos do mock v2 aprovado 18/11 e o PIOR CASO: remetente, assunto, arquivo, emitente e
 * descrição longos; valor no teto (9.999.999,99); o PDF com 2 boletos antigos; um de cada estado sem arquivo.
 */
import { listaDaCaixa, respostaDeEntrar, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { FRASE_PDF_IMAGEM, type LerArquivoDaCaixa, type LeituraDaCaixa } from '@/hooks/useCaixaDeBoletos';
import { entradaDaLinha, respostaDoEndereco, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import type { ResumoDaNota } from '@/lib/financeiro/boleto/caixaPorEmail';

/** O "hoje" da bancada (o antigo depende dele): a foto não muda com o dia. */
export const HOJE_DA_BANCADA = '2026-11-18';

const lanc = (id: string, descricao: string, valor: number, m: Record<string, unknown> = {}) => ({
  id, descricao, valor, status: 'previsto', cancelado: false, vencimento: '2026-12-10', agendado_para: null, pagamento: null,
  favorecido: 'Fornecedor', favorecido_documento: null, conta: null, conciliado: false, programado_por: null, ...m,
});
interface Caso { linha: string; valor: number; venc: string; benef: string; doc: string | null; banco: Record<string, unknown> }
const L = (c: string) => c.repeat(47).slice(0, 47);
const BOLETOS: Record<string, Caso[]> = {
  'boleto-0031283.pdf': [{ linha: L('1'), valor: 964.67, venc: '2026-12-10', benef: 'Fornecedor A Insumos Ltda', doc: '11222333000181',
    banco: { candidatos: [{ tipo: 'exato', soma: 964.67, lancamentos: [lanc('a1', 'NF 31.283 · parcela 1/1', 964.67)] }] } }],
  'boleto_dez_G.pdf': [{ linha: L('2'), valor: 2150, venc: '2026-12-13', benef: 'Fornecedor G', doc: '22333444000172',
    banco: { candidatos: [{ tipo: 'soma', soma: 2150, lancamentos: [lanc('g1', 'NF 880', 1000), lanc('g2', 'NF 912', 1150)] }] } }],
  'boleto-condominio.pdf': [{ linha: L('3'), valor: 1250, venc: '2026-12-05', benef: 'Fornecedor C Condomínio Rural', doc: '33444555000163',
    banco: { ja_existe: true, id: 'b-c', frase: 'Este boleto já está no sistema desde 02/12/2026.',
      situacao: { lancamentos: [lanc('c1', 'Condomínio · parcela 3/6', 1250, { status: 'agendado', conta: 'Sicredi CC', agendado_para: '2026-12-05', programado_por: { nome: 'Amanda', em: '2026-12-03T12:00:00Z' } })], avisos: [] } } }],
  'boleto_insumos.pdf': [{ linha: L('4'), valor: 2410, venc: '2026-12-20', benef: 'Fornecedor D', doc: null,
    banco: { candidatos: [{ tipo: 'por_nome', soma: 2410, lancamentos: [lanc('d1', 'Fornecedor D · insumos', 2410, { vencimento: '2026-12-18' })] },
      { tipo: 'por_nome', soma: 2410, lancamentos: [lanc('d2', 'Fornecedor D · sementes', 2410, { vencimento: '2026-12-22' })] }] } }],
  'boleto com nome de arquivo muito comprido que não cabe na coluna 2026-12.pdf': [{ linha: L('6'), valor: 9999999.99, venc: '2026-12-31',
    benef: 'Fornecedor B Nutrição Animal e Comércio de Rações do Centro-Oeste Ltda', doc: '55666777000145', banco: { candidatos: [] } }],
  /* "BOLETOS SUBSTITUÍDOS" (sintético): antigos de 2025, um PDF com 2 fichas (D7) */
  'NF721-3, 4.pdf': [
    { linha: L('7'), valor: 3480, venc: '2025-04-04', benef: 'FIDC Exemplo Multicrédito', doc: null, banco: { candidatos: [] } },
    { linha: L('8'), valor: 3480, venc: '2025-05-04', benef: 'FIDC Exemplo Multicrédito', doc: null, banco: { candidatos: [] } },
  ],
  'NF939-2.pdf': [{ linha: L('9'), valor: 2910.4, venc: '2025-04-10', benef: 'FIDC Exemplo Multicrédito', doc: null, banco: { candidatos: [] } }],
};
const CHAVE_4410 = '35261111222333000181550010000044101000044101';
const CHAVE_LONGA = '50261144555666000154550010001220491634157280';
const NOTAS: Record<string, ResumoDaNota> = {
  'nota-4410.xml': { chave: CHAVE_4410, numero: '000004410', emitente: 'Fornecedor A Insumos Ltda', valor: 964.67, vencimento: '2026-12-10' },
  'danfe-4410.pdf': { chave: CHAVE_4410, numero: '000004410', emitente: 'FORNECEDOR A INSUMOS LTDA', valor: 964.67, vencimento: '2026-12-10' },
  'nota-de-emitente-com-nome-bem-comprido-122049.xml': { chave: CHAVE_LONGA, numero: '000122049',
    emitente: 'Fornecedor B Nutrição Animal e Comércio de Rações do Centro-Oeste Ltda', valor: 9999999.99, vencimento: '2026-12-20' },
};
const senhaCerta = '11144';
const PARTES = (c: Caso) => ({ beneficiario: { nome: c.benef, documento: c.doc, confira: c.doc === null }, pagador: { nome: 'Cliente Bancada', documento: '11144477735', confira: false } });
const leituraDe = (cs: Caso[]): LeituraDaCaixa => ({
  k: 'boletos', ...PARTES(cs[0]),
  boletos: cs.map((c) => ({ ok: true, codigo_barras: c.linha.slice(0, 44), linha: c.linha, tipo: 'bancario', banco: '341', valor: c.valor, vencimento: c.venc })),
});

export const LER_CAIXA_BANCADA: LerArquivoDaCaixa = async (bytes, _tipo, senha) => {
  const nome = new TextDecoder().decode(new Uint8Array(bytes)).replace(/^%PDF /, '');
  if (nome === 'Boleto_Unimed.pdf') return senha === senhaCerta ? leituraDe(BOLETOS['boleto-0031283.pdf']) : { k: 'senha', errada: !!senha };
  if (nome === 'boleto-escaneado.pdf') return { k: 'nada', frase: FRASE_PDF_IMAGEM };
  if (NOTAS[nome]) return { k: 'nota', nota: NOTAS[nome] };
  if (BOLETOS[nome]) return leituraDe(BOLETOS[nome]);
  return { k: 'nada', frase: 'Sem linha digitável nem chave de nota.' };
};
const casoDaLinha = (linha: unknown) => Object.values(BOLETOS).flat().find((c) => c.linha === linha);

/* os boletos já GRAVADOS: dois sem lançamento (o grupo "Na caixa, sem lançamento"), um ligado, um ignorado (descartado) */
const gravados = [
  { id: 'g-1', codigo_barras: 'a'.repeat(44), linha_digitavel: L('a'), situacao: 'novo', beneficiario_nome: 'Fornecedor F Serviços Agronômicos', valor: 1840.5, vencimento: '2026-12-20',
    arquivo_nome: 'boleto-fornecedor-f.pdf', criado_em: '2026-11-14T13:00:00Z', situacao_atual: { lancamentos: [] } },
  { id: 'g-2', codigo_barras: 'b'.repeat(44), linha_digitavel: L('b'), situacao: 'sem_par', beneficiario_nome: 'Fornecedor H Energia', valor: 612.3, vencimento: '2026-12-02',
    arquivo_nome: 'energia-dezembro.pdf', criado_em: '2026-11-10T09:00:00Z', situacao_atual: { lancamentos: [], avisos: [{ codigo: 'pagador_de_fora' }] } },
  { id: 'g-3', codigo_barras: 'c'.repeat(44), linha_digitavel: L('c'), situacao: 'ligado', beneficiario_nome: 'Fornecedor B Nutrição Animal', valor: 3866.57, vencimento: '2026-12-10',
    criado_em: '2026-11-08T09:00:00Z', situacao_atual: { lancamentos: [lanc('l1', 'Ração · NF 4.410', 3856.57)] } },
  { id: 'g-4', codigo_barras: 'd'.repeat(44), linha_digitavel: L('d'), situacao: 'descartado', beneficiario_nome: 'Fornecedor I Propaganda e Marketing Rural Ltda', valor: 99.9, vencimento: '2026-11-30',
    arquivo_nome: 'oferta-especial-de-novembro-com-nome-comprido.pdf', criado_em: '2026-11-12T09:00:00Z', situacao_atual: { lancamentos: [] } },
];
const DOS_GRAVADOS: Record<string, Record<string, unknown>> = {
  [L('a')]: { ja_existe: true, id: 'g-1', candidatos: [{ tipo: 'exato', soma: 1840.5, lancamentos: [lanc('f1', 'Assistência agronômica · dezembro', 1840.5, { vencimento: '2026-12-20' })] }] },
  [L('b')]: { ja_existe: true, id: 'g-2', candidatos: [] },
};

export const API_CAIXA_BANCADA: CaixaApi = {
  lista: async () => ({ ok: true, dados: listaDaCaixa({ contadores: { novo: 1, sem_par: 1, ligado: 1, descartado: 1 }, itens: gravados }) }),
  entrar: async (_c, l, simular) => {
    const g = DOS_GRAVADOS[String(l.linha)];
    const c = casoDaLinha(l.linha);
    if (!c && !g) return { ok: true, dados: respostaDeEntrar({ ok: false, recusa: { frase: 'A linha digitável não confere (dígito verificador ou tamanho). Confira os números.' } }) };
    return { ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: false, id: simular ? null : 'novo-id', storage_path: simular ? null : 'cli/boletos/novo-id.pdf', avisos: [], candidatos: [],
      situacao: { lancamentos: [], avisos: [] },
      boleto: { codigo_barras: String(l.linha).slice(0, 44), linha_digitavel: l.linha, tipo: 'bancario', valor: c?.valor ?? null, vencimento: c?.venc ?? null, beneficiario_nome: c?.benef ?? null, situacao: 'novo' },
      ...(c?.banco ?? {}), ...(g ?? {}),
    }) };
  },
  subirArquivo: async () => ({ ok: true, dados: true }),
  documentosDosTitulares: async () => ({ ok: true, dados: ['111.444.777-35', '22.333.444/0001-72'] }),
  marcar: async () => ({ ok: true, dados: true }),
  registrarDocumento: async () => ({ ok: true, dados: 'gravado' }),
};
export const PARCELA_BANCADA: ParcelaApi = {
  entrar: API_CAIXA_BANCADA.entrar, subirArquivo: API_CAIXA_BANCADA.subirArquivo,
  ligar: async () => ({ ok: true, dados: { ok: true } }), boletoDoLancamento: async () => ({ ok: true, dados: null }),
};
/** Os arquivos que o gate solta (o conteúdo é o próprio nome: o leitor da bancada lê por ele). */
export const ARQUIVOS_DA_BANCADA = ['boleto-0031283.pdf', 'boleto_dez_G.pdf', 'Boleto_Unimed.pdf', 'boleto-escaneado.pdf', 'nota-4410.xml'];

/* ── o que chegou por e-mail: 6 e-mails a resolver (um de cada caso), 2 resolvidos, 2 ignorados; o endereço com o slug no teto ── */
const email = (id: string, mensagem: string, m: Record<string, unknown>) => entradaDaLinha({
  id, mensagem_id: `<${mensagem}@exemplo.invalid>`, remetente: 'Cobrança Fornecedor A <cobranca@fornecedor-a.example>', assunto: 'Boleto e nota NF 4.410',
  recebido_em: '2026-11-17T19:27:00Z', tipo: 'pdf', tamanho_bytes: 5487, storage_path: `cli/entrada/${id}`, estado: 'a_ler', ...m,
});
const semArquivo = { tipo: null, tamanho_bytes: null, storage_path: null };
const TODAS = [
  /* 1 · nota XML + DANFE da mesma chave + o boleto exato */
  email('e1', 'm1', { arquivo_nome: 'nota-4410.xml', tipo: 'xml' }),
  email('e2', 'm1', { arquivo_nome: 'danfe-4410.pdf' }),
  email('e3', 'm1', { arquivo_nome: 'boleto-0031283.pdf' }),
  /* 2 · o pior caso: remetente/assunto/arquivo/emitente longos, valor no teto; a nota já lançada */
  email('e4', 'm2', { remetente: 'Financeiro Contas a Receber Fornecedor B <financeiro.contas.a.receber@fornecedor-b-nutricao-animal-centro-oeste.example>',
    assunto: 'Seu boleto de dezembro chegou — Fornecedor B Nutrição Animal e Comércio de Rações do Centro-Oeste Ltda — vencimento 31/12/2026',
    recebido_em: '2026-11-17T20:10:00Z', arquivo_nome: 'boleto com nome de arquivo muito comprido que não cabe na coluna 2026-12.pdf' }),
  email('e5', 'm2', { recebido_em: '2026-11-17T20:10:00Z', arquivo_nome: 'nota-de-emitente-com-nome-bem-comprido-122049.xml', tipo: 'xml' }),
  /* 3 · "boletos substituídos": antigos (um PDF com 2 fichas) e um com soma de 2 */
  email('e6', 'm3', { remetente: 'Natalino Exemplo ADM <adm@exemplo.invalid>', assunto: 'ENC: BOLETOS SUBSTITUÍDOS - CLIENTE BANCADA', recebido_em: '2026-11-17T19:43:00Z', arquivo_nome: 'NF721-3, 4.pdf' }),
  email('e7', 'm3', { remetente: 'Natalino Exemplo ADM <adm@exemplo.invalid>', assunto: 'ENC: BOLETOS SUBSTITUÍDOS - CLIENTE BANCADA', recebido_em: '2026-11-17T19:43:00Z', arquivo_nome: 'NF939-2.pdf' }),
  email('e8', 'm3', { remetente: 'Natalino Exemplo ADM <adm@exemplo.invalid>', assunto: 'ENC: BOLETOS SUBSTITUÍDOS - CLIENTE BANCADA', recebido_em: '2026-11-17T19:43:00Z', arquivo_nome: 'boleto_dez_G.pdf' }),
  /* 4 · senha, escaneado, por nome (2 candidatos), já ligado */
  email('e9', 'm4', { recebido_em: '2026-11-16T22:00:00Z', assunto: 'Boletos de dezembro', arquivo_nome: 'Boleto_Unimed.pdf' }),
  email('e10', 'm4', { recebido_em: '2026-11-16T22:00:00Z', assunto: 'Boletos de dezembro', arquivo_nome: 'boleto-escaneado.pdf' }),
  email('e11', 'm4', { recebido_em: '2026-11-16T22:00:00Z', assunto: 'Boletos de dezembro', arquivo_nome: 'boleto_insumos.pdf' }),
  email('e12', 'm4', { recebido_em: '2026-11-16T22:00:00Z', assunto: 'Boletos de dezembro', arquivo_nome: 'boleto-condominio.pdf' }),
  /* 5 · sem anexo, recusado, a confirmação do Gmail */
  email('e13', 'm5', { ...semArquivo, arquivo_nome: null, estado: 'sem_anexo', motivo: 'chegou sem PDF nem XML', assunto: 'Segue o link do boleto', recebido_em: '2026-11-16T10:00:00Z' }),
  email('e14', 'm6', { ...semArquivo, arquivo_nome: 'planilha.zip', estado: 'recusado', motivo: 'arquivo de 14 MB: acima do limite de 10 MB', recebido_em: '2026-11-16T09:00:00Z' }),
  email('e15', 'm7', { ...semArquivo, arquivo_nome: null, estado: 'confirmacao_gmail', remetente: 'forwarding-noreply@google.com', recebido_em: '2026-11-16T08:00:00Z',
    assunto: '(#123456789) Confirmação de encaminhamento do Gmail - Receber e-mails de cliente@exemplo.invalid' }),
  /* resolvidos */
  email('r1', 'm8', { arquivo_nome: 'nota-3300.xml', tipo: 'xml', estado: 'nota', lancamento_id: 'x1', lido_em: '2026-11-17T21:00:00Z', recebido_em: '2026-11-15T10:00:00Z' }),
  email('r2', 'm8', { arquivo_nome: 'boleto com nome de arquivo bem comprido já resolvido na caixa de entrada 2026-11.pdf', estado: 'boleto', boleto_id: 'g-3',
    lido_em: '2026-11-17T21:00:00Z', recebido_em: '2026-11-15T10:00:00Z' }),
  /* ignorados (um de antes da regra, um com detalhe longo) */
  email('i1', 'm9', { arquivo_nome: '50261104402825000193550010001220481372684150.xml', tipo: 'xml', estado: 'dispensado', ignorado_motivo: 'anterior_a_regra',
    dispensado_em: '2026-11-17T19:35:00Z', recebido_em: '2026-11-17T19:27:00Z' }),
  email('i2', 'm10', { arquivo_nome: 'propaganda.pdf', estado: 'dispensado', ignorado_motivo: 'outro',
    ignorado_detalhe: 'o fornecedor mandou o catálogo inteiro de produtos de dezembro junto com o boleto, que já estava lançado', dispensado_em: '2026-11-17T19:40:00Z' }),
];
const LOCAL_NO_TETO = 'agropecuaria-exemplo-de-nome-bem-comprido-k3m9q2x7wa';
const enderecoDaBancada: string | null = `${LOCAL_NO_TETO}@boletos.agroinblue.com.br`;
const ok = async () => ({ ok: true as const, dados: true as const });
export const API_ENTRADA_BANCADA: EntradaEmailApi = {
  endereco: async () => ({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: enderecoDaBancada, criadoEm: '2026-11-16T19:39:00Z' } }),
  gerar: async (_c, _m, simular) => ({ ok: true, dados: respostaDoEndereco({
    simulado: simular, endereco: simular ? 'agropecuaria-exemplo-de-nome-bem-comprido-…@boletos.agroinblue.com.br' : enderecoDaBancada, antigo: enderecoDaBancada,
  }) }),
  revogar: async (_c, _m, simular) => ({ ok: true, dados: respostaDoEndereco({ simulado: simular, endereco: enderecoDaBancada }) }),
  todas: async () => ({ ok: true, dados: TODAS }),
  /* o conteúdo é o nome do arquivo: o leitor da bancada lê por ele */
  baixar: async (caminho) => ({ ok: true, dados: new Blob([`%PDF ${TODAS.find((p) => p.storagePath === caminho)?.arquivoNome ?? ''}`], { type: 'application/pdf' }) }),
  ignorar: ok, voltar: ok, resolver: ok,
  notasNoSistema: async () => ({ ok: true, dados: {
    [CHAVE_LONGA]: { lancamentoId: 'l-longo', descricao: 'Ração adensada 30 bs lote 70259 do Fornecedor B Nutrição Animal parcela 1/3', valor: 9999999.99, vencimento: '2026-12-20' },
  } }),
};
/** A bancada sem endereço (o "Gerar"). */
export const API_ENTRADA_BANCADA_SEM_ENDERECO: EntradaEmailApi = {
  ...API_ENTRADA_BANCADA,
  endereco: async () => ({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: null, criadoEm: null } }),
};
