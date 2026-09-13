/**
 * BARTER — Produção › Agricultura › Barter (PR-AGRI-BARTER-TELA-A).
 *
 * ⚠ ONDE MORA, E POR QUÊ: o grupo Produção já tem "Operações Comerciais" sob *Pecuária*; o
 * barter é a operação comercial da LAVOURA, e entra sob *Agricultura* pelo mesmo raciocínio.
 * Ele nasce da colheita — que mora em Produção › Lançar › Agricultura — e só termina no
 * financeiro, quando se materializa. Pendurá-lo no Financeiro poria a origem no lugar errado.
 * ⚠ ESTA É A FATIA A: lista, abertura e o cabeçalho do detalhe. As duas pernas (insumo
 * recebido e grão entregue) e a materialização são as fatias B, C e D — e os blocos vazios
 * dizem isso por escrito, em vez de fingirem que a tela está pronta.
 * ⚠ A CONTA DE PERMUTA NÃO SE PEDE NA TELA. A RPC cria ou reusa a do parceiro; perguntar por
 * ela abriria espaço para o operador escolher uma conta de banco — que é exatamente o que a
 * separação de permuta existe para impedir.
 */
import { useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowLeft, Handshake, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useBarterContratos, useFornecedoresDoCliente, type ContratoNaLista } from '@/hooks/useBarterContratos';

/** O visual de cada status — o mesmo vocabulário da Central de Operações. */
const TOM_STATUS: Record<string, string> = {
  aberto: 'bg-success/15 text-success',
  fechado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-destructive/10 text-destructive',
};

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const TH = 'sticky top-0 z-10 bg-primary px-1.5 py-1 text-[9px] font-semibold'
  + ' text-primary-foreground';

/** Um bloco que ainda não existe — e que diz qual fatia o trará. */
function AindaNao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-md border border-dashed p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{descricao}</p>
    </div>
  );
}

export function AgriBarterTab() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const { contratos, carregando, abrir } = useBarterContratos(clienteId);
  const fornecedores = useFornecedoresDoCliente(clienteId);

  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [parceiroId, setParceiroId] = useState('');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const contrato = useMemo(
    () => contratos.find(c => c.id === abertoId) ?? null, [contratos, abertoId]);

  const criar = async () => {
    if (!parceiroId) { toast.error('Escolha o parceiro do contrato.'); return; }
    if (!nome.trim()) { toast.error('Dê um nome ao contrato.'); return; }
    setSalvando(true);
    try {
      const r = await abrir(parceiroId, nome.trim(), fazendaAtual?.id ?? null, descricao.trim() || null);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível abrir o contrato.'); return; }
      /* ⚠ A MENSAGEM SEGUE `conta_criada`, que agora diz a verdade (AGRI-BARTER-03C): anunciar
         "conta criada" ao reusar a do parceiro faria o operador procurar uma segunda conta que
         não existe — e a trava do banco garante que ela não exista mesmo. */
      const parceiro = fornecedores.find(f => f.id === parceiroId)?.nome ?? 'parceiro';
      toast.success(r.abertura?.conta_criada
        ? `Contrato aberto. A conta "Permuta · ${parceiro}" foi criada.`
        : `Contrato aberto na conta de permuta que já existia com ${parceiro}.`);
      setNovoAberto(false);
      setParceiroId(''); setNome(''); setDescricao('');
      if (r.abertura?.contrato_id) setAbertoId(r.abertura.contrato_id);
    } finally {
      setSalvando(false);
    }
  };

  /* ── O DETALHE ── */
  if (contrato) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-2 p-4 animate-fade-in">
        <div className="flex shrink-0 items-start gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Voltar aos contratos"
            onClick={() => setAbertoId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight text-foreground">{contrato.nome}</h2>
            <p className="text-xs text-muted-foreground">
              {contrato.parceiroNome} · aberto em {dataBR(contrato.data_abertura)}
            </p>
          </div>
          <div className="flex-1" />
          <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', TOM_STATUS[contrato.status] ?? 'bg-muted')}>
            {contrato.status}
          </span>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-1.5 md:grid-cols-4">
          <Metrica rotulo="Parceiro" valor={contrato.parceiroNome} />
          {/* ⚠ O NOME DA CONTA, NUNCA O ID: sem UUID na tela, e o nome já é único por parceiro
              (índice `uq_conta_permuta_por_parceiro`). */}
          <Metrica rotulo="Conta de permuta" valor={contrato.contaPermutaNome ?? '—'} />
          <Metrica rotulo="Recebido / Entregue" valor="—" nota="fatias B e C" />
          {/* ⚠ ZERO AQUI É A VERDADE, não um placeholder: sem perna lançada, o saldo do
              contrato é zero mesmo. O que falta é lançar, e os blocos abaixo dizem isso. */}
          <Metrica rotulo="Saldo" valor={formatMoeda(0)} nota="entregue − recebido" destaque />
        </div>

        <div className="grid min-h-0 flex-1 gap-2 md:grid-cols-2">
          <AindaNao titulo="Recebi (insumos)"
            descricao="Os insumos que a cooperativa entregou, cada um com a sua safra e o plano de contas do custo. Entra na fatia B." />
          <AindaNao titulo="Entreguei (grão)"
            descricao="A venda do grão, ligada às cargas da colheita por classe de aflatoxina e preço por saca. Entra na fatia C." />
        </div>
        <AindaNao titulo="Materializar"
          descricao="Gerar os lançamentos no DRE — receita da venda e custo do insumo, na conta de permuta, sem tocar no caixa — e o estorno que desfaz. Entra na fatia D." />
      </div>
    );
  }

  /* ── A LISTA ── */
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 p-4 animate-fade-in">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Barter</h2>
          <p className="text-xs text-muted-foreground">{clienteAtual?.nome ?? '—'}</p>
        </div>
        <Button size="sm" className="h-8 gap-1 text-[11px]" onClick={() => setNovoAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Novo contrato
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
          <colgroup>
            {['26%', '30%', '16%', '14%', '14%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {['Parceiro', 'Contrato', 'Conta de permuta', 'Abertura', 'Status'].map(h => (
                <th key={h} className={cn(TH, 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!carregando && contratos.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                <Handshake className="mx-auto mb-1 h-5 w-5 opacity-40" />
                Nenhum contrato de barter. O primeiro cria a conta de permuta do parceiro.
              </td></tr>
            )}
            {contratos.map((c: ContratoNaLista) => (
              <tr key={c.id}
                className="cursor-pointer border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03] hover:bg-[#1e3a5f]/[0.06]"
                title="Abrir o contrato" onClick={() => setAbertoId(c.id)}>
                <td className="truncate px-1.5 py-0.5" title={c.parceiroNome}>{c.parceiroNome}</td>
                <td className="truncate px-1.5 py-0.5" title={c.nome}>{c.nome}</td>
                <td className="truncate px-1.5 py-0.5 text-muted-foreground" title={c.contaPermutaNome ?? undefined}>
                  {c.contaPermutaNome ?? '—'}
                </td>
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{dataBR(c.data_abertura)}</td>
                <td className="px-1.5 py-0.5">
                  <span className={cn('rounded px-1 py-0.5 text-[9px] font-medium',
                    TOM_STATUS[c.status] ?? 'bg-muted')}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── NOVO CONTRATO ── */}
      <Dialog open={novoAberto} onOpenChange={o => { if (!o) setNovoAberto(false); }}>
        <DialogContent className="max-w-md gap-0 p-0 [&>button.absolute]:hidden">
          <div className="bg-primary px-4 py-2.5 text-primary-foreground">
            <h2 className="text-[15px] font-bold leading-tight">Novo contrato de barter</h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              A conta de permuta do parceiro nasce junto, se ainda não existir.
            </p>
          </div>
          <div className="space-y-2 p-4">
            <div>
              <Label className="text-[10px]">Parceiro <span className="text-destructive">*</span></Label>
              <Select value={parceiroId} onValueChange={setParceiroId}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                  <SelectValue placeholder="Escolha o fornecedor parceiro" />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Nome do contrato <span className="text-destructive">*</span></Label>
              <Input value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Barter Amendoim 25/26" className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">Descrição</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)}
                className="mt-0.5 h-8 text-[12px]" />
            </div>
            {/* ⚠ A SAFRA NÃO SE PEDE AQUI, e é decisão de modelo: ela vive em CADA PERNA, porque
                o barter atravessa safras — o insumo entra numa e o grão sai na seguinte. */}
            <p className="text-[10px] leading-snug text-muted-foreground">
              A safra não entra no contrato: cada perna tem a sua, porque o insumo costuma entrar
              numa safra e o grão sair na seguinte.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 bg-primary px-4 py-2">
            <Button variant="ghost" className="text-primary-foreground/90 hover:bg-white/10 hover:text-white"
              onClick={() => setNovoAberto(false)}>Fechar</Button>
            <Button className="gap-1 bg-white text-primary hover:bg-white/90"
              disabled={salvando} onClick={() => { void criar(); }}>
              <Save className="h-4 w-4" /> {salvando ? 'Abrindo…' : 'Abrir contrato'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metrica({ rotulo, valor, nota, destaque }: {
  rotulo: string; valor: string; nota?: string; destaque?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={cn('mt-0.5 truncate leading-none',
        destaque ? 'text-[16px] font-medium tabular-nums' : 'text-[12px]')}>{valor}</div>
      {nota && <div className="mt-0.5 text-[9px] text-muted-foreground">{nota}</div>}
    </div>
  );
}
