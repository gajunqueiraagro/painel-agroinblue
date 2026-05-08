#!/usr/bin/env tsx
/**
 * AUDITORIA DE COBERTURA — classificador soberano vs legado.
 *
 * Compara, sobre lançamentos REALIZADOS de saída do cliente/ano/fazenda
 * informados, as decisões de:
 *   - classificarSaidaFluxo()              — pipeline legado (catFluxo/heurística)
 *   - classificarSaidaFinanceiraOficial()  — pipeline soberano (literais oficiais)
 *
 * Objetivo: medir delta financeiro POR BUCKET, listar divergências, overlaps
 * (lançamento que satisfaz mais de um literal) e lançamentos sem classificação
 * soberana — antes de qualquer migração de consumidor.
 *
 * REGRAS:
 *   - Apenas mede. Não corrige dados, não aplica fallback, não muda código.
 *   - Mesmo filtro de useFinanceiro: cancelado=false, sem_movimentacao_caixa=false,
 *     status_transacao='realizado', cenario='realizado'.
 *
 * USO:
 *   npx tsx scripts/auditClassificadorFinanceiro.ts \
 *     --cliente=<uuid> --ano=2026 --fazenda=<uuid|global>
 *
 * AUTENTICAÇÃO (escolha um):
 *   .env.local com SUPABASE_AUDIT_EMAIL + SUPABASE_AUDIT_PASSWORD  (recomendado)
 *   .env.local com SUPABASE_SERVICE_ROLE_KEY                       (bypass RLS)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  isRealizado,
  isSaida,
  classificarSaidaFluxo,
  classificarSaidaFinanceiraOficial,
  isDeducaoReceitas,
  isDividendoOuRetirada,
  isAmortizacao,
  isReposicaoBovinos,
  isJurosPecuaria,
  isJurosAgricultura,
  isCusteioProducaoPecuaria,
  isCusteioProducaoAgricultura,
  isInvestimentoFazendaPecuaria,
  isInvestimentoFazendaAgricultura,
  type LancamentoClassificavel,
} from '../src/lib/financeiro/classificacao';

// ─── Tipos auxiliares ───────────────────────────────────────────────────────

type SoberanoBucket = 'deducao' | 'dividendos' | 'amortizacoes' | 'reposicao' | 'desembolso';
type LegadoBucket = SoberanoBucket; // classificarSaidaFluxo retorna a mesma união

interface LancRow {
  l: LancamentoClassificavel & { id?: string; descricao?: string | null; obs?: string | null };
  valor: number;
  legado: LegadoBucket;
  soberano: SoberanoBucket;
  matched: string[];
}

// ─── 1. Loader de .env / .env.local (parser simples, sem dotenv) ────────────

function loadEnv(file: string, override = false) {
  try {
    const txt = readFileSync(file, 'utf-8');
    for (const raw of txt.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?(.*?)"?$/);
      if (!m) continue;
      const [, k, v] = m;
      if (override || !process.env[k]) process.env[k] = v;
    }
  } catch { /* arquivo ausente é ok */ }
}

// ─── 2. CLI args ────────────────────────────────────────────────────────────

function parseArgs() {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-zA-Z0-9_-]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return {
    cliente: out.cliente,
    ano: out.ano ? Number(out.ano) : new Date().getFullYear(),
    fazenda: out.fazenda || 'global',
    limit: out.limit ? Number(out.limit) : 20,
  };
}

// ─── 3. Supabase client autenticado ─────────────────────────────────────────

async function getSupabase() {
  loadEnv('.env');
  loadEnv('.env.local', true); // override

  const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!URL) {
    console.error('ERRO: VITE_SUPABASE_URL ausente em .env / .env.local');
    process.exit(1);
  }

  if (SVC) {
    console.log('✓ Usando service_role key (bypass RLS)');
    return createClient(URL, SVC, { auth: { persistSession: false } });
  }

  if (!ANON) {
    console.error('ERRO: nenhum key disponível (defina VITE_SUPABASE_PUBLISHABLE_KEY ou SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }
  const sb = createClient(URL, ANON, { auth: { persistSession: false } });
  const email = process.env.SUPABASE_AUDIT_EMAIL;
  const password = process.env.SUPABASE_AUDIT_PASSWORD;
  if (!email || !password) {
    console.error('ERRO: anon key requer login. Defina em .env.local:');
    console.error('  SUPABASE_AUDIT_EMAIL="seu@email"');
    console.error('  SUPABASE_AUDIT_PASSWORD="sua-senha"');
    console.error('(ou alternativamente SUPABASE_SERVICE_ROLE_KEY para bypass de RLS)');
    process.exit(1);
  }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('ERRO de autenticação:', error.message);
    process.exit(1);
  }
  console.log(`✓ Autenticado como ${email}`);
  return sb;
}

// ─── 4. Pagination (mesma idéia do fetchAllPaginated) ───────────────────────

async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => any,
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── 5. Formatação ──────────────────────────────────────────────────────────

const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function pad(s: string, n: number, right = false): string {
  if (s.length >= n) return s.slice(0, n);
  return right ? s.padEnd(n) : s.padStart(n);
}

// ─── 6. Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  if (!args.cliente) {
    console.error('Uso: npx tsx scripts/auditClassificadorFinanceiro.ts --cliente=<uuid> --ano=2026 --fazenda=<uuid|global> [--limit=20]');
    process.exit(1);
  }
  console.log(`\n[AUDIT] cliente=${args.cliente} ano=${args.ano} fazenda=${args.fazenda} limit=${args.limit}\n`);

  const sb = await getSupabase();

  // Mesmos filtros do useFinanceiro
  const buildQuery = (from: number, to: number) => {
    let q = sb
      .from('financeiro_lancamentos_v2')
      .select('*')
      .eq('cliente_id', args.cliente)
      .eq('cancelado', false)
      .eq('sem_movimentacao_caixa', false)
      .eq('status_transacao', 'realizado')
      .eq('cenario', 'realizado')
      .gte('data_pagamento', `${args.ano}-01-01`)
      .lte('data_pagamento', `${args.ano}-12-31`);
    if (args.fazenda !== 'global') {
      q = q.eq('fazenda_id', args.fazenda);
    }
    return q.range(from, to);
  };

  console.log('Carregando lançamentos…');
  const lancAll = await fetchAllPaginated<any>(buildQuery);
  console.log(`✓ ${lancAll.length} lançamentos brutos`);

  // Filtra para saídas realizadas (matriz da auditoria)
  const saidas = lancAll.filter((l) => isRealizado(l) && isSaida(l));
  console.log(`  → ${saidas.length} saídas para auditoria\n`);

  // Classifica cada saída
  const rows: LancRow[] = saidas.map((l) => {
    const matched: string[] = [];
    if (isDeducaoReceitas(l))                matched.push('isDeducaoReceitas');
    if (isDividendoOuRetirada(l))            matched.push('isDividendoOuRetirada');
    if (isAmortizacao(l))                    matched.push('isAmortizacao');
    if (isReposicaoBovinos(l))               matched.push('isReposicaoBovinos');
    if (isJurosPecuaria(l))                  matched.push('isJurosPecuaria');
    if (isJurosAgricultura(l))               matched.push('isJurosAgricultura');
    if (isCusteioProducaoPecuaria(l))        matched.push('isCusteioProducaoPecuaria');
    if (isCusteioProducaoAgricultura(l))     matched.push('isCusteioProducaoAgricultura');
    if (isInvestimentoFazendaPecuaria(l))    matched.push('isInvestimentoFazendaPecuaria');
    if (isInvestimentoFazendaAgricultura(l)) matched.push('isInvestimentoFazendaAgricultura');
    return {
      l,
      valor: Math.abs(Number(l.valor) || 0),
      legado: classificarSaidaFluxo(l) as LegadoBucket,
      soberano: classificarSaidaFinanceiraOficial(l),
      matched,
    };
  });

  const totalValor = rows.reduce((s, r) => s + r.valor, 0);
  const overlaps = rows.filter((r) => r.matched.length > 1);
  const semBucketSoberano = rows.filter((r) => r.matched.length === 0 && r.soberano !== 'deducao');
  // ↑ Sem nenhum dos 9 literais marcados E soberano caiu em fallback 'desembolso' (ou 'deducao' se isDeducaoReceitas mais explícito)
  // Reajuste: "sem classificação soberana" = nenhum literal saiu true E soberano = 'desembolso' (default)
  const semClassificacao = rows.filter((r) => r.matched.length === 0);
  const divergentes = rows.filter((r) => r.legado !== r.soberano);

  // ─── 1. RESUMO GERAL ────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. RESUMO GERAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total de saídas:                    ${rows.length}`);
  console.log(`Valor total saídas (Σ |valor|):     R$ ${fmt(totalValor)}`);
  console.log(`Overlaps (>1 literal matched):      ${overlaps.length} (${((overlaps.length / Math.max(1, rows.length)) * 100).toFixed(2)}%)`);
  console.log(`Sem classificação literal alguma:   ${semClassificacao.length} (${((semClassificacao.length / Math.max(1, rows.length)) * 100).toFixed(2)}%)`);
  console.log(`Divergentes legado vs soberano:     ${divergentes.length} (${((divergentes.length / Math.max(1, rows.length)) * 100).toFixed(2)}%)`);
  console.log();

  // ─── 2. TABELA POR BUCKET ───────────────────────────────────────────────
  const buckets: SoberanoBucket[] = ['deducao', 'dividendos', 'amortizacoes', 'reposicao', 'desembolso'];
  const tally = (key: 'legado' | 'soberano') => {
    const out: Record<SoberanoBucket, { count: number; valor: number }> = {
      deducao: { count: 0, valor: 0 },
      dividendos: { count: 0, valor: 0 },
      amortizacoes: { count: 0, valor: 0 },
      reposicao: { count: 0, valor: 0 },
      desembolso: { count: 0, valor: 0 },
    };
    for (const r of rows) {
      const b = key === 'legado' ? r.legado : r.soberano;
      out[b].count += 1;
      out[b].valor += r.valor;
    }
    return out;
  };
  const legadoT = tally('legado');
  const soberanoT = tally('soberano');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2. TABELA POR BUCKET');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    pad('Bucket', 14, true),
    pad('Legado (n)', 10), pad('Legado (R$)', 18),
    pad('Soberano (n)', 12), pad('Soberano (R$)', 18),
    pad('ΔR$', 18), pad('Δ%', 10),
  );
  let totalDeltaAbs = 0;
  for (const b of buckets) {
    const lv = legadoT[b].valor;
    const sv = soberanoT[b].valor;
    const delta = sv - lv;
    totalDeltaAbs += Math.abs(delta);
    const dpct = lv > 0 ? `${((delta / lv) * 100).toFixed(2)}%` : (sv > 0 ? '+∞%' : '0%');
    console.log(
      pad(b, 14, true),
      pad(String(legadoT[b].count), 10), pad(fmt(lv), 18),
      pad(String(soberanoT[b].count), 12), pad(fmt(sv), 18),
      pad(fmt(delta), 18), pad(dpct, 10),
    );
  }
  console.log();
  console.log(`Δ absoluto total entre buckets: R$ ${fmt(totalDeltaAbs)}`);
  console.log();

  // ─── 3. DIVERGÊNCIAS (top N por valor) ──────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`3. DIVERGÊNCIAS — top ${args.limit} por valor (de ${divergentes.length} total)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const divSorted = [...divergentes].sort((a, b) => b.valor - a.valor).slice(0, args.limit);
  for (const r of divSorted) {
    const l = r.l as any;
    console.log(
      `[${l.data_pagamento}] R$ ${fmt(r.valor)}  legado=${r.legado}  soberano=${r.soberano}`,
    );
    console.log(
      `   id=${l.id ?? '-'}  macro="${l.macro_custo ?? '-'}"  grupo="${l.grupo_custo ?? '-'}"  centro="${l.centro_custo ?? '-'}"  sub="${l.subcentro ?? '-'}"`,
    );
    console.log(`   matched=[${r.matched.join(', ') || '— nenhum literal'}]`);
    if (l.descricao || l.obs) console.log(`   desc="${l.descricao ?? l.obs ?? ''}"`);
  }
  console.log();

  // ─── 4. SEM CLASSIFICAÇÃO (literal) ─────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`4. SEM CLASSIFICAÇÃO LITERAL — top ${args.limit} por valor (de ${semClassificacao.length} total)`);
  console.log('   (lançamentos onde nenhum literal oficial retornou true; soberano caiu no fallback)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const semSorted = [...semClassificacao].sort((a, b) => b.valor - a.valor).slice(0, args.limit);
  for (const r of semSorted) {
    const l = r.l as any;
    console.log(`[${l.data_pagamento}] R$ ${fmt(r.valor)}  legado=${r.legado}  soberano=${r.soberano}`);
    console.log(
      `   id=${l.id ?? '-'}  macro="${l.macro_custo ?? '-'}"  grupo="${l.grupo_custo ?? '-'}"  centro="${l.centro_custo ?? '-'}"  sub="${l.subcentro ?? '-'}"`,
    );
  }
  console.log();

  // ─── 5. OVERLAPS ────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`5. OVERLAPS — top ${args.limit} por valor (de ${overlaps.length} total)`);
  console.log('   (lançamentos satisfazendo >1 literal — sob soberano só o primeiro vence pela ordem oficial)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const ovSorted = [...overlaps].sort((a, b) => b.valor - a.valor).slice(0, args.limit);
  for (const r of ovSorted) {
    const l = r.l as any;
    console.log(`[${l.data_pagamento}] R$ ${fmt(r.valor)}  soberano=${r.soberano}`);
    console.log(
      `   id=${l.id ?? '-'}  macro="${l.macro_custo ?? '-'}"  grupo="${l.grupo_custo ?? '-'}"  centro="${l.centro_custo ?? '-'}"  sub="${l.subcentro ?? '-'}"`,
    );
    console.log(`   matched=[${r.matched.join(', ')}]`);
  }
  console.log();

  // ─── 6. RECOMENDAÇÃO AUTOMÁTICA ─────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('6. RECOMENDAÇÃO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const total = Math.max(1, rows.length);
  const pctDiv = (divergentes.length / total) * 100;
  const pctOv = (overlaps.length / total) * 100;
  const pctSem = (semClassificacao.length / total) * 100;
  const deltaPctTotal = totalValor > 0 ? (totalDeltaAbs / totalValor) * 100 : 0;

  console.log(`Δ valor entre buckets: ${deltaPctTotal.toFixed(2)}% do total movimentado`);
  console.log(`Divergências: ${pctDiv.toFixed(2)}% dos lançamentos`);
  console.log(`Overlaps:     ${pctOv.toFixed(2)}% dos lançamentos`);
  console.log(`Sem literal:  ${pctSem.toFixed(2)}% dos lançamentos`);
  console.log();

  let rec: string;
  if (deltaPctTotal < 1 && pctOv === 0 && pctSem < 1) {
    rec = '✅ SEGURO MIGRAR — divergência mínima, sem overlaps, dados bem classificados.';
  } else if (deltaPctTotal < 10 && pctOv < 1 && pctSem < 5) {
    rec = '⚠️  MIGRAÇÃO COM RISCO — revisar manualmente as top divergências e overlaps antes do switch.';
  } else {
    rec = '🛑 DADOS PRECISAM SANEAMENTO — delta alto ou muitos lançamentos sem literal. Corrigir plano de contas antes da migração.';
  }
  console.log(rec);
  console.log();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
