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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { membro_id } = await req.json();

    if (!membro_id) {
      return new Response(JSON.stringify({ error: "membro_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the membro record to find user_id and cliente_id
    const { data: membro, error: membroErr } = await adminClient
      .from("cliente_membros")
      .select("id, user_id, cliente_id, perfil")
      .eq("id", membro_id)
      .single();

    if (membroErr || !membro) {
      return new Response(JSON.stringify({ error: "Membro não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quem pode chamar: o admin; o gestor do cliente so' com GESTOR_GERENCIA_ACESSOS ligado.
    const { data: isAdmin } = await adminClient.rpc('is_admin_agroinblue', { _user_id: caller.id });
    let callerGestor = false;
    if (!isAdmin && GESTOR_GERENCIA_ACESSOS) {
      const { data: callerPerfil } = await adminClient.rpc('get_user_perfil', {
        _user_id: caller.id,
        _cliente_id: membro.cliente_id,
      });
      callerGestor = callerPerfil === 'gestor_cliente';
    }
    const pode = podeGerenciarAcessos({
      chamadorAdmin: !!isAdmin, chamadorGestorDoCliente: callerGestor, gestorGerencia: GESTOR_GERENCIA_ACESSOS,
      fraseSemPermissao: "Sem permissão para remover membros",
    });
    if (pode.ok === false) {
      return new Response(JSON.stringify({ error: pode.erro, etapa: "permissao" }), {
        status: pode.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O ALVO: admin do AGROinBLUE nunca, quem quer que chame; e ninguem se remove por esta via.
    const { data: alvoAdmin } = await adminClient.rpc('is_admin_agroinblue', { _user_id: membro.user_id });
    const alvo = alvoPermitido({ alvoAdmin: !!alvoAdmin, alvoId: membro.user_id, chamadorId: caller.id });
    if (alvo.ok === false) {
      return new Response(JSON.stringify({ error: alvo.erro, etapa: "alvo" }), {
        status: alvo.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove fazenda_membros for this user in all fazendas of this client
    const { data: clientFazendas } = await adminClient
      .from("fazendas")
      .select("id")
      .eq("cliente_id", membro.cliente_id);

    const fazendaIds = (clientFazendas || []).map(f => f.id);
    if (fazendaIds.length > 0) {
      await adminClient
        .from("fazenda_membros")
        .delete()
        .eq("user_id", membro.user_id)
        .in("fazenda_id", fazendaIds);
    }

    // Remove from cliente_membros
    await adminClient
      .from("cliente_membros")
      .delete()
      .eq("id", membro_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("remover-membro error:", err?.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
