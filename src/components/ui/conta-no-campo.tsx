import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { calcularConta, contaOk, ehConta, FRASE_DA_CONTA, type MotivoDaConta } from '@/lib/calculos/contaNoCampo';

/* O GESTO DA CONTA NO CAMPO — P91 (Gabriel 25/10/2026: "conta no campo também nos campos numéricos: kg, @, %, cab").
   ⚠ MORAVA DENTRO DO `CampoMoeda` (FIN-VALOR-CALC-01b) e SAIU DE LÁ SEM MUDAR UMA LINHA DE COMPORTAMENTO: o campo de dinheiro e o
     campo de número (`CampoNumeroComConta`) usam ESTE hook, então o gesto é um só — operador → modo conta; balão sob o campo
     ("= x", "= …" ou a frase); Enter ou sair aplica; Esc cancela e volta ao valor do FOCO; conta que não fecha não grava e a frase
     fica até a próxima digitação/foco; o hospedeiro não recebe nada durante a conta.
   ⚠ QUEM CALCULA É A LIB (`contaNoCampo`). Aqui só mora o gesto.
   ⚠ O Esc E O Enter SÃO PEGOS NA JANELA, NA CAPTURA: o Radix escuta o Esc no DOCUMENTO, na captura, antes do campo — e fecharia o
     modal. A janela vem antes do documento, então com a conta aberta o Esc é do campo e o modal fica. */
const OPERADOR_SOZINHO = /^[+\-−*/xX×÷%]$/;
const OPERADOR_SOZINHO_SEM_SINAL = /^[+*/xX×÷%]$/;

export function useContaNoCampo({ valor, casas, aceitaNegativo, escrever, setTexto, onChange }: {
  /** O valor que o hospedeiro tem agora. */
  valor: number | null;
  casas: number;
  aceitaNegativo: boolean;
  /** Como o campo escreve um número (o resultado aplicado e o valor do foco). */
  escrever: (n: number) => string;
  /** O texto do campo fora do modo conta. */
  setTexto: (t: string) => void;
  onChange: (n: number | null) => void;
}) {
  /** O texto livre da conta; `null` = fora do modo conta (o campo de sempre). */
  const [conta, setConta] = useState<string | null>(null);
  /** A recusa da última conta que não pôde ser aplicada ao sair do campo — fica até a próxima digitação ou foco. */
  const [recusa, setRecusa] = useState<MotivoDaConta | null>(null);
  /** O valor que o campo tinha ao ganhar o foco: é para ele que o Esc volta, e é a base do "10%" sozinho. */
  const valorNoFoco = useRef<number | null>(valor);
  const colando = useRef(false);
  const campoRef = useRef<HTMLInputElement>(null);

  const resultado = conta === null ? null : calcularConta(conta, { casas, aceitaNegativo, base: valorNoFoco.current });
  /** Aplica a conta se ela vale. Devolve `false` quando não aplicou. */
  const aplicar = (): boolean => {
    if (!resultado || !contaOk(resultado)) return false;
    setConta(null);
    setTexto(escrever(resultado.valor));
    onChange(resultado.valor);
    return true;
  };
  /** Cancela a conta: o campo volta ao valor do foco (o hospedeiro só é avisado se tinha recebido outro número no meio). */
  const cancelar = () => {
    setConta(null);
    const antes = valorNoFoco.current;
    setTexto(antes != null ? escrever(antes) : '');
    if (antes !== valor) onChange(antes);
  };
  const teclaRef = useRef<(e: KeyboardEvent) => void>(() => {});
  teclaRef.current = (e: KeyboardEvent) => {
    if (e.target !== campoRef.current || e.isComposing) return;
    if (e.key === 'Enter') {
      /* Enter APLICA e não sobe: nada no modal pode tomá-lo por "salvar". Conta que não vale fica aberta, com a frase. */
      e.preventDefault(); e.stopPropagation();
      aplicar();
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      cancelar();
    }
  };
  const emConta = conta !== null;
  useEffect(() => {
    if (!emConta) return;
    const ouvir = (e: KeyboardEvent) => teclaRef.current(e);
    window.addEventListener('keydown', ouvir, true);
    return () => window.removeEventListener('keydown', ouvir, true);
  }, [emConta]);

  /** O que o balão diz: o resultado da conta aberta, "= …" enquanto incompleta, ou a frase da recusa. `null` = sem balão. */
  const dica: { texto: string; erro: boolean } | null = emConta && resultado
    ? (contaOk(resultado)
        ? { texto: `= ${escrever(resultado.valor)}`, erro: false }
        : resultado.incompleta
          ? { texto: '= …', erro: false }
          : { texto: FRASE_DA_CONTA[resultado.motivo], erro: true })
    : recusa ? { texto: FRASE_DA_CONTA[recusa], erro: true } : null;

  return {
    campoRef, conta, emConta, dica,
    /** No foco: guarda o valor do foco e apaga a frase da última recusa. */
    focar: () => { valorNoFoco.current = valor; setRecusa(null); },
    colar: () => { colando.current = true; },
    /**
     * A digitação. Devolve `true` quando o gesto da conta cuidou do texto (o hospedeiro não faz nada); `false` = o campo de sempre.
     * `textoAtual` é o texto do campo antes da tecla (o 1º operando do operador sozinho).
     */
    digitar: (cru: string, textoAtual: string, desabilitado: boolean | undefined): boolean => {
      const colou = colando.current;
      colando.current = false;
      if (recusa) setRecusa(null);
      if (emConta) {
        /* Em modo conta o texto é LIVRE. Apagar tudo devolve o campo ao de sempre, vazio. */
        if (cru.trim() === '') { setConta(null); setTexto(''); onChange(null); return true; }
        setConta(cru);
        return true;
      }
      if (!desabilitado) {
        /* ⚠ OPERADOR DIGITADO SOBRE O CAMPO TODO SELECIONADO (Tab seleciona): a tecla SUBSTITUI o texto e chega só "/". O
           valor que estava é o primeiro operando. Colado não: "/2" colado é conta sem começo (a lib recusa). No campo que
           aceita negativo, o "-" sozinho é o sinal de um número novo, não operador. */
        const sozinho = aceitaNegativo ? OPERADOR_SOZINHO_SEM_SINAL : OPERADOR_SOZINHO;
        if (!colou && sozinho.test(cru.trim()) && textoAtual.trim() !== '') { setConta(`${textoAtual.trim()}${cru.trim()}`); return true; }
        if (ehConta(cru)) { setConta(cru); return true; }
      }
      return false;
    },
    /** A saída do campo. Devolve `true` quando havia conta aberta (aplicada, ou recusada e desfeita); `false` = o campo de sempre. */
    sair: (): boolean => {
      if (!emConta) return false;
      if (aplicar()) return true;
      /* Saiu com conta que não vale: NÃO grava. O valor do foco volta e a frase do motivo fica no balão. */
      setRecusa(resultado && !contaOk(resultado) ? resultado.motivo : 'invalida');
      cancelar();
      return true;
    },
  };
}

/** O balão sob o campo: o resultado da conta, "= …" ou a frase da recusa. O invólucro do campo é `relative`. */
export function BalaoDaConta({ dica }: { dica: { texto: string; erro: boolean } | null }) {
  if (!dica) return null;
  return (
    /* ⚠ O BALÃO NÃO DESLOCA NADA: absoluto, sob o campo, alinhado à direita (onde está o número), por cima do que houver.
       Uma linha, sem corte: o número é o que o operador precisa ler. */
    <span role="status" aria-live="polite" data-testid="conta-do-campo" data-erro={dica.erro ? 'sim' : undefined}
      className={cn('pointer-events-none absolute right-0 top-full z-50 mt-0.5 whitespace-nowrap rounded border bg-popover px-1 text-[10px] leading-[14px] tabular-nums shadow-sm',
        dica.erro ? 'border-destructive/50 text-destructive' : 'text-muted-foreground')}>
      {dica.texto}
    </span>
  );
}
