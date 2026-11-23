/**
 * CONC-PAINEL-ARQUIVOS-01 (Gabriel 23/11, D2: "lib única arquivosDoMes, só o mês") — OS ARQUIVOS DA CONTA NO MÊS, numa regra só.
 * ⚠ O CHIP "PDF" DA LINHA E O PAINEL LIAM DUAS TABELAS: o chip, os comprovantes de saldo (`financeiro_saldo_documentos`); a aba
 *   "Importações" do painel, só `financeiro_importacoes_v2`. O Bradesco-VGBL da Santa Rita (set/26) mostrava o chip e o painel dizia
 *   "Nenhum arquivo importado" — 307 conta-mês assim no proto (FASE 0, 23/11). Agora a tela carrega os comprovantes do ano UMA vez e o
 *   chip (`contasComComprovante`) e o painel (`arquivosDoMes`) leem dessa mesma lista, por estas funções.
 * ⚠ O MÊS DA IMPORTAÇÃO É O DOS MOVIMENTOS (`importacoesDoMes`, PR-IMPORTACOES-MES-01), nunca o do envio; o do comprovante é o `ano_mes`
 *   em que ele foi anexado (o ✎ do saldo daquele mês).
 * Puro: sem banco, sem React.
 */

export interface ComprovanteDoMes {
  id: string;
  contaId: string;
  /** YYYY-MM */
  anoMes: string;
  nome: string;
  /** o tipo MIME gravado no envio (application/pdf, image/jpeg…) */
  tipo: string | null;
  /** o caminho no bucket; `null` = registrado e o arquivo não subiu */
  caminho: string | null;
  enviadoEm: string | null;
}

/** A importação como o painel a mostra: o que `useImportacoesDaConta` já devolve (só as do mês, só as vivas). */
export interface ImportacaoDoMes {
  id: string;
  nomeArquivo: string;
  /** quando foi importada (ISO) */
  data: string;
  importados: number;
  tipoArquivo?: string | null;
  saldoDeclaradoData?: string | null;
  /** o original no bucket (lote 115620, importações de 23/11/2026 em diante); nulo = "o arquivo original não foi guardado" */
  arquivoCaminho?: string | null;
}

export type FormatoDoArquivo = 'PDF' | 'IMG' | 'OFX' | 'CSV' | 'XLS' | 'OF' | 'ARQ';
export type OrigemDoArquivo = 'comprovante' | 'importacao';

export interface ArquivoDoMes {
  /** única na lista: origem + id */
  chave: string;
  origem: OrigemDoArquivo;
  id: string;
  nome: string;
  formato: FormatoDoArquivo;
  /** a linha de baixo do cartão: o que é · a data que importa · o volume */
  detalhe: string;
  /** só comprovante: o caminho no bucket (Ver/Baixar) */
  caminho: string | null;
  /** o que dá para fazer: comprovante sem arquivo no bucket não abre; importação não guarda o original (D1 a, Gabriel 23/11) */
  podeVer: boolean;
  podeBaixar: boolean;
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const ddmm = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}` : '—';
};

/** Uma linha de `financeiro_saldo_documentos` (select id, conta_bancaria_id, ano_mes, nome, tipo, url, uploaded_em). Linha torta = null. */
export function lerComprovante(raw: Record<string, unknown>): ComprovanteDoMes | null {
  const id = txt(raw.id);
  const contaId = txt(raw.conta_bancaria_id);
  const anoMes = txt(raw.ano_mes);
  if (!id || !contaId || !anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) return null;
  return { id, contaId, anoMes, nome: txt(raw.nome) ?? 'arquivo sem nome', tipo: txt(raw.tipo), caminho: txt(raw.url), enviadoEm: txt(raw.uploaded_em) };
}

/** O chip "PDF" da linha: as contas com comprovante no mês. */
export function contasComComprovante(lista: readonly ComprovanteDoMes[], anoMes: string): Set<string> {
  return new Set(lista.filter((c) => c.anoMes === anoMes).map((c) => c.contaId));
}

/** O formato pelo tipo gravado e, sem ele, pela extensão do nome. */
export function formatoDoArquivo(nome: string, tipo?: string | null): FormatoDoArquivo {
  const t = (tipo ?? '').toLowerCase();
  if (t === 'open_finance') return 'OF';
  if (t.includes('pdf')) return 'PDF';
  if (t.startsWith('image/')) return 'IMG';
  if (t === 'ofx') return 'OFX';
  if (t === 'csv') return 'CSV';
  const ext = /\.([a-z0-9]+)$/i.exec(nome)?.[1]?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'IMG';
  if (ext === 'ofx') return 'OFX';
  if (ext === 'csv' || ext === 'txt') return 'CSV';
  if (ext === 'xls' || ext === 'xlsx') return 'XLS';
  if (/^open finance/i.test(nome)) return 'OF';
  return 'ARQ';
}

/** Os arquivos da conta no mês: os comprovantes de saldo (mais recente primeiro) e depois as importações do mês (idem). */
export function arquivosDoMes(p: {
  comprovantes: readonly ComprovanteDoMes[];
  importacoesDoMes: readonly ImportacaoDoMes[];
  contaId: string;
  anoMes: string;
}): ArquivoDoMes[] {
  const desc = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
  const comps = p.comprovantes
    .filter((c) => c.contaId === p.contaId && c.anoMes === p.anoMes)
    .slice()
    .sort((a, b) => desc(a.enviadoEm, b.enviadoEm))
    .map((c): ArquivoDoMes => {
      const formato = formatoDoArquivo(c.nome, c.tipo);
      return {
        chave: `comprovante:${c.id}`, origem: 'comprovante', id: c.id, nome: c.nome, formato,
        detalhe: c.caminho ? `comprovante de saldo · anexado ${ddmm(c.enviadoEm)}` : 'comprovante de saldo · o arquivo não subiu',
        caminho: c.caminho,
        podeVer: !!c.caminho && (formato === 'PDF' || formato === 'IMG'),
        podeBaixar: !!c.caminho,
      };
    });
  const imps = p.importacoesDoMes
    .slice()
    .sort((a, b) => desc(a.data, b.data))
    .map((i): ArquivoDoMes => {
      const formato = formatoDoArquivo(i.nomeArquivo, i.tipoArquivo);
      const saldo = i.saldoDeclaradoData ? ` · saldo ${ddmm(i.saldoDeclaradoData)}` : '';
      return {
        chave: `importacao:${i.id}`, origem: 'importacao', id: i.id, nome: i.nomeArquivo, formato,
        detalhe: `extrato importado ${ddmm(i.data)}${saldo} · ${i.importados} mov.`,
        caminho: i.arquivoCaminho ?? null,
        /* "Ver" de uma importação = os movimentos que ela trouxe (D1 a); "Baixar" = o original, só nas NOVAS (D1 b, lote 115620) */
        podeVer: true,
        podeBaixar: !!i.arquivoCaminho,
      };
    });
  return [...comps, ...imps];
}
