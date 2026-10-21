import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  conferirCadastro, reativarDoCadastro, preencherDocumentoDoCadastro, fraseDoDocumento, fraseDoInativo, fraseDaFilial, fraseDoHomonimoSemDocumento,
  FRASE_JA_EXISTE,
  type FonteDoCadastro, type FornecedorDoCadastro,
} from '@/lib/fornecedores/cadastroDaCasa';
import { fonteDoCadastroNoBanco } from '@/lib/fornecedores/cadastroDaCasaBanco';
import { mascararAoDigitar, validarDocumento } from '@/lib/fornecedores/documentoFiscal';

/**
 * O CADASTRO DA CASA — o "+" de todo seletor de fornecedor abre ESTE diálogo.
 *
 * FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a: ele NÃO DUPLICA. Antes de criar pergunta à regra única
 * (`src/lib/fornecedores/cadastroDaCasa.ts`): nome que já existe ATIVO é só selecionado; nome que existe INATIVO oferece
 * reativar; CPF/CNPJ que já é de outro fornecedor ativo mostra de quem é e oferece selecioná-lo. Só sem nada disso chama o
 * `onSave` do hospedeiro, que cria como sempre (com a fazenda que a tela passar).
 * ⚠ NENHUMA TELA REIMPLEMENTA: o hospedeiro só diz o que fazer com o fornecedor escolhido (`onSelecionar`).
 * ⚠ TAMANHO FIXO: o recado tem lugar reservado (duas linhas) e a linha dos botões tem a mesma altura em todo estado; aviso e
 *   recusa ficam ali, ao lado do botão — nunca em toast.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** O cliente em que o fornecedor é procurado e criado. Sem ele o diálogo não grava. */
  clienteId: string | null | undefined;
  /** Cria (o caminho de sempre do hospedeiro). Só é chamado quando a regra diz que pode criar. */
  onSave: (nome: string, cpfCnpj?: string) => Promise<void>;
  /** O fornecedor que JÁ EXISTIA foi o escolhido (o de mesmo nome, o reativado ou o dono do documento). Não fecha o diálogo. */
  onSelecionar: (fornecedor: FornecedorDoCadastro) => void | Promise<void>;
  defaultNome?: string;
  /** só para teste: a fonte do cadastro (padrão: o banco) */
  fonte?: FonteDoCadastro;
}

type Estado =
  | { tipo: 'form' }
  | { tipo: 'selecionado' }
  | { tipo: 'inativo'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'documento'; fornecedor: FornecedorDoCadastro }
  /* FORN-FILIAL-01 — outra filial (mesmo nome, CNPJ diferente): o aviso diz qual já existe, e "Criar este cadastro" grava */
  | { tipo: 'filial'; fornecedor: FornecedorDoCadastro }
  /* FORN-FILIAL-01 — o homônimo não tem documento: preencher o CNPJ nele, ou criar outro */
  | { tipo: 'homonimo'; fornecedor: FornecedorDoCadastro };

export function NovoFornecedorDialog({ open, onClose, clienteId, onSave, onSelecionar, defaultNome, fonte = fonteDoCadastroNoBanco }: Props) {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [saving, setSaving] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'form' });
  const [recado, setRecado] = useState<{ texto: string; tom: 'aviso' | 'erro' | 'ok' } | null>(null);

  useEffect(() => {
    if (open) {
      setNome(defaultNome || '');
      setCpfCnpj('');
      setEstado({ tipo: 'form' });
      setRecado(null);
    }
  }, [open, defaultNome]);

  const limpar = () => { setNome(''); setCpfCnpj(''); setEstado({ tipo: 'form' }); setRecado(null); };
  const voltarAoFormulario = () => { setEstado({ tipo: 'form' }); setRecado(null); };

  /* FORN-EDITAR-01 — o documento pelo validador único: inválido trava o Salvar, e o motivo vai no lugar reservado do recado */
  const documento = validarDocumento(cpfCnpj);

  const handleSubmit = async () => {
    if (!nome.trim() || saving || !documento.valido) return;
    if (!clienteId) { setRecado({ texto: 'Selecione o cliente antes de cadastrar o fornecedor.', tom: 'erro' }); return; }
    setSaving(true);
    const r = await conferirCadastro(fonte, clienteId, { nome: nome.trim(), cpfCnpj: documento.formatado });
    if (r.tipo === 'erro') { setRecado({ texto: r.frase, tom: 'erro' }); setSaving(false); return; }
    if (r.tipo === 'ja_existe') {
      await onSelecionar(r.fornecedor);
      setEstado({ tipo: 'selecionado' });
      setRecado({ texto: FRASE_JA_EXISTE, tom: 'ok' });
      setSaving(false);
      return;
    }
    if (r.tipo === 'inativo') {
      setEstado({ tipo: 'inativo', fornecedor: r.fornecedor });
      setRecado({ texto: fraseDoInativo(r.fornecedor), tom: 'aviso' });
      setSaving(false);
      return;
    }
    if (r.tipo === 'documento_de_outro') {
      setEstado({ tipo: 'documento', fornecedor: r.fornecedor });
      setRecado({ texto: fraseDoDocumento(r.fornecedor), tom: 'aviso' });
      setSaving(false);
      return;
    }
    if (r.tipo === 'filial') {
      setEstado({ tipo: 'filial', fornecedor: r.fornecedor });
      setRecado({ texto: fraseDaFilial(r.fornecedor), tom: 'aviso' });
      setSaving(false);
      return;
    }
    if (r.tipo === 'homonimo_sem_documento') {
      setEstado({ tipo: 'homonimo', fornecedor: r.fornecedor });
      setRecado({ texto: fraseDoHomonimoSemDocumento(r.fornecedor, documento.formatado ?? cpfCnpj), tom: 'aviso' });
      setSaving(false);
      return;
    }
    await criar();
  };

  /* o criar do hospedeiro que FALHA com exceção: o motivo fica aqui, ao lado do botão, e o digitado fica */
  const criar = async () => {
    setSaving(true);
    try {
      await onSave(nome.trim(), documento.formatado || undefined);
    } catch (e) {
      setRecado({ texto: `Não foi possível cadastrar o fornecedor. (${e instanceof Error ? e.message : String(e)})`, tom: 'erro' });
      setSaving(false);
      return;
    }
    setSaving(false);
    setNome('');
    setCpfCnpj('');
    setEstado({ tipo: 'form' });
  };

  /* FORN-FILIAL-01 — "Preencher naquele cadastro": grava o CNPJ no homônimo sem documento e o seleciona */
  const preencherNaquele = async (f: FornecedorDoCadastro) => {
    if (!clienteId || saving || !documento.formatado) return;
    setSaving(true);
    const r = await preencherDocumentoDoCadastro(fonte, clienteId, f, documento.formatado);
    if (r.ok === false) { setRecado({ texto: r.frase, tom: 'erro' }); setSaving(false); return; }
    await onSelecionar(r.fornecedor);
    setSaving(false);
    limpar();
    onClose();
  };

  const reativar = async (f: FornecedorDoCadastro) => {
    if (!clienteId || saving) return;
    setSaving(true);
    const r = await reativarDoCadastro(fonte, clienteId, f);
    if (r.ok === false) { setRecado({ texto: r.frase, tom: 'erro' }); setSaving(false); return; }
    await onSelecionar(r.fornecedor);
    setSaving(false);
    limpar();
    onClose();
  };

  const selecionarODono = async (f: FornecedorDoCadastro) => {
    if (saving) return;
    setSaving(true);
    await onSelecionar(f);
    setSaving(false);
    limpar();
    onClose();
  };

  const travado = estado.tipo !== 'form';
  const corDoRecado = recado?.tom === 'erro' ? 'text-destructive' : recado?.tom === 'ok' ? 'text-emerald-700' : 'text-amber-700';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); limpar(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Fornecedor</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cadastre um novo fornecedor ou frigorífico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => { setNome(e.target.value); setRecado(null); }} className="h-9" placeholder="Nome do fornecedor" autoFocus disabled={travado} />
          </div>
          <div>
            <Label className="text-xs">CPF/CNPJ</Label>
            <Input value={cpfCnpj} onChange={e => { setCpfCnpj(mascararAoDigitar(e.target.value)); setRecado(null); }}
              className={`h-9 ${documento.valido ? '' : 'border-destructive'}`} placeholder="Opcional" disabled={travado}
              aria-invalid={!documento.valido || undefined} />
          </div>
          {/* o recado tem lugar RESERVADO (duas linhas): o diálogo não muda de tamanho com aviso, recusa ou nada */}
          <div data-testid="novo-fornecedor-recado" title={recado?.texto ?? (documento.motivo || undefined)}
            className={`h-[30px] overflow-hidden text-[11px] leading-[15px] ${recado ? corDoRecado : 'text-destructive'}`}>
            {recado?.texto ?? documento.motivo ?? ''}
          </div>
          <div className="flex h-10 items-center gap-2">
            {estado.tipo === 'form' && (
              <Button onClick={handleSubmit} disabled={saving || !nome.trim() || !documento.valido} className="w-full">
                {saving ? 'Salvando...' : 'Salvar Fornecedor'}
              </Button>
            )}
            {estado.tipo === 'selecionado' && (
              <Button onClick={() => { limpar(); onClose(); }} className="w-full">Fechar</Button>
            )}
            {estado.tipo === 'inativo' && (<>
              <Button onClick={() => reativar(estado.fornecedor)} disabled={saving} className="min-w-0 flex-1">
                {saving ? 'Reativando...' : 'Reativar e selecionar'}
              </Button>
              <Button variant="outline" onClick={voltarAoFormulario} disabled={saving} className="shrink-0">Não reativar</Button>
            </>)}
            {estado.tipo === 'filial' && (<>
              <Button onClick={() => void criar()} disabled={saving} className="min-w-0 flex-1" data-testid="novo-fornecedor-criar-filial">
                {saving ? 'Salvando...' : 'Criar este cadastro'}
              </Button>
              <Button variant="outline" onClick={voltarAoFormulario} disabled={saving} className="shrink-0">Voltar</Button>
            </>)}
            {estado.tipo === 'homonimo' && (<>
              <Button onClick={() => void preencherNaquele(estado.fornecedor)} disabled={saving} className="min-w-0 flex-1" data-testid="novo-fornecedor-preencher">
                {saving ? 'Gravando...' : 'Preencher naquele'}
              </Button>
              <Button variant="outline" onClick={() => void criar()} disabled={saving} className="shrink-0" data-testid="novo-fornecedor-criar-outro">Criar outro</Button>
            </>)}
            {estado.tipo === 'documento' && (<>
              <Button onClick={() => selecionarODono(estado.fornecedor)} disabled={saving} className="min-w-0 flex-1" title={`Selecionar ${estado.fornecedor.nome}`}>
                <span className="truncate">Selecionar {estado.fornecedor.nome}</span>
              </Button>
              <Button variant="outline" onClick={voltarAoFormulario} disabled={saving} className="shrink-0">Voltar</Button>
            </>)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
