import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Save, FileText, Share2, Pencil, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import logoUrl from '@/assets/logo.png';
import { PastosTab } from './PastosTab';

interface CadastroData {
  id?: string;
  municipio: string;
  ie: string;
  proprietario_nome: string;
  cpf_cnpj: string;
  endereco: string;
  email: string;
  telefone: string;
  banco: string;
  pix: string;
  area_total: string;
  area_produtiva: string;
  inscricao_rural: string;
  roteiro: string;
}

const EMPTY: CadastroData = {
  municipio: '', ie: '', proprietario_nome: '', cpf_cnpj: '', endereco: '',
  email: '', telefone: '', banco: '', pix: '',
  area_total: '', area_produtiva: '', inscricao_rural: '', roteiro: '',
};

function loadLogoBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = logoUrl;
  });
}

export function CadastrosTab() {
  const { fazendaAtual } = useFazenda();
  const [data, setData] = useState<CadastroData>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  useEffect(() => {
    loadLogoBase64().then(setLogoBase64).catch(() => setLogoBase64(null));
  }, []);

  const load = useCallback(async () => {
    if (!fazendaAtual) return;
    setLoading(true);
    const { data: row } = await supabase
      .from('fazenda_cadastros')
      .select('*')
      .eq('fazenda_id', fazendaAtual.id)
      .maybeSingle();
    if (row) {
      setData({
        id: row.id,
        municipio: (row as any).municipio || '',
        ie: row.ie || '',
        proprietario_nome: row.proprietario_nome || '',
        cpf_cnpj: row.cpf_cnpj || '',
        endereco: row.endereco || '',
        email: row.email || '',
        telefone: row.telefone || '',
        banco: row.banco || '',
        pix: row.pix || '',
        area_total: row.area_total ? String(row.area_total) : '',
        area_produtiva: row.area_produtiva ? String(row.area_produtiva) : '',
        inscricao_rural: row.inscricao_rural || '',
        roteiro: row.roteiro || '',
      });
      setEditing(false);
    } else {
      setData(EMPTY);
      setEditing(true);
    }
    setLoading(false);
  }, [fazendaAtual]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!fazendaAtual) return;
    setSaving(true);
    const payload = {
      fazenda_id: fazendaAtual.id,
      municipio: data.municipio || null,
      ie: data.ie || null,
      proprietario_nome: data.proprietario_nome || null,
      cpf_cnpj: data.cpf_cnpj || null,
      endereco: data.endereco || null,
      email: data.email || null,
      telefone: data.telefone || null,
      banco: data.banco || null,
      pix: data.pix || null,
      area_total: data.area_total ? Number(data.area_total) : null,
      area_produtiva: data.area_produtiva ? Number(data.area_produtiva) : null,
      inscricao_rural: data.inscricao_rural || null,
      roteiro: data.roteiro || null,
    };

    let error;
    if (data.id) {
      ({ error } = await supabase.from('fazenda_cadastros').update(payload).eq('id', data.id));
    } else {
      const res = await supabase.from('fazenda_cadastros').insert(payload).select().single();
      error = res.error;
      if (res.data) setData(prev => ({ ...prev, id: res.data.id }));
    }

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Cadastro salvo!');
      setEditing(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!data.id) return;
    if (!confirm('Tem certeza que deseja apagar todos os dados de cadastro?')) return;
    const { error } = await supabase.from('fazenda_cadastros').delete().eq('id', data.id);
    if (error) {
      toast.error('Erro ao apagar: ' + error.message);
    } else {
      setData(EMPTY);
      setEditing(true);
      toast.success('Cadastro apagado!');
    }
  };

  const field = (label: string, key: keyof CadastroData, type = 'text', placeholder = '') => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={data[key] || ''}
          onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder || label}
          className="h-9 text-sm"
        />
      ) : (
        <p className="text-sm font-medium text-foreground min-h-[36px] flex items-center px-3 py-2 rounded-md bg-muted/50">
          {data[key] || <span className="text-muted-foreground italic">—</span>}
        </p>
      )}
    </div>
  );

  const downloadPdf = (doc: jsPDF, fileName: string) => {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    try {
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isEmbedded = window.self !== window.top;
      if (isMobile || isEmbedded) {
        const dataUri = doc.output('datauristring');
        const openInSameTab = document.createElement('a');
        openInSameTab.href = dataUri;
        openInSameTab.target = '_self';
        openInSameTab.rel = 'noopener noreferrer';
        openInSameTab.style.display = 'none';
        document.body.appendChild(openInSameTab);
        openInSameTab.click();
        document.body.removeChild(openInSameTab);
        toast.info('Se não baixar automático, o PDF foi aberto para salvar/compartilhar.');
      }
    } catch (error) {
      console.error('Erro ao iniciar download do PDF:', error);
      toast.error('Não foi possível iniciar o download do PDF.');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };

  const normalizePdfText = (value?: string) => {
    if (!value) return '—';
    const normalizedSpaces = value.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
    const fixedSpacedChars = normalizedSpaces.replace(/(?:\b[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}]\b/gu, (match) => match.replace(/\s+/g, ''));
    return fixedSpacedChars || '—';
  };

  const preventOverflow = (value: string) => value.replace(/(\S{24})(?=\S)/g, '$1 ');

  const drawPdfHeader = (doc: jsPDF, title: string) => {
    const pageW = doc.internal.pageSize.getWidth();
    let y = 10;
    if (logoBase64) {
      const logoH = 14;
      const logoW = logoH * 2;
      doc.addImage(logoBase64, 'PNG', pageW / 2 - logoW / 2, y, logoW, logoH);
      y += logoH + 6;
    }
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageW / 2, y, { align: 'center' });
    return y + 12;
  };

  const drawLabeledRows = (doc: jsPDF, rows: Array<[string, string | undefined]>, startY: number, options?: { preserveLineBreaks?: boolean }) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 18;
    const labelWidth = 42;
    const lineHeight = 6;
    const rowGap = 2;
    let y = startY;

    rows.forEach(([label, raw]) => {
      const normalized = options?.preserveLineBreaks
        ? (raw || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').split('\n').map(part => normalizePdfText(part)).filter(Boolean).join('\n') || '—'
        : normalizePdfText(raw);
      const wrapped = doc.splitTextToSize(preventOverflow(normalized), pageW - marginX * 2 - labelWidth);
      const requiredHeight = Math.max(lineHeight, wrapped.length * lineHeight) + rowGap;
      if (y + requiredHeight > pageH - 18) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(wrapped, marginX + labelWidth, y);
      y += requiredHeight;
    });
    return y;
  };

  const generateRoteiroPDF = () => {
    try {
      const doc = new jsPDF();
      let y = drawPdfHeader(doc, 'Roteiro para Embarque');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      y = drawLabeledRows(doc, [
        ['Fazenda', fazendaAtual?.nome || ''],
        ['Município', data.municipio],
        ['IE', data.ie],
        ['Proprietário', data.proprietario_nome],
        ['Roteiro', data.roteiro],
      ], y, { preserveLineBreaks: true });
      downloadPdf(doc, `roteiro_${fazendaAtual?.nome || 'fazenda'}.pdf`);
      toast.success('PDF do roteiro exportado!');
    } catch (error) {
      console.error('Erro ao exportar PDF de roteiro:', error);
      toast.error('Não foi possível exportar o PDF do roteiro.');
    }
  };

  const generateCadastroPDF = () => {
    try {
      const doc = new jsPDF();
      const y = drawPdfHeader(doc, 'Dados para Cadastro');
      doc.setFontSize(11);
      drawLabeledRows(doc, [
        ['Fazenda', fazendaAtual?.nome || ''],
        ['Município', data.municipio],
        ['IE', data.ie],
        ['Proprietário', data.proprietario_nome],
        ['CPF/CNPJ', data.cpf_cnpj],
        ['Endereço', data.endereco],
        ['Email', data.email],
        ['Telefone', data.telefone],
      ], y);
      downloadPdf(doc, `cadastro_${fazendaAtual?.nome || 'fazenda'}.pdf`);
      toast.success('PDF do cadastro exportado!');
    } catch (error) {
      console.error('Erro ao exportar PDF de cadastro:', error);
      toast.error('Não foi possível exportar o PDF do cadastro.');
    }
  };

  const shareWhatsApp = (type: 'roteiro' | 'cadastro') => {
    const nome = fazendaAtual?.nome || '';
    let text = '';
    if (type === 'roteiro') {
      text = `*Roteiro para Embarque*\n\n*Fazenda:* ${nome}\n*Município:* ${data.municipio || '—'}\n*IE:* ${data.ie || '—'}\n*Proprietário:* ${data.proprietario_nome || '—'}\n*Roteiro:* ${data.roteiro || '—'}`;
    } else {
      text = `*Dados para Cadastro*\n\n*Fazenda:* ${nome}\n*Município:* ${data.municipio || '—'}\n*IE:* ${data.ie || '—'}\n*Proprietário:* ${data.proprietario_nome || '—'}\n*CPF/CNPJ:* ${data.cpf_cnpj || '—'}\n*Endereço:* ${data.endereco || '—'}\n*Email:* ${data.email || '—'}\n*Telefone:* ${data.telefone || '—'}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) return <div className="p-4 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="pb-24 pt-2 px-3 max-w-lg mx-auto space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        {!editing && data.id && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Apagar
            </Button>
          </>
        )}
        {editing && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        )}
      </div>

      <Accordion type="multiple" defaultValue={['codigo', 'dados', 'contato', 'bancario', 'roteiro', 'pastos']} className="space-y-2">
        {/* Código da Fazenda */}
        <AccordionItem value="codigo" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-bold">🏷️ Código da Fazenda</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            <CodigoFazendaField fazendaAtual={fazendaAtual} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dados" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-bold">🏠 Dados da Fazenda</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            {field('Município', 'municipio')}
            {field('Inscrição Estadual (IE)', 'ie')}
            {field('Nome do Proprietário', 'proprietario_nome')}
            {field('CPF ou CNPJ', 'cpf_cnpj')}
            {field('Área Total (ha)', 'area_total', 'number', 'Hectares')}
            {field('Área Produtiva (ha)', 'area_produtiva', 'number', 'Hectares')}
            {field('Inscrição Rural (IR)', 'inscricao_rural')}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="contato" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-bold">📍 Contato e Endereço</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            {field('Endereço para Correspondência', 'endereco')}
            {field('Email', 'email', 'email')}
            {field('Telefone', 'telefone', 'tel')}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bancario" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-bold">🏦 Dados Bancários</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            {field('Banco', 'banco')}
            {field('PIX', 'pix')}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="roteiro" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-bold">🚛 Roteiro</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Roteiro para Embarque</Label>
              {editing ? (
                <Textarea
                  value={data.roteiro}
                  onChange={e => setData(prev => ({ ...prev, roteiro: e.target.value }))}
                  placeholder="Descreva o roteiro de acesso à fazenda..."
                  className="text-sm min-h-[100px]"
                />
              ) : (
                <p className="text-sm font-medium text-foreground min-h-[36px] px-3 py-2 rounded-md bg-muted/50 whitespace-pre-wrap">
                  {data.roteiro || <span className="text-muted-foreground italic">—</span>}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={generateRoteiroPDF} className="flex-1">
                <FileText className="h-4 w-4 mr-1 text-destructive" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => shareWhatsApp('roteiro')} className="flex-1">
                <Share2 className="h-4 w-4 mr-1 text-success" /> WhatsApp
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pastos" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-bold">
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Pastos
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-0 pb-0">
            <PastosTab />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Separator />

      {/* Export: Cadastro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exportar Dados para Cadastro</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generateCadastroPDF} className="flex-1">
            <FileText className="h-4 w-4 mr-1 text-destructive" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => shareWhatsApp('cadastro')} className="flex-1">
            <Share2 className="h-4 w-4 mr-1 text-success" /> WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
