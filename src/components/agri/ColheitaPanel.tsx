/**
 * A COLHEITA DO TALHÃO — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ IRMÃO DO PAINEL DE ÁREA, E ABAIXO DELE: é o fluxo do operador — cadastra o que plantou e,
 * no mesmo lugar, registra o que colheu. Uma tela separada obrigaria a reencontrar o pasto.
 * ⚠ SÓ EXISTE ONDE HÁ ÁREA GRAVADA. Não se colhe o que não se plantou, e o `safra_area_id` é
 * chave estrangeira: sem a área salva, não há onde pendurar o romaneio.
 * ⚠ UMA LISTA POR CULTURA. O pasto com amendoim e milho tem duas áreas e duas colheitas — o
 * seco de uma não se soma ao da outra, e é por isso que o bloco se repete por área em vez de
 * misturar tudo numa lista só.
 * ⚠ SÓ O FÍSICO: preço, classe e venda são da operação comercial, frente própria.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import {
  DESTINOS, unidadeDaCultura, sacasDoPeso, validarRomaneio, totaisColheita,
  type RomaneioForm,
} from '@/lib/agri/colheita';
import { useColheita, type ColheitaRow } from '@/hooks/useColheita';
import type { AreaPlantadaRow } from '@/hooks/useAreaPlantada';

interface Props {
  clienteId: string | null | undefined;
  /** As áreas JÁ GRAVADAS da safra/pasto — nunca as linhas em edição do painel de cima. */
  areas: readonly AreaPlantadaRow[];
  somenteLeitura: boolean;
}

const romaneioVazio = (): RomaneioForm => ({
  id: null, dataColheita: '', pesoVerdeKg: '', sacas: '',
  pesoSecoKg: '', pesoRefugoKg: '', destino: '', romaneioRef: '', observacoes: '',
});

const doBanco = (r: ColheitaRow): RomaneioForm => ({
  id: r.id,
  dataColheita: r.data_colheita ?? '',
  pesoVerdeKg: r.peso_bruto_kg != null ? String(r.peso_bruto_kg).replace('.', ',') : '',
  sacas: r.sacas != null ? String(r.sacas).replace('.', ',') : '',
  pesoSecoKg: r.peso_liquido_kg != null ? String(r.peso_liquido_kg).replace('.', ',') : '',
  pesoRefugoKg: r.peso_refugo_kg != null ? String(r.peso_refugo_kg).replace('.', ',') : '',
  destino: r.destino ?? '',
  romaneioRef: r.romaneio_ref ?? '',
  observacoes: r.observacoes ?? '',
});

export function ColheitaPanel({ clienteId, areas, somenteLeitura }: Props) {
  const ids = useMemo(() => areas.map(a => a.id), [areas]);
  const { linhas: doBancoTodas, carregando, salvar } = useColheita(ids);

  if (areas.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
        Colheita
      </div>
      {areas.map(area => (
        <ColheitaDaArea
          key={area.id}
          area={area}
          clienteId={clienteId}
          somenteLeitura={somenteLeitura}
          carregando={carregando}
          doBancoDaArea={doBancoTodas.filter(l => l.safra_area_id === area.id)}
          salvar={salvar}
        />
      ))}
    </div>
  );
}

function ColheitaDaArea({
  area, clienteId, somenteLeitura, carregando, doBancoDaArea, salvar,
}: {
  area: AreaPlantadaRow;
  clienteId: string | null | undefined;
  somenteLeitura: boolean;
  carregando: boolean;
  doBancoDaArea: ColheitaRow[];
  salvar: ReturnType<typeof useColheita>['salvar'];
}) {
  const [linhas, setLinhas] = useState<RomaneioForm[]>([]);
  const [gravado, setGravado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const unidade = unidadeDaCultura(area.cultura);

  useEffect(() => {
    if (carregando) return;
    const atual = doBancoDaArea.map(doBanco);
    setLinhas(atual);
    setGravado(JSON.stringify(atual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, JSON.stringify(doBancoDaArea.map(r => r.id))]);

  const totais = useMemo(
    () => totaisColheita(linhas, area.cultura, area.area_plantada_ha),
    [linhas, area.cultura, area.area_plantada_ha]);
  const sujo = JSON.stringify(linhas) !== gravado;

  const editar = (idx: number, campo: keyof RomaneioForm, valor: string) => {
    setLinhas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const novo = { ...l, [campo]: valor };
      /* ⚠ AS SACAS ACOMPANHAM O VERDE ENQUANTO NINGUÉM AS DIGITA. Depois que o operador
         escreve um número ali, o campo é dele: o romaneio às vezes já vem em sacas, e
         sobrescrever o que ele leu no papel seria trocar o documento pelo cálculo. */
      if (campo === 'pesoVerdeKg' && !l.sacas.trim()) {
        const sc = sacasDoPeso(Number(String(valor).replace(/\./g, '').replace(',', '.')) || 0, area.cultura);
        if (sc != null) novo.sacas = String(sc).replace('.', ',');
      }
      return novo;
    }));
  };

  const handleSalvar = async () => {
    if (!clienteId) return;
    const payloads: Array<{ id: string | null } & NonNullable<ReturnType<typeof validarRomaneio>['payload']>> = [];
    for (const l of linhas) {
      const v = validarRomaneio(l, area.cultura);
      if (!v.ok || !v.payload) { toast.error(v.erro ?? 'Romaneio inválido.'); return; }
      payloads.push({ id: l.id, ...v.payload });
    }
    setSalvando(true);
    try {
      const r = await salvar(area.id, payloads, clienteId);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a colheita.'); return; }
      toast.success(`Colheita de ${labelDaCultura(area.cultura)} salva.`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/20 p-2 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
        <span className="font-bold text-foreground">{labelDaCultura(area.cultura)}</span>
        <span className="text-muted-foreground tabular-nums">{formatNum(area.area_plantada_ha, 1)} ha</span>
        <div className="flex-1" />
        <span className="text-muted-foreground">
          Verde: <b className="text-foreground tabular-nums">{formatNum(totais.verdeKg, 0)} kg</b>
          {totais.sacas != null && <> · <b className="text-foreground tabular-nums">{formatNum(totais.sacas, 1)} sc</b></>}
        </span>
        <span className="text-muted-foreground">
          Seco: <b className="text-foreground tabular-nums">{totais.secoKg > 0 ? `${formatNum(totais.secoKg, 0)} kg` : '—'}</b>
        </span>
        {/* ⚠ "AGUARDANDO COOPERATIVA" É DADO, NÃO ENFEITE: a quebra e a produtividade só
            existem sobre o que voltou seco, e mostrar zero enquanto a carga está na
            cooperativa leria como perda total. */}
        {totais.quebraPct != null ? (
          <>
            <span className="text-muted-foreground">
              Quebra: <b className="text-foreground tabular-nums">{formatNum(totais.quebraPct, 1)}%</b>
            </span>
            {totais.produtividade != null && (
              <span className="text-muted-foreground">
                Produtividade: <b className="text-foreground tabular-nums">
                  {formatNum(totais.produtividade, 2)} {unidade.unidadeProdutividade}
                </b>
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] italic text-muted-foreground">aguardando cooperativa</span>
        )}
        {totais.aguardandoSeco > 0 && totais.quebraPct != null && (
          <span className="text-[10px] italic text-muted-foreground">
            {totais.aguardandoSeco} {totais.aguardandoSeco === 1 ? 'romaneio sem seco' : 'romaneios sem seco'}
          </span>
        )}
      </div>

      {linhas.length === 0 && (
        <div className="py-1 text-[11px] text-muted-foreground">Nenhum romaneio lançado.</div>
      )}

      {linhas.map((l, idx) => (
        <div key={l.id ?? `novo-${idx}`} className="rounded border bg-card px-2 py-1.5 space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] items-end gap-2">
            <div>
              <Label className="text-[10px]">Data <span className="text-destructive">*</span></Label>
              <DatePicker value={l.dataColheita} onChange={v => editar(idx, 'dataColheita', v)}
                disabled={somenteLeitura} className="mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">Verde (kg)</Label>
              <Input value={l.pesoVerdeKg} onChange={e => editar(idx, 'pesoVerdeKg', e.target.value)}
                inputMode="decimal" disabled={somenteLeitura}
                className="mt-0.5 h-8 text-right font-mono text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">{unidade.kgPorSaca ? 'Sacas' : '—'}</Label>
              <Input value={l.sacas} onChange={e => editar(idx, 'sacas', e.target.value)}
                inputMode="decimal"
                disabled={somenteLeitura || !unidade.kgPorSaca}
                title={unidade.kgPorSaca
                  ? `Calculado do verde (${unidade.kgPorSaca} kg por saca) — pode ser editado.`
                  : `${labelDaCultura(area.cultura)} não se mede em sacas.`}
                className="mt-0.5 h-8 text-right font-mono text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">Seco (kg)</Label>
              <Input value={l.pesoSecoKg} onChange={e => editar(idx, 'pesoSecoKg', e.target.value)}
                inputMode="decimal" disabled={somenteLeitura} placeholder="depois"
                title="A cooperativa devolve o seco dias depois — deixe em branco até ele chegar."
                className="mt-0.5 h-8 text-right font-mono text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">Roça (kg)</Label>
              <Input value={l.pesoRefugoKg} onChange={e => editar(idx, 'pesoRefugoKg', e.target.value)}
                inputMode="decimal" disabled={somenteLeitura}
                className="mt-0.5 h-8 text-right font-mono text-[12px]" />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={somenteLeitura} title="Remover este romaneio"
              onClick={() => setLinhas(prev => prev.filter((_, i) => i !== idx))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-2">
            <div>
              <Label className="text-[10px]">Destino</Label>
              <Select value={l.destino} onValueChange={v => editar(idx, 'destino', v)} disabled={somenteLeitura}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {DESTINOS.map(d => (
                    <SelectItem key={d.valor} value={d.valor} className="text-[12px]">{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Romaneio</Label>
              <Input value={l.romaneioRef} onChange={e => editar(idx, 'romaneioRef', e.target.value)}
                disabled={somenteLeitura} className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">Observações</Label>
              <Input value={l.observacoes} onChange={e => editar(idx, 'observacoes', e.target.value)}
                disabled={somenteLeitura} className="mt-0.5 h-8 text-[12px]" />
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
          disabled={somenteLeitura} onClick={() => setLinhas(prev => [...prev, romaneioVazio()])}>
          <Plus className="h-3 w-3" /> Adicionar romaneio
        </Button>
        <div className="flex-1" />
        {!sujo && !somenteLeitura && <span className="text-[10px] text-muted-foreground">sem alterações</span>}
        <Button size="sm" variant={sujo ? 'default' : 'outline'} className="h-7 gap-1 text-[11px]"
          disabled={somenteLeitura || salvando || !sujo} onClick={handleSalvar}>
          <Save className="h-3 w-3" /> {salvando ? 'Salvando…' : 'Salvar colheita'}
        </Button>
      </div>
    </div>
  );
}
