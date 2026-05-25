import type { ExcelLinhaNormalizada } from './types';
import type {
  CatalogoCliente,
  ContaBancaria,
  Fazenda,
  FornecedorOficial,
  SubcentroUsado,
} from './catalogoCliente';

export interface Sugestao {
  excelKey: string;
  contaSugerida: { id: string; rotulo: string; confianca: number } | null;
  fazendaSugerida: { id: string; nome: string; confianca: number } | null;
  subcentroSugerido: {
    subcentro: string;
    macro_custo: string | null;
    grupo_custo: string | null;
    centro_custo: string | null;
    confianca: number;
    origem: 'historico_fornecedor' | 'similaridade_texto' | 'top_global';
  } | null;
  fornecedorOficial: { id: string; nome: string; confianca: number } | null;
  alertas: string[];
}

export function sugerirParaLinha(
  linha: ExcelLinhaNormalizada,
  cat: CatalogoCliente,
): Sugestao {
  const alertas: string[] = [];
  if (linha.flags.semDataRef) alertas.push('Sem Data_Ref');
  if (linha.flags.competenciaForaDoMes) alertas.push('Competência fora do mês');
  if (linha.flags.tipoInconsistente) alertas.push('Tipo inconsistente com arquivo');
  if (linha.flags.contaInvalida) alertas.push('Conta inválida ("-")');
  if (linha.flags.impreciFloat) alertas.push('Possível imprecisão float');

  return {
    excelKey: linha.chaveLinha,
    contaSugerida: sugerirConta(linha.contaTexto, cat.contas),
    fazendaSugerida: sugerirFazenda(linha.fazendaTexto, cat.fazendas),
    fornecedorOficial: sugerirFornecedor(linha.fornecedor, cat.fornecedores),
    subcentroSugerido: sugerirSubcentro(linha, cat),
    alertas,
  };
}

export function sugerirTodasLinhas(
  linhas: ExcelLinhaNormalizada[],
  cat: CatalogoCliente,
): Map<string, Sugestao> {
  const out = new Map<string, Sugestao>();
  linhas.forEach((l) => {
    out.set(l.chaveLinha, sugerirParaLinha(l, cat));
  });
  return out;
}

// ---------- helpers de normalização ----------

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string, minLen: number = 3): Set<string> {
  return new Set(normalizar(s).split(' ').filter((t) => t.length >= minLen));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const inter = new Set<string>([...a].filter((x) => b.has(x)));
  const union = new Set<string>([...a, ...b]);
  return inter.size / union.size;
}

// ---------- conta ----------

function sugerirConta(
  contaTexto: string,
  contas: ContaBancaria[],
): { id: string; rotulo: string; confianca: number } | null {
  if (!contaTexto || contaTexto === '-' || contas.length === 0) return null;
  const tExcel = tokens(contaTexto, 2); // banco às vezes tem 2 letras (BB)

  let melhor: { id: string; rotulo: string; score: number } | null = null;
  const keywords = ['sicredi', 'itau', 'bba', 'bradesco', 'caixa',
                    'santander', 'pj', 'pf', 'lavoura', 'pecuaria',
                    'pessoal', 'agricultura'];

  for (const c of contas) {
    const rotulo = c.nome_exibicao ?? c.nome_conta;
    const blob = [rotulo, c.banco, c.agencia, c.numero_conta].filter(Boolean).join(' ');
    const tConta = tokens(blob, 2);
    const sim = jaccard(tExcel, tConta);
    let bonus = 0;
    for (const kw of keywords) {
      if (tExcel.has(kw) && tConta.has(kw)) bonus += 0.08;
    }
    const score = Math.min(sim + bonus, 1);
    if (!melhor || score > melhor.score) melhor = { id: c.id, rotulo, score };
  }
  if (!melhor || melhor.score < 0.25) return null;
  return { id: melhor.id, rotulo: melhor.rotulo, confianca: melhor.score };
}

// ---------- fazenda ----------

function sugerirFazenda(
  fazendaTexto: string,
  fazendas: Fazenda[],
): { id: string; nome: string; confianca: number } | null {
  if (!fazendaTexto || fazendas.length === 0) return null;
  const tExcel = tokens(fazendaTexto, 3);
  let melhor: { id: string; nome: string; score: number } | null = null;
  for (const f of fazendas) {
    const sim = jaccard(tExcel, tokens(f.nome, 3));
    if (!melhor || sim > melhor.score) melhor = { id: f.id, nome: f.nome, score: sim };
  }
  if (!melhor || melhor.score < 0.3) return null;
  return { id: melhor.id, nome: melhor.nome, confianca: melhor.score };
}

// ---------- fornecedor ----------

function sugerirFornecedor(
  fornecedorTexto: string,
  fornecedores: FornecedorOficial[],
): { id: string; nome: string; confianca: number } | null {
  if (!fornecedorTexto || fornecedores.length === 0) return null;
  const normalizado = normalizar(fornecedorTexto);
  // 1) exact match em nome_normalizado
  for (const f of fornecedores) {
    if (f.nome_normalizado && f.nome_normalizado === normalizado) {
      return { id: f.id, nome: f.nome, confianca: 1.0 };
    }
  }
  // 2) exact match em aliases
  for (const f of fornecedores) {
    if (f.aliases && f.aliases.some((a) => normalizar(a) === normalizado)) {
      return { id: f.id, nome: f.nome, confianca: 0.95 };
    }
  }
  // 3) Jaccard
  const tExcel = tokens(fornecedorTexto, 3);
  let melhor: { id: string; nome: string; score: number } | null = null;
  for (const f of fornecedores) {
    const sim = jaccard(tExcel, tokens(f.nome, 3));
    if (!melhor || sim > melhor.score) melhor = { id: f.id, nome: f.nome, score: sim };
  }
  if (!melhor || melhor.score < 0.4) return null;
  return { id: melhor.id, nome: melhor.nome, confianca: melhor.score };
}

// ---------- subcentro ----------

function sugerirSubcentro(
  linha: ExcelLinhaNormalizada,
  cat: CatalogoCliente,
): Sugestao['subcentroSugerido'] {
  // 1) Histórico do fornecedor (se acharmos o fornecedor oficial com boa confiança)
  const fSug = sugerirFornecedor(linha.fornecedor, cat.fornecedores);
  if (fSug && fSug.confianca >= 0.7) {
    const hist = cat.subcentroPorFornecedor.get(fSug.id);
    if (hist) {
      return {
        subcentro: hist.subcentro,
        macro_custo: hist.macro,
        grupo_custo: hist.grupo,
        centro_custo: hist.centro,
        confianca: 0.85 * fSug.confianca,
        origem: 'historico_fornecedor',
      };
    }
  }
  // 2) Similaridade textual com subcentros usados
  if (linha.subcentro && cat.subcentros.length > 0) {
    const tExcel = tokens(linha.subcentro, 3);
    let melhor: { sub: SubcentroUsado; score: number } | null = null;
    for (const s of cat.subcentros) {
      const sim = jaccard(tExcel, tokens(s.subcentro, 3));
      if (!melhor || sim > melhor.score) melhor = { sub: s, score: sim };
    }
    if (melhor && melhor.score >= 0.5) {
      return {
        subcentro: melhor.sub.subcentro,
        macro_custo: melhor.sub.macro_custo,
        grupo_custo: melhor.sub.grupo_custo,
        centro_custo: melhor.sub.centro_custo,
        confianca: melhor.score,
        origem: 'similaridade_texto',
      };
    }
  }
  return null;
}
