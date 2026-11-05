/**
 * CADERNO-CAMPO-01 peça 1 — o diálogo "Exportar mês": escolhe as folhas (D5: no diálogo, sem banco) e gera o PDF do caderno de campo
 * preenchido com o que está no sistema, do início do ano até o mês do Fechamento.
 * Os dados vêm dos MESMOS leitores das telas (sem segunda fonte): `useZootCategoriaMensal` (o rebanho do Fechamento), `useLancamentos`
 * (o ano), `usePastos` + `useMapaDoMes` (o mapa do mês), `useAreaDosPastosNoMes` (a área do mês) e `useChuvas`. O conteúdo só monta com o diálogo aberto: nada se lê antes.
 * Erro nunca vai a toast (UX-TOAST-01): a frase fica no diálogo.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { useLancamentos } from '@/hooks/useLancamentos';
import { usePastos } from '@/hooks/usePastos';
import { useMapaDoMes } from '@/hooks/useMapaDoMes';
import { useChuvas } from '@/hooks/useChuvas';
import { useAreaDosPastosNoMes } from '@/lib/pastos/areaDoPastoNoMes';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { FOLHAS_DO_CADERNO, MESES_CURTOS, cadernoDoMes, type FolhaDoCaderno } from '@/lib/caderno/cadernoDoMes';
import { gerarCadernoDoMes } from '@/lib/caderno/gerarCadernoDoMes';

interface Props { open: boolean; onOpenChange: (aberto: boolean) => void; ano: number; mes: number }

export function ExportarMesDialog({ open, onOpenChange, ano, mes }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]" data-testid="exportar-mes">
        <DialogHeader><DialogTitle className="text-[15px]">Exportar mês · caderno de campo</DialogTitle></DialogHeader>
        {open ? <Conteudo ano={ano} mes={mes} onFechar={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Conteudo({ ano, mes, onFechar }: { ano: number; mes: number; onFechar: () => void }) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const [folhas, setFolhas] = useState<FolhaDoCaderno[]>(FOLHAS_DO_CADERNO.map((f) => f.id));
  const [gerando, setGerando] = useState(false);
  const [frase, setFrase] = useState<string | null>(null);

  const rebanho = useZootCategoriaMensal({ ano, cenario: 'realizado' });
  const { lancamentos, loading: carregandoLanc } = useLancamentos({ cenario: 'realizado', ano });
  const { pastos, categorias, loading: carregandoPastos } = usePastos();
  const mapa = useMapaDoMes(fazendaAtual?.id, anoMes, pastos, categorias);
  const { chuvas, loading: carregandoChuvas } = useChuvas();
  const idsDaFazenda = useMemo(() => (fazendaAtual ? [fazendaAtual.id] : []), [fazendaAtual]);
  const area = useAreaDosPastosNoMes(idsDaFazenda, anoMes, anoMes);

  const carregando = rebanho.isLoading || carregandoLanc || carregandoPastos || mapa.carregando || carregandoChuvas || area.carregando;
  const erroLeitura = rebanho.error ? 'Não consegui ler o rebanho.' : mapa.erro;
  const motivo = !fazendaAtual ? 'Escolha uma fazenda (o caderno é de uma fazenda).'
    : carregando ? 'Lendo os dados do mês…'
      : erroLeitura ? `${erroLeitura} Feche e abra de novo.`
        : folhas.length === 0 ? 'Marque ao menos uma folha.' : null;

  const caderno = useMemo(() => {
    if (motivo || !fazendaAtual) return null;
    return cadernoDoMes({
      cliente: clienteAtual?.nome ?? '', fazenda: fazendaAtual.nome, ano, mes, geradoEm: ddmmaaaa(hojeLocal()), folhas,
      rebanho: (rebanho.data ?? []).filter((l) => l.fazenda_id === fazendaAtual.id), lancamentos,
      vigentes: mapa.vigentes, mapa: mapa.dados, categorias, chuvas, areaDe: area.areaDe,
    });
  }, [motivo, fazendaAtual, clienteAtual, ano, mes, folhas, rebanho.data, lancamentos, mapa.vigentes, mapa.dados, categorias, chuvas, area.areaDe]);

  const alternar = (id: FolhaDoCaderno, marcado: boolean) =>
    setFolhas((atual) => (marcado ? [...atual, id] : atual.filter((f) => f !== id)));

  const gerar = async () => {
    if (!caderno) return;
    setGerando(true); setFrase(null);
    const r = await gerarCadernoDoMes(caderno);
    setGerando(false);
    if (r.ok) onFechar(); else setFrase(r.frase ?? 'Falha ao gerar PDF.');
  };

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <p className="text-[12px] text-muted-foreground">
        {fazendaAtual?.nome ?? '—'} · do início de {ano} até {MESES_CURTOS[mes - 1].toLowerCase()}/{String(ano).slice(2)}, com o que está lançado no sistema.
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {FOLHAS_DO_CADERNO.map((f) => (
          <label key={f.id} className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={folhas.includes(f.id)} onCheckedChange={(v) => alternar(f.id, v === true)} />
            <span>{f.rotulo}</span>
          </label>
        ))}
      </div>
      {/* lugar reservado: o motivo, a falha ou nada — a altura não muda */}
      <p className={`h-[32px] text-[11px] leading-tight ${frase ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="exportar-mes-motivo">
        {frase ?? motivo ?? ''}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
        <Button size="sm" disabled={!caderno || gerando} title={motivo ?? undefined} onClick={gerar}>
          {gerando ? 'Gerando…' : 'Gerar PDF'}
        </Button>
      </div>
    </div>
  );
}
