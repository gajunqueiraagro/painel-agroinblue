/**
 * FISCAL onda 1 (a) · CADASTROS › PRODUTORES (gabarito: ui-validar/cadastro-produtor-mock.html, aprovado C1–C3 em 05/11; a onda 1 pelo
 * Gabriel em 09/11 10:36). O banco é o que já está no proto (117270/117280/117290); nenhuma migration nova.
 *
 * ⚠ DOIS LUGARES FIXOS: a lista dos titulares do cliente à esquerda (220–300 px pela janela: a 135% a ficha precisa de ~620 px; só ela rola) e a ficha à direita (abas sempre no mesmo
 * lugar; a que não vale fica APAGADA com o motivo). A tela não rola: cada aba rola só a tabela dela.
 * ⚠ SALVAR = PRÉVIA ANTES: o Salvar do rodapé vai ao banco com `p_simular = true`; a prévia mostra o que muda e as pendências ("cadastro
 * incompleto" é aviso, nunca bloqueio); "Gravar" repete com `false`. A recusa fica no rodapé (nunca toast).
 * ⚠ TODO GESTO TEM VOLTA: "Desfazer" (rodapé) devolve a ficha ao que era antes da ÚLTIMA gravação desta sessão, pelo mesmo gravador e com
 * prévia; "Inativar" é o cancelar (nada se apaga; o banco recusa se houver participação vigente, acordo ou conta ligada); "Reativar" volta.
 * ⚠ NOVO PRODUTOR: só a Identificação vale até o primeiro Salvar; depois a ficha segue aberta nele.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { TextoReservado } from '@/components/ui/regua-tabela';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { cn } from '@/lib/utils';
import {
  composicaoPorFazenda, dadosDoForm, formDoTitular, linhaDoTitular, pendenciasDoForm, seloDoTitular, tipoDoDocumento,
  type FormTitular, type Titular,
} from '@/lib/fiscal/produtores';
import { useAcordos, useContasDoCliente, useImoveis, useProdutoresApi, useTitulares } from '@/hooks/useProdutores';
import { useGestoComPrevia } from './PreviaDoBanco';
import { AbaCertificado, AbaContas, AbaFiscal, AbaGrupo, AbaIdentificacao } from './AbasDoProdutor';
import { AbaFazendas } from './FazendasDoProdutor';

type Aba = 'identificacao' | 'fazendas' | 'fiscal' | 'contas' | 'certificado' | 'grupo';
const TOM: Record<'verde' | 'ambar' | 'cinza', string> = {
  verde: 'bg-emerald-50 text-emerald-800', ambar: 'bg-amber-50 text-amber-800', cinza: 'bg-muted text-muted-foreground',
};
const par = (a: string, b: string): [string, string] => [a, b];
const TAG_TIPO: Record<'PF' | 'PJ', string> = { PF: 'bg-slate-100 text-slate-700', PJ: 'bg-violet-50 text-violet-800' };

export function ProdutoresTela() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { data: titulares = [], isLoading, error } = useTitulares(clienteId);
  const [selecionado, setSelecionado] = useState<string | 'novo' | null>(null);

  /* abre no primeiro titular; quem some da lista (troca de cliente) solta a seleção */
  useEffect(() => {
    if (selecionado === 'novo') return;
    if (selecionado && titulares.some(t => t.id === selecionado)) return;
    setSelecionado(titulares[0]?.id ?? null);
  }, [titulares, selecionado]);

  const titular = selecionado && selecionado !== 'novo' ? titulares.find(t => t.id === selecionado) ?? null : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background" data-testid="produtores-tela">
      <div className="flex h-[30px] shrink-0 items-center gap-2 px-4 pt-1">
        <p className="min-w-0 flex-1 whitespace-nowrap text-[10px] text-muted-foreground">quem responde pelo imposto: o destinatário da nota e quem declara o livro caixa</p>
        <Button size="sm" className="h-[24px] shrink-0 gap-1 bg-cta px-2.5 text-[11px] font-semibold text-cta-foreground hover:bg-cta-hover"
          disabled={!clienteId} title={clienteId ? undefined : 'Escolha um cliente primeiro'} onClick={() => setSelecionado('novo')} data-testid="produtores-novo">
          <Plus className="size-3.5" /> Produtor
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[clamp(220px,24vw,300px)_minmax(0,1fr)] gap-2 px-4 pb-2 pt-1">
        {/* A LISTA — duas linhas de altura fixa por titular; só ela rola */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card" data-testid="produtores-lista">
          <div className="flex h-[28px] shrink-0 items-center justify-between border-b px-2.5 text-[11px] font-semibold">
            <span>Produtores</span>
            <span className="text-[10px] font-normal tabular-nums text-muted-foreground">{titulares.length}</span>
          </div>
          {/* uma TABELA de uma coluna: o nome longo termina em "…" com o texto inteiro no title da célula (REGRA DE CORTE); o documento nunca corta */}
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            <table className="w-full table-fixed border-collapse">
              <tbody>
                {titulares.map(t => {
                  const selo = seloDoTitular(t);
                  const linha = linhaDoTitular(t);
                  const doc = `${t.tipo === 'PF' ? 'CPF' : 'CNPJ'} ${t.documento_formatado}`;
                  const resto = linha.startsWith(doc) ? linha.slice(doc.length) : '';
                  const inteiro = `${t.nome} · ${linha}${t.pendencias.length ? ` · cadastro incompleto: ${t.pendencias.join(', ')}` : ''}`;
                  return (
                    <tr key={t.id}>
                      <td className="p-0" title={inteiro}>
                        <button type="button" onClick={() => setSelecionado(t.id)} data-testid="produtores-item"
                          className={cn('grid h-[38px] w-full grid-cols-[minmax(0,1fr)_auto] content-center gap-x-2 border-l-[3px] px-2.5 text-left hover:bg-muted/50',
                            t.id === selecionado ? 'border-l-primary bg-primary/5' : 'border-l-transparent', !t.ativo && 'opacity-60')}>
                          {/* linha 1: o nome (cede) e os selos; linha 2: o documento inteiro, sempre (a 918 ele passava por baixo do selo) */}
                          <span className="truncate text-[11px] font-semibold leading-[15px]">{t.nome}</span>
                          <span className="flex items-center gap-1 justify-self-end">
                            <span className={cn('whitespace-nowrap rounded px-1 text-[9.5px] font-semibold leading-[14px]', TOM[selo.tom])}>{selo.texto}</span>
                            <span className={cn('rounded px-1 text-[9.5px] font-semibold leading-[14px]', TAG_TIPO[t.tipo])}>{t.tipo}</span>
                          </span>
                          <span className="col-span-2 flex min-w-0 text-[10px] leading-[15px] text-muted-foreground">
                            <span className="flex-none whitespace-nowrap tabular-nums">{doc}</span>
                            <span className="min-w-0 truncate whitespace-pre">{resto}</span>
                            {t.pendencias.length ? <span className="flex-none whitespace-pre text-amber-700"> · incompleto</span> : null}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {titulares.length === 0 && (
                  <tr><td className="px-2.5 py-4 text-center text-[10px] text-muted-foreground">
                    {isLoading ? 'Carregando…' : error ? 'Não consegui ler os produtores. Tente de novo.' : 'Nenhum produtor cadastrado: use “+ Produtor”.'}
                  </td></tr>
                )}
                {selecionado === 'novo' && (
                  <tr><td className="p-0">
                    <div className="grid h-[38px] grid-cols-[minmax(0,1fr)_auto] content-center border-l-[3px] border-l-primary bg-primary/5 px-2.5">
                      <span className="text-[11px] font-semibold leading-[15px]">Novo produtor</span>
                      <span className="text-[10px] leading-[15px] text-muted-foreground">ainda não gravado</span>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* A FICHA */}
        {clienteId && (selecionado === 'novo' || titular) ? (
          <FichaDoProdutor key={selecionado === 'novo' ? 'novo' : titular?.id} titular={titular} titulares={titulares} clienteId={clienteId}
            aoCriar={id => setSelecionado(id)} />
        ) : (
          <section className="flex min-h-0 items-center justify-center rounded-lg border bg-card text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{clienteId ? 'Escolha um produtor ou cadastre um novo.' : 'Escolha um cliente primeiro.'}</span>
          </section>
        )}
      </div>
    </div>
  );
}

function FichaDoProdutor({ titular, titulares, clienteId, aoCriar }: { titular: Titular | null; titulares: readonly Titular[]; clienteId: string; aoCriar: (id: string) => void }) {
  const api = useProdutoresApi();
  const { fazendas: todasFazendas } = useFazenda();
  const fazendas = useMemo(() => todasFazendas.filter(f => f.id !== '__global__').map(f => ({ id: f.id, nome: f.nome })), [todasFazendas]);
  const { data: acordos = [] } = useAcordos(clienteId);
  const { data: imoveis = [] } = useImoveis(clienteId);
  const { data: contas = [] } = useContasDoCliente(clienteId);
  const nomes = useMemo(() => new Map<string, string>([...titulares.map(t => par(t.id, t.nome)), ...fazendas.map(f => par(f.id, f.nome))]), [titulares, fazendas]);
  const gesto = useGestoComPrevia(nomes);
  const composicao = useMemo(() => composicaoPorFazenda(titulares), [titulares]);

  const base = useMemo(() => formDoTitular(titular), [titular]);
  const [form, setForm] = useState<FormTitular>(base);
  const [aba, setAba] = useState<Aba>('identificacao');
  const [erros, setErros] = useState<Partial<Record<'nome' | 'documento' | 'ies', string>>>({});
  const [rodape, setRodape] = useState<string | null>(null);
  /** a ficha como era ANTES da última gravação desta sessão (o Desfazer); nula = nada a desfazer */
  const [anterior, setAnterior] = useState<FormTitular | null>(null);
  const mudou = useMemo(() => Object.keys(dadosDoForm(titular ? base : null, form)).length > 0, [base, form, titular]);

  /* a ficha relida do banco (depois de gravar) substitui o formulário se o operador não está no meio de uma edição */
  const [baseVista, setBaseVista] = useState(base);
  useEffect(() => {
    if (base === baseVista) return;
    setBaseVista(base);
    if (!Object.keys(dadosDoForm(baseVista, form)).length || !titular) setForm(base);
  }, [base, baseVista, form, titular]);

  const set = <K extends keyof FormTitular>(k: K, v: FormTitular[K]) => {
    setForm(f => ({ ...f, [k]: v })); setRodape(null); setErros(e => ({ ...e, [k]: undefined }));
  };

  const salvar = async () => {
    const pend = pendenciasDoForm(form);
    if (Object.keys(pend).length) { setErros(pend); setRodape(Object.values(pend)[0] ?? null); setAba('identificacao'); return; }
    const dados = dadosDoForm(titular ? base : null, form);
    if (titular && !Object.keys(dados).length) { setRodape('Nada mudou.'); return; }
    const antes = titular ? base : null;
    const e = await gesto.previa(titular ? `${titular.nome} · salvar a ficha` : 'Novo produtor', s => api.gravarTitular(clienteId, titular?.id ?? null, dados, s),
      r => {
        if (antes) setAnterior(antes);
        const id = r && typeof r === 'object' && 'titular_id' in r && typeof r.titular_id === 'string' ? r.titular_id : null;
        if (!titular && id) aoCriar(id);
      });
    setRodape(e);
  };
  const desfazer = async () => {
    if (!titular || !anterior) return;
    const dados = dadosDoForm(base, anterior);
    if (!Object.keys(dados).length) { setAnterior(null); return; }
    setRodape(await gesto.previa(`${titular.nome} · desfazer a última gravação`, s => api.gravarTitular(clienteId, titular.id, dados, s), () => setAnterior(null)));
  };
  const trocarAtivo = async () => {
    if (!titular) return;
    setRodape(await gesto.previa(`${titular.nome} · ${titular.ativo ? 'inativar' : 'reativar'}`,
      s => api.gravarTitular(clienteId, titular.id, { ativo: !titular.ativo }, s)));
  };

  const novo = !titular;
  const terceiro = (titular?.papel ?? form.papel) === 'terceiro';
  const motivoNovo = 'salve o produtor primeiro';
  /* abaixo de 1000px as seis abas não cabem com o nome inteiro (a 918 a Grupo saía da ficha): o nome curto, o inteiro no title */
  const curtas = useLarguraDaJanela() < 1000;
  const abas: Array<{ valor: Aba; rotulo: string; curto?: string; desabilitada?: boolean; title?: string; n?: number }> = [
    { valor: 'identificacao', rotulo: 'Identificação' },
    { valor: 'fazendas', rotulo: 'Fazendas e participação', curto: 'Fazendas', desabilitada: novo, title: novo ? motivoNovo : undefined, n: titular?.fazendas.length },
    { valor: 'fiscal', rotulo: 'Fiscal e Reforma', curto: 'Fiscal', desabilitada: novo, title: novo ? motivoNovo : undefined },
    { valor: 'contas', rotulo: 'Contas bancárias', curto: 'Contas', desabilitada: novo, title: novo ? motivoNovo : undefined, n: titular?.contas.length },
    { valor: 'certificado', rotulo: 'Certificado digital', curto: 'Certificado' },
    { valor: 'grupo', rotulo: 'Grupo', desabilitada: novo || terceiro, title: novo ? motivoNovo : terceiro ? 'o grupo é só do produtor' : undefined, n: titular?.grupo.length },
  ];
  const tipo = titular?.tipo ?? tipoDoDocumento(form.documento);
  const selo = titular ? seloDoTitular(titular) : null;

  return (
    <section className="flex min-h-0 flex-col overflow-clip rounded-lg border bg-card" data-testid="produtor-ficha">
      <div className="flex h-[30px] shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 truncate text-[12px] font-semibold" title={titular?.nome}>{titular?.nome ?? 'Novo produtor'}</span>
        {tipo && <span className={cn('rounded px-1 text-[9.5px] font-semibold leading-[14px]', TAG_TIPO[tipo])}>{tipo}</span>}
        {selo && <span className={cn('whitespace-nowrap rounded px-1 text-[9.5px] font-semibold leading-[14px]', TOM[selo.tom])}>{selo.texto}</span>}
        {titular && titular.pendencias.length > 0 && (
          <span className="min-w-0 truncate text-[10px] text-amber-700" title={titular.pendencias.join(' · ')}>cadastro incompleto: {titular.pendencias.length}</span>
        )}
      </div>
      <div className="flex h-[32px] shrink-0 items-center border-b px-3">
        <Segmentado altura={22} fonte={10} valor={aba} onEscolher={setAba} opcoes={abas.map(a => ({
          valor: a.valor, desabilitada: a.desabilitada, title: a.title ?? (curtas && a.curto ? a.rotulo : undefined),
          rotulo: a.n != null ? <span>{curtas && a.curto ? a.curto : a.rotulo} <TextoReservado texto={a.desabilitada ? '' : String(a.n)} reserva="99" className="ml-0.5 text-[9.5px] opacity-80" /></span> : curtas && a.curto ? a.curto : a.rotulo,
        }))} />
      </div>
      {/* o miolo de cada aba troca de propósito (outros blocos): título, abas e rodapé ficam medidos. Ele ROLA no lugar dele: a 918×516 a
          Identificação não cabe, e sem isso ela passava por baixo do rodapé e fazia a página rolar (a ficha andava 7 px ao trocar de aba) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted p-2 [scrollbar-gutter:stable]" data-testid={`produtor-aba-${aba}-miolo`} data-desloca-livre="">
        {aba === 'identificacao' && <AbaIdentificacao form={form} set={set} erros={erros} fazendas={fazendas} />}
        {aba === 'fazendas' && titular && (
          <AbaFazendas titular={titular} titulares={titulares} fazendas={fazendas} imoveis={imoveis} composicao={composicao} acordos={acordos} clienteId={clienteId} previa={gesto.previa} />
        )}
        {aba === 'fiscal' && titular && <AbaFiscal titular={titular} clienteId={clienteId} form={form} set={set} previa={gesto.previa} />}
        {aba === 'contas' && titular && <AbaContas titular={titular} contas={contas} previa={gesto.previa} />}
        {aba === 'certificado' && <AbaCertificado />}
        {aba === 'grupo' && titular && <AbaGrupo titular={titular} titulares={titulares} previa={gesto.previa} />}
      </div>
      {/* O RODAPÉ — a frase (pendência/recusa) no lugar reservado; Inativar · Desfazer · Salvar à direita */}
      <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
        <p className={cn('min-w-0 flex-1 truncate text-[10px]', rodape ? 'text-destructive' : 'text-muted-foreground')} title={rodape ?? undefined} data-testid="produtor-rodape">
          {rodape ?? (mudou ? 'há mudanças não gravadas: Salvar mostra a prévia' : '')}
        </p>
        {titular && (
          <Button variant="outline" size="sm" className="h-[26px] w-[74px] text-[11px]" onClick={() => void trocarAtivo()} disabled={gesto.indo}
            title={titular.ativo ? 'nada se apaga: o titular fica inativo (o banco recusa se houver participação, acordo ou conta)' : 'volta a valer'}
            data-testid="produtor-ativo">{titular.ativo ? 'Inativar' : 'Reativar'}</Button>
        )}
        <Button variant="outline" size="sm" className="h-[26px] w-[74px] text-[11px]" onClick={() => void desfazer()} disabled={!anterior || gesto.indo}
          title={anterior ? 'volta a ficha ao que era antes da última gravação (com prévia)' : 'nada gravado nesta sessão'} data-testid="produtor-desfazer">Desfazer</Button>
        <Button size="sm" className="h-[26px] w-[72px] text-[11px]" disabled={gesto.indo || (!!titular && !mudou)} onClick={() => void salvar()}
          title={titular && !mudou ? 'nada mudou' : 'mostra a prévia antes de gravar'} data-testid="produtor-salvar">Salvar</Button>
      </div>
      {gesto.dialogo}
    </section>
  );
}
