/**
 * LISTAS-DIGITAVEIS-01 — o carregador do catálogo por lista e cliente (`carregarCatalogo`), com UMA memória por lista + cliente para
 * as instâncias abertas ao mesmo tempo (o modal da morte e a morte em lote não leem duas vezes) e o aviso entre elas: quem cria um
 * item chama `catalogoMudou` e todas releem.
 * ⚠ "FALHOU" NÃO É LISTA VAZIA (P146): `estado: 'erro'` com a frase; o campo diz "Não consegui carregar a lista" e oferece tentar de novo.
 */
import { useCallback, useEffect, useState } from 'react';
import { carregarCatalogo, type ItemDoCatalogo, type ListaDoCatalogo } from '@/lib/catalogo/catalogo';

type Estado = { estado: 'carregando' } | { estado: 'ok'; itens: ItemDoCatalogo[] } | { estado: 'erro'; mensagem: string };

const memoria = new Map<string, Promise<Estado>>();
const ouvintes = new Set<(chave: string) => void>();

const chaveDe = (lista: ListaDoCatalogo, clienteId: string) => `${lista}:${clienteId}`;

function ler(lista: ListaDoCatalogo, clienteId: string): Promise<Estado> {
  const chave = chaveDe(lista, clienteId);
  const ja = memoria.get(chave);
  if (ja) return ja;
  const p: Promise<Estado> = carregarCatalogo(lista, clienteId).then((r) => {
    /* erro não fica guardado: a próxima abertura tenta de novo */
    /* `'motivo' in r`, e não `r.ok`: sem `strictNullChecks` o booleano não separa a união */
    if ('motivo' in r) { memoria.delete(chave); return { estado: 'erro', mensagem: r.motivo }; }
    return { estado: 'ok', itens: r.valor };
  });
  memoria.set(chave, p);
  return p;
}

/** Quem gravou um item avisa: a memória daquela lista + cliente cai e toda instância aberta relê. */
export function catalogoMudou(lista: ListaDoCatalogo, clienteId: string): void {
  const chave = chaveDe(lista, clienteId);
  memoria.delete(chave);
  ouvintes.forEach((f) => f(chave));
}

/** Só para os testes. */
export function esquecerCatalogos(): void {
  memoria.clear();
}

export function useCatalogo(lista: ListaDoCatalogo, clienteId: string | null | undefined) {
  const [estado, setEstado] = useState<Estado>({ estado: 'carregando' });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!clienteId) { setEstado({ estado: 'carregando' }); return; }
    let vivo = true;
    setEstado((e) => (e.estado === 'ok' ? e : { estado: 'carregando' }));
    void ler(lista, clienteId).then((r) => { if (vivo) setEstado(r); });
    return () => { vivo = false; };
  }, [lista, clienteId, versao]);

  useEffect(() => {
    if (!clienteId) return;
    const minha = chaveDe(lista, clienteId);
    const f = (chave: string) => { if (chave === minha) setVersao((v) => v + 1); };
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, [lista, clienteId]);

  const tentarDeNovo = useCallback(() => {
    if (clienteId) memoria.delete(chaveDe(lista, clienteId));
    setVersao((v) => v + 1);
  }, [lista, clienteId]);

  return { ...estado, itens: estado.estado === 'ok' ? estado.itens : [], tentarDeNovo };
}
