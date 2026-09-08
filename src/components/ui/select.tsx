import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1.5 text-[12px] ring-offset-background placeholder:text-muted-foreground/60 placeholder:text-[11px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", side = "bottom", align = "start", sideOffset = 4, avoidCollisions = true, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        // PR-UI-CAMPOS-STD-01 — PADRÃO OFICIAL de dropdown (dark-glass), igual ao de Conta:
        // painel cinza-escuro translúcido + texto branco legível em light/dark. Antes: bg-popover.
        //
        // PR-UI-DROPDOWN-VIEWPORT-01 (A9) — o teto do painel é o espaço DISPONÍVEL medido
        // pelo Radix, não um valor fixo. Com max-h-96 (384px), um Select de 11 opções em 4
        // grupos não cabia acima nem abaixo do gatilho num modal de ~545px e vazava da tela —
        // e item que vaza é invisível, não dá erro. avoidCollisions sozinho não resolve: ele
        // inverte o lado, não encolhe o painel.
        //
        // O fallback dentro do var() é OBRIGATÓRIO: quando position !== 'popper' a variável
        // não existe, min() fica inválido e a declaração INTEIRA cai — o painel voltaria a
        // não ter teto nenhum, silenciosamente.
        /* ⚠ LARGURA: PISO NO GATILHO, TETO EM 28rem — PR-UI-SELECT-04. Presa ao gatilho
           (`w-[...]`, como estava no ContaBancariaSelect), ela CORTAVA "Banco do Brasil -
           Agnaldo…"; livre, um nome muito longo esticaria a caixa pela tela. `min-w` garante
           que nunca fique menor que o campo, `w-auto` deixa crescer ate o item mais longo e
           `max-w` para antes do absurdo — so' ali o `text-ellipsis` do item entra. */
        "relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height,24rem))] min-w-[var(--radix-select-trigger-width)] w-auto max-w-[28rem] overflow-hidden rounded-md border border-zinc-700/40 bg-zinc-950/55 backdrop-blur-xl text-zinc-100 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      side={side}
      align={align}
      sideOffset={sideOffset}
      avoidCollisions={avoidCollisions}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          /* ⚠ A BARRA FINA MORA AQUI, e nao no Content — A24. O Content e'
             `overflow-hidden`; quem rola e' o Viewport (`max-h-56` abaixo), e
             pseudo-elemento de barra so' pinta no elemento que de fato rola. Posto no
             PRIMITIVO vale para todo Select do sistema de uma vez: por adesao, o proximo
             dropdown nasceria com a barra grossa de novo. */
          "p-1 rolagem-fina",
          position === "popper" &&
            /* A23 — a lista rola em 224px; o `max-h` do content é o teto da moldura. */
            "h-[var(--radix-select-trigger-height)] max-h-56 w-full",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} /* Rótulo de grupo do padrão A23: 10px/500, SEM uppercase — caixa alta em 10px custa
       largura e não acrescenta hierarquia. */
    className={cn("py-1 pl-8 pr-2 text-[10px] font-medium text-zinc-400", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // PR-UI-CAMPOS-STD-01 — item no padrão oficial (Conta): texto branco sempre legível,
      // hover/focus com fundo escuro, selecionado (checked) com fundo mais escuro + texto branco
      // e check visível. Substitui o antigo focus:bg-accent/text-accent-foreground (que, sobre o
      // painel dark-glass, deixava o item selecionado ilegível — regressão do dropdown de Fazenda).
      /* ⚠ UMA LINHA, SEMPRE — A23: o item quebrava em duas com nome longo e a lista
         desalinhava. `min-h` mantém os 26px com o texto truncado. */
      /* ⚠ 10px/15px E' O PADRAO DO SISTEMA — PR-UI-SELECT-03, medido com `getComputedStyle`
         no proto: o "Data por" da barra de filtros abria com 10px/15px e o Conta Origem com
         12px/18px, lado a lado. Os dois vinham do MESMO primitivo; a diferenca era um
         `text-[10px]` que a barra de filtros passava por fora. O que era override de uma
         tela virou a regua — entao o 10px desce para ca' e os overrides que pediam 10px
         viram redundancia. `min-h-[26px]` NAO muda: a altura da linha ja' era a mesma nos
         dois, e e' ela que da' o ritmo da lista. */
      "relative flex min-h-[22px] w-full cursor-default select-none items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-sm py-1 pl-8 pr-2 text-[10px] leading-[14px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-zinc-100 focus:bg-zinc-800/60 focus:text-zinc-100 data-[state=checked]:bg-zinc-800/40 data-[state=checked]:text-zinc-100",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
