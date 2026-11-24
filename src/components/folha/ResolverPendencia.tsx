/**
 * FOLHA-01 · PR B (telas) — RESOLVER UMA PENDÊNCIA (contrato §3.3): um modal de tamanho fixo (560 × 300) por ação.
 * ⚠ DOIS PASSOS: "Conferir" pede a PRÉVIA ao banco (`p_simular = true`) e mostra a frase dela; só então "Confirmar" grava. A recusa (P0001)
 *   fica no rodapé do modal, nunca em toast.
 * ⚠ CADASTRAR E LIGAR são dois gravadores: o funcionário nasce (`fn_folha_funcionario_gravar`), [desligado na data da rescisão], e os
 *   lançamentos se ligam a ele. Se a ligação falha depois do cadastro, o modal DIZ que o cadastro ficou (nada some em silêncio).
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { useFolhaApi, useFuncionarios, useRelerFolha } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import {
  FORM_VAZIO, fraseDaPendencia, fraseDaPreviaLigar, lancamentosDaPendencia, pedidoDoFuncionario, quemDaPendencia, rotuloDaPendencia, tituloDoDescarte,
  type AcaoPendencia, type Pendencia,
} from '@/lib/folha/folhaTela';

const REGRA: RegraDeAceite = { tipos: ['pdf', 'jpg', 'png'], tamanhoMaxBytes: 20 * 1024 * 1024, varios: false };

const TITULO: Record<AcaoPendencia, string> = {
  ligar_sugestao: 'Ligar ao funcionário', outro: 'Ligar a um funcionário', cadastrar: 'Cadastrar e ligar', cadastrar_desligado: 'Cadastrar desligado e ligar',
  descartar: 'Não é pendência', recibo: 'Anexar o recibo', novo_documento: 'Novo documento',
};

export function ResolverPendencia({ clienteId, pendencia: p, acao, aoFechar, aoResolver }: {
  clienteId: string; pendencia: Pendencia; acao: AcaoPendencia; aoFechar: () => void; aoResolver: () => void;
}) {
  const api = useFolhaApi();
  const reler = useRelerFolha();
  const { data: lista } = useFuncionarios(clienteId, acao === 'outro');
  const [funcionario, setFuncionario] = useState<string>(acao === 'ligar_sugestao' ? p.sugestao?.funcionario_id ?? '' : '');
  const [nome, setNome] = useState<string>(p.favorecido ?? '');
  const [data, setData] = useState<string>(p.ate ?? '');
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const ids = useMemo(() => lancamentosDaPendencia(p), [p]);
  const cadastra = acao === 'cadastrar' || acao === 'cadastrar_desligado';
  const titulo = acao === 'descartar' ? tituloDoDescarte(p) : TITULO[acao];
  const mudou = () => { setPrevia(null); setErro(null); };

  const pedidoDoCadastro = () => pedidoDoFuncionario({ ...FORM_VAZIO, nome, favorecido_id: p.favorecido_id ?? '' }, null);

  const conferir = async () => {
    setErro(null);
    if (acao === 'descartar') { if (!motivo.trim()) { setErro('Diga por que não é pendência.'); return; } await confirmar(); return; }
    if (cadastra) {
      if (!nome.trim()) { setErro('Informe o nome.'); return; }
      if (acao === 'cadastrar_desligado' && (!data || !motivo.trim())) { setErro('Informe a data e o motivo do desligamento.'); return; }
      setIndo(true);
      const r = await api.gravarFuncionario(clienteId, pedidoDoCadastro(), true);
      setIndo(false);
      if (!r.ok) { setErro(r.erro); return; }
      setPrevia(`Cria "${nome.trim()}"${acao === 'cadastrar_desligado' ? ` desligado em ${data.split('-').reverse().join('/')}` : ''} e liga ${ids.length.toLocaleString('pt-BR')} ${ids.length === 1 ? 'lançamento' : 'lançamentos'} a ele.`);
      return;
    }
    if (!funcionario) { setErro('Escolha o funcionário.'); return; }
    setIndo(true);
    const r = await api.ligar(ids, funcionario, motivo.trim() || 'pendência da folha', true);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    setPrevia(fraseDaPreviaLigar(r.dados));
  };

  const confirmar = async () => {
    setIndo(true); setErro(null);
    try {
      if (acao === 'descartar') {
        const r = await api.descartar(clienteId, p.chave, motivo.trim(), false);
        if (!r.ok) { setErro(r.erro); return; }
        await reler(); aoResolver(); return;
      }
      let alvo = funcionario;
      if (cadastra) {
        const g = await api.gravarFuncionario(clienteId, pedidoDoCadastro(), false);
        if (!g.ok) { setErro(g.erro); return; }
        alvo = typeof g.dados.id === 'string' ? g.dados.id : '';
        if (!alvo) { setErro('O banco não devolveu o funcionário criado.'); return; }
        if (acao === 'cadastrar_desligado') {
          const d = await api.desligar(alvo, data, motivo.trim(), false);
          if (!d.ok) { await reler(); setErro(`O cadastro foi criado, mas o desligamento não gravou: ${d.erro}`); return; }
        }
      }
      const l = await api.ligar(ids, alvo, motivo.trim() || 'pendência da folha', false);
      if (!l.ok) { await reler(); setErro(cadastra ? `O cadastro foi criado, mas os lançamentos não se ligaram: ${l.erro}` : l.erro); return; }
      toast.success(cadastra ? 'Funcionário cadastrado e lançamentos ligados.' : 'Lançamentos ligados.');
      await reler(); aoResolver();
    } finally { setIndo(false); }
  };

  const enviarRecibo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (!p.funcionario_id || !p.lancamento_id) { setErro('A pendência não diz de quem é o recibo.'); return; }
    setIndo(true); setErro(null);
    const e = await api.enviarDocumento(clienteId, p.funcionario_id, arquivo, 'recibo_13', { lancamento_id: p.lancamento_id });
    setIndo(false);
    if (e) { setErro(e); return; }
    toast.success('Recibo anexado ao funcionário e ao lançamento.');
    await reler(); aoResolver();
  };

  const podeConfirmar = previa != null || acao === 'descartar';
  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[300px] w-[560px] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="resolver-pendencia">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{fraseDaPendencia(p)}</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2" data-desloca-livre="">
          <div className="rounded border bg-card px-2 py-1">
            <p className="truncate text-[10px] text-muted-foreground" title={rotuloDaPendencia(p)}>{rotuloDaPendencia(p)}</p>
            <p className="truncate text-[11px] font-medium" title={quemDaPendencia(p)}>{quemDaPendencia(p)}</p>
            <p className="truncate text-[10px]" title={fraseDaPendencia(p)}>{fraseDaPendencia(p)}</p>
          </div>

          {(acao === 'ligar_sugestao' || acao === 'outro') && (
            <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-2">
              <div><Rotulo texto="Funcionário" obrig />
                {acao === 'ligar_sugestao'
                  ? <Input value={p.sugestao?.funcionario ?? ''} readOnly tabIndex={-1} className={REGUA_CAMPO} />
                  : <SearchableSelect value={funcionario} onValueChange={v => { setFuncionario(v); mudou(); }} semTodos allLabel="escolha o funcionário" allValue=""
                      options={(lista?.funcionarios ?? []).map(f => ({ value: f.id, label: f.situacao === 'desligado' ? `${f.nome} (desligado)` : f.nome }))}
                      triggerClassName={REGUA_CAMPO} />}
              </div>
              <div><Rotulo texto="Motivo (opcional)" /><Input value={motivo} onChange={e => { setMotivo(e.target.value); mudou(); }} className={REGUA_CAMPO} /></div>
            </div>
          )}
          {cadastra && (
            <div className={cn('grid gap-2', acao === 'cadastrar_desligado' ? 'grid-cols-[minmax(0,1fr)_110px_150px]' : 'grid-cols-1')}>
              <div><Rotulo texto="Nome do funcionário" obrig /><Input value={nome} onChange={e => { setNome(e.target.value); mudou(); }} className={REGUA_CAMPO} data-testid="resolver-nome" /></div>
              {acao === 'cadastrar_desligado' && <>
                <div><Rotulo texto="Desligado em" obrig /><DatePicker value={data} onChange={v => { setData(v ?? ''); mudou(); }} /></div>
                <div><Rotulo texto="Motivo" obrig /><Input value={motivo} onChange={e => { setMotivo(e.target.value); mudou(); }} placeholder="rescisão" className={REGUA_CAMPO} /></div>
              </>}
            </div>
          )}
          {acao === 'descartar' && (
            <div><Rotulo texto="Por quê?" obrig /><Input autoFocus value={motivo} onChange={e => { setMotivo(e.target.value); setErro(null); }} className={REGUA_CAMPO}
              placeholder="é o titular, é fornecedor, já foi resolvido…" data-testid="resolver-motivo" /></div>
          )}
          {acao === 'recibo' && (
            <AreaDeArquivo regra={REGRA} onArquivos={a => void enviarRecibo(a[0])} desabilitado={indo} motivoDesabilitado="enviando…" motivoExterno={erro}
              convite="Arraste o recibo aqui ou clique para escolher" detalhe="PDF ou imagem · vai para o funcionário e para o lançamento" className="h-[56px]" testId="resolver-recibo" />
          )}

          <p className={cn('mt-auto h-[28px] rounded px-2 py-1 text-[10.5px] leading-[20px]', previa ? 'bg-sky-50 text-sky-900' : 'text-transparent')}
            title={previa ?? undefined} data-testid="resolver-previa">{previa ?? '·'}</p>
        </div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <p className="min-w-0 flex-1 truncate text-[10px] text-destructive" title={erro ?? undefined} data-testid="resolver-erro">{acao === 'recibo' ? '' : erro ?? ''}</p>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className={cn('h-[26px] w-[96px] text-[11px]', acao === 'recibo' && 'invisible')} disabled={indo || acao === 'recibo'}
            onClick={() => void (podeConfirmar && acao !== 'descartar' ? confirmar() : conferir())} data-testid="resolver-confirmar">
            {indo ? 'Indo…' : podeConfirmar ? 'Confirmar' : 'Conferir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
