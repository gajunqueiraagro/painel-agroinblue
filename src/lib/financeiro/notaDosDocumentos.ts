/**
 * UMA NOTA = UMA LINHA — DOC-NOTA-XML-PDF-01 (Gabriel 22/10/2026). A mesma nota anexada em PDF e em XML sao DOIS registros (dois
 * arquivos guardados, nada se apaga) e UMA linha na aba Documentos, com os selos "PDF" e "XML". PURO.
 *
 * ⚠ A MESMA REGRA DO BANCO (`fin_documento_confronto`, migration 20261028111800 — o par nao e' "repetida"): nota fiscal, o mesmo caminho
 *   (lancamento ou a mesma OC), o mesmo numero (so' digitos, sem zeros a' esquerda), UM PDF e UM XML, e o CNPJ do emitente (o do
 *   registro ou o da chave), a chave de acesso e a serie sem contradicao. Fora disso cada registro e' a sua linha — dois PDFs
 *   da mesma nota seguem duas linhas (o confronto avisa "registrada 2 vezes").
 * ⚠ O XML E' DADO DE IMPORTACAO: a linha abre o PDF; sem PDF, os "Itens da nota" (a leitura do XML) — nunca o XML cru.
 */
import type { LancDocumento } from '@/hooks/useLancamentoDocumentos';

export type FormatoDoArquivo = 'pdf' | 'xml' | 'outro';

/** O formato pelo nome (termina em .xml/.pdf) ou pelo tipo — o MESMO `CASE` do banco. */
export function formatoDoArquivo(d: { nome: string | null; tipo: string | null }): FormatoDoArquivo {
  const nome = (d.nome ?? '').toLowerCase();
  const tipo = (d.tipo ?? '').toLowerCase();
  if (nome.endsWith('.xml') || tipo.includes('xml')) return 'xml';
  if (nome.endsWith('.pdf') || tipo.includes('pdf')) return 'pdf';
  return 'outro';
}

export interface LinhaDeDocumento {
  /** o registro que a linha mostra (numero, emitente, valor) e que o lapis edita: o XML, salvo quando so' o PDF tem valor */
  principal: LancDocumento;
  pdf: LancDocumento | null;
  xml: LancDocumento | null;
  /** todos os registros da linha (1 ou 2): cancelar a linha cancela todos */
  membros: LancDocumento[];
}

const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const chave44 = (d: LancDocumento) => { const c = digitos(d.chaveAcesso); return c.length === 44 ? c : null; };
const semZeros = (s: string | null | undefined) => digitos(s).replace(/^0+/, '');

/** A identidade da nota no MESMO caminho; `null` = nao e' nota que se junta. */
function chaveDaNota(d: LancDocumento): string | null {
  if (d.cancelado || d.especie !== 'nf') return null;
  const num = semZeros(d.numero);
  const ch = chave44(d);
  const caminho = d.origem === 'operacao' ? `oc:${d.operacaoId ?? ''}` : 'lanc';
  if (num) return `${caminho}|n:${num}`;
  return ch ? `${caminho}|c:${ch}` : null;
}
/** o CNPJ do emitente: o do registro ou o da chave (o arquivo sem CNPJ nao contradiz — o banco o herda do outro) */
const cnpjDe = (d: LancDocumento) => digitos(d.emitenteDocumento) || (chave44(d)?.slice(6, 20) ?? '') || null;

const semContradicao = (a: string | null, b: string | null) => !a || !b || a === b;

/** As linhas da aba, na ordem em que os registros vieram (a linha da nota fica onde estava o primeiro arquivo dela). */
export function linhasDosDocumentos(docs: readonly LancDocumento[]): LinhaDeDocumento[] {
  const grupos = new Map<string, LancDocumento[]>();
  for (const d of docs) {
    const k = chaveDaNota(d);
    if (k) grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  const junta = new Map<string, LinhaDeDocumento>();
  for (const [k, g] of grupos) {
    if (g.length !== 2) continue;
    const pdf = g.find((d) => formatoDoArquivo(d) === 'pdf') ?? null;
    const xml = g.find((d) => formatoDoArquivo(d) === 'xml') ?? null;
    if (!pdf || !xml) continue;
    if (!semContradicao(chave44(pdf), chave44(xml)) || !semContradicao(cnpjDe(pdf), cnpjDe(xml))
      || !semContradicao(semZeros(pdf.serie) || null, semZeros(xml.serie) || null)) continue;
    const principal = xml.valorDocumento == null && pdf.valorDocumento != null ? pdf : xml;
    junta.set(k, { principal, pdf, xml, membros: [g[0], g[1]] });
  }
  const linhas: LinhaDeDocumento[] = [];
  const vistos = new Set<string>();
  for (const d of docs) {
    const k = chaveDaNota(d);
    const l = k ? junta.get(k) : undefined;
    if (l && k) {
      if (!vistos.has(k)) { vistos.add(k); linhas.push(l); }
      continue;
    }
    const f = formatoDoArquivo(d);
    linhas.push({ principal: d, pdf: f === 'pdf' ? d : null, xml: f === 'xml' ? d : null, membros: [d] });
  }
  return linhas;
}

/** O que abrir na linha: o PDF; sem PDF e com XML, os itens; senao o arquivo que houver. */
export function oQueAbrir(l: LinhaDeDocumento): { tipo: 'arquivo'; doc: LancDocumento } | { tipo: 'itens'; doc: LancDocumento } | null {
  if (l.pdf?.url) return { tipo: 'arquivo', doc: l.pdf };
  if (l.xml?.url) return { tipo: 'itens', doc: l.xml };
  return l.principal.url ? { tipo: 'arquivo', doc: l.principal } : null;
}
