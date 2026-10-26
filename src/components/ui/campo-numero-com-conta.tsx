import { useState, useEffect, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useContaNoCampo, BalaoDaConta } from '@/components/ui/conta-no-campo';
import { separarClasses } from '@/components/ui/campo-moeda';
import { roundCasas, formatCasas, parseMoeda } from '@/lib/calculos/numeroBR';

/**
 * CAMPO DE NÚMERO COM CONTA — P91 (Gabriel 25/10/2026). Caso: Negociar lote · Novilhas · 39 cab, "445,97*0,50" na carcaça. O irmão
 * do `CampoMoeda` para quilo, arroba, percentual, cabeça e dias: sem "R$", com o gesto da conta INTEIRO (o mesmo hook,
 * `useContaNoCampo`, e a mesma lib, `contaNoCampo`).
 *
 * ⚠ O NÚMERO É LIDO PELO `parseMoeda`, o mesmo leitor dos operandos da conta: o "445,97" sozinho e o "445,97" dentro de
 *   "445,97*0,50" têm de ser o mesmo número. Ponto seguido de 3 ou mais dígitos é milhar ("1.234" = mil duzentos e trinta e quatro);
 *   vírgula é o decimal.
 * ⚠ `casas` ARREDONDA o resultado da conta e o número ao sair do campo, e é como o campo escreve (2 por padrão; cabeça e dias, 0;
 *   GMD, 3; a média do boitel, 5). O que a tela mostra é o que o hospedeiro recebe.
 * ⚠ `soAoSair`: o hospedeiro só recebe o número ao sair do campo ou no Enter (o campo de carcaça do lote recalcula tudo a partir
 *   dele). Sem a opção, recebe a cada tecla, como o `CampoMoeda`.
 * ⚠ `percentual`: o "%" digitado é a unidade do campo, não o operador — sai do texto. Num campo de percentual, "1,5%" é 1,5.
 * ⚠ O vazio é vazio (`null`), nunca zero inventado.
 */
export function CampoNumeroComConta({ valor, onChange, casas = 2, soAoSair = false, percentual = false, sufixoDentro, placeholder, className, disabled, title, invalido }: {
  valor: number | null;
  onChange: (n: number | null) => void;
  casas?: number;
  soAoSair?: boolean;
  percentual?: boolean;
  /** A unidade escrita DENTRO do campo, à direita ("kg", "%"). */
  sufixoDentro?: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  /** Borda vermelha — a mensagem mora em quem chama. */
  invalido?: boolean;
}) {
  const escrever = (n: number) => formatCasas(n, casas);
  const ler = (t: string): number | null => parseMoeda(t);
  const [texto, setTexto] = useState(valor != null ? escrever(valor) : '');
  const [editando, setEditando] = useState(false);
  const c = useContaNoCampo({ valor, casas, aceitaNegativo: false, escrever, setTexto, onChange });
  useEffect(() => { if (!editando) setTexto(valor != null ? escrever(valor) : ''); }, [valor, editando, casas]);
  const { fora, dentro } = separarClasses(className);

  /** O número do texto, arredondado e reescrito; vai ao hospedeiro. */
  const fechar = () => {
    const n = ler(texto);
    const r = n != null ? roundCasas(n, casas) : null;
    onChange(r);
    setTexto(r != null ? escrever(r) : '');
  };

  return (
    <div className={cn('relative', fora)} data-testid="campo-numero">
      <Input
        ref={c.campoRef}
        inputMode="decimal" value={c.emConta ? c.conta : texto} placeholder={placeholder} disabled={disabled} title={title}
        className={cn(dentro, 'text-right tabular-nums', sufixoDentro != null && 'pr-7', invalido && 'border-destructive')}
        onFocus={() => { setEditando(true); c.focar(); }}
        onPaste={c.colar}
        onChange={(e) => {
          let cru = e.target.value;
          if (percentual) {
            /* O "%" é a unidade: some do texto. Uma tecla que era só "%" não apaga o número. */
            const limpo = cru.replace(/%/g, '');
            if (limpo === '' && cru !== '') return;
            cru = limpo;
          }
          if (c.digitar(cru, texto, disabled)) return;
          setTexto(cru);
          if (!soAoSair) onChange(ler(cru));
        }}
        onKeyDown={(e) => {
          /* Com conta aberta o Enter é da conta (pego na janela, antes daqui). Sem conta, no `soAoSair` o Enter entrega o número. */
          if (soAoSair && !c.emConta && e.key === 'Enter') { e.preventDefault(); fechar(); }
        }}
        onBlur={() => {
          setEditando(false);
          if (c.sair()) return;
          fechar();
        }}
      />
      {sufixoDentro != null && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{sufixoDentro}</span>
      )}
      <BalaoDaConta dica={c.dica} />
    </div>
  );
}
