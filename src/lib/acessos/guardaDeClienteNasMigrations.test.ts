/**
 * SEG-DRE-TENANT-01 — toda funcao SECURITY DEFINER com parametro de cliente criada numa migration NOVA (a partir de
 * 20261027198600) tem guarda de cliente: `tenant_ok`, ou a guarda propria `is_admin_agroinblue` + 42501.
 * SECURITY DEFINER atravessa a RLS: sem a guarda, quem souber o id de outro cliente le^ o dado dele (medido no DRE em 15/10/2026).
 * SEG-AGRI-TENANT-01: a que recebe SO' O ID da linha (sem parametro de cliente) tambem tem guarda — pelo cliente da linha
 * (`_fn_exigir_tenant_das_linhas`, molde 01A) ou uma das formas acima. Interna (`_fn_…`) nasce fechada e fica de fora.
 * O detector se auto-testa antes de varrer (a lei do `check:tdz`: "nenhum" so' vale quando a busca provou que sabe achar).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const DESDE = '20261027198600';

/** Cada funcao SECURITY DEFINER exposta (parametro de cliente, ou so' o id) de um texto de migration, e se tem guarda. */
export function definicoesExpostas(sql: string): { nome: string; guardada: boolean; doBanco?: boolean }[] {
  const partes = sql.split(/(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s)/i).filter(p => /^CREATE\s/i.test(p));
  return partes.flatMap(p => {
    const cab = p.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(([^)]*)\)/i);
    if (!cab) return [];
    const [, nome, params] = cab;
    if (!/SECURITY\s+DEFINER/i.test(p)) return [];
    const temCliente = /cliente/i.test(params);
    const soId = !temCliente && /\buuid\b/i.test(params) && !/^(public\.)?_/.test(nome);
    if (!temCliente && !soId) return [];
    /* FIN-FINANC-28 PASSO 4: `_fn_contrato_do_usuario(contrato)` e' a guarda pelo cliente do CONTRATO (tenant_ok + 42501, preso abaixo) */
    /* P171: `_fn_subcentro_cliente_rodar(…)` e' a casca do escritor dos subcentros do cliente: so' o admin (42501), presa abaixo */
    /* PATR-01: `_fn_patrimonio_bem_do_usuario(bem)` e' a guarda pelo cliente do BEM (tenant_ok + 42501), o molde do contrato, presa abaixo */
    const guardada = /tenant_ok\s*\(/i.test(p) || /_fn_exigir_tenant(_das_linhas)?\s*\(/i.test(p)
      || /_fn_contrato_do_usuario\s*\(/i.test(p) || /_fn_subcentro_cliente_rodar\s*\(/i.test(p) || /(?<!function\s+public\.)_fn_patrimonio_bem_do_usuario\s*\(/i.test(p)
      || (/is_admin_agroinblue\s*\(/i.test(p) && /42501/.test(p))
      /* NOTAS-RECEITA-A1-01 F1: `_fn_fiscal_certificado_pode(cliente)` e' o PREDICADO da guarda do certificado (admin ou gestor DAQUELE
         cliente, so' devolve boolean, fechado a authenticated); quem o chama com 42501 esta' guardado; ele mesmo, preso abaixo */
      || (/(?<!function\s+public\.)_fn_fiscal_certificado_pode\s*\(/i.test(p) && /42501/.test(p))
      || (nome === 'public._fn_fiscal_certificado_pode' && /returns\s+boolean/i.test(p)
        && /revoke all on function public\._fn_fiscal_certificado_pode\(uuid\) from public, anon, authenticated;/i.test(p))
      /* BOLETO D3a (118110): `_fn_entrada_pode_gerir(cliente)` e' o PREDICADO de quem gera/revoga o endereco de boletos (admin ou gestor
         ATIVO daquele cliente, so' devolve boolean, fechado a authenticated) — o molde do `_fn_fiscal_certificado_pode`; ele mesmo e
         quem o chama, presos abaixo */
      || (/(?<!function\s+public\.)_fn_entrada_pode_gerir\s*\(/i.test(p) && /42501/.test(p))
      || (nome === 'public._fn_entrada_pode_gerir' && /returns\s+boolean/i.test(p)
        && /revoke all on function public\._fn_entrada_pode_gerir\(uuid\) from public, anon, authenticated;/i.test(p))
      /* BOLETO D3d (118180): `fn_entrada_ignorar` (a tela) e `fn_entrada_dispensar` (a tela antiga) so' repassam para a interna
         `_fn_entrada_ignorar(ids, …)`, que tem a guarda pelo cliente DAS LINHAS (todas do mesmo cliente + tenant_ok, 42501) e nasce
         fechada a authenticated — presa por dentro abaixo. A chamada da interna e' a guarda delas. */
      || /(?<!function\s+public\.)_fn_entrada_ignorar\s*\(/i.test(p)
      /* FOLHA-01 (118370): a guarda da folha e' `folha_ok(cliente)` (admin, ou tenant_ok + acesso 'folha' ativo: mais estreita que o
         tenant_ok) e a interna `_fn_folha_exigir(cliente)` (42501 sem ela), com as duas que acham o cliente pela linha
         (`_fn_folha_funcionario`, `_fn_folha_da_folha`) — todas presas por dentro abaixo */
      || /(?<!function\s+public\.)\bfolha_ok\s*\(/i.test(p)
      || /(?<!function\s+public\.)_fn_folha_(exigir|funcionario|da_folha)\s*\(/i.test(p)
      /* FIN-REGRA-MODAL-02 (114280): `_fn_fazenda_citada(cliente, texto, plano)` e' INTERNA da `fn_lancamentos_regra_fazenda_pendentes` (que
         tem tenant_ok + 42501): so' devolve um id de fazenda e nasce fechada a public/anon/authenticated — presa abaixo */
      || (nome === 'public._fn_fazenda_citada' && /returns\s+uuid/i.test(p)
        && /revoke all on function public\._fn_fazenda_citada\(uuid, text, uuid\) from public, anon, authenticated;/i.test(p));
    /* IMPORTAR-ABATE-01: corpo `AS %L` = o texto do PROPRIO BANCO (pg_get_functiondef/prosrc patchado por md5), que o arquivo nao
       mostra — a guarda dele e' a da definicao anterior (ver `ultimasSemGuarda`) */
    return [{ nome, guardada, ...(/\bAS\s+%L/i.test(p) ? { doBanco: true } : {}) }];
  });
}

/** O nome de TODA funcao criada num texto de migration (exposta ou nao). */
export function todasAsDefinicoes(sql: string): string[] {
  return [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(/gi)].map(m => m[1]);
}

/** As funcoes SECURITY DEFINER com parametro de cliente sem guarda, num texto de migration. */
export function semGuarda(sql: string): string[] {
  return definicoesExpostas(sql).filter((d) => !d.guardada).map((d) => d.nome);
}

/**
 * FIN-FINANC-28 passo 4b: migration aplicada e' REGISTRO HISTORICO (o ledger guarda o arquivo byte a byte) e nao se reescreve —
 * a guarda que faltou entra numa migration seguinte que REDEFINE a funcao. Vale a ULTIMA definicao de cada funcao, na ordem dos
 * arquivos. Devolve "arquivo: nome" das que terminam sem guarda.
 */
export function ultimasSemGuarda(arquivos: readonly { arquivo: string; sql: string }[]): string[] {
  const ultima = new Map<string, { arquivo: string; guardada: boolean }>();
  for (const a of arquivos) {
    /* PATR-01: a redefinicao que DEIXA de ser exposta (SECURITY INVOKER, ou sem parametro de cliente/id) tambem e' a ultima — ela fecha a
       anterior. Sem isto, uma funcao que vira INVOKER numa migration seguinte continuava reprovada pela definicao velha. */
    const doBanco = new Set(definicoesExpostas(a.sql).filter(d => d.doBanco).map(d => d.nome.toLowerCase()));
    for (const nome of todasAsDefinicoes(a.sql)) if (!doBanco.has(nome.toLowerCase())) ultima.set(nome.toLowerCase(), { arquivo: a.arquivo, guardada: true });
    for (const d of definicoesExpostas(a.sql)) {
      const chave = d.nome.toLowerCase();
      /* IMPORTAR-ABATE-01: corpo do banco herda a anterior; sem anterior nos arquivos, nada prova a guarda = reprova */
      if (d.doBanco) { if (!ultima.has(chave)) ultima.set(chave, { arquivo: a.arquivo, guardada: false }); continue; }
      ultima.set(chave, { arquivo: a.arquivo, guardada: d.guardada });
    }
  }
  return [...ultima.entries()].filter(([, v]) => !v.guardada).map(([nome, v]) => `${v.arquivo}: ${nome}`);
}

describe('guarda de cliente nas migrations novas', () => {
  it('o detector acha a funcao sem guarda e aceita as duas formas de guarda', () => {
    const sem = `CREATE OR REPLACE FUNCTION public.fn_x(p_cliente uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    const comTenant = `CREATE FUNCTION public.fn_y(p_cliente_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public.tenant_ok(p_cliente_id) then raise exception 'x' using errcode = '42501'; end if; return '{}'; end $$;`;
    const comAdmin = `CREATE FUNCTION public.fn_z(p_cliente uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public.is_admin_agroinblue(auth.uid()) then raise exception using errcode = '42501'; end if; end $$;`;
    const invoker = `CREATE FUNCTION public.fn_w(p_cliente uuid) RETURNS void LANGUAGE sql AS $$ select 1 $$;`;
    expect(semGuarda(sem)).toEqual(['public.fn_x']);
    expect(semGuarda([sem, comTenant, comAdmin, invoker].join('\n'))).toEqual(['public.fn_x']);
  });

  it('o detector acha a SECURITY DEFINER que recebe so\' o id sem guarda, e aceita a guarda pela linha', () => {
    const soIdSem = `CREATE FUNCTION public.fn_v(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;`;
    const soIdComLinha = `CREATE FUNCTION public.fn_u(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin perform public._fn_exigir_tenant_das_linhas(array[(select cliente_id from public.t where id = p_id)]); end $$;`;
    const interna = `CREATE FUNCTION public._fn_t(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;`;
    const semUuid = `CREATE FUNCTION public.fn_s(p_n int) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;`;
    expect(semGuarda(soIdSem)).toEqual(['public.fn_v']);
    expect(semGuarda([soIdSem, soIdComLinha, interna, semUuid].join('\n'))).toEqual(['public.fn_v']);
  });

  it('a guarda pelo contrato e\' aceita, e ela mesma tem tenant_ok + 42501 (FIN-FINANC-28 passo 4)', () => {
    const peloContrato = `CREATE FUNCTION public.fn_r(p_financiamento_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      declare f record; begin f := public._fn_contrato_do_usuario(p_financiamento_id); return '{}'; end $$;`;
    const soIdSem = `CREATE FUNCTION public.fn_q(p_financiamento_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    expect(semGuarda([peloContrato, soIdSem].join('\n'))).toEqual(['public.fn_q']);
    const sql = readFileSync(join(DIR, '20261027200200_fin_financ_28_p4_contrato.sql'), 'utf8');
    const dono = sql.slice(sql.indexOf('create or replace function public._fn_contrato_do_usuario'), sql.indexOf('end $$;', sql.indexOf('create or replace function public._fn_contrato_do_usuario')));
    expect(dono).toMatch(/not coalesce\(public\.tenant_ok\(f\.cliente_id\), false\)/);
    expect(dono).toMatch(/errcode = '42501'/);
    expect(sql).toMatch(/revoke all on function public\._fn_contrato_do_usuario\(uuid\) from public, anon, authenticated;/);
  });

  it('a guarda pelo bem do patrimonio e\' aceita, e ela mesma tem tenant_ok + 42501 e nasce fechada (PATR-01)', () => {
    const peloBem = `CREATE FUNCTION public.fn_m(p_bem uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      declare b record; begin b := public._fn_patrimonio_bem_do_usuario(p_bem); return '{}'; end $$;`;
    const soIdSem = `CREATE FUNCTION public.fn_l(p_bem uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    expect(semGuarda([peloBem, soIdSem].join('\n'))).toEqual(['public.fn_l']);
    const sql = readFileSync(join(DIR, '20261028116060_patr_01_rpcs.sql'), 'utf8');
    const inicio = sql.indexOf('create or replace function public._fn_patrimonio_bem_do_usuario');
    const dono = sql.slice(inicio, sql.indexOf('end $$;', inicio));
    expect(dono).toMatch(/not coalesce\(public\.tenant_ok\(b\.cliente_id\), false\)/);
    expect(dono).toMatch(/errcode = '42501'/);
    expect(sql).toMatch(/revoke all on function public\._fn_patrimonio_bem_do_usuario\(uuid\) from public, anon, authenticated;/);
    /* as duas internas com o cliente passam a INVOKER na 116070 (a ultima definicao vale) */
    const fix = readFileSync(join(DIR, '20261028116070_patr_01_internas_invoker.sql'), 'utf8');
    expect(definicoesExpostas(fix)).toEqual([]);
  });

  it('a interna da sugestao da regra fazenda (114280) so\' passa FECHADA, e quem a chama tem tenant_ok + 42501 (FIN-REGRA-MODAL-02)', () => {
    const sql = readFileSync(join(DIR, '20261028114280_fin_regra_modal_02_sugestao.sql'), 'utf8');
    expect(semGuarda(sql)).toEqual([]);
    const aberta = sql.replace(/revoke all on function public\._fn_fazenda_citada\(uuid, text, uuid\) from public, anon, authenticated;/, '');
    expect(semGuarda(aberta)).toEqual(['public._fn_fazenda_citada']);
    const outraComOMesmoCorpo = sql.replace(/public\._fn_fazenda_citada\(p_cliente/, 'public._fn_outra(p_cliente');
    expect(semGuarda(outraComOMesmoCorpo)).toContain('public._fn_outra');
    const chamador = sql.slice(sql.indexOf('create or replace function public.fn_lancamentos_regra_fazenda_pendentes'));
    expect(chamador).toMatch(/if not tenant_ok\(p_cliente\) then raise exception .* errcode = '42501'/);
  });

  it('a casca dos subcentros do cliente e\' aceita, e ela mesma so\' deixa o admin passar (P171: membro do cliente = 42501)', () => {
    const pelaCasca = `CREATE FUNCTION public.fn_o(p_cliente_id uuid, p_nome text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $f$
      select public._fn_subcentro_cliente_rodar('criar', jsonb_build_object('cliente_id', p_cliente_id), false) $f$;`;
    const semCasca = `CREATE FUNCTION public.fn_n(p_cliente_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $f$ select '{}'::jsonb $f$;`;
    expect(semGuarda([pelaCasca, semCasca].join('\n'))).toEqual(['public.fn_n']);
    const sql = readFileSync(join(DIR, '20261028114030_p171_subcentro_cliente_escritor.sql'), 'utf8');
    const inicio = sql.indexOf('CREATE FUNCTION public._fn_subcentro_cliente_rodar');
    const casca = sql.slice(inicio, sql.indexOf('end $f$;', inicio));
    expect(casca).toMatch(/if not coalesce\(public\.is_admin_agroinblue\(auth\.uid\(\)\), false\) then\s+raise exception using errcode = '42501'/);
    // tenant_ok deixaria passar o membro do cliente (e' a guarda dos dividendos, DIVIDENDO-SO-ADMIN-01): aqui nao vale
    expect(casca).not.toMatch(/tenant_ok/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._fn_subcentro_cliente_rodar\(text, jsonb, boolean\) FROM PUBLIC, anon, authenticated;/);
    expect(definicoesExpostas(sql).map((d) => d.nome)).toEqual(['public.fn_subcentro_cliente_criar', 'public.fn_subcentro_cliente_renomear',
      'public.fn_subcentro_cliente_inativar', 'public.fn_subcentro_cliente_reativar']);
    expect(semGuarda(sql)).toEqual([]);
  });

  it('o predicado do certificado e\' aceito como guarda, so\' devolve boolean (admin ou gestor do cliente) e nasce fechado (NOTAS-RECEITA-A1-01 F1)', () => {
    const peloPredicado = `CREATE FUNCTION public.fn_q(p_cert uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public._fn_fiscal_certificado_pode(x) then raise exception using errcode = '42501'; end if; return '{}'; end $$;`;
    const predicadoAberto = `CREATE FUNCTION public._fn_fiscal_certificado_pode(p_cliente uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ select true $$;`;
    expect(semGuarda([peloPredicado, predicadoAberto].join('\n'))).toEqual(['public._fn_fiscal_certificado_pode']);
    const sql = readFileSync(join(DIR, '20261028113300_notas_receita_a1_f1.sql'), 'utf8');
    const inicio = sql.indexOf('create or replace function public._fn_fiscal_certificado_pode');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', sql.indexOf('as $$', inicio)));
    expect(corpo).toMatch(/returns boolean/);
    expect(corpo).toMatch(/is_admin_agroinblue\(auth\.uid\(\)\)/);
    expect(corpo).toMatch(/get_user_perfil\(auth\.uid\(\), p_cliente\)::text = 'gestor_cliente'/);
    /* o corpo INTEIRO: as duas condicoes e nada mais (um `or true` ou uma leitura de tabela reprova) */
    expect(corpo.slice(corpo.indexOf('as $$') + 5).replace(/\s+/g, ' ').trim()).toBe(
      "select coalesce(public.is_admin_agroinblue(auth.uid()), false) or coalesce(public.get_user_perfil(auth.uid(), p_cliente)::text = 'gestor_cliente', false)");
    expect(semGuarda(sql)).toEqual([]);
  });

  it('o predicado do endereco de boletos e\' aceito como guarda, so\' devolve boolean (admin ou gestor ATIVO do cliente) e nasce fechado (BOLETO D3a)', () => {
    /* o detector: quem chama o predicado com 42501 passa; o predicado aberto (ou sem o revoke) reprova */
    const peloPredicado = `CREATE FUNCTION public.fn_q(p_cliente_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public._fn_entrada_pode_gerir(p_cliente_id) then raise exception using errcode = '42501'; end if; return '{}'; end $$;`;
    const predicadoAberto = `CREATE FUNCTION public._fn_entrada_pode_gerir(p_cliente_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ select true $$;`;
    expect(semGuarda([peloPredicado, predicadoAberto].join('\n'))).toEqual(['public._fn_entrada_pode_gerir']);
    const semRevoke = `CREATE FUNCTION public._fn_entrada_pode_gerir(p_cliente_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ select true $$;
      revoke all on function public._fn_entrada_pode_gerir(uuid) from public, anon;`;
    expect(semGuarda(semRevoke)).toEqual(['public._fn_entrada_pode_gerir']);
    const chamadaSem42501 = `CREATE FUNCTION public.fn_r(p_cliente_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public._fn_entrada_pode_gerir(p_cliente_id) then return '{}'; end if; return '{}'; end $$;`;
    expect(semGuarda(chamadaSem42501)).toEqual(['public.fn_r']);

    /* o arquivo de verdade: o corpo INTEIRO do predicado (um `or true`, outro perfil ou membro inativo reprovam) */
    const sql = readFileSync(join(DIR, '20261028118110_boleto_d3a_entrada_email.sql'), 'utf8');
    const inicio = sql.indexOf('create function public._fn_entrada_pode_gerir');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', sql.indexOf('as $$', inicio)));
    expect(corpo).toMatch(/returns boolean language sql stable security definer set search_path = public as \$\$/);
    expect(corpo.slice(corpo.indexOf('as $$') + 5).replace(/\s+/g, ' ').trim()).toBe(
      "select public.is_admin_agroinblue((select auth.uid())) or exists (select 1 from cliente_membros m where m.cliente_id = p_cliente_id"
      + " and m.user_id = (select auth.uid()) and m.ativo and m.perfil = 'gestor_cliente')");
    expect(sql).toMatch(/revoke all on function public\._fn_entrada_pode_gerir\(uuid\) from public, anon, authenticated;/);
    expect(sql).not.toMatch(/grant execute on function public\._fn_entrada_pode_gerir/i);
    /* quem o usa tambem passa pelo tenant_ok e recusa com 42501 (a guarda por dentro das duas RPCs da tela) */
    for (const rpc of ['fn_entrada_email_gerar', 'fn_entrada_email_revogar']) {
      const i = sql.indexOf(`create function public.${rpc}(`);
      expect(i).toBeGreaterThan(0);
      const c = sql.slice(i, sql.indexOf('end $$;', i));
      expect(c).toMatch(/if not public\.tenant_ok\(p_cliente_id\) or not public\._fn_entrada_pode_gerir\(p_cliente_id\) then\s+raise exception '[^']+' using errcode = '42501';/);
    }
    expect(semGuarda(sql)).toEqual([]);
  });

  it('a interna do Ignorar e\' aceita como guarda das duas casquinhas, e ela mesma guarda pelo cliente das linhas e nasce fechada (BOLETO D3d)', () => {
    /* o detector: quem chama a interna passa; a casquinha que nao a chama (nem tem tenant_ok) reprova */
    const pelaInterna = `CREATE FUNCTION public.fn_k(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin return public._fn_entrada_ignorar(array[p_id], 'x', null, true); end $$;`;
    const semInterna = `CREATE FUNCTION public.fn_j(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    expect(semGuarda([pelaInterna, semInterna].join('\n'))).toEqual(['public.fn_j']);

    /* o arquivo de verdade: a interna guarda pelo cliente DAS LINHAS (mesmo cliente + tenant_ok, 42501) e e' fechada a authenticated */
    const sql = readFileSync(join(DIR, '20261028118180_boleto_d3d_caixa_email.sql'), 'utf8');
    const inicio = sql.indexOf('create function public._fn_entrada_ignorar(');
    expect(inicio).toBeGreaterThan(0);
    const corpo = sql.slice(inicio, sql.indexOf('end $$;', inicio));
    expect(corpo).toMatch(/select min\(cliente_id::text\)::uuid into v_cli from entrada_arquivos where id = any\(p_ids\);/);
    expect(corpo).toMatch(/if exists \(select 1 from entrada_arquivos where id = any\(p_ids\) and cliente_id <> v_cli\) then\s+raise exception 'Sem acesso a este cliente\.' using errcode = '42501';/);
    expect(corpo).toMatch(/if not public\.tenant_ok\(v_cli\) then raise exception 'Sem acesso a este cliente\.' using errcode = '42501'; end if;/);
    /* a guarda vem ANTES de qualquer escrita */
    expect(corpo.indexOf('tenant_ok(v_cli)')).toBeLessThan(corpo.indexOf('update entrada_arquivos'));
    expect(sql).toMatch(/revoke all on function public\._fn_entrada_ignorar\(uuid\[\], text, text, boolean\) from public, anon, authenticated;/);
    expect(sql).not.toMatch(/grant execute on function public\._fn_entrada_ignorar/i);
    expect(semGuarda(sql)).toEqual([]);
  });

  it('a guarda da folha (folha_ok / _fn_folha_exigir) e\' aceita, e ela mesma exige tenant_ok + acesso folha, 42501, fechada (FOLHA-01)', () => {
    /* o detector: quem chama a guarda passa; quem nao chama reprova */
    const pelaGuarda = `CREATE FUNCTION public.fn_h(p_cliente uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin perform _fn_folha_exigir(p_cliente); return '{}'; end $$;`;
    const pelaLinha = `CREATE FUNCTION public.fn_g(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      declare f record; begin f := public._fn_folha_da_folha(p_id, true); return '{}'; end $$;`;
    const semGuardaDaFolha = `CREATE FUNCTION public.fn_f(p_cliente uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    expect(semGuarda([pelaGuarda, pelaLinha, semGuardaDaFolha].join('\n'))).toEqual(['public.fn_f']);

    /* o arquivo de verdade: o corpo INTEIRO do folha_ok (um `or true` ou sem o tenant_ok reprova) */
    const sql = readFileSync(join(DIR, '20261028118370_folha_01_pr_a_banco.sql'), 'utf8');
    const corpoDe = (inicio: string, fim: string) => { const i = sql.indexOf(inicio); expect(i).toBeGreaterThan(0); return sql.slice(i, sql.indexOf(fim, i)); };
    const ok = corpoDe('create function public.folha_ok(', '$$;');
    expect(ok.slice(ok.indexOf('as $$') + 5).replace(/\s+/g, ' ').trim()).toBe(
      "select public.is_admin_agroinblue((select auth.uid())) or (_cliente is not null and public.tenant_ok(_cliente)"
      + " and exists (select 1 from public.folha_acessos a where a.cliente_id = _cliente and a.user_id = (select auth.uid())"
      + " and a.nivel = 'folha' and a.ativo))");
    const exigir = corpoDe('create function public._fn_folha_exigir(', 'end $$;');
    expect(exigir).toMatch(/if p_cliente is null or not public\.folha_ok\(p_cliente\) then\s+raise exception '[^']+' using errcode = '42501';/);
    for (const interna of ['_fn_folha_funcionario', '_fn_folha_da_folha']) {
      const c = corpoDe(`create function public.${interna}(`, 'end $$;');
      expect(c).toMatch(/if not found then raise exception '[^']+' using errcode = '42501'; end if;\s+perform public\._fn_folha_exigir\(f\.cliente_id\);/);
    }
    expect(sql).toMatch(/revoke all on function public\._fn_folha_exigir\(uuid\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\._fn_folha_funcionario\(uuid\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\._fn_folha_da_folha\(uuid, boolean\) from public, anon, authenticated;/);
    expect(sql).not.toMatch(/grant execute on function public\._fn_folha_(exigir|funcionario|da_folha)/i);
    /* as migrations da folha ficam sem nenhuma exposta sem guarda */
    for (const f of ['20261028118370_folha_01_pr_a_banco.sql', '20261028118400_folha_01_v1_funcionario_no_lancamento.sql',
      '20261028118420_folha_01_pr_b_ficha_documentos_pendencias.sql', '20261028118430_folha_01_pr_c_folha_do_mes_recibos_ferias.sql']) {
      expect(semGuarda(readFileSync(join(DIR, f), 'utf8'))).toEqual([]);
    }
  });

  it('nenhuma migration nova tem funcao SECURITY DEFINER com parametro de cliente sem guarda', () => {
    const novas = readdirSync(DIR).filter(f => f.endsWith('.sql') && f >= DESDE).sort();
    expect(novas).toContain('20261027198600_seg_dre_tenant_01.sql');
    const achados = ultimasSemGuarda(novas.map(f => ({ arquivo: f, sql: readFileSync(join(DIR, f), 'utf8') })));
    expect(achados).toEqual([]);
  });

  it('vale a ULTIMA definicao: a guarda posta numa migration seguinte fecha a anterior; a ultima sem guarda reprova', () => {
    const sem = `CREATE OR REPLACE FUNCTION public.fn_p(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;`;
    const com = `CREATE OR REPLACE FUNCTION public.fn_p(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin perform public._fn_contrato_do_usuario(p_id); end $$;`;
    expect(ultimasSemGuarda([{ arquivo: 'a.sql', sql: sem }, { arquivo: 'b.sql', sql: com }])).toEqual([]);
    expect(ultimasSemGuarda([{ arquivo: 'a.sql', sql: com }, { arquivo: 'b.sql', sql: sem }])).toEqual(['b.sql: public.fn_p']);
    /* PATR-01: redefinir como INVOKER fecha a anterior; a DEFINER de novo depois reabre */
    const invoker = `CREATE OR REPLACE FUNCTION public.fn_p(p_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER AS $$ select 1 $$;`;
    expect(ultimasSemGuarda([{ arquivo: 'a.sql', sql: sem }, { arquivo: 'b.sql', sql: invoker }])).toEqual([]);
    expect(ultimasSemGuarda([{ arquivo: 'a.sql', sql: invoker }, { arquivo: 'b.sql', sql: sem }])).toEqual(['b.sql: public.fn_p']);
    const sql = readFileSync(join(DIR, '20261027200400_fin_financ_28_p4b_guarda.sql'), 'utf8');
    expect(semGuarda(sql)).toEqual([]);
    expect(definicoesExpostas(sql).map((d) => d.nome)).toEqual(['public.fn_financiamento_parcela_vincular', 'public.fn_financiamento_parcela_desvincular']);
  });

  it('corpo do banco (AS %L) herda a guarda da definicao anterior; sem anterior, reprova (IMPORTAR-ABATE-01)', () => {
    const com = `CREATE OR REPLACE FUNCTION public.fn_k(p_cliente_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public.tenant_ok(p_cliente_id) then raise exception using errcode = '42501'; end if; return '{}'; end $$;`;
    const sem = `CREATE OR REPLACE FUNCTION public.fn_k(p_cliente_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    const doBanco = `DO $p$ BEGIN EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_k(p_cliente_id uuid)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$, v_novo); END $p$;`;
    expect(ultimasSemGuarda([{ arquivo: 'a.sql', sql: com }, { arquivo: 'b.sql', sql: doBanco }])).toEqual([]);
    expect(ultimasSemGuarda([{ arquivo: 'a.sql', sql: sem }, { arquivo: 'b.sql', sql: doBanco }])).toEqual(['a.sql: public.fn_k']);
    expect(ultimasSemGuarda([{ arquivo: 'b.sql', sql: doBanco }])).toEqual(['b.sql: public.fn_k']);
    /* o caso real: a 117530 troca o corpo da oc_importar_abate da 117510 (que tem tenant_ok + 42501) */
    const real = ['20261028117510_importar_abate_01_oc_importar.sql', '20261028117530_importar_abate_01_diferenca_acerto.sql']
      .map(f => ({ arquivo: f, sql: readFileSync(join(DIR, f), 'utf8') }));
    expect(definicoesExpostas(real[1].sql).filter(d => d.doBanco).map(d => d.nome)).toEqual(['public.oc_importar_abate']);
    expect(ultimasSemGuarda(real).filter(x => x.includes('oc_importar_abate'))).toEqual([]);
  });

  it('a migration do DRE poe a guarda nas 7 funcoes da familia (tenant_ok) e fecha a interna', () => {
    const sql = readFileSync(join(DIR, '20261027198600_seg_dre_tenant_01.sql'), 'utf8');
    for (const f of ['fn_dre_pecuaria', 'fn_dre_pecuaria_lancamentos', 'fn_dre_pecuaria_patrimonio', 'fn_painel_rateio_detalhe',
      'fn_painel_safra', 'fn_painel_safra_comparativo', 'fn_painel_safra_entrega']) expect(sql).toContain(`['${f}',`);
    expect(sql).toMatch(/if not coalesce\(public\.tenant_ok\(p_cliente\), false\) then raise exception ''acesso negado ao cliente'' using errcode = ''42501''/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._fn_exigir_tenant\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon/);
  });

  it('a migration da agricultura poe a guarda nas 27 e fecha as tres sem chamador na tela', () => {
    const sql = readFileSync(join(DIR, '20261027198700_seg_agri_tenant_01.sql'), 'utf8');
    const alvos = [...sql.matchAll(/\['(\w+)',\s+'[0-9a-f]{32}', '[0-9a-f]{32}', '(cliente|linha)', '[^']*', '(S?)'\]/g)];
    expect(alvos).toHaveLength(27);
    expect(alvos.filter((a) => a[2] === 'linha')).toHaveLength(9);
    expect(alvos.filter((a) => a[3] === 'S').map((a) => a[1]).sort()).toEqual(
      ['agri_local_estoque_resolver', 'agri_venda_avulsa_registrar', 'auditar_integridade_classificacao']);
    expect(sql).toMatch(/if not coalesce\(public\.tenant_ok\(%s\), false\) then raise exception ''acesso negado ao cliente'' using errcode = ''42501''/);
    expect(sql).toMatch(/perform public\._fn_exigir_tenant_das_linhas\(array\[%s\]\);/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._fn_exigir_tenant_das_linhas\(uuid\[\]\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  });
});
