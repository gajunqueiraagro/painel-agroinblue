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
  /** CONC-PAINEL-02 ajuste (Gabriel 17:09) — o 1º e o último dia dos movimentos do arquivo (YYYY-MM-DD) e o saldo que o banco declarou */
  periodoDe?: string | null;
  periodoAte?: string | null;
  saldoDeclarado?: number | null;
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
  /** a LISTA (CONC-PAINEL-02 ajuste): o período dos movimentos (só importação), quando entrou, quantos movimentos e o saldo final declarado */
  periodoDe: string | null;
  periodoAte: string | null;
  enviadoEm: string | null;
  movimentos: number | null;
  saldoFinal: number | null;
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
        periodoDe: null, periodoAte: null, enviadoEm: c.enviadoEm, movimentos: null, saldoFinal: null,
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
        periodoDe: i.periodoDe ?? null, periodoAte: i.periodoAte ?? null, enviadoEm: i.data || null, movimentos: i.importados,
        saldoFinal: typeof i.saldoDeclarado === 'number' ? i.saldoDeclarado : null,
      };
    });
  return [...comps, ...imps];
}

/* ─── CONC-PAINEL-02 ajuste (Gabriel 23/11 17:09, print do NJ BB out/26 com 10 arquivos: a faixa virava rolagem lateral infinita) ─── */

/** Até 2 arquivos a faixa mostra os cartões; 3 ou mais = UM cartão de resumo de largura fixa (nunca rolagem lateral). */
export const MAX_CARTOES_NA_FAIXA = 2;

/** O cartão de resumo: "10 arquivos" e "OFX 9 · PDF 1" (o formato mais comum primeiro; empate pelo nome). */
export function resumoDosArquivos(lista: readonly ArquivoDoMes[]): { total: string; formatos: string } {
  const n = new Map<FormatoDoArquivo, number>();
  for (const a of lista) n.set(a.formato, (n.get(a.formato) ?? 0) + 1);
  const formatos = [...n.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([f, k]) => `${f} ${k}`).join(' · ');
  return { total: `${lista.length} ${lista.length === 1 ? 'arquivo' : 'arquivos'}`, formatos };
}

export type ColunaDosArquivos = 'nome' | 'formato' | 'periodo' | 'enviado' | 'movimentos' | 'saldo';

/** A lista ordenada pela coluna clicada. O que não tem o dado ("—") vai SEMPRE para o fim, nos dois sentidos. */
export function ordenarArquivos(lista: readonly ArquivoDoMes[], coluna: ColunaDosArquivos, crescente: boolean): ArquivoDoMes[] {
  const chave = (a: ArquivoDoMes): string | number | null => {
    switch (coluna) {
      case 'nome': return a.nome.toLocaleLowerCase('pt-BR');
      case 'formato': return a.formato;
      case 'periodo': return a.periodoDe ? `${a.periodoDe}|${a.periodoAte ?? ''}` : null; // o início e, no empate, o fim
      case 'enviado': return a.enviadoEm;
      case 'movimentos': return a.movimentos;
      case 'saldo': return a.saldoFinal;
    }
  };
  return lista.slice().sort((a, b) => {
    const x = chave(a); const y = chave(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return crescente ? c : -c;
  });
}

export interface Sobreposicao { a: ArquivoDoMes; b: ArquivoDoMes; de: string; ate: string }

/** Dois arquivos que cobrem OS MESMOS DIAS (o período dos movimentos se cruza, nem que seja num dia). Só aviso: nada muda. */
export function sobreposicoesDePeriodo(lista: readonly ArquivoDoMes[]): Sobreposicao[] {
  const comPeriodo = lista.filter((a) => a.periodoDe && a.periodoAte);
  const r: Sobreposicao[] = [];
  for (let i = 0; i < comPeriodo.length; i++) {
    for (let j = i + 1; j < comPeriodo.length; j++) {
      const a = comPeriodo[i]; const b = comPeriodo[j];
      const de = (a.periodoDe ?? '') > (b.periodoDe ?? '') ? a.periodoDe ?? '' : b.periodoDe ?? '';
      const ate = (a.periodoAte ?? '') < (b.periodoAte ?? '') ? a.periodoAte ?? '' : b.periodoAte ?? '';
      if (de <= ate) r.push({ a, b, de, ate });
    }
  }
  return r;
}
