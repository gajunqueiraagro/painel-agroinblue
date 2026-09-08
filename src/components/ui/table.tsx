import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * DENSIDADE DA TABELA — régua 9/10/21, OPT-IN.
 *
 * ⚠ POR QUE CONTEXTO E NÃO MUDANÇA GLOBAL. A régua 9/10/21 é a da referência
 * (Finanças /obrigacoes) e é a que queremos como padrão de tela tabular. Mas a
 * varredura do PR-PARC-03 mediu 39 arquivos importando este primitivo, e 38
 * deles têm ao menos uma célula SEM override — 319 instâncias de fonte e 542 de
 * altura. Trocar as classes base mudaria as 39 telas de uma vez, e como cada
 * tela é MISTA (algumas células com régua própria, outras não), o resultado
 * seria tabela com colunas de densidades diferentes lado a lado.
 *
 * Então a régua nova entra por adesão: `<Table density="dense">`. Quem não pede,
 * não muda — 'default' reproduz exatamente o que existia antes deste PR.
 *
 * ⚠ E O OVERRIDE LOCAL CONTINUA VENCENDO, nos dois modos: as classes daqui são
 * a BASE do `cn()`, e o `className` da tela vem depois. Uma tela em 'dense' que
 * precise de uma coluna maior continua resolvendo com `className` na célula.
 */
type TableDensity = "default" | "dense";

const TableDensityContext = React.createContext<TableDensity>("default");

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    density?: TableDensity;
    /**
     * Classes do DIV que embrulha a `<table>`. Existe porque esse div é
     * `overflow-auto` e portanto é o scrollport onde o `thead sticky` ancora:
     * sem altura declarada nele, o cabeçalho gruda num elemento que rola junto
     * com a página — ou seja, não gruda. Quem precisa de cabeçalho congelado
     * passa a altura e o overflow por aqui.
     */
    wrapperClassName?: string;
  }
>(({ className, density = "default", wrapperClassName, ...props }, ref) => (
  <TableDensityContext.Provider value={density}>
    <div className={cn("relative w-full overflow-auto", wrapperClassName)}>
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  </TableDensityContext.Provider>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b bg-muted/50 sticky top-0 z-10 [&_tr]:h-auto", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => {
    const density = React.useContext(TableDensityContext);
    return (
      <tr
        ref={ref}
        className={cn(
          "border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50",
          /* A linha do CABEÇALHO não recebe os 21px: o `[&_tr]:h-auto` do
             `TableHeader` tem especificidade maior e continua mandando nela. */
          density === "dense" && "h-[21px]",
          className,
        )}
        {...props}
      />
    );
  },
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const density = React.useContext(TableDensityContext);
    return (
      <th
        ref={ref}
        className={cn(
          "px-2 py-1 text-left align-middle font-semibold text-muted-foreground uppercase [&:has([role=checkbox])]:pr-0",
          density === "dense"
            ? "text-[9px] leading-tight tracking-wide"
            : "text-[10px] leading-tight tracking-wider",
          className,
        )}
        {...props}
      />
    );
  },
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const density = React.useContext(TableDensityContext);
    return (
      <td
        ref={ref}
        className={cn(
          "px-2 align-middle font-medium leading-tight [&:has([role=checkbox])]:pr-0",
          density === "dense" ? "py-0 text-[10px]" : "py-0.5 text-[11px]",
          className,
        )}
        {...props}
      />
    );
  },
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
