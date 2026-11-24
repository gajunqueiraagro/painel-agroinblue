/**
 * O LEITOR DE NF-e — FIN-NFE-XML-01a. UM dono: toda tela que precisa do XML de uma nota chama `lerNFe`; nenhuma le' XML por
 * conta propria.
 *
 * FUNCAO PURA: recebe os BYTES do arquivo e devolve a nota lida (com avisos) ou a recusa (com motivo e frase). Sem rede, sem
 * banco, sem React, sem log — o XML traz CPF, endereco e IE de produtor, e nada dele e' escrito em lugar nenhum.
 *
 * ⚠ BYTES, NUNCA `File.text()`: quem decide o charset e' o `<?xml encoding="…"?>` do proprio arquivo
 *   (`decodificarPeloCharsetDeclarado`, a MESMA regra do extrato). NF-e de emissor antigo vem em ISO-8859-1.
 * ⚠ LE POR `localName`: os elementos moram no namespace `http://www.portalfiscal.inf.br/nfe`, com ou sem prefixo. Nome
 *   qualificado (`tagName`) quebraria no arquivo que usa prefixo.
 * ⚠ O `DOMParser` NAO LANCA: XML quebrado vira um documento com `parsererror`. Checado.
 * ⚠ TAG DESCONHECIDA E' IGNORADA: a nota de 2026 traz os grupos da reforma tributaria (`det/imposto/IBSCBS`,
 *   `total/IBSCBSTot`, `total/vNFTot`); o leitor so' busca o que conhece, pelo caminho, e nao depende deles.
 * ⚠ ASSINATURA NAO E' VALIDADA. O protocolo (`cStat`) e' o que diz se a nota vale.
 */
import { decodificarPeloCharsetDeclarado } from '@/lib/financeiro/parser/decodificarExtrato';
import { centavosDoTexto, somarCentavos } from './centavos';
import { semCodigoDoEmissor } from './nomeDoEmitente';
import {
  CSTAT_CANCELADA_OU_DENEGADA, LIMITE_BYTES_NFE, fraseDaRecusa,
  type AvisoNFe, type CampoObrigatorioNFe, type DuplicataNFe, type FinalidadeNota, type MotivoRecusa, type NotaLida,
  type ResultadoNFe,
} from './tipos';

const RAIZES_CTE: readonly string[] = ['cteProc', 'CTe', 'enviCTe', 'cteOSProc', 'CTeOS'];
const RAIZES_EVENTO: readonly string[] = ['procEventoNFe', 'evento', 'envEvento', 'retEnvEvento', 'retEvento'];
const FINALIDADES: Record<string, FinalidadeNota> = { '1': 'normal', '2': 'complementar', '3': 'ajuste', '4': 'devolucao' };

/** Os filhos DIRETOS de `pai` com este nome local (namespace e prefixo nao importam). */
function filhos(pai: Element | null, nome: string): Element[] {
  if (!pai) return [];
  return Array.from(pai.children).filter((e) => e.localName === nome);
}
function filho(pai: Element | null, nome: string): Element | null {
  return filhos(pai, nome)[0] ?? null;
}
/** Desce pelo caminho, filho direto a filho direto. */
function no(pai: Element | null, ...caminho: string[]): Element | null {
  let atual = pai;
  for (const nome of caminho) atual = filho(atual, nome);
  return atual;
}
/** O texto do no' no fim do caminho, aparado; `null` quando o no' nao existe ou esta' vazio. */
function texto(pai: Element | null, ...caminho: string[]): string | null {
  const t = no(pai, ...caminho)?.textContent?.trim();
  return t ? t : null;
}
/** Todos os descendentes com este nome local, em qualquer profundidade. */
function descendentes(raiz: Element, nome: string): Element[] {
  const achados = raiz.localName === nome ? [raiz] : [];
  return achados.concat(Array.from(raiz.getElementsByTagNameNS('*', nome)));
}
const soDigitos = (t: string | null): string | null => {
  const d = (t ?? '').replace(/\D/g, '');
  return d ? d : null;
};
/** A parte de DATA de um `dh…` ou `d…`, como escrita ('YYYY-MM-DD'); `null` se nao comeca por uma data. */
const dataEscrita = (t: string | null): string | null => (t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null);
const cent = (pai: Element | null, ...caminho: string[]): number => centavosDoTexto(texto(pai, ...caminho)) ?? 0;

function recusa(motivo: Exclude<MotivoRecusa, 'incompleta'>): ResultadoNFe {
  return { ok: false, motivo, frase: fraseDaRecusa(motivo) };
}
function incompleta(campo: CampoObrigatorioNFe): ResultadoNFe {
  return { ok: false, motivo: 'incompleta', frase: fraseDaRecusa('incompleta', campo) };
}

/** Le os bytes de um arquivo e devolve a NF-e (modelo 55) ou a recusa. */
export function lerNFe(bytes: ArrayBuffer): ResultadoNFe {
  if (bytes.byteLength > LIMITE_BYTES_NFE) return recusa('grande_demais');

  const xml = decodificarPeloCharsetDeclarado(bytes).replace(/^﻿/, '');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const raiz = doc.documentElement;
  if (!raiz || raiz.localName === 'parsererror' || doc.getElementsByTagName('parsererror').length > 0) return recusa('nao_e_xml');

  /* O QUE E' ESTE ARQUIVO, pela raiz. */
  if (RAIZES_CTE.includes(raiz.localName)) return recusa('cte');
  if (RAIZES_EVENTO.includes(raiz.localName)) return recusa('evento');
  if (raiz.localName === 'enviNFe') return recusa('lote');
  if (raiz.localName !== 'nfeProc' && raiz.localName !== 'NFe') return recusa('nfse_ou_desconhecido');
  const notas = descendentes(raiz, 'infNFe');
  if (notas.length > 1) return recusa('lote');
  const inf = notas[0] ?? null;
  if (!inf) return recusa('nfse_ou_desconhecido');

  const ide = filho(inf, 'ide');
  const modelo = texto(ide, 'mod');
  if (modelo === '65') return recusa('nfce');
  if (modelo !== '55') return recusa('nfse_ou_desconhecido');

  /* O PROTOCOLO: so' existe no `nfeProc`. E' ele que diz se a nota vale. */
  const infProt = raiz.localName === 'nfeProc' ? no(raiz, 'protNFe', 'infProt') : null;
  const cStat = texto(infProt, 'cStat');
  if (cStat && CSTAT_CANCELADA_OU_DENEGADA.includes(cStat)) return recusa('cancelada_ou_denegada');
  const protocolo = infProt && cStat ? { cStat, numero: texto(infProt, 'nProt') ?? '' } : null;

  /* OS CINCO OBRIGATORIOS. */
  const chaveCrua = soDigitos(texto(infProt, 'chNFe')) ?? soDigitos((inf.getAttribute('Id') ?? '').replace(/^NFe/i, ''));
  if (!chaveCrua || chaveCrua.length !== 44) return incompleta('chave de acesso');
  const numero = texto(ide, 'nNF');
  if (!numero) return incompleta('número');
  const emissao = dataEscrita(texto(ide, 'dhEmi'));
  if (!emissao) return incompleta('data de emissão');
  const emit = filho(inf, 'emit');
  const docEmitente = soDigitos(texto(emit, 'CNPJ')) ?? soDigitos(texto(emit, 'CPF'));
  /* FORN-CRIAR-DA-NOTA-ERRO — o código do sistema emissor ("1 - ") não é da razão social */
  const xNome = texto(emit, 'xNome');
  const nomeEmitente = xNome ? semCodigoDoEmissor(xNome) : xNome;
  if (!docEmitente || !nomeEmitente) return incompleta('emitente');
  const tot = no(inf, 'total', 'ICMSTot');
  const notaCent = centavosDoTexto(texto(tot, 'vNF'));
  if (notaCent == null) return incompleta('valor total');

  const dest = filho(inf, 'dest');
  const enderEmit = filho(emit, 'enderEmit');
  const fat = no(inf, 'cobr', 'fat');
  const duplicatas: DuplicataNFe[] = filhos(filho(inf, 'cobr'), 'dup').map((d) => ({
    numero: texto(d, 'nDup') ?? '',
    vencimento: dataEscrita(texto(d, 'dVenc')) ?? '',
    valorCent: cent(d, 'vDup'),
  }));
  const somaDuplicatasCent = somarCentavos(duplicatas.map((d) => d.valorCent));
  const finalidade = FINALIDADES[texto(ide, 'finNFe') ?? '1'] ?? 'normal';

  const nota: NotaLida = {
    chave: chaveCrua,
    modelo: '55',
    numero,
    serie: texto(ide, 'serie') ?? '',
    emissao,
    saidaEntrada: dataEscrita(texto(ide, 'dhSaiEnt')),
    tipoNota: texto(ide, 'tpNF') === '0' ? 'entrada' : 'saida',
    finalidade,
    naturezaOperacao: texto(ide, 'natOp') ?? '',
    emitente: { documento: docEmitente, nome: nomeEmitente, fantasia: texto(emit, 'xFant'), ie: soDigitos(texto(emit, 'IE')),
      endereco: enderEmit ? {
        logradouro: texto(enderEmit, 'xLgr'), numero: texto(enderEmit, 'nro'), complemento: texto(enderEmit, 'xCpl'), bairro: texto(enderEmit, 'xBairro'),
        municipio: texto(enderEmit, 'xMun'), uf: texto(enderEmit, 'UF'), cep: soDigitos(texto(enderEmit, 'CEP')), telefone: soDigitos(texto(enderEmit, 'fone')),
      } : null },
    destinatario: {
      documento: soDigitos(texto(dest, 'CNPJ')) ?? soDigitos(texto(dest, 'CPF')),
      nome: texto(dest, 'xNome'),
      ie: soDigitos(texto(dest, 'IE')),
      endereco: [texto(dest, 'enderDest', 'xLgr'), texto(dest, 'enderDest', 'nro'), texto(dest, 'enderDest', 'xBairro')].filter(Boolean).join(', ') || null,
    },
    totais: { produtosCent: cent(tot, 'vProd'), freteCent: cent(tot, 'vFrete'), descontoCent: cent(tot, 'vDesc'), notaCent },
    fatura: fat ? { origCent: cent(fat, 'vOrig'), descCent: cent(fat, 'vDesc'), liqCent: cent(fat, 'vLiq') } : null,
    duplicatas,
    somaDuplicatasCent,
    pagamentos: filhos(filho(inf, 'pag'), 'detPag').map((p) => ({ tPag: texto(p, 'tPag') ?? '', valorCent: cent(p, 'vPag') })),
    informacoesComplementares: texto(inf, 'infAdic', 'infCpl'),
    cfops: filhos(inf, 'det').map((d) => texto(filho(d, 'prod'), 'CFOP') ?? '').filter(Boolean),
    itens: filhos(inf, 'det').map((d) => {
      const prod = filho(d, 'prod');
      return { descricao: texto(prod, 'xProd') ?? '', quantidade: texto(prod, 'qCom') ?? '', unidade: texto(prod, 'uCom') ?? '', valorCent: cent(prod, 'vProd') };
    }),
    protocolo,
  };

  const avisos: AvisoNFe[] = [];
  if (!protocolo) avisos.push('sem_protocolo');
  if (duplicatas.length === 0) avisos.push('sem_duplicatas');
  else if (somaDuplicatasCent !== notaCent) avisos.push('duplicatas_diferem_da_nota');
  if (finalidade === 'complementar') avisos.push('complementar');
  if (finalidade === 'devolucao') avisos.push('devolucao');
  return { ok: true, nota, avisos };
}

/* ---------- NOTA-DANFE-01 — o que o DANFE pede além da `NotaLida` (o mesmo arquivo, os mesmos ajudantes: um dono só do XML) ---------- */
export interface ItemDoDanfe {
  codigo: string; descricao: string; ncm: string; cst: string; cfop: string; unidade: string; quantidade: string; unitario: string; totalCent: number;
  bcIcmsCent: number | null; vIcmsCent: number | null; vIpiCent: number | null; aliqIcms: string | null; aliqIpi: string | null;
}
export interface EnderecoDoDanfe { logradouro: string | null; bairro: string | null; municipio: string | null; uf: string | null; cep: string | null; fone: string | null }
export interface ExtrasDoDanfe {
  ambiente: 'producao' | 'homologacao';
  horaSaida: string | null;
  protocoloEm: string | null;
  emitenteIeSt: string | null;
  destinatario: EnderecoDoDanfe;
  impostos: { bcIcmsCent: number; icmsCent: number; bcStCent: number; stCent: number; produtosCent: number; freteCent: number; seguroCent: number;
    descontoCent: number; outrasCent: number; ipiCent: number; tributosCent: number | null; notaCent: number };
  ibsCbs: { ibsCent: number; cbsCent: number } | null;
  transporte: { modFrete: string | null; nome: string | null; documento: string | null; ie: string | null; endereco: string | null; municipio: string | null;
    uf: string | null; placa: string | null; placaUf: string | null; quantidade: string | null; especie: string | null; marca: string | null;
    numeracao: string | null; pesoBruto: string | null; pesoLiquido: string | null };
  infAdFisco: string | null;
  itens: ItemDoDanfe[];
}
/** Lê do MESMO XML o que o DANFE mostra e a `NotaLida` não guarda. `null` quando não é uma NF-e 55 que se lê. Pura, sem log. */
export function lerExtrasDoDanfe(bytes: ArrayBuffer): ExtrasDoDanfe | null {
  if (bytes.byteLength > LIMITE_BYTES_NFE) return null;
  const xml = decodificarPeloCharsetDeclarado(bytes).replace(/^﻿/, '');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const raiz = doc.documentElement;
  if (!raiz || doc.getElementsByTagName('parsererror').length > 0) return null;
  const inf = descendentes(raiz, 'infNFe')[0] ?? null;
  if (!inf) return null;
  const ide = filho(inf, 'ide');
  const tot = no(inf, 'total', 'ICMSTot');
  const ibs = no(inf, 'total', 'IBSCBSTot');
  const enderDest = no(inf, 'dest', 'enderDest');
  const transp = filho(inf, 'transp');
  const transporta = filho(transp, 'transporta');
  const vol = filho(transp, 'vol');
  const veic = filho(transp, 'veicTransp');
  const infProt = raiz.localName === 'nfeProc' ? no(raiz, 'protNFe', 'infProt') : null;
  const opcional = (pai: Element | null, ...c: string[]) => centavosDoTexto(texto(pai, ...c));
  const hora = (t: string | null) => (t && /T(\d{2}:\d{2}:\d{2})/.exec(t)?.[1]) ?? null;
  return {
    ambiente: texto(ide, 'tpAmb') === '2' ? 'homologacao' : 'producao',
    horaSaida: hora(texto(ide, 'dhSaiEnt')),
    protocoloEm: texto(infProt, 'dhRecbto'),
    emitenteIeSt: soDigitos(texto(filho(inf, 'emit'), 'IEST')),
    destinatario: { logradouro: [texto(enderDest, 'xLgr'), texto(enderDest, 'nro'), texto(enderDest, 'xCpl')].filter(Boolean).join(', ') || null,
      bairro: texto(enderDest, 'xBairro'), municipio: texto(enderDest, 'xMun'), uf: texto(enderDest, 'UF'), cep: soDigitos(texto(enderDest, 'CEP')),
      fone: soDigitos(texto(enderDest, 'fone')) },
    impostos: { bcIcmsCent: cent(tot, 'vBC'), icmsCent: cent(tot, 'vICMS'), bcStCent: cent(tot, 'vBCST'), stCent: cent(tot, 'vST'),
      produtosCent: cent(tot, 'vProd'), freteCent: cent(tot, 'vFrete'), seguroCent: cent(tot, 'vSeg'), descontoCent: cent(tot, 'vDesc'),
      outrasCent: cent(tot, 'vOutro'), ipiCent: cent(tot, 'vIPI'), tributosCent: opcional(tot, 'vTotTrib'), notaCent: cent(tot, 'vNF') },
    ibsCbs: ibs ? { ibsCent: cent(ibs, 'gIBS', 'vIBS'), cbsCent: cent(ibs, 'gCBS', 'vCBS') } : null,
    transporte: { modFrete: texto(transp, 'modFrete'), nome: texto(transporta, 'xNome'), documento: soDigitos(texto(transporta, 'CNPJ')) ?? soDigitos(texto(transporta, 'CPF')),
      ie: soDigitos(texto(transporta, 'IE')), endereco: texto(transporta, 'xEnder'), municipio: texto(transporta, 'xMun'), uf: texto(transporta, 'UF'),
      placa: texto(veic, 'placa'), placaUf: texto(veic, 'UF'), quantidade: texto(vol, 'qVol'), especie: texto(vol, 'esp'), marca: texto(vol, 'marca'),
      numeracao: texto(vol, 'nVol'), pesoBruto: texto(vol, 'pesoB'), pesoLiquido: texto(vol, 'pesoL') },
    infAdFisco: texto(inf, 'infAdic', 'infAdFisco'),
    itens: filhos(inf, 'det').map((d) => {
      const prod = filho(d, 'prod');
      const imp = filho(d, 'imposto');
      const icms = filho(imp, 'ICMS')?.firstElementChild ?? null;
      const ipi = no(imp, 'IPI', 'IPITrib');
      return {
        codigo: texto(prod, 'cProd') ?? '', descricao: texto(prod, 'xProd') ?? '', ncm: texto(prod, 'NCM') ?? '', cfop: texto(prod, 'CFOP') ?? '',
        cst: `${texto(icms, 'orig') ?? ''}${texto(icms, 'CST') ?? texto(icms, 'CSOSN') ?? ''}`, unidade: texto(prod, 'uCom') ?? '',
        quantidade: texto(prod, 'qCom') ?? '', unitario: texto(prod, 'vUnCom') ?? '', totalCent: cent(prod, 'vProd'),
        bcIcmsCent: opcional(icms, 'vBC'), vIcmsCent: opcional(icms, 'vICMS'), vIpiCent: opcional(ipi, 'vIPI'),
        aliqIcms: texto(icms, 'pICMS'), aliqIpi: texto(ipi, 'pIPI'),
      };
    }),
  };
}
