# RSL Helper Sellfile Creator

Crie, reveja e exporte regras de venda para o RSL Helper com uma interface simples.

> Ferramenta criada por fãs. Não tem ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas mencionadas pertencem aos respetivos proprietários.

## Funcionalidades
- Criar e guardar regras: construa configurações e mantenha uma biblioteca reutilizável.
- Pré-visualização do Sellfile: veja as regras geradas, com ou sem o seu sellfile atual.
- Pré-visualização com o seu sellfile (opcional): arraste o `.hsf` para a aplicação para o comparar com as suas regras. Também pode largar um ficheiro de configurações (`.hsfc`). A sobreposição confirma os ficheiros aceites.
- Meta-sets: agrupe conjuntos de equipamento (por exemplo, Velocidade + Perceção) e volte a usá-los em várias regras.
- Exportação com um clique: gere um ficheiro HSF (Sellfile do RSL Helper) pronto a carregar no RSL Helper.

## Como utilizar

### Ficheiro de configurações
- HSFC (`.hsfc`): ficheiro de projeto da aplicação. Pense nele como um “save” que pode carregar ou partilhar. O RSL Helper não lê HSFC diretamente.
- HSF (`.hsf`): o Sellfile consumido pelo RSL Helper. Exporte-o aqui e carregue-o depois no RSL Helper.
- O nome padrão ao guardar é `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Configs Builder
- Preencha o Configs Builder e atribua um nome claro à configuração.
- Clique em «Adicionar como nova config» para guardar. Depois selecione a configuração na lista por baixo do builder para a editar e confirme com «Atualizar config selecionada».
- Carregar/Guardar: use «Carregar configs» e «Guardar configs» para reutilizar as regras. Estas ações mantêm tudo o que é necessário para reconstruir a pré-visualização.
- Nota: clique em «Adicionar nota» (ou «Editar nota») para anexar um texto ao ficheiro de configurações. Ao carregar um ficheiro que contenha nota, esta é mostrada automaticamente.

### Estrutura do builder (de cima para baixo)
- Ação e Ativo: Defina o que acontece quando um item coincide.
  - `Manter` marca o item como Manter; o RSL Helper deixa-o intacto.
  - `Vender` marca o item como Vender; o RSL Helper coloca-o na fila de venda automática.
  - O interruptor «Ativado no arquivo de venda» decide se as linhas exportadas permanecem ativas. Configurações desativadas são exportadas, mas aparecem riscadas e inativas no RSL Helper.
- Rank: Limite a regra a determinados ranks de estrelas caso queira tratar as peças de 6★ de forma diferente das de 5★. `Todos` mantém todos os ranks elegíveis.
- Níveis: Escolha Nível mínimo e máximo entre os marcos +0, +4, +8, +12, +16. As linhas só são geradas dentro dessa janela.
- Raridade: `Auto` (recomendado) escolhe a raridade mais baixa que continua a satisfazer os requisitos nos níveis selecionados.
  - Sem mínimos por stat ou soma global? Auto mantém a regra abrangente, compatível com todas as raridades.
  - A pedir 1/2/3/4 substats iniciais? Auto garante que a raridade pode começar com essa quantidade (1→≥ Incomum, 2→≥ Rara, 3→≥ Épica, 4→≥ Lendária).
  - A pedir um total de rolagens? Auto escolhe a raridade mais baixa que atinge essa soma em +16 (5 rolagens exigem Mítica).
  - Chip `Auto ≥` (junto a Raridade): eleva o piso e, com o modo Tarde, acrescenta ramos ≥ extra em +4/+8/+12.
    - Sequência: Incomum → Raro → Épico. «Auto ≥ Raro» exclui Incomum.
    - Só fica ativo quando Raridade = Auto e Limiar por marcos = Tarde. Caso contrário vê uma barra diagonal.
    - Exemplo: estandarte com SPD e ATK%, onde ATK% precisa de 2 rolagens. Raridade = Auto, Limiar = Tarde, Auto ≥ Épico. Resultado: linhas Épicas em todos os marcos e ≥ Lendária em +8/+12 para manter peças raras elegíveis.
  - Antes de +16 o builder usa o número de substats que a raridade suporta nesse momento. Em +16 aplica o objetivo completo.
- Fação: Restrinja regras de acessórios a uma fação específica quando está a montar uma equipa. Anéis, Amuletos e Estandartes respeitam o filtro; a armadura ignora a fação, pelo que `Todos` é a opção segura.
- Ranhuras: Foque a regra em peças específicas (Arma, Botas, etc.) para impedir que itens fora da ranhura coincidam. Vazio = todas as ranhuras.
- Sets e Meta-sets: Filtre para conjuntos específicos ou meta-sets nomeados quando só pretende essas combinações. Vazio = todos os sets.
- Mainstats: Defina quais os mainstats aceites.
  - Pode selecionar vários; sem seleção = qualquer mainstat.
  - Ao escolher vários mainstats, o export gera uma linha por mainstat para manter tudo explícito.
- Substats: Indique quais contam.
  - Estados: primeiro clique = selecionar, segundo = bloquear (🔒), terceiro = limpar. Substats bloqueados aparecem sempre.
  - `Any` repõe a seleção e significa «sem restrições». Ao escolher substats concretos, `Any` desativa-se.
  - Cada linha usa `max(Obrigatórios, bloqueados)` até um máximo de quatro substats; bloquear reserva sempre um espaço.
- Interruptor Flex: Se houver mais opções do que o total obrigatório, o Flex roda essas opções por todas as permutações válidas para gerar cada mistura. Os bloqueados mantêm-se e o interruptor desliga-se sozinho quando já não há nada para rodar.
- Indicador de rolagens: Cada substat selecionado mostra um círculo para as melhorias.
  - Clique esquerdo aumenta a expectativa; direito diminui.
  - A partir de ★: esquerda passa para mínimo verde (0→1→…→5), direita para limite vermelho (0→1→…→4).
  - Com um limite vermelho, esquerda reduz o teto (1→0→★) e direita aumenta (0→1→…→4→★). Mínimo e limite são exclusivos.
- Substats obrigatórios: Defina quantos substats escolhidos o item precisa de ter.
  - `Auto` mantém a contagem alinhada com a seleção (até quatro).
  - Substats bloqueados (🔒) contam sempre e surgem avisos quando a combinação é impossível.
- Rolagens mínimas (global): Defina o total de rolagens partilhado pelos substats selecionados ou bloqueados. `0` ignora a verificação global. Cedo mostra apenas misturas que ainda conseguem chegar ao objetivo em +16.
- Limiar por marcos: Controla como os mínimos por stat se aplicam antes de +16 quando exige rolagens mínimas.
  - `Cedo` acompanha as rolagens já obtidas em cada marco.
  - `Tarde` pede apenas o que tem de existir agora para que a meta de +16 se mantenha possível.
  - Só faz diferença se algum substat tiver Min > 0 ou se o mínimo global for > 0.

### Níveis e rolagens: guia rápido
- Limiares cedo: Quando as exigências podem ser cumpridas, as linhas estabilizam. Antes disso, Cedo mostra apenas combinações viáveis.
- Soma de rolagens (Σ): As rolagens mínimas referem-se à soma total sobre os substats selecionados no nível alvo.
- Curingas com soma mínima: Com apenas substats ★ e uma soma mínima > 0, Cedo apresenta apenas as divisões mínimas por marco. Tarde repete essas divisões nos marcos iniciais e em +16.
- Mítica (5 rolagens): A raridade Mítica pode atingir cinco rolagens num substat em +16 (o resto fica pelas quatro). Se Mítica estiver disponível, o gerador conta o roll extra logo em +0.

### Valores de substats (mínimos)
- Abra o diálogo «Valores de substats…» junto aos controlos de nível.
- Os valores são globais e afetam todas as configurações.
- Defina mínimos por substat para 6★ e 5★; ative 4★–1★ se precisar.
- Estes valores definem os limiares usados por intervalo de nível (0–3, 4–7, 8–11, 12–15, 16).

### Meta-sets
- Clique em «Gerir meta-sets…» para abrir o diálogo.
- Crie ou renomeie meta-sets e escolha os sets que contêm. A interface usa a mesma pesquisa do seletor de sets.
- Existem meta-sets iniciais prontos a usar; pode editá-los ou removê-los.
- «Repor predefinições» oferece opções seguras quando um meta-set está em uso (remover, substituir por sets explícitos ou por outro meta-set).

### Venda final
- Interruptor ao lado de Exportar que ativa regras de venda para itens restantes. Vem ligado por defeito.
- Defina se deve abranger Artefactos e/ou Acessórios e quais os intervalos de nível (0–3, 4–7, 8–11, 12–15, 16). Por defeito é 0–15 para evitar vender peças +16.
- Sem venda final, o RSL Helper mantém tudo o que não coincide com uma regra. Só vende quando uma regra explícita diz Vender.
- Com venda final ativa, as regras geradas incluem todos os sets conhecidos. Na pré-visualização surge «Todos os sets conhecidos» para reduzir ruído; o ficheiro exportado lista os sets um a um.

### Gestão de configs
- As configs guardadas aparecem como etiquetas sob o builder. Clique para selecionar; clique direito para duplicar, mover, copiar ou eliminar.
- «Delete Configs» remove todas (com confirmação).
- Ligação por hover: passar o cursor sobre uma etiqueta destaca as linhas associadas na pré-visualização e vice-versa.
- Ligação por clique: clicar uma linha da tabela seleciona a config de origem (linhas da HSF base não alteram a seleção).
- Cópia alternativa: Se o acesso ao porta‑papéis falhar, abre-se um diálogo com o texto já selecionado para copiar manualmente.

### Pré-visualização do Sellfile (e ficheiro base opcional)
- Pode combinar as suas regras com um `.hsf` existente.
  - «Carregar Sellfile do RSL Helper» (ou arrastar) adiciona o ficheiro.
  - «Limpar» remove o ficheiro carregado.
- O ícone da paleta abre a gestão de cores para personalizar texto e fundo dos substats.
- A tabela mostra todas as regras a exportar. As colunas «Idx» e «Cfg» indicam a config que gerou a linha; as vindas do ficheiro base deixam «Cfg» em branco.

### Controlos da pré-visualização
- Gerir cores: através do ícone da paleta; «Repor predefinições» restaura as recomendações.
- Menu de colunas (clique direito na cabeça da tabela):
  - Repor colunas: restaura colunas e larguras padrão.
  - Ajustar largura: adapta as colunas à janela.
  - Permitir linhas multilinha: ativa quebras de linha (útil para Substats).
  - Mostrar/Ocultar colunas: caixas individuais por coluna.
- Reordenar: arraste uma cabeça horizontalmente.
- Redimensionar: arraste o bordo direito da cabeça.
- Comportamento de clique: uma linha seleciona a config correspondente (sem deslocação automática). Clicar uma etiqueta de config desloca a tabela até à primeira linha associada.

### Exportar
- «Exportar Sellfile do RSL Helper combinada» aparece quando existe ficheiro base; caso contrário verá «Exportar Sellfile do RSL Helper».
- Use «Guardar configs» e «Carregar configs» no builder para salvaguardar o trabalho.
- O nome padrão do export é `Sellfile_AAAA MM DD_HHMM.hsf`.

## Exemplos

Todos os exemplos usam mínimos de 6★ por unidade de rolagem: SPD=5, CR%=5, CDMG%=5.

Cedo vs. Tarde
- Cedo: os limiares refletem as rolagens já obtidas. Com ★ + soma mínima, apresenta apenas divisões mínimas por marco (lista estável). Caso contrário enumera o progresso possível até a condição ficar viável e depois fixa-se nos mínimos (a menos que uma soma global exija mais).
- Tarde: só exige o que tem de existir agora para que a meta de +16 continue possível. Com ★ + soma mínima repete essas divisões nos primeiros marcos e em +16. Com mínimos por stat fornece os valores mínimos exigidos em cada nível.

Exemplo: Cedo (2 substats) — SPD min=2, CR% min=1 (níveis 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] e [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Exemplo: Tarde (2 substats) — SPD min=2, CR% min=1 (níveis 0..16)
- +0/+4: [5,5]
- +8: [10,5] ou [5,10]
- +12: [15,5] ou [10,10]
- +16: [15,10]

Exemplo: Cedo (3 substats) — SPD min=2, CR% min=1, CDMG% livre, Obrigatórios=3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: divisões de uma rolagem: [10,5,5], [5,10,5], [5,5,10]
- +8: divisões de duas rolagens (respeitando limites)
- +12/+16: [15,10,5]

Exemplo: Tarde (3 substats) — SPD min=2, CR% min=1, CDMG% livre, Obrigatórios=3
- +0/+4: [5,5,5]
- +8: [10,5,5] ou [5,10,5]
- +12: [15,5,5] ou [10,10,5]
- +16: [15,10,5]

Dica: Use limites de rolagem para proibir melhorias num stat. A partir de ★, clique direito → limite e defina 0. Assim CDMG% mantém o valor base enquanto SPD/CR recebem as rolagens.

Exemplo: Bloquear um e exigir dois
- Substats: SPD, HP, ATK. Clique duas vezes em SPD para bloquear (🔒).
- Substats obrigatórios = 2.
- Resultado: surgem SPD+HP e SPD+ATK. HP+ATK sem SPD nunca é gerado (o bloqueado conta sempre).

Exemplo: Focar rolagens em 3 stats e bloquear o 4.º
- Objetivo: Manter itens com SPD, CR%, CDMG% e um de HP%/ATK%/DEF%, mas sem rolagens nesse quarto stat.
- Substats: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Substats obrigatórios = 4.
- Indicadores:
  - De ★, clique esquerdo (mínimos): defina SPD/CR%/CDMG% nos mínimos desejados (ex. 1 cada).
  - De ★, clique direito (limite): defina HP%/ATK%/DEF% com limite 0.
- Resultado: o quarto substat roda entre os três, mas não recebe rolagens; SPD/CR%/CDMG% ficam com as melhorias.

Exemplo: Cedo com curinga (apenas selecionados)
- Substats: SPD e ACC.
- Indicadores: SPD min = 2; ACC = ★.
- Substats obrigatórios: Auto (2).
- Níveis: +0 a +16.
- Efeito: Cedo mostra itens que conseguem atingir SPD(2) até +16 (linhas onde SPD ou ACC ganhou rolagem). Assim que duas rolagens em SPD são possíveis, a linha mínima aparece.

Exemplo: Soma de rolagens com curingas (2 substats)
- Substats: SPD e ACC, ambos em ★.
- Substats obrigatórios: 2. Rolagens mínimas: 1.
- Cedo:
  - +4/+8/+12/+16: duas linhas — SPD ≥ 10, ACC ≥ 9 e SPD ≥ 5, ACC ≥ 18 (divisões mínimas; lista estável).
- Tarde:
  - +0/+4/+8/+12: apenas linhas base (ainda sem exigência extra); +16: as duas linhas acima. Com mínimos maiores, Tarde aplica as divisões necessárias nos marcos adequados (p. ex., mínimo 2 → +12 mostra divisões de uma rolagem, +16 as de duas).

## Notas para contribuidores

- Traduções: Os pacotes de release incluem modelos em `i18n/` (`i18n/en-US.l10n.json`, `i18n/de-DE.l10n.json`, `i18n/fr-FR.l10n.json`, `i18n/es-ES.l10n.json`, `i18n/pt-BR.l10n.json`, `i18n/pt-PT.l10n.json`, além de esqueletos `i18n/ru-RU.l10n.json`, `i18n/uk-UA.l10n.json`, `i18n/tr-TR.l10n.json`).
- Editar e testar: Abra a app e arraste o `*.l10n.json` editado para o aplicar de imediato na sessão atual (sem instalação).
- Enviar correções: Submeta o JSON atualizado via pull request (preferível) ou anexe-o a um issue. Mantenha as chaves inalteradas; as ausentes regressam ao inglês.
- Idiomas incorporados: Todos os idiomas fornecidos estão integrados no único HTML, garantindo funcionamento offline. As melhorias serão incluídas na próxima versão.

## Agradecimentos

Muito obrigado a [STBL] Nasgor pelos contributos inestimáveis,  
e obrigado também a Farbstoff pelo RSL Helper.

## Autor
Criado por [STBL] Nusi㊷  
Localização por Codex
