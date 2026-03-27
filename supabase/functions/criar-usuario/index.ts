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

    const { email, senha, nome, cliente_id, perfil, fazenda_ids } = await req.json();

    if (!email || !senha || !cliente_id || !perfil) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: email, senha, cliente_id, perfil" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (senha.length < 6) {
      return new Response(JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validPerfis = ['gestor_cliente', 'financeiro', 'campo', 'leitura'];
    if (!validPerfis.includes(perfil)) {
      return new Response(JSON.stringify({ error: "Perfil inválido. Valores aceitos: " + validPerfis.join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin or gestor_cliente of this client
    const { data: isAdmin } = await adminClient.rpc('is_admin_agroinblue', { _user_id: caller.id });
    if (!isAdmin) {
      const { data: callerPerfil } = await adminClient.rpc('get_user_perfil', {
        _user_id: caller.id,
        _cliente_id: cliente_id,
      });
      if (callerPerfil !== 'gestor_cliente') {
        return new Response(JSON.stringify({ error: "Sem permissão para adicionar membros neste cliente" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      // Check if already a member of this client
      const { data: existingMembro } = await adminClient
        .from("cliente_membros")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("cliente_id", cliente_id)
        .single();

      if (existingMembro) {
        return new Response(JSON.stringify({ error: "Este email já está cadastrado neste cliente" }), {
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
          return new Response(JSON.stringify({ error: "Este email já está cadastrado no sistema" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Erro ao criar usuário: " + createError.message }), {
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
          return new Response(JSON.stringify({ error: "Erro ao vincular ao cliente: " + insertError.message }), {
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

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("criar-usuario error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
