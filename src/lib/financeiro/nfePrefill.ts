/**
 * DO XML AO "NOVO LANCAMENTO" — FIN-NFE-XML-01d. O pacote que a lista de notas entrega ao `LancamentoV2Dialog` pelo `prefill`
 * (o MESMO modal de sempre: nao nasce segundo formulario), e o arquivo XML como documento pendente da nota.
 */
import { novoPendente, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';
import type { PropostaDeLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import type { ResolucaoEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import type { OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';

/** O tipo com que o XML sobe ao bucket — decidido pelo CONTEUDO (o `lerNFe` aceitou), nao pelo que o navegador diz do arquivo. */
export const MIME_XML = 'application/xml';

/** O que o modal precisa saber para mostrar de onde cada coisa veio. So' existe no lancamento NOVO que nasce de uma nota. */
export interface DoXml {
  proposta: PropostaDeLancamento;
  emitenteNome: string;
  /** So' digitos. */
  emitenteDocumento: string;
  resolucao: ResolucaoEmitente;
  ocorrencias: OcorrenciaDaNota[];
  arquivo: File;
}

/**
 * O arquivo da nota, pronto para o bucket: nome terminado em `.xml` e tipo `application/xml` EXPLICITOS. O navegador entrega o
 * `.xml` como `text/xml`, `application/xml` ou vazio; aqui isso deixa de importar.
 */
export function arquivoXmlDaNota(bytes: ArrayBuffer, nomeOriginal: string): File {
  const base = nomeOriginal.replace(/\.xml$/i, '').trim() || 'nota';
  return new File([bytes], `${base}.xml`, { type: MIME_XML });
}

/** O documento NF pendente da nota: numero, serie, chave, emissao, valor e emitente do XML, com o proprio XML como arquivo. */
export function pendenteDaNota(d: DoXml, favorecidoId: string | null): DocumentoPendente {
  const doc = d.proposta.documento;
  return novoPendente({
    especie: 'nf',
    nome: `nf ${doc.numero}`,
    numero: doc.numero,
    serie: doc.serie || null,
    chaveAcesso: doc.chaveAcesso,
    dataEmissao: doc.dataEmissao,
    valorDocumento: doc.valorCent / 100,
    emitenteId: favorecidoId,
    emitenteNome: favorecidoId ? null : doc.emitenteNome,
    emitenteDocumento: favorecidoId ? null : doc.emitenteDocumento,
  }, d.arquivo, null);
}

/** As chaves do `prefill` do modal que a nota preenche. Tudo o que a tela mostra e' o que vai ser gravado. */
export function prefillDaNota(d: DoXml) {
  const p = d.proposta;
  const c = p.classificacao;
  return {
    tipo_operacao: p.tipoOperacao,
    /* Conta a pagar: nasce PROGRAMADA, sem data de pagamento (so' realizado tem). */
    status_transacao: 'programado',
    data_competencia: p.competencia,
    data_vencimento: p.parcelamento.tipo === 'parcelado' ? p.parcelamento.primeiroVencimento
      : p.parcelamento.tipo === 'unico' ? p.parcelamento.vencimento : '',
    valor: p.valorCent / 100,
    descricao: p.descricao,
    numero_documento: p.numeroDocumento,
    tipo_documento: 'Nota Fiscal',
    favorecido_id: p.favorecidoId ?? undefined,
    /* Sem fazenda identificada pela IE o campo nasce VAZIO ('' e nao ausente): ausente, o modal herdaria a fazenda do filtro
       da lista, e a nota apareceria numa fazenda que ninguem escolheu. */
    fazenda_id: p.fazendaId ?? '',
    forma_pagamento: p.formaPagamento || undefined,
    ...(c ? {
      plano_conta_id: c.plano_conta_id, subcentro: c.subcentro, macro_custo: c.macro_custo ?? '', grupo_custo: c.grupo_custo ?? '',
      centro_custo: c.centro_custo ?? '', escopo_negocio: c.escopo_negocio ?? '',
    } : {}),
    doXml: d,
  };
}
