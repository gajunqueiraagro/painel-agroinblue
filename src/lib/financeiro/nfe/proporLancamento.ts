/**
 * DA NOTA LIDA AO LANCAMENTO PROPOSTO — FIN-NFE-XML-01d. Um dono, PURO: quem decide o que o "Novo lancamento" mostra quando
 * nasce de um XML e' esta funcao; a tela so' desenha. Nada e' gravado aqui.
 *
 * AS DECISOES DO GABRIEL (05/10/2026) QUE MORAM AQUI:
 *   5. duplicatas somando diferente do valor da nota -> o lancamento vale a SOMA DAS DUPLICATAS, e a diferenca fica escrita;
 *   6. nota sem duplicatas -> lancamento unico com o vencimento VAZIO (nenhuma data e' inventada);
 *   8. nota em que o cliente e' o EMITENTE -> recusa ("Nota de venda entra pela Operação Comercial.");
 *   9. o lado do cliente se decide SO' pela inscricao estadual da fazenda (o cliente nao tem CPF/CNPJ no banco):
 *      IE do destinatario = IE de uma fazenda -> compra, propoe a fazenda; IE do emitente = IE de uma fazenda -> recusa (8);
 *      nenhuma casa -> segue como compra, fazenda vazia, com aviso;
 *  11. competencia = data de emissao;
 *  12. classificacao = a do ULTIMO lancamento vivo classificado do fornecedor (quem a busca e' a tela; aqui so' entra);
 *  13. itens so' como resumo na descricao.
 * PARCELAS: o writer de hoje (`fn_parcelamento_cadastrar`) so' sabe valores iguais e vencimentos mensais; o que nao cabe nele
 * NAO e' parcelado sozinho (`duplicatasCabemNoParcelamentoDeHoje`).
 */
import type { AvisoNFe, DuplicataNFe, NotaLida } from './tipos';
import type { ResolucaoEmitente } from './resolverEmitente';
import { dataCurta, documentoFormatado, numeroDaNota, numeroFalado, reais, soDigitos } from './formatos';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { fraseDaRemessa, fraseDeSemCompra } from './remessaEntregaFutura';

/** O `tPag` da nota -> a forma de pagamento do SISTEMA (`FORMAS_PAGAMENTO_V2`). Mapa FECHADO: o que nao esta' aqui fica vazio
 *  (cheque 02 e deposito 16 nao tem forma correspondente na lista do sistema). */
export const FORMA_POR_TPAG: Readonly<Record<string, string>> = {
  '01': 'Dinheiro',
  /* CARTAO-LANCAMENTO-01 — 03 é cartão de crédito (o valor gravado do cartão); 04 é cartão de DÉBITO, que fica 'Débito' (decisão 1) */
  '03': 'Cartão de crédito',
  '04': 'Débito',
  '15': 'Boleto',
  '17': 'PIX',
  '18': 'Transferência',
};

export const FRASE_NOTA_DE_VENDA = 'Nota de venda entra pela Operação Comercial.';
export const FRASE_FAZENDA_NAO_IDENTIFICADA = 'Fazenda não identificada pela inscrição estadual.';
/** NOTA-FAZENDA-PELA-IE-01 — a origem da fazenda achada pelo nome no endereco do destinatario (sem a IE gravada): o operador confere. */
export const ORIGEM_FAZENDA_PELO_ENDERECO = 'pelo endereço, confira';
/** NOTA-NFSE-LEITURA-02 (D2 a) — a fazenda mais usada nos lancamentos do fornecedor (mesma raiz do CNPJ): o operador confere. */
export const ORIGEM_FAZENDA_PELO_HISTORICO = 'pelo histórico do fornecedor, confira';
/** NOTA-NFSE-LEITURA-02 (12:36) — a fazenda do titular fiscal com o CPF/CNPJ do tomador (uma só, vigente na data da nota). */
export const ORIGEM_FAZENDA_PELO_TOMADOR = 'pelo tomador da nota';
/** O tomador é titular em mais de uma fazenda: ninguém escolhe por ele. */
export const fraseTomadorEmVarias = (n: number) => `O tomador da nota é titular em ${n} fazendas: escolha a fazenda.`;
export const FRASE_SEM_DUPLICATAS = 'Nota sem duplicatas. Preencha o vencimento.';
export const FRASE_SEM_PROTOCOLO = 'Nota sem protocolo de autorização.';
/** NOTA-NFSE-LEITURA-02 (Gabriel 08/11) — o aviso que pede um campo SOME quando o campo foi preenchido: a lista da proposta e' calculada
 *  na abertura; a tela passa o estado de agora. */
export function avisosQueValem(avisos: readonly string[], preenchido: { fazenda: boolean; vencimento: boolean }): string[] {
  return avisos.filter((a) => !(a === FRASE_FAZENDA_NAO_IDENTIFICADA && preenchido.fazenda) && !(a === FRASE_SEM_DUPLICATAS && preenchido.vencimento));
}
/** NFSE-MUNICIPAL-01 — a NFS-e da prefeitura sem o Identificador Nacional: nada confere o lido. */
export const FRASE_SEM_CHAVE = 'NFS-e sem chave para conferir: confira os campos lidos.';
/** NFSE-MUNICIPAL-01 — as parcelas calculadas pela condição escrita na nota (não impressas como duplicatas). */
export const fraseDasCondicoes = (dias: readonly number[]) => `Vencimentos pela condição de pagamento da nota (${dias.join('/')} dias da emissão): confira.`;
/** PARC-LIVRES-01 — duplicatas com valor ou data próprios entram como PARCELAS LIVRES, como estão na nota (o recado da grade). */
export const fraseParcelasComoNaNota = (n: number) => `A nota trouxe ${n} parcelas com valores ou datas próprias: entram como estão na nota.`;

/** `iso` + n meses, com o dia preso ao fim do mes — o que o `make_interval(months => n)` do banco faz. */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const fimDoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(Math.min(d, fimDoMes)).padStart(2, '0')}`;
}

/**
 * As duplicatas da nota sao EXATAMENTE o que o parcelamento de hoje geraria? N entre 2 e 24; cada valor = round(total/N, 2) com
 * a ultima absorvendo a sobra; cada vencimento = o primeiro + (i-1) meses. Espelho de `fn_parcelamento_cadastrar` — em centavos.
 */
export function duplicatasCabemNoParcelamentoDeHoje(duplicatas: readonly DuplicataNFe[]): boolean {
  const n = duplicatas.length;
  if (n < 2 || n > 24) return false;
  if (duplicatas.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) || d.valorCent <= 0)) return false;
  const total = duplicatas.reduce((s, d) => s + d.valorCent, 0);
  /* round(total / n, 2) do numeric: meio para longe do zero — em inteiros, floor((2·total + n) / 2n). */
  const base = Math.floor((2 * total + n) / (2 * n));
  const primeira = duplicatas[0].vencimento;
  return duplicatas.every((d, i) => {
    const valor = i === n - 1 ? total - base * (n - 1) : base;
    return d.valorCent === valor && d.vencimento === somarMeses(primeira, i);
  });
}

export interface FazendaComIE { id: string; nome: string; ie: string | null; /** NOTA-FAZENDA-PELA-IE-01 — os apelidos (`fazendas.aliases`) */ aliases?: readonly string[] | null }

/** A classificacao do ultimo lancamento vivo e classificado do fornecedor. */
export interface UltimaClassificacao {
  plano_conta_id: string;
  subcentro: string;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  escopo_negocio: string | null;
  /** 'YYYY-MM-DD' — a competencia do lancamento de onde veio. */
  data: string;
  /** FIN-NOTA-PDF-01b — a safra e a cultura daquele lancamento (a sugestao de sempre na lavoura); o XML nao as usa. */
  safra_id?: string | null;
  cultura?: string | null;
}

export type CampoDoXml =
  | 'tipo' | 'competencia' | 'fornecedor' | 'valor' | 'subcentro' | 'fazenda' | 'parcelamento' | 'forma' | 'documento' | 'descricao'
  | 'vencimento';

export type ParcelamentoProposto =
  | { tipo: 'unico'; vencimento: string }                       // '' quando a nota nao traz duplicata
  | { tipo: 'parcelado'; parcelas: number; primeiroVencimento: string }
  | { tipo: 'livres'; parcelas: number };                       // PARC-LIVRES-01: valores ou datas proprios, como na nota

export interface PropostaDeLancamento {
  rotuloNota: string;                 // "NF 000.178.766"
  tipoOperacao: '2-Saídas';
  competencia: string;
  favorecidoId: string | null;
  fazendaId: string | null;
  valorCent: number;
  classificacao: UltimaClassificacao | null;
  parcelamento: ParcelamentoProposto;
  duplicatas: DuplicataNFe[];
  formaPagamento: string;             // '' quando o tPag nao mapeia
  numeroDocumento: string;
  descricao: string;
  /** NOTA-NFSE-LEITURA-02 — o que o campo Descrição traz ao abrir: '' na NF-e (30/10); a curta do serviço na NFS-e (D1 a, 08/11). */
  descricaoInicial: string;
  /** O documento NF que nasce junto (o XML e' o arquivo dele). */
  documento: {
    numero: string; serie: string; chaveAcesso: string; dataEmissao: string; valorCent: number;
    emitenteId: string | null; emitenteNome: string; emitenteDocumento: string;
  };
  /** Campo -> de onde veio, escrito pequeno ao lado do campo em ambar. */
  origens: Partial<Record<CampoDoXml, string>>;
  /** As frases de aviso, prontas, na ordem em que aparecem. */
  avisos: string[];
}

export type ResultadoDaProposta =
  | { ok: true; proposta: PropostaDeLancamento }
  | { ok: false; frase: string };

/** O resumo dos itens na descricao: "<primeiros itens> · N itens".
 *  P133 (Gabriel 27/10/2026): SEM o prefixo "NF 178.766 · " — o numero ja' esta' no documento (coluna Doc.). A caixa alta dos itens vira
 *  primeira maiuscula no banco, pela regra do P118 (`_fn_descricao_caixa`). Nota sem item legivel: o numero, para a descricao nao nascer vazia. */
export function descricaoDaNota(nota: NotaLida): string {
  const nomes = nota.itens.map((i) => i.descricao.trim()).filter(Boolean);
  if (nomes.length === 0) return `NF ${numeroFalado(nota.numero)}`;
  const partes = [nomes.slice(0, 2).join(', ')];
  if (nomes.length > 2) partes.push(`${nomes.length} itens`);
  return partes.join(' · ');
}

/* NOTA-NFSE-LEITURA-02 (Gabriel 08/11, D1 a) — SO' NA NFS-e a descricao nasce curta, tirada do servico (a NF-e segue vazia, 30/10).
   O objeto do servico = as linhas curtas (ate' 3 palavras) que se repetem ou fecham outra linha ("CARREGADEIRA W130", "VAGÃO BRUTALICO");
   o verbo vem do codigo (14.01 / 14.02 = manutencao); sem objeto, a 1a linha que nao e' deslocamento; nada legivel = "Serviço 14.01.01".
   Primeira maiuscula, ate' 60 caracteres sem cortar palavra. O texto inteiro fica no item. */
export const LIMITE_DA_DESCRICAO_CURTA = 60;
const RE_DESLOCAMENTO = /^\d+\s+DESLOCAM/;
const VERBO_DO_CODIGO: Readonly<Record<string, string>> = { '14.01': 'Manutenção', '14.02': 'Assistência técnica' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
/** caixa de frase: tudo minusculo, menos o que tem digito (W130) */
const fraseCurta = (s: string) => s.split(/\s+/).map((p) => (/\d/.test(p) ? p : p.toLowerCase())).join(' ');
function cortarNaPalavra(s: string, max: number): string {
  if (s.length <= max) return s;
  const corte = s.slice(0, max + 1);
  const i = corte.lastIndexOf(' ');
  return (i > 0 ? corte.slice(0, i) : s.slice(0, max)).replace(/[\s,;.\-–]+$/, '');
}
export function descricaoCurtaDoServico(nota: Pick<NotaLida, 'servico' | 'itens'>): string {
  const s = nota.servico;
  if (!s) return '';
  const linhas = (s.linhas?.length ? s.linhas : [nota.itens[0]?.descricao ?? '']).map((l) => l.trim()).filter((l) => l && !RE_DESLOCAMENTO.test(semAcento(l)));
  const chaves = linhas.map(semAcento);
  const objetos: string[] = [];
  linhas.forEach((l, i) => {
    const k = chaves[i];
    if (k.split(/\s+/).length > 3 || objetos.some((o) => semAcento(o) === k)) return;
    const repete = chaves.some((o, j) => j !== i && (o === k || o.endsWith(` ${k}`)));
    if (repete) objetos.push(l);
  });
  const verbo = VERBO_DO_CODIGO[(s.codigoTributacao ?? '').slice(0, 5)] ?? null;
  let texto: string;
  if (objetos.length) texto = [verbo, fraseCurta(objetos.join(' e '))].filter(Boolean).join(' ');
  else if (linhas.length) texto = fraseCurta(linhas[0]);
  else return s.codigoTributacao ? `Serviço ${s.codigoTributacao}` : '';
  texto = cortarNaPalavra(texto, LIMITE_DA_DESCRICAO_CURTA);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** De que lado da nota o cliente esta', pela inscricao estadual das fazendas dele. */
export function ladoDoCliente(nota: NotaLida, fazendas: readonly FazendaComIE[]): { lado: 'emitente' } | { lado: 'destinatario'; fazenda: FazendaComIE | null } {
  const comIE = fazendas.filter((f) => soDigitos(f.ie) !== '');
  const ieEmit = soDigitos(nota.emitente.ie);
  if (ieEmit && comIE.some((f) => soDigitos(f.ie) === ieEmit)) return { lado: 'emitente' };
  const ieDest = soDigitos(nota.destinatario.ie);
  return { lado: 'destinatario', fazenda: (ieDest && comIE.find((f) => soDigitos(f.ie) === ieDest)) || null };
}

/* NOTA-FAZENDA-PELA-IE-01 — o NUCLEO do nome da fazenda: sem acento, "FAZ."/"STO."/"STA." por extenso, sem as palavras genericas e a
   pontuacao ("Faz. Pureza" -> "PUREZA"; "FAZENDA PUREZA, S/N" -> "PUREZA S N"). */
const GENERICAS = new Set(['FAZENDA', 'SITIO', 'ESTANCIA', 'CHACARA', 'GLEBA', 'LOTE', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
function nucleo(s: string): string[] {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/\bFAZ\b\.?/g, 'FAZENDA').replace(/\bSTO\b\.?/g, 'SANTO').replace(/\bSTA\b\.?/g, 'SANTA')
    .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter((p) => p && !GENERICAS.has(p));
}
/** A fazenda cujo nome (ou apelido) esta' no endereco do destinatario — so' quando e' UMA. */
export function fazendaPeloEndereco(endereco: string | null | undefined, fazendas: readonly FazendaComIE[]): FazendaComIE | null {
  const end = ` ${nucleo(endereco ?? '').join(' ')} `;
  if (end.trim() === '') return null;
  const casam = fazendas.filter((f) => [f.nome, ...(f.aliases ?? [])].some((n) => { const k = nucleo(n).join(' '); return k !== '' && end.includes(` ${k} `); }));
  return casam.length === 1 ? casam[0] : null;
}

export function proporLancamento(entrada: {
  nota: NotaLida;
  avisosDoLeitor: readonly AvisoNFe[];
  fazendas: readonly FazendaComIE[];
  emitente: ResolucaoEmitente;
  /** O fornecedor que vale (o proposto, ou o que o operador escolheu entre dois). */
  favorecidoId: string | null;
  ultima: UltimaClassificacao | null;
  /** NOTA-NFSE-LEITURA-02 — a fazenda mais usada do fornecedor (a tela a busca); so' entra sem IE e sem nome no endereco. */
  fazendaDoHistorico?: string | null;
  /** NOTA-NFSE-LEITURA-02 (12:36) — as fazendas do titular com o CPF/CNPJ do tomador (a tela as busca); passa na frente do historico. */
  fazendasDoTomador?: readonly string[];
}): ResultadoDaProposta {
  const { nota, avisosDoLeitor, fazendas, emitente, favorecidoId, ultima } = entrada;

  const lado = ladoDoCliente(nota, fazendas);
  if (lado.lado === 'emitente') return { ok: false, frase: FRASE_NOTA_DE_VENDA };

  const avisos: string[] = [];
  const origens: Partial<Record<CampoDoXml, string>> = {
    tipo: 'Saída · do XML',
    competencia: 'emissão',
    documento: 'do XML',
    descricao: nota.modelo === 'nfse' ? 'do serviço da nota' : 'do XML',
  };

  /* O VALOR: com duplicatas, a soma delas (decisao 5); sem, o da nota. */
  const temDuplicatas = nota.duplicatas.length > 0;
  const valorCent = temDuplicatas ? nota.somaDuplicatasCent : nota.totais.notaCent;
  origens.valor = temDuplicatas && nota.somaDuplicatasCent !== nota.totais.notaCent ? 'soma das duplicatas' : 'do XML';
  if (temDuplicatas && nota.somaDuplicatasCent !== nota.totais.notaCent) {
    avisos.push(`Duplicatas ${reais(nota.somaDuplicatasCent)} · nota ${reais(nota.totais.notaCent)}. Lançamento = ${reais(nota.somaDuplicatasCent)} · diferença ${reais(nota.somaDuplicatasCent - nota.totais.notaCent)}`);
  }

  /* NOTA-PAGTO-PARCELADO-01 P3 — a nota que NÃO É COMPRA (conserto, retorno, demonstração, simples faturamento…): o aviso vai PRIMEIRO
     e a proposta não sugere pagamento (sem duplicatas, sem vencimento, sem forma) */
  const semCompra = fraseDeSemCompra(nota);
  if (semCompra) avisos.unshift(semCompra);

  /* AS PARCELAS. */
  let parcelamento: ParcelamentoProposto;
  if (semCompra) {
    parcelamento = { tipo: 'unico', vencimento: '' };
  } else if (!temDuplicatas) {
    parcelamento = { tipo: 'unico', vencimento: '' };
    avisos.push(FRASE_SEM_DUPLICATAS);
  } else if (nota.duplicatas.length === 1) {
    parcelamento = { tipo: 'unico', vencimento: nota.duplicatas[0].vencimento };
    origens.vencimento = 'duplicata';
  } else if (duplicatasCabemNoParcelamentoDeHoje(nota.duplicatas)) {
    parcelamento = { tipo: 'parcelado', parcelas: nota.duplicatas.length, primeiroVencimento: nota.duplicatas[0].vencimento };
    origens.parcelamento = `Parcelada · ${nota.duplicatas.length}x · 1º venc. ${dataCurta(nota.duplicatas[0].vencimento)}`;
  } else {
    parcelamento = { tipo: 'livres', parcelas: nota.duplicatas.length };
    origens.parcelamento = `Parcelas livres · ${nota.duplicatas.length} · como na nota`;
  }

  if (avisosDoLeitor.includes('sem_protocolo')) avisos.push(FRASE_SEM_PROTOCOLO);
  if (avisosDoLeitor.includes('sem_chave')) avisos.push(FRASE_SEM_CHAVE);
  if (avisosDoLeitor.includes('vencimentos_pelas_condicoes') && nota.servico?.condicoesPagamento?.length) avisos.push(fraseDasCondicoes(nota.servico.condicoesPagamento));
  /* NOTA-NOVA-MODAL-REAL — a remessa de entrega futura avisa no Novo lançamento (o aviso morava só na tela intermediária; âmbar, nunca bloqueio) */
  const remessa = fraseDaRemessa(nota);
  if (remessa) avisos.push(remessa);

  /* A FAZENDA: pela IE do destinatario; sem IE gravada, pelo nome no endereco dele (NOTA-FAZENDA-PELA-IE-01, "confira") */
  const pelaIe = lado.fazenda;
  /* NOTA-NFSE-LEITURA-02 — a ordem: a IE · o TOMADOR (uma fazenda vigente) · o nome no endereco · o historico do fornecedor (dentro das
     fazendas do tomador, quando ele tem varias) */
  const doTomador = fazendas.filter((f) => (entrada.fazendasDoTomador ?? []).includes(f.id));
  const peloTomador = pelaIe || doTomador.length !== 1 ? null : doTomador[0];
  const peloEndereco = pelaIe || peloTomador ? null : fazendaPeloEndereco(nota.destinatario.endereco, fazendas);
  const historico = fazendas.find((f) => f.id === entrada.fazendaDoHistorico) ?? null;
  const peloHistorico = pelaIe || peloTomador || peloEndereco || !historico ? null
    : doTomador.length > 1 && !doTomador.some((f) => f.id === historico.id) ? null : historico;
  if (pelaIe) origens.fazenda = `IE ${nota.destinatario.ie ?? ''}`;
  else if (peloTomador) origens.fazenda = ORIGEM_FAZENDA_PELO_TOMADOR;
  else if (peloEndereco) origens.fazenda = ORIGEM_FAZENDA_PELO_ENDERECO;
  else if (peloHistorico) origens.fazenda = ORIGEM_FAZENDA_PELO_HISTORICO;
  else if (doTomador.length > 1) avisos.push(fraseTomadorEmVarias(doTomador.length));
  else avisos.push(FRASE_FAZENDA_NAO_IDENTIFICADA);

  /* O FORNECEDOR. */
  if (favorecidoId && emitente.achadoPor) origens.fornecedor = emitente.achadoPor === 'documento' ? `pelo ${soDigitos(nota.emitente.documento).length === 11 ? 'CPF' : 'CNPJ'}` : 'pelo nome';

  /* A CLASSIFICACAO: a do ultimo lancamento do fornecedor. */
  if (ultima) origens.subcentro = `último · ${dataCurta(ultima.data)}`;

  /* A FORMA: o primeiro tPag que o mapa conhece. */
  const formaPagamento = semCompra ? '' : nota.pagamentos.map((p) => FORMA_POR_TPAG[p.tPag]).find((f) => !!f) ?? '';
  if (formaPagamento) origens.forma = 'do XML';

  return {
    ok: true,
    proposta: {
      rotuloNota: `NF ${numeroDaNota(nota.numero)}`,
      tipoOperacao: '2-Saídas',
      /* P174: a NFS-e tem competencia propria (o mes do servico); a NF-e segue na emissao */
      competencia: nota.servico?.competencia || nota.emissao,
      favorecidoId,
      fazendaId: lado.fazenda?.id ?? peloTomador?.id ?? peloEndereco?.id ?? peloHistorico?.id ?? null,
      valorCent,
      classificacao: ultima,
      parcelamento,
      duplicatas: semCompra ? [] : nota.duplicatas,
      formaPagamento,
      /* P164 (Gabriel 28/10 15:22) — o nº no lançamento é "000.009.952" (sem "NF": o tipo diz Nota Fiscal); a mesma regra do lote */
      numeroDocumento: formatNFNumber(nota.numero) || nota.numero,
      descricao: descricaoDaNota(nota),
      descricaoInicial: nota.modelo === 'nfse' ? descricaoCurtaDoServico(nota) : '',
      documento: {
        numero: numeroDaNota(nota.numero), serie: nota.serie, chaveAcesso: nota.chave, dataEmissao: nota.emissao,
        valorCent: nota.totais.notaCent, emitenteId: favorecidoId, emitenteNome: nota.emitente.nome,
        emitenteDocumento: documentoFormatado(nota.emitente.documento),
      },
      origens,
      avisos,
    },
  };
}
