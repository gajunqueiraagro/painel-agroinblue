import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  MENU_BUSCA, MENU_ITEM, MENU_PALETA, MENU_REALCE_SELECIONADO, MENU_SECUNDARIO, MENU_VAZIO,
} from "@/components/ui/menuPadrao";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      /* ⚠ A CAIXA ABERTA É CINZA-ESCURA — A23 (134). Era `bg-popover`, e o resultado era
         uma lista suspensa clara dentro de um sistema cujas outras listas (Select,
         FavorecidoSelect) já eram escuras: dois fundos para o mesmo gesto.
         ⚠ O FUNDO MORA AQUI, e não no `PopoverContent` que a envolve: os quatro
         consumidores passam `p-0`, então o `Command` preenche a superfície inteira. Pintar
         o `popover.tsx` escureceria TODO popover do sistema — inclusive os que não são
         lista suspensa —, que é muito além do que este padrão governa. */
      /* ⚠ A PALETA É A DO PADRÃO (`MENU_PALETA`, UI-DROPDOWN-PADRAO-01): opaca, a mesma em qualquer fundo. */
      "flex h-full w-full flex-col overflow-hidden rounded-md border",
      MENU_PALETA,
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        /* Input de busca do padrão: 28px, `MENU_BUSCA` (zinc-700, texto branco, placeholder zinc-300, 9,5px — fix1). Era
           44px e 14px — a altura de um campo de formulário dentro de uma lista de itens de 26px. */
        "flex h-7 w-full rounded-md px-2 py-1 outline-none disabled:cursor-not-allowed disabled:opacity-50",
        MENU_BUSCA,
        className,
      )}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    /* ⚠ `max-h-56` (224px) E A ROLAGEM SÓ AQUI — A23. Com 300px a lista passava da dobra
       em tela baixa e o rodapé do formulário sumia atrás dela. */
    className={cn("max-h-56 overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => <CommandPrimitive.Empty ref={ref} className={cn("py-3 text-center", MENU_VAZIO)} {...props} />);

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      /* Rótulo de grupo: 9,5px/500 zinc-200 (fix1: o zinc-400 sumia sobre o painel cinza), SEM uppercase — caixa
         alta sobre nomes de grupo custa largura e não acrescenta hierarquia. */
      "overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-200",
      className,
    )}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator ref={ref} className={cn("-mx-1 h-px bg-border", className)} {...props} />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

/**
 * O PAINEL DE UM COMBOBOX DE BUSCA — PR-UI-SELECT-04.
 *
 * ⚠ NAO PODE MORAR NO `PopoverContent`: aquele primitivo serve tambem o calendario do
 * DatePicker, o menu de exportacao e o KpiCard — pinta-lo de escuro escureceria os tres.
 * A cor e' de quem monta um COMBOBOX, e por isso e' uma classe, nao um default.
 * ⚠ MESMA PALETA DO `SelectContent`: os dois abrem lado a lado o tempo todo, e a unica
 * forma de continuarem iguais e' a string ser uma so'.
 * ⚠ LARGURA: piso no gatilho, cresce ate' o item mais longo, teto de 28rem — a mesma regra
 * que o `SelectContent` passou a ter.
 */
/**
 * SO' A PALETA do painel de combobox — sem largura, sem posicionamento.
 *
 * ⚠ EXISTE SEPARADA porque nem todo combobox do sistema e' Radix: o `SearchableSelect`
 * (`ui/searchable-select.tsx`, 27 superficies) e' lista propria com `absolute`, e nao tem
 * a variavel `--radix-popover-trigger-width` para consumir. Ele precisa da COR sem a
 * largura. Duas constantes, uma fonte: se a paleta mudar, muda nos dois.
 */
export const COMBOBOX_PALETA = MENU_PALETA;  /* UI-DROPDOWN-PADRAO-01: o dono é `menuPadrao.ts`; o nome fica pelos importadores. */

export const COMBOBOX_CONTENT =
  'p-0 min-w-[var(--radix-popover-trigger-width)] w-auto max-w-[28rem] ' + COMBOBOX_PALETA;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      /* ⚠ UMA LINHA, SEMPRE — A23. O item quebrava em duas quando o nome era longo, e a lista inteira desalinhava;
         quem precisa do texto completo o tem no `title` que o consumidor passa. A medida é `MENU_ITEM` (20px / 9,5px). */
      "relative flex cursor-default select-none items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-sm",
      MENU_ITEM,
      "outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      MENU_REALCE_SELECIONADO,
      className,
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn("ml-auto text-[9.5px] tracking-widest", MENU_SECUNDARIO, className)} {...props} />;
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
