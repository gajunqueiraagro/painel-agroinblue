import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user token
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { cliente_id } = await req.json();
    if (!cliente_id) {
      return new Response(JSON.stringify({ error: "cliente_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user belongs to this client
    const { data: membro } = await supabaseAdmin
      .from("cliente_membros")
      .select("perfil")
      .eq("user_id", user.id)
      .eq("cliente_id", cliente_id)
      .eq("ativo", true)
      .maybeSingle();

    if (!membro) {
      return new Response(JSON.stringify({ error: "Sem permissão para este cliente" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Delete financeiro_lancamentos_v2 linked to boitel
    const { count: finCount, error: e1 } = await supabaseAdmin
      .from("financeiro_lancamentos_v2")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id)
      .eq("origem_lancamento", "boitel");

    if (e1) throw new Error("Erro ao limpar financeiro boitel: " + e1.message);

    // 2. Delete boitel_adiantamentos (via lotes)
    const { data: lotes } = await supabaseAdmin
      .from("boitel_lotes")
      .select("id")
      .eq("cliente_id", cliente_id);

    const loteIds = (lotes || []).map((l: any) => l.id);

    let adiantCount = 0;
    let histCount = 0;
    let planCount = 0;

    if (loteIds.length > 0) {
      // Delete adiantamentos
      const { count: c2, error: e2 } = await supabaseAdmin
        .from("boitel_adiantamentos")
        .delete({ count: "exact" })
        .in("boitel_lote_id", loteIds);
      if (e2) throw new Error("Erro ao limpar adiantamentos: " + e2.message);
      adiantCount = c2 || 0;

      // Delete planejamento_historico
      const { count: c3, error: e3 } = await supabaseAdmin
        .from("boitel_planejamento_historico")
        .delete({ count: "exact" })
        .in("boitel_lote_id", loteIds);
      if (e3) throw new Error("Erro ao limpar histórico: " + e3.message);
      histCount = c3 || 0;

      // Delete planejamento
      const { count: c4, error: e4 } = await supabaseAdmin
        .from("boitel_planejamento")
        .delete({ count: "exact" })
        .in("boitel_lote_id", loteIds);
      if (e4) throw new Error("Erro ao limpar planejamento: " + e4.message);
      planCount = c4 || 0;
    }

    // 3. Delete boitel_lotes
    const { count: loteCount, error: e5 } = await supabaseAdmin
      .from("boitel_lotes")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id);

    if (e5) throw new Error("Erro ao limpar lotes: " + e5.message);

    // 4. Also delete boitel_operacoes (legacy)
    const { count: opCount, error: e6 } = await supabaseAdmin
      .from("boitel_operacoes")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id);

    if (e6) throw new Error("Erro ao limpar operações legadas: " + e6.message);

    return new Response(
      JSON.stringify({
        ok: true,
        resumo: {
          financeiros_removidos: finCount || 0,
          adiantamentos_removidos: adiantCount,
          historicos_removidos: histCount,
          planejamentos_removidos: planCount,
          lotes_removidos: loteCount || 0,
          operacoes_legadas_removidas: opCount || 0,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
