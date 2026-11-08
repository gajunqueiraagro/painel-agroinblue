/**
 * CONC-CRIAR-PERDE-DADOS-01 (Gabriel 08/11/2026) — FORMULÁRIO ABERTO NUNCA PERDE DADOS.
 *
 * O dono de um formulário costuma montar o objeto que passa por prop (`prefill`, as travas, o lançamento aberto) a cada render, e uma
 * releitura em segundo plano (o react-query relê ao voltar o foco à janela) repinta o dono com um objeto NOVO e IGUAL. Quem hidrata o
 * formulário por efeito com esse objeto na dependência repunha todos os campos — "a página parece atualizar sozinha".
 *
 * `useConteudoEstavel` devolve a MESMA referência enquanto o CONTEÚDO não muda: o efeito só roda quando o dado muda de verdade (o
 * "+ Da nota" lido, outro lançamento), nunca por um objeto novo igual. Arquivo (`File`/`Blob`) entra pela assinatura nome·tamanho·data.
 */
import { useRef } from 'react';

const assinatura = (_k: string, v: unknown): unknown => {
  if (typeof Blob !== 'undefined' && v instanceof Blob) {
    const nome = typeof File !== 'undefined' && v instanceof File ? `${v.name}:${v.lastModified}` : '';
    return `arquivo:${nome}:${v.size}:${v.type}`;
  }
  if (v instanceof Map) return { mapa: [...v.entries()] };
  if (v instanceof Set) return { conjunto: [...v.values()] };
  return v;
};

/** A chave do conteúdo (`undefined`/`null` têm chave própria). */
export function chaveDoConteudo(v: unknown): string {
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v, assinatura) ?? 'undefined';
  } catch {
    /* ciclo ou algo que não se serializa: sem chave, a identidade decide (o comportamento de antes) */
    return `ref:${Math.random()}`;
  }
}

export function useConteudoEstavel<T>(valor: T): T {
  const guardado = useRef<{ chave: string; valor: T } | null>(null);
  const chave = chaveDoConteudo(valor);
  if (!guardado.current || guardado.current.chave !== chave) guardado.current = { chave, valor };
  return guardado.current.valor;
}
