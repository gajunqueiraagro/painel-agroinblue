/**
 * `useFiltroUrl` — um filtro que vive na URL. MOVIDO VERBATIM de
 * `CentralOperacoesComerciais.tsx` em PR-BARRA-UNICA-01a.
 *
 * ⚠ O MOVE NÃO MUDOU UMA LINHA do corpo nem dos comentários: só o `function` virou
 * `export function`. Ele saiu de dentro da Central porque o `SeletorPeriodo` precisa da
 * MESMA mecânica para `f_ano`/`f_mes`, e a segunda cópia é o momento em que um trecho vira
 * módulo. Os comentários abaixo falam da Central porque foi lá que a regra nasceu — e é a
 * história dela que explica por que o estado mora na URL e não no componente.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * OS FILTROS VIVEM NA URL — PR-OC-LISTA-01 adendo.
 *
 * ⚠ NÃO HAVIA RESET A CORRIGIR: havia estado a mover. Abrir uma OC troca a seção do
 * `V2Index` (`if (section === 'operacoes-comerciais') return …`), e a Central DESMONTA
 * inteira; fechar monta uma instância nova, com todo `useState` no default. Guardar os
 * filtros aqui dentro nunca funcionaria — não sobra componente vivo para guardá-los.
 *
 * ⚠ A URL JÁ É O MECANISMO DESTA TELA. `oc_compra`, `oc_id`, `oc_aba` e `oc_return` moram
 * lá, e `fecharOperacaoOC` apaga SÓ os `oc_*` — então um parâmetro de filtro atravessa a
 * ida e a volta sem que ninguém precise preservá-lo. De brinde, o F5 respeita o recorte e
 * o link é compartilhável.
 *
 * ⚠ DEFAULT NÃO VAI PARA A URL. Escrever `f_tipo=__all__` encheria a barra de endereço de
 * ruído e faria "URL limpa" deixar de significar "filtros padrão". Valor igual ao padrão
 * apaga o parâmetro.
 *
 * ⚠ `replace`, NUNCA `push`: digitar oito letras na busca criaria oito entradas no
 * histórico, e o "voltar" do navegador viraria um desfazer letra a letra.
 */
export function useFiltroUrl<T>(
  chave: string,
  padrao: T,
  ler: (bruto: string) => T,
  escrever: (valor: T) => string,
): [T, (valor: T | ((atual: T) => T)) => void] {
  const [params, setParams] = useSearchParams();
  const bruto = params.get(chave);
  const valor = bruto === null ? padrao : ler(bruto);
  /* ⚠ ACEITA A FORMA FUNCIONAL do `useState` — `setPage(p => p + 1)` e o toggle da
     ordenação já a usam, e são idioma legítimo. O valor atual sai da URL na hora da
     escrita, não de um closure: dois cliques seguidos não se atropelam. */
  const definir = useCallback((novo: T | ((atual: T) => T)) => {
    const p = new URLSearchParams(window.location.search);
    const cru = p.get(chave);
    const atual = cru === null ? padrao : ler(cru);
    const alvo = typeof novo === 'function' ? (novo as (a: T) => T)(atual) : novo;
    const texto = escrever(alvo);
    if (texto === escrever(padrao)) p.delete(chave); else p.set(chave, texto);
    setParams(p, { replace: true });
  }, [chave, padrao, ler, escrever, setParams]);
  return [valor, definir];
}
