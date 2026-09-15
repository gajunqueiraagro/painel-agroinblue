import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
/* ⚠ `brl`, `round2` e `parseMoeda` SAIRAM DAQUI para `lib/calculos/numeroBR` — regra pura não
   mora em componente, e `lib/agri/colheita` precisava do parser sem arrastar React junto.
   A reexportação mantém os doze consumidores intactos: quem importava daqui continua
   importando daqui. */
import { brl, round2, roundCasas, formatCasas, parseMoeda } from '@/lib/calculos/numeroBR';

export { brl, round2, parseMoeda };

/* CAMPO MONETARIO DO SISTEMA (padrao A19 de docs/PADROES-UI.md).
   ⚠ NAO NASCEU AQUI: veio INTEIRO de src/components/compra/AbaCompromissosOC.tsx, onde
   era funcao LOCAL e nao exportada — por isso o formulario de documentos exibia
   `106425` cru: nao dava para reusar o que estava trancado dentro de outro componente.
   Movido byte a byte, sem uma virgula de mudanca de comportamento; AbaCompromissosOC
   passou a importar daqui e nao guarda mais copia.
   ⚠ NAO ESCREVER UM SEGUNDO. Qualquer entrada de dinheiro no sistema usa este campo. */

// Campo monetário: texto de edição livre enquanto foca; normaliza p/ BRL (2 casas) no blur; emite o número.
/* ⚠ `disabled` e' a UNICA linha ACRESCENTADA depois do move — o campo original nao a
   tinha porque nenhum chamador dele precisava. E' opcional e, quando omitida, chega ao
   <Input> como `undefined`: AbaCompromissosOC nao muda em nada. */
export function CampoMoeda({ valor, onChange, placeholder, className, disabled, casas = 2, title }: {
  valor: number | null; onChange: (n: number | null) => void; placeholder?: string; className?: string;
  disabled?: boolean;
  /**
   * ⚠ QUANTAS CASAS O CAMPO GUARDA — 2 por padrão, e o padrão é o que mantém os onze consumidores
   * existentes byte a byte como estavam: `roundCasas(n, 2) === round2(n)` e o formato é o mesmo.
   * O R$/saca da venda de grão pede 4 (F3): o romaneio da cooperativa traz preço com quatro casas,
   * e arredondar na digitação joga fora centavos que o comprador de fato cobrou.
   */
  casas?: number;
  title?: string;
}) {
  /* ⚠ O "R$" SÓ APARECE COM DUAS CASAS. `brl` é fixo em 2 por definição de moeda; com 4 o campo
     mostra o número puro em pt-BR, porque "R$ 97,8532" não é uma quantia que se escreve — é um
     preço unitário. O símbolo volta no total, que é dinheiro de verdade. */
  const escrever = (n: number) => (casas === 2 ? brl(n) : formatCasas(n, casas));
  const [texto, setTexto] = useState(valor != null ? escrever(valor) : '');
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(valor != null ? escrever(valor) : ''); }, [valor, editando, casas]);
  return (
    <Input
      inputMode="decimal" value={texto} placeholder={placeholder} className={className} disabled={disabled}
      title={title}
      onFocus={() => setEditando(true)}
      onChange={(e) => { setTexto(e.target.value); onChange(parseMoeda(e.target.value)); }}
      onBlur={() => {
        setEditando(false);
        const n = parseMoeda(texto);
        const r = n != null ? roundCasas(n, casas) : null;
        onChange(r);
        setTexto(r != null ? escrever(r) : '');
      }}
    />
  );
}

/**
 * CAMPO DE NÚMERO FORMATADO — AGRI-COLHEITA-FIX-05.
 *
 * ⚠ MESMO PARSER DO DINHEIRO, OUTRA SAÍDA. `parseMoeda` fica sendo o único lugar do sistema
 * que decide se um ponto é milhar ou decimal; o que muda aqui é a formatação — número puro
 * com N casas, sem "R$", porque quilo e ppb não são moeda. Escrever um segundo parser é que
 * seria o pecado que o topo deste arquivo proíbe.
 * ⚠ NASCEU DE UM DEFEITO MEDIDO: na colheita, "26.560" era lido como 26,56 e a quebra saía
 * −22.655,92, disparando "o peso seco não pode ser maior que o verde" numa carga correta. O
 * `parseNumericValue` trata ponto sem vírgula como DECIMAL (`'5.000'` → 5, está no CLAUDE.md);
 * `parseMoeda` olha quantos dígitos vêm depois — 1 ou 2 é decimal, 3 é milhar. Para peso de
 * balança, que chega em milhares, é a única regra que acerta.
 * ⚠ O ESTADO CONTINUA TEXTO, como o resto dos formulários da casa: o campo devolve a string
 * já normalizada no blur ("26.560,00"), e quem valida chama `parseMoeda` de novo. Trocar o
 * form inteiro para número seria outro PR.
 */
export function CampoNumero({
  valor, onChange, casas = 2, placeholder, className, disabled, title,
}: {
  /** Texto do campo — o form guarda string. */
  valor: string;
  /** Recebe o texto: cru enquanto digita, normalizado em pt-BR no blur. */
  onChange: (texto: string) => void;
  casas?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Input
      inputMode="decimal" value={valor} placeholder={placeholder} className={className}
      disabled={disabled} title={title}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const n = parseMoeda(valor);
        /* Campo vazio continua vazio: "0,00" onde não se digitou nada é um dado inventado. */
        if (n == null) { onChange(''); return; }
        /* ⚠ ERA `round2` AQUI, E A PROP `casas` SÓ MEXIA NA FORMATAÇÃO — então pedir 4 casas dava
           um número já cortado em 2, formatado com quatro zeros à direita. Agora o arredondamento
           segue a prop, e o piso de exibição continua em 2 (A19).
           ⚠ COM `casas = 2` O RESULTADO É IDÊNTICO ao de antes: `roundCasas(n,2) === round2(n)` e
           min=max=2. Nenhum dos consumidores existentes muda. */
        onChange(formatCasas(roundCasas(n, casas), casas));
      }}
    />
  );
}
