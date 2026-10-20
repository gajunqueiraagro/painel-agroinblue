import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acharLoginPorEmail, alvoPermitido, normalizarEmail, PERFIS_CRIAVEIS, podeGerenciarAcessos } from "../_shared/regrasDeAcesso.ts";

/**
 * EDITAR ACESSO — ACESSOS-PERFIL-01 (Gabriel, 20/10/2026): nome, e-mail (o login), perfil e fazendas de um membro do cliente.
 *
 * A REGRA E A GRAVACAO SAO DO BANCO (`_fn_membro_editar`, interna, so' service_role): numa transacao grava o perfil
 * (nome, e-mail), `cliente_membros.perfil` e `fazenda_membros` (o papel pela regra do `criar-usuario`), e deixa a trilha em
 * `audit_log` com antes / depois e o autor = quem chamou. Esta funcao so' confere o chamador, troca o LOGIN no Auth quando o
 * e-mail muda (e o nome no `user_metadata`) e chama o banco.
 *
 * ORDEM: (1) o banco SIMULA (recusa o que nao vale: proprio acesso, admin, e-mail de outro login, fazenda de outro cliente);
 * (2) o Auth troca o e-mail / o nome; (3) o banco GRAVA. Recusa em (1) nao mexe em nada; falha em (2) nao grava nada; falha em
 * (3) com o login ja' trocado e' escrita com a etapa "perfil", nunca calada.
 */
const GESTOR_GERENCIA_ACESSOS = false;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return resposta({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceRoleKey) return resposta({ error: "Configuração ausente no backend" }, 500);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) return resposta({ error: "Não autorizado" }, 401);

    const corpo = await req.json();
    const membroId = typeof corpo?.membro_id === "string" ? corpo.membro_id : "";
    const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
    const email = normalizarEmail(corpo?.email);
    const perfil = typeof corpo?.perfil === "string" ? corpo.perfil : "";
    const fazendaIds: string[] = Array.isArray(corpo?.fazenda_ids)
      ? corpo.fazenda_ids.filter((x: unknown): x is string => typeof x === "string") : [];

    if (!membroId || !nome || !email || !perfil) {
      return resposta({ error: "Campos obrigatórios: membro_id, nome, email, perfil", etapa: "validacao" }, 400);
    }
    if (!PERFIS_CRIAVEIS.includes(perfil)) {
      return resposta({ error: "Perfil inválido. Valores aceitos: " + PERFIS_CRIAVEIS.join(", "), etapa: "validacao" }, 400);
    }

    const { data: membro } = await adminClient.from("cliente_membros")
      .select("id, user_id, cliente_id, perfil").eq("id", membroId).maybeSingle();
    if (!membro) return resposta({ error: "Acesso não encontrado: recarregue a lista.", etapa: "validacao" }, 404);

    const { data: isAdmin } = await adminClient.rpc("is_admin_agroinblue", { _user_id: caller.id });
    let callerGestor = false;
    if (!isAdmin && GESTOR_GERENCIA_ACESSOS) {
      const { data: callerPerfil } = await adminClient.rpc("get_user_perfil", { _user_id: caller.id, _cliente_id: membro.cliente_id });
      callerGestor = callerPerfil === "gestor_cliente";
    }
    const pode = podeGerenciarAcessos({
      chamadorAdmin: !!isAdmin, chamadorGestorDoCliente: callerGestor, gestorGerencia: GESTOR_GERENCIA_ACESSOS,
      fraseSemPermissao: "Sem permissão para editar acessos neste cliente",
    });
    if (pode.ok === false) return resposta({ error: pode.erro, etapa: "permissao" }, pode.status);

    const { data: alvoAdmin } = await adminClient.rpc("is_admin_agroinblue", { _user_id: membro.user_id });
    const alvo = alvoPermitido({ alvoAdmin: !!alvoAdmin || membro.perfil === "admin_agroinblue", alvoId: membro.user_id, chamadorId: caller.id });
    if (alvo.ok === false) return resposta({ error: alvo.erro, etapa: "alvo" }, alvo.status);

    const chamarBanco = (simular: boolean) => adminClient.rpc("_fn_membro_editar", {
      p_autor: caller.id, p_membro_id: membroId, p_nome: nome, p_email: email, p_perfil: perfil,
      p_fazenda_ids: fazendaIds, p_simular: simular,
    });

    // (1) o banco simula: recusa aqui nao mexe em nada.
    const { data: previa, error: erroPrevia } = await chamarBanco(true);
    if (erroPrevia) {
      return resposta({ error: erroPrevia.message, etapa: erroPrevia.code === "42501" ? "permissao" : "validacao" }, 400);
    }
    const mudou = (previa?.mudou ?? {}) as Record<string, boolean>;

    // (2) o Auth: o e-mail e' o login; o nome vai tambem no user_metadata.
    if (mudou.login || mudou.nome) {
      if (mudou.login) {
        const outro = await acharLoginPorEmail(email, async (pagina, porPagina) => {
          const { data, error } = await adminClient.auth.admin.listUsers({ page: pagina, perPage: porPagina });
          if (error) throw new Error("Erro ao consultar os logins: " + error.message);
          return data?.users ?? [];
        });
        if (outro && outro.id !== membro.user_id) return resposta({ error: "Este e-mail já é login de outra pessoa.", etapa: "login" }, 409);
      }
      const { data: atual, error: erroAtual } = await adminClient.auth.admin.getUserById(membro.user_id);
      if (erroAtual || !atual?.user) return resposta({ error: "Login não encontrado: " + (erroAtual?.message ?? ""), etapa: "login" }, 400);
      const metadata = { ...(atual.user.user_metadata ?? {}), nome };
      const { error: erroAuth } = await adminClient.auth.admin.updateUserById(membro.user_id, mudou.login
        ? { email, email_confirm: true, user_metadata: metadata }
        : { user_metadata: metadata });
      if (erroAuth) return resposta({ error: "Não foi possível alterar o login: " + erroAuth.message, etapa: "login" }, 400);
    }

    // (3) o banco grava (perfil, cliente_membros, fazenda_membros e a trilha), numa transacao.
    const { data: gravado, error: erroGravar } = await chamarBanco(false);
    if (erroGravar) {
      return resposta({
        error: (mudou.login ? `O login já passou a ser ${email}, mas ` : "") + "o acesso não foi gravado: " + erroGravar.message,
        etapa: "perfil",
      }, 500);
    }
    return resposta({ success: true, mudou: gravado?.mudou ?? mudou, login_alterado: !!mudou.login });
  } catch (err) {
    console.error("editar-membro error:", err?.message);
    return resposta({ error: err?.message ?? "erro inesperado", etapa: "inesperado" }, 500);
  }
});
