# RSL Helper Sellfile Creator

Crie, reveja e exporte regras de venda para o RSL Helper com uma interface simples.

> Ferramenta feita por fãs. Não possui qualquer ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas pertencem aos respetivos proprietários.

## Funcionalidades
- Criar e guardar regras: construa configurações e mantenha uma biblioteca reutilizável.
- Pré-visualização da Sellfile: veja as regras geradas, com ou sem a sua sellfile atual.
- Pré-visualização com a sua sellfile (opcional): arraste o ficheiro `.hsf` para a aplicação para o visualizar em conjunto. Também pode largar um ficheiro de configurações (`.hsfc`). O overlay confirma os ficheiros aceites.
- Metasets: dê nome a grupos de conjuntos (por exemplo, Velocidade + Perceção) e reutilize-os em várias regras.
- Exportação com um clique: exporte um ficheiro HSF (Sellfile do RSL Helper) pronto a carregar no RSL Helper.

## Como utilizar

### Ficheiro de configurações
- HSFC (`.hsfc`): ficheiro de projeto da aplicação. Pense nele como uma gravação que pode carregar ou partilhar. O RSL Helper não lê HSFC diretamente.
- HSF (`.hsf`): o ficheiro de venda utilizado pelo RSL Helper. Exporte a partir da aplicação e carregue-o depois no RSL Helper.
- Nome padrão ao guardar: `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Configs Builder
- Preencha o Configs Builder e atribua um nome claro à configuração.
- Clique em «Adicionar como nova config» para guardar. Em seguida selecione a configuração na lista por baixo do builder, edite e confirme com «Atualizar config selecionada».
- Carregar/Guardar: use «Carregar configs» e «Guardar configs» para reutilizar regras personalizadas. Estas ações guardam tudo o que é necessário para reconstruir a pré-visualização.
- Nota: clique em «Adicionar nota» (ou «Editar nota») para anexar um texto ao ficheiro de configurações. Ao carregar um ficheiro que contém nota, esta é mostrada automaticamente.

### Estrutura do builder (de cima para baixo)
- Ação: Manter ou Vender, mais o estado Ativado.
  - «Ativado» controla se as regras dessa configuração entram em vigor. Desligado = exportado mas ignorado pelo RSL Helper. Na pré-visualização, a linha surge com um traço branco e o texto Manter/Vender aparece riscado.
- Ranking, Raridade, Fação, Níveis.
  - Fação (opcional) só se aplica a acessórios (Anel, Amuleto, Estandarte).
  - Níveis: escolha Nível mínimo e máximo entre +0, +4, +8, +12, +16. São geradas regras para cada marco dentro dessa janela.
  - Raridade = Auto (recomendado): seleciona a raridade mais baixa que satisfaz os requisitos dentro do intervalo de níveis.
    - Sem mínimos de rolamentos? Auto mantém regras abrangentes e compatíveis com todas as raridades.
    - A pedir 1/2/3/4 substats em +0? Auto garante que a raridade pode começar com esse número (1 → ≥ Incomum, 2 → ≥ Raro, 3 → ≥ Épico, 4 → ≥ Lendário).
    - A pedir contagem de rolamentos (ex. «pelo menos 3 rolamentos»)? Auto escolhe a raridade que atinge essa soma a +16. Para 5 rolamentos, seleciona Mítico.
    - Chip «Auto ≥» (ao lado de Raridade): define um piso para Auto e, com Late, adiciona linhas «≥» nos marcos relevantes.
      - Sequência: Incomum → Raro → Épico. «Auto ≥ Raro» impede Auto de baixar de ≥ Raro.
      - Ideal com Late + mínimos de rolamentos. Quando inativo, surge «Auto + Late» com uma barra diagonal.
      - Exemplo: Estandarte com SPD e ATK%, ATK% necessita de 2 rolamentos. Coloque Raridade = Auto, Modo = Late e Auto ≥ Épico.
        - Recebe linhas Épicas em todo o intervalo de níveis e linhas ≥ Lendárias em +8/+12 (o último rolamento lendário ocorre frequentemente em +16).
        - Resultado: Épico mantém o ritmo; Lendário continua justo. Nenhum item é excluído por ter raridade superior.
    - Presença antes de +16: se a raridade não consegue ainda conter todos os substats pretendidos, a regra usa o máximo disponível nesse marco. Em +16 aplicam-se as metas.

- Mainstat e Substats – três linhas de botões:
  1) Any
  2) HP, HP%, ATK, ATK%, DEF, DEF%
  3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat permite múltiplas seleções. Sem escolha = Any. Com vários valores, é criada uma regra por mainstat.
  - «Any» funciona como um reset rápido. Nos substats equivale a nenhum selecionado; ao escolher substats, Any é desativado.
  - Substats têm três estados: clique para selecionar; clique novamente para fixar (🔒); clique outra vez para limpar. Substats fixos surgem sempre nas regras. O total visado é max(Obrigatório, Fixo) limitado a 4.
  - Indicador de rolamentos: pequeno círculo em cada substat escolhido.
    - Clique esquerdo = aumentar. Direito = reduzir.
    - Curinga (★): rolamentos podem cair em qualquer divisão desse substat.
    - Clique esquerdo em ★ define Rolamentos mínimos (verde): 0 → 1 → 2 → 3 → 4 → 5 → ★.
    - Clique direito em ★ define limite de rolamentos (vermelho): 0 → 1 → 2 → 3 → 4 → ★. Limite 0 proíbe rolamentos.
    - Mínimo e Limite são exclusivos.
- Substats obrigatórios – à direita. Define quantos substats selecionados o item deve possuir. Substats fixos contam sempre.
- Seleção de Sets/Metasets: os chips sob a secção de substats mostram os sets e metasets ativos.
- Modo Early/Late:
  - Early: cada marco inclui as distribuições que permanecem válidas até ao objetivo final. Com curingas + mínimo requerido, Early lista todas as divisões possíveis por nível. Limites são respeitados.
  - Late: exige apenas o necessário a cada momento para permitir o objetivo a +16. Com curinga + mínimo requerido, Late mostra presença nos níveis iniciais e aplica divisões mínimas em +16. Com mínimos por stat, Late gera limites mínimos por nível.

Exemplo: Early (2 substats) – SPD mín = 2, CR% mín = 1 (níveis 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] e [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Exemplo: Late (2 substats) – SPD mín = 2, CR% mín = 1 (0..16)
- +0/+4: [5,5]
- +8: [10,5] ou [5,10]
- +12: [15,5] ou [10,10]
- +16: [15,10]

Exemplo: Early (3 substats) – SPD mín = 2, CR% mín = 1, CDMG% livre, Obrigatório = 3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: divisões de um rolamento: [10,5,5], [5,10,5], [5,5,10]
- +8: divisões de dois rolamentos (cumprindo limites)
- +12/+16: [15,10,5]

Exemplo: Late (3 substats) – SPD mín = 2, CR% mín = 1, CDMG% livre, Obrigatório = 3
- +0/+4: [5,5,5]
- +8: [10,5,5] ou [5,10,5]
- +12: [15,5,5] ou [10,10,5]
- +16: [15,10,5]

Dica: use limites para impedir rolamentos num stat. A partir de ★, clique direito e defina o limite para 0. Assim CDMG% mantém-se no valor base enquanto SPD/CR recebem os rolamentos.

Exemplo: Bloquear um stat e exigir dois
- Selecione SPD, HP, ATK. Clique duas vezes em SPD para o bloquear (🔒).
- Substats obrigatórios = 2.
- Resultado: as regras incluem SPD+HP e SPD+ATK, mas nunca HP+ATK sem SPD.

Exemplo: Focar rolamentos em 3 stats e bloquear o 4.º
- Objetivo: manter itens com SPD, CR%, CDMG% e um de HP%/ATK%/DEF%, mas impedir rolamentos nesse quarto stat.
- Selecione SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Substats obrigatórios = 4.
- Indicadores:
  - A partir de ★, clique esquerdo (mínimos): defina SPD/CR%/CDMG% com os seus mínimos (por exemplo 1 cada).
  - A partir de ★, clique direito (limite): coloque HP%/ATK%/DEF% em 0.
- Resultado: o quarto substat alterna entre os três, sem rolamentos; SPD/CR%/CDMG% recebem os rolamentos.

Exemplo: Early com curinga (substats selecionados)
- Selecione SPD e ACC.
- Indicadores: SPD mín = 2; ACC = ★.
- Substats obrigatórios: Auto (2).
- Níveis: +0 a +16.
- Resultado: Early mostra itens que podem alcançar SPD(2) em +16 (linhas onde SPD ou ACC recebeu rolamento). Quando duas jogadas em SPD são possíveis, surge a linha com o mínimo.

Exemplo: Soma de rolamentos com curingas (2 substats)
- Selecione SPD e ACC, ambos em ★.
- Substats obrigatórios: 2. Rolamentos mínimos: 1.
- Early:
  - +4/+8/+12/+16: duas linhas – SPD ≥ 10, ACC ≥ 9 e SPD ≥ 5, ACC ≥ 18 (divisões mínimas, estáveis).
- Late:
  - +0/+4/+8/+12: apenas presença (mínimo atual = 0); +16: as duas linhas acima. Com mínimos superiores, Late aplica divisões mínimas nos marcos adequados.

## Persistência e resolução de problemas
- Para utilizadores avançados: comportamento do armazenamento do navegador e da área de transferência.
- Abrir `index.html` diretamente (file://) limita frequentemente o armazenamento do site:
  - Autosave (configs, metasets, mínimos) e preferências de tabelas/cores podem não persistir.
  - A cópia para a área de transferência pode ser bloqueada; aparece um diálogo alternativo.
- Para garantir persistência, sirva o ficheiro via http(s) (servidor Vite ou alojamento estático).
- O diálogo de restauro não surge? Não existe um autosave prévio ou está em file:// sem localStorage persistente.
- As colunas voltam ao padrão? Navegação privada/incógnito ou limpeza de dados remove as preferências guardadas.
- Paletas para daltonismo: clique direito no cabeçalho da pré-visualização e selecione «Paleta para daltónicos». Opções:
  - Normal: cores padrão de sucesso/aviso/erro.
  - Okabe–Ito: paleta adequada a deuteranopes/protanopes (Azul/Laranja/Vermelhão).
  - Tritan: paleta para tritanopia (Verde/Laranja/Magenta).
- A escolha é guardada localmente e aplica-se em toda a aplicação sempre que se usam essas cores.

## Agradecimentos

Um grande obrigado a [STBL] Nasgor pelas suas contribuições inestimáveis,  
e claro, obrigado a Farbstoff pelo RSL Helper!

## Autor
Criado por [STBL] Nusi㊷
Localização por Codex
