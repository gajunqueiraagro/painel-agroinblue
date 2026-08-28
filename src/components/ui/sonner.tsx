import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      /* PR-OC-UX-LOTE-A-01 — o default do sonner e' bottom-right, e ali o toast cai
         EXATAMENTE sobre o rodape dos modais: enquanto ele estava na tela, os botoes
         Salvar / Confirmar / Fechar ficavam inclicaveis. O toast tem z-index proprio,
         bem acima do Dialog, entao nao ha camada que resolva — so mudar de canto.
         `top-center` e nao `top-right`: o X de fechar dos modais mora no canto
         superior DIREITO, entao top-right so trocaria de vitima. No topo ao centro o
         toast cobre a faixa de titulo, que nao tem nada clicavel.
         ⚠ E' GLOBAL: vale para o sistema inteiro, nao so para os modais da OC.
         Fica como prop com default, entao qualquer tela pode sobrescrever — o
         `{...props}` abaixo vem depois e vence. */
      position="top-center"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
