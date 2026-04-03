import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PERFIS_ADMIN = ["admin_agroinblue", "gestor_cliente"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return json({ error: "Usuário não autenticado" }, 401);

    const { cliente_id } = await req.json();
    if (!cliente_id) return json({ error: "cliente_id obrigatório" }, 400);

    // Verify user has admin profile for this client
    const { data: membro } = await supabaseAdmin
      .from("cliente_membros")
      .select("perfil")
      .eq("user_id", user.id)
      .eq("cliente_id", cliente_id)
      .eq("ativo", true)
      .maybeSingle();

    if (!membro || !PERFIS_ADMIN.includes(membro.perfil)) {
      return json({ error: "Apenas administradores podem executar o reset do Boitel." }, 403);
    }

    // Collect lote IDs first (needed for FK-safe deletion order)
    const { data: lotes } = await supabaseAdmin
      .from("boitel_lotes")
      .select("id")
      .eq("cliente_id", cliente_id);

    const loteIds = (lotes || []).map((l: any) => l.id);

    // === STEP 1: financeiro_lancamentos_v2 (boitel) ===
    const { count: finCount, error: e1 } = await supabaseAdmin
      .from("financeiro_lancamentos_v2")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id)
      .eq("origem_lancamento", "boitel");
    if (e1) throw new Error("[Etapa 1 - financeiro_lancamentos_v2] " + e1.message);

    // === STEP 2: Limpar boitel_lote_id e boitel_id (legado) em lancamentos ===
    let lancLimpos = 0;
    if (loteIds.length > 0) {
      const { count: c0, error: e0 } = await supabaseAdmin
        .from("lancamentos")
        .update({ boitel_lote_id: null, boitel_id: null } as any)
        .in("boitel_lote_id", loteIds)
        .select("id", { count: "exact", head: true });
      if (e0) throw new Error("[Etapa 2a - limpar lancamentos.boitel_lote_id] " + e0.message);
      lancLimpos = c0 || 0;
    }

    // Also clean orphan boitel_id references not linked via boitel_lote_id
    const { count: legacyLimpos, error: eLeg } = await supabaseAdmin
      .from("lancamentos")
      .update({ boitel_id: null } as any)
      .not("boitel_id", "is", null)
      .eq("cliente_id", cliente_id)
      .select("id", { count: "exact", head: true });
    if (eLeg) throw new Error("[Etapa 2b - limpar lancamentos.boitel_id legado] " + eLeg.message);

    // === STEP 3: boitel_adiantamentos (FK → boitel_lotes) ===
    let adiantCount = 0;
    if (loteIds.length > 0) {
      const { count: c2, error: e2 } = await supabaseAdmin
        .from("boitel_adiantamentos")
        .delete({ count: "exact" })
        .in("boitel_lote_id", loteIds);
      if (e2) throw new Error("[Etapa 3 - boitel_adiantamentos] " + e2.message);
      adiantCount = c2 || 0;
    }

    // === STEP 4: boitel_planejamento_historico (FK → boitel_lotes) ===
    let histCount = 0;
    if (loteIds.length > 0) {
      const { count: c3, error: e3 } = await supabaseAdmin
        .from("boitel_planejamento_historico")
        .delete({ count: "exact" })
        .in("boitel_lote_id", loteIds);
      if (e3) throw new Error("[Etapa 4 - boitel_planejamento_historico] " + e3.message);
      histCount = c3 || 0;
    }

    // === STEP 5: boitel_planejamento (FK → boitel_lotes) ===
    let planCount = 0;
    if (loteIds.length > 0) {
      const { count: c4, error: e4 } = await supabaseAdmin
        .from("boitel_planejamento")
        .delete({ count: "exact" })
        .in("boitel_lote_id", loteIds);
      if (e4) throw new Error("[Etapa 5 - boitel_planejamento] " + e4.message);
      planCount = c4 || 0;
    }

    // === STEP 6: boitel_lotes (master) ===
    const { count: loteCount, error: e5 } = await supabaseAdmin
      .from("boitel_lotes")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id);
    if (e5) throw new Error("[Etapa 6 - boitel_lotes] " + e5.message);

    // === STEP 7: boitel_operacoes (legacy) ===
    const { count: opCount, error: e6 } = await supabaseAdmin
      .from("boitel_operacoes")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id);
    if (e6) throw new Error("[Etapa 7 - boitel_operacoes legado] " + e6.message);

    const resumo = {
      financeiros_removidos: finCount || 0,
      lancamentos_limpos: lancLimpos,
      lancamentos_legado_limpos: legacyLimpos || 0,
      adiantamentos_removidos: adiantCount,
      historicos_removidos: histCount,
      planejamentos_removidos: planCount,
      lotes_removidos: loteCount || 0,
      operacoes_legadas_removidas: opCount || 0,
    };

    // === STEP 8: Audit log ===
    await supabaseAdmin.from("audit_log").insert({
      cliente_id,
      fazenda_id: null,
      usuario_id: user.id,
      modulo: "boitel",
      acao: "reset_teste",
      tabela_origem: "boitel_lotes",
      registro_id: null,
      resumo: `Reset Boitel: ${resumo.lotes_removidos} lotes, ${resumo.financeiros_removidos} financeiros, ${resumo.planejamentos_removidos} planejamentos removidos`,
      dados_anteriores: null,
      dados_novos: resumo as any,
    });

    return json({ ok: true, resumo });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
