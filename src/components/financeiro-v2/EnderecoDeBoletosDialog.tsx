/**
 * BOLETO D3c — o ENDEREÇO DE BOLETOS do cliente: ver/copiar, gerar, trocar, revogar, e o passo a passo do encaminhamento
 * (Gmail · Hotmail/Outlook.com · Microsoft 365). Abre pela caixa de boletos ("E-mail de boletos").
 *
 * ⚠ TODA ESCRITA TEM PRÉVIA: "Ver a prévia" chama a RPC com `p_simular` (nada grava) e mostra o que vai acontecer; só "Confirmar"
 *   grava. Trocar e revogar pedem o MOTIVO: vazio = o campo fica vermelho com a frase (UX-OBRIGATORIOS-01, nunca toast).
 * ⚠ QUEM PODE é o banco (gestor do cliente ou a AgroinBlue, 42501): a recusa aparece na linha do aviso, com a frase dele.
 * ⚠ O ENDEREÇO DA CAIXA DO CLIENTE (o Gmail/Hotmail dele) não é pedido nem guardado: o passo a passo é para ele fazer lá.
 * ⚠ MODAL DE TAMANHO FIXO: o bloco do endereço e o da ação têm ALTURA FIXA (trocar de modo não move o passo a passo); só a lista
 *   dos passos rola. Fora de tabela, nada de "…": o endereço quebra (`break-all`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import { entradaEmailApiDoBanco, type EnderecoDoCliente, type EntradaEmailApi, type RespostaDoEndereco } from '@/lib/financeiro/boleto/entradaEmailApi';
import {
  FRASE_MOTIVO_OBRIGATORIO, PROVEDORES, motivoValido, passosCom, type ProvedorDoPasso,
} from '@/lib/financeiro/boleto/entradaEmail';
import { dataBR } from '@/lib/financeiro/boleto/caixaDeBoletos';

type Modo = 'ver' | 'gerar' | 'trocar' | 'revogar';

/** A frase da prévia (o que o banco disse que vai acontecer). */
export function fraseDaPrevia(modo: Modo, p: RespostaDoEndereco): string {
  if (modo === 'revogar') return `${p.endereco ?? 'O endereço'} para de receber: o que chegar nele é descartado. O cliente fica sem endereço até gerar outro.`;
  if (modo === 'trocar') return `Novo endereço: ${p.endereco ?? '—'} (o final é sorteado ao confirmar). ${p.antigo ?? 'O antigo'} para de receber — avise quem encaminha.`;
  return `O endereço vai ser ${p.endereco ?? '—'} (o final é sorteado ao confirmar).`;
}

export function EnderecoDeBoletosDialog({ clienteId, clienteNome, aoFechar, api = entradaEmailApiDoBanco, aoMudar }: {
  clienteId: string; clienteNome?: string | null; aoFechar: () => void; api?: EntradaEmailApi; aoMudar?: () => void;
}) {
  const [atual, setAtual] = useState<EnderecoDoCliente | null>(null);
  const [erroDaLeitura, setErroDaLeitura] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>('ver');
  const [motivo, setMotivo] = useState('');
  const [motivoPendente, setMotivoPendente] = useState(false);
  const [previa, setPrevia] = useState<RespostaDoEndereco | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [provedor, setProvedor] = useState<ProvedorDoPasso>('gmail');
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const ler = useCallback(async () => {
    const r = await api.endereco(clienteId);
    if (!vivo.current) return;
    if (r.ok === false) { setErroDaLeitura(r.erro); return; }
    setErroDaLeitura(null);
    setAtual(r.dados);
  }, [api, clienteId]);
  useEffect(() => { void ler(); }, [ler]);

  const abrir = (m: Modo) => { setModo(m); setMotivo(''); setMotivoPendente(false); setPrevia(null); setAviso(null); };
  const pedeMotivo = modo === 'trocar' || modo === 'revogar';

  const chamar = async (simular: boolean): Promise<RespostaDoEndereco | null> => {
    const m = motivo.trim();
    if (pedeMotivo && !motivoValido(m)) { setMotivoPendente(true); return null; }
    setOcupado(true); setAviso(null);
    const r = modo === 'revogar' ? await api.revogar(clienteId, m, simular) : await api.gerar(clienteId, pedeMotivo ? m : null, simular);
    if (!vivo.current) return null;
    setOcupado(false);
    if (r.ok === false) { setAviso(r.erro); return null; }
    return r.dados;
  };
  const verPrevia = async () => { const p = await chamar(true); if (p) setPrevia(p); };
  const confirmar = async () => {
    const p = await chamar(false);
    if (!p) return;
    toast.success(modo === 'revogar' ? 'Endereço revogado.' : modo === 'trocar' ? 'Endereço trocado.' : 'Endereço gerado.');
    abrir('ver');
    await ler();
    aoMudar?.();
  };
  const copiar = () => {
    if (!atual?.endereco) return;
    void navigator.clipboard?.writeText(atual.endereco);
    toast.success('Endereço copiado.');
  };

  const temEndereco = !!atual?.endereco;
  const tituloDaAcao = modo === 'gerar' ? 'Gerar o endereço' : modo === 'trocar' ? 'Trocar o endereço' : modo === 'revogar' ? 'Revogar o endereço' : '';

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(760px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="endereco-de-boletos">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={clienteNome ?? undefined}>E-mail de boletos{clienteNome ? ` · ${clienteNome}` : ''}</DialogTitle>
          <DialogDescription className="sr-only">O endereço para onde o cliente encaminha os e-mails de boleto e o passo a passo.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 bg-muted p-2">
          {/* o endereço: altura fixa */}
          <section className="flex h-[74px] shrink-0 flex-col justify-center gap-1 rounded-md border bg-card px-3" data-testid="bloco-do-endereco">
            <span className="text-[10px] text-muted-foreground">Endereço deste cliente</span>
            {atual == null ? (
              <span className="text-[11px] text-muted-foreground">{erroDaLeitura ?? 'Carregando…'}</span>
            ) : temEndereco ? (
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 break-all text-[12px] font-semibold leading-tight text-primary" data-testid="endereco-atual">{atual.endereco}</span>
                <Button size="sm" variant="outline" className="h-[24px] shrink-0 text-[10px]" onClick={copiar} data-testid="copiar-endereco">Copiar</Button>
                <Button size="sm" variant="outline" className="h-[24px] shrink-0 text-[10px]" disabled={ocupado} onClick={() => abrir('trocar')} data-testid="trocar-endereco">Trocar</Button>
                <Button size="sm" variant="outline" className="h-[24px] shrink-0 text-[10px] text-red-700" disabled={ocupado} onClick={() => abrir('revogar')} data-testid="revogar-endereco">Revogar</Button>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 text-[11px]">Este cliente ainda não tem endereço de boletos.</span>
                <Button size="sm" className="h-[24px] shrink-0 text-[10px]" disabled={ocupado} onClick={() => abrir('gerar')} data-testid="gerar-endereco">Gerar endereço</Button>
              </div>
            )}
            <span className="text-[9.5px] text-muted-foreground">
              {temEndereco && atual?.criadoEm ? `Ativo desde ${dataBR(atual.criadoEm)}. ` : ''}Tudo o que chega aqui cai em &quot;Por e-mail&quot; na caixa, sempre a conferir.
            </span>
          </section>

          {/* a ação (prévia → confirmar): altura fixa, o mesmo lugar em todos os modos */}
          <section className="flex h-[92px] shrink-0 flex-col justify-center gap-1 rounded-md border bg-card px-3" data-testid="bloco-da-acao">
            {modo === 'ver' ? (
              <span className="text-[10px] text-muted-foreground">
                O cliente cria no e-mail dele UMA regra que encaminha só os e-mails de boleto para este endereço (passo a passo abaixo). Se o
                endereço vazar, troque: o antigo para de receber na hora.
              </span>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-[120px] shrink-0 text-[10.5px] font-semibold">{tituloDaAcao}</span>
                  {pedeMotivo ? (
                    <Input value={motivo} onChange={(e) => { setMotivo(e.target.value); setPrevia(null); if (motivoValido(e.target.value)) setMotivoPendente(false); }}
                      placeholder="motivo (ex.: o endereço foi divulgado)" aria-invalid={motivoPendente}
                      className={cn('h-[24px] min-w-0 flex-1 px-2 text-[10.5px]', motivoPendente && 'border-red-500 ring-1 ring-red-500')}
                      data-testid="motivo-do-endereco" />
                  ) : <span className="min-w-0 flex-1" />}
                  <Button size="sm" variant="outline" className="h-[24px] shrink-0 text-[10px]" onClick={() => abrir('ver')} disabled={ocupado}>Cancelar</Button>
                  {previa ? (
                    <Button size="sm" className={cn('h-[24px] w-[84px] shrink-0 text-[10px]', modo === 'revogar' && 'bg-red-700 hover:bg-red-800')} disabled={ocupado}
                      onClick={() => void confirmar()} data-testid="confirmar-endereco">Confirmar</Button>
                  ) : (
                    <Button size="sm" className="h-[24px] w-[84px] shrink-0 text-[10px]" disabled={ocupado} onClick={() => void verPrevia()} data-testid="previa-do-endereco">Ver a prévia</Button>
                  )}
                </div>
                <span className={cn('min-h-[28px] text-[10px] leading-snug', aviso || motivoPendente ? 'text-red-700' : 'text-foreground')} data-testid="frase-do-endereco">
                  {aviso ?? (motivoPendente ? FRASE_MOTIVO_OBRIGATORIO : previa ? fraseDaPrevia(modo, previa) : 'Nada muda até "Confirmar".')}
                </span>
              </>
            )}
          </section>

          {/* o passo a passo: o único que rola */}
          <section className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-md border bg-card p-2">
            <div className="flex h-[24px] shrink-0 items-center gap-2">
              <span className="shrink-0 text-[10.5px] font-semibold">Como encaminhar</span>
              <Segmentado valor={provedor} onEscolher={setProvedor} fonte={10} opcoes={PROVEDORES.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))} />
            </div>
            <ol className="min-h-0 flex-1 list-decimal space-y-1 overflow-auto pl-5 pr-1 text-[10.5px] leading-snug" data-testid="passos-do-encaminhamento" data-desloca-livre>
              {passosCom(provedor, atual?.endereco ?? null).map((p) => <li key={p} className="break-words">{p}</li>)}
            </ol>
          </section>
        </div>
        <div className="flex h-[34px] shrink-0 items-center justify-end border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
