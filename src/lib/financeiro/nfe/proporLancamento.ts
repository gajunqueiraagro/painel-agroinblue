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

/** O `tPag` da nota -> a forma de pagamento do SISTEMA (`FORMAS_PAGAMENTO_V2`). Mapa FECHADO: o que nao esta' aqui fica vazio
 *  (cheque 02 e deposito 16 nao tem forma correspondente na lista do sistema). */
export const FORMA_POR_TPAG: Readonly<Record<string, string>> = {
  '01': 'Dinheiro',
  '03': 'Cartão',
  '04': 'Cartão',
  '15': 'Boleto',
  '17': 'PIX',
  '18': 'Transferência',
};

export const FRASE_NOTA_DE_VENDA = 'Nota de venda entra pela Operação Comercial.';
export const FRASE_FAZENDA_NAO_IDENTIFICADA = 'Fazenda não identificada pela inscrição estadual.';
export const FRASE_SEM_DUPLICATAS = 'Nota sem duplicatas. Preencha o vencimento.';
export const FRASE_SEM_PROTOCOLO = 'Nota sem protocolo de autorização.';
export const FRASE_DUPLICATAS_FORA_DO_PADRAO = 'Duplicatas com valor ou data fora do padrão mensal: parcelas livres chegam na próxima etapa. Ajuste o parcelamento ou lance cada parcela.';

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

export interface FazendaComIE { id: string; nome: string; ie: string | null }

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
}

export type CampoDoXml =
  | 'tipo' | 'competencia' | 'fornecedor' | 'valor' | 'subcentro' | 'fazenda' | 'parcelamento' | 'forma' | 'documento' | 'descricao'
  | 'vencimento';

export type ParcelamentoProposto =
  | { tipo: 'unico'; vencimento: string }                       // '' quando a nota nao traz duplicata
  | { tipo: 'parcelado'; parcelas: number; primeiroVencimento: string }
  | { tipo: 'fora_do_padrao' };

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

/** O resumo dos itens na descricao: "NF 178.766 · <primeiros itens> · N itens". */
export function descricaoDaNota(nota: NotaLida): string {
  const nomes = nota.itens.map((i) => i.descricao.trim()).filter(Boolean);
  const partes = [`NF ${numeroFalado(nota.numero)}`];
  if (nomes.length > 0) partes.push(nomes.slice(0, 2).join(', '));
  if (nomes.length > 2) partes.push(`${nomes.length} itens`);
  return partes.join(' · ');
}

/** De que lado da nota o cliente esta', pela inscricao estadual das fazendas dele. */
export function ladoDoCliente(nota: NotaLida, fazendas: readonly FazendaComIE[]): { lado: 'emitente' } | { lado: 'destinatario'; fazenda: FazendaComIE | null } {
  const comIE = fazendas.filter((f) => soDigitos(f.ie) !== '');
  const ieEmit = soDigitos(nota.emitente.ie);
  if (ieEmit && comIE.some((f) => soDigitos(f.ie) === ieEmit)) return { lado: 'emitente' };
  const ieDest = soDigitos(nota.destinatario.ie);
  return { lado: 'destinatario', fazenda: (ieDest && comIE.find((f) => soDigitos(f.ie) === ieDest)) || null };
}

export function proporLancamento(entrada: {
  nota: NotaLida;
  avisosDoLeitor: readonly AvisoNFe[];
  fazendas: readonly FazendaComIE[];
  emitente: ResolucaoEmitente;
  /** O fornecedor que vale (o proposto, ou o que o operador escolheu entre dois). */
  favorecidoId: string | null;
  ultima: UltimaClassificacao | null;
}): ResultadoDaProposta {
  const { nota, avisosDoLeitor, fazendas, emitente, favorecidoId, ultima } = entrada;

  const lado = ladoDoCliente(nota, fazendas);
  if (lado.lado === 'emitente') return { ok: false, frase: FRASE_NOTA_DE_VENDA };

  const avisos: string[] = [];
  const origens: Partial<Record<CampoDoXml, string>> = {
    tipo: 'Saída · do XML',
    competencia: 'emissão',
    documento: 'do XML',
    descricao: 'do XML',
  };

  /* O VALOR: com duplicatas, a soma delas (decisao 5); sem, o da nota. */
  const temDuplicatas = nota.duplicatas.length > 0;
  const valorCent = temDuplicatas ? nota.somaDuplicatasCent : nota.totais.notaCent;
  origens.valor = temDuplicatas && nota.somaDuplicatasCent !== nota.totais.notaCent ? 'soma das duplicatas' : 'do XML';
  if (temDuplicatas && nota.somaDuplicatasCent !== nota.totais.notaCent) {
    avisos.push(`Duplicatas ${reais(nota.somaDuplicatasCent)} · nota ${reais(nota.totais.notaCent)}. Lançamento = ${reais(nota.somaDuplicatasCent)} · diferença ${reais(nota.somaDuplicatasCent - nota.totais.notaCent)}`);
  }

  /* AS PARCELAS. */
  let parcelamento: ParcelamentoProposto;
  if (!temDuplicatas) {
    parcelamento = { tipo: 'unico', vencimento: '' };
    avisos.push(FRASE_SEM_DUPLICATAS);
  } else if (nota.duplicatas.length === 1) {
    parcelamento = { tipo: 'unico', vencimento: nota.duplicatas[0].vencimento };
    origens.vencimento = 'duplicata';
  } else if (duplicatasCabemNoParcelamentoDeHoje(nota.duplicatas)) {
    parcelamento = { tipo: 'parcelado', parcelas: nota.duplicatas.length, primeiroVencimento: nota.duplicatas[0].vencimento };
    origens.parcelamento = `Parcelada · ${nota.duplicatas.length}x · 1º venc. ${dataCurta(nota.duplicatas[0].vencimento)}`;
  } else {
    parcelamento = { tipo: 'fora_do_padrao' };
    avisos.push(FRASE_DUPLICATAS_FORA_DO_PADRAO);
  }

  if (avisosDoLeitor.includes('sem_protocolo')) avisos.push(FRASE_SEM_PROTOCOLO);

  /* A FAZENDA. */
  if (lado.fazenda) origens.fazenda = `IE ${nota.destinatario.ie ?? ''}`;
  else avisos.push(FRASE_FAZENDA_NAO_IDENTIFICADA);

  /* O FORNECEDOR. */
  if (favorecidoId && emitente.achadoPor) origens.fornecedor = emitente.achadoPor === 'documento' ? `pelo ${soDigitos(nota.emitente.documento).length === 11 ? 'CPF' : 'CNPJ'}` : 'pelo nome';

  /* A CLASSIFICACAO: a do ultimo lancamento do fornecedor. */
  if (ultima) origens.subcentro = `último · ${dataCurta(ultima.data)}`;

  /* A FORMA: o primeiro tPag que o mapa conhece. */
  const formaPagamento = nota.pagamentos.map((p) => FORMA_POR_TPAG[p.tPag]).find((f) => !!f) ?? '';
  if (formaPagamento) origens.forma = 'do XML';

  return {
    ok: true,
    proposta: {
      rotuloNota: `NF ${numeroDaNota(nota.numero)}`,
      tipoOperacao: '2-Saídas',
      competencia: nota.emissao,
      favorecidoId,
      fazendaId: lado.fazenda?.id ?? null,
      valorCent,
      classificacao: ultima,
      parcelamento,
      duplicatas: nota.duplicatas,
      formaPagamento,
      numeroDocumento: nota.numero,
      descricao: descricaoDaNota(nota),
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
