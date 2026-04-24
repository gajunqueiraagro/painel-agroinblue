#!/usr/bin/env node
/**
 * Classifica cada CREATE TABLE do arquivo migration vs estado atual do proto
 * (lido via OpenAPI do PostgREST).
 *
 * Uso:
 *   node scripts/classify-migration.mjs \
 *        <migration.sql> <proto_openapi.json> <out_safe> <out_merge>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , MIG, OAS, OUT_SAFE, OUT_MERGE] = process.argv;
if (!MIG || !OAS || !OUT_SAFE || !OUT_MERGE) {
  console.error('Uso: classify-migration.mjs <mig.sql> <openapi.json> <safe.sql> <merge.sql>');
  process.exit(2);
}

// Funções que NUNCA devem ser sobrescritas (CONFLICT).
const CONFLICT_FUNCTIONS = new Set([
  'get_status_pilares_fechamento',
  'can_close_valor_rebanho',
  'reabrir_pilar_fechamento',
  'guard_valor_rebanho_requer_p1_fechado',
  'validar_conciliacao_rebanho',
]);

// ---------- Ler estado proto via OpenAPI ----------
const oas = JSON.parse(readFileSync(OAS, 'utf8'));
const protoTables = new Map(); // nome -> Set(colunas)
for (const [name, def] of Object.entries(oas.definitions || {})) {
  const props = Object.keys(def.properties || {});
  protoTables.set(name, new Set(props));
}

// ---------- Parser de CREATE TABLE ----------
const sql = readFileSync(MIG, 'utf8');

function extractCreateTables(text) {
  const out = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const start = re.lastIndex - 1; // posição do '('
    // Caminha até encontrar ')' na profundidade 0, respeitando strings e $$-quotes.
    let depth = 1;
    let i = start + 1;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      const nx = text[i + 1];
      if (ch === '-' && nx === '-') { const e = text.indexOf('\n', i); i = e === -1 ? text.length : e + 1; continue; }
      if (ch === '/' && nx === '*') { const e = text.indexOf('*/', i + 2); i = e === -1 ? text.length : e + 2; continue; }
      if (ch === "'") {
        i++;
        while (i < text.length) {
          if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
          if (text[i] === "'") { i++; break; }
          i++;
        }
        continue;
      }
      if (ch === '$') {
        const dm = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
        if (dm) { const tag = dm[0]; const e = text.indexOf(tag, i + tag.length); i = e === -1 ? text.length : e + tag.length; continue; }
      }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }
    const bodyStart = start + 1;
    const bodyEnd = i - 1; // aponta para ')'
    const body = text.slice(bodyStart, bodyEnd);

    // Semicolon para fechar o statement
    const semiIdx = text.indexOf(';', i);
    const fullEnd = semiIdx === -1 ? i : semiIdx + 1;
    const fullStmt = text.slice(m.index, fullEnd);

    out.push({ name, body, fullStmt });
  }
  return out;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let buf = '';
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    const nx = body[i + 1];
    if (ch === '-' && nx === '-') { const e = body.indexOf('\n', i); const stop = e === -1 ? body.length : e + 1; buf += body.slice(i, stop); i = stop; continue; }
    if (ch === "'") {
      buf += ch; i++;
      while (i < body.length) {
        buf += body[i];
        if (body[i] === "'" && body[i + 1] === "'") { buf += body[i + 1]; i += 2; continue; }
        if (body[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '(') { depth++; buf += ch; i++; continue; }
    if (ch === ')') { depth--; buf += ch; i++; continue; }
    if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; i++; continue; }
    buf += ch; i++;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function parseColumnDefs(body) {
  const parts = splitTopLevel(body);
  const cols = [];
  for (const p of parts) {
    const t = p.trim();
    // Pular constraints de tabela
    if (/^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|CONSTRAINT|EXCLUDE)\b/i.test(t)) continue;
    // Nome da coluna: primeira palavra (com ou sem aspas)
    const nm = /^"([^"]+)"/.exec(t) || /^([a-z_][a-z0-9_]*)/i.exec(t);
    if (!nm) continue;
    cols.push({ name: nm[1], ddl: t });
  }
  return cols;
}

// ---------- Classificar ----------
const tables = extractCreateTables(sql);
const classification = { safe: [], skip: [], merge: [], conflict: [] };

for (const t of tables) {
  const proto = protoTables.get(t.name);
  if (!proto) {
    classification.safe.push(t);
    continue;
  }
  const cols = parseColumnDefs(t.body);
  const missing = cols.filter(c => !proto.has(c.name));
  if (missing.length === 0) {
    classification.skip.push({ ...t, cols });
  } else {
    classification.merge.push({ ...t, cols, missing });
  }
}

// Conflict (funções) — detectar no arquivo só para relatar.
const conflictFuncs = [];
const fnRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
let fm;
while ((fm = fnRe.exec(sql)) !== null) {
  if (CONFLICT_FUNCTIONS.has(fm[1])) conflictFuncs.push(fm[1]);
}

// ---------- Gerar arquivos ----------
const HEADER = `-- Gerado em ${new Date().toISOString()}\n-- Fonte: ${MIG}\n\n`;

const safeContent = HEADER +
  `-- ${classification.safe.length} tabela(s) NOVA(S) — não existem no proto.\n\n` +
  classification.safe.map(t => `-- ${t.name}\n${t.fullStmt}\n`).join('\n');
writeFileSync(OUT_SAFE, safeContent);

const mergeStmts = [];
for (const t of classification.merge) {
  mergeStmts.push(`-- ${t.name} — ${t.missing.length} coluna(s) faltando\n`);
  for (const c of t.missing) {
    // Usa o DDL original da coluna, mas adiciona IF NOT EXISTS.
    mergeStmts.push(`ALTER TABLE public.${t.name} ADD COLUMN IF NOT EXISTS ${c.ddl};`);
  }
  mergeStmts.push('');
}
const mergeContent = HEADER +
  `-- ${classification.merge.length} tabela(s) com colunas a adicionar.\n` +
  `-- Colunas faltando: ${classification.merge.reduce((a, t) => a + t.missing.length, 0)} ao total.\n\n` +
  mergeStmts.join('\n');
writeFileSync(OUT_MERGE, mergeContent);

// ---------- Resumo ----------
console.log('\n== RESUMO ==');
console.log(`SAFE  (tabelas novas):          ${classification.safe.length}`);
classification.safe.forEach(t => console.log(`  + ${t.name}`));
console.log(`\nSKIP  (tabelas iguais):         ${classification.skip.length}`);
classification.skip.forEach(t => console.log(`  = ${t.name}`));
console.log(`\nMERGE (tabelas com cols +):     ${classification.merge.length}`);
classification.merge.forEach(t => console.log(`  ~ ${t.name} (+${t.missing.length}: ${t.missing.map(c => c.name).join(', ')})`));
console.log(`\nCONFLICT (funções guardadas):   ${conflictFuncs.length}`);
conflictFuncs.forEach(n => console.log(`  ! ${n}`));
console.log(`\nArquivos gerados:`);
console.log(`  ${OUT_SAFE}`);
console.log(`  ${OUT_MERGE}`);
