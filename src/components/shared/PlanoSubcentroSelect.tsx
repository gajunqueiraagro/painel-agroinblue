// PlanoSubcentroSelect — extraído do LancamentoV2Dialog (PR-U2c-1D) para FONTE ÚNICA.
// Relocação pura: mesmo Popover+busca+lista, mesmo teclado, mesmo filtro por
// tipo_operacao (subárvore por tipo). Efeito colateral (preenche macro/centro/escopo
// a partir do plano) sai via `onSelected(subcentro, cls)`. A BUSCA é CONTROLADA porque
// o caller (LancamentoV2Dialog) reseta a busca ao trocar tipo_operacao. `value`/`onChange`
// = o campo subcentro. Consumido pelo LancamentoV2Dialog e (PR-U2c-2) pela Mesa.
import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

export interface PlanoSubcentroSelectProps {
  value: string;                                                    // subcentro
  onChange: (v: string) => void;                                   // seta o subcentro (sem side effect)
  onSelected?: (subcentro: string, cls?: ClassificacaoItem) => void; // side effect: macro/centro/escopo
  classificacoes: ClassificacaoItem[];
  tipoOperacao: string;                                            // filtra a subárvore por tipo
  search: string;                                                  // busca CONTROLADA (o caller é dono)
  onSearchChange: (s: string) => void;
  label?: string;
  triggerClassName?: string;                                       // ex.: fieldBg
  /** 133e adendo — gatilho compacto da Mesa (20px/11px). A caixa aberta segue o A23. */
  size?: 'default' | 'compact';
  contentClassName?: string;                                       // dropdown: largura/densidade (Mesa = mais largo)
  itemClassName?: string;                                          // itens do dropdown: fonte/padding menores
  tabIndex?: number;
  disabled?: boolean;
}

export function PlanoSubcentroSelect({
  value, onChange, onSelected, classificacoes, tipoOperacao,
  search, onSearchChange, label, triggerClassName, size = 'default', contentClassName, itemClassName, tabIndex, disabled,
}: PlanoSubcentroSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) {
      if (c.subcentro && !m.has(c.subcentro)) m.set(c.subcentro, c);
    }
    return m;
  }, [classificacoes]);

  /**
   * B-40 item 2 — MOSTRAR TODOS, quando o operador pede.
   *
   * ⚠ O FILTRO POR TIPO É CERTO E SILENCIOSO, e essa é a combinação ruim.
   * Buscar "bene" numa linha de Saída acha Benefícios; na mesma busca numa
   * linha de Entrada, o resultado é "Nenhum subcentro encontrado" — que é
   * FALSO: o subcentro existe, está do outro lado da árvore. O operador
   * concluía que o cadastro não tinha o item e ia procurá-lo em outro lugar.
   *
   * Estado de UI, por abertura: some ao fechar, e escolher um item do outro
   * lado avisa da divergência antes de gravar.
   */
  const [mostrarTodos, setMostrarTodos] = useState(false);
  useEffect(() => { if (!open) setMostrarTodos(false); }, [open]);

  const combinaTipo = (c: ClassificacaoItem) => {
    if (!tipoOperacao) return true;
    // Flexible match: DB may store "3-Transferências" while UI uses "3-Transferência"
    if (tipoOperacao.startsWith('3-')) return c.tipo_operacao.startsWith('3-');
    return c.tipo_operacao === tipoOperacao;
  };

  /** Subcentros filtered by tipo_operacao then by search text.
   *  Uses the selected tipoOperacao directly – each type has its own subtree. */
  const filtered = useMemo(() => {
    const unique = Array.from(classMap.values());
    const byTipo = mostrarTodos ? unique : unique.filter(combinaTipo);
    if (!search.trim()) return byTipo;
    const term = search.toLowerCase();
    return byTipo.filter(c => c.subcentro.toLowerCase().includes(term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classMap, search, tipoOperacao, mostrarTodos]);

  /**
   * Quantos a busca ACHOU do outro lado da árvore, e que o filtro escondeu.
   *
   * ⚠ CONTA SOBRE A BUSCA, não sobre o cadastro inteiro: "312 ocultos" seria
   * ruído permanente; "2 ocultos" depois de digitar "bene" é a resposta à
   * pergunta que o operador acabou de fazer.
   */
  const ocultosPorTipo = useMemo(() => {
    if (mostrarTodos || !tipoOperacao) return 0;
    const term = search.trim().toLowerCase();
    return Array.from(classMap.values()).filter(c =>
      !combinaTipo(c) && (!term || c.subcentro.toLowerCase().includes(term))).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classMap, search, tipoOperacao, mostrarTodos]);

  const handleSelect = (sub: string) => {
    onChange(sub);
    setOpen(false);
    onSearchChange('');
    const cls = classMap.get(sub);
    onSelected?.(sub, cls);
  };

  /**
   * Abre POSICIONADO no valor atual — 133h adendo item 14.
   *
   * ⚠ O DESTAQUE NASCIA EM 0, E O ENTER CONFIRMAVA O PRIMEIRO DA LISTA. O gatilho já
   * mostrava a conta escolhida e o item já tinha o ✓, mas o teclado ignorava as duas
   * coisas: abrir e apertar Enter TROCAVA a conta certa pela primeira do filtro, em
   * silêncio. Quem abre um seletor já preenchido quer conferir ou mudar de propósito —
   * nunca redigitar o que já está escolhido.
   * ⚠ RODA NA ABERTURA E QUANDO O FILTRO MUDA: digitar na busca reordena a lista, e um
   * índice velho apontaria para outro item. Sem casar, cai em 0, que é o comportamento
   * antigo — e é o certo quando o valor atual não está na lista visível.
   */
  useEffect(() => {
    if (!open) return;
    const idx = value ? filtered.findIndex((sc) => sc.subcentro === value) : -1;
    const alvo = idx >= 0 ? idx : 0;
    setHighlight(alvo);
    if (idx >= 0) itemRefs.current[idx]?.scrollIntoView({ block: 'nearest' });
  }, [open, filtered, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(prev => {
        const next = Math.min(prev + 1, filtered.length - 1);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(prev => {
        const next = Math.max(prev - 1, 0);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sc = filtered[highlight];
      if (sc) handleSelect(sc.subcentro || '');
    } else if (e.key === 'Tab') {
      const sc = filtered[highlight];
      if (sc) handleSelect(sc.subcentro || '');
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) { onSearchChange(''); setHighlight(0); } }}>
        <PopoverTrigger asChild>
          <Button tabIndex={tabIndex} variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn("w-full h-8 justify-between font-normal text-[12px]", size === 'compact' && 'h-5 px-1.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3', triggerClassName)}>
            <span className="truncate" title={value || undefined}>{value || 'Selecione o subcentro...'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0 bg-zinc-950/55 backdrop-blur-xl border-zinc-700/40 text-zinc-100", contentClassName)} align="start">
          {/* Input de busca do padrão A23: 32px, 12px, ícone 14px. */}
          <div className="flex items-center border-b border-zinc-700/40 px-2">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <input
              ref={searchInputRef}
              className="flex h-8 w-full bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-zinc-400"
              placeholder="Buscar subcentro..."
              value={search}
              onChange={e => { onSearchChange(e.target.value); setHighlight(0); }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {/* ⚠ "NENHUM ENCONTRADO" SÓ QUANDO NÃO HÁ MESMO. Havendo do outro
                lado, a mensagem diz quantos e oferece a porta — dizer "nenhum"
                com dois escondidos é a tela mentindo sobre o próprio cadastro. */}
            {filtered.length === 0 && ocultosPorTipo === 0 && (
              <p className="py-3 text-center text-[11px] text-zinc-400">Nenhum subcentro encontrado</p>
            )}
            {ocultosPorTipo > 0 && (
              <p className="px-2 py-1.5 text-center text-[11px] leading-snug text-zinc-400">
                {filtered.length === 0 ? 'Nada aqui — ' : ''}
                {ocultosPorTipo} do outro lado {ocultosPorTipo === 1 ? 'oculto' : 'ocultos'}
                {' '}(a lista mostra só o tipo desta linha).{' '}
                <button type="button" className="underline hover:text-zinc-100"
                  onClick={() => setMostrarTodos(true)}>
                  mostrar todos
                </button>
              </p>
            )}
            {mostrarTodos && (
              /* ⚠ O AVISO DA DIVERGÊNCIA VEM ANTES DA ESCOLHA. Escolher um
                  subcentro de outro tipo é legítimo — o cadastro pode estar do
                  lado errado —, mas precisa ser decisão, não descuido. */
              <p className="px-2 py-1 text-center text-[10px] leading-snug text-amber-500">
                Mostrando todos os tipos. Escolher um de tipo diferente do da linha classifica
                fora da árvore esperada.
              </p>
            )}
            {filtered.map((sc, idx) => (
              <button
                key={sc.subcentro || idx}
                ref={el => { itemRefs.current[idx] = el; }}
                className={cn(
                  /* ⚠ UMA LINHA, SEMPRE — A23: subcentro longo quebrava em duas e a lista
                     desalinhava. O texto inteiro fica no `title`. */
                  /* ⚠ 10px/15px — A MESMA REGUA DO `SelectItem` do primitivo (PR-UI-SELECT-03). Este
     componente NAO e' um `Select`: e' Popover + lista propria, entao nao herda nada e
     precisa da regua escrita. Sem isto, o Subcentro abriria 2px maior que todo o resto
     do sistema — que e' exatamente a divergencia que o PR veio fechar, do outro lado.
     `min-h-[26px]` fica: a altura da linha ja' era a mesma. */
                  "relative flex min-h-[26px] w-full cursor-pointer select-none items-center rounded-sm px-2 py-1 text-[10px] leading-[15px] outline-none",
                  "text-zinc-100",
                  idx === highlight ? "bg-zinc-800/60 text-zinc-100" : "hover:bg-zinc-800/45",
                  value === sc.subcentro && idx !== highlight && "bg-zinc-800/40",
                  itemClassName,
                )}
                onClick={() => handleSelect(sc.subcentro || '')}
                onMouseEnter={() => setHighlight(idx)}
              >
                <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value === sc.subcentro ? "opacity-100" : "opacity-0")} />
                <span className="truncate" title={sc.subcentro ?? undefined}>{sc.subcentro}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
