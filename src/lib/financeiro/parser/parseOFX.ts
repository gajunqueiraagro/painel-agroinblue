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
 * E lê, à parte dos movimentos, o SALDO DECLARADO pelo banco:
 *   <LEDGERBAL><BALAMT>±valor.dec  → saldo contábil que o banco afirma
 *              <DTASOF>YYYYMMDD    → a data a que esse saldo se refere
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

/**
 * O saldo que o BANCO declara no arquivo — não o nosso somatório.
 *
 * ⚠ "DECLARADO" E NÃO "FINAL", e o nome é deliberado: `saldo_final` já existe
 * neste sistema em `financeiro_saldos_bancarios_v2` e é o saldo GERENCIAL da
 * casa, com `origem_saldo` que na maioria das linhas é manual ou legado. Chamar
 * os dois de "saldo final" convidaria a trocá-los — e a diferença entre o que o
 * banco afirma e o que a casa apurou é exatamente o que a conciliação existe
 * para medir.
 */
export interface SaldoDeclaradoOFX {
  /** LEDGERBAL/BALAMT — o valor, com sinal. */
  saldoDeclarado: number;
  /** DTASOF — data ISO 'YYYY-MM-DD' a que o saldo se refere; null se ausente. */
  saldoData: string | null;
}

/**
 * Lê o saldo declarado. `null` quando o arquivo não traz `LEDGERBAL` — e null
 * é a resposta certa: ausência vira traço na tela, nunca zero, e NUNCA a soma
 * dos movimentos. Somatório bate consigo mesmo e não confere coisa nenhuma.
 *
 * ⚠ ISOLA O BLOCO ANTES DE LER A TAG, e essa ordem é a regra que este código
 * existe para respeitar. `BALAMT` e `DTASOF` aparecem TAMBÉM dentro de
 * `<AVAILBAL>` (saldo disponível, que inclui limite) — procurar a tag solta no
 * documento inteiro pegaria o primeiro bloco que aparecesse, e o número
 * mostrado como "declarado pelo banco" poderia ser outro saldo.
 * ⚠ É O MESMO CUIDADO QUE MANTÉM O LEDGERBAL FORA DOS MOVIMENTOS: `parseOFX`
 * só olha dentro de `<STMTTRN>...</STMTTRN>`, então nenhum valor de saldo pode
 * virar transação. Ler tag solta no documento é como um saldo vira lançamento —
 * capturar a tag aqui é justamente para ela nunca mais ser confundida com uma.
 * ⚠ `(</LEDGERBAL>|$)` tolera o fecho ausente. No OFX 1.x SGML quem não fecha
 * são as tags-folha (`<BALAMT>`, `<DTASOF>`); os agrupadores como `LEDGERBAL`
 * fecham normalmente — medido. O `|$` é para o arquivo TRUNCADO, que acaba no
 * meio do bloco: aí ainda se lê o saldo em vez de devolver nada.
 */
export function lerSaldoDeclaradoOFX(content: string): SaldoDeclaradoOFX | null {
  const bloco = content.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|$)/i);
  if (!bloco) return null;
  const bruto = extrairTag(bloco[1], 'BALAMT');
  if (bruto == null) return null;
  const valor = Number(bruto.replace(',', '.'));
  if (Number.isNaN(valor)) return null;
  return { saldoDeclarado: valor, saldoData: parseDataOFX(extrairTag(bloco[1], 'DTASOF')) };
}

/**
 * O PERÍODO QUE O ARQUIVO DECLARA — `BANKTRANLIST/DTSTART` e `DTEND`.
 *
 * ⚠ É O PERÍODO DO EXTRATO, NÃO O DOS MOVIMENTOS. Derivar do primeiro e do
 * último lançamento acerta quase sempre e erra exatamente quando importa: o mês
 * que começa ou termina sem movimento aparece encurtado, e quem confere a
 * cobertura do arquivo conclui que faltou pedaço ao banco.
 *
 * ⚠ ISOLA O BLOCO ANTES DE LER A TAG, pela mesma razão do `LEDGERBAL`:
 * `<BANKTRANLIST>` é onde as datas do período moram, e ler tag solta no
 * documento inteiro pegaria a primeira que aparecesse — em arquivos com mais de
 * uma lista de transações, a do bloco errado.
 * ⚠ `(</BANKTRANLIST>|$)` tolera o fecho ausente no arquivo truncado, como no
 * saldo declarado.
 */
export interface PeriodoDeclaradoOFX {
  /** `DTSTART` — data ISO 'YYYY-MM-DD'; null se ausente. */
  inicio: string | null;
  /** `DTEND` — idem. */
  fim: string | null;
}

export function lerPeriodoDeclaradoOFX(content: string): PeriodoDeclaradoOFX | null {
  const bloco = content.match(/<BANKTRANLIST>([\s\S]*?)(<\/BANKTRANLIST>|$)/i);
  if (!bloco) return null;
  const inicio = parseDataOFX(extrairTag(bloco[1], 'DTSTART'));
  const fim = parseDataOFX(extrairTag(bloco[1], 'DTEND'));
  /* Sem nenhuma das duas, o arquivo não declarou período — e null é a resposta
     certa: quem chama cai para as datas dos movimentos, que é o que sabe. */
  if (inicio == null && fim == null) return null;
  return { inicio, fim };
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
