/**
 * historicoDoBanco — P159a (CONC-TELAS-01, Gabriel 28/10): o histórico do extrato como a Conferência e o Extrato (banco) o MOSTRAM.
 *
 * "PIX - ENVIADO - 02/10 11:23 NOME" → hora "11:23" e texto "PIX ENVIADO · NOME": a hora vai pequena e cinza na frente da linha, e
 * o "dd/mm" sai porque a data já está no dia. Os separadores " - " do banco viram " · ".
 * ⚠ SÓ EXIBIÇÃO: o dado não muda, e o texto INTEIRO do banco vai no `title` (quem chama). Nada de abreviar nem trocar palavra
 *   ("PAGAMENTO DE BOLETO" continua escrito assim) e nada de mudar maiúscula: o texto é o do banco, só sem a moldura repetida.
 * ⚠ A DATA SÓ SAI QUANDO É A DO DIA: no "Pix - Agendamento - 28/09 10:15", o 28/09 é o dia em que se agendou, e o movimento é de
 *   outro dia — aí ela fica no texto ("Pix Agendamento 28/09 · NOME"). Sem a data do movimento, a data fica.
 * ⚠ PADRÃO NÃO RECONHECIDO = O TEXTO ORIGINAL, sem hora (nunca um pedaço).
 */
export interface HistoricoLimpo {
  /** "11:23", ou '' quando o histórico não traz hora */
  hora: string;
  texto: string;
}

const espacos = (s: string) => s.replace(/\s+/g, ' ').trim();
/* "A - B - dd/mm hh:mm resto" e "A - dd/mm hh:mm resto" (o resto pode faltar) */
const COM_HORA = /^(.+?)\s+-\s+(\d{2})\/(\d{2})\s+(\d{2}:\d{2})(?:\s+(.*))?$/;

export function historicoDoBanco(texto: string | null | undefined, dataDoMovimento?: string | null): HistoricoLimpo {
  const original = texto ?? '';
  const s = espacos(original);
  if (!s) return { hora: '', texto: original };
  const m = COM_HORA.exec(s);
  if (m) {
    const [, antes, dd, mm, hora, resto] = m;
    /* "PIX - ENVIADO" → "PIX ENVIADO": dentro do tipo da operação o hífen é só moldura */
    const tipo = espacos(antes.split(/\s+-\s+/).join(' '));
    const doDia = !!dataDoMovimento && dataDoMovimento.slice(8, 10) === dd && dataDoMovimento.slice(5, 7) === mm;
    const cabeca = doDia ? tipo : `${tipo} ${dd}/${mm}`;
    const nome = espacos(resto ?? '');
    return { hora, texto: nome ? `${cabeca} · ${nome}` : cabeca };
  }
  /* sem hora: só os separadores " - " (com espaço dos dois lados) viram " · "; "TED-CRÉDITO" fica como está */
  if (/\s-\s/.test(s)) return { hora: '', texto: s.split(/\s+-\s+/).map(espacos).filter(Boolean).join(' · ') };
  return { hora: '', texto: original };
}
