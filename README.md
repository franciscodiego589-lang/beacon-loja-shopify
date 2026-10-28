# Beacon Labs — loja Shopify

Loja virtual da Beacon Labs, marca de suplementos alimentares de Cuiabá (MT), publicada em **https://beaconlabs.com.br**.

Este repositório guarda uma cópia da loja tirada em 28/10/2026:

- [`tema/`](tema/) — código completo do tema publicado, «Beacon Labs v3 (opção B vidro)», baixado da loja com a Shopify CLI.
- [`catalogo/`](catalogo/) — os 16 produtos ativos (48 variantes) em [JSON](catalogo/produtos.json) e [CSV](catalogo/produtos.csv).
- [`produtos/`](produtos/) — uma página por produto, com variantes, preços, descrição e imagens.

## Produtos (16)

| Produto | Tipo | A partir de | Na loja |
|---|---|---|---|
| [BellaCore – Vitamina C 509 mg + L-Metionina 110 mg – 60 Cápsulas](produtos/bellacore.md) | Vitaminas | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/bellacore) |
| [Citrus Rise – Vitamina C 1.600 mg + Extrato de Laranja Moro 100 mg – 30 Doses](produtos/citrus-rise.md) | Vitaminas | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/citrus-rise) |
| [Crea Gummy – Creatina Monoidratada 3.000 mg – 60 Gomas](produtos/crea-gummy.md) | Creatina | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/crea-gummy) |
| [Creatina 300 g – Monohidratada 5.000 mg por Dose – 60 Doses](produtos/creatina-300-g.md) | Creatina | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/creatina-300-g) |
| [Essential Multi – Vitamina C 534 mg + Magnésio 260 mg – 60 Cápsulas](produtos/essential-multi.md) | Vitaminas | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/essential-multi) |
| [FlexVita – Glucosamina 150 mg + Vitamina C 150 mg – 60 Cápsulas](produtos/flexvita.md) | Suplemento alimentar | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/flexvita) |
| [FocusLab – Colina 438 mg + L-Tirosina 263 mg – 60 Cápsulas](produtos/focuslab.md) | Suplemento alimentar | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/focuslab) |
| [Luna 0.21 – Melatonina 0,21 mg + L-Triptofano 150 mg – 60 Cápsulas](produtos/luna-0-21.md) | Sono | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/luna-0-21) |
| [Luna Gummy – Melatonina 0,21 mg + L-Triptofano 830 mg – 60 Gomas](produtos/luna-gummy.md) | Sono | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/luna-gummy) |
| [LunaDrops – Magnésio 63 mg + Inositol 50 mg – Gotas 30 mL](produtos/lunadrops.md) | Minerais | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/lunadrops) |
| [Moro Balance Gotas – Extrato de Laranja Moro 120 mg + Extrato de Cúrcuma 100 mg – Gotas 30 mL](produtos/moro-balance-gotas.md) | Substâncias bioativas | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/moro-balance-gotas) |
| [Moro Balance – Extrato de Feno Grego 200 mg + Extrato de Laranja Moro 50 mg – 60 Cápsulas](produtos/moro-balance-capsulas.md) | Substâncias bioativas | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/moro-balance-capsulas) |
| [NAC Pure 830 – N-Acetil L-Cisteína 830 mg – 60 Cápsulas](produtos/nac-pure-830.md) | Aminoácidos | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/nac-pure-830) |
| [Noctis Complex – L-Triptofano 572 mg + Ácido L-Aspártico 150 mg + Melatonina 0,21 mg – 60 Cápsulas](produtos/noctis-complex.md) | Sono | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/noctis-complex) |
| [VitaBeauty – Vitamina C 45 mg + Vitamina E 17 mg – 60 Gomas](produtos/vitabeauty.md) | Vitaminas | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/vitabeauty) |
| [Vitalift – Colina 275 mg + L-Aspartato de L-Arginina 100 mg – 60 Cápsulas](produtos/vitalift.md) | Suplemento alimentar | R$ 49,90 | [abrir](https://beaconlabs.com.br/products/vitalift) |

## Como usar o tema

Com a [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) instalada e acesso à loja:

```bash
# prévia local, sem mexer no tema publicado
shopify theme dev --store n45b0u-8f.myshopify.com --path tema

# envia como tema novo, NÃO publicado, para conferir antes de publicar
shopify theme push --unpublished --store n45b0u-8f.myshopify.com --path tema
```

## O que não está aqui

Senhas, chaves de acesso, custo dos produtos, estoque, pedidos, dados de clientes e documentos da empresa ficam fora do repositório. Os temas de rascunho também ficam fora: só entra o tema publicado.

No modelo `tema/templates/page.quem-somos.json`, o e-mail pessoal foi retirado desta cópia pública (a página «Quem somos» não está no ar).

Os preços e as descrições valem para a data da cópia (28/10/2026); o que vale é sempre o que está na loja.

© 2026 Beacon Labs. Todos os direitos reservados.
