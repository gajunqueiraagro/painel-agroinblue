import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      /* ⚠ VOLTOU PARA `bottom-right` — PR-TOAST-POSICAO-01, decisão do Gabriel em
         10/09/2026. E ISTO REVERTE UMA DECISÃO ANTERIOR, que fica registrada aqui em vez
         de apagada: o PR-OC-UX-LOTE-A-01 tinha movido o toast para `top-center` porque em
         `bottom-right` ele caía EXATAMENTE sobre o rodapé dos modais e deixava
         Salvar / Confirmar / Fechar inclicáveis — o toast tem z-index próprio, acima do
         Dialog, então não há camada que resolva. A troca de volta foi pedida porque no
         topo ele cobre a fita de meses e os campos, que é o estorvo que se vê TODO DIA;
         o do rodapé só aparece com um modal aberto.
         ⚠ ENTÃO O DEFEITO ANTIGO PODE VOLTAR, e o `offset` de 16px não o resolve: o
         rodapé de um modal é bem mais alto que 16px. Se ele reaparecer, o canto não é a
         resposta — as duas pontas já foram tentadas — e a saída é o toast recuar quando
         há Dialog aberto, ou o rodapé ganhar a camada. Quem for mexer nisso na terceira
         vez começa sabendo que as duas primeiras foram estas.
         Continua sendo prop com default: o `{...props}` abaixo vem depois e vence. */
      position="bottom-right"
      offset="16px"
      duration={4000}
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
