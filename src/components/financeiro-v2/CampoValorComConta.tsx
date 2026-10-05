import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { calcularConta, contaOk, ehConta, FRASE_DA_CONTA, type MotivoDaConta } from '@/lib/calculos/contaNoCampo';

/**
 * O CAMPO VALOR DO LANÇAMENTO, COM A CONTA DENTRO — FIN-VALOR-CALC-01a (Gabriel, 05/10/2026).
 *
 * Ele lança rateios: o cliente manda o valor cheio e o lançamento é uma parte. Em vez de abrir o Excel, digita a conta AQUI
 * ("16.238,00/2") e o campo fica com o resultado. GUARDA-SE SÓ O RESULTADO: a conta não vai para lugar nenhum.
 *
 * ⚠ SEM OPERADOR, É O CAMPO DE SEMPRE — a máscara de centavos (só dígitos, empurra os centavos), o select no foco, o
 *   `tabIndex` 10. O HTML é o mesmo, byte a byte (preso por foto no teste).
 * ⚠ O MODO CONTA É ESTADO LOCAL DESTE CAMPO. O modal continua com UM valor (`valorDisplay`): enquanto a conta não é aplicada
 *   ele NÃO muda — a tela mostra o que vai gravar, nunca o texto parcial. Aplicar escreve o resultado no MESMO formato da máscara.
 * ⚠ QUEM CALCULA É A LIB (`contaNoCampo`), a mesma que o `CampoMoeda` vai chamar. Aqui só mora o gesto.
 */
const mascarar = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** O que, digitado sem nada antes, pede o valor que já estava no campo como primeiro operando. */
const COMECA_COM_OPERADOR = /^\s*[+\-−*/xX×÷%]/;

export function CampoValorComConta({
  rotulo, valor, onValor, disabled = false, className, contaAbertaRef,
}: {
  /** O rótulo de sempre (com a origem do XML, quando houver). */
  rotulo: React.ReactNode;
  /** O valor do modal, já mascarado ("16.238,00"). */
  valor: string;
  /** Escreve o valor do modal — só com valor MASCARADO: tecla da máscara ou conta aplicada. */
  onValor: (mascarado: string) => void;
  disabled?: boolean;
  className?: string;
  /**
   * `true` enquanto há conta aberta. O diálogo o consulta no Esc: o Radix escuta o teclado no DOCUMENTO, antes do campo, e
   * fecharia o modal — com a conta aberta o Esc cancela a conta e o modal fica.
   */
  contaAbertaRef?: React.MutableRefObject<boolean>;
}) {
  /** O texto livre da conta; `null` = fora do modo conta (a máscara manda). */
  const [conta, setContaEstado] = useState<string | null>(null);
  /** A recusa da última conta que não pôde ser aplicada ao sair do campo — fica até a próxima digitação. */
  const [recusa, setRecusa] = useState<MotivoDaConta | null>(null);
  const colando = useRef(false);

  const setConta = (t: string | null) => {
    setContaEstado(t);
    if (contaAbertaRef) contaAbertaRef.current = t !== null;
  };

  const resultado = conta === null ? null : calcularConta(conta);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cru = e.target.value;
    const colou = colando.current;
    colando.current = false;
    setRecusa(null);
    if (conta !== null) {
      /* Em modo conta o texto é LIVRE: dígito é dígito, não empurra centavos. Apagar tudo devolve o campo à máscara. */
      if (cru.trim() === '') { setConta(null); onValor('0,00'); return; }
      setConta(cru);
      return;
    }
    /* ⚠ OPERADOR DIGITADO SEM NADA ANTES: o foco seleciona o campo inteiro, e a tecla SUBSTITUI a seleção — chega só "/".
       O valor que estava no campo é o primeiro operando. Colado é diferente: quem cola "-5" colou um número com sinal, que
       não é conta (segue para a máscara, como sempre), e quem cola "/2" colou uma conta sem começo (a lib a recusa).
       ⚠ ANTES do `ehConta`: "/" sozinho também é "conta" para ele, e entraria sem o primeiro operando. */
    if (!disabled && !colou && COMECA_COM_OPERADOR.test(cru)) { setConta(`${valor}${cru.trim()}`); return; }
    if (!disabled && ehConta(cru)) { setConta(cru); return; }
    /* A máscara de sempre. */
    const digits = cru.replace(/\D/g, '');
    if (!digits) { onValor('0,00'); return; }
    onValor(mascarar(parseInt(digits, 10) / 100));
  };

  /** Aplica a conta se ela vale. Devolve `false` quando não aplicou. */
  const aplicar = (): boolean => {
    if (resultado && contaOk(resultado)) {
      onValor(mascarar(resultado.valor));
      setConta(null);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (conta === null) return;
    if (e.key === 'Enter') {
      /* Enter APLICA e não sobe: nada no modal pode tomá-lo por "salvar". Conta que não vale fica aberta, com a frase. */
      e.preventDefault();
      e.stopPropagation();
      aplicar();
    } else if (e.key === 'Escape') {
      /* Esc CANCELA a conta e volta ao valor de antes (que o modal nunca deixou de ter). O modal não fecha. */
      e.preventDefault();
      e.stopPropagation();
      setConta(null);
    }
  };

  const handleBlur = () => {
    if (conta === null) return;
    if (aplicar()) return;
    /* Saiu do campo com conta que não vale: NÃO aplica. O valor de antes volta e a frase do motivo fica. */
    if (resultado && !contaOk(resultado)) setRecusa(resultado.motivo);
    setConta(null);
  };

  const emConta = conta !== null;
  /** O que a linha do rótulo diz enquanto há conta (ou a recusa da última). `null` = o rótulo de sempre. */
  const dica: { texto: string; erro: boolean } | null = emConta && resultado
    ? (contaOk(resultado)
        ? { texto: `= ${mascarar(resultado.valor)}`, erro: false }
        : resultado.incompleta
          ? { texto: '= …', erro: false }
          : { texto: FRASE_DA_CONTA[resultado.motivo], erro: true })
    : recusa ? { texto: FRASE_DA_CONTA[recusa], erro: true } : null;

  return (
    <>
      {dica ? (
        /* ⚠ NADA MUDA DE ALTURA NEM DE LARGURA: `inline-flex` ocupa a mesma linha do rótulo de texto. A coluna tem 118px a
           1.135 e "= 999.999.999,99" pede 88,5: o NÚMERO nunca corta; quem cede é a palavra "Valor ·", com o inteiro no `title`. */
        <Label className="inline-flex max-w-full items-baseline gap-1 whitespace-nowrap text-[10px]" title={`Valor · ${dica.texto}`}>
          <span className="min-w-0 truncate">Valor ·</span>
          <span aria-live="polite" data-testid="valor-conta" data-erro={dica.erro ? 'sim' : undefined}
            className={cn('shrink-0 tabular-nums', dica.erro ? 'text-destructive' : 'text-muted-foreground')}>
            {dica.texto}
          </span>
        </Label>
      ) : (
        <Label className="text-[10px]">{rotulo}</Label>
      )}
      <Input tabIndex={10} value={emConta ? conta : valor} onChange={handleChange} onFocus={e => e.target.select()} className={className} placeholder="0,00" inputMode={emConta ? 'text' : 'numeric'} disabled={disabled}
        onKeyDown={handleKeyDown} onBlur={handleBlur} onPaste={() => { colando.current = true; }} />
    </>
  );
}
