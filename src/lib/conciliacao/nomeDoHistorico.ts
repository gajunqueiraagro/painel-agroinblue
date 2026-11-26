/**
 * nomeDoHistorico — P153 (CONC-HISTORICO-01, Gabriel 28/10): o NOME que o banco escreveu no histórico do movimento, para o campo do
 * "Procurar no histórico" já nascer preenchido.
 *
 * Por banco (medido no proto, FASE 0 `valores-20261028-1714-P153-fase0.md`):
 * - BB: "Pix - Enviado - 02/10 11:23 NOME" e "Pagamento de Boleto - NOME" → o último pedaço depois do " · " do `historicoDoBanco` (P159a).
 * - Itaú: "PIX ENVIADO NOME 999.999.999-99", "PIX TRANSF NOME 99 99", "BOLETO PAGO NOME", "TED RECEBIDA 999.9999.NOME CNPJ" → tira o
 *   prefixo conhecido e o documento/data/número do fim (e do começo, no TED).
 * - Bradesco ("PIX ENVIADO") e Sicredi ("PAGAMENTO PIX-PIX_DEB 99999999"): SEM NOME → '' (D1: o campo vem vazio, com "o banco não
 *   trouxe o nome: digite"; nunca o texto inteiro, nunca os dígitos como nome).
 * CONC-SUGESTOES-V2 A (Gabriel 25/11): o Open Finance do Sicredi escreve "LIQUIDACAO BOLETO [SICREDI] <CNPJ> NOME" e "PAGAMENTO PIX /
 * RECEBIMENTO PIX <CPF/CNPJ> NOME" — o leitor não conhecia LIQUIDACAO nem RECEBIMENTO e o nome vinha vazio. E o documento do meio do
 * texto (`documentoDoHistorico`) agora é lido: CNPJ/CPF só com o dígito verificador certo (número solto, telefone e código não viram documento).
 * ⚠ SÓ ALIMENTA O CAMPO: o operador edita; nada é gravado a partir daqui.
 */
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';

/* Os tipos de operação que abrem o histórico sem separador ("PIX ENVIADO NOME"), do mais longo ao mais curto */
const PREFIXOS = [
  'LIQUIDACAO BOLETO SICREDI', 'LIQUIDACAO DE BOLETO', 'LIQUIDACAO BOLETO', 'LIQUIDAÇÃO BOLETO', 'RECEBIMENTO PIX', 'RECEBIMENTO DE PIX',
  'PAGAMENTO DE BOLETO', 'PAGAMENTO PIX', 'PIX ENVIADO', 'PIX RECEBIDO', 'PIX TRANSF', 'PIX AGENDADO', 'PIX QRS', 'PIX',
  'BOLETO PAGO', 'TED RECEBIDA', 'TED ENVIADA', 'TED', 'DOC RECEBIDO', 'DOC ENVIADO', 'TRANSF RECEBIDA', 'TRANSF ENVIADA',
  'PAGTO', 'PAGAMENTO', 'TRANSFERENCIA', 'TRANSFERÊNCIA',
];
/* Só operação, sem nome: o que sobra disso não é nome */
const SO_OPERACAO = /^(enviado|recebido|enviada|recebida|deb|cred|debito|credito|débito|crédito|agendamento|agendado|transf|pix|ted|doc)$/i;

const espacos = (s: string) => s.replace(/\s+/g, ' ').trim();
/* documento, data, hora e números soltos nas pontas: "999.999.999-99", "99.999.999/0001-99", "02/10", "11:23", "99 99", "999.9999." */
const PONTA_NUMERICA = /^[\d./:\-\s]+|[\s\d./:\-]+$/g;

function semPontasNumericas(s: string): string {
  return espacos(s.replace(PONTA_NUMERICA, ' ').replace(/\b(CPF|CNPJ)\b\s*$/i, ''));
}

function pareceNome(s: string): boolean {
  const letras = s.replace(/[^\p{L}]/gu, '');
  return letras.length >= 3 && !SO_OPERACAO.test(s);
}

export function nomeDoHistorico(texto: string | null | undefined, dataDoMovimento?: string | null): string {
  const cru = espacos(texto ?? '');
  if (!cru) return '';
  /* BB e quem usa " - ": o `historicoDoBanco` já separa o tipo do nome com " · " */
  const limpo = historicoDoBanco(cru, dataDoMovimento).texto;
  if (limpo.includes(' · ')) {
    const pedacos = limpo.split(' · ');
    const ultimo = semPontasNumericas(pedacos[pedacos.length - 1]);
    return pedacos.length > 1 && pareceNome(ultimo) ? ultimo : '';
  }
  /* Itaú e cia.: o prefixo da operação sem separador */
  const maiusc = cru.toUpperCase();
  const prefixo = PREFIXOS.find((p) => maiusc === p || maiusc.startsWith(`${p} `) || maiusc.startsWith(`${p}-`));
  if (!prefixo) return '';
  const resto = semPontasNumericas(cru.slice(prefixo.length).replace(/^[\s\-_]+/, ''));
  /* "PIX-PIX_DEB 99999999" (Sicredi): o que sobra é código, não nome */
  if (/[_]/.test(resto) || !pareceNome(resto)) return '';
  return resto;
}

/* ── o documento do texto do banco (CONC-SUGESTOES-V2 A) ── */

export interface DocumentoDoHistorico { tipo: 'cnpj' | 'cpf'; digitos: string; /** CNPJ: os 8 primeiros (a raiz: a mesma empresa em outra filial) */ raiz: string }

function dvCnpjOk(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function dvCpfOk(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11; return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** O CNPJ (ou CPF) escrito no histórico, formatado ou não; o 1º válido. Sem dígito verificador certo → null (nunca adivinha). */
export function documentoDoHistorico(texto: string | null | undefined): DocumentoDoHistorico | null {
  const t = texto ?? '';
  /* blocos de dígitos com . / - no meio ("99.999.999/0001-99", "999.999.999-99") ou corridos */
  const blocos = t.match(/\d[\d./-]{9,19}\d/g) ?? [];
  for (const b of blocos) {
    const d = b.replace(/\D/g, '');
    if (d.length === 14 && dvCnpjOk(d)) return { tipo: 'cnpj', digitos: d, raiz: d.slice(0, 8) };
    if (d.length === 11 && dvCpfOk(d)) return { tipo: 'cpf', digitos: d, raiz: d };
  }
  return null;
}

export function formatarDocumento(doc: DocumentoDoHistorico): string {
  const d = doc.digitos;
  return doc.tipo === 'cnpj'
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** O campo do "Procurar no histórico" já nasce com o nome e o documento: "NOME · 99.999.999/0001-99" (só um deles, se só houver um). */
export function campoDoHistorico(texto: string | null | undefined, dataDoMovimento?: string | null): string {
  const nome = nomeDoHistorico(texto, dataDoMovimento);
  const doc = documentoDoHistorico(texto);
  return [nome, doc ? formatarDocumento(doc) : ''].filter(Boolean).join(' · ');
}

/** O que o campo pede ao banco: o nome (o texto) e o documento (os dígitos), lidos do que o operador deixou no campo. */
export function termoDoCampo(campo: string): { nome: string; documento: DocumentoDoHistorico | null } {
  const partes = campo.split(' · ').map((p) => p.trim()).filter(Boolean);
  let documento: DocumentoDoHistorico | null = null;
  const nomes: string[] = [];
  for (const p of partes) {
    const d = /^[\d.\/\-\s]+$/.test(p) ? documentoDoHistorico(p.replace(/\s/g, '')) : null;
    if (d && !documento) documento = d; else nomes.push(p);
  }
  return { nome: nomes.join(' '), documento };
}
