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
 * ⚠ SÓ ALIMENTA O CAMPO: o operador edita; nada é gravado a partir daqui.
 */
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';

/* Os tipos de operação que abrem o histórico sem separador ("PIX ENVIADO NOME"), do mais longo ao mais curto */
const PREFIXOS = [
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
