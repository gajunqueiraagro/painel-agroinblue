/**
 * NOTA-PAGA-POR-TERCEIRO-01 · Fatia A (Gabriel 23/11, mock aprovado) — o bloco "Quem paga: Nós · Terceiro" no topo da aba Pagamento.
 * Terceiro = alguém pagou a nota em nosso nome (o empreiteiro comprou e desconta da empreitada): a despesa fica no DRE, mas não sai do banco.
 * O bloco só PEDE ao banco (lote 34): a prévia é a mesma função com `simular`; o botão grava com trilha; "Desfazer" pede o motivo.
 * Gravou (marcar ou desfazer) → `aoGravar`: quem hospeda fecha o modal e a lista relê (o formulário aberto teria o status antigo).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Segmentado } from '@/components/ui/segmentado';
import { Ajuda } from '@/components/ui/ajuda';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { REGUA_ROTULO } from '@/components/ui/bloco-formulario';
import { TH_REGUA, TD_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import {
  desfazerPagoPorTerceiro, lerPagoPorTerceiro, marcarPagoPorTerceiro, podeEscolherQuemPaga,
  type EstadoDoPagamento, type PagoPorTerceiroVivo, type PreviaDoTerceiro,
} from '@/lib/financeiro/pagoPorTerceiro';

export type QuemPaga = 'nos' | 'terceiro';
const MOTIVO_PADRAO = 'Comprou no nosso nome e desconta da empreitada';
const SEM_ANEXO = '__sem_anexo__';
const dataBR = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const rotuloDoStatus = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
const rotuloDoCaixa = (e: EstadoDoPagamento) => (e.semCaixa ? 'sem movimento de caixa' : 'sai do banco');

export function QuemPagaTerceiro({ lancamentoId, clienteId, tipoOperacao, status, documentos, aoMudarQuemPaga, aoGravar,
  ler = lerPagoPorTerceiro, marcar = marcarPagoPorTerceiro, desfazer = desfazerPagoPorTerceiro }: {
  lancamentoId: string;
  clienteId: string;
  tipoOperacao: string | null;
  status: string | null;
  /** os documentos do lançamento (o anexo opcional é um deles) */
  documentos: { id: string; nome: string }[];
  /** Terceiro escolhido ou já marcado: o hospedeiro desliga a Forma de pagamento */
  aoMudarQuemPaga: (q: QuemPaga) => void;
  aoGravar: (frase: string) => void;
  /** os testes injetam */
  ler?: typeof lerPagoPorTerceiro; marcar?: typeof marcarPagoPorTerceiro; desfazer?: typeof desfazerPagoPorTerceiro;
}) {
  const [vivo, setVivo] = useState<PagoPorTerceiroVivo | null | undefined>(undefined);
  const [quem, setQuem] = useState<QuemPaga>('nos');
  const [parceiro, setParceiro] = useState('');
  const [motivo, setMotivo] = useState(MOTIVO_PADRAO);
  const [data, setData] = useState('');
  const [anexo, setAnexo] = useState(SEM_ANEXO);
  const [previa, setPrevia] = useState<PreviaDoTerceiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [motivoDesfazer, setMotivoDesfazer] = useState('');

  useEffect(() => {
    let ativo = true;
    void ler(lancamentoId).then((v) => { if (!ativo) return; setVivo(v); if (v) { setQuem('terceiro'); aoMudarQuemPaga('terceiro'); } });
    return () => { ativo = false; };
  }, [lancamentoId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a prévia ao vivo (a MESMA função com simular): só quando dá para pedir; a resposta velha não escreve depois */
  const pronto = quem === 'terceiro' && !vivo && !!parceiro && motivo.trim().length >= 3;
  useEffect(() => {
    if (!pronto) { setPrevia(null); return; }
    let ativo = true;
    void marcar({ lancamentoId, parceiroId: parceiro, motivo: motivo.trim(), data: data || null, documentoId: anexo === SEM_ANEXO ? null : anexo }, true)
      .then((r) => { if (!ativo) return; if (r.ok === false) { setPrevia(null); setErro(r.frase); } else { setPrevia(r.previa); setErro(null); } });
    return () => { ativo = false; };
  }, [pronto, lancamentoId, parceiro, motivo, data, anexo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (vivo === undefined) return null;
  if (!vivo && !podeEscolherQuemPaga(tipoOperacao, status)) return null;

  const escolher = (q: QuemPaga) => { setQuem(q); setErro(null); aoMudarQuemPaga(q); };
  const gravar = async () => {
    if (!parceiro) { setErro('Escolha quem pagou.'); return; }
    if (motivo.trim().length < 3) { setErro('Escreva o motivo (quem pagou e de onde desconta).'); return; }
    setGravando(true); setErro(null);
    const r = await marcar({ lancamentoId, parceiroId: parceiro, motivo: motivo.trim(), data: data || null, documentoId: anexo === SEM_ANEXO ? null : anexo }, false);
    setGravando(false);
    if (r.ok === false) setErro(r.frase);
    else aoGravar(`Marcado como pago por ${r.previa.parceiro ?? 'terceiro'} em ${dataBR(r.previa.dataPagamento)}: saiu de "a pagar".`);
  };
  const confirmarDesfazer = async () => {
    if (motivoDesfazer.trim().length < 3) { setErro('Escreva por que desfaz.'); return; }
    setGravando(true); setErro(null);
    const r = await desfazer(lancamentoId, motivoDesfazer.trim(), false);
    setGravando(false);
    if (r.ok === false) setErro(r.frase); else aoGravar(`Desfeito: volta a ${rotuloDoStatus(r.previa.depois.status)}.`);
  };

  return (
    <div className="space-y-1.5" data-testid="quem-paga">
      <div className="flex h-[26px] items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">Quem paga
          <Ajuda titulo="Quem paga" oQueE="Nós = sai do nosso banco. Terceiro = alguém pagou em nosso nome (ex.: o empreiteiro comprou o material e desconta da empreitada)."
            porQue="A despesa é verdadeira (DRE), mas não sai do banco: não pode ficar em “a pagar”, na aprovação nem na procura do extrato."
            comoFazer="Escolha Terceiro, diga quem pagou e o motivo, confira a prévia e clique em “Marcar como pago por terceiro”. Desfazer volta como estava." />
        </span>
        <Segmentado<QuemPaga> valor={quem} onEscolher={(v) => { if (!vivo) escolher(v); }} fonte={10}
          opcoes={[{ valor: 'nos', rotulo: 'Nós', desabilitada: !!vivo }, { valor: 'terceiro', rotulo: 'Terceiro (desconta de contrato)' }]} />
      </div>

      {vivo && (
        <div className="flex h-[38px] items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-900" data-testid="quem-paga-marcado">
          {/* duas linhas RESERVADAS: quebra, nunca "…" fora de tabela */}
          <span className="h-[28px] min-w-0 flex-1 overflow-hidden leading-[14px]" title={`Pago por terceiro em ${dataBR(vivo.dataPagamento)} · ${vivo.motivo}`}>
            Pago por terceiro em {dataBR(vivo.dataPagamento)} · {vivo.motivo}
          </span>
          {!desfazendo && <Button type="button" variant="outline" size="sm" className="h-[22px] text-[10px]" onClick={() => { setDesfazendo(true); setErro(null); }}
            data-testid="quem-paga-desfazer">Desfazer</Button>}
        </div>
      )}
      {vivo && desfazendo && (
        <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-2" data-testid="quem-paga-desfazer-form">
          <span className={REGUA_ROTULO}>Por que desfaz</span>
          <Input value={motivoDesfazer} onChange={(e) => setMotivoDesfazer(e.target.value)} maxLength={300} className="h-7 text-[11px]"
            placeholder="ex.: confirmado que pagamos nós" data-testid="quem-paga-desfazer-motivo" />
          <Button type="button" size="sm" className="h-7 text-[10px]" disabled={gravando} onClick={() => void confirmarDesfazer()}
            data-testid="quem-paga-desfazer-confirmar">Desfazer</Button>
        </div>
      )}

      {!vivo && quem === 'terceiro' && (
        <div className="space-y-1.5 rounded-md border p-2" data-testid="quem-paga-form">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
            <span className={REGUA_ROTULO}>Quem pagou</span>
            <FavorecidoSelect value={parceiro} onChange={setParceiro} clienteId={clienteId} size="compact" placeholder="O empreiteiro / parceiro…" />
            <span className={REGUA_ROTULO}>Motivo</span>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className="h-7 text-[11px]" data-testid="quem-paga-motivo" />
            <span className={REGUA_ROTULO}>Data do desconto</span>
            <div className="w-[130px]"><DatePicker value={data} onChange={setData} size="compact" /></div>
            <span className={REGUA_ROTULO}>Anexo (opcional)</span>
            <Select value={anexo} onValueChange={setAnexo}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ANEXO}>Nenhum</SelectItem>
                {documentos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* a prévia: lugar RESERVADO (nada se desloca quando ela chega) */}
          <div className="min-h-[106px]" data-testid="quem-paga-previa">
            {previa ? (<>
              <table className="w-full table-fixed border-collapse text-[10px]">
                <colgroup><col style={{ width: 110 }} /><col /><col /></colgroup>
                <thead><tr className="h-[22px]"><th className={cn(TH_REGUA, 'bg-primary text-left')}>Prévia</th><th className={cn(TH_REGUA, 'bg-primary text-left')}>Hoje</th>
                  <th className={cn(TH_REGUA, 'bg-primary text-left')}>Depois</th></tr></thead>
                <tbody>
                  <tr className="h-[19px]"><td className={TD_REGUA}>Status</td><td className={TD_REGUA}>{rotuloDoStatus(previa.antes.status)}</td><td className={cn(TD_REGUA, 'font-semibold')}>{rotuloDoStatus(previa.depois.status)}</td></tr>
                  <tr className="h-[19px]"><td className={TD_REGUA}>Pagamento</td><td className={TD_REGUA}>{dataBR(previa.antes.dataPagamento)}</td><td className={cn(TD_REGUA, 'font-semibold')}>{dataBR(previa.depois.dataPagamento)}</td></tr>
                  <tr className="h-[19px]"><td className={TD_REGUA}>Caixa / banco</td><td className={TD_REGUA}>{rotuloDoCaixa(previa.antes)}</td><td className={cn(TD_REGUA, 'font-semibold')}>{rotuloDoCaixa(previa.depois)}</td></tr>
                </tbody>
              </table>
              <ul className="mt-1 list-disc pl-4 text-[10px] text-muted-foreground">{previa.efeitos.map((e) => <li key={e}>{e}</li>)}</ul>
              {previa.avisos.map((a) => <p key={a} className="text-[10px] font-semibold text-amber-800" data-testid="quem-paga-aviso">{a}</p>)}
            </>) : <p className="text-[10px] text-muted-foreground">Escolha quem pagou para ver a prévia (nada é gravado antes do botão).</p>}
          </div>
          <div className="flex h-[26px] items-center justify-end">
            <Button type="button" size="sm" className="h-7 text-[10px]" disabled={gravando || !previa} onClick={() => void gravar()} data-testid="quem-paga-gravar">
              Marcar como pago por terceiro
            </Button>
          </div>
        </div>
      )}
      <p className="h-[28px] overflow-hidden text-[10px] leading-[14px] text-destructive" data-testid="quem-paga-erro">{erro ?? ''}</p>
    </div>
  );
}
