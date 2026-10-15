/**
 * SEG-DRE-TENANT-01 — toda funcao SECURITY DEFINER com parametro de cliente criada numa migration NOVA (a partir de
 * 20261027198600) tem guarda de cliente: `tenant_ok`, ou a guarda propria `is_admin_agroinblue` + 42501.
 * SECURITY DEFINER atravessa a RLS: sem a guarda, quem souber o id de outro cliente le^ o dado dele (medido no DRE em 15/10/2026).
 * O detector se auto-testa antes de varrer (a lei do `check:tdz`: "nenhum" so' vale quando a busca provou que sabe achar).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const DESDE = '20261027198600';

/** As funcoes SECURITY DEFINER com parametro de cliente sem guarda, num texto de migration. */
export function semGuarda(sql: string): string[] {
  const partes = sql.split(/(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s)/i).filter(p => /^CREATE\s/i.test(p));
  return partes.flatMap(p => {
    const cab = p.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(([^)]*)\)/i);
    if (!cab) return [];
    const [, nome, params] = cab;
    if (!/SECURITY\s+DEFINER/i.test(p) || !/cliente/i.test(params)) return [];
    const guardada = /tenant_ok\s*\(/i.test(p) || (/is_admin_agroinblue\s*\(/i.test(p) && /42501/.test(p));
    return guardada ? [] : [nome];
  });
}

describe('guarda de cliente nas migrations novas', () => {
  it('o detector acha a funcao sem guarda e aceita as duas formas de guarda', () => {
    const sem = `CREATE OR REPLACE FUNCTION public.fn_x(p_cliente uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return '{}'; end $$;`;
    const comTenant = `CREATE FUNCTION public.fn_y(p_cliente_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public.tenant_ok(p_cliente_id) then raise exception 'x' using errcode = '42501'; end if; return '{}'; end $$;`;
    const comAdmin = `CREATE FUNCTION public.fn_z(p_cliente uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      begin if not public.is_admin_agroinblue(auth.uid()) then raise exception using errcode = '42501'; end if; end $$;`;
    const invoker = `CREATE FUNCTION public.fn_w(p_cliente uuid) RETURNS void LANGUAGE sql AS $$ select 1 $$;`;
    const semCliente = `CREATE FUNCTION public.fn_v(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;`;
    expect(semGuarda(sem)).toEqual(['public.fn_x']);
    expect(semGuarda([sem, comTenant, comAdmin, invoker, semCliente].join('\n'))).toEqual(['public.fn_x']);
  });

  it('nenhuma migration nova tem funcao SECURITY DEFINER com parametro de cliente sem guarda', () => {
    const novas = readdirSync(DIR).filter(f => f.endsWith('.sql') && f >= DESDE).sort();
    expect(novas).toContain('20261027198600_seg_dre_tenant_01.sql');
    const achados = novas.flatMap(f => semGuarda(readFileSync(join(DIR, f), 'utf8')).map(n => `${f}: ${n}`));
    expect(achados).toEqual([]);
  });

  it('a migration do DRE poe a guarda nas 7 funcoes da familia (tenant_ok) e fecha a interna', () => {
    const sql = readFileSync(join(DIR, '20261027198600_seg_dre_tenant_01.sql'), 'utf8');
    for (const f of ['fn_dre_pecuaria', 'fn_dre_pecuaria_lancamentos', 'fn_dre_pecuaria_patrimonio', 'fn_painel_rateio_detalhe',
      'fn_painel_safra', 'fn_painel_safra_comparativo', 'fn_painel_safra_entrega']) expect(sql).toContain(`['${f}',`);
    expect(sql).toMatch(/if not coalesce\(public\.tenant_ok\(p_cliente\), false\) then raise exception ''acesso negado ao cliente'' using errcode = ''42501''/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._fn_exigir_tenant\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon/);
  });
});
