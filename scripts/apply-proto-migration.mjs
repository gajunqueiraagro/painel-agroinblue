#!/usr/bin/env node
/**
 * Aplica um arquivo SQL no banco proto via Supabase Management API.
 *
 * Uso: node scripts/apply-proto-migration.mjs <arquivo.sql>
 *
 * Requer env SUPABASE_PROTO_TOKEN (ou hardcode via --token).
 *
 * Splitter SQL que respeita:
 *   - dollar-quoted blocks $tag$...$tag$
 *   - single/double quoted strings
 *   - line comments (--) e block comments (/* *​/)
 */

import { readFileSync } from 'node:fs';

const PROJECT_REF = 'binbcdfbisgscrifztia';
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

// Erros considerados "já aplicado" — não incrementam falhas.
const IDEMPOTENT_PATTERNS = [
  /already exists/i,
  /duplicate (object|key|column)/i,
  /relation ".*" already exists/i,
  /trigger ".*" for relation ".*" already exists/i,
  /constraint ".*" for relation ".*" already exists/i,
  /policy ".*" for table ".*" already exists/i,
];

function splitSql(sql) {
  const statements = [];
  let i = 0;
  let buf = '';
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? n : end + 1;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Single-quote string
    if (ch === "'") {
      buf += ch;
      i += 1;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === "'" && sql[i + 1] === "'") {
          buf += sql[i + 1];
          i += 2;
          continue;
        }
        if (sql[i] === "'") { i += 1; break; }
        i += 1;
      }
      continue;
    }

    // Dollar-quoted string: $tag$...$tag$
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0]; // includes $...$
        buf += tag;
        i += tag.length;
        const endIdx = sql.indexOf(tag, i);
        if (endIdx === -1) {
          // unterminated — bail out by consuming rest
          buf += sql.slice(i);
          i = n;
        } else {
          buf += sql.slice(i, endIdx + tag.length);
          i = endIdx + tag.length;
        }
        continue;
      }
    }

    // Statement separator
    if (ch === ';') {
      const stmt = buf.trim();
      if (stmt.length > 0) statements.push(stmt + ';');
      buf = '';
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

async function runQuery(token, query) {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: resp.status, ok: resp.ok, body };
}

function isIdempotentError(msg) {
  if (typeof msg !== 'string') return false;
  return IDEMPOTENT_PATTERNS.some(re => re.test(msg));
}

function shortStmt(s) {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 117) + '…' : clean;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node apply-proto-migration.mjs <arquivo.sql>');
    process.exit(2);
  }
  const token = process.env.SUPABASE_PROTO_TOKEN;
  if (!token) {
    console.error('Defina SUPABASE_PROTO_TOKEN no ambiente.');
    process.exit(2);
  }

  console.log(`→ Endpoint: ${ENDPOINT}`);
  console.log(`→ Arquivo:  ${file}\n`);

  // Smoke test
  console.log('== AUTH TEST ==');
  const t = await runQuery(token, 'SELECT 1 AS ok;');
  console.log(`   status=${t.status}`);
  if (!t.ok) {
    console.error('Auth falhou:', JSON.stringify(t.body, null, 2));
    process.exit(1);
  }
  console.log('   OK\n');

  const sql = readFileSync(file, 'utf8');
  const stmts = splitSql(sql);
  console.log(`== STATEMENTS: ${stmts.length} ==\n`);

  let ok = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const r = await runQuery(token, s);
    if (r.ok) {
      ok += 1;
      process.stdout.write('.');
    } else {
      const msg = typeof r.body === 'object' ? (r.body.message || r.body.error || JSON.stringify(r.body)) : String(r.body);
      if (isIdempotentError(msg)) {
        skipped += 1;
        process.stdout.write('~');
      } else {
        failures.push({ idx: i + 1, stmt: shortStmt(s), status: r.status, msg });
        process.stdout.write('x');
      }
    }
    if ((i + 1) % 80 === 0) process.stdout.write(`  ${i + 1}/${stmts.length}\n`);
  }
  process.stdout.write('\n\n');

  console.log('== RESUMO ==');
  console.log(`   OK aplicado:    ${ok}`);
  console.log(`   skip (exists):  ${skipped}`);
  console.log(`   falhas:         ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n== FALHAS ==');
    for (const f of failures.slice(0, 50)) {
      console.log(`\n#${f.idx} (HTTP ${f.status})`);
      console.log(`  stmt: ${f.stmt}`);
      console.log(`  erro: ${f.msg}`);
    }
    if (failures.length > 50) console.log(`\n  (... ${failures.length - 50} falhas adicionais omitidas)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
