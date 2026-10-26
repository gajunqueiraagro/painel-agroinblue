import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useContaNoCampo, BalaoDaConta } from '@/components/ui/conta-no-campo';
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
/* A CONTA NO CAMPO — FIN-VALOR-CALC-01b (Gabriel 29/09, opção A: "conta direto no campo, em todos os campos de valor").
   "988.224-976.224", "16.238,00/2", "976.224,00+10%": o campo entra em MODO CONTA quando o texto ganha operador (`ehConta`),
   mostra o resultado num balão sob o campo e GUARDA SÓ O RESULTADO, no formato de sempre (`escrever`).
   ⚠ QUEM CALCULA É A LIB (`contaNoCampo`), a mesma do Valor do lançamento (`CampoValorComConta`). Aqui só mora o gesto, o mesmo:
     Enter ou sair do campo aplica; Esc cancela a conta e o campo volta ao valor que tinha ao ganhar o foco; conta que não fecha
     não grava e deixa a frase da lib (`FRASE_DA_CONTA`) no balão até a próxima digitação.
   ⚠ SEM OPERADOR É O CAMPO DE SEMPRE — o mesmo HTML, byte a byte (preso por `campoMoeda.fotos.json`). O balão só existe com conta.
   ⚠ DURANTE A CONTA O HOSPEDEIRO NÃO RECEBE NADA: o texto parcial nunca vira número (o `parseMoeda` leria "988.224-9" como
     9882249). Ele fica com o último número digitado antes do operador até a conta ser aplicada ou cancelada.
   ⚠ O Esc E O Enter SÃO PEGOS NA JANELA, NA CAPTURA: o Radix escuta o Esc no DOCUMENTO, na captura, antes do campo — e fecharia o
     modal. A janela vem antes do documento, então com a conta aberta o Esc é do campo e o modal fica (sem tocar nos 29 hospedeiros).
   ⚠ AS OPÇÕES DO CAMPO VALEM NA CONTA: `casas` arredonda o resultado; sem `aceitaNegativo`, resultado negativo é recusa ("resultado
     negativo"); com ele, o "-" no começo é sinal e não operador. "10%" sozinho é dez por cento do valor que o campo tinha. */
/* ⚠ P91: O GESTO SAIU PARA `useContaNoCampo` (src/components/ui/conta-no-campo.tsx), o mesmo do campo de número — movido sem mudar
   comportamento (as fotos do `campoMoeda.fotos.json` e o `campoMoedaConta.test.tsx` prendem). */
/* ⚠ `disabled` e' a UNICA linha ACRESCENTADA depois do move — o campo original nao a
   tinha porque nenhum chamador dele precisava. E' opcional e, quando omitida, chega ao
   <Input> como `undefined`: AbaCompromissosOC nao muda em nada. */
export function CampoMoeda({ valor, onChange, placeholder, className, disabled, casas = 2, title, aceitaNegativo = false, autoFocus }: {
  valor: number | null; onChange: (n: number | null) => void; placeholder?: string; className?: string;
  disabled?: boolean;
  /**
   * ⚠ ACEITA SINAL NEGATIVO — PR-CAMPO-MOEDA-NEGATIVO-01. `parseMoeda` apaga tudo que não é
   * dígito, ponto ou vírgula, o sinal junto: "-1.845,32" virava +1.845,32 em silêncio. Saldo de
   * conta no vermelho é negativo de verdade, então o campo lê o sinal no INÍCIO do texto
   * (hífen `-` ou o menos tipográfico `−`, U+2212) e o aplica ao número.
   * ⚠ O PADRÃO É `false` E O PARSER NÃO MUDOU: quem não passa o flag segue exatamente como
   * antes — peso, preço, valor de documento não têm negativo. `-R$ 1.845,32` é o que `brl`
   * escreve em pt-BR, e começa com o hífen, então refocar e sair de novo preserva o sinal.
   */
  aceitaNegativo?: boolean;
  /** Repassado ao input. Opcional: quem não passa, segue sem foco automático, como antes. */
  autoFocus?: boolean;
  /**
   * ⚠ QUANTAS CASAS O CAMPO GUARDA — 2 por padrão, e o padrão é o que mantém os onze consumidores
   * existentes byte a byte como estavam: `roundCasas(n, 2) === round2(n)` e o formato é o mesmo.
   * O R$/saca da venda de grão pede 4 (F3): o romaneio da cooperativa traz preço com quatro casas,
   * e arredondar na digitação joga fora centavos que o comprador de fato cobrou.
   */
  casas?: number;
  title?: string;
}) {
  /* UI-CAMPO-MOEDA-01 (Gabriel 20/10/2026) — UM TIPO SÓ DE CAMPO DE VALOR NO SISTEMA: o "R$" mora FIXO dentro do campo, à esquerda
     (o irmão do "%" do `CampoPercentual`), o número à direita, e o vazio mostra "0,00". O texto do campo é só o número — o símbolo não é
     digitado nem apagado. Com 4 casas (preço unitário) o "R$" fica do mesmo jeito. Negativo: "R$ −1.234,56" (o menos tipográfico).
     Sem prop para desligar o prefixo. Quem passa `placeholder` próprio continua podendo ("o saldo devedor").
     ⚠ As classes de LAYOUT que o chamador manda (largura, margem, flex, col-span) vão para o invólucro; as do campo (altura, texto,
     borda) ficam no input — sem isso o `flex-1` / `mt-0.5` dos hospedeiros pararia no input e o prefixo sairia do centro. */
  const escrever = (n: number) => {
    const t = formatCasas(Math.abs(n), casas);
    return n < 0 ? `\u2212${t}` : t;
  };
  const ler = (t: string): number | null => {
    if (!aceitaNegativo) return parseMoeda(t);
    const negativo = /^[-\u2212]/.test(t.trim());
    const n = parseMoeda(t);
    return n == null ? null : negativo && n !== 0 ? -n : n;
  };
  const [texto, setTexto] = useState(valor != null ? escrever(valor) : '');
  const [editando, setEditando] = useState(false);
  const c = useContaNoCampo({ valor, casas, aceitaNegativo, escrever, setTexto, onChange });
  useEffect(() => { if (!editando) setTexto(valor != null ? escrever(valor) : ''); }, [valor, editando, casas]);
  const { fora, dentro } = separarClasses(className);

  return (
    <div className={cn('relative', fora)} data-testid="campo-moeda">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground" data-testid="prefixo-rs">R$</span>
      <Input
        ref={c.campoRef}
        inputMode="decimal" value={c.emConta ? c.conta : texto} placeholder={placeholder ?? formatCasas(0, casas)} className={cn(dentro, 'pl-6 text-right tabular-nums')}
        disabled={disabled} title={title} autoFocus={autoFocus}
        onFocus={() => { setEditando(true); c.focar(); }}
        onPaste={c.colar}
        onChange={(e) => {
          const cru = e.target.value;
          if (c.digitar(cru, texto, disabled)) return;
          setTexto(cru); onChange(ler(cru));
        }}
        onBlur={() => {
          setEditando(false);
          if (c.sair()) return;
          const n = ler(texto);
          const r = n != null ? roundCasas(n, casas) : null;
          onChange(r);
          setTexto(r != null ? escrever(r) : '');
        }}
      />
      <BalaoDaConta dica={c.dica} />
    </div>
  );
}

/* UI-CAMPO-MOEDA-01 — o que é do LUGAR do campo (vai para o invólucro) e o que é do campo (fica no input) */
const CLASSE_DE_LUGAR = /^(?:-?m[trblxy]?-\S+|flex-1|flex-none|flex-auto|grow(?:-0)?|shrink(?:-0)?|basis-\S+|(?:col|row)-span-\S+|(?:col|row)-(?:start|end)-\S+|self-\S+|justify-self-\S+|order-\S+|(?:min-|max-)?w-\S+)$/;
export function separarClasses(c: string | undefined): { fora: string; dentro: string } {
  const fora: string[] = []; const dentro: string[] = [];
  for (const k of (c ?? '').split(/\s+/).filter(Boolean)) (CLASSE_DE_LUGAR.test(k) ? fora : dentro).push(k);
  return { fora: fora.join(' '), dentro: dentro.join(' ') };
}

/**
 * CAMPO DE PERCENTUAL — FIN-FINANC-28 (acabamento do cadastro, Gabriel 17/10/2026). O irmão do `CampoMoeda` para taxa: o mesmo
 * parser e o mesmo arredondamento, sem "R$" e com o "%" fixo à direita, dentro do campo ("1,50 %"). Percentual nunca usa o campo de
 * moeda (ele escreveria "R$ 1,50").
 */
export function CampoPercentual({ valor, onChange, casas = 2, placeholder, className, disabled, title }: {
  valor: number | null; onChange: (n: number | null) => void; casas?: number; placeholder?: string; className?: string;
  disabled?: boolean; title?: string;
}) {
  const escrever = (n: number) => formatCasas(n, casas);
  const [texto, setTexto] = useState(valor != null ? escrever(valor) : '');
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(valor != null ? escrever(valor) : ''); }, [valor, editando, casas]);
  return (
    <div className="relative" data-testid="campo-percentual">
      <Input
        inputMode="decimal" value={texto} placeholder={placeholder} className={`${className ?? ''} pr-5 text-right`} disabled={disabled} title={title}
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
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
    </div>
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
