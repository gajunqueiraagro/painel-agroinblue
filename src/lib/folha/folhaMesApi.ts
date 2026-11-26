/**
 * FOLHA-TELAS-03 — o banco das abas "Folha do mês" e "Férias": `fn_folha_mes` (118430/118435), `fn_folha_mes_confirmar` e
 * `fn_folha_ferias_lista` (118740), e o reabrir de sempre (`fn_folha_reabrir`). Toda escrita passa ANTES pela prévia (`simular`).
 * ⚠ API INJETÁVEL (como a `FolhaApi`): a bancada e os testes trocam por uma de dado sintético.
 * ⚠ Arquivo PRÓPRIO (e não o `folhaApi.ts`, que o lançamento alcança em 17 telas fora da Folha — régua de fonte do gate).
 * ⚠ ERRO: P0001 traz a frase pronta (vai para a faixa, nunca toast).
 */
import { supabase } from '@/integrations/supabase/client';
import { ehLinha, fraseDoErro, type Linha } from '@/lib/folha/folhaTela';
import { folhaDoMesDoBanco, type FolhaDoMes, type TipoDaFolha } from '@/lib/folha/folhaMes';
import { feriasDoBanco, type FeriasDaFolha } from '@/lib/folha/folhaFerias';
import type { Resultado } from '@/lib/folha/folhaApi';

export interface FolhaMesApi {
  mes(clienteId: string, competencia: string, tipo: TipoDaFolha): Promise<Resultado<FolhaDoMes>>;
  confirmar(clienteId: string, competencia: string, tipo: TipoDaFolha, simular: boolean): Promise<Resultado<Linha>>;
  reabrir(folhaId: string, motivo: string, simular: boolean): Promise<Resultado<Linha>>;
  ferias(clienteId: string): Promise<Resultado<FeriasDaFolha>>;
}

async function rpc(nome: string, args: Record<string, unknown>, padrao: string): Promise<Resultado<unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo (as funções nasceram depois do types.ts)
  const { data, error } = await (supabase as any).rpc(nome, args);
  return error ? { ok: false, erro: fraseDoErro(error, padrao) } : { ok: true, dados: data };
}
const comoLinha = (r: Resultado<unknown>): Resultado<Linha> => (r.ok ? { ok: true, dados: ehLinha(r.dados) ? r.dados : {} } : { ok: false, erro: r.erro ?? 'Não consegui gravar.' });

export const folhaMesDoBanco: FolhaMesApi = {
  async mes(clienteId, competencia, tipo) {
    const r = await rpc('fn_folha_mes', { p_cliente: clienteId, p_competencia: competencia, p_tipo: tipo }, 'Não consegui ler a folha do mês.');
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Não consegui ler a folha do mês.' };
    const f = folhaDoMesDoBanco(r.dados);
    return f ? { ok: true, dados: f } : { ok: false, erro: 'O banco não devolveu a folha do mês.' };
  },
  async confirmar(clienteId, competencia, tipo, simular) {
    return comoLinha(await rpc('fn_folha_mes_confirmar', { p_cliente: clienteId, p_competencia: competencia, p_tipo: tipo, p_simular: simular },
      'Não consegui confirmar a folha. Nada foi gravado.'));
  },
  async reabrir(folhaId, motivo, simular) {
    return comoLinha(await rpc('fn_folha_reabrir', { p_folha: folhaId, p_motivo: motivo, p_simular: simular }, 'Não consegui reabrir a folha. Nada foi gravado.'));
  },
  async ferias(clienteId) {
    const r = await rpc('fn_folha_ferias_lista', { p_cliente: clienteId }, 'Não consegui ler as férias.');
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Não consegui ler as férias.' };
    const f = feriasDoBanco(r.dados);
    return f ? { ok: true, dados: f } : { ok: false, erro: 'O banco não devolveu as férias.' };
  },
};
