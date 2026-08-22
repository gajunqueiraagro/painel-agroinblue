/**
 * Área em hectares no padrão pt-BR (0.000,00) — formatador e parser.
 *
 * ORIGEM. Nasceu em PR-PASTO-DESTINO-01 dentro de PastosTab.tsx, foi COPIADA
 * para V2Fazendas.tsx (PR-AREA-MATRICULA-01) e de novo para V2AreasMeta.tsx.
 * Cada cópia trazia o mesmo comentário prometendo extrair "quando aparecer o
 * terceiro consumidor". Ele apareceu; este módulo é a promessa cumprida.
 *
 * As três cópias foram conferidas antes da extração: `formatarAreaBR` era
 * IDÊNTICA byte a byte nas três, e `parseAreaBR` diferia apenas no nome da
 * variável local (`num` em V2Fazendas, `n` nas outras) — zero diferença de
 * comportamento. Adotado o `n`, que era 2 de 3. A deriva do nome existia
 * porque V2Fazendas tem um `n` de MÓDULO, outro helper, que o local sombreava;
 * esse helper continua lá e não tem relação com estas funções.
 *
 * POR QUE O INPUT É TEXTO. `type="number"` não exibe separador de milhar nem
 * vírgula decimal. Os três consumidores digitam livre e formatam no blur.
 */

/**
 * Formata área em ha no padrão pt-BR, SEMPRE com 2 casas.
 * `null` e não-finito devolvem string vazia, nunca "0,00".
 *
 * As DUAS casas são contrato, não estética: o valor volta para o próprio
 * input no blur, e formatar com 1 casa faria o blur destruir o centavo que o
 * operador acabou de digitar (decisão de db360075). Tela que EXIBE área com
 * 1 casa formata na exibição, não aqui.
 */
export function formatarAreaBR(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Converte texto pt-BR em número. Ponto é separador de MILHAR e vírgula é
 * decimal — "3.403,20" vira 3403.2.
 *
 * Vazio e inválido devolvem NULL, nunca 0: campo em branco não é valor zero.
 * A distinção é a mesma que a migration da Meta de área criou no banco
 * (NULL = não planejado, 0 = planejado como zero) e é a razão pela qual o
 * `parseNumOrZero` que existia em V2AreasMeta foi descartado — ele devolvia
 * 0 nos dois casos e nem removia o separador de milhar, então "3.403,20"
 * virava NaN e gravava ZERO.
 */
export function parseAreaBR(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').replace(',', '.').trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
