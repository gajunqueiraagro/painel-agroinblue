/**
 * Qual boleto vai para qual parcela — FIN-NFE-PARCELAS-01 PR 2b, decisão do Gabriel (29/09/2026).
 *
 * (a) Boleto com vencimento lido casa PELA ORDEM: o de vencimento mais cedo vai para a parcela SEM
 *     boleto de vencimento mais cedo, o seguinte para a seguinte.
 *     ⚠ NÃO É "O MESMO MÊS". Medido nos boletos da Vera: o 5º vence 01/03/27 porque a duplicata
 *     (27/02/27) caiu num sábado. Pelo mês ele iria para a parcela de março, que já tem o boleto 6.
 * (b) Arquivo sem leitura: o número no nome do arquivo (001..999 -> parcela N), se ela estiver livre.
 * (c) Senão: nenhuma parcela — a tela pede para escolher.
 * O boleto NUNCA altera o vencimento da parcela: a diferença só é mostrada (âmbar acima de 7 dias).
 * A escolha manual do operador vence tudo e é respeitada quando outros arquivos entram.
 */

export type CasouPor = 'vencimento' | 'nome' | 'escolha' | 'nao_leu';

export interface ArquivoParaCasar {
  chave: string;
  nome: string;
  /** `YYYY-MM-DD` lido da linha digitável, ou null. */
  vencimentoLido: string | null;
  /** Parcela escolhida à mão pelo operador — fica como está. */
  parcelaManual: number | null;
}

export interface ParcelaLivre {
  numero: number;
  /** `YYYY-MM-DD`, ou null quando a parcela ainda não tem vencimento. */
  vencimento: string | null;
}

export interface Casamento {
  parcela: number | null;
  casouPor: CasouPor;
}

/**
 * O número no nome do arquivo: o ÚLTIMO grupo de 1 a 3 dígitos SOLTO — entre separadores, nunca colado a
 * letra (boleto_003_ST_Repro.pdf -> 3). ⚠ "Colado a letra" nasceu da prova na tela: em
 * `boleto_004_teste_pr2b.pdf` a regra antiga pegava o "2" de "pr2b".
 */
export function numeroNoNome(nome: string): number | null {
  const semExt = nome.replace(/\.[^.]+$/, '');
  const grupos = semExt.match(/(?<![\p{L}\d])\d{1,3}(?![\p{L}\d])/gu);
  if (!grupos) return null;
  const n = Number(grupos[grupos.length - 1]);
  return n >= 1 ? n : null;
}

/** Diferença em dias entre o vencimento lido e o da parcela (positivo = boleto vence depois). */
export function diasDeDiferenca(vencimentoLido: string | null, vencimentoParcela: string | null): number | null {
  if (!vencimentoLido || !vencimentoParcela) return null;
  const a = Date.parse(`${vencimentoLido}T00:00:00Z`);
  const b = Date.parse(`${vencimentoParcela}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export const LIMITE_DIAS_AVISO = 7;

const porVencimento = (a: ParcelaLivre, b: ParcelaLivre) =>
  (a.vencimento ?? '9999-12-31').localeCompare(b.vencimento ?? '9999-12-31') || a.numero - b.numero;

export function casarBoletos(
  arquivos: readonly ArquivoParaCasar[], parcelasLivres: readonly ParcelaLivre[],
): Map<string, Casamento> {
  const saida = new Map<string, Casamento>();
  const livres = new Set(parcelasLivres.map(p => p.numero));

  /* A escolha manual primeiro: ela tira a parcela da disputa. */
  for (const a of arquivos) {
    if (a.parcelaManual != null) {
      saida.set(a.chave, { parcela: a.parcelaManual, casouPor: 'escolha' });
      livres.delete(a.parcelaManual);
    }
  }

  /* (a) pela ordem do vencimento lido */
  const lidos = arquivos
    .filter(a => a.parcelaManual == null && a.vencimentoLido)
    .sort((x, y) => (x.vencimentoLido ?? '').localeCompare(y.vencimentoLido ?? '') || x.nome.localeCompare(y.nome));
  const fila = parcelasLivres.filter(p => livres.has(p.numero)).sort(porVencimento);
  for (const a of lidos) {
    const alvo = fila.shift();
    if (!alvo) { saida.set(a.chave, { parcela: null, casouPor: 'vencimento' }); continue; }
    saida.set(a.chave, { parcela: alvo.numero, casouPor: 'vencimento' });
    livres.delete(alvo.numero);
  }

  /* (b) pelo número no nome, se a parcela estiver livre; (c) senão, escolher */
  for (const a of arquivos) {
    if (saida.has(a.chave)) continue;
    const n = numeroNoNome(a.nome);
    if (n != null && livres.has(n)) {
      saida.set(a.chave, { parcela: n, casouPor: 'nome' });
      livres.delete(n);
    } else {
      saida.set(a.chave, { parcela: null, casouPor: 'nao_leu' });
    }
  }
  return saida;
}
