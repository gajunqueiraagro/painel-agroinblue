/**
 * NOTAS-RECEITA-CARD-SEMPRE-01 (mock aprovado pelo Gabriel 27/11, md5 0ce0487c…) — o card "Notas da Receita" que NUNCA some, em nenhum
 * cliente: mesmo lugar, largura e altura fixas (360 × 22), uma linha de estado + uma ação. Régua: 10,5 px, linha 20 px, sem caixa alta.
 *   (a) sem certificado → "Cadastrar certificado" (só quem pode cadastrar vê o link) · (b) nada novo → "Abrir" · (b′) certificado novo, nos
 *   primeiros 15 min · (c) com notas → "Abrir ›" · (d) busca parada (vermelho) → "ver motivo" (minimodal: motivo, desde, o que fazer).
 * A regra dos estados é uma só: `decidirEstado` (lib/fiscal/estadoDaReceita).
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { explicacaoDaParada, fraseDoCard, type EstadoDaReceita } from '@/lib/fiscal/estadoDaReceita';

const PONTO: Record<EstadoDaReceita['tipo'], string> = {
  carregando: 'bg-slate-300', sem_certificado: 'bg-slate-300', sem_busca: 'bg-slate-300',
  sem_novas: 'bg-emerald-400', com_notas: 'bg-sky-300', parada: 'bg-red-400',
};
const ACAO = 'shrink-0 font-semibold text-primary-foreground underline underline-offset-2 hover:opacity-80';

export function CardDaReceita({ estado, podeCadastrar, onAbrir, onCadastrar }: {
  estado: EstadoDaReceita;
  /** Gestor, Proprietário ou admin (quem sobe o certificado): só eles veem "Cadastrar certificado" */
  podeCadastrar: boolean;
  onAbrir?: () => void;
  onCadastrar?: () => void;
}) {
  const [motivoAberto, setMotivoAberto] = useState(false);
  const frase = fraseDoCard(estado);
  const parada = estado.tipo === 'parada' ? estado : null;
  const explicacao = parada ? explicacaoDaParada(parada) : null;
  return (
    <>
      <div className="flex h-[22px] w-[360px] max-w-full shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[3px] bg-primary-foreground/15 px-2 text-[10.5px] leading-[20px] text-primary-foreground"
        data-testid="card-da-receita" data-estado={estado.tipo}>
        <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', PONTO[estado.tipo])} aria-hidden />
        <span className="min-w-0 flex-1 truncate" title={frase} data-testid="card-da-receita-frase">
          {parada ? <><span className="font-semibold text-red-200">Busca parada</span> · Notas da Receita</> : frase}
        </span>
        {estado.tipo === 'sem_certificado' && podeCadastrar && onCadastrar && (
          <button type="button" className={ACAO} onClick={onCadastrar} data-testid="card-da-receita-cadastrar">Cadastrar certificado</button>
        )}
        {estado.tipo === 'sem_novas' && onAbrir && (
          <button type="button" className={ACAO} onClick={onAbrir} data-testid="card-da-receita-abrir">Abrir</button>
        )}
        {estado.tipo === 'com_notas' && onAbrir && (
          <button type="button" className="h-[18px] shrink-0 rounded-[3px] bg-primary-foreground/20 px-1.5 text-[10.5px] font-semibold leading-[18px] text-primary-foreground hover:bg-primary-foreground/30"
            onClick={onAbrir} data-testid="card-da-receita-abrir" title="Escolher entre as notas que a Receita mandou">Abrir ›</button>
        )}
        {parada && (
          <button type="button" className={ACAO} onClick={() => setMotivoAberto(true)} data-testid="card-da-receita-motivo">ver motivo</button>
        )}
      </div>
      {parada && explicacao && (
        <Dialog open={motivoAberto} onOpenChange={setMotivoAberto}>
          <DialogContent className="w-[min(420px,calc(100vw-24px))] max-w-none gap-0 overflow-hidden p-0" data-testid="card-da-receita-minimodal">
            <div className="flex h-[30px] items-center bg-primary px-3 pr-10">
              <DialogTitle className="text-[11px] font-semibold leading-none text-primary-foreground">Por que a busca da Receita parou</DialogTitle>
            </div>
            <DialogDescription className="sr-only">O motivo, desde quando e o que fazer.</DialogDescription>
            <table className="mx-3 my-2.5 w-[calc(100%-24px)] border-collapse text-[11px] leading-[16px]">
              <tbody>
                <tr><td className="w-[110px] py-0.5 align-top text-muted-foreground">Motivo</td><td className="py-0.5" data-testid="card-da-receita-motivo-texto">{explicacao.motivo}</td></tr>
                {explicacao.desde && explicacao.desde !== '—' && (
                  <tr><td className="py-0.5 align-top text-muted-foreground">Desde</td><td className="py-0.5 tabular-nums">{explicacao.desde}</td></tr>
                )}
                <tr><td className="py-0.5 align-top text-muted-foreground">O que fazer</td><td className="py-0.5">{explicacao.fazer}</td></tr>
              </tbody>
            </table>
            <div className="flex justify-end gap-1.5 px-3 pb-2.5">
              <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[11px]" onClick={() => setMotivoAberto(false)}>Fechar</Button>
              {explicacao.cadastrar && podeCadastrar && onCadastrar && (
                <Button type="button" size="sm" className="h-[24px] px-2.5 text-[11px]" onClick={() => { setMotivoAberto(false); onCadastrar(); }}>Cadastrar certificado</Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
