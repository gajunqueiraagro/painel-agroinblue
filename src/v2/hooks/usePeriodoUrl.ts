/**
 * O PERÍODO MORA NA URL — PR-SELETOR-PERIODO-02.
 *
 * ⚠ SUBSTITUI SETE PARES DE `useFiltroUrl('f_ano'/'f_mes', …)`. Antes, cada tela declarava
 * os dois parâmetros com um codec próprio do `periodoUrl`, porque cada uma guardava o mês
 * num vocabulário diferente. Sete declarações do mesmo contrato é o número de lugares onde
 * ele pode divergir — e ele divergiu: duas telas não sabiam dizer "ano inteiro" e liam
 * `f_mes=0` como janeiro, o que rendeu uma fábrica de codecs só para consertar. Com o
 * período sendo um intervalo, o vocabulário some do endereço e sobra um contrato só.
 *
 * ⚠ LÊ OS DOIS FORMATOS, GRAVA SÓ O NOVO. Um link antigo (`?f_ano=2026&f_mes=3`) continua
 * abrindo no lugar certo: é convertido na leitura e o endereço se corrige sozinho na
 * primeira renderização. Sem isso, todo link já compartilhado — e o `sessionStorage` de
 * quem estava com a tela aberta — apontaria para o mês errado no dia do deploy.
 *
 * ⚠ `f_ano` SOZINHO NÃO VIRA O ANO INTEIRO. Três telas só têm seletor de ano e nunca
 * escreveram `f_mes`; lê-las como janeiro-a-dezembro mudaria o recorte de quem só trocou de
 * ano. Sem `f_mes`, o ano vem da URL e o RECORTE DE MESES vem do padrão da tela — que é
 * exatamente o que ela fazia antes.
 *
 * ⚠ UMA ESCRITA SÓ, com `setParams` chamado uma vez. Dois `useFiltroUrl` seguidos gravariam
 * `f_de` e `f_ate` em duas passadas, e a segunda leria a URL antes de a primeira ter sido
 * confirmada pelo roteador — o intervalo sairia meio gravado.
 *
 * ⚠ A BASE DA ESCRITA É O `prev` DO ROTEADOR, NÃO `window.location.search`. O `useFiltroUrl`
 * lê a janela para pegar o valor fresco e não se atropelar entre dois cliques seguidos; a
 * forma funcional do `setParams` dá o mesmo frescor SEM sair do roteador. A diferença
 * aparece na hora em que se tenta testar: sob `MemoryRouter` a janela não é a URL, e um
 * hook que só funciona com `BrowserRouter` é um hook que não se prova. Foi assim que o
 * teste do endereço com os dois formatos apagou o novo em vez de apagar o velho.
 */
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { anoMes, ordenar, type Periodo } from '@/v2/lib/periodo';

const DE = 'f_de';
const ATE = 'f_ate';
const ANO_LEGADO = 'f_ano';
const MES_LEGADO = 'f_mes';

/** `'2026-02'` → `{ano:2026, mes:2}`. Devolve `null` para qualquer coisa que não seja isso. */
function lerPonto(bruto: string | null) {
  if (!bruto) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(bruto);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano: Number(m[1]), mes };
}

/**
 * O formato antigo, traduzido. `f_mes=0` era "o ano inteiro" — a convenção do 01b —, e
 * qualquer outro valor era um mês só.
 */
function lerLegado(params: URLSearchParams, padrao: Periodo): Periodo | null {
  const anoBruto = params.get(ANO_LEGADO);
  const mesBruto = params.get(MES_LEGADO);
  if (anoBruto === null && mesBruto === null) return null;

  const ano = Number(anoBruto) || padrao.de.ano;
  if (mesBruto === null) {
    /* Só o ano mudou: o recorte de meses continua sendo o da tela. */
    return { de: { ano, mes: padrao.de.mes }, ate: { ano, mes: padrao.ate.mes } };
  }
  const mes = Number(mesBruto);
  if (mes === 0) return { de: { ano, mes: 1 }, ate: { ano, mes: 12 } };
  if (mes < 1 || mes > 12) return { de: { ano, mes: padrao.de.mes }, ate: { ano, mes: padrao.ate.mes } };
  return { de: { ano, mes }, ate: { ano, mes } };
}

export function usePeriodoUrl(padrao: Periodo): [Periodo, (p: Periodo) => void] {
  const [params, setParams] = useSearchParams();

  /* ⚠ O PADRÃO ENTRA POR VALOR, NÃO POR IDENTIDADE. As telas o escrevem inline
     (`usePeriodoUrl(mesUnico(2026, 3))`), então o objeto nasce novo a cada render; usá-lo
     cru nas dependências recriaria o setter sem parar — o mesmo motivo que fez os codecs do
     `useFiltroUrl` virarem constantes de módulo. Dois textos comparam o mesmo dado e não
     mudam de identidade. */
  const padraoDe = anoMes(padrao.de);
  const padraoAte = anoMes(padrao.ate);

  const daUrl = (() => {
    const de = lerPonto(params.get(DE));
    const ate = lerPonto(params.get(ATE));
    if (de && ate) return ordenar({ de, ate });
    return null;
  })();

  const legado = daUrl ? null : lerLegado(params, padrao);
  const periodo = daUrl ?? legado ?? padrao;

  /* ⚠ A REGRAVAÇÃO É EFEITO, NUNCA RENDER. Chamar `setParams` durante o render de um
     componente é escrever no roteador enquanto ele desenha — o React avisa e o estado pode
     sair pela metade. Roda uma vez, quando um endereço antigo é encontrado. */
  const temLegado = params.get(ANO_LEGADO) !== null || params.get(MES_LEGADO) !== null;
  useEffect(() => {
    if (!temLegado) return;
    setParams((anterior) => {
      const p = new URLSearchParams(anterior);
      p.delete(ANO_LEGADO);
      p.delete(MES_LEGADO);
      if (legado && !(anoMes(legado.de) === padraoDe && anoMes(legado.ate) === padraoAte)) {
        p.set(DE, anoMes(legado.de));
        p.set(ATE, anoMes(legado.ate));
      }
      return p;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temLegado, padraoDe, padraoAte]);

  /* ⚠ PADRÃO NÃO VAI PARA A URL — a mesma disciplina do `useFiltroUrl`, e pela mesma razão:
     "endereço limpo" tem de continuar significando "filtro padrão". O valor atual sai da URL
     na hora de escrever, não de um closure, para dois cliques seguidos não se atropelarem. */
  const definir = useCallback((novo: Periodo) => {
    const alvo = ordenar(novo);
    setParams((anterior) => {
      const p = new URLSearchParams(anterior);
      p.delete(ANO_LEGADO);
      p.delete(MES_LEGADO);
      if (anoMes(alvo.de) === padraoDe && anoMes(alvo.ate) === padraoAte) {
        p.delete(DE);
        p.delete(ATE);
      } else {
        p.set(DE, anoMes(alvo.de));
        p.set(ATE, anoMes(alvo.ate));
      }
      return p;
    }, { replace: true });
  }, [padraoDe, padraoAte, setParams]);

  return [periodo, definir];
}
