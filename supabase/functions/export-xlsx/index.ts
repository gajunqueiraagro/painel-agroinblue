import * as XLSX from "npm:xlsx@0.18.5";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CellValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const JsonRowSchema = z.record(CellValueSchema);
const AoaRowSchema = z.array(CellValueSchema);

const SheetSchema = z.object({
  name: z.string().min(1).max(64),
  mode: z.enum(["json", "aoa"]).default("json"),
  rows: z.array(z.union([JsonRowSchema, AoaRowSchema])),
  cols: z.array(z.object({ wch: z.number().positive().max(120) })).optional(),
});

const PayloadSchema = z.object({
  filename: z.string().min(1).max(180),
  sheets: z.array(SheetSchema).min(1).max(25),
});

type Payload = z.infer<typeof PayloadSchema>;

action();

function action() {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const parsed = PayloadSchema.safeParse(await parsePayload(req));
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = parsed.data;
      const workbook = buildWorkbook(payload);
      const filename = sanitizeFilename(payload.filename);
      const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });

      return new Response(output, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": XLSX_MIME,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("export-xlsx error", error);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao gerar arquivo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  });
}

async function parsePayload(req: Request): Promise<unknown> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await req.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") {
      throw new Error("Payload ausente");
    }
    return JSON.parse(rawPayload);
  }

  return JSON.parse(await req.text());
}

function buildWorkbook(payload: Payload) {
  const workbook = XLSX.utils.book_new();

  payload.sheets.forEach((sheet, index) => {
    const worksheet = sheet.mode === "aoa"
      ? XLSX.utils.aoa_to_sheet(sheet.rows as Array<Array<string | number | boolean | null>>)
      : XLSX.utils.json_to_sheet(sheet.rows as Array<Record<string, string | number | boolean | null>>);

    if (sheet.cols?.length) {
      worksheet["!cols"] = sheet.cols;
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheet.name, index));
  });

  return workbook;
}

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (cleaned.toLowerCase().endsWith(".xlsx")) {
    return cleaned;
  }

  return `${cleaned || "export"}.xlsx`;
}

function sanitizeSheetName(name: string, index: number) {
  const base = name
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);

  return base || `Sheet${index + 1}`;
}
