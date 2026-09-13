/**
 * O INSUMO RECEBIDO NO BARTER — PR-AGRI-BARTER-TELA-B.
 *
 * ⚠ O SELETOR DE PLANO É O `PlanoSubcentroSelect`, a fonte única da casa (extraída do
 * `LancamentoV2Dialog` no PR-U2c-1D e usada por dez telas). Ele trabalha com o SUBCENTRO em
 * texto e devolve a linha inteira do plano no `onSelected` — e é dela que sai o
 * `plano_conta_id`, que é o que `agri_oc_insumos` guarda.
 * ⚠ `escopoNegocio='agricultura'` E `tipoOperacao='2-Saídas'`: o plano passou de 137 para 206
 * subcentros, e sem o pré-filtro "semente" devolveria pecuária junto. O insumo do barter é
 * sempre custo — nunca entrada.
 * ⚠ A SAFRA É DO INSUMO, e o form diz isso por escrito: ela costuma ser DIFERENTE da do grão,
 * porque o barter atravessa safras. É a razão de o contrato não ter safra.
 */
import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { InsumoPayload, BarterInsumo } from '@/hooks/useBarterInsumos';

/** Foco fino, como no modal de carga: o halo de 4px do padrão domina formulário denso. */
const FOCO = 'focus-visible:ring-1 focus-visible:ring-offset-0';

export function BarterInsumoModal({
  aberto, insumo, safras, classificacoes, salvando, onFechar, onSalvar,
}: {
  aberto: boolean;
  /** `null` = novo; preenchido = edição. */
  insumo: BarterInsumo | null;
  safras: ReadonlyArray<{ id: string; nome: string; codigo: string | null }>;
  classificacoes: ClassificacaoItem[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (payload: InsumoPayload) => void;
}) {
  const [produto, setProduto] = useState('');
  const [nf, setNf] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [safraId, setSafraId] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  /* Abrir carrega o que está gravado; fechar não limpa (o modal desmonta). */
  useEffect(() => {
    if (!aberto) return;
    setProduto(insumo?.produto ?? '');
    setNf(insumo?.nf_numero ?? '');
    setQuantidade(insumo?.quantidade != null ? String(insumo.quantidade).replace('.', ',') : '');
    setUnidade(insumo?.unidade ?? '');
    setValor(insumo?.valor ?? null);
    setSafraId(insumo?.safra_id ?? '');
    setPlanoId(insumo?.plano_conta_id ?? null);
    /* ⚠ O SUBCENTRO VEM DO PLANO, por busca reversa: a tabela guarda o id, e o seletor mostra
       texto. Sem isto, reabrir um insumo exibiria o campo vazio com o plano gravado. */
    setSubcentro(classificacoes.find(c => c.id === insumo?.plano_conta_id)?.subcentro ?? '');
    setBusca('');
  }, [aberto, insumo, classificacoes]);

  const gravar = () => {
    onSalvar({
      produto: produto.trim(),
      nf_numero: nf.trim() || null,
      quantidade: quantidade.trim() ? parseMoeda(quantidade) : null,
      unidade: unidade.trim() || null,
      valor: valor ?? 0,
      safra_id: safraId || null,
      plano_conta_id: planoId,
      observacoes: null,
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        className="max-w-lg gap-0 overflow-visible p-0 [&>button.absolute]:hidden">
        <div className="bg-primary px-4 py-2.5 text-primary-foreground">
          <h2 className="text-[15px] font-bold leading-tight">
            {insumo ? 'Editar insumo recebido' : 'Insumo recebido'}
          </h2>
          <p className="mt-0.5 text-[11px] text-primary-foreground/80">
            O que a cooperativa entregou — a perna de custo do barter.
          </p>
        </div>

        <div className="space-y-2 p-4">
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <div>
              <Label className="text-[10px]">Produto <span className="text-destructive">*</span></Label>
              <Input value={produto} onChange={e => setProduto(e.target.value)}
                placeholder="Semente OL3" className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
            </div>
            <div>
              <Label className="text-[10px]">NF</Label>
              <Input value={nf} onChange={e => setNf(e.target.value)}
                className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_0.8fr_1.4fr] gap-2">
            <div>
              <Label className="text-[10px]">Quantidade</Label>
              <Input value={quantidade} onChange={e => setQuantidade(e.target.value)}
                inputMode="decimal" className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
            </div>
            <div>
              <Label className="text-[10px]">Unidade</Label>
              <Input value={unidade} onChange={e => setUnidade(e.target.value)}
                placeholder="sc, kg, L" className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
            </div>
            <div>
              <Label className="text-[10px]">Valor <span className="text-destructive">*</span></Label>
              <CampoMoeda valor={valor} onChange={setValor}
                className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
            </div>
          </div>

          <div>
            <Label className="text-[10px]">Safra do insumo <span className="text-destructive">*</span></Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                <SelectValue placeholder="Em que safra este insumo entra" />
              </SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* ⚠ A FRASE FICA, e não é redundância: o operador que acabou de abrir um contrato
                para o amendoim 25/26 vai estranhar escolher 26/27 aqui — e está certo escolher. */}
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              Pode ser diferente da safra do grão: o insumo costuma entrar numa safra e o grão
              sair na seguinte. É por isso que o contrato não tem safra.
            </p>
          </div>

          <div>
            <PlanoSubcentroSelect
              label="Conta do custo"
              value={subcentro}
              onChange={setSubcentro}
              onSelected={(sub, cls) => { setSubcentro(sub); setPlanoId(cls?.id ?? null); }}
              classificacoes={classificacoes}
              tipoOperacao="2-Saídas"
              escopoNegocio="agricultura"
              search={busca}
              onSearchChange={setBusca}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 bg-primary px-4 py-2">
          <Button variant="ghost" className="text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            onClick={onFechar}>Fechar</Button>
          <Button className="gap-1 bg-white text-primary hover:bg-white/90"
            disabled={salvando} onClick={gravar}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar insumo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
