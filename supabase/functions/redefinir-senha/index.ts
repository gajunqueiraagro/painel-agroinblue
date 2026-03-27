import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuração ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, nova_senha } = await req.json();

    if (!user_id || !nova_senha) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: user_id, nova_senha" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (nova_senha.length < 6) {
      return new Response(JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin or gestor of a shared client
    const isAdmin = await adminClient.rpc('is_admin_agroinblue', { _user_id: caller.id });
    
    if (!isAdmin.data) {
      // Check if caller is gestor_cliente of the same client as target user
      const { data: callerMembros } = await adminClient
        .from("cliente_membros")
        .select("cliente_id, perfil")
        .eq("user_id", caller.id)
        .eq("ativo", true);

      const { data: targetMembros } = await adminClient
        .from("cliente_membros")
        .select("cliente_id")
        .eq("user_id", user_id)
        .eq("ativo", true);

      const callerGestorClientes = (callerMembros || [])
        .filter(m => m.perfil === 'gestor_cliente')
        .map(m => m.cliente_id);

      const targetClientes = (targetMembros || []).map(m => m.cliente_id);

      const hasSharedClient = callerGestorClientes.some(c => targetClientes.includes(c));

      if (!hasSharedClient) {
        return new Response(JSON.stringify({ error: "Sem permissão para redefinir senha deste usuário" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: nova_senha,
    });

    if (updateError) {
      return new Response(JSON.stringify({ error: "Erro ao redefinir: " + updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("redefinir-senha error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
