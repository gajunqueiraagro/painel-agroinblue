/**
 * ContaBancariaSelect — seletor unificado de conta bancária.
 *
 * PR-H2 — centraliza a UX de seleção de conta que estava duplicada em 9
 * callsites com shadcn Select. Agrupa por `tipo_conta`, ordena alfabético
 * dentro de cada grupo e aplica visual dark/glass conservador no SelectContent
 * (preto translúcido + blur leve).
 *
 * ⚠ O VOCABULÁRIO É `cc | inv | cartao | caixa | outro`, e este cabeçalho dizia
 * "corrente | investimento" — nomes que a coluna `financeiro_contas_bancarias.tipo_conta`
 * NUNCA guardou (medido em 133g: 35 `cc`, 25 `inv`, 9 `cartao`, zero `corrente`, zero
 * `investimento`). A ordem e os rótulos vivem em `@/lib/financeiro/gruposDeConta`.
 *
 * ⚠ É O ÚNICO SELETOR DE CONTA DO SISTEMA — 133g item 9. Lista de contas montada à mão em
 * `<Select>`/`<select>` é defeito, não estilo: cada uma reinventava a ordem e os rótulos
 * das gavetas, e as que não agrupavam nada punham quinze contas numa fila só.
 *
 * NÃO faz heurística por nome.
 * NÃO inclui contas com IDs em `excluirIds` (usado para evitar conta_destino
 * = conta_origem em transferências).
 * NÃO filtra por fazenda/ativa — assume que o caller já fez isso.
 */
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ORDEM_GRUPO_CONTA, ROTULO_GRUPO_CONTA, grupoDaConta } from '@/lib/financeiro/gruposDeConta';

/**
 * Shape mínimo necessário para o componente. Aceita tanto `ContaBancariaV2`
 * (forma completa) quanto SELECTs reduzidos (alguns callsites trazem apenas
 * id/nome/tipo_conta). Campos opcionais entram em jogo só se
 * `showBankDetails` for usado.
 */
export interface ContaSelecionavel {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  banco?: string | null;
  agencia?: string | null;
  numero_conta?: string | null;
  conta_digito?: string | null;
}

interface Props {
  /** UUID da conta selecionada (ou '' / null quando vazio). */
  value: string | null | undefined;
  /** Callback ao selecionar — recebe o UUID escolhido. */
  onValueChange: (id: string) => void;
  /** Lista de contas já filtrada por fazenda/cliente/ativa pelo caller. */
  contas: ContaSelecionavel[];
  /** Texto exibido quando value é vazio. Default 'Selecionar conta'. */
  placeholder?: string;
  /** Bloqueia o trigger e o conteúdo. */
  disabled?: boolean;
  /**
   * - `undefined` / `false`: mostra só nome (nome_exibicao || nome_conta).
   * - `'banco'`: nome + (banco) quando banco existir.
   * - `'agencia'`: nome + (agencia número-digito) quando esses campos existirem.
   */
  showBankDetails?: 'banco' | 'agencia' | false;
  /** UUIDs a excluir da lista (filtra antes de renderizar, não desabilita). */
  excluirIds?: string[];
  /** Classes adicionais no SelectTrigger (input visível). */
  className?: string;
  /**
   * 133e adendo — o gatilho compacto da Mesa: 20px, 11px, ícone 12px.
   *
   * ⚠ SÓ O GATILHO ENCOLHE. A caixa aberta segue o padrão A23 (12px, itens de 26px): ela é
   * lida com o olho parado, e encolhê-la para caber numa célula de tabela seria pagar a
   * densidade de uma linha com a legibilidade de todas as opções.
   * ⚠ POR PROP, NÃO POR `className`: a compactação declarada no componente não depende da
   * ordem em que o `twMerge` resolve `h-8` contra `h-5` — e foi assim que a Conta bancária
   * ficou de fora, recebendo um seletor de descendente numa prop que cai no próprio gatilho.
   */
  size?: 'default' | 'compact';
  /** Override do SelectContent (dropdown aberto). */
  contentClassName?: string;
  /**
   * Itens prepended antes dos grupos (ex.: `[{value:'__none__',label:'Nenhuma'}]`
   * ou `[{value:'__all__',label:'Todas'}]`). Caller decide a sentinela.
   */
  prependItems?: Array<{ value: string; label: string }>;
}

/**
 * ⚠ A ORDEM E OS RÓTULOS VÊM DE `gruposDeConta` — 133g item 9. Este arquivo tinha os seus
 * ("Contas Correntes", "Cartões") e o `ImportarBancoInline` tinha outros ("Conta corrente",
 * "Cartão"): dois vocabulários para as mesmas três gavetas, na mesma tela. A fonte é uma.
 * ⚠ E O `caixa`/`outro` ENTRAM DE GRAÇA: a lista de grupos passa a ser a do mapa, então o
 * dia em que uma conta nascer com um tipo novo ela aparece — em vez de sumir do dropdown.
 */
const TIPO_ORDER: string[] = Object.keys(ORDEM_GRUPO_CONTA)
  .sort((a, b) => ORDEM_GRUPO_CONTA[a] - ORDEM_GRUPO_CONTA[b]);

function buildLabel(c: ContaSelecionavel, mode: Props['showBankDetails']): string {
  const nome = c.nome_exibicao || c.nome_conta;
  if (!mode) return nome;
  if (mode === 'banco') return c.banco ? `${nome} (${c.banco})` : nome;
  // mode === 'agencia'
  const parts: string[] = [];
  if (c.agencia) parts.push(c.agencia);
  if (c.numero_conta) {
    parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
  }
  return parts.length > 0 ? `${nome} (${parts.join(' ')})` : nome;
}

// Estilo dark/glass aprovado (PR-H2b — mais transparente que a v1).
// Exportado para reuso em <SelectContent> inline de outros dropdowns
// no LancamentoV2Dialog e quaisquer dropdowns do modal financeiro.
// O seletor descendente `[&_[role=option]]:...` cobre TODOS os SelectItems
// internos sem precisar passar className em cada um.
export const DARK_GLASS_CONTENT =
  'bg-zinc-950/55 backdrop-blur-xl border-zinc-700/40 text-zinc-100 ' +
  '[&_[role=option]]:text-zinc-100 ' +
  '[&_[role=option]]:focus:bg-zinc-800/45 ' +
  '[&_[role=option]]:focus:text-zinc-100 ' +
  '[&_[role=option]]:data-[state=checked]:bg-zinc-800/55 ' +
  '[&_[role=option]]:data-[state=checked]:text-zinc-100';
/* ⚠ `GROUP_LABEL_CLS` e `ITEM_CLS` (zinc) SAIRAM com a troca do default: eram internos e
   so' o vidro escuro os usava. Quem pedir `DARK_GLASS_CONTENT` por `contentClassName`
   continua atendido — aquele blob ja' carrega os seletores descendentes
   `[&_[role=option]]:...`, entao pinta os itens sozinho. */

/* ─────────────────────────────────────────────────────────────────────────────
   PR-PARC-05c item 2 — A CAIXA PASSA A SER A DO SISTEMA.

   ⚠ O ESCURO NAO ERA CONTRASTE COM A TELA, ERA GOSTO: os modais que abrem este
   seletor sao CLAROS — `LancamentoV2Dialog` e' `bg-card`, o `ObrigacaoDialog` e' o
   mesmo. Um dropdown quase preto e translucido sobre um card claro le-se APAGADO:
   texto cinza sobre cinza-chumbo, rotulo de grupo em `zinc-400` que some.
   ⚠ `position="popper"` + `--radix-select-trigger-width`: sem popper a variavel nao
   existe e a caixa e' medida pelo item mais longo — o nome de conta e' longo, e ela
   estourava para fora do modal.
   ⚠ `DARK_GLASS_CONTENT` continua EXPORTADO e nao foi apagado: quem quiser o vidro
   escuro pede por `contentClassName`. O que mudou foi o DEFAULT.
   ───────────────────────────────────────────────────────────────────────────── */
const POPOVER_CONTENT =
  'bg-popover text-popover-foreground border shadow-md max-h-64 overflow-y-auto rolagem-fina';
const POPOVER_GROUP_LABEL_CLS =
  'px-2 py-1 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground';
const POPOVER_ITEM_CLS = 'h-7 text-[12px] text-foreground focus:bg-accent';

export function ContaBancariaSelect({
  value,
  onValueChange,
  contas,
  placeholder = 'Selecionar conta',
  disabled,
  showBankDetails,
  excluirIds,
  className,
  size = 'default',
  contentClassName,
  prependItems,
}: Props) {
  // Excluir IDs (transferência: origem ≠ destino).
  const excl = new Set(excluirIds ?? []);
  const visiveis = contas.filter((c) => !excl.has(c.id));

  // Agrupa por tipo_conta (fallback 'cc' quando null — banco está 100%
  // populado em cc/inv/cartao e CHECK constraint enforce isso).
  const grupos = TIPO_ORDER.map((tipo) => ({
    tipo,
    label: ROTULO_GRUPO_CONTA[tipo] ?? 'Outros',
    items: visiveis
      /* `grupoDaConta` normaliza e manda o desconhecido para `outro` — sem ele, uma conta
         com tipo novo simplesmente não apareceria em grupo nenhum. */
      .filter((c) => grupoDaConta(c.tipo_conta ?? 'cc') === tipo)
      .map((c) => ({ conta: c, label: buildLabel(c, showBankDetails) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
  })).filter((g) => g.items.length > 0);

  // Caller controla a sentinela via `prependItems`. Componente passa o valor
  // direto ao caller — sem tradução. Quem armazena '' no estado faz a
  // tradução no callback (`onValueChange={(v) => setX(v === '__none__' ? '' : v)}`).
  const firstPrependValue = prependItems?.[0]?.value;
  const selectValue = value && value !== '' ? value : firstPrependValue;

  return (
    <Select
      value={selectValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn(size === 'compact' && 'h-5 px-1.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className={cn(POPOVER_CONTENT, 'w-[var(--radix-select-trigger-width)]', contentClassName)}
      >
        {prependItems?.map((it) => (
          <SelectItem key={it.value} value={it.value} className={POPOVER_ITEM_CLS}>
            {it.label}
          </SelectItem>
        ))}
        {grupos.map((g) => (
          <SelectGroup key={g.tipo}>
            <SelectLabel className={POPOVER_GROUP_LABEL_CLS}>{g.label}</SelectLabel>
            {g.items.map(({ conta, label }) => (
              <SelectItem key={conta.id} value={conta.id} className={POPOVER_ITEM_CLS}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
