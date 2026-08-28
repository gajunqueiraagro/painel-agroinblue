/**
 * extrairDanfe — lê os campos de uma NF-e a partir do TEXTO do DANFE.
 *
 * ⚠ SUGESTÃO, NUNCA GRAVAÇÃO. Nada aqui salva: o resultado pré-preenche o formulário
 * e o operador confere antes de salvar. Extração errada gravada em silêncio é PIOR que
 * digitar do zero, porque ninguém revisa o que já parece pronto.
 *
 * ⚠ A ARMADILHA DO "!" — MEDIDA, não suposta. A fonte do DANFE gerado pelo Alterdata
 * substitui **N por "!"**: o emitente sai como "VI!ICIUS FER!A!DES". Sem normalizar,
 * todo nome com N quebra — e os próprios ROTULOS que servem de âncora ("DESTI!ATÁRIO")
 * quebram junto, então a normalização tem de vir antes de qualquer busca.
 * Num DANFE, "!" legítimo não existe; a troca é segura para esta família de arquivos.
 *
 * ⚠ O QUE VEM DA CHAVE É SOBERANO. A chave de acesso tem 44 dígitos com layout fixo
 * (Manual da NF-e), e dela saem CNPJ do emitente, série, número e ano/mês — sem
 * depender de onde o texto caiu na página. É por isso que esses campos são confiáveis
 * mesmo em DANFE de outro gerador, enquanto nome e valor dependem de âncora e são
 * best-effort.
 *
 *     posições  0-1   cUF
 *               2-5   AAMM da emissão
 *               6-19  CNPJ do emitente (14 dígitos)
 *              20-21  modelo
 *              22-24  série
 *              25-33  número
 *              34     tipo de emissão
 *              35-42  código numérico
 *              43     dígito verificador
 *
 * NÃO faz OCR: PDF sem camada de texto (foto, scan) devolve tudo nulo, e o chamador
 * avisa em vez de adivinhar. XML da NF-e seria melhor que isto — quando houver XML,
 * ele substitui este arquivo inteiro.
 */

export interface DanfeExtraido {
  chaveAcesso: string | null;
  numero: string | null;
  serie: string | null;
  /** YYYY-MM-DD. Só quando o dia foi achado no texto; a chave dá apenas ano e mês. */
  dataEmissao: string | null;
  emitenteCnpj: string | null;
  emitenteNome: string | null;
  destinatarioNome: string | null;
  valorTotal: number | null;
  /** Quais campos vieram da chave (soberanos) — para a tela marcar a diferença. */
  daChave: boolean;
}

export const VAZIO: DanfeExtraido = {
  chaveAcesso: null, numero: null, serie: null, dataEmissao: null,
  emitenteCnpj: null, emitenteNome: null, destinatarioNome: null, valorTotal: null, daChave: false,
};

/** Ver o bloco do "!" no cabeçalho. Também colapsa espaços: o pdfjs junta os itens de
 *  texto com um espaço cada, e rótulos saem com espaçamento irregular. */
export function normalizarTextoDanfe(texto: string): string {
  return texto.replace(/!/g, 'N').replace(/[ \t]+/g, ' ');
}

const soDigitos = (s: string) => s.replace(/\D/g, '');

function formatarCnpj(d: string): string | null {
  if (d.length !== 14) return null;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Valor em pt-BR ("13.500,00") para número. Devolve null em vez de 0: ausência não é zero. */
function paraNumero(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extrairDanfe(textoBruto: string): DanfeExtraido {
  const texto = normalizarTextoDanfe(textoBruto);
  const out: DanfeExtraido = { ...VAZIO };

  /* ── CHAVE: 44 dígitos. No DANFE ela aparece agrupada de 4 em 4, então a busca
     tolera separadores e só depois confere o tamanho. */
  const mChave = texto.match(/(?:\d[\s.]*){44}/);
  if (mChave) {
    const d = soDigitos(mChave[0]);
    if (d.length === 44) {
      out.chaveAcesso = d;
      out.daChave = true;
      out.emitenteCnpj = formatarCnpj(d.slice(6, 20));
      // Série e número vêm com zeros à esquerda na chave; a tela mostra sem eles.
      out.serie = String(Number(d.slice(22, 25)));
      out.numero = String(Number(d.slice(25, 34)));
    }
  }

  /* ── DATA: a chave dá só AAMM, então o DIA precisa do texto. Procura dd/mm/aaaa e
     aceita a primeira que bater com o ano e o mês da chave — assim uma data de
     vencimento ou de saída no meio da página não é confundida com a emissão.
     Sem chave, cai na primeira data do documento, que é best-effort. */
  const datas = [...texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (datas.length) {
    const aaMmChave = out.chaveAcesso ? out.chaveAcesso.slice(2, 6) : null;
    const escolhida = aaMmChave
      ? datas.find(m => `${m[3].slice(2)}${m[2]}` === aaMmChave) ?? null
      : datas[0];
    if (escolhida) out.dataEmissao = `${escolhida[3]}-${escolhida[2]}-${escolhida[1]}`;
  }

  /* ── EMITENTE / DESTINATÁRIO: dependem de âncora e por isso são best-effort.
     O DANFE põe a razão social logo após o rótulo do bloco. Se o layout do gerador
     for outro, estes dois vêm nulos e o operador digita — que é o comportamento
     correto, e não um palpite. */
  const mEmit = texto.match(/(?:EMITENTE|EMISSOR)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s.&'-]{4,60})/);
  if (mEmit) out.emitenteNome = mEmit[1].trim().replace(/\s+/g, ' ');
  const mDest = texto.match(/DESTINAT[ÁA]RIO[^A-ZÀ-Ú]{0,20}([A-ZÀ-Ú][A-ZÀ-Ú\s.&'-]{4,60})/);
  if (mDest) out.destinatarioNome = mDest[1].trim().replace(/\s+/g, ' ');

  /* ── VALOR TOTAL DA NOTA. O DANFE traz vários valores; o rótulo "VALOR TOTAL DA
     NOTA" é o que interessa. "VALOR TOTAL DOS PRODUTOS" fica de fora de propósito:
     eles divergem quando há frete ou desconto, e a nota vale pelo total. */
  const mValor = texto.match(/VALOR TOTAL DA NOTA[^\d]{0,40}([\d.]+,\d{2})/);
  if (mValor) out.valorTotal = paraNumero(mValor[1]);

  return out;
}
