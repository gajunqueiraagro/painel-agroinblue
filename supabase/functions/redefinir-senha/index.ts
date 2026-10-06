import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { alvoPermitido, podeGerenciarAcessos } from "../_shared/regrasDeAcesso.ts";

/**
 * NO PILOTO SO' O ADMIN DO AGROinBLUE GERENCIA ACESSOS (Gabriel, 06/10/2026). O ramo do gestor continua no corpo, atras
 * desta constante. ⚠ RELIGAR EXIGE A REGRA DO ALVO de `_shared/regrasDeAcesso.ts` (admin nunca e' alvo; ninguem e' alvo
 * de si mesmo) — sem ela um gestor redefinia a senha de um admin com linha no cliente dele.
 */
const GESTOR_GERENCIA_ACESSOS = false;

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
      return new Response(JSON.stringify({ error: "Campos obrigatórios: user_id, nova_senha", etapa: "validacao" }), {
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

    // Quem pode chamar: o admin; o gestor de um cliente em comum so' com GESTOR_GERENCIA_ACESSOS ligado.
    const isAdmin = await adminClient.rpc('is_admin_agroinblue', { _user_id: caller.id });
    let hasSharedClient = false;

    if (!isAdmin.data && GESTOR_GERENCIA_ACESSOS) {
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

      hasSharedClient = callerGestorClientes.some(c => targetClientes.includes(c));
    }
    const pode = podeGerenciarAcessos({
      chamadorAdmin: !!isAdmin.data, chamadorGestorDoCliente: hasSharedClient, gestorGerencia: GESTOR_GERENCIA_ACESSOS,
      fraseSemPermissao: "Sem permissão para redefinir senha deste usuário",
    });
    if (pode.ok === false) {
      return new Response(JSON.stringify({ error: pode.erro, etapa: "permissao" }), {
        status: pode.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O ALVO: admin do AGROinBLUE nunca, quem quer que chame; e ninguem redefine a propria senha por esta via.
    const alvoAdmin = await adminClient.rpc('is_admin_agroinblue', { _user_id: user_id });
    const alvo = alvoPermitido({ alvoAdmin: !!alvoAdmin.data, alvoId: user_id, chamadorId: caller.id });
    if (alvo.ok === false) {
      return new Response(JSON.stringify({ error: alvo.erro, etapa: "alvo" }), {
        status: alvo.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    /* So' a mensagem: o corpo do pedido (com a senha) nunca vai para o log. */
    console.error("redefinir-senha error:", err?.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
