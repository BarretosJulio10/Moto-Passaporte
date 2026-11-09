# App da Google Play (TWA)

A "casca" Android que abre o site dentro do app (Trusted Web Activity, ADR-063).

- `twa-manifest.json`: pacote `br.com.motopassaporte.app`, abre em `/painel?origem=play` (modo loja).
- `build-twa.mjs`: gera o projeto Android com o Bubblewrap.
- Workflow `.github/workflows/android-twa.yml`: gera o `.aab` **sem assinatura** (API 36) e publica no ramo `twa-build`.
- A assinatura é feita fora do GitHub, com a chave de envio (upload key) guardada pelo responsável. A chave nunca vai para o repositório.

## Nova versão do app

Só é preciso quando muda algo da casca (ícone, nome, cores, versão do Android exigida pela Play).
O conteúdo do app é o site: mudanças no site aparecem no app sem nova versão.

1. Suba `appVersionCode` (+1) e `appVersionName` em `twa-manifest.json`.
2. Rode o workflow "Android (TWA)".
3. Assine: `jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore moto-passaporte-upload.jks app-release.aab motopassaporte`.
4. Envie o `.aab` na Play Console.

## assetlinks.json

`public/.well-known/assetlinks.json` precisa ter a impressão digital SHA-256 da chave de envio **e** da chave de assinatura da Google
(Play Console → Testar e lançar → Configuração → Integridade do app → Assinatura de apps). Sem isso o app abre com barra de endereço.
