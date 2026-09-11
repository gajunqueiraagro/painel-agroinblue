import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  codigoDaSafra, nomeDaSafra, temporadaDeReferencia, temporadasDisponiveis,
  periodoDaTemporada, codigoSafraPerene, nomeSafraPerene, type CicloSafra,
} from '@/lib/agri/culturas';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Pencil, MoreHorizontal, Power, PowerOff, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  escopoLabel,
  ordenarSafras,
  validarSafra,
  buildEmUsoSet,
  mapErroSalvarSafra,
  ESCOPO_AJUDA,
  type FinanceiroSafra,
  type EscopoNegocio,
} from '@/lib/financeiro/safrasHelpers';

/* Colunas soberanas lidas de financeiro_safras. Cast único e localizado no query builder —
   resultado convertido imediatamente para o tipo local FinanceiroSafra. Mesmo idioma de
   useFinanceiroV2.ts.
   ⚠ O COMENTÁRIO ANTIGO DIZIA QUE `types.ts` NÃO CONHECIA A TABELA, e isso envelheceu: a
   regeneração de 02/09 trouxe `financeiro_safras` (types.ts:6331). O que ele ainda não
   conhece são as TRÊS COLUNAS do AGRI-01 — `ciclo`, `data_inicio`, `data_fim` —, porque a
   migration é posterior ao regen. O cast continua sendo o mesmo de sempre, então nada de
   novo entra aqui por causa disto; o dia do próximo regen é o dia de tirá-lo. */
const SAFRA_COLS = 'id, cliente_id, nome, codigo, escopo_negocio, ordem_exibicao, descricao, observacoes, ativa, ciclo, data_inicio, data_fim';

export function FinV2SafrasTab() {
  const { clienteAtual } = useCliente();
  const [safras, setSafras] = useState<FinanceiroSafra[]>([]);
  const [emUso, setEmUso] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceiroSafra | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  // Confirmações de ativar/inativar (sem Excluir neste PR).
  const [confirmDesativar, setConfirmDesativar] = useState<FinanceiroSafra | null>(null);
  const [confirmAtivar, setConfirmAtivar] = useState<FinanceiroSafra | null>(null);

  // Campos do formulário.
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [escopo, setEscopo] = useState<EscopoNegocio | ''>('');
  const [ordemRaw, setOrdemRaw] = useState('');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [ativa, setAtiva] = useState(true);
  /* ⚠ A CULTURA SAIU DAQUI — AGRI-CADASTRO-SAFRA-01. Ela era um campo da safra e virou
     atributo da ÁREA PLANTADA (frente AGRI-03-AREA): amendoim e mandioca na mesma temporada
     são dois talhões, não duas safras. O estado `cultura` foi removido junto com o campo; o
     mapa `CULTURAS` continua na lib, que é quem lê o sufixo das safras antigas.
     ⚠ A TEMPORADA CONTINUA SENDO DA TELA, não coluna: ela gera o código e, agora, o PADRÃO
     das datas — que são colunas de verdade desde o AGRI-01. */
  const [temporada, setTemporada] = useState(() => temporadaDeReferencia(new Date()));
  /* ⚠ O CICLO É COLUNA, COM DEFAULT 'anual' NO BANCO — e o default aqui é o mesmo de lá, de
     propósito: a tela não pode discordar do que a linha nasce sendo quando alguém insere por
     fora. */
  const [ciclo, setCiclo] = useState<CicloSafra>('anual');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [maisAberto, setMaisAberto] = useState(false);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    setLoadError(false);
    // Cast localizado (financeiro_safras ausente de types.ts).
    const db = supabase as any;
    // Consulta 1: Safras do cliente (campos explícitos, sem '*').
    // Consulta 2: safra_id em uso (uma única query, apenas a coluna UUID, sem N+1).
    const [safrasRes, usoRes] = await Promise.all([
      db.from('financeiro_safras').select(SAFRA_COLS).eq('cliente_id', clienteAtual.id),
      db.from('financeiro_lancamentos_v2').select('safra_id')
        .eq('cliente_id', clienteAtual.id)
        .not('safra_id', 'is', null),
    ]);

    if (safrasRes.error || usoRes.error) {
      // Não inventar "Não" para todos: sinaliza erro e permite recarregar.
      setSafras([]);
      setEmUso(new Set());
      setLoadError(true);
      setLoading(false);
      return;
    }

    setSafras((safrasRes.data as FinanceiroSafra[]) || []);
    setEmUso(buildEmUsoSet(usoRes.data as Array<{ safra_id: string | null }>));
    setLoading(false);
  }, [clienteAtual?.id]);

  // Troca de cliente ativo: limpar todo estado stale ANTES da nova carga —
  // fechar modais do cliente anterior, limpar edição, Set de uso e lista;
  // impede salvamento com estado de outro tenant. A carga real vem do effect de load().
  useEffect(() => {
    setDialogOpen(false);
    setEditing(null);
    setConfirmDesativar(null);
    setConfirmAtivar(null);
    setSafras([]);
    setEmUso(new Set());
    setMostrarInativas(false);
  }, [clienteAtual?.id]);

  useEffect(() => { load(); }, [load]);

  const safrasFiltradas = useMemo(() => {
    const base = mostrarInativas ? safras : safras.filter(s => s.ativa);
    return ordenarSafras(base);
  }, [safras, mostrarInativas]);

  const totalInativas = useMemo(() => safras.filter(s => !s.ativa).length, [safras]);

  /* O código e o nome são DERIVADOS enquanto ninguém os edita à mão.
     ⚠ O CÓDIGO É TRAVADO E O NOME NÃO. O código é chave (`cliente_id, codigo` é UNIQUE) e
     alimenta o backfill futuro da coluna `cultura`: deixá-lo livre é convidar `25/26 AMD`,
     `2025/26-Amd` e três formatos para a mesma safra. O nome é rótulo humano e às vezes
     precisa de um apelido ("Safra 25/26 Amendoim — Pureza"), então só se sugere.
     ⚠ NA EDIÇÃO NÃO SE REESCREVE O NOME: quem já batizou a safra não perde o nome porque
     abriu o modal para mudar a ordem de exibição. */
  /* ⚠ DOIS GERADORES, UM POR CICLO. O anual sai da temporada (`25/26-Lav`); o perene sai das
     DATAS (`20/27-Lav`), porque perene não tem temporada — o que o identifica é o intervalo
     entre o plantio e o corte previsto. */
  const codigoGerado = ciclo === 'perene'
    ? codigoSafraPerene(dataInicio || null, dataFim || null, escopo)
    : codigoDaSafra(temporada, escopo);
  const nomeGerado = ciclo === 'perene'
    ? nomeSafraPerene(dataInicio || null, dataFim || null)
    : nomeDaSafra(temporada, escopo);
  useEffect(() => {
    if (editing) return;
    setCodigo(codigoGerado);
    setNome(nomeGerado);
  }, [editing, codigoGerado, nomeGerado]);

  /**
   * A TEMPORADA PREENCHE AS DATAS — e só preenche, nunca manda.
   *
   * ⚠ É GESTO, NÃO EFEITO. Escolher 25/26 escreve 01/07/2025 e 30/06/2026 nos dois campos;
   * daí em diante eles são do operador. Um `useEffect` sobre `[temporada, dataInicio]`
   * desfaria a edição manual no render seguinte — e um sobre `[temporada]` ainda dispararia
   * ao ABRIR a edição de uma safra antiga, apagando as datas do backfill com a convenção.
   * ⚠ VOLTAR PARA ANUAL TAMBÉM PREENCHE: quem estava em perene com datas de eucalipto e
   * troca o ciclo espera o padrão da temporada de volta, não os anos de lá.
   */
  const aplicarPeriodoDaTemporada = (t: string) => {
    const p = periodoDaTemporada(t);
    if (!p) return;
    setDataInicio(p.inicio);
    setDataFim(p.fim);
  };
  const escolherTemporada = (t: string) => {
    setTemporada(t);
    if (ciclo === 'anual') aplicarPeriodoDaTemporada(t);
  };
  /**
   * ⚠ TROCAR PARA PERENE LIMPA AS DATAS, e isso é deliberado: as de julho–junho vieram de uma
   * convenção que o perene não segue, e deixá-las ali faria o operador salvar um eucalipto
   * com um ano de vida por distração. Campo vazio pede a digitação que o ciclo exige.
   */
  const trocarCiclo = (c: CicloSafra) => {
    setCiclo(c);
    if (c === 'perene') { setDataInicio(''); setDataFim(''); return; }
    aplicarPeriodoDaTemporada(temporada);
  };

  /* ⚠ A SAFRA JÁ EXISTENTE NÃO É ERRO A DESCOBRIR NO SALVAR. `cliente_id + codigo` é
     UNIQUE; sem este aviso, o operador preenche tudo e leva um erro de banco no fim.
     ⚠ E TAMBÉM SE ESTIVER INATIVA — é o caso mais comum: a safra do ano passado foi
     inativada e agora se quer a nova. Reativar é diferente de criar duplicada. */
  /** O que impede o Criar, em uma frase — a mesma que o botão mostra ao lado. */
  const motivoBloqueio = editing ? null
    : !escopo ? 'Escolha o escopo.'
    : !codigo ? 'Informe o plantio e o corte previsto.'
    : null;

  const safraExistente = !editing && codigoGerado
    ? safras.find(x => (x.codigo ?? '') === codigoGerado) ?? null
    : null;

  const openNew = () => {
    setEditing(null);
    setNome('');
    setCodigo('');
    setEscopo('');
    const t = temporadaDeReferencia(new Date());
    setTemporada(t);
    setCiclo('anual');
    const p = periodoDaTemporada(t);
    setDataInicio(p?.inicio ?? '');
    setDataFim(p?.fim ?? '');
    setMaisAberto(false);
    setOrdemRaw('');
    setDescricao('');
    setObservacoes('');
    setAtiva(true);
    setDialogOpen(true);
  };

  const openEdit = (s: FinanceiroSafra) => {
    setEditing(s);
    setNome(s.nome ?? '');
    setCodigo(s.codigo ?? '');
    // Escopo legado NULL inicia sem seleção; salvamento exige escolha.
    setEscopo(s.escopo_negocio ?? '');
    /* ⚠ NA EDIÇÃO, TEMPORADA E CULTURA SAEM DO CÓDIGO GRAVADO, que é onde elas moram.
       Sem isto o modal abriria com a temporada de hoje sobre uma safra de 2021, e o código
       — que continua travado — passaria a discordar dos campos que o geraram. */
    const m = /^(\d{2}\/\d{2})-(.+)$/.exec(s.codigo ?? '');
    setTemporada(m ? m[1] : temporadaDeReferencia(new Date()));
    /* ⚠ AS DATAS VÊM DO BANCO COMO ESTÃO, inclusive vazias. Safra anterior ao backfill abre
       com os campos em branco — que é a verdade — em vez de receber a convenção julho–junho
       por cima de um período que ninguém conferiu. */
    setCiclo(s.ciclo === 'perene' ? 'perene' : 'anual');
    setDataInicio(s.data_inicio ?? '');
    setDataFim(s.data_fim ?? '');
    setMaisAberto(false);
    setOrdemRaw(String(s.ordem_exibicao)); // integer real (distingue 0 explícito)
    setDescricao(s.descricao ?? '');
    setObservacoes(s.observacoes ?? '');
    setAtiva(s.ativa);
    setDialogOpen(true);
  };

  const save = async () => {
    if (isSaving) return;
    if (!clienteAtual?.id) return;
    const v = validarSafra({
      nome, codigo, escopo_negocio: escopo, ordemRaw, descricao, observacoes, ativa,
      ciclo, dataInicio, dataFim,
    });
    if (!v.ok) { toast.error(v.erro); return; }

    setIsSaving(true);
    try {
      const db = supabase as any;
      if (editing) {
        // UPDATE restrito por id + cliente_id ativo; cliente_id nunca no payload.
        const { data, error } = await db.from('financeiro_safras')
          .update(v.payload)
          .eq('id', editing.id)
          .eq('cliente_id', clienteAtual.id)
          .select('id');
        if (error) { toast.error(mapErroSalvarSafra(error) ?? 'Erro ao salvar a Safra.'); return; }
        // Sem evidência de linha afetada → não mostrar sucesso falso; manter modal aberto.
        if (!data || data.length === 0) { toast.error('Não foi possível salvar: Safra não encontrada para este cliente.'); return; }
        toast.success('Safra atualizada');
      } else {
        // INSERT: cliente_id somente aqui, vindo de clienteAtual.id.
        const { data, error } = await db.from('financeiro_safras')
          .insert({ cliente_id: clienteAtual.id, ...v.payload })
          .select('id');
        if (error) { toast.error(mapErroSalvarSafra(error) ?? 'Erro ao salvar a Safra.'); return; }
        if (!data || data.length === 0) { toast.error('Não foi possível criar a Safra.'); return; }
        toast.success('Safra criada');
      }
      setDialogOpen(false);
      setEditing(null);
      load();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDesativar = async () => {
    if (!confirmDesativar || !clienteAtual?.id) return;
    const db = supabase as any;
    const { data, error } = await db.from('financeiro_safras')
      .update({ ativa: false })
      .eq('id', confirmDesativar.id)
      .eq('cliente_id', clienteAtual.id)
      .select('id');
    if (error || !data || data.length === 0) { toast.error('Erro ao inativar a Safra'); }
    else { toast.success('Safra inativada'); }
    setConfirmDesativar(null);
    load();
  };

  const handleAtivar = async () => {
    if (!confirmAtivar || !clienteAtual?.id) return;
    const db = supabase as any;
    const { data, error } = await db.from('financeiro_safras')
      .update({ ativa: true })
      .eq('id', confirmAtivar.id)
      .eq('cliente_id', clienteAtual.id)
      .select('id');
    if (error || !data || data.length === 0) { toast.error('Erro ao reativar a Safra'); }
    else { toast.success('Safra reativada'); }
    setConfirmAtivar(null);
    load();
  };

  const cellClass = 'text-[12px] font-medium leading-tight py-1 px-2';

  return (
    <div className="w-full p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Safras</h2>
          <p className="text-xs text-muted-foreground">Safras e exercícios por escopo de negócio.</p>
        </div>
        <div className="flex items-center gap-2">
          {totalInativas > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1"
              onClick={() => setMostrarInativas(v => !v)}
            >
              {mostrarInativas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {mostrarInativas ? 'Ocultar inativas' : `Mostrar inativas (${totalInativas})`}
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Safra</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Código</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Nome</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Escopo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Situação</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Em uso</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Ordem</TableHead>
                <TableHead className="w-10 py-1.5 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              )}
              {!loading && loadError && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-sm text-destructive mb-2">Erro ao carregar as Safras.</p>
                    <Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !loadError && safrasFiltradas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma Safra cadastrada</TableCell></TableRow>
              )}
              {!loading && !loadError && safrasFiltradas.map(s => (
                <TableRow key={s.id} className={`h-auto ${!s.ativa ? 'opacity-50' : ''}`}>
                  <TableCell className={`${cellClass} font-mono text-[11px]`}>{s.codigo || '—'}</TableCell>
                  <TableCell className={cellClass}><span className="font-semibold">{s.nome}</span></TableCell>
                  <TableCell className={cellClass}>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 leading-tight">{escopoLabel(s.escopo_negocio)}</Badge>
                  </TableCell>
                  <TableCell className={cellClass}>
                    <Badge variant={s.ativa ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 leading-tight">
                      {s.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell className={`${cellClass} text-muted-foreground`}>{emUso.has(s.id) ? 'Sim' : 'Não'}</TableCell>
                  <TableCell className={`${cellClass} font-mono text-[11px]`}>{s.ordem_exibicao}</TableCell>
                  <TableCell className="py-1 px-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openEdit(s)} className="gap-2 text-xs">
                          <Pencil className="h-3 w-3" /> Editar
                        </DropdownMenuItem>
                        {s.ativa ? (
                          <DropdownMenuItem onClick={() => setConfirmDesativar(s)} className="gap-2 text-xs text-amber-600">
                            <PowerOff className="h-3 w-3" /> Inativar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setConfirmAtivar(s)} className="gap-2 text-xs text-emerald-600">
                            <Power className="h-3 w-3" /> Reativar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Dialog Criar/Editar ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* ⚠ O "Mais…" NÃO BASTAVA, e a promessa do comentário antigo ("sem rolagem") era
            justamente o defeito: com os três campos extras abertos o modal passava da tela e
            o botão Criar caía abaixo da dobra — sem rolagem, ele ficava inalcançável, não
            apenas escondido. Agora o CORPO rola e cabeçalho e rodapé ficam presos (A21), que
            é a regra da casa para qualquer superfície com conteúdo variável.
            ⚠ E O "Mais…" CONTINUA, por outro motivo: ordem, descrição e observações são de
            quem já sabe o que quer, e mostrá-los sempre faria os cinco campos que importam
            parecerem oito. Ele deixou de ser a defesa contra a quebra e voltou a ser o que
            dizia ser — densidade.
            Medidas do A18: rótulo 10px, campo h-8, cabeçalho azul.
            ⚠ `max-w-2xl` (672px) DESDE O AGRI-CADASTRO-SAFRA-02, era `max-w-md` (448). O modal
            nasceu com cinco campos e passou a ter oito: em coluna única, cada campo novo virava
            altura, e a rolagem — que é rede de segurança — passou a ser o estado NORMAL de
            abrir o cadastro. Largura é o que se troca por altura aqui; o conteúdo é o mesmo.
            ⚠ A ROLAGEM FICA, e continua sendo o certo: em tela baixa (ou com o "Mais…" aberto)
            o corpo rola e cabeçalho e rodapé seguem presos — A21. O que muda é a rolagem
            deixar de aparecer na altura normal. */}
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 bg-primary px-4 py-2.5">
            <DialogTitle className="text-[13px] text-primary-foreground">
              {editing ? 'Editar safra' : 'Nova safra'}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {/* ⚠ ESCOPO E CICLO NA MESMA LINHA — AGRI-CADASTRO-SAFRA-02. Eles são o par que
                decide o resto do formulário, têm o mesmo desenho (duas pílulas) e a mesma
                altura; empilhá-los gastava duas vezes a altura para dizer a mesma coisa.
                ⚠ `items-start` PORQUE AS AJUDAS TÊM ALTURAS DIFERENTES: a do ciclo ocupa duas
                linhas e a do escopo uma. Sem isto, o alinhamento vertical esticaria o bloco
                mais curto e as duas fileiras de pílulas deixariam de casar. */}
            <div className="grid grid-cols-2 items-start gap-3">
              {/* 1. ESCOPO — pílulas, porque são dois e a escolha muda o resto do formulário. */}
              <div>
                <Label className="text-[10px]">Escopo <span className="text-destructive">*</span></Label>
                <div className="mt-0.5 flex gap-1">
                  {(['pecuaria', 'agricultura'] as const).map(v => (
                    <button key={v} type="button"
                      onClick={() => setEscopo(v)}
                      className={`h-8 flex-1 rounded-md border text-[12px] transition-colors ${
                        escopo === v ? 'border-primary bg-primary text-primary-foreground'
                                     : 'bg-card hover:bg-muted/50'}`}>
                      {/* ⚠ O RÓTULO É "Lavoura", O VALOR CONTINUA `agricultura` — a mesma regra
                          do card do modal de lançamento (`ATIVIDADES`): o produtor diz lavoura,
                          o plano de contas e a coluna dizem agricultura. Trocar o identificador
                          custaria migration e quebraria tudo que já grava. */}
                      {v === 'pecuaria' ? 'Pecuária' : 'Lavoura'}
                    </button>
                  ))}
                </div>
                {escopo && <p className="mt-1 text-[10px] text-muted-foreground">{ESCOPO_AJUDA[escopo]}</p>}
              </div>

              {/* 2. CICLO — AGRI-CADASTRO-SAFRA-01. Ele decide o resto do formulário, como o
                   escopo, e por isso vem logo depois dele e usa o mesmo desenho de pílulas.
                   ⚠ NÃO É DETALHE DE CADASTRO: anual é a temporada de julho a junho; perene é a
                   lavoura que fica seis, sete anos no chão — o eucalipto planta em 2020 e corta
                   em 2027. Tratar as duas com a mesma pergunta obrigava a inventar uma
                   temporada para o eucalipto. */}
              <div>
                <Label className="text-[10px]">Ciclo <span className="text-destructive">*</span></Label>
                <div className="mt-0.5 flex gap-1">
                  {(['anual', 'perene'] as const).map(c => (
                    <button key={c} type="button" onClick={() => trocarCiclo(c)}
                      className={`h-8 flex-1 rounded-md border text-[12px] transition-colors ${
                        ciclo === c ? 'border-primary bg-primary text-primary-foreground'
                                    : 'bg-card hover:bg-muted/50'}`}>
                      {c === 'anual' ? 'Anual' : 'Perene'}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {ciclo === 'anual'
                    ? 'Anual — temporada de julho a junho; as datas vêm preenchidas e podem ser ajustadas.'
                    : 'Perene — plantio e corte previsto podem estar a vários anos de distância.'}
                </p>
              </div>
            </div>

            {/* 3+4. TEMPORADA E AS DUAS DATAS NUMA LINHA — AGRI-CADASTRO-SAFRA-02. Elas são a
                 mesma pergunta em três campos: QUANDO. Separá-las em duas linhas obrigava o
                 olho a descer para conferir se as datas batem com a temporada que acabou de
                 ser escolhida — e é justamente esse par que o operador ajusta à mão.
                 ⚠ NO PERENE NÃO SOBRA BURACO NA ESQUERDA: sem a temporada, plantio e corte
                 ocupam as duas primeiras colunas e a terceira fica vazia. Uma célula vazia no
                 COMEÇO da linha se lê como campo faltando; no fim, como espaço.
                 ⚠ `DatePicker`, NUNCA `<input type="date">`: o nativo abre o calendário do
                 sistema operacional, com outro idioma e outro formato por máquina. É gate.
                 ⚠ OS RÓTULOS MUDAM COM O CICLO porque as perguntas são outras: no anual são
                 os extremos da temporada; no perene são o plantio e o corte previsto. */}
            <div className="grid grid-cols-3 gap-2">
              {ciclo === 'anual' && (
                <div>
                  <Label className="text-[10px]">Temporada <span className="text-destructive">*</span></Label>
                  <Select value={temporada} onValueChange={escolherTemporada}>
                    <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {temporadasDisponiveis(new Date()).map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-[10px]">{ciclo === 'perene' ? 'Plantio' : 'Início'}</Label>
                <DatePicker value={dataInicio} onChange={setDataInicio} className="mt-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">{ciclo === 'perene' ? 'Corte previsto' : 'Fim'}</Label>
                <DatePicker value={dataFim} onChange={setDataFim} className="mt-0.5" />
              </div>
            </div>

            {/* 5. CÓDIGO + NOME sugerido.
                 ⚠ TRAVADO NO ANUAL, LIVRE NO PERENE. No anual o código é função da temporada e
                 do escopo, e deixá-lo livre convidaria `25/26 Lav`, `2025/26-Lav` e três
                 grafias para a mesma safra. No perene ele nasce das datas, e duas plantações
                 com o mesmo intervalo de anos geram o MESMO código — ali o operador precisa
                 poder desempatar à mão. */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2">
              <div>
                <Label className="text-[10px]">Código</Label>
                <Input value={codigo} readOnly={ciclo === 'anual'} tabIndex={ciclo === 'anual' ? -1 : undefined}
                  onChange={e => setCodigo(e.target.value)}
                  title={ciclo === 'anual'
                    ? 'Gerado pela temporada e pelo escopo — é a chave da safra e não se digita.'
                    : 'Sugerido pelas datas — pode ser editado; é a chave da safra.'}
                  className={`mt-0.5 h-8 font-mono text-[12px] ${ciclo === 'anual' ? 'cursor-default bg-muted' : ''}`} />
              </div>
              <div>
                <Label className="text-[10px]">Nome <span className="text-destructive">*</span></Label>
                <Input value={nome} onChange={e => setNome(e.target.value)}
                  className="mt-0.5 h-8 text-[12px]" />
              </div>
            </div>

            {/* ⚠ AVISA ANTES, NÃO DEPOIS: a unicidade é do banco e sem isto o erro só
                apareceria no Criar, com o formulário todo preenchido. */}
            {safraExistente && (
              <div className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <b>{codigoGerado}</b> já existe{safraExistente.ativa ? '' : ' (inativa)'}.{' '}
                <button type="button" className="underline underline-offset-2"
                  onClick={() => { setDialogOpen(false); openEdit(safraExistente); }}>
                  {safraExistente.ativa ? 'Abrir' : 'Abrir para reativar'}
                </button>{' '}em vez de criar outra.
              </div>
            )}

            {/* 6. MAIS — o que quase ninguém mexe fica fora do caminho. */}
            <button type="button" onClick={() => setMaisAberto(v => !v)}
              className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {maisAberto ? 'Menos' : 'Mais…'}
            </button>
            {/* ⚠ OS TRÊS EXTRAS NUMA LINHA SÓ — AGRI-CADASTRO-SAFRA-02. Abrir o "Mais…"
                acrescentava três alturas de campo e era o que empurrava o rodapé para fora da
                tela; em 672px eles cabem lado a lado. A ordem é um número curto e ganha faixa
                fixa de 150px; as duas caixas de texto dividem o que sobra. */}
            {maisAberto && (
              <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 border-t pt-2.5">
                <div>
                  <Label className="text-[10px]">Ordem</Label>
                  <Input value={ordemRaw} onChange={e => setOrdemRaw(e.target.value)} inputMode="numeric"
                    placeholder="0" className="mt-0.5 h-8 font-mono text-[12px]" />
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">0 = padrão · 1, 2, 3… = manual</p>
                </div>
                <div>
                  <Label className="text-[10px]">Descrição</Label>
                  <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
                    className="mt-0.5 min-h-0 resize-none text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Observações</Label>
                  <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
                    className="mt-0.5 min-h-0 resize-none text-[12px]" />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <Switch checked={ativa} onCheckedChange={setAtiva} />
              <Label className="text-[11px]">Safra ativa</Label>
            </div>
          </div>
          <DialogFooter className="shrink-0 items-center gap-2 border-t bg-background px-4 py-2.5">
            {/* ⚠ O BOTÃO DESABILITADO DIZ POR QUÊ, e é UMA fonte só para o texto e para o
                `disabled` — regra da casa. A condição era `!codigo`, e ela deixou de bastar
                quando a lavoura ganhou sigla: no anual o código nunca mais é vazio, então o
                aviso "Escolha o escopo" ficaria inalcançável e o botão convidaria a um erro
                que só o save recusaria. */}
            {motivoBloqueio && (
              <span className="mr-auto text-[10px] leading-tight text-muted-foreground">{motivoBloqueio}</span>
            )}
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={isSaving || !!motivoBloqueio}>
              {isSaving ? 'Salvando...' : (editing ? 'Salvar' : 'Criar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmar Inativação ─── */}
      <AlertDialog open={!!confirmDesativar} onOpenChange={(open) => !open && setConfirmDesativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar Safra</AlertDialogTitle>
            <AlertDialogDescription>
              Esta Safra deixará de aparecer nas seleções que carregam apenas Safras ativas. Os vínculos existentes serão preservados. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDesativar}>Inativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Confirmar Reativação ─── */}
      <AlertDialog open={!!confirmAtivar} onOpenChange={(open) => !open && setConfirmAtivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar Safra</AlertDialogTitle>
            <AlertDialogDescription>
              Esta Safra voltará a ficar disponível nas seleções de Safras ativas. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAtivar}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
