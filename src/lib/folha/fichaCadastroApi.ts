/**
 * FOLHA-FUNC-CADASTRO-01 — o banco da aba Cadastro completa: lê os campos novos do funcionário (lote 118720) e o favorecido (pagamento e
 * contato), e grava o favorecido pelo gravador de campo (`fn_fornecedor_atualizar_campos`, origem 'tela', referência 'folha-ficha').
 * ⚠ API INJETÁVEL (como a `FolhaApi`): a bancada e os testes trocam por uma de dado sintético.
 * ⚠ Arquivo PRÓPRIO (e não o `folhaApi.ts`, que o lançamento alcança em 17 telas fora da Folha — régua de fonte do gate).
 */
import { supabase } from '@/integrations/supabase/client';
import { ehLinha, type Linha } from '@/lib/folha/folhaTela';
import { extrasDaLinha, favorecidoDaLinha, CAMPOS_DO_FAVORECIDO, type CampoDoFavorecido, type ExtrasDoFuncionario, type FavorecidoDaFicha } from '@/lib/folha/fichaCadastro';
import type { Resultado } from '@/lib/folha/folhaApi';

export interface CadastroDoBanco { extras: ExtrasDoFuncionario; favorecido: FavorecidoDaFicha | null }
export interface FichaCadastroApi {
  ler(funcionarioId: string, favorecidoId: string | null): Promise<Resultado<CadastroDoBanco>>;
  gravarFavorecido(favorecidoId: string, campos: Partial<Record<CampoDoFavorecido, string>>, simular: boolean): Promise<Resultado<Linha>>;
}

const COLUNAS_EXTRAS = 'sexo, estado_civil, dependentes, jornada, fazenda_registro_id, experiencia_ate, rg, cnh_categoria, cnh_validade, contato_emergencia, dia_pagamento, dia_pagamento_util';

export const fichaCadastroDoBanco: FichaCadastroApi = {
  async ler(funcionarioId, favorecidoId) {
    /* funcionário NOVO (sem id): os campos novos começam vazios; o favorecido escolhido já se lê */
    let extras: ExtrasDoFuncionario = extrasDaLinha({});
    if (funcionarioId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: as colunas novas ainda não estão no types.ts
      const f = await (supabase as any).from('folha_funcionarios').select(COLUNAS_EXTRAS).eq('id', funcionarioId).maybeSingle();
      if (f.error || !ehLinha(f.data)) return { ok: false, erro: 'Não consegui ler o cadastro do funcionário.' };
      extras = extrasDaLinha(f.data);
    }
    let favorecido: FavorecidoDaFicha | null = null;
    if (favorecidoId) {
      const p = await supabase.from('financeiro_fornecedores').select(['id', 'nome', ...CAMPOS_DO_FAVORECIDO].join(', ')).eq('id', favorecidoId).maybeSingle();
      if (p.error) return { ok: false, erro: 'Não consegui ler o favorecido (pagamento e contato).' };
      favorecido = favorecidoDaLinha(p.data);
    }
    return { ok: true, dados: { extras, favorecido } };
  },
  async gravarFavorecido(favorecidoId, campos, simular) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_fornecedor_atualizar_campos', {
      p_fornecedor: favorecidoId, p_campos: campos, p_origem: 'tela', p_referencia: 'folha-ficha', p_simular: simular,
    });
    if (error) return { ok: false, erro: typeof error.message === 'string' && error.message ? error.message : 'O banco recusou o pagamento/contato.' };
    return { ok: true, dados: ehLinha(data) ? data : {} };
  },
};
