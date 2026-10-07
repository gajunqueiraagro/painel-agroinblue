/**
 * AvisoVersaoNova — APP-VERSAO-NOVA-01. O aviso FIXO do shell para o pedaço que não chegou (página aberta antes de uma publicação).
 *
 * ⚠ NUNCA RECARREGA SOZINHO: a pessoa pode estar com um lançamento meio digitado. Tem X (fecha; volta se a falha se repetir) e
 *   o botão "Recarregar". Uma linha de 28px, no topo, acima dos modais; não cobre campo de digitação.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { FRASE_VERSAO_NOVA, ouvirVersaoNova } from '@/lib/app/falhaDeVersao';

export function AvisoVersaoNova({ recarregar = () => window.location.reload() }: { recarregar?: () => void }) {
  const [aceso, setAceso] = useState(false);
  useEffect(() => ouvirVersaoNova(() => setAceso(true)), []);
  if (!aceso) return null;
  return (
    <div
      role="alert"
      data-testid="aviso-versao-nova"
      className="fixed left-1/2 top-1 z-[200] flex h-7 max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-2 rounded border border-amber-300 bg-amber-50 pl-2.5 pr-1 text-[10.5px] text-amber-900 shadow-md"
    >
      <span className="min-w-0 truncate" title={FRASE_VERSAO_NOVA}>{FRASE_VERSAO_NOVA}</span>
      <button
        type="button"
        data-testid="aviso-versao-nova-recarregar"
        onClick={recarregar}
        className="h-[20px] shrink-0 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
      >
        Recarregar
      </button>
      <button
        type="button"
        aria-label="Fechar aviso"
        data-testid="aviso-versao-nova-fechar"
        onClick={() => setAceso(false)}
        className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded text-amber-900 hover:bg-amber-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
