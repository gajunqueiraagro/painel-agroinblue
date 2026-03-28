import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um analista agropecuário sênior. Seu papel é gerar textos executivos para fechamentos mensais de operações pecuárias.

REGRAS ABSOLUTAS:
- Nunca inventar números. Use SOMENTE os dados fornecidos no snapshot.
- Tom: técnico, racional, objetivo, executivo.
- Menos recomendações genéricas, mais leitura de causa e consequência.
- Sempre explicar: o que mudou, por que mudou, qual o impacto.
- Quando possível, comparar realizado vs meta e realizado vs histórico.
- Máximo 4 parágrafos por seção.
- Formato: parágrafos curtos e diretos, sem bullet points longos.
- Use valores monetários formatados em R$ quando aplicável.
- Nunca use linguagem motivacional ou coaching.`;

const SECTION_PROMPTS: Record<string, string> = {
  resumo_executivo_ia: "Escreva um resumo executivo do mês analisando os principais pilares: receitas, custos, lucro bruto, saldo de caixa e movimentação de rebanho. Destaque os pontos de atenção.",
  texto_patrimonial_ia: "Analise a evolução patrimonial: estoque de gado, saldo financeiro e endividamento. Compare com período anterior quando disponível.",
  texto_operacional_ia: "Analise a operação: faturamento, desembolso produtivo, lucro bruto, margem EBITDA e markup. Explique as variações.",
  texto_zootecnico_ia: "Analise os indicadores zootécnicos: compras, vendas, nascimentos, mortes, peso médio, preços. Comente eficiência produtiva.",
  texto_fluxo_caixa_ia: "Analise o fluxo de caixa: entradas vs saídas, composição das saídas, saldo final. Comente a saúde financeira.",
  texto_desvios_ia: "Analise os desvios de custo: maiores pressões, economias e relação com orçamento quando disponível.",
  texto_aportes_dividendos_ia: "Analise aportes e dividendos: volume, tendência e impacto na estrutura de capital.",
  texto_endividamento_ia: "Analise o endividamento: amortizações, dividendos líquidos e estrutura da dívida. Comente o risco.",
  resumo_global_ia: "Crie um resumo global final com 3 blocos: Desempenho Operacional, Fluxo de Caixa e Estrutura Financeira. Cada bloco deve ter um parágrafo curto e objetivo.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { snapshot, periodo, secao } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sections = secao === "todas" 
      ? Object.keys(SECTION_PROMPTS) 
      : [secao].filter(s => SECTION_PROMPTS[s]);

    const textos: Record<string, string> = {};

    for (const sec of sections) {
      const userPrompt = `Período: ${periodo}

Dados do snapshot:
${JSON.stringify(snapshot, null, 2)}

Tarefa: ${SECTION_PROMPTS[sec]}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit. Tente novamente em alguns segundos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI error:", response.status, t);
        continue;
      }

      const result = await response.json();
      textos[sec] = result.choices?.[0]?.message?.content || "";
    }

    return new Response(JSON.stringify({ textos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
