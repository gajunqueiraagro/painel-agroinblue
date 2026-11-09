/**
 * FECH-PASTO-UNIDADE-01 F2 — a linha do topo da grade no pasto COM piquetes: "Pasto inteiro | Por piquetes" e, por piquetes, as abas
 * [P7-A] [P7-B] … [Total] (a MESMA grade em cada aba; o Total só lê) com o subtotal da aba à direita. Altura fixa (24px) nos dois modos:
 * trocar de modo ou de aba não mexe na grade. Pasto sem piquete não monta esta linha.
 */
import { Segmentado } from '@/components/ui/segmentado';
import { TextoReservado } from '@/components/ui/regua-tabela';
import type { ModoDoCard } from '@/lib/fechamento/porPiquetes';

export const ABA_TOTAL = '__total__';

export interface AbaDoPiquete {
  id: string;
  nome: string;
}

export function AbasDosPiquetes({ modo, onModo, abas, ativa, onAba, subtotal, disabled, tituloDoModo }: {
  modo: ModoDoCard;
  onModo: (m: ModoDoCard) => void;
  abas: readonly AbaDoPiquete[];
  ativa: string;
  onAba: (id: string) => void;
  /** "P7-A · 24,8 ha · 120 cab" (a aba) ou "97,5 ha · 215 cab · 1,85 UA/ha" (o Total) */
  subtotal: string;
  disabled?: boolean;
  /** por que o modo não troca agora (ex.: salvar antes de voltar a pasto inteiro) */
  tituloDoModo?: string;
}) {
  return (
    <div className="flex h-[24px] flex-none items-center gap-2" data-testid="abas-dos-piquetes">
      <Segmentado<ModoDoCard> valor={modo} onEscolher={onModo} altura={22} fonte={10.5}
        opcoes={[
          { valor: 'inteiro', rotulo: 'Pasto inteiro', desabilitada: disabled, title: tituloDoModo },
          { valor: 'piquetes', rotulo: 'Por piquetes', desabilitada: disabled, title: tituloDoModo },
        ]} />
      {modo === 'piquetes' && (
        <>
          <Segmentado<string> valor={ativa} onEscolher={onAba} altura={22} fonte={10.5}
            opcoes={[...abas.map(a => ({ valor: a.id, rotulo: a.nome })), { valor: ABA_TOTAL, rotulo: 'Total' }]} />
          <TextoReservado texto={subtotal} reserva="P00-AA · 000,0 ha · 0.000 cab · 0,00 UA/ha" alinhar="direita"
            className="ml-auto min-w-0 text-[10.5px] text-muted-foreground" testid="subtotal-da-aba" />
        </>
      )}
    </div>
  );
}
