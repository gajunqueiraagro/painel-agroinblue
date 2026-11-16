/**
 * BOLETO D3b — a porta do e-mail de boletos: recebe da Lambda do SES (`infra/ses-entrada/`) os POSTs assinados (HMAC) das etapas
 * `arquivo` e `mensagem`. PÚBLICA (`verify_jwt = false` no config.toml: a Lambda não tem JWT do Supabase; quem protege é a assinatura).
 * Só liga as peças reais; a ordem e as recusas moram em `_shared/entradaEmail.ts` (provadas no vitest).
 * Secret: ENTRADA_EMAIL_HMAC (o Gabriel cola no proto; o MESMO valor do ENTRADA_HMAC da Lambda). ⚠ Nada é logado.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { crypto as stdCrypto } from "jsr:@std/crypto@1";
import { CABECALHO_ASSINATURA, receber, type Pecas } from "../_shared/entradaEmail.ts";

const BUCKET = "fin-documentos";
const MIME = { pdf: "application/pdf", xml: "application/xml" };

Deno.serve(async (req) => {
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false });
  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !servico) return json(503, { ok: false, motivo: "configuracao" });
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  const pecas: Pecas = {
    segredo: Deno.env.get("ENTRADA_EMAIL_HMAC") ?? null,
    agoraSegundos: () => Math.floor(Date.now() / 1000),
    clienteDoEndereco: async (local) => {
      const { data, error } = await admin.from("cliente_entrada_email").select("cliente_id").eq("local", local).eq("ativo", true).maybeSingle();
      if (error) throw new Error("leitura do endereço");
      return data?.cliente_id ?? null;
    },
    md5: async (bytes) =>
      Array.from(new Uint8Array(await stdCrypto.subtle.digest("MD5", bytes)), (x) => x.toString(16).padStart(2, "0")).join(""),
    gravarObjeto: async (caminho, bytes, tipo) => {
      const { error } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: MIME[tipo], upsert: false });
      // o mesmo md5 já guardado é o MESMO arquivo: sucesso
      if (error && !/exists|duplicate/i.test(error.message)) throw new Error("storage");
    },
    objetoExiste: async (caminho) => {
      const i = caminho.lastIndexOf("/");
      const { data, error } = await admin.storage.from(BUCKET).list(caminho.slice(0, i), { search: caminho.slice(i + 1), limit: 2 });
      if (error) throw new Error("storage");
      return (data ?? []).some((o) => o.name === caminho.slice(i + 1));
    },
    registrar: async (p) => {
      const { data, error } = await admin.rpc("_fn_entrada_registrar", { p });
      if (error) return { ok: false, codigo: error.code ?? null };
      return { ok: true, valor: data && typeof data === "object" && !Array.isArray(data) ? data : {} };
    },
  };

  try {
    const r = await receber(pecas, await req.text(), req.headers.get(CABECALHO_ASSINATURA));
    return json(r.status, r.corpo);
  } catch {
    return json(500, { ok: false, motivo: "falha" });   // a Lambda tenta de novo
  }
});
