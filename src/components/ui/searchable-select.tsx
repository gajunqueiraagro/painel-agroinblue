import * as React from 'react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { COMBOBOX_PALETA } from '@/components/ui/command';

export interface OpcaoSearchable {
  value: string;
  label: string;
  /** Texto curto à direita do nome, em tom apagado — ex.: a contagem de uso.
   *  ⚠ NÃO ENTRA NA BUSCA: quem digita procura pelo nome. Se a contagem casasse,
   *  digitar "41" traria todo fornecedor com 41 lançamentos. */
  hint?: string;
  /**
   * Segunda linha da opção, abaixo do nome — ex.: o CNPJ do fornecedor.
   *
   * ⚠ ADITIVA: sem ela a opção continua sendo uma linha só, como sempre foi. Só a
   * montagem que a passa muda de aparência.
   * ⚠ ENTRA NA BUSCA, ao contrário do `hint`, e a diferença é de propósito: `hint` é
   * contagem (digitar "41" traria todo fornecedor com 41 lançamentos), `sub` é
   * identidade — quem procura um frigorífico pelo CNPJ está procurando por ele.
   */
  sub?: string;
  /** Marca a segunda linha como ausência a resolver (âmbar), não como dado. */
  subAlerta?: boolean;
}

const PREFIXO = 'ss-busca:';

/**
 * Apaga as buscas lembradas. Só o X do próprio campo e o "Limpar" geral da tela
 * esquecem — fechar, escolher ou apertar Esc, não.
 *
 * @param prefixo quando informado, só as chaves que começam com ele.
 */
export function limparBuscasLembradas(prefixo?: string): void {
  try {
    const alvo = PREFIXO + (prefixo ?? '');
    /* Recolhe ANTES de remover: `key(i)` reindexa a cada remoção, e apagar
       durante a varredura pula uma chave a cada duas. */
    const chaves: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(alvo)) chaves.push(k);
    }
    chaves.forEach(k => sessionStorage.removeItem(k));
  } catch {
    /* navegação privada / storage bloqueado — a memória é conforto, não contrato */
  }
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (val: string) => void;
  options: OpcaoSearchable[];
  /** Ação no rodapé da lista — ex.: "+ Cadastrar comprador". Ausente = nada muda. */
  acaoFinal?: { label: string; onSelect: () => void };
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  disabled?: boolean;
  className?: string;
  /** Densidade opt-in (usada só pela Compra): busca sticky e lista mais alta.
   *  ⚠ NAO MEXE MAIS NO ITEM (PR-UI-SELECT-05): item, busca e painel sao os mesmos nos
   *  dois modos — a regua do sistema. `dense` distingue o GATILHO (32px contra 24px) e a
   *  altura da lista, que e' o que a grade densa de fato precisa. */
  dense?: boolean;
  /** Classes extras no PAINEL aberto (dropdown).
   *  ⚠ O PAINEL JA' NASCE ESCURO desde o PR-UI-SELECT-05 — `COMBOBOX_PALETA`, a mesma do
   *  `SelectContent` e dos comboboxes Radix. Esta prop deixou de ser o caminho para
   *  escurecer e serve so' para ajuste pontual (largura, por exemplo). */
  contentClassName?: string;
  /**
   * Liga a MEMÓRIA DA BUSCA desta instância, gravada em `sessionStorage` sob esta
   * chave. Sem ela o componente se comporta exatamente como antes — as outras 24
   * montagens do app (26 no total, em 11 arquivos) não mudam em nada.
   *
   * Nasceu de uma lista de 3.361 fornecedores: achar "Wilson" entre seis homônimos
   * custava seis reaberturas, e cada reabertura fazia o operador digitar de novo.
   *
   * ⚠ A MEMÓRIA SÓ VALE ENQUANTO O FILTRO ESTÁ ATIVO — FIN-LISTA-FILTROS-01a, e isto
   * REVERTE metade do comportamento original. Antes, fechar nunca esquecia; o efeito é que
   * um texto digitado e ABANDONADO ressuscitava horas depois, num campo que dizia "Todos".
   * O operador via seis nomes numa lista que ele não filtrou e procurava o defeito.
   * ⚠ O CASO QUE A MEMÓRIA VEIO SERVIR CONTINUA SERVIDO, e é a razão de não a apagar: quem
   * digita "wilson" e ESCOLHE um dos seis tem `value` ativo, e reabrir mantém o texto para
   * escolher outro. Quem digita e não escolhe não filtrou nada — e nada é o que se lembra.
   * ⚠ ATIVO É `value !== allValue`, a mesma sentinela que o gatilho usa para exibir "Todos".
   */
  persistKey?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  acaoFinal,
  placeholder = 'Buscar...',
  allLabel = 'Todos',
  allValue = '__all__',
  disabled = false,
  className,
  dense = false,
  contentClassName,
  persistKey,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  /* "Ativo" = o campo está filtrando alguma coisa. É a mesma pergunta que decide se o
     gatilho mostra "Todos", então não há como a memória e o rótulo discordarem. */
  const filtroAtivo = value !== allValue && value !== '';
  const chave = persistKey ? PREFIXO + persistKey : null;
  /* Lembra na montagem SÓ se o campo chegou filtrando: um texto guardado ao lado de um
     campo "Todos" é a memória de uma busca que não virou filtro. */
  const [search, setSearch] = useState(() => {
    if (!chave || !filtroAtivo) return '';
    try { return sessionStorage.getItem(chave) ?? ''; } catch { return ''; }
  });

  /* Escrever a busca e lembrá-la são o MESMO ato: separá-los criaria o estado em
     que a tela mostra um texto e a sessão guarda outro. */
  const alterarBusca = useCallback((txt: string) => {
    setSearch(txt);
    if (!chave) return;
    try {
      if (txt && filtroAtivo) sessionStorage.setItem(chave, txt);
      else sessionStorage.removeItem(chave);
    } catch { /* storage bloqueado — segue sem memória */ }
  }, [chave, filtroAtivo]);

  /* Fechar esquece quando não há memória OU quando não há filtro para lembrar. Com um valor
     escolhido, fechar é fechar — que é o caso dos seis "Wilson". */
  const esquecerAoFechar = useCallback(() => {
    if (!chave || !filtroAtivo) {
      setSearch('');
      if (chave) { try { sessionStorage.removeItem(chave); } catch { /* idem */ } }
    }
  }, [chave, filtroAtivo]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedLabel = value === allValue
    ? allLabel
    : options.find(o => o.value === value)?.label || value;

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q));
  }, [options, search]);

  // Cap de render: sem virtualização, listas grandes (milhares de contrapartes)
  // geravam DOM gigante e travavam o dropdown. Limite de 50 itens visíveis,
  // mesmo padrão do FornecedorSelect (Z3); acima disso o excedente é anunciado
  // e o usuário refina a busca. A busca continua operando sobre a lista
  // completa — o cap afeta apenas o DOM. Para listas pequenas, comportamento
  // idêntico ao anterior.
  const RENDER_CAP = 50;
  const filteredVisiveis = useMemo(() => filtered.slice(0, RENDER_CAP), [filtered]);
  const excedente = filtered.length - filteredVisiveis.length;

  const selectableItems = useMemo(() => {
    return [{ value: allValue, label: allLabel }, ...filteredVisiveis];
  }, [filteredVisiveis, allValue, allLabel]);

  useEffect(() => {
    setHighlightIdx(filteredVisiveis.length > 0 ? 1 : 0);
  }, [filteredVisiveis]);

  useEffect(() => {
    const el = itemRefs.current[highlightIdx];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        esquecerAoFechar();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [esquecerAoFechar]);

  const handleSelect = useCallback((val: string) => {
    onValueChange(val);
    setOpen(false);
    esquecerAoFechar();
  }, [onValueChange, esquecerAoFechar]);

  const handleTriggerClick = () => {
    if (disabled) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 160);
    }
    setOpen(true);
    setHighlightIdx(filteredVisiveis.length > 0 ? 1 : 0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(allValue);
    /* ⚠ O X ESQUECE SEMPRE, com memória ou sem: é o gesto de "recomeçar". */
    alterarBusca('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      esquecerAoFechar();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, selectableItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectableItems[highlightIdx]) {
        handleSelect(selectableItems[highlightIdx].value);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (selectableItems[highlightIdx]) {
        handleSelect(selectableItems[highlightIdx].value);
      } else {
        setOpen(false);
        esquecerAoFechar();
      }
      setTimeout(() => {
        const trigger = containerRef.current?.querySelector('button') as HTMLButtonElement | null;
        if (trigger) {
          trigger.focus();
        }
      }, 0);
    }
  };

  itemRefs.current = [];

  return (
    <div ref={containerRef} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleTriggerClick}
        onKeyDown={(e) => {
          if (!open && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleTriggerClick();
          }
          // Printable key → open dropdown and seed search with that char
          if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            alterarBusca(e.key);
            handleTriggerClick();
          }
        }}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-input bg-background ring-offset-background',
          /* ⚠ O TRIGGER DO PADRÃO SÓ NO MODO DENSO — A23. O modo padrão é 24px/10px porque
             veste as grades A18 de Abate, Venda, Mapa e Financeiro; levá-las a 32px/12px
             tiraria linhas da tela em telas que foram medidas para caber sem rolar. Está
             reportado como frente própria, não esquecido. */
          dense ? 'h-8 px-2 text-[12px] font-normal' : 'h-6 px-1.5 text-[10px]',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className="truncate text-left flex-1">
          {open ? '' : selectedLabel}
        </span>
        <span className="flex items-center gap-0">
          {value !== allValue && !disabled && (
            <span onClick={handleClear} className="cursor-pointer hover:text-destructive p-0.5">
              <X className="h-2.5 w-2.5" />
            </span>
          )}
          <ChevronsUpDown className="h-2.5 w-2.5 opacity-50 shrink-0" />
        </span>
      </button>

      {/* ⚠ PAINEL NO PADRAO DO SISTEMA (PR-UI-SELECT-05). Era `bg-popover` — branco — ao
          lado do "Data por", que abre o dark-glass do primitivo. A paleta vem de
          `COMBOBOX_PALETA` para nao virar uma terceira copia da string.
          ⚠ LARGURA: `min-w-full` prende o PISO no gatilho, `w-auto` deixa crescer ate' o
          item mais longo e `max-w-[28rem]` para antes do absurdo — a mesma regra que o
          SelectContent e o COMBOBOX_CONTENT ganharam no SELECT-04. Era `w-full`, e por isso
          nome longo era cortado num campo estreito. */}
      {open && (
        <div className={cn("absolute z-50 min-w-full w-auto max-w-[28rem] rounded-md border shadow-md", COMBOBOX_PALETA, openUp ? "bottom-full mb-0.5" : "top-full mt-0.5", contentClassName)}>
          <div className={cn('px-1 pt-1 pb-1', dense && 'sticky top-0 z-10 bg-zinc-950/80')}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => alterarBusca(e.target.value)}
              placeholder={placeholder}
              /* ⚠ O MESMO CAMPO DO `CommandInput` (PR-UI-SELECT-05), NOS DOIS MODOS. O modo
                 padrao estava em `h-4 text-[9px]` — abaixo do piso de 10px da casa, e
                 ilegivel sobre o painel escuro. O denso estava em 12px, a regua ANTES do
                 SELECT-03. Agora e' um so': 28px de altura, 10px de texto, fundo
                 `zinc-900/60`. Os 12px que o comentario antigo defendia eram do tempo em
                 que o item tambem era 12px; hoje o sistema inteiro e' 10. */
              className={cn(
                'w-full rounded bg-zinc-900/60 border border-zinc-700/40 px-2 h-7 text-[10px]',
                'text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-1 focus:ring-zinc-600',
              )}
              onKeyDown={handleKeyDown}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          {/* A23 — 224px no modo denso: com 300px a lista passava da dobra em tela baixa. */}
          <div ref={listRef} className={cn('overflow-y-auto', dense ? 'max-h-56 px-1 pb-1' : 'max-h-[120px] px-0.5 pb-0.5')}>
            {selectableItems.map((o, idx) => (
              <button
                key={o.value}
                type="button"
                ref={el => { itemRefs.current[idx] = el; }}
                onClick={() => handleSelect(o.value)}
                onMouseEnter={() => setHighlightIdx(idx)}
                /* ⚠ UMA REGUA SO' PARA OS DOIS MODOS (PR-UI-SELECT-05): 10px/14px, 22px de
                   altura, `py-1` — a mesma do `SelectItem` e do `CommandItem` desde o
                   SELECT-04. Antes o denso era 12px/26px (a regua ANTES do SELECT-03) e o
                   padrao era 9px/1.5px, abaixo do piso da casa. O que distingue `dense`
                   continua sendo o GATILHO e a altura da lista, nao o item.
                   ⚠ REALCE ESCURO: `bg-accent` e' claro e sumia sobre o painel novo. */
                className={cn(
                  'w-full text-left rounded-sm cursor-pointer text-zinc-100',
                  'min-h-[22px] px-2 py-1 text-[10px] leading-[14px]',
                  idx === highlightIdx && 'bg-zinc-800/60',
                  idx !== highlightIdx && 'hover:bg-zinc-800/45',
                  value === o.value && 'font-semibold',
                )}
              >
                {/* ⚠ O NOME ENCOLHE, A CONTAGEM NAO: com `truncate` no conjunto, o
                    numero seria a primeira coisa a sumir — e ele e' o motivo do
                    operador estar olhando. */}
                <span className="flex items-center gap-1 min-w-0">
                  {/* ⚠ O TEXTO INTEIRO NO `title` — A23. `truncate` sem ele esconde a
                      identidade do item e o operador não tem como recuperá-la. */}
                  <span className="truncate" title={o.label}>{o.label}</span>
                  {o.hint ? <span className="shrink-0 opacity-60">· {o.hint}</span> : null}
                </span>
                {o.sub ? (
                  <span className={cn('block truncate text-[10px]',
                    o.subAlerta ? 'text-amber-500' : 'text-zinc-400')} title={o.sub}>
                    {o.sub}
                  </span>
                ) : null}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-[10px] text-zinc-400">Nenhum resultado</div>
            )}
            {excedente > 0 && (
              <div className="text-[10px] text-zinc-400 px-2 py-1 border-t border-zinc-700/40">
                +{excedente} resultado{excedente === 1 ? '' : 's'} — refine a busca
              </div>
            )}
            {/* ⚠ A AÇÃO MORA NO FIM DA LISTA, não num botão ao lado do campo: quem procurou
                e não achou está OLHANDO A LISTA — é ali que "não está aqui, cadastre" tem
                de aparecer. Fica sempre visível, mesmo com a busca vazia, porque o operador
                muitas vezes já sabe que o comprador é novo. */}
            {acaoFinal && (
              <button type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { setOpen(false); acaoFinal.onSelect(); }}
                className="w-full text-left rounded-sm text-sky-300 hover:bg-zinc-800/45 border-t border-zinc-700/40 min-h-[22px] px-2 py-1 text-[10px] leading-[14px]">
                {acaoFinal.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
