const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPTS: Record<string, string> = {
  entradas: `Você é um assistente que extrai dados de cadernos pecuários manuscritos. Esta foto contém ENTRADAS de animais (compras ou transferências recebidas). Extraia uma linha por lançamento.

Para cada linha retorne os campos:
- data (YYYY-MM-DD)
- tipo_op ("Compra" ou "Transferência")
- categoria (ex: "Bezerros", "Garrotes", "Novilhas", "Vacas", "Touros", "Bois")
- quantidade (número de cabeças)
- peso_medio_kg (peso médio por animal em kg, número)
- preco_medio_cabeca (R$ por cabeça, número, opcional)
- fazenda_origem (texto livre, opcional)
- observacao (texto livre, opcional)

REGRA DE INCERTEZA: Se você não tiver certeza absoluta sobre um valor, prefixe-o com "?" (ex: "?Bezerros", "?45"). Se um campo não existe na foto, omita-o.`,
  saidas: `Você é um assistente que extrai dados de cadernos pecuários manuscritos. Esta foto contém SAÍDAS de animais (vendas, abates, transferências). Extraia uma linha por lançamento.

Para cada linha retorne os campos:
- data (YYYY-MM-DD)
- tipo_op ("Venda", "Abate", "Abate+Venda" ou "Transferência")
- categoria
- quantidade
- peso_medio_kg
- peso_carcaca_kg (opcional, para abates)
- preco_medio_cabeca (opcional)
- fazenda_destino (opcional, para transferências)
- observacao (opcional)

REGRA DE INCERTEZA: Se você não tiver certeza absoluta sobre um valor, prefixe-o com "?".`,
  nascimentos: `Você é um assistente que extrai dados de cadernos pecuários manuscritos. Esta foto contém NASCIMENTOS. Extraia uma linha por lançamento.

Campos:
- data (YYYY-MM-DD)
- categoria (geralmente "Bezerros" ou "Bezerras")
- quantidade
- observacao (opcional)

REGRA DE INCERTEZA: Se você não tiver certeza absoluta sobre um valor, prefixe-o com "?".`,
  mortes_consumo: `Você é um assistente que extrai dados de cadernos pecuários manuscritos. Esta foto contém MORTES, CONSUMO ou DOAÇÕES. Extraia uma linha por evento.

Campos:
- data (YYYY-MM-DD)
- evento ("Morte", "Consumo" ou "Doação")
- categoria
- quantidade
- observacao (opcional, ex: causa da morte)

REGRA DE INCERTEZA: Se você não tiver certeza absoluta sobre um valor, prefixe-o com "?".`,
  chuvas: `Você é um assistente que extrai dados de cadernos pecuários manuscritos. Esta foto contém medições de CHUVA. Extraia uma linha por dia.

Campos:
- data (YYYY-MM-DD)
- mm (milímetros de chuva, número)
- observacao (opcional)

REGRA DE INCERTEZA: Se você não tiver certeza absoluta sobre um valor, prefixe-o com "?".`,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageB64, imageMime, tipo } = await req.json();

    if (!imageB64 || !imageMime || !tipo) {
      return new Response(JSON.stringify({ error: 'imageB64, imageMime e tipo são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = PROMPTS[tipo];
    if (!prompt) {
      return new Response(JSON.stringify({ error: `Tipo inválido: ${tipo}. Use: ${Object.keys(PROMPTS).join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fullPrompt = `${prompt}

Retorne APENAS um array JSON válido, sem texto antes ou depois, sem markdown. Exemplo: [{"data":"2024-03-15","categoria":"Bezerros","quantidade":10}]. Se a foto não tiver dados extraíveis, retorne [].`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: imageMime, data: imageB64 },
              },
              { type: 'text', text: fullPrompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      return new Response(JSON.stringify({ error: `Anthropic API erro ${response.status}`, detalhe: errText }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const textContent = result.content?.[0]?.text || '';

    // Parse JSON robusto: aceita markdown fences e texto extra
    let parsed: unknown[] = [];
    try {
      const cleaned = textContent.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(match ? match[0] : cleaned);
      if (!Array.isArray(parsed)) parsed = [];
    } catch (e) {
      console.error('Falha parse JSON:', textContent);
      return new Response(JSON.stringify({ error: 'Resposta da IA não é JSON válido', raw: textContent }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ data: parsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('extract-caderno erro:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
