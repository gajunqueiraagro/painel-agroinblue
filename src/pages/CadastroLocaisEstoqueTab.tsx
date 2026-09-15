/**
 * CADASTROS › LOCAIS DE ESTOQUE — onde o grão fica (EL-01).
 *
 * ⚠ PRIMEIRA PEÇA DO "ONDE ESTÁ O GRÃO". Até aqui o sistema sabia QUANTO havia e de que classe,
 * nunca ONDE: a colheita guardava a filial da cooperativa em TEXTO LIVRE (`agri_colheita.filial`),
 * e texto livre não casa com nada. Este cadastro é o destino daquele texto — o EL-02 faz a troca.
 *
 * ⚠ A LISTA É A18, não `<table>`: nome, tipo, vínculo e ação são quatro larguras disputando a
 * mesma linha, e a disputa piora conforme a tela estreita. As telas irmãs de Cadastros usam
 * `<Table>`; segui o A18 porque o briefing o pede e porque é o idioma das telas de grão.
 */
import { useState, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Plus, Pencil, AlertTriangle, Loader2, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaisEstoque, type LocalEstoque } from '@/hooks/useEstoqueGraos';
import { rotuloTipoLocal, rotuloQuebraTecnica } from '@/lib/agri/locaisEstoque';
import {
  LocalEstoqueModal, type LocalPayload, type ContratoPayload,
} from '@/components/agri/LocalEstoqueModal';

export function CadastroLocaisEstoqueTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendas } = useFazenda();
  const queryClient = useQueryClient();

  const { locais, carregando, erro } = useLocaisEstoque(clienteId);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<LocalEstoque | null>(null);
  const [salvando, setSalvando] = useState(false);

  const topo = useMemo(() => {
    const ativos = locais.filter(l => l.ativo);
    return {
      ativos: ativos.length,
      proprios: ativos.filter(l => l.tipo === 'proprio').length,
      terceiros: ativos.filter(l => l.tipo === 'terceiro').length,
    };
  }, [locais]);

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ['locais-estoque'] });

  const salvarLocal = async (p: LocalPayload) => {
    if (!clienteId) return;
    setSalvando(true);
    try {
      const { data, error } = await (supabase as any).rpc('agri_local_estoque_salvar', {
        p_cliente: clienteId, p_id: p.id, p_nome: p.nome, p_tipo: p.tipo,
        p_fazenda_id: p.fazenda_id, p_fornecedor_id: p.fornecedor_id,
        p_codigo_externo: p.codigo_externo, p_aliases: p.aliases,
        p_observacoes: p.observacoes, p_ativo: p.ativo,
      });
      if (error) {
        /* ⚠ O UNIQUE VIRA FRASE, não código: o banco devolve "duplicate key value violates unique
           constraint agri_locais_estoque_nome_uk", que não é para o operador ler. O resto da
           mensagem vai crua, porque as outras são nomeadas e legíveis. */
        const msg = /agri_locais_estoque_nome_uk/.test(error.message ?? '')
          ? 'Já existe um local com esse nome.'
          : (error.message ?? 'Não foi possível salvar o local.');
        toast.error(msg);
        return;
      }
      await recarregar();
      /* ⚠ NOVO TERCEIRO REABRE EM EDIÇÃO, e não é conveniência: o contrato de armazenagem precisa
         do `local_id` que só existe depois de gravar, e é a aba que o briefing pede logo em
         seguida. Fechar aqui obrigaria o operador a procurar o que acabou de criar. */
      if (!p.id && p.tipo === 'terceiro') {
        const novoId = typeof data === 'string' ? data : null;
        const lista = await queryClient.fetchQuery<LocalEstoque[]>({ queryKey: ['locais-estoque', clienteId] });
        const novo = lista?.find(l => l.id === novoId) ?? null;
        if (novo) { setEditando(novo); toast.success('Local criado — agora o contrato.'); return; }
      }
      toast.success(p.id ? 'Local atualizado.' : 'Local criado.');
      setModalAberto(false);
      setEditando(null);
    } finally {
      setSalvando(false);
    }
  };

  const salvarContrato = async (p: ContratoPayload) => {
    if (!clienteId) return;
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc('agri_contrato_armazenagem_salvar', {
        p_cliente: clienteId, p_id: p.id, p_local_id: p.local_id,
        p_vigencia_inicio: p.vigencia_inicio, p_vigencia_fim: p.vigencia_fim,
        p_quebra_tecnica_tipo: p.quebra_tecnica_tipo, p_quebra_tecnica_pct: p.quebra_tecnica_pct,
        p_quebra_tecnica_base: p.quebra_tecnica_base, p_taxa_valor: p.taxa_valor,
        p_taxa_unidade: p.taxa_unidade, p_documento_ref: p.documento_ref,
        p_observacoes: p.observacoes,
      });
      if (error) { toast.error(error.message ?? 'Não foi possível salvar o contrato.'); return; }
      toast.success('Contrato de armazenagem salvo.');
      await recarregar();
      setModalAberto(false);
      setEditando(null);
    } finally {
      setSalvando(false);
    }
  };

  /**
   * A LINHA 2 DE CADA LOCAL — o contexto, que muda com o tipo.
   *
   * ⚠ PRÓPRIO É A FAZENDA, TERCEIRO É QUEM GUARDA. São perguntas diferentes: no galpão da fazenda
   * o que importa é qual fazenda; na cooperativa, quem é a cooperativa, qual filial e sob que
   * regra de quebra o grão está lá.
   * ⚠ "sem contrato" NÃO É "sem quebra técnica" — ver `rotuloQuebraTecnica`.
   */
  const contexto = (l: LocalEstoque) => (l.tipo === 'proprio'
    ? (l.fazenda_nome || '—')
    : [l.fornecedor_nome || '—',
       l.codigo_externo ? `filial ${l.codigo_externo}` : null,
       `quebra técnica ${rotuloQuebraTecnica(l.contrato)}`,
      ].filter(Boolean).join(' · '));

  return (
    <div className="w-full space-y-2 p-3 animate-fade-in">
      <PageHeader titulo="Locais de estoque"
        subtitulo="Onde o grão fica: galpão próprio ou cooperativa e armazém de terceiro." />

      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* ⚠ O BLOCO DE TOPO É O A18 das outras telas de grão — dois números, `bg-muted/20`. */}
        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 px-3.5 py-[11px]">
          <div className="min-w-0">
            <div className="text-[11px] font-normal leading-none text-muted-foreground">Locais ativos</div>
            <div className="mt-1 truncate text-[20px] font-medium leading-none tabular-nums">{topo.ativos}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-normal leading-none text-muted-foreground">Próprios · Terceiros</div>
            <div className="mt-1 truncate text-[20px] font-medium leading-none tabular-nums">
              {topo.proprios} · {topo.terceiros}
            </div>
          </div>
        </div>
        {/* ⚠ `outline`, NÃO `acao`: o token `--acao` é do botão que GRAVA (index.css o diz), e este
            só abre um modal. O que grava é o "Salvar" lá dentro. */}
        <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
          onClick={() => { setEditando(null); setModalAberto(true); }}>
          <Plus className="h-3.5 w-3.5" /> Novo local
        </Button>
      </div>

      <div className="min-w-0 overflow-hidden rounded-md border">
        {/* ⚠ OS TRÊS ESTADOS SEPARADOS: uma falha de leitura renderizada como "nenhum local"
            mandaria o operador cadastrar de novo o que já existe. */}
        {erro ? (
          <div className="px-2 py-6 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Não foi possível carregar os locais.
            </span>
            <div className="mt-1 text-[10px] text-muted-foreground" title={erro.message}>
              A lista não foi lida — o dado continua no banco.
            </div>
          </div>
        ) : carregando ? (
          <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
            </span>
          </div>
        ) : locais.length === 0 ? (
          <div className="px-2 py-6 text-center text-[10px] text-muted-foreground">
            <Warehouse className="mx-auto mb-1 h-5 w-5 opacity-40" />
            Nenhum local cadastrado. O grão precisa de um lugar para existir.
          </div>
        ) : locais.map(l => (
          <div key={l.id} className={cn('flex items-start gap-2 border-t border-slate-100 px-2 py-1.5 first:border-t-0',
            !l.ativo && 'bg-muted/30 text-muted-foreground line-through')}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium" title={l.nome}>{l.nome}</div>
              <div className="truncate text-[10px] text-muted-foreground" title={contexto(l)}>
                {contexto(l)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-[11px] no-underline">
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium no-underline',
                !l.ativo ? 'bg-muted text-muted-foreground'
                  : l.tipo === 'proprio' ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary')}>
                {l.ativo ? rotuloTipoLocal(l.tipo) : 'Inativo'}
              </span>
              <button type="button" onClick={() => { setEditando(l); setModalAberto(true); }}
                title="Editar local" aria-label="Editar local"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <LocalEstoqueModal
        aberto={modalAberto}
        onFechar={() => { setModalAberto(false); setEditando(null); }}
        local={editando}
        clienteId={clienteId ?? ''}
        fazendas={fazendas}
        onSalvarLocal={p => { void salvarLocal(p); }}
        onSalvarContrato={p => { void salvarContrato(p); }}
        salvando={salvando}
      />
    </div>
  );
}
