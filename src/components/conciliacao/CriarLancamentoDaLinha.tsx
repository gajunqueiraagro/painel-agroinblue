import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';

/**
 * CriarLancamentoDaLinha — o movimento sem candidato deixa de ser beco sem saída.
 * FIN-CONCIL-CRIAR-DA-LINHA-01, portado de `use-criar-da-linha.ts` + ADR-0034 D5
 * do `AllinBlues/financas`.
 *
 * ⚠ AQUI É ATÔMICO, E LÁ NÃO É — a diferença é do banco, não do mérito. O
 * original declara em `use-criar-da-linha.ts:19-25` que cria e depois vincula em
 * DUAS chamadas, que entre elas cabe uma falha ("o lançamento existe e o vínculo
 * não"), e que atomizar "exigiria RPC nova — migration, ritual". Essa RPC já
 * existe deste lado: `fn_criar_lancamento_de_extrato` insere o lançamento E o
 * vínculo na MESMA transação, e recalcula o status do extrato no fim. Portar o
 * par de chamadas seria copiar uma limitação que não temos — e reabrir de mão
 * própria o bug histórico "criar-da-linha não vincula".
 *
 * ⚠ NÃO HÁ ARITMÉTICA NESTA TELA. O valor do lançamento e o do vínculo saem
 * ambos de `abs(valor do extrato)`, dentro da função. A tela mostra o número
 * para conferência e não o envia: mandar daqui abriria espaço para a tela
 * discordar do banco.
 *
 * ⚠ SÓ PARA MOVIMENTO INTOCADO, e é a RPC que decide: ela levanta
 * `extrato ja possui vinculo ativo` quando há vínculo. "Criar da diferença" num
 * movimento parcial — a segunda invenção do ADR-0034 lá — não existe por aqui, e
 * o botão nem aparece nesse caso, para não oferecer o que seria recusado.
 */
interface Props {
  movimento: MovimentoConciliacao;
  /** Conta do extrato — dá a fazenda por padrão, sem perguntar. */
  contaBancariaId: string | null;
  aoFechar: () => void;
  aoCriado: () => void | Promise<void>;
}

export function CriarLancamentoDaLinha({ movimento, contaBancariaId, aoFechar, aoCriado }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  /* ⚠ O SINAL DO EXTRATO DECIDE O TIPO, e a mesma regra roda dentro da RPC
     (`CASE WHEN v_ext.valor < 0 THEN '2-Saídas' ELSE '1-Entradas'`). Aqui ele
     serve só para pedir o subcentro certo — a classificação de entrada e a de
     saída são listas diferentes. */
  const tipoOp = movimento.valor < 0 ? '2-Saídas' : '1-Entradas';

  const fazendasQ = useQuery({
    queryKey: ['criar-linha-fazendas', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('fazendas').select('id,nome').eq('cliente_id', clienteId).order('nome');
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  /* ⚠ A FAZENDA VEM DA CONTA DO EXTRATO — medido: as 69 contas ativas do Proto
     têm `fazenda_id` preenchido, nenhuma nula. A RPC a exige, e perguntar o que
     o dado já sabe é trabalho que o operador não deveria ter. O seletor fica
     visível assim mesmo: ele mostra o que vai ser gravado, e deixa corrigir o
     caso raro em que a conta não descreve o destino. */
  const contaQ = useQuery({
    queryKey: ['criar-linha-conta', contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_contas_bancarias').select('fazenda_id').eq('id', contaBancariaId).maybeSingle();
      return (data ?? null) as { fazenda_id: string | null } | null;
    },
  });

  const subcentrosQ = useQuery({
    queryKey: ['criar-linha-subcentros', clienteId, tipoOp],
    enabled: !!clienteId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_plano_contas').select('subcentro')
        .eq('ativo', true).eq('tipo_operacao', tipoOp)
        .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`);
      const set = new Set<string>();
      for (const r of (data ?? []) as { subcentro: string | null }[]) if (r.subcentro) set.add(r.subcentro);
      return Array.from(set).sort();
    },
  });

  const fornecedoresQ = useQuery({
    queryKey: ['criar-linha-fornecedores', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_fornecedores').select('id,nome').eq('cliente_id', clienteId).order('nome');
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const [fazendaEscolhida, setFazendaEscolhida] = useState<string>('');
  const [subcentro, setSubcentro] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  /* ⚠ COMPETÊNCIA EDITÁVEL, DEFAULT NA DATA DO MOVIMENTO — regra do Gabriel.
     O pagamento é fato do banco e não se discute; a competência é o mês do FATO,
     e num abate ou venda ela não é a do recebimento. A RPC faz
     `COALESCE(p_data_competencia, data_movimento)`, então o default vale mesmo
     mandando nulo — enviamos o valor do campo para que o que está na tela seja o
     que vai ao banco. */
  const [competencia, setCompetencia] = useState(movimento.data_movimento.slice(0, 10));
  const [descricao, setDescricao] = useState(movimento.descricao ?? '');
  const [salvando, setSalvando] = useState(false);

  const fazendaId = fazendaEscolhida || contaQ.data?.fazenda_id || '';
  const carregandoContexto = contaQ.isPending && !!contaBancariaId;

  /* ⚠ UMA FRASE, TRÊS USOS — `disabled`, `title` e a dica do rodapé. */
  const impedimento: string | null = useMemo(() => {
    if (carregandoContexto) return 'Lendo a conta do movimento…';
    if (!fazendaId) return 'Escolha a fazenda — o lançamento pertence a uma.';
    if (!subcentro) return 'Escolha a classificação — é a única coisa que o extrato não sabe.';
    if (!competencia) return 'A competência não pode ficar vazia.';
    return null;
  }, [carregandoContexto, fazendaId, subcentro, competencia]);

  const criar = async () => {
    if (impedimento) return;
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_criar_lancamento_de_extrato', {
        p_extrato_id: movimento.id,
        p_fazenda_id: fazendaId,
        p_subcentro: subcentro,
        p_descricao: descricao.trim() || null,
        p_favorecido_id: favorecidoId || null,
        p_data_competencia: competencia,
      });
      /* A mensagem do Postgres nomeia o invariante violado — mês fechado, vínculo
         ativo, fazenda de outro cliente. Trocá-la por texto genérico tiraria do
         operador a única pista útil. */
      if (error) { toast.error(error.message ?? 'O banco recusou a criação.'); return; }
      toast.success('Lançamento criado e vinculado — o movimento fechou.');
      await aoCriado();
      aoFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="w-[94vw] max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">
            Criar lançamento deste movimento
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            O lançamento nasce do extrato, já pago e já vinculado. Você escolhe a classificação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
          {/* ⚠ O QUE O EXTRATO JÁ SABE — mostrado para conferência, não para
              digitar. Estes números não são enviados: a RPC os lê do próprio
              movimento, e mandá-los daqui abriria espaço para divergir. */}
          <div className="grid grid-cols-3 gap-x-3 rounded-md border bg-muted/30 px-3 py-2">
            <Campo rotulo="Data do movimento">{brData(movimento.data_movimento)}</Campo>
            <Campo rotulo="Valor">
              <span className={movimento.valor < 0 ? 'text-destructive' : 'text-success'}>
                {formatMoeda(movimento.valor)}
              </span>
            </Campo>
            <Campo rotulo="Tipo">{tipoOp === '2-Saídas' ? 'Saída' : 'Entrada'}</Campo>
          </div>

          <Linha rotulo="Fazenda">
            <Select value={fazendaId} onValueChange={setFazendaEscolhida}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {(fazendasQ.data ?? []).map(f => (
                  <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Linha>

          <Linha rotulo="Classificação">
            <Select value={subcentro} onValueChange={setSubcentro}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder={subcentrosQ.isPending ? 'Carregando…' : '—'} />
              </SelectTrigger>
              <SelectContent>
                {(subcentrosQ.data ?? []).map(s => (
                  <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Linha>

          <Linha rotulo="Competência">
            <Input type="date" value={competencia} onChange={e => setCompetencia(e.target.value)}
              className="h-7 text-[11px]"
              title="O mês do FATO. Nasce na data do movimento; numa venda ou abate recebido depois, é a data do fato que vale." />
          </Linha>

          <Linha rotulo="Descrição">
            <Input value={descricao} onChange={e => setDescricao(e.target.value)}
              className="h-7 text-[11px]" placeholder="a do extrato" />
          </Linha>

          <Linha rotulo="Favorecido">
            <Select value={favorecidoId} onValueChange={setFavorecidoId}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="— opcional —" /></SelectTrigger>
              <SelectContent>
                {(fornecedoresQ.data ?? []).map(f => (
                  <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Linha>

          <p className="text-[10px] leading-snug text-muted-foreground">
            Pagamento em <b>{brData(movimento.data_movimento)}</b>, status <b>realizado</b> — o dinheiro
            já saiu do banco. Criar e vincular acontecem na mesma transação: ou os dois, ou nenhum.
          </p>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-between">
          <span className="text-[10px] leading-snug text-muted-foreground">{impedimento ?? ''}</span>
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={aoFechar}>Cancelar</Button>
            <Button type="button" size="sm" className="gap-1.5"
              disabled={impedimento !== null || salvando}
              title={impedimento ?? undefined}
              onClick={() => { void criar(); }}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
              Criar e vincular
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <span className="text-[10px] font-medium text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="truncate text-[11px] font-medium tabular-nums text-foreground">{children}</p>
    </div>
  );
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
