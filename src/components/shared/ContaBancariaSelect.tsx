/**
 * ContaBancariaSelect — seletor unificado de conta bancária.
 *
 * PR-H2 — centraliza a UX de seleção de conta que estava duplicada em 9
 * callsites com shadcn Select. Agrupa por `tipo_conta` (vocabulário oficial
 * do PR-H1: corrente | investimento | cartao | caixa | outro), ordena
 * alfabético dentro de cada grupo e aplica visual dark/glass conservador
 * no SelectContent (preto translúcido + blur leve).
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
  /** Override do SelectContent (dropdown aberto). */
  contentClassName?: string;
  /**
   * Itens prepended antes dos grupos (ex.: `[{value:'__none__',label:'Nenhuma'}]`
   * ou `[{value:'__all__',label:'Todas'}]`). Caller decide a sentinela.
   */
  prependItems?: Array<{ value: string; label: string }>;
}

// PR-H1 — vocabulário oficial CURTO: cc | inv | cartao.
type TipoOficial = 'cc' | 'inv' | 'cartao';

const TIPO_ORDER: TipoOficial[] = ['cc', 'inv', 'cartao'];

// Labels visuais para cabeçalho de grupo no dropdown. Plural intencional
// porque agrupam múltiplas contas. Os valores internos permanecem curtos.
const TIPO_LABEL: Record<TipoOficial, string> = {
  cc: 'Contas Correntes',
  inv: 'Investimentos',
  cartao: 'Cartões',
};

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
const GROUP_LABEL_CLS =
  'text-zinc-400 text-[10px] font-semibold uppercase tracking-wide px-2 py-1';
const ITEM_CLS =
  'text-zinc-100 focus:bg-zinc-800/45 focus:text-zinc-100 ' +
  'data-[state=checked]:bg-zinc-800/55 data-[state=checked]:text-zinc-100';

export function ContaBancariaSelect({
  value,
  onValueChange,
  contas,
  placeholder = 'Selecionar conta',
  disabled,
  showBankDetails,
  excluirIds,
  className,
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
    label: TIPO_LABEL[tipo],
    items: visiveis
      .filter((c) => (c.tipo_conta ?? 'cc') === tipo)
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
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName ?? DARK_GLASS_CONTENT}>
        {prependItems?.map((it) => (
          <SelectItem key={it.value} value={it.value} className={ITEM_CLS}>
            {it.label}
          </SelectItem>
        ))}
        {grupos.map((g) => (
          <SelectGroup key={g.tipo}>
            <SelectLabel className={GROUP_LABEL_CLS}>{g.label}</SelectLabel>
            {g.items.map(({ conta, label }) => (
              <SelectItem key={conta.id} value={conta.id} className={ITEM_CLS}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
