/**
 * Módulo de detecção de duplicidade para importação financeira.
 * 
 * Regras determinísticas e explicáveis:
 * - DUPLICADO_EXATO: match forte em campos-chave
 * - SUSPEITA: semelhança parcial sem certeza
 * - NOVO: sem conflito relevante
 * 
 * Cada classificação retorna motivos[] explicando a decisão.
 */

// ── Types ──

export type ClassificacaoImportacao = 'NOVO' | 'DUPLICADO_EXATO' | 'SUSPEITA';

export interface MotivoConflito {
  campo: string;
  match: boolean;
  detalhe: string;
}

export interface ResultadoClassificacao {
  classificacao: ClassificacaoImportacao;
  motivos: MotivoConflito[];
  resumo: string;
  registroExistenteId: string | null;
}

export interface RegistroExistente {
  id: string;
  data_pagamento: string | null;
  data_competencia?: string | null;
  valor: number | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  conta_bancaria_id: string | null;
  conta_nome?: string | null;
  subcentro: string | null;
  centro_custo: string | null;
  descricao: string | null;
  numero_documento: string | null;
  tipo_operacao: string | null;
  ano_mes: string | null;
}

export interface LinhaParaClassificar {
  dataPagamento: string | null;
  anoMes: string;
  valor: number;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  contaBancariaId: string | null;
  subcentro: string | null;
  descricao: string | null;
  numeroDocumento: string | null;
  tipoOperacao: string | null;
}

// ── Normalization ──

function norm(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function valorIgual(a: number, b: number | null): boolean {
  if (b === null) return false;
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 1; // ±R$0,01
}

function valorProximo(a: number, b: number | null, pct = 0.05): boolean {
  if (b === null || b === 0) return false;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= pct;
}

function dataIgual(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim() === b.trim();
}

function datasProximas(a: string | null, b: string | null, diasMax = 3): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return Math.abs(da.getTime() - db.getTime()) <= diasMax * 86400000;
}

function textoSimilar(a: string | null, b: string | null, threshold = 0.9): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  
  // Jaccard word similarity
  const wa = new Set(na.split(' ').filter(w => w.length >= 2));
  const wb = new Set(nb.split(' ').filter(w => w.length >= 2));
  if (wa.size === 0 || wb.size === 0) return false;
  let intersection = 0;
  for (const w of wa) {
    if (wb.has(w)) intersection++;
  }
  const union = new Set([...wa, ...wb]).size;
  return union > 0 && (intersection / union) >= threshold;
}

function fornecedorIgual(importId: string | null, existId: string | null): boolean {
  if (!importId || !existId) return false;
  return importId === existId;
}

function fornecedorSemelhante(importNome: string | null, existNome: string | null): boolean {
  const na = norm(importNome);
  const nb = norm(existNome);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Jaccard ≥ 50%
  const wa = na.split(' ').filter(w => w.length >= 3);
  const wb = nb.split(' ').filter(w => w.length >= 3);
  if (wa.length === 0 || wb.length === 0) return false;
  let shared = 0;
  for (const w of wa) {
    if (wb.some(x => x.includes(w) || w.includes(x))) shared++;
  }
  return shared / Math.max(wa.length, wb.length) >= 0.5;
}

function contaIgual(importId: string | null, existId: string | null): boolean {
  if (!importId || !existId) return false;
  return importId === existId;
}

function documentoIgual(a: string | null, b: string | null): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb;
}

// ── Hash generation ──

export function gerarHashImportacao(
  data: string | null,
  valor: number,
  fornecedorNorm: string | null,
  contaId: string | null,
  documento: string | null,
): string {
  const parts = [
    (data || '').trim(),
    String(Math.round(valor * 100)),
    norm(fornecedorNorm),
    (contaId || '').trim(),
    norm(documento),
  ];
  // Simple deterministic hash (not crypto, just for dedup support)
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

// ── Classification ──

/**
 * Classifica uma linha importada contra TODOS os registros existentes
 * para a mesma fazenda+anoMes (sem filtrar por fornecedor na busca).
 */
export function classificarLinha(
  linha: LinhaParaClassificar,
  existentes: RegistroExistente[],
): ResultadoClassificacao {
  if (existentes.length === 0) {
    return { classificacao: 'NOVO', motivos: [], resumo: 'Nenhum registro existente para comparação', registroExistenteId: null };
  }

  let melhorClassificacao: ClassificacaoImportacao = 'NOVO';
  let melhorMotivos: MotivoConflito[] = [];
  let melhorResumo = '';
  let melhorId: string | null = null;
  let melhorScore = 0;

  for (const ex of existentes) {
    const motivos: MotivoConflito[] = [];
    
    // Check each field
    const mValor = valorIgual(linha.valor, ex.valor);
    motivos.push({ campo: 'Valor', match: mValor, detalhe: mValor ? `Igual: R$ ${linha.valor.toFixed(2)}` : `Arquivo: R$ ${linha.valor.toFixed(2)} | Banco: R$ ${(ex.valor ?? 0).toFixed(2)}` });

    const mDataPagto = dataIgual(linha.dataPagamento, ex.data_pagamento);
    motivos.push({ campo: 'Data Pagamento', match: mDataPagto, detalhe: mDataPagto ? `Igual: ${linha.dataPagamento}` : `Arquivo: ${linha.dataPagamento || '—'} | Banco: ${ex.data_pagamento || '—'}` });

    const mFornecedor = fornecedorIgual(linha.fornecedorId, ex.fornecedor_id);
    const mFornecedorSemelhante = !mFornecedor && fornecedorSemelhante(linha.fornecedorNome, ex.fornecedor_nome);
    motivos.push({ campo: 'Fornecedor', match: mFornecedor, detalhe: mFornecedor ? `Igual: ${linha.fornecedorNome || '—'}` : mFornecedorSemelhante ? `Semelhante: "${linha.fornecedorNome}" ≈ "${ex.fornecedor_nome}"` : `Diferente: "${linha.fornecedorNome || '—'}" ≠ "${ex.fornecedor_nome || '—'}"` });

    const mConta = contaIgual(linha.contaBancariaId, ex.conta_bancaria_id);
    motivos.push({ campo: 'Conta', match: mConta, detalhe: mConta ? 'Mesma conta' : 'Contas diferentes' });

    const mDocumento = documentoIgual(linha.numeroDocumento, ex.numero_documento);
    motivos.push({ campo: 'Documento', match: mDocumento, detalhe: mDocumento ? `Igual: ${linha.numeroDocumento}` : `Arquivo: ${linha.numeroDocumento || '—'} | Banco: ${ex.numero_documento || '—'}` });

    const mDescricao = textoSimilar(linha.descricao, ex.descricao);
    motivos.push({ campo: 'Descrição', match: mDescricao, detalhe: mDescricao ? 'Descrição similar (≥90%)' : `Arquivo: "${(linha.descricao || '').substring(0, 40)}" | Banco: "${(ex.descricao || '').substring(0, 40)}"` });

    // ── DUPLICADO EXATO ──
    // Todas obrigatórias: valor + data + conta + fornecedor
    // + pelo menos 1 complementar: documento OU descrição similar
    const obrigatoriasOk = mValor && mDataPagto && mConta && mFornecedor;
    const complementarOk = mDocumento || mDescricao;

    if (obrigatoriasOk && complementarOk) {
      const resumoParts = ['valor igual', 'mesma data', 'mesma conta', 'mesmo fornecedor'];
      if (mDocumento) resumoParts.push('mesmo documento');
      if (mDescricao) resumoParts.push('descrição similar');
      const resumo = `DUPLICADO EXATO: ${resumoParts.join(' + ')}`;
      // Always pick exact match if found
      return { classificacao: 'DUPLICADO_EXATO', motivos, resumo, registroExistenteId: ex.id };
    }

    if (obrigatoriasOk && !complementarOk) {
      // All 4 mandatory match but no complementary → still exact
      const resumo = 'DUPLICADO EXATO: valor + data + conta + fornecedor iguais';
      return { classificacao: 'DUPLICADO_EXATO', motivos, resumo, registroExistenteId: ex.id };
    }

    // ── SUSPEITA ──
    let score = 0;
    const suspeitaParts: string[] = [];

    if (mValor && mDataPagto) { score += 3; suspeitaParts.push('mesmo valor + mesma data'); }
    if (mValor && mFornecedor) { score += 3; suspeitaParts.push('mesmo valor + mesmo fornecedor'); }
    if (mDataPagto && (mFornecedor || mFornecedorSemelhante)) { score += 2; suspeitaParts.push('mesma data + fornecedor semelhante'); }
    if (mDescricao && valorProximo(linha.valor, ex.valor)) { score += 2; suspeitaParts.push('descrição similar + valor próximo'); }
    if (mDocumento && !mValor) { score += 2; suspeitaParts.push('mesmo documento + valor diferente'); }
    if (mConta && mValor && datasProximas(linha.dataPagamento, ex.data_pagamento)) { score += 2; suspeitaParts.push('mesma conta + valor igual + datas próximas'); }

    if (score > melhorScore) {
      melhorScore = score;
      melhorMotivos = motivos;
      melhorResumo = `SUSPEITA: ${suspeitaParts.join('; ')}`;
      melhorId = ex.id;
      melhorClassificacao = score >= 2 ? 'SUSPEITA' : 'NOVO';
    }
  }

  if (melhorClassificacao === 'SUSPEITA') {
    return { classificacao: 'SUSPEITA', motivos: melhorMotivos, resumo: melhorResumo, registroExistenteId: melhorId };
  }

  return { classificacao: 'NOVO', motivos: [], resumo: 'Nenhum conflito relevante encontrado', registroExistenteId: null };
}
