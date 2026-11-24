/**
 * FOLHA-01 · PR B (telas) — "Funcionário" no rodapé do Editar lançamento (contrato §3.4; D3 a, D4 a). O MÍNIMO em Lançamentos: nada de
 * coluna nem filtro na lista.
 * ⚠ SÓ PARA QUEM TEM A FOLHA (`folha_ok`): sem ela, nada aparece (e a RLS de `folha_funcionarios` nem devolveria o nome).
 * ⚠ D3: "Nome ↗" abre a Folha › Histórico da pessoa com "‹ Voltar ao lançamento" (`?folhaFunc=&folhaLanc=` no V2Index); dentro da própria
 *   Folha, o hospedeiro passa `onAbrirFuncionario` e ela só troca a pessoa.
 * ⚠ D4: ligar/trocar/desligar pelo modal, pela MESMA função da Folha (`fn_lancamento_funcionario_ligar`), com a prévia do banco antes.
 * ⚠ MORA NO RODAPÉ, como o Patrimônio (LANC-PATRIMONIO-VINCULO-01), e não no Resumo: o Resumo tem blocos de altura FIXA que somam ~452px
 *   (P121); uma linha nova ali pede refazer a conta do modal inteiro (D-F1 do relatório).
 */
import { useState } from 'react';
import { ExternalLink, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { useFolhaApi, useFolhaOk, useFuncionarioDoLancamento, useFuncionarios, useRelerFolha } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import { fraseDaPreviaLigar } from '@/lib/folha/folhaTela';

export const SEM_FUNCIONARIO = '__sem__';

export function FuncionarioDoLancamento({ lancamentoId, clienteId, onAntesDeSair, onAbrirFuncionario }: {
  lancamentoId: string; clienteId: string;
  /** fecha o Editar lançamento antes de ir à Folha */
  onAntesDeSair?: () => void;
  /** dentro da Folha: troca a pessoa no Histórico em vez de navegar */
  onAbrirFuncionario?: (funcionarioId: string) => void;
}) {
  const ok = useFolhaOk(clienteId);
  const { data: atual } = useFuncionarioDoLancamento(ok.data === true ? lancamentoId : null);
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  if (ok.data !== true) return null;

  const irPara = (id: string) => {
    if (onAbrirFuncionario) { onAbrirFuncionario(id); return; }
    onAntesDeSair?.();
    navigate(`/v2?folhaFunc=${encodeURIComponent(id)}&folhaLanc=${encodeURIComponent(lancamentoId)}`);
  };

  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1 text-[10px]" data-testid="lanc-funcionario">
      <UserRound className="h-3 w-3 text-muted-foreground" />
      {atual ? (
        <>
          <button type="button" className="inline-flex max-w-[180px] items-center gap-0.5 font-medium text-primary hover:underline" title={`Funcionário: ${atual.nome} · abrir o histórico na Folha`}
            onClick={() => irPara(atual.id)} data-testid="lanc-funcionario-abrir">
            <span className="truncate">{atual.nome}</span> <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => setAberto(true)} data-testid="lanc-funcionario-trocar">trocar</button>
        </>
      ) : (
        <button type="button" className="text-primary hover:underline" onClick={() => setAberto(true)} data-testid="lanc-funcionario-ligar">ligar a um funcionário…</button>
      )}
      {aberto && <LigarFuncionario lancamentoId={lancamentoId} clienteId={clienteId} atual={atual ?? null} aoFechar={() => setAberto(false)} />}
    </span>
  );
}

function LigarFuncionario({ lancamentoId, clienteId, atual, aoFechar }: {
  lancamentoId: string; clienteId: string; atual: { id: string; nome: string } | null; aoFechar: () => void;
}) {
  const api = useFolhaApi();
  const reler = useRelerFolha();
  const { data: lista } = useFuncionarios(clienteId);
  const [escolhido, setEscolhido] = useState<string>(atual?.id ?? '');
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const alvo = escolhido === SEM_FUNCIONARIO ? null : escolhido || null;
  const opcoes = [
    ...(atual ? [{ value: SEM_FUNCIONARIO, label: 'sem funcionário (desligar)' }] : []),
    ...(lista?.funcionarios ?? []).map(f => ({ value: f.id, label: f.situacao === 'desligado' ? `${f.nome} (desligado)` : f.nome })),
  ];
  const conferir = async () => {
    if (!escolhido) { setErro('Escolha o funcionário.'); return; }
    setIndo(true); setErro(null);
    const r = await api.ligar([lancamentoId], alvo, motivo.trim() || (alvo ? 'ligado pelo lançamento' : 'desligado pelo lançamento'), true);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    setPrevia(alvo ? fraseDaPreviaLigar(r.dados) : `Tira este lançamento de ${atual?.nome ?? 'o funcionário'}.`);
  };
  const confirmar = async () => {
    setIndo(true); setErro(null);
    const r = await api.ligar([lancamentoId], alvo, motivo.trim() || (alvo ? 'ligado pelo lançamento' : 'desligado pelo lançamento'), false);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    toast.success(alvo ? 'Lançamento ligado ao funcionário.' : 'Lançamento sem funcionário.');
    await reler(); aoFechar();
  };
  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[220px] w-[480px] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="lanc-funcionario-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">{atual ? 'Trocar o funcionário' : 'Ligar a um funcionário'}</DialogTitle>
          <DialogDescription className="sr-only">O lançamento passa a contar no histórico do funcionário na Folha.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div><Rotulo texto="Funcionário" obrig />
            <SearchableSelect value={escolhido} onValueChange={v => { setEscolhido(v); setPrevia(null); setErro(null); }} semTodos allLabel="escolha o funcionário" allValue=""
              options={opcoes} triggerClassName={REGUA_CAMPO} /></div>
          <div><Rotulo texto="Motivo (opcional)" /><Input value={motivo} onChange={e => { setMotivo(e.target.value); setPrevia(null); }} className={REGUA_CAMPO} /></div>
          <p className={cn('mt-auto h-[24px] truncate rounded px-2 text-[10.5px] leading-[24px]', previa ? 'bg-sky-50 text-sky-900' : 'text-transparent')} title={previa ?? undefined}>{previa ?? '·'}</p>
        </div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <p className="min-w-0 flex-1 truncate text-[10px] text-destructive" title={erro ?? undefined}>{erro ?? ''}</p>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] w-[96px] text-[11px]" disabled={indo} onClick={() => void (previa ? confirmar() : conferir())} data-testid="lanc-funcionario-confirmar">
            {indo ? 'Indo…' : previa ? 'Confirmar' : 'Conferir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
