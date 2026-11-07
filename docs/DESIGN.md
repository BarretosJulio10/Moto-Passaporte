# DESIGN — Moto Passaporte

Identidade visual derivada do próprio objeto: um **passaporte**. Tokens em `src/index.css` (`@theme`).

## Cores

| Token | Hex | Uso |
|---|---|---|
| `ink` | `#1C2B4A` | Azul de passaporte. Títulos, botões primários, seção de oficinas |
| `paper` | `#EEF1EA` | Fundo geral — papel de segurança levemente esverdeado |
| `sheet` | `#F8FAF5` | Superfícies (formulários, seções alternadas) |
| `brass` | `#B8902F` | Dourado do brasão. **Só decorativo** (emblema, numeração, foco) — contraste insuficiente para texto |
| `stamp` | `#5B3C8C` | Tinta de carimbo. Registros confirmados por oficina |
| `graphite` | `#24262B` | Texto principal |
| `muted` | `#555A52` | Texto secundário |
| `rule` | `#CDD3CA` | Fios e bordas |

### Cores de origem dos registros (PRD 5.5)
| Origem | Token | Cor |
|---|---|---|
| Informado pelo dono | `origin-owner` | grafite |
| Com comprovante | `origin-document` | azul |
| Confirmado por oficina | `origin-workshop` | tinta de carimbo |

Usar sempre estas cores para os selos de origem em qualquer tela (linha do tempo, PDF, página pública).

## Tipografia

Uma família: **Archivo** (variável, eixo de largura), servida localmente via `@fontsource-variable/archivo`.
- `.display` — largura 125, peso 780: títulos de abertura (lembra letreiro estampado de placa/chassi).
- `.heading` — largura 115, peso 700: títulos de seção.
- Texto corrido — largura 100.
- `.mrz` — monoespaçada, **somente** na zona de leitura mecânica do passaporte de exemplo.

## Princípios

1. **Uma peça memorável:** a página de passaporte com carimbos (`PassportSpecimen`). O resto é sóbrio.
2. **Estrutura de documento:** listas com fios finos (como campos de um documento), não cartões com sombra.
3. **Numeração só para sequências reais** (ex.: "Como funciona").
4. **Movimento único:** os carimbos "batem" na página ao carregar; desligado com `prefers-reduced-motion`.
5. **Sem promessas de certificação:** nada de "verificado", "garantido" ou "laudo" para dados do histórico.
6. **Placa nunca aparece em material público**, nem no exemplo.

## Componentes base

`src/components/`: `Logo`/`Emblem`, `Button`/`ButtonLink` (variantes `primary`, `secondary`, `quiet`; tamanhos `md`, `sm`), `TextField`, `CheckboxField`, `Notice` (`info`, `error`, `success`).

## Qualidade mínima

- Sem rolagem horizontal a partir de 360 px de largura (verificado com Playwright).
- Foco visível (contorno dourado), link "Pular para o conteúdo", rótulos associados a campos, erros ligados por `aria-describedby`.
