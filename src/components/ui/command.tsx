import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
      "flex h-full w-full flex-col overflow-hidden rounded-md border border-zinc-700/40 bg-zinc-950/55 text-zinc-100 backdrop-blur-xl",
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
        /* Input de busca do padrão: 32px, 12px, placeholder zinc-400. Era 44px e 14px — a
           altura de um campo de formulário dentro de uma lista de itens de 26px. */
        "flex h-7 w-full rounded-md bg-zinc-900/60 px-2 py-1 text-[10px] text-zinc-100 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50",
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
>((props, ref) => <CommandPrimitive.Empty ref={ref} className="py-3 text-center text-[11px] text-zinc-400" {...props} />);

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      /* Rótulo de grupo: 10px/500 zinc-400, SEM uppercase — caixa alta em 10px sobre
         nomes de grupo custa largura e não acrescenta hierarquia. */
      "overflow-hidden p-1 text-zinc-100 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400",
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
export const COMBOBOX_CONTENT =
  'p-0 min-w-[var(--radix-popover-trigger-width)] w-auto max-w-[28rem] ' +
  'bg-zinc-950/55 backdrop-blur-xl border-zinc-700/40 text-zinc-100';

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      /* ⚠ UMA LINHA, SEMPRE — A23. O item quebrava em duas quando o nome era longo, e a
         lista inteira desalinhava. `min-h` garante os 26px mesmo com o texto truncado; quem
         precisa do texto completo o tem no `title` que o consumidor passa. */
      "relative flex min-h-[22px] cursor-default select-none items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-sm px-2 py-1 text-[10px] leading-[14px] text-zinc-100 outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-zinc-800/60 data-[selected=true]:text-zinc-100 data-[disabled=true]:opacity-50",
      className,
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn("ml-auto text-[10px] tracking-widest text-zinc-400", className)} {...props} />;
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
