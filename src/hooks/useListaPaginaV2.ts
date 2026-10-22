/**
 * FIN-V2-DESEMPENHO-01b — a página da lista de Lançamentos Financeiros, do servidor (`fn_fin_v2_lista_pagina`).
 * UMA ida por página (filtros, ordem e página), com a guarda de corrida de sempre (a resposta velha não sobrescreve a nova) e a
 * releitura pelo canal de lançamentos (quem grava avisa; a página volta sem F5). Sem `habilitado` não consulta e esvazia.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerLinhasV2, lerPaginaV2, type PaginaDaListaV2 } from '@/lib/financeiro/listaPaginaV2';
import { normalizarErro } from '@/lib/erroOperacional';

export interface PedidoDaPaginaV2 {
  filtros: Record<string, unknown>;
  ordem: Record<string, string>;
  pagina: number;
  porPagina: number;
}

export const FRASE_LISTA_INDISPONIVEL = 'Não foi possível carregar os lançamentos agora. Tente de novo.';

/** `conhecido`: o fornecedor cujo nome a tela já tem (o cadastro carregado) — a ida dos nomes da página pula esses (FIN-V2-DESEMPENHO-01c) */
export function useListaPaginaV2(clienteId: string | null | undefined, pedido: PedidoDaPaginaV2, habilitado: boolean,
  conhecido?: (id: string) => boolean) {
  const [pagina, setPagina] = useState<PaginaDaListaV2 | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* os NOMES dos fornecedores DESTA página (uma ida, por id): o cadastro inteiro do cliente vem em levas e chega segundos depois
     da página; sem isto a coluna Fornecedor ficaria esperando por ele */
  const [nomes, setNomes] = useState<ReadonlyMap<string, string>>(new Map());
  const token = useRef(0);
  /* a chave do pedido (o objeto muda a cada render; o texto não) */
  const chave = JSON.stringify(pedido);
  const chaveRef = useRef(chave);
  chaveRef.current = chave;
  const conhecidoRef = useRef(conhecido);
  conhecidoRef.current = conhecido;
  const nomesRef = useRef(nomes);
  nomesRef.current = nomes;
  /* FIN-V2-DESEMPENHO-01c — a última resposta COMPLETA e o recorte dela (cliente, filtros, ordem, "por página"): trocar SÓ a página
     pede só as linhas (`so_linhas`) e reaproveita totais, contagens e o uso por fornecedor */
  const ultima = useRef<{ recorte: string; pagina: PaginaDaListaV2 } | null>(null);

  const carregar = useCallback(async (completa: boolean = false): Promise<void> => {
    const meu = ++token.current;
    const vivo = () => meu === token.current;
    if (!clienteId || !habilitado) { ultima.current = null; setPagina(null); setCarregando(false); setErro(null); return; }
    const p: PedidoDaPaginaV2 = JSON.parse(chaveRef.current);
    const recorte = JSON.stringify([clienteId, p.filtros, p.ordem, p.porPagina]);
    const anterior = ultima.current;
    const soLinhas = !completa && !!anterior && anterior.recorte === recorte;
    setCarregando(true); setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc('fn_fin_v2_lista_pagina', {
        p_cliente: clienteId, p_filtros: p.filtros, p_ordem: soLinhas ? { ...p.ordem, so_linhas: true } : p.ordem,
        p_pagina: p.pagina, p_por_pagina: p.porPagina,
      });
      if (!vivo()) return;
      if (error) throw error;
      let lida: PaginaDaListaV2 | null;
      if (soLinhas && anterior) {
        const so = lerLinhasV2(data);
        if (!so) throw new Error('resposta da lista fora do formato');
        /* o total mudou entre uma página e outra (alguém gravou): os totais da tela ficaram velhos — relê tudo */
        if (so.total !== anterior.pagina.total) { ultima.current = null; return void carregar(true); }
        lida = { ...anterior.pagina, ...so };
      } else {
        lida = lerPaginaV2(data);
      }
      if (!lida) throw new Error('resposta da lista fora do formato');
      ultima.current = { recorte, pagina: lida };
      setPagina(lida);
      /* FIN-V2-DESEMPENHO-01c — a página está PRONTA aqui: os nomes que faltam vêm por trás (a célula mostra "…" até chegarem) e só os
         que a tela ainda não conhece (nem do cadastro, nem de uma página anterior) — trocar de página com o cadastro carregado = uma ida */
      setCarregando(false);
      const sabe = conhecidoRef.current;
      const ids = [...new Set(lida.linhas.map((l) => l.favorecido_id).filter((x): x is string => !!x))]
        .filter((id) => !nomesRef.current.has(id) && !(sabe && sabe(id)));
      if (ids.length > 0) {
        const { data: fs, error: ef } = await supabase.from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId).in('id', ids);
        if (!vivo()) return;
        if (!ef && fs) setNomes((antes) => { const m = new Map(antes); for (const f of fs) m.set(f.id, f.nome); return m; });
      }
    } catch (e) {
      if (!vivo()) return;
      console.error('fn_fin_v2_lista_pagina', normalizarErro(e, 'listaPaginaV2').diagnostico);
      setErro(FRASE_LISTA_INDISPONIVEL);
    } finally {
      if (vivo()) setCarregando(false);
    }
  }, [clienteId, habilitado]);

  useEffect(() => { carregar(); }, [carregar, chave]);
  /* quem grava lançamento avisa o canal; a página é relida (mesmo pedido) — COMPLETA: os totais mudaram */
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => { carregar(true); });
  }, [clienteId, carregar]);
  /* saiu da tela: a resposta que chegar depois não escreve nada */
  useEffect(() => () => { token.current += 1; }, []);
  const recarregar = useCallback(() => carregar(true), [carregar]);

  return { pagina, carregando, erro, nomes, recarregar };
}
