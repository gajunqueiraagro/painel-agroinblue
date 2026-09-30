/**
 * Os editores de LISTA da Mesa — PR-CONC-MESA-PAINEL-V1 itens 3 e 4: Atividade, Tipo de documento e Forma de pagamento.
 *
 * ⚠ AS LISTAS SÃO AS DO NOVO LANÇAMENTO, importadas e nunca copiadas: `ATIVIDADES` (ultimaAtividade), `TIPOS_DOCUMENTO`
 *   (documentoHelper) e `FORMAS_PAGAMENTO_V2`. Uma cópia aqui divergiria da tela de origem na primeira entrada nova.
 * ⚠ VALOR FORA DA LISTA APARECE COMO ESTÁ (decisão do Gabriel, 30/09): 33% das formas gravadas usam texto que a lista
 *   não tem ("PIX/Transferência Bancária", "Cartão de Credito", "Débito em Conta"…). O Radix mostraria o gatilho VAZIO
 *   sobre um dado que existe; por isso o valor atual entra como opção extra no topo, marcado "valor atual". NÃO se
 *   normaliza nada — a padronização do legado é frente própria.
 * ⚠ ESCOLHER O VALOR ATUAL TIRA A PROPOSTA (patch vazio): o gravador é COALESCE, e "manter o sistema" é ausência de
 *   proposta, nunca a gravação do mesmo texto.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CELULA_EDITAVEL, ITEM_DROPDOWN } from './medidasMesa';
import { cn } from '@/lib/utils';

const ATUAL = '__valor_atual__';
const SEM = '__sem__';

export interface ResultadoListaEditorProps {
  /** A proposta (o que o operador escolheu). */
  value: string | null;
  /** O que o lançamento tem hoje. */
  valorAtual: string | null;
  /** A sugestão (âmbar), usada só quando não há proposta nem valor atual. */
  sugerido?: string | null;
  /**
   * O rótulo da sugestão ("pelo histórico do banco") — vai só no `title`.
   * ⚠ O RÓTULO VISÍVEL MORA NO SLOT DA TABELA (PR-CONC-MESA-LAYOUT-FIXO-01): ao lado do select ele estreitava o campo e
   *   empurrava a coluna (print 19:50).
   */
  rotuloSugestao?: string;
  opcoes: readonly string[];
  /** A chave do patch (`tipo_documento`, `forma_pagamento`). */
  campo: string;
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
  /** O texto do gatilho vazio. */
  placeholder?: string;
}

export function ResultadoListaEditor({
  value, valorAtual, sugerido, rotuloSugestao, opcoes, campo, onEditar, placeholder = 'escolher',
}: ResultadoListaEditorProps) {
  const efetivo = value ?? valorAtual ?? sugerido ?? '';
  const ehSugestao = !value && !valorAtual && !!sugerido;
  const atualForaDaLista = !!valorAtual && !opcoes.includes(valorAtual);
  /* O valor do Select: a proposta; senão o atual (pela opção extra, se estiver fora da lista); senão a sugestão. */
  const selecionado = value ? value
    : valorAtual ? (atualForaDaLista ? ATUAL : valorAtual)
    : (sugerido ?? SEM);
  return (
    <div className="min-w-0">
      {/* sem nada em lugar nenhum, o gatilho mostra o placeholder ("escolher"), não o item "— sem" */}
      <Select value={selecionado === SEM ? '' : selecionado}
        onValueChange={(v) => {
          /* "manter o sistema", o valor atual ou "sem": tira a proposta (se houver) — nunca grava o mesmo texto */
          if (v === SEM || v === ATUAL || v === valorAtual) {
            if (value) void onEditar({ [campo]: '' });
            return;
          }
          if (v !== value) void onEditar({ [campo]: v });
        }}>
        <SelectTrigger className={cn(CELULA_EDITAVEL, 'w-full min-w-0', ehSugestao && 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
          !efetivo && 'text-muted-foreground')}
          title={ehSugestao && rotuloSugestao ? `${efetivo} — ${rotuloSugestao}; grava ao salvar` : efetivo || undefined}>
          {/* o gatilho mostra o valor atual como ele está gravado, sem o " · valor atual" do item */}
          <SelectValue placeholder={placeholder}>{selecionado === ATUAL ? valorAtual : undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {atualForaDaLista && (
            <SelectItem value={ATUAL} className={ITEM_DROPDOWN}>{valorAtual} · valor atual</SelectItem>
          )}
          <SelectItem value={SEM} className={ITEM_DROPDOWN}>— {valorAtual ? 'manter o sistema' : 'sem'}</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o} className={ITEM_DROPDOWN}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * A ATIVIDADE — item 3. Não grava no banco: é o FILTRO da conta do plano (o estado mora na aba, por linha).
 * ⚠ ÂMBAR QUANDO VAI MUDAR a atividade que o lançamento tem hoje — a mesma gramática dos outros campos.
 */
export function ResultadoAtividadeEditor({ value, valorAtual, opcoes, onEscolher }: {
  value: string | null;
  valorAtual: string | null;
  opcoes: readonly { valor: string; rotulo: string }[];
  onEscolher: (valor: string) => void;
}) {
  return (
    <Select value={value ?? ''} onValueChange={(v) => { if (v && v !== value) onEscolher(v); }}>
      <SelectTrigger className={cn(CELULA_EDITAVEL, !!value && value !== valorAtual && 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
        !value && 'text-muted-foreground')} aria-label="Atividade">
        <SelectValue placeholder="escolher" />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((a) => (
          <SelectItem key={a.valor} value={a.valor} className={ITEM_DROPDOWN}>{a.rotulo}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
