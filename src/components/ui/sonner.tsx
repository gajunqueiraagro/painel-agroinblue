import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/* P158 (TOAST-POSICAO-02, Gabriel 28/10/2026 09:21) — ERRO e ATENÇÃO não somem sozinhos: ficam até o ✕. O `Toaster` do sonner tem UMA
   duração para todos os tipos, e os 161 arquivos importam `toast` direto do 'sonner' (nenhum passa por aqui): o jeito de valer em todos
   sem tocar neles é embrulhar UMA vez o `toast.error` e o `toast.warning` do sonner (o objeto é único no app). Sem `duration` na
   chamada → `Infinity` (o sonner não fecha sozinho com Infinity); com `duration` explícita, vale a dela. Quem trocar a versão do sonner
   confere que o objeto `toast` continua um só e mutável (o teste `sonner.p158.test.tsx` trava). */
type FnAviso = typeof toast.error;
const ficaAteOX = (fn: FnAviso): FnAviso => (mensagem, dados) => fn(mensagem, { ...dados, duration: dados?.duration ?? Infinity });
const MARCA_EMBRULHO = '__p158FicaAteOX';
if (!Reflect.get(toast, MARCA_EMBRULHO)) {
  toast.error = ficaAteOX(toast.error);
  toast.warning = ficaAteOX(toast.warning);
  Reflect.set(toast, MARCA_EMBRULHO, true);
}

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
         ⚠ E ELE VOLTOU, em 11/09/2026 — na Mesa de Revisão, tapando "Salvar e próximo" e
         "Revisado N/27" (TOAST-MESA-01). O aviso acima foi seguido: o canto NÃO mudou pela
         terceira vez. O que se fez foi tirar o toast de onde ele não informava nada — o
         "Salvar e próximo" avança a linha, e avançar já é a confirmação — e encurtar o do
         "Salvar" simples para 1,5s.
         ⚠ MAS ISSO É LOCAL, E O PROBLEMA É GLOBAL: qualquer modal com rodapé continua
         exposto a qualquer toast de 4s. As duas saídas estruturais seguem valendo, e
         nenhuma delas é mexer no canto de novo. A terceira vez não gastou a solução;
         adiou.
         ⚠ QUARTA DECISÃO — P158 (TOAST-POSICAO-02), Gabriel 28/10/2026 08:51: "topo no centro com X e duração menor", em TODAS as
         telas, com ou sem modal (o gabarito é o Finanças: `top-center` + `closeButton`). O que muda desta vez em relação à 1ª ida ao
         topo (que saiu por cobrir a fita de meses e os campos) é o ✕ (fecha na hora) e a duração curta: sucesso/info 2 s (era 4 s); ERRO
         e ATENÇÃO ficam até o ✕ (o embrulho acima). Com um modal aberto o aviso fica por cima dele, no centro, longe do Salvar/Cancelar;
         num modal estreito (< 420px) e alto o ✕ do modal pode ficar sob o aviso — feche o aviso no ✕ dele.
         Continua sendo prop com default: o `{...props}` abaixo vem depois e vence. */
      position="top-center"
      offset="12px"
      closeButton
      duration={2000}
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
