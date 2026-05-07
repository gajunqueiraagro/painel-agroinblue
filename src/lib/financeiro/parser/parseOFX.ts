/**
 * Parser interno de extratos OFX (Open Financial Exchange).
 *
 * Extrai blocos `<STMTTRN>...</STMTTRN>` e lê os campos:
 *   <DTPOSTED>YYYYMMDD[HHMMSS[.XXX][TZ]]
 *   <TRNAMT>±valor.dec
 *   <TRNTYPE>CREDIT|DEBIT|... (informativo; sinal de TRNAMT é a fonte de verdade)
 *   <MEMO> ou <NAME>  → descrição
 *   <FITID>           → documento (id da transação no banco)
 *   <CHECKNUM>        → fallback de documento
 *
 * Aceita OFX 1.x SGML (tags sem fecho) e 2.x XML (com fecho).
 * Não depende de bibliotecas externas.
 */

export interface MovimentoBruto {
  /** Data em formato ISO 'YYYY-MM-DD'. */
  data: string;
  /** Valor signed: positivo = crédito, negativo = débito. */
  valor: number;
  /** Tipo derivado do sinal de `valor`. */
  tipo: 'credito' | 'debito';
  /** Descrição/histórico do movimento. */
  descricao: string;
  /** Identificador externo (FITID ou CHECKNUM). */
  documento: string | null;
}

function extrairTag(bloco: string, tag: string): string | null {
  // Aceita `<TAG>VALUE` (SGML) ou `<TAG>VALUE</TAG>` (XML).
  // Regex captura até nova linha, próximo tag ou fim.
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

function parseDataOFX(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  // Validação básica
  const mm = Number(mes);
  const dd = Number(dia);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

export function parseOFX(content: string): MovimentoBruto[] {
  // Extrair blocos STMTTRN
  const blocos: string[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    blocos.push(match[1]);
  }

  const movimentos: MovimentoBruto[] = [];
  for (const b of blocos) {
    const dt = parseDataOFX(extrairTag(b, 'DTPOSTED'));
    const trnamtRaw = extrairTag(b, 'TRNAMT');
    if (!dt || trnamtRaw == null) continue;

    // OFX usa ponto como separador decimal por padrão; vírgula em alguns bancos BR.
    const valor = Number(trnamtRaw.replace(',', '.'));
    if (Number.isNaN(valor)) continue;

    const memo = extrairTag(b, 'MEMO') ?? extrairTag(b, 'NAME') ?? '';
    const fitid = extrairTag(b, 'FITID');
    const checknum = extrairTag(b, 'CHECKNUM');

    movimentos.push({
      data: dt,
      valor,
      tipo: valor >= 0 ? 'credito' : 'debito',
      descricao: memo,
      documento: fitid || checknum || null,
    });
  }

  return movimentos;
}
