// FavorecidoSelect — extraído do LancamentoV2Dialog (PR-U2c-1C) para FONTE ÚNICA.
// Relocação pura: mesmo Popover+Button+busca+lista+botão "Novo", mesmo teclado.
// A BUSCA é CONTROLADA (o caller é dono de `search`/`onSearchChange`) porque o save
// do LancamentoV2Dialog reaproveita o texto digitado para auto-criar fornecedor.
// Efeito colateral (forma/dados de pagamento) sai via `onSelected(f)`; criação inline
// via `onCriarNovo`. Consumido pelo LancamentoV2Dialog e (PR-U2c-2) pela Mesa.
//
// FORN-SELETOR-PADRAO-01 passo 1b (Gabriel, 08/10/2026) — ESTE É O DONO do seletor de fornecedor do sistema.
//  · Opção em UMA linha: nome à esquerda (corta, inteiro no `title`), selo "N iguais" quando o nome se repete entre os
//    ativos, e o CNPJ/CPF à direita, em tom apagado, que NUNCA corta. Sem documento a área fica vazia.
//  · Busca em memória por nome (sem acento, sem caixa) e por dígitos do documento (ignora ponto, barra e traço).
//  · No máximo 100 opções desenhadas; a busca corre sobre todas; o escolhido vem sempre no topo; rodapé fixo
//    "Mostrando 100 de N — digite para refinar".
//  · Linha FIXA sob o campo com o documento do escolhido ("sem CNPJ/CPF"; vazia sem escolha) — prop `linhaDoDocumento`.
//  · Valor gravado inativo: aparece no campo com a marca "inativo" (não está na lista).
//  · Cadastro "[META]": fora da lista, salvo `incluirMeta` (modal de meta).
//  · DOIS MODOS NA TRANSIÇÃO: com `clienteId` e SEM `fornecedores`, a lista vem do LEITOR ÚNICO
//    (`useFornecedoresDoCliente`); com `fornecedores`, vale a lista do hospedeiro, como sempre, até a fatia dele no PASSO 2.
//  ⚠ As regras puras (normalização, formatação, recorte) moram em `@/lib/fornecedores/fornecedorTexto`.
import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FornecedorV2 } from '@/hooks/useFinanceiroV2';
import { COMBOBOX_CONTENT } from '@/components/ui/command';
import {
  MENU_BUSCA, MENU_ESCOLHIDO, MENU_ITEM, MENU_REALCE, MENU_REALCE_HOVER, MENU_SECUNDARIO, MENU_VAZIO,
} from '@/components/ui/menuPadrao';
import { useFornecedoresDoCliente } from '@/hooks/useFornecedoresDoCliente';
import type { FornecedorLido } from '@/lib/fornecedores/leitorDeFornecedores';
import {
  LIMITE_DE_OPCOES, formatarDocumento, fraseDoLimite, linhaDoDocumento as textoDaLinhaDoDocumento, montarOpcoes,
  recortarOpcoes, seloDeIguais,
} from '@/lib/fornecedores/fornecedorTexto';

/** O minimo que o seletor le' de um fornecedor. OC-HOMOLOG-FIX-02: o `NovoCompromissoDialog` da OC so' conhece
 *  `{ id, nome }`, e o seletor passa a servi-lo sem cast; quem tem o `FornecedorV2` inteiro segue recebendo-o no
 *  `onSelected`. */
export type FavorecidoOpcao = Pick<FornecedorV2, 'id' | 'nome'> & Partial<Pick<FornecedorV2, 'cpf_cnpj' | 'ativo'>>;

export interface FavorecidoSelectProps<F extends FavorecidoOpcao = FornecedorV2> {
  value: string;                          // favorecidoId ('' = nenhum)
  onChange: (id: string) => void;         // seta o id (sem side effect)
  /** side effect: forma/dados de pagamento. No modo do leitor o objeto é o `FornecedorLido` (as mesmas colunas do `FornecedorV2`). */
  onSelected?: (f: F | FornecedorLido) => void;
  /**
   * A lista do hospedeiro (modo de TRANSIÇÃO). Ausente = a lista vem do leitor único, pelo `clienteId`.
   * ⚠ No fim do PASSO 2 nenhum hospedeiro passa a lista: ela é do leitor.
   */
  fornecedores?: F[];
  /** FORN-SELETOR-PADRAO-01 — o cliente de quem se leem os fornecedores (modo do leitor único). */
  clienteId?: string | null;
  /** A busca CONTROLADA pelo hospedeiro (quem precisa do texto: "criar com este nome"). Fatia 2b: OPCIONAIS — sem as duas, a
   *  busca é estado do próprio seletor (os shells de OC têm return antecipado e não ganham um estado só para isto). */
  search?: string;
  onSearchChange?: (s: string) => void;
  /**
   * Botão "+" → abrir cadastro de fornecedor. OPCIONAL desde 133b-a: sem ele, o botão não
   * é renderizado.
   *
   * ⚠ BOTÃO SEM DESTINO É PIOR QUE BOTÃO AUSENTE. O modal de de-para da aba Enriquecer
   * ainda não tem o diálogo de criação (ele mora em `ImportLancDeParaPanel`), e um "+" que
   * não abre nada gasta o gesto do operador uma vez e a confiança dele para sempre.
   */
  onCriarNovo?: () => void;
  /** Classe do botão "+". Default 'h-8 w-8' — telas existentes inalteradas.
   *  PR-IMPORT-EXCEL-LANC-02: a importação usa denso ('h-5 w-5'). */
  novoButtonClassName?: string;
  label?: string;
  triggerClassName?: string;              // ex.: fieldBg
  /** 133e adendo — gatilho compacto da Mesa (20px/11px). A caixa aberta segue o A23. */
  size?: 'default' | 'compact';
  tabIndex?: number;
  disabled?: boolean;
  showCpfCnpj?: boolean;                  // exibe "Nome (CPF/CNPJ)" — default false (demais telas inalteradas)
  /**
   * OC-HOMOLOG-FIX-02 — campo OPCIONAL: a lista ganha "— nenhum —" no topo, que devolve `''` e nao dispara
   * `onSelected`. OPT-IN: sem a prop nada muda, e onde o favorecido e' obrigatorio ele segue sem como esvaziar.
   * Era o que o dialogo de despesa da OC tinha com o `SearchableSelect` (`allLabel="— nenhum —"`).
   */
  limpavel?: boolean;
  /** Texto do gatilho vazio. Default 'Selecione fornecedor...'. */
  placeholder?: string;
  /**
   * FORN-SELETOR-PADRAO-01 (D8) — a linha FIXA de 14px sob o campo, sempre presente, com o documento do escolhido.
   * Padrão: LIGADA no modo do leitor; no modo de transição (lista do hospedeiro) fica desligada até a fatia dele —
   * nenhum formulário muda de altura sem ter sido medido. Em célula de tabela: `false` (o documento vai no `title`).
   */
  linhaDoDocumento?: boolean;
  /** FORN-SELETOR-PADRAO-01 (D7) — cadastros "[META]" entram na lista (só modal de meta). */
  incluirMeta?: boolean;
  /**
   * FORN-SELETOR-PADRAO-01 fatia 2a — uma ação FIXA no pé da lista, fora da rolagem (o "Outro (informar nome e CNPJ/CPF)" do
   * emitente do documento). Não é fornecedor: não muda `value` nem dispara `onSelected`; o hospedeiro decide o que ela faz.
   */
  acaoFinal?: { label: string; onSelect: () => void };
  /** Fatia 2b (OC) — o "+" fica APAGADO (não some) quando o hospedeiro trava o cadastro, como a compra em somente leitura. */
  novoDesabilitado?: boolean;
  /** Fatia 2b (OC) — o nome do "+" no `title` e no `aria-label` (padrão "Novo Fornecedor"; no documento da OC, "Cadastrar emitente"). */
  novoRotulo?: string;
  /** Fatia 2b (OC) — o texto do item que esvazia o campo `limpavel` (padrão "— nenhum —"). No emitente do documento da OC o
   *  vazio SIGNIFICA "a própria contraparte", e o item diz isso. */
  rotuloDoVazio?: string;
}

/** Rótulo de exibição do favorecido. Com showCpfCnpj + documento presente → "Nome (CPF/CNPJ)";
 *  sem documento (ou desabilitado) → apenas o nome. Não altera valor/seleção/identidade. */
function favorecidoLabel(f: FavorecidoOpcao, showCpfCnpj: boolean): string {
  const doc = (f.cpf_cnpj ?? '').trim();
  return showCpfCnpj && doc ? `${f.nome} (${doc})` : f.nome;
}

export function FavorecidoSelect<F extends FavorecidoOpcao = FornecedorV2>({
  value, onChange, onSelected, fornecedores, clienteId,
  search: buscaDoHospedeiro, onSearchChange: aoBuscarNoHospedeiro, onCriarNovo, novoButtonClassName,
  label, triggerClassName, size = 'default', tabIndex, disabled, showCpfCnpj = false,
  limpavel = false, placeholder = 'Selecione fornecedor...', linhaDoDocumento, incluirMeta = false, acaoFinal,
  novoDesabilitado = false, novoRotulo, rotuloDoVazio = '— nenhum —',
}: FavorecidoSelectProps<F>) {
  const [open, setOpen] = useState(false);
  const [buscaPropria, setBuscaPropria] = useState('');
  const search = buscaDoHospedeiro ?? buscaPropria;
  const onSearchChange = aoBuscarNoHospedeiro ?? setBuscaPropria;
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* ── de onde vem a lista ── o hook roda SEMPRE (sem cliente ele não lê nada); quem decide o modo é a prop `fornecedores` */
  const doLeitor = fornecedores === undefined;
  const lidos = useFornecedoresDoCliente(doLeitor ? clienteId : null, doLeitor ? value : null);
  const comLinha = linhaDoDocumento ?? doLeitor;

  const ativos: Array<F | FornecedorLido> = useMemo(
    () => (doLeitor ? lidos.fornecedores : (fornecedores ?? []).filter(f => f.ativo !== false)),
    [doLeitor, lidos.fornecedores, fornecedores]);

  /* normalização, documento e "N iguais": UMA vez por lista (a busca corre sobre isto a cada tecla) */
  const opcoes = useMemo(() => montarOpcoes(ativos, incluirMeta), [ativos, incluirMeta]);
  const recorte = useMemo(() => recortarOpcoes(opcoes, search, value || null, LIMITE_DE_OPCOES), [opcoes, search, value]);
  const visiveis = recorte.visiveis;
  const rodape = fraseDoLimite(visiveis.length, recorte.total);

  /* ── o escolhido ── entre os ativos; senão o gravado (inativo): do leitor por id, ou da lista inteira do hospedeiro */
  const escolhido: F | FornecedorLido | null = useMemo(() => {
    if (!value) return null;
    const ativo = ativos.find(f => f.id === value);
    if (ativo) return ativo;
    if (doLeitor) return lidos.gravado;
    return (fornecedores ?? []).find(f => f.id === value) ?? null;
  }, [value, ativos, doLeitor, lidos.gravado, fornecedores]);
  const inativo = !!escolhido && escolhido.ativo === false;

  /**
   * Abre POSICIONADO no fornecedor atual — 133h adendo item 14.
   *
   * ⚠ ERA `setHighlight(0)` SEMPRE, e o Enter confirmava o PRIMEIRO da lista: abrir o
   * seletor de uma linha que já tinha fornecedor e apertar Enter TROCAVA o fornecedor certo
   * pelo primeiro do cadastro, sem aviso. Nunca abrir pedindo para redigitar o que já está
   * escolhido.
   * ⚠ `search` CONTINUA ZERANDO: quando o operador digita, a lista é outra e o valor antigo
   * pode nem estar nela — aí o topo é o certo. É o mesmo efeito, com a posição certa.
   * ⚠ FORN-SELETOR-PADRAO-01: o escolhido agora vem no TOPO da lista (mesmo fora dos 100), então a posição dele é a 0.
   */
  useEffect(() => {
    const idx = value ? visiveis.findIndex((o) => o.f.id === value) : -1;
    setHighlight(idx >= 0 ? idx : 0);
  }, [search, open, visiveis, value]);

  useEffect(() => {
    const el = itemRefs.current[highlight];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const handleSelect = (fId: string) => {
    onChange(fId);
    setOpen(false);
    onSearchChange('');
    const f = ativos.find(x => x.id === fId);
    if (f) onSelected?.(f);
  };

  const handleLimpar = () => {
    onChange('');
    setOpen(false);
    onSearchChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(prev => Math.min(prev + 1, visiveis.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (visiveis[highlight]) {
        e.preventDefault();
        handleSelect(visiveis[highlight].f.id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selectedNome = escolhido ? favorecidoLabel(escolhido, showCpfCnpj) : '';
  const documentoDoEscolhido = escolhido ? formatarDocumento(escolhido.cpf_cnpj) : '';
  /* o que o campo diz quando ainda não tem o nome: lendo, ou o texto de sempre */
  const textoDoGatilho = selectedNome || (value && doLeitor && lidos.carregando ? 'Carregando…' : placeholder);
  /* D8 — em célula de tabela a linha fica desligada, e o documento vai aqui */
  const tituloDoGatilho = escolhido
    ? [escolhido.nome, textoDaLinhaDoDocumento(escolhido), inativo ? 'inativo' : ''].filter(Boolean).join(' · ')
    : undefined;
  const erroDoLeitor = doLeitor ? lidos.erro : null;

  return (
    <div>
      {label && <Label className="text-[10px]">{label}</Label>}
      {/* ⚠ `items-center` — 133g item 1. Sem ele o flex fica em `stretch`, e um "+" mais alto
          que o gatilho torna a linha da altura DELE: o gatilho de 20px ia para o topo de um
          bloco de 32px e descia 6px em relação aos outros campos da tabela. O `gap-1` são os
          4px do item 3. */}
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) onSearchChange(''); }}>
          <PopoverTrigger asChild>
            <Button tabIndex={tabIndex} variant="outline" role="combobox" aria-expanded={open} disabled={disabled} title={tituloDoGatilho} className={cn("flex-1 min-w-0 h-8 justify-between font-normal text-[12px]", size === 'compact' && 'h-5 px-1.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3', triggerClassName)}>
              {/* UI-DROPDOWN-PADRAO-01: o texto que não cabe começa na borda esquerda (o botão centraliza por padrão) */}
              <span className="min-w-0 flex-1 truncate text-left">{textoDoGatilho}</span>
              {inativo && (
                /* o gravado que não está mais entre os ativos: o campo não esvazia, e diz por quê */
                <span data-testid="favorecido-inativo" className="ml-1 shrink-0 rounded border border-amber-400 bg-amber-50 px-1 text-[9.5px] leading-[14px] text-amber-800">inativo</span>
              )}
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className={COMBOBOX_CONTENT} align="start">
            {/* Input de busca do padrão de menu (`MENU_BUSCA`, fix1): zinc-700, texto branco, 9,5px, ícone 14px. */}
            <div className="flex items-center border-b border-zinc-500/40 px-2">
              <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              <input
                ref={inputRef}
                className={cn("my-1 flex h-6 w-full rounded px-1.5 outline-none", MENU_BUSCA)}
                placeholder="Buscar por nome ou CNPJ/CPF..."
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1" data-testid="favorecido-lista">
              {limpavel && (
                <button
                  type="button"
                  className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm outline-none", MENU_SECUNDARIO, MENU_REALCE_HOVER, MENU_ITEM)}
                  onClick={handleLimpar}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value ? "opacity-0" : "opacity-100")} />
                  <span className="truncate" title={rotuloDoVazio}>{rotuloDoVazio}</span>
                </button>
              )}
              {erroDoLeitor && (
                <p className={cn("flex items-center justify-center gap-2 py-3 text-center", MENU_VAZIO)} data-testid="favorecido-erro-na-lista">
                  <span>{erroDoLeitor}</span>
                  <button type="button" className="underline" onClick={lidos.tentarDeNovo}>Tentar de novo</button>
                </p>
              )}
              {!erroDoLeitor && visiveis.length === 0 && (
                <p className={cn("py-3 text-center", MENU_VAZIO)}>
                  {doLeitor && lidos.carregando ? 'Carregando fornecedores…' : 'Nenhum fornecedor encontrado'}
                </p>
              )}
              {visiveis.map((o, idx) => (
                <button
                  key={o.f.id}
                  ref={el => { itemRefs.current[idx] = el; }}
                  data-testid="favorecido-opcao"
                  className={cn(
                    /* ⚠ UMA LINHA, SEMPRE — A23. Era `text-sm py-1.5` e o nome do fornecedor
                       quebrava em duas dentro do item; o nome inteiro fica no `title`.
                       ⚠ A MEDIDA DO PADRÃO DE MENU — `MENU_ITEM` (UI-DROPDOWN-PADRAO-01): era 12px/26, o maior do sistema. */
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm outline-none",
                    MENU_ITEM,
                    /* o realce vem do dono (`menuPadrao.ts`, fix1): zinc-700 / zinc-700/60 sobre o painel zinc-600; o texto herda o branco */
                    idx === highlight ? MENU_REALCE : MENU_REALCE_HOVER,
                    value === o.f.id && idx !== highlight && MENU_ESCOLHIDO,
                  )}
                  onClick={() => handleSelect(o.f.id)}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value === o.f.id ? "opacity-100" : "opacity-0")} />
                  {/* nome à esquerda: é o ÚNICO que corta (inteiro no `title`) */}
                  <span className="min-w-0 flex-1 truncate text-left" title={favorecidoLabel(o.f, showCpfCnpj)}>{o.f.nome}</span>
                  {o.iguais > 0 && (
                    <span data-testid="favorecido-iguais" className="ml-1.5 shrink-0 rounded-sm bg-amber-400/90 px-1 text-zinc-900"
                      title={`${o.iguais} cadastros ativos com este nome — confira o CNPJ/CPF`}>{seloDeIguais(o.iguais)}</span>
                  )}
                  {/* documento à direita, em tom apagado: NUNCA corta. Sem documento a área fica vazia (D5). */}
                  <span data-testid="favorecido-doc-da-opcao" className={cn("ml-2 shrink-0 whitespace-nowrap tabular-nums", MENU_SECUNDARIO)}>{o.documento}</span>
                </button>
              ))}
            </div>
            {acaoFinal && (
              <button type="button" data-testid="favorecido-acao-final"
                className={cn("flex w-full cursor-pointer select-none items-center border-t border-zinc-500/40 outline-none", MENU_ITEM, MENU_REALCE_HOVER)}
                onClick={() => { setOpen(false); onSearchChange(''); acaoFinal.onSelect(); }}>
                <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={acaoFinal.label}>{acaoFinal.label}</span>
              </button>
            )}
            {rodape && (
              /* fora da rolagem: fica parado enquanto a lista anda */
              <div data-testid="favorecido-rodape" className={cn("border-t border-zinc-500/40 px-2 py-[3px]", MENU_VAZIO)}>{rodape}</div>
            )}
          </PopoverContent>
        </Popover>
        {onCriarNovo && (
          /* ⚠ O ÍCONE ACOMPANHA O BOTÃO — 133g item 3: num "+" de 20px, um ícone de 14px
             ocupa a altura toda. `[&_svg]` do `novoButtonClassName` manda quando vem. */
          <Button variant="outline" size="icon" disabled={novoDesabilitado || undefined}
            className={cn('shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5', novoButtonClassName ?? 'h-8 w-8')}
            onClick={onCriarNovo} title={novoRotulo ?? 'Novo Fornecedor'} aria-label={novoRotulo}>
            <Plus />
          </Button>
        )}
      </div>
      {comLinha && (
        /* ⚠ ALTURA FIXA E SEMPRE PRESENTE (D8): escolher, trocar ou limpar o fornecedor não muda a altura do formulário */
        /* 14px com o texto encostado EMBAIXO (fatia 2a, visto na tela): com 12px o anel de foco do campo (4px) cobria o topo do texto */
        <div data-testid="favorecido-documento" className="flex h-[14px] items-end gap-1.5 overflow-hidden text-[9.5px] leading-3 text-muted-foreground">
          {erroDoLeitor ? (
            <>
              <span className="min-w-0 truncate text-destructive" title={erroDoLeitor}>{erroDoLeitor}</span>
              <button type="button" className="shrink-0 underline text-destructive" onClick={lidos.tentarDeNovo}>Tentar de novo</button>
            </>
          ) : (
            <span className="whitespace-nowrap tabular-nums" title={documentoDoEscolhido || undefined}>{textoDaLinhaDoDocumento(escolhido)}</span>
          )}
        </div>
      )}
    </div>
  );
}
