import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acharLoginPorEmail, normalizarEmail, PERFIS_CRIAVEIS, podeGerenciarAcessos } from "../_shared/regrasDeAcesso.ts";

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
      return new Response(JSON.stringify({ error: "Configuração ausente no backend" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller JWT
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const corpo = await req.json();
    const { senha, nome, cliente_id, perfil, fazenda_ids } = corpo;
    /* O e-mail se compara e se grava sem espacos e em minusculas. */
    const email = normalizarEmail(corpo.email);

    if (!email || !senha || !cliente_id || !perfil) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: email, senha, cliente_id, perfil", etapa: "validacao" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (senha.length < 6) {
      return new Response(JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres", etapa: "validacao" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validPerfis = PERFIS_CRIAVEIS;
    if (!validPerfis.includes(perfil)) {
      return new Response(JSON.stringify({ error: "Perfil inválido. Valores aceitos: " + validPerfis.join(', '), etapa: "validacao" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quem pode chamar: o admin; o gestor do cliente so' com GESTOR_GERENCIA_ACESSOS ligado.
    const { data: isAdmin } = await adminClient.rpc('is_admin_agroinblue', { _user_id: caller.id });
    let callerGestor = false;
    if (!isAdmin && GESTOR_GERENCIA_ACESSOS) {
      const { data: callerPerfil } = await adminClient.rpc('get_user_perfil', {
        _user_id: caller.id,
        _cliente_id: cliente_id,
      });
      callerGestor = callerPerfil === 'gestor_cliente';
    }
    const pode = podeGerenciarAcessos({
      chamadorAdmin: !!isAdmin, chamadorGestorDoCliente: callerGestor, gestorGerencia: GESTOR_GERENCIA_ACESSOS,
      fraseSemPermissao: "Sem permissão para adicionar membros neste cliente",
    });
    if (pode.ok === false) {
      return new Response(JSON.stringify({ error: pode.erro, etapa: "permissao" }), {
        status: pode.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O e-mail ja' tem login? Percorre TODAS as paginas (a API admin nao busca por e-mail).
    const existingUser = await acharLoginPorEmail(email, async (pagina, porPagina) => {
      const { data, error } = await adminClient.auth.admin.listUsers({ page: pagina, perPage: porPagina });
      if (error) throw new Error("Erro ao consultar os logins: " + error.message);
      return data?.users ?? [];
    });

    let userId: string;
    /* O e-mail ja' tinha login: o vinculo e' criado e a SENHA DELE NAO MUDA (a digitada e' ignorada). A tela avisa. */
    const loginExistente = !!existingUser;

    if (existingUser) {
      // Check if already a member of this client
      const { data: existingMembro } = await adminClient
        .from("cliente_membros")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("cliente_id", cliente_id)
        .single();

      if (existingMembro) {
        return new Response(JSON.stringify({ error: "Este email já está cadastrado neste cliente", etapa: "login" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = existingUser.id;
    } else {
      // Create user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome: nome || email },
      });

      if (createError) {
        if (createError.message?.includes('already') || createError.message?.includes('duplicate')) {
          return new Response(JSON.stringify({ error: "Este email já está cadastrado no sistema", etapa: "login" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Erro ao criar usuário: " + createError.message, etapa: "login" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUser.user.id;
    }

    // Upsert cliente_membros
    const { error: membroError } = await adminClient
      .from("cliente_membros")
      .upsert(
        { user_id: userId, cliente_id, perfil, ativo: true },
        { onConflict: "user_id,cliente_id" }
      );

    if (membroError) {
      // If upsert not supported due to missing unique constraint, try insert then update
      const { data: existing } = await adminClient
        .from("cliente_membros")
        .select("id")
        .eq("user_id", userId)
        .eq("cliente_id", cliente_id)
        .single();

      if (existing) {
        await adminClient
          .from("cliente_membros")
          .update({ perfil, ativo: true })
          .eq("id", existing.id);
      } else {
        const { error: insertError } = await adminClient
          .from("cliente_membros")
          .insert({ user_id: userId, cliente_id, perfil });
        if (insertError) {
          /* ⚠ DIVIDA ACESSOS-CRIAR-USUARIO-ATOMICO-01: se o login acabou de ser criado, ele FICA sem vinculo. A resposta diz. */
          return new Response(JSON.stringify({
            error: "Erro ao vincular ao cliente: " + insertError.message
              + (loginExistente ? "" : " — o login foi criado e ficou SEM acesso a este cliente."),
            etapa: "vinculo_cliente", login_criado_sem_vinculo: !loginExistente,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Manage fazenda_membros: add to selected fazendas
    if (fazenda_ids && Array.isArray(fazenda_ids) && fazenda_ids.length > 0) {
      // Verify all fazendas belong to this client
      const { data: validFazendas } = await adminClient
        .from("fazendas")
        .select("id")
        .eq("cliente_id", cliente_id)
        .in("id", fazenda_ids);

      const validIds = (validFazendas || []).map(f => f.id);

      // Remove existing fazenda_membros for this user in this client's fazendas
      const { data: clientFazendas } = await adminClient
        .from("fazendas")
        .select("id")
        .eq("cliente_id", cliente_id);

      const allClientFazendaIds = (clientFazendas || []).map(f => f.id);

      if (allClientFazendaIds.length > 0) {
        await adminClient
          .from("fazenda_membros")
          .delete()
          .eq("user_id", userId)
          .in("fazenda_id", allClientFazendaIds);
      }

      // Insert new fazenda_membros
      if (validIds.length > 0) {
        const rows = validIds.map(fid => ({
          user_id: userId,
          fazenda_id: fid,
          papel: perfil === 'gestor_cliente' ? 'gerente' : perfil === 'campo' ? 'capataz' : 'membro',
        }));
        await adminClient.from("fazenda_membros").insert(rows);
      }
    }

    // Update profile cliente_id if not set
    await adminClient
      .from("profiles")
      .update({ cliente_id })
      .eq("user_id", userId)
      .is("cliente_id", null);

    return new Response(JSON.stringify({ success: true, user_id: userId, login_existente: loginExistente }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    /* So' a mensagem: o corpo do pedido (com a senha) nunca vai para o log. */
    console.error("criar-usuario error:", err?.message);
    return new Response(JSON.stringify({ error: err.message, etapa: "inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
