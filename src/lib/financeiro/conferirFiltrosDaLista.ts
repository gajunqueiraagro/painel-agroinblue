/**
 * A CONFERÊNCIA DOS FILTROS RESTAURADOS — P94 (FIN-V2-FILTRO-FANTASMA-01, Gabriel 23/10/2026: "tem acontecido bastante"). PURO.
 *
 * O caso: Agnaldo · 2026 · Set · Cartão Elo dava "Nenhum lançamento" e, com os MESMOS filtros escolhidos do zero, 45 lançamentos.
 * Medido na FASE 0: um id que não está nas opções do cliente vai para o banco (`fn_fin_v2_lista_pagina`) e zera a lista, enquanto o
 * seletor mostra "Todos" (o Fornecedor), o id cru (Fazenda, Conta, plano) ou nada (Safra, Atividade, Cultura).
 * REGRA: A TELA NUNCA FILTRA O QUE NÃO MOSTRA. Todo filtro que volta (memória, instantâneo da OC, drill, troca de cliente) passa aqui
 * DEPOIS que as opções do cliente carregaram — nunca contra uma lista vazia ainda carregando:
 *   · o que não existe volta ao padrão, com a frase "Filtro de <campo> guardado não existe neste cliente — removido.";
 *   · o fornecedor MESCLADO vira o destino da mescla (a mesma cadeia do Mesclar, `fimDaCadeia`), com "Fornecedor X foi mesclado em Y —
 *     filtrando por Y.";
 *   · o fornecedor INATIVO fica (ele existe; o seletor o mostra com o selo "inativo").
 */
import { fimDaCadeia, type CadastroDaCadeia } from '@/lib/fornecedores/donoDoMesclado';

export const TODOS = '__all__';

/** Os filtros da barra que guardam um VALOR DE CADASTRO (id ou nome do plano) — os que podem não existir no cliente. */
export interface FiltrosDeCadastro {
  fazendaId: string; contaOrigem: string; contaDestino: string;
  macroFiltro: string; grupoFiltro: string; centroFiltro: string; subcentroFiltro: string;
  fornecedorFiltro: string; safraFiltro: string; culturaFiltro: string; atividadeFiltro: string;
}
export type CampoDeCadastro = keyof FiltrosDeCadastro;

export const ROTULO_DO_CAMPO: Record<CampoDeCadastro, string> = {
  fazendaId: 'Fazenda', contaOrigem: 'Conta Origem', contaDestino: 'Conta Destino', macroFiltro: 'Macro', grupoFiltro: 'Grupo',
  centroFiltro: 'Centro', subcentroFiltro: 'Subcentro', fornecedorFiltro: 'Fornecedor', safraFiltro: 'Safra', culturaFiltro: 'Cultura',
  atividadeFiltro: 'Atividade',
};

export interface FornecedorDaConferencia { id: string; nome: string; fundido_em_id?: string | null }
export interface OpcoesDoCliente {
  fazendas: readonly string[];
  contas: readonly string[];
  plano: readonly { macro_custo?: string | null; grupo_custo?: string | null; centro_custo?: string | null; subcentro?: string | null }[];
  fornecedores: readonly FornecedorDaConferencia[];
  safras: readonly string[];
  culturas: readonly string[];
  atividades: readonly string[];
  /** as sentinelas que NÃO são cadastro e valem sempre ("Sem safra", "Sem cultura") */
  sentinelas?: readonly string[];
}

export interface Conferencia {
  /** só os campos que mudam (o inexistente vai para `TODOS`; o mesclado, para o destino) */
  trocas: Partial<FiltrosDeCadastro>;
  avisos: string[];
}

export const fraseDoRemovido = (campo: CampoDeCadastro) => `Filtro de ${ROTULO_DO_CAMPO[campo]} guardado não existe neste cliente — removido.`;
export const fraseDoMesclado = (de: string, para: string) => `Fornecedor ${de} foi mesclado em ${para} — filtrando por ${para}.`;

function conjuntos(o: OpcoesDoCliente): Record<Exclude<CampoDeCadastro, 'fornecedorFiltro'>, ReadonlySet<string>> {
  const de = (k: 'macro_custo' | 'grupo_custo' | 'centro_custo' | 'subcentro') => new Set(o.plano.map((c) => c[k] ?? '').filter(Boolean));
  const contas = new Set(o.contas);
  return {
    fazendaId: new Set(o.fazendas), contaOrigem: contas, contaDestino: contas,
    macroFiltro: de('macro_custo'), grupoFiltro: de('grupo_custo'), centroFiltro: de('centro_custo'), subcentroFiltro: de('subcentro'),
    safraFiltro: new Set(o.safras), culturaFiltro: new Set(o.culturas), atividadeFiltro: new Set(o.atividades),
  };
}

/** Os campos cujo valor ativo NÃO está nas opções do cliente (o fornecedor mesclado conta como fora: ele não é escolhível). */
export function camposForaDasOpcoes(f: FiltrosDeCadastro, o: OpcoesDoCliente): CampoDeCadastro[] {
  const s = conjuntos(o);
  const sentinelas = new Set([TODOS, '', ...(o.sentinelas ?? [])]);
  const fora: CampoDeCadastro[] = [];
  for (const campo of Object.keys(ROTULO_DO_CAMPO) as CampoDeCadastro[]) {
    const v = f[campo];
    if (sentinelas.has(v)) continue;
    if (campo === 'fornecedorFiltro') {
      const forn = o.fornecedores.find((x) => x.id === v);
      if (!forn || forn.fundido_em_id) fora.push(campo);
      continue;
    }
    if (!s[campo].has(v)) fora.push(campo);
  }
  return fora;
}

export function conferirFiltrosDaLista(f: FiltrosDeCadastro, o: OpcoesDoCliente): Conferencia {
  const trocas: Partial<FiltrosDeCadastro> = {};
  const avisos: string[] = [];
  for (const campo of camposForaDasOpcoes(f, o)) {
    if (campo === 'fornecedorFiltro') {
      const conhecidos = new Map<string, CadastroDaCadeia>(o.fornecedores.map((x) => [x.id, { id: x.id, nome: x.nome, fundido_em_id: x.fundido_em_id ?? null }]));
      const de = conhecidos.get(f.fornecedorFiltro);
      const dono = de?.fundido_em_id ? fimDaCadeia(conhecidos, de.id) : null;
      if (de && dono) {
        trocas.fornecedorFiltro = dono.id;
        avisos.push(fraseDoMesclado(de.nome, dono.nome));
        continue;
      }
    }
    trocas[campo] = TODOS;
    avisos.push(fraseDoRemovido(campo));
  }
  return { trocas, avisos };
}
