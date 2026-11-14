/**
 * NOTAS-RECEITA-A1-01 · F2 — a função de borda que RECEBE o certificado A1 (desenho de segurança S1–S3 aprovado pelo Gabriel, 13/11).
 * Só liga as peças reais; a ordem e as recusas moram em `_shared/subirCertificado.ts` (provadas no vitest).
 *  · recebe multipart: `titular_id`, `senha`, `arquivo` (o .pfx/.p12) — direto do navegador, HTTPS, corpo único;
 *  · cifra o .pfx com AES-GCM (chave-mestra no segredo `FISCAL_CERT_CHAVE_MESTRA`, 32 bytes em base64; IV de 12 bytes na frente) e grava no
 *    bucket PRIVADO `fiscal-certificados`; registra pela `fn_fiscal_certificado_registrar` (service_role), que põe a senha no Vault;
 *  · ⚠ NÃO loga corpo nem cabeçalho, nem a senha, nem o arquivo. O erro vai à tela com a frase pronta.
 * ⚠ O DEPLOY, o bucket e o segredo esperam cada um o seu GO do Gabriel.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { subirCertificado, type Pecas } from "../_shared/subirCertificado.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "fiscal-certificados";

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false, recusa: "metodo", frase: "Use o botão Subir certificado." });

  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mestra = Deno.env.get("FISCAL_CERT_CHAVE_MESTRA");
  if (!url || !servico || !mestra) return json(500, { ok: false, recusa: "configuracao", frase: "A função de certificado ainda não está configurada." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const chave = await crypto.subtle.importKey("raw", base64ParaBytes(mestra), "AES-GCM", false, ["encrypt"]);

  let form: FormData;
  try { form = await req.formData(); } catch { return json(400, { ok: false, recusa: "pedido", frase: "Pedido inválido." }); }
  const arquivo = form.get("arquivo");
  const senha = form.get("senha");
  const titularId = form.get("titular_id");

  const pecas: Pecas = {
    autorDoToken: async (token) => (await admin.auth.getUser(token)).data.user?.id ?? null,
    lerTitular: async (id) => {
      const { data } = await admin.from("fiscal_titulares").select("id, cliente_id, documento").eq("id", id).maybeSingle();
      return data ?? null;
    },
    podeSubir: async (autor, clienteId) => {
      const { data: ehAdmin } = await admin.rpc("is_admin_agroinblue", { _user_id: autor });
      if (ehAdmin === true) return true;
      const { data: perfil } = await admin.rpc("get_user_perfil", { _user_id: autor, _cliente_id: clienteId });
      return perfil === "gestor_cliente";
    },
    cifrar: async (bytes) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, bytes));
      const saida = new Uint8Array(iv.length + cifrado.length);
      saida.set(iv); saida.set(cifrado, iv.length);
      return saida;
    },
    gravarObjeto: async (caminho, bytes) => {
      const { error } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: "application/octet-stream", upsert: false });
      if (error) throw new Error("Não consegui guardar o arquivo cifrado. Nada foi gravado.");
    },
    apagarObjeto: async (caminho) => { await admin.storage.from(BUCKET).remove([caminho]); },
    registrar: async (r) => {
      const { data, error } = await admin.rpc("fn_fiscal_certificado_registrar",
        { p_titular_id: r.titularId, p_autor: r.autor, p_meta: r.meta, p_objeto: r.objeto, p_senha: r.senha });
      if (error) throw new Error(error.message);
      return { certificadoId: String(data?.certificado_id ?? ""), acao: String(data?.acao ?? "") };
    },
    registrarRecusa: async (titularId, autor, recusa) => {
      await admin.rpc("fn_fiscal_certificado_recusa_registrar", { p_titular_id: titularId, p_autor: autor, p_recusa: recusa });
    },
    novoId: () => crypto.randomUUID(),
    agora: () => new Date(),
  };

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;
  const r = await subirCertificado({
    token,
    titularId: typeof titularId === "string" ? titularId : null,
    senha: typeof senha === "string" ? senha : null,
    arquivo: arquivo instanceof File ? new Uint8Array(await arquivo.arrayBuffer()) : null,
  }, pecas);
  return json(r.status, r.corpo);
});
