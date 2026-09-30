/**
 * A Mesa APRENDE o apelido de subcentro — PR-CONC-EXCEL-PLANILHA-COMPLETA-01 (decisão do Gabriel, opção A).
 *
 * ⚠ O MECANISMO É O DO IMPORTADOR DE LANÇAMENTOS, reusado e não copiado: a chave é `chaveSubcentro` (a composta
 *   "conta ⟂ safra" do B-22d quando a linha traz safra; a simples quando não) e a gravação é `persistirApelidos`, com o
 *   mesmo repontamento (`mapaDeRepontamento`) — texto que já era apelido de outro subcentro SAI do antigo e entra no
 *   novo, sem duplicar. É o mecanismo ÚNICO de contexto de apelido; proibido criar um segundo.
 * ⚠ SEMPRE COMPOSTA QUANDO HÁ SAFRA, diferente do importador (que só desdobra a conta que aparece com duas safras no
 *   arquivo): na Mesa o operador está corrigindo justamente o caso em que o apelido simples de uma atividade caiu numa
 *   linha de outra. Ensinar o simples repetiria o erro na próxima linha da outra safra.
 * ⚠ O APELIDO GOVERNA O FUTURO, NUNCA O PASSADO — a regra do `persistirApelidos` vale aqui: nenhum lançamento já gravado
 *   muda por causa disto; só o próximo populate resolve diferente.
 */
import { supabase } from '@/integrations/supabase/client';
import { chaveSubcentro, type DeParaMap } from '@/v2/lib/importLanc/importLancamentosView';
import { persistirApelidos, mapaDeRepontamento, ORIGEM_IMPORTACAO } from '@/v2/lib/importLanc/persistirApelidos';

/** A chave que a Mesa ensina: composta com a safra da planilha, simples sem ela; `null` sem conta na planilha. */
export function chaveDoApelidoDaMesa(
  contaPlanilha: string | null | undefined,
  safraPlanilha: string | null | undefined,
): string | null {
  const conta = contaPlanilha?.trim();
  if (!conta) return null;
  const safra = safraPlanilha?.trim();
  return chaveSubcentro(conta, safra ? safra : null);
}

export async function aprenderApelidoDaMesa(p: {
  clienteId: string;
  contaPlanilha: string | null | undefined;
  safraPlanilha: string | null | undefined;
  subcentro: string;
  planoContaId: string | null | undefined;
}): Promise<{ ok: boolean; chave: string | null; erro?: string }> {
  const chave = chaveDoApelidoDaMesa(p.contaPlanilha, p.safraPlanilha);
  if (!chave || !p.planoContaId) return { ok: false, chave, erro: 'sem conta na planilha ou sem linha no plano' };
  const { data, error } = await supabase
    .from('financeiro_subcentro_aliases')
    .select('id, cliente_id, alias_text, origem')
    .eq('cliente_id', p.clienteId)
    .eq('origem', ORIGEM_IMPORTACAO);
  if (error) return { ok: false, chave, erro: error.message };
  const mapa: DeParaMap = {
    [chave]: { texto: chave, qtd: 1, valor: p.subcentro, origem: 'manual', rotulo: p.subcentro },
  };
  const res = await persistirApelidos({
    clienteId: p.clienteId,
    subcentro: mapa,
    fornecedor: {},
    conta: {},
    planoIdPorSubcentro: { [p.subcentro]: p.planoContaId },
    aliasIdPorTexto: mapaDeRepontamento(data ?? [], p.clienteId),
    aliasesFornecedor: {},
    aliasesConta: {},
  });
  return { ok: res.subcentro === 1, chave, erro: res.erros[0] };
}
