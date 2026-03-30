import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MESES_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Row = {
  grupo: string;
  indicador: string;
  valores: number[];
  total: number;
};

type Payload = {
  zooRows: Row[];
  finRows: Row[];
  ano: number;
  ateMes: number;
  fazendaNome: string;
  filename?: string;
};

function parseFilename(value: string | undefined, fazendaNome: string, ano: number) {
  const fallback = `Painel_Consultor_${fazendaNome.replace(/\s+/g, "_")}_${ano}.xlsx`;
  const sanitized = (value || fallback)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized.endsWith(".xlsx") ? sanitized : `${sanitized || "Painel_Consultor"}.xlsx`;
}

function buildSheet(rows: Row[], mesesHeaders: string[], includeGrupo = true) {
  const data = rows.map((row) => {
    const base: Record<string, string | number> = includeGrupo
      ? { Grupo: row.grupo, Indicador: row.indicador }
      : { Indicador: row.indicador };

    mesesHeaders.forEach((mes, index) => {
      base[mes] = row.valores[index] ?? 0;
    });

    base.Total = row.total ?? 0;
    return base;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = includeGrupo
    ? [{ wch: 18 }, { wch: 24 }, ...mesesHeaders.map(() => ({ wch: 14 })), { wch: 14 }]
    : [{ wch: 24 }, ...mesesHeaders.map(() => ({ wch: 14 })), { wch: 14 }];

  return ws;
}

async function parsePayload(req: Request): Promise<Payload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await req.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const raw = formData.get("payload");
    if (typeof raw !== "string") throw new Error("Payload ausente");
    return JSON.parse(raw);
  }

  const rawText = await req.text();
  return JSON.parse(rawText);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await parsePayload(req);
    const mesesHeaders = MESES_LABELS.slice(0, Math.max(1, Math.min(12, Number(payload.ateMes) || 12)));
    const wb = XLSX.utils.book_new();

    const wsZoo = buildSheet(payload.zooRows || [], mesesHeaders, true);
    XLSX.utils.book_append_sheet(wb, wsZoo, "Zootecnico");

    const wsFin = buildSheet(payload.finRows || [], mesesHeaders, true);
    XLSX.utils.book_append_sheet(wb, wsFin, "Financeiro");

    const movRows = (payload.zooRows || []).filter((row) => row.grupo === "Movimentações");
    const wsMov = buildSheet(movRows, mesesHeaders, false);
    XLSX.utils.book_append_sheet(wb, wsMov, "Movimentacoes");

    const filename = parseFilename(payload.filename, payload.fazendaNome || "Fazenda", Number(payload.ano) || new Date().getFullYear());
    const workbook = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });

    return new Response(workbook, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("export-painel-consultor-excel error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao gerar Excel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});