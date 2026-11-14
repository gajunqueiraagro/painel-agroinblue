-- NOTAS-RECEITA-A1-01 · F2 (GO do Gabriel 13/11 para o bucket privado) — o bucket do certificado A1 CIFRADO.
--   · PRIVADO (`public = false`) e SEM policy em `storage.objects`: `authenticated` e `anon` não leem, não listam, não gravam; só o
--     service_role (a função de borda `fiscal-certificado-subir`) entra. Conferido em 13/11: todas as policies de `storage.objects` do proto
--     são presas ao próprio bucket (fin-/oc-/pec-documentos) — nenhuma regra genérica abre este.
--   · o que entra é o .pfx CIFRADO (AES-GCM, IV na frente), como `application/octet-stream`; o .pfx tem até 64 KB → limite de 128 KB.
--   · o segredo da chave-mestra e o deploy da borda NÃO são criados aqui (cada um com o próprio GO).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiscal-certificados', 'fiscal-certificados', false, 131072, array['application/octet-stream']);
