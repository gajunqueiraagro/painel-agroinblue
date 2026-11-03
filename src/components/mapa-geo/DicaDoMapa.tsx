/**
 * MAPA-DICAS-01 — a dica rica de todo botão do mapa (Gabriel 02/11: "o cliente não entende; tem que explicar bem ao passar o mouse").
 * UM componente para o mapa inteiro: NOME em negrito + 1 frase do que faz + o atalho (se houver).
 *  - mouse: aparece em ~300 ms (o `title` nativo é lento e some); teclado: ao focar (comportamento do Radix);
 *  - toque: segurar ~500 ms mostra a dica; soltar antes não mostra; ela fecha no próximo toque fora;
 *  - a dica fica EMBAIXO do botão (as barras ficam no alto do mapa), nunca sai da tela e nunca é cortada (sem truncate/overflow-hidden);
 *  - botão desabilitado não dispara ponteiro no Radix: com `desabilitado` ele vai num <span tabIndex=0 inline-flex> e a frase diz por quê.
 * O `data-medir` das barras continua no próprio botão (o span só embrulha), então a conta de largura (arranjarZona) não muda.
 */
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ATRASO_DA_DICA_MS = 300;
export const TOQUE_LONGO_MS = 500;

interface Props {
  nome: string;
  frase: string;
  atalho?: string;
  /** o botão está desabilitado: embrulha num span focável para a dica ainda aparecer */
  desabilitado?: boolean;
  /** MAPA-PRACA-ESTAVEL-01: seletor de algo que a dica NUNCA cobre (a lista das divisões do Criar piquetes): se embaixo do botão ela cairia em
   *  cima dele, a dica abre à ESQUERDA do botão (sobre a própria barra) */
  evitar?: string;
  children: ReactNode;
}

/** Embaixo (o padrão) ou à esquerda: à esquerda quando a faixa embaixo do botão (até 260 px de dica) encosta no que deve ser evitado. */
export function ladoDaDica(botao: Pick<DOMRect, 'left' | 'right' | 'bottom'>, evitar: Pick<DOMRect, 'left' | 'right' | 'top'> | null): 'bottom' | 'left' {
  if (!evitar) return 'bottom';
  const meio = (botao.left + botao.right) / 2;
  const [l, r] = [meio - 130, meio + 130];
  return r > evitar.left && l < evitar.right && evitar.top >= botao.bottom - 1 && evitar.top < botao.bottom + 80 ? 'left' : 'bottom';
}

export function DicaDoMapa({ nome, frase, atalho, desabilitado = false, evitar, children }: Props) {
  const [lado, setLado] = useState<'bottom' | 'left'>('bottom');
  const medirLado = (el: Element) => {
    if (!evitar) return;
    const alvo = document.querySelector(evitar);
    setLado(ladoDaDica(el.getBoundingClientRect(), alvo ? alvo.getBoundingClientRect() : null));
  };
  const [aberta, setAberta] = useState(false);
  const [porToque, setPorToque] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelar = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => cancelar, []);

  /* a dica aberta por toque fecha no PRÓXIMO toque fora (o pointerleave que vem ao soltar o dedo não a fecha) */
  useEffect(() => {
    if (!porToque) return;
    const fechar = () => { setPorToque(false); setAberta(false); };
    const id = setTimeout(() => document.addEventListener('pointerdown', fechar, { once: true, capture: true }), 0);
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', fechar, { capture: true }); };
  }, [porToque]);

  const aoTocar = () => {
    cancelar();
    timer.current = setTimeout(() => { timer.current = null; setPorToque(true); setAberta(true); }, TOQUE_LONGO_MS);
  };
  const aoSoltar = (ev: TouchEvent) => {
    if (timer.current) { cancelar(); return; }
    if (porToque && ev.cancelable) ev.preventDefault(); // o toque longo mostrou a dica: soltar não clica no botão
  };
  const aoMover = () => cancelar();

  const gatilho = desabilitado
    ? <span tabIndex={0} className="inline-flex flex-none" data-testid="dica-do-mapa-gatilho">{children}</span>
    : children;

  return (
    <TooltipProvider delayDuration={ATRASO_DA_DICA_MS}>
      <Tooltip open={aberta} onOpenChange={(v) => { if (!v && porToque) return; setAberta(v); }} delayDuration={ATRASO_DA_DICA_MS}>
        <TooltipTrigger asChild onTouchStart={aoTocar} onTouchEnd={aoSoltar} onTouchMove={aoMover} onTouchCancel={aoMover}
          onPointerEnter={ev => medirLado(ev.currentTarget)} onFocus={ev => medirLado(ev.currentTarget)}>
          {gatilho}
        </TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent side={lado} align="center" sideOffset={6} avoidCollisions collisionPadding={8} data-testid="dica-do-mapa" data-cromo="dica"
            className="z-[1200] block h-auto w-max max-w-[260px] overflow-visible whitespace-normal break-words px-2 py-1 text-[10px] font-normal leading-snug">
            <span className="block text-[10.5px] font-bold text-foreground" data-testid="dica-do-mapa-nome">{nome}</span>
            <span className="block text-muted-foreground" data-testid="dica-do-mapa-frase">{frase}</span>
            {atalho && <span className="mt-0.5 block tabular-nums text-foreground" data-testid="dica-do-mapa-atalho">Atalho: {atalho}</span>}
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </TooltipProvider>
  );
}
