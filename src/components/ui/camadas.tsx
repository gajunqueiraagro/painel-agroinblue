/**
 * NAV-VOLTA-ORIGEM-01 (Gabriel 19/11, regra de produto em todas as telas) — AS CAMADAS DA TELA: fechar, cancelar ou salvar um modal aberto
 * a partir de outro VOLTA EXATAMENTE DE ONDE SAIU — o mesmo modal, a mesma aba, os mesmos filtros/busca/ordem, a mesma rolagem e a
 * linha de onde saiu destacada. A peça é UMA (proposta aprovada 19/11):
 *   · `useCamadas` — a PILHA da tela hospedeira: `abrir(id, sobre)` empilha; `fechar(id, retorno)` desempilha e entrega o retorno à
 *     camada de baixo (`retornoPara(id)`: `{ acao, chave, n }` — `n` muda a cada volta, para o efeito de quem recebe);
 *   · `<Camada coberta>` — a camada de baixo NUNCA desmonta: o `DialogContent` da casa lê o contexto e fica INVISÍVEL (o conteúdo e o
 *     fundo escuro, `visibility: hidden` — nunca `display: none`, que zera a rolagem) enquanto outra está por cima. O estado e a rolagem
 *     ficam; o Radix já dá o foco e o Esc só à de cima.
 * ⚠ Modal que abre outro usa `camadas.abrir(…, sobre)`; NUNCA `setAberto(false)` + `setOutro(true)` no mesmo gesto (perde a origem).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type AcaoDoRetorno = 'salvou' | 'fechou';
export interface RetornoDaCamada { acao: AcaoDoRetorno; /** o item que a camada de cima tratou (a chave da nota, o id do lançamento) */ chave: string | null; n: number }
export interface Camadas<Id extends string> { pilha: Id[]; origem: Partial<Record<Id, Id>> }

/** (pura) empilha `id` sobre `sobre` — o que estava acima de `sobre` sai; sem `sobre` aberto, a pilha recomeça em `id` */
export function abrirNaPilha<Id extends string>(c: Camadas<Id>, id: Id, sobre?: Id | null): Camadas<Id> {
  const base = sobre && c.pilha.includes(sobre) ? c.pilha.slice(0, c.pilha.indexOf(sobre) + 1).filter((x) => x !== id) : [];
  return { pilha: [...base, id], origem: { ...c.origem, [id]: sobre && base.includes(sobre) ? sobre : undefined } };
}
/** (pura) tira `id` (e o que estiver acima dele); devolve para quem vai o retorno (a camada de onde `id` foi aberta, se ainda aberta) */
export function fecharDaPilha<Id extends string>(c: Camadas<Id>, id: Id): { camadas: Camadas<Id>; volta: Id | null } {
  const i = c.pilha.indexOf(id);
  if (i < 0) return { camadas: c, volta: null };
  const pilha = c.pilha.slice(0, i);
  const o = c.origem[id];
  return { camadas: { pilha, origem: c.origem }, volta: o && pilha.includes(o) ? o : null };
}
export const cobertaNaPilha = <Id extends string>(c: Camadas<Id>, id: Id): boolean => c.pilha.includes(id) && c.pilha[c.pilha.length - 1] !== id;

export function useCamadas<Id extends string>() {
  const [camadas, setCamadasEstado] = useState<Camadas<Id>>({ pilha: [], origem: {} });
  const [retornos, setRetornos] = useState<Partial<Record<Id, RetornoDaCamada>>>({});
  /* a pilha de AGORA (dois gestos no mesmo clique enxergam um ao outro); o cálculo fica fora do atualizador (puro) */
  const atual = useRef<Camadas<Id>>({ pilha: [], origem: {} });
  const seq = useRef(0);
  const por = useCallback((c: Camadas<Id>) => { atual.current = c; setCamadasEstado(c); }, []);
  const abrir = useCallback((id: Id, sobre?: Id | null) => por(abrirNaPilha(atual.current, id, sobre)), [por]);
  const fechar = useCallback((id: Id, acao: AcaoDoRetorno = 'fechou', chave: string | null = null) => {
    const { camadas: depois, volta } = fecharDaPilha(atual.current, id);
    por(depois);
    if (volta) { seq.current += 1; const r: RetornoDaCamada = { acao, chave, n: seq.current }; setRetornos((x) => ({ ...x, [volta]: r })); }
  }, [por]);
  return useMemo(() => ({
    abrir, fechar,
    aberta: (id: Id) => camadas.pilha.includes(id),
    coberta: (id: Id) => cobertaNaPilha(camadas, id),
    retornoPara: (id: Id): RetornoDaCamada | null => retornos[id] ?? null,
    pilha: camadas.pilha,
  }), [abrir, fechar, camadas, retornos]);
}

const CamadaCoberta = createContext(false);
/** o `DialogContent` da casa pergunta: estou coberto por outra camada? */
export const useCamadaCoberta = () => useContext(CamadaCoberta);
/** embrulha a camada que pode ficar POR BAIXO (o modal de origem) */
export function Camada({ coberta, children }: { coberta: boolean; children: ReactNode }) {
  return <CamadaCoberta.Provider value={coberta}>{children}</CamadaCoberta.Provider>;
}
