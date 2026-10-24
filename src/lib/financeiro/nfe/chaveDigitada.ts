/**
 * DIGITAR A CHAVE — P95 (Gabriel 23/10/2026: "para NF digitalizadas"). PURO. A nota cujo arquivo nao da' a chave (DANFE sem chave
 * legivel; PDF foto/escaneado) segue pela chave de 44 digitos que o operador digita (ou cola, com ou sem espacos). Da chave vem SO' o que
 * ela traz (`partesDaChave`): o CNPJ do emitente, o modelo, a serie, o numero e o ano/mes. O resto (valor, dia da emissao, itens,
 * duplicatas, destinatario/IE) fica EM BRANCO: o operador preenche na previa (ambar, "Pela chave digitada · confira").
 * ⚠ So' a chave com o digito verificador certo (modulo 11) passa; modelo diferente de 55 recusa com a frase de hoje (NFC-e / NFS-e).
 * ⚠ Nota avulsa (serie 890–899): o CNPJ da chave e' do FISCO (NOTA-AVULSA-890-01) — nao vira o emitente (nao acha fornecedor por ele).
 * ⚠ Fora daqui: consultar a SEFAZ pela chave (FIN-NFE-SEFAZ-01) e OCR do escaneado.
 */
import { digitoDaChave, ehSerieAvulsa, partesDaChave, FRASE_NOTA_SEM_CHAVE, FRASE_PDF_SEM_TEXTO } from './danfe';
import { soDigitos } from './formatos';
import { FRASES_DE_RECUSA, type NotaLida } from './tipos';
import type { NotaDoArquivo } from './lerNota';
import type { DoXml } from '@/lib/financeiro/nfePrefill';

export const FRASE_CHAVE_INVALIDA = 'Chave inválida: o último dígito não confere. Confira a digitação.';
export const FRASE_CHAVE_CURTA = 'A chave de acesso tem 44 dígitos.';
export const ROTULO_PELA_CHAVE = 'Pela chave digitada · confira';

/** A recusa da linha deixa digitar a chave? So' a nota sem chave e o PDF sem texto (foto/escaneado). */
export function podeDigitarAChave(recusa: string | null | undefined): boolean {
  return recusa === FRASE_NOTA_SEM_CHAVE || recusa === FRASE_PDF_SEM_TEXTO;
}

export type NotaDaChave = { ok: true; nota: NotaLida; avulsa: boolean; mes: string } | { ok: false; frase: string };

/** A nota que a chave digitada da' (o resto em branco); `mes` = o ano/mes da chave ("2026-04"), para a previa sugerir a emissao. */
export function notaDaChaveDigitada(texto: string): NotaDaChave {
  const chave = soDigitos(texto);
  if (chave.length !== 44) return { ok: false, frase: FRASE_CHAVE_CURTA };
  if (digitoDaChave(chave.slice(0, 43)) !== Number(chave[43])) return { ok: false, frase: FRASE_CHAVE_INVALIDA };
  const p = partesDaChave(chave);
  if (p.modelo === '65') return { ok: false, frase: FRASES_DE_RECUSA.nfce };
  if (p.modelo !== '55') return { ok: false, frase: FRASES_DE_RECUSA.nfse_ou_desconhecido };
  const avulsa = ehSerieAvulsa(p.serie);
  const nota: NotaLida = {
    chave, modelo: '55', numero: p.numero.replace(/^0+(?=\d)/, ''), serie: p.serie, emissao: '', saidaEntrada: null, tipoNota: 'saida',
    finalidade: 'normal', naturezaOperacao: '',
    emitente: { documento: avulsa ? '' : p.cnpj, nome: '', fantasia: null, ie: null, endereco: null },
    destinatario: { documento: null, nome: null, ie: null, endereco: null },
    totais: { produtosCent: 0, freteCent: 0, descontoCent: 0, notaCent: 0 },
    fatura: null, duplicatas: [], somaDuplicatasCent: 0, pagamentos: [], itens: [], protocolo: null, informacoesComplementares: null, cfops: [],
  };
  return { ok: true, nota, avulsa, mes: `20${p.aamm.slice(0, 2)}-${p.aamm.slice(2, 4)}` };
}

/** A nota da chave no formato do leitor do arquivo (o PDF, mesmo escaneado, segue anexado como a NF): sem marcas, sem conferencia. */
export function lidoDaChave(nota: NotaLida, tamanhos: Extract<NotaDoArquivo, { ok: true }>['tamanhos']): Extract<NotaDoArquivo, { ok: true }> {
  return { ok: true, origem: 'pdf', nota, avisos: ['sem_protocolo', 'sem_duplicatas'], marcas: [], divergencias: [], tamanhos, pelaChave: true };
}

/** O que o operador preencheu na previa (a chave nao traz): a emissao e o valor entram na nota E na proposta (competencia, documento). */
export function comDadosDigitados<T extends { lido: Extract<NotaDoArquivo, { ok: true }>; doXml: DoXml }>(
  x: T, d: { emissao: string; valorCent: number | null },
): T {
  const valorCent = d.valorCent ?? 0;
  const nota: NotaLida = { ...x.lido.nota, emissao: d.emissao, totais: { ...x.lido.nota.totais, produtosCent: valorCent, notaCent: valorCent } };
  const p = x.doXml.proposta;
  return {
    ...x,
    lido: { ...x.lido, nota },
    doXml: { ...x.doXml, proposta: { ...p, competencia: d.emissao, valorCent, documento: { ...p.documento, dataEmissao: d.emissao, valorCent } } },
  };
}
