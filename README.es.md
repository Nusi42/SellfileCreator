# Sellfile Creator for RSL Helper

Sellfile Creator simplifica la creación de archivos de venta para RSL Helper — define filtros de equipo por conjunto, ranura, estadística principal, subestadísticas y más, previsualiza los resultados en vivo y exporta archivos de venta listos para usar en segundos.

> Herramienta creada por fans. No está afiliada a Plarium, Raid: Shadow Legends ni RSL Helper. Todas las marcas mencionadas pertenecen a sus dueños.

## Características

- **Generador de recetas** — crea recetas de conservar/vender con nombre y filtros por
  ranura, conjunto, rango, rareza, estadística principal, subestadísticas (con mínimos de
  tiradas y objetivos), facción e hitos de nivel. Construye una biblioteca reutilizable y
  expórtala como archivo de venta de RSL Helper (`.hsf`) con un clic.
- **Vista Sellfile** — previsualiza el archivo de venta de RSL Helper
  generado en la pestaña Vista previa antes de exportar.
- **Metaconjuntos** — agrupa conjuntos de equipo (p. ej. Velocidad + Percepción) en
  colecciones con nombre y reutilízalos en recetas y protecciones.
- **Inspector de equipo** — conecta RSL Helper para sincronización en vivo o carga un archivo `.db` para previsualizar qué objetos coinciden con cada receta y cuántos se conservarían o venderían.
- **Simulador de mazmorras** — consulta los porcentajes de probabilidad de conservar para
  el Caballero de Fuego, el Dragón y el Gólem de Hielo en distintos niveles de dificultad
  y mejora para confirmar el efecto de tu archivo de venta al farmear o mejorar equipo.
- **Salvaguardas** — define combinaciones de ranura/conjunto/estadística que nunca quieras
  perder; el escáner inyecta automáticamente reglas de conservar en el archivo de venta
  cuando tu configuración reduciría una combinación protegida por debajo de su cuota.
- **Análisis de Equipo** — panel de análisis con tarjetas KPI, gráficos de filtro cruzado
  (ranura, rango, rareza, fuente, nivel), un mapa de árbol de conjuntos, barras de
  estadística principal y un radar de subestadísticas. Haz clic en cualquier gráfico para
  filtrar todos los demás; envía el filtro activo directamente al Inspector de equipo.
- **Venta final** — un botón añade reglas de venta comodín para el equipo no coincidente
  en rangos de nivel configurables, para que nada se escape.

## Cómo usarlo

### Archivo de recetas
- SFC (`.sfc`): archivo de proyecto para esta app. Piénsalo como una partida guardada que puedes cargar o compartir. RSL Helper no usa SFC directamente.
- HSF (`.hsf`): el Sellfile que consume RSL Helper. Expórtalo desde la app y luego cárgalo dentro de RSL Helper.
- El nombre predeterminado al guardar es `SellfileCreatorRecipes_AAAA MM DD_HHMM.sfc`.

### Constructor de recetas
- Completa el Constructor de recetas y da un nombre claro a tu receta.
- Pulsa «Agregar como nueva receta» para guardarla. Después selecciónala en la lista debajo del constructor para editarla y guarda los cambios con «Actualizar receta seleccionada».
- Cargar/Guardar: usa «Cargar recetas» y «Guardar recetas» para reutilizar tus reglas. Estas acciones guardan todo lo necesario para reconstruir la vista previa.
  - Haz clic derecho en **Cargar archivo SFC** para abrir el menú contextual: **Cargar desde archivo…** abre el selector de archivos del sistema como de costumbre; **Cargar SFC de muestra** carga una configuración de muestra incluida tras una confirmación (tu configuración actual será reemplazada).
- Menús de Reset/Insert/Apply: haz clic derecho en «Reset», «Insert as receta» o «Apply as receta» para abrir las opciones compartidas. Guarda el estado actual del constructor como plantilla predeterminada, vuelve a los valores de fábrica, habilita «Auto reset after Insert» (limpia el constructor en cuanto insertas una receta) o «Auto apply to selected receta» (envía los cambios a la receta seleccionada automáticamente tras ~400 ms de inactividad). Auto reset y Auto apply no pueden estar activos al mismo tiempo: al activar uno se apaga el otro, y ambas preferencias permanecen entre sesiones.
- Nota: pulsa «Agregar nota…» (o «Editar nota…») para adjuntar un texto al archivo de recetas. Al cargar un archivo que contiene nota, se mostrará automáticamente. Usa `<!-- recipes:1,0 -->` para insertar chips de recetas concretas (0 toma la siguiente receta). Usa `<!-- recipes-re:"speed" -->` para mostrar todas las recetas cuyo nombre coincide con el patrón (sin distinguir mayúsculas/minúsculas). Añade `<!-- dungeon-simulator -->` para mostrar una tabla en vivo de probabilidad de conservación para el Caballero de Fuego, el Dragón y el Gólem de Hielo en tres niveles de dificultad (N20/N25/H10) y dos modos de mejora, con las tasas de conservación en +0/+4/+8/+12/+16. Añade `<!-- recipe-overrides [columns=N] -->` para insertar tarjetas de preguntas interactivas (grupos de radio/casilla) que sobreescriben los modos de exportación y ajustes de recetas durante la sesión — las recetas almacenadas nunca se modifican. Añade `<!-- safeguard-overrides [columns=N] -->` para insertar tarjetas de controles deslizantes y opciones que sobreescriben propiedades de las salvaguardas (cantidad, activación, subestadísticas, oportunidad de mejora y más) durante la sesión — las reglas almacenadas nunca se modifican. Cuando alguno de estos marcadores está presente, el pie de la nota muestra un botón **Desactivar / Activar ajustes dinámicos** y un botón **Restablecer opciones**.
- Restaurar Autosave: al iniciar, el diálogo lista cada sección autoguardada con su propia casilla. Restaura solo lo que necesites — recetas (incluida la selección actual), metasets, Objetivos de substats, resto de Venta final, nota fijada, panel de filtros (estado, chips, secciones colapsadas) e importaciones del Inspector de Equipo. Deja una casilla desmarcada para conservar tu trabajo. Autosave también recuerda qué interruptores de Venta final (Artefactos, Accesorios y rangos de nivel) estaban activos, así que al reabrir el diálogo Herramientas refleja exactamente lo que exportaste la última vez.

### Diseño del constructor (de arriba hacia abajo)
- Acción y Activado: Indica qué debe ocurrir cuando un objeto coincide con la receta.
  - `Conservar` marca el objeto como Conservar; RSL Helper lo deja intacto.
  - `Vender` marca el objeto como Vender; RSL Helper lo pone en la cola de venta.
  - El interruptor «Activado en el Sellfile» decide si las filas exportadas siguen activas. Las recetas desactivadas se ven tachadas en la vista previa y no tienen efecto en RSL Helper; activa «Omitir reglas desactivadas al exportar» en el menú de exportación si prefieres dejarlas fuera.
- Rango: Limita la regla a ciertos rangos de estrellas si quieres tratar las piezas de 6★ distinto a 5★. `Cualquiera` deja todos los rangos válidos.
- Niveles: Elige Nivel mínimo y máximo entre los hitos +0, +4, +8, +12, +16. Solo se generan filas dentro de esa ventana.
- Rareza: `Auto` (recomendado) escoge la rareza más baja que sigue cumpliendo tus requisitos en los niveles seleccionados.
  - ¿Sin mínimos por stat ni suma global? Auto mantiene la regla amplia para que todas las rarezas sigan siendo válidas.
  - ¿Pides 1/2/3/4 substats iniciales? Auto garantiza que la rareza puede empezar con esa cantidad (1→≥ Poco común, 2→≥ Rara, 3→≥ Épica, 4→≥ Legendaria).
  - ¿Pides una suma de tiradas? Auto elige la rareza más baja que alcanza esa suma a +16 (5 tiradas requieren Mítica).
- Chip `Auto ≥` (debajo de Umbrales por hitos): eleva el piso y, si el modo es Tardío, añade ramas ≥ extra en +4/+8/+12.
    - Ciclo: Poco común → Raro → Épico. «Auto ≥ Raro» deja fuera Poco común.
    - Solo está activo cuando Rareza = Auto y Umbrales por hitos = Tardío. En caso contrario verás una barra diagonal.
    - Ejemplo: Estandarte con SPD y ATK%, donde ATK% necesita 2 tiradas. Rareza = Auto, Umbrales = Tardío, Auto ≥ Épico. Obtienes filas épicas en todos los niveles y ≥ Legendaria en +8 y +12, de modo que las piezas más raras siguen contando.
  - Antes de +16 el constructor usa el número de substats que la rareza puede tener en ese momento. A +16 aplica tu objetivo completo.
- Facción: Restringe las reglas de accesorios a una facción concreta cuando construyes un equipo específico. Anillos, Amuletos y Estandartes respetan el filtro; la armadura lo ignora, así que `Cualquiera` es la opción segura para ella.
- Ranuras: Centra la regla en piezas concretas (Arma, Botas, etc.) para evitar que coincidan objetos fuera de slot. Déjalo vacío para abarcar todas las ranuras.
- Sets y Metasets: Filtra por conjuntos concretos o metasets nombrados cuando solo quieres esas combinaciones. Vacío = todos los sets.
- Mainstats: Define qué mainstats son aceptables.
  - Se pueden seleccionar varios. Sin selección = cualquier mainstat.
  - Al elegir varios mainstats se genera una fila por mainstat para mantenerlas explícitas en la exportación.
- Substats: Indica qué substats importan.
  - Haz clic para activar o desactivar un substat. Los bloqueados siempre aparecen en las filas generadas.
  - Usa el candado (🔒) junto a la etiqueta para exigirlo; con clic derecho abres las opciones rápidas de bloqueo y límites de tiradas.
  - `Cualquiera` restablece la selección y significa «sin restricciones». Al elegir substats concretos, `Cualquiera` se desactiva.
  - Cada fila usa `max(Requeridos, bloqueados)` con un máximo de cuatro substats, así que un substat bloqueado siempre reserva hueco.
- Interruptor Flex: Si tienes más opciones que la cantidad requerida, Flex rota esas opciones por todas las permutaciones válidas para generar cada mezcla posible. Los bloqueados permanecen fijos y el interruptor se apaga solo cuando ya no hay nada que rotar.
- Indicador de tiradas: Cada substat seleccionado muestra un círculo para las mejoras.
  - Clic izquierdo aumenta la expectativa; derecho la reduce.
- Desde ★: Izquierda cambia a mínimo verde (0→1→…→5) y derecha a límite superior rojo (0→1→…→4).
- Con un límite superior rojo, izquierda reduce el máximo (1→0→★) y derecha lo aumenta (0→1→…→4→★). Mínimo y límite superior se excluyen mutuamente.
- Objetivos de tiradas (Base/+1…+5): Haz clic derecho sobre un substat seleccionado para abrir la cuadrícula de objetivos. Base refleja el valor en +0 y cada campo +N captura el valor tras esa cantidad de tiradas adicionales. Deja un campo vacío para reutilizar tus Objetivos de substats o pulsa «Usar objetivos globales de substats» para limpiarlo. Las fichas de la vista previa se actualizan al instante para que confirmes los números antes de exportar.
- Substats requeridos: Define cuántos substats seleccionados debe tener el objeto.
  - `Auto` mantiene la cuenta alineada con lo que eliges (hasta cuatro).
  - Los substats bloqueados (🔒) siempre cuentan y aparecen avisos cuando la combinación es imposible.
- Tiradas mínimas (global): Marca cuántas tiradas totales deben repartirse los substats seleccionados o bloqueados. `0` salta la comprobación agregada. Temprano muestra solo combinaciones que aún pueden alcanzar tu objetivo a +16.
- Tiradas mínimas bloqueadas (🔒) aparece cuando al menos un substat está bloqueado. Haz clic en un número de la fila del candado para reservar esa cantidad de tiradas solo para los stats bloqueados; el resto del constructor sigue la mínima global. Si el candado iguala o supera el número resaltado en la insignia global, esa insignia se limpia y el candado se convierte en el único piso agregado. Al desbloquear el substat (o pulsar Auto) se vacían ambos indicadores; al usar un valor global más pequeño, la insignia global se vuelve a encender junto al candado para mostrar qué piso aplica a cada grupo de stats.
- Ejemplo: Bloquea SPD y CR%, define Tiradas mínimas = 3 y luego fija la fila 🔒 en 2. El constructor ahora exige 3 tiradas totales entre todos los substats seleccionados, al menos 2 de ellas sobre los picks bloqueados de SPD/CR%. Si marcas el candado en 3, la insignia global se borra automáticamente porque ambos pisos serían idénticos.
- Umbrales por hitos: Controla cómo se aplican los mínimos por stat antes de +16 cuando pides tiradas mínimas.
  - `Temprano` sigue las tiradas que ya tienes en cada hito.
  - `Tardío` exige solo lo que debe existir ahora para que la meta de +16 siga siendo alcanzable.
  - El cambio solo importa si algún substat tiene Min > 0 o si la suma global es mayor que 0.

### Guía rápida de niveles y tiradas
- Umbrales tempranos: En cuanto tus requisitos se pueden cumplir, las filas caen hasta tus Objetivos de substats y dejan de cambiar. Antes de eso, Temprano muestra únicamente combinaciones viables.
- Suma de tiradas (Σ): Las tiradas mínimas se refieren a la suma total de tiradas en los substats seleccionados en el nivel objetivo.
- Comodines con suma mínima: Con solo substats ★ y una suma mínima > 0, Temprano muestra únicamente las divisiones mínimas por hito. Tardío repite esas divisiones en los niveles tempranos y de nuevo en +16.
- Mítico (5 tiradas): El equipo Mítico puede alcanzar cinco tiradas en un substat a +16 (el resto se queda en cuatro). Cuando las opciones incluyen Mítico, el generador deja constancia del roll extra desde +0.

### Objetivos de substats
- El botón «Objetivos de substats…» en la esquina superior derecha del constructor abre la pestaña **Objetivos de substats** en el diálogo Herramientas.
- Los objetivos son globales: afectan a todas las recetas.
- Estos objetivos definen las referencias por rango de nivel (0–3, 4–7, 8–11, 12–15, 16) y sirven como respaldo en la cuadrícula de Objetivos de tiradas.
- Usa «Restablecer valores predeterminados» para volver a los objetivos recomendados.

### Metasets
- Pulsa «Gestionar metasets…» para abrir el diálogo.
- Crea o renombra metasets y asigna los sets que contiene cada uno. La vista usa la misma búsqueda que el selector de sets.
- Se incluyen metasets iniciales para empezar rápido; puedes editarlos o eliminarlos.
- «Restablecer valores predeterminados» ofrece opciones seguras cuando un metaset está en uso (eliminar, sustituir por sets explícitos o por otro metaset).

### Venta final
- Usa el interruptor `Venta final` en el encabezado de la vista previa para añadir reglas de venta para lo que no coincidió en otras recetas. La etiqueta no cambia nunca; el relleno ámbar indica que está activa y el contorno neutro indica que está apagada.
- Haz clic en «Herramientas» junto al interruptor para abrir la pestaña `Venta final` y decidir si afecta a Artefactos y/o Accesorios y qué rangos de nivel (0–3, 4–7, 8–11, 12–15, 16). Los valores predeterminados cubren 0–15 para no vender piezas ya subidas a +16.
- Sin `Venta final`, RSL Helper conserva todo lo que no coincide con una regla. Solo se vende si una regla explícita indica Vender.
- Con `Venta final` activa, las reglas generadas incluyen todos los sets conocidos. En la vista previa se muestra «Todos los sets conocidos» para reducir ruido, pero el archivo exportado enumera cada set.

### Conservar únicos
- Cambia el constructor al modo **Protecciones** con el botón de alternancia situado encima del panel del constructor para marcar las combinaciones que nunca quieres perder. Activa `Activar Conservar únicos` para que el escáner pueda añadir filas de conservación (las ediciones también lo activan automáticamente).
- Las reglas de Conservar únicos no «consumen» objetos—cada regla evalúa el mismo conjunto de candidatos. Si una pieza coincide con varias reglas, cuenta para todas.
- Cada regla de conservación te deja elegir ranura, sets o metasets, rangos, rarezas, stats principales y (en accesorios) facciones. Sin selección significa «cualquiera».
- El `Modo` decide cómo se emite la regla: `Apagada` la desactiva, `Proteger lo existente` añade filas de conservación para coincidencias que se venderían hasta cumplir la cuota, y `Anticipar huecos` agrega reglas de marcador para combinaciones faltantes para que los nuevos drops sigan protegidos hasta que la BD se actualice.
- Los substats son opcionales: elige uno o varios para contar solo los objetos que tengan esos substats. El chip de coincidencia (`Cualquier Substat` / `Todos los Substats` / `Por Substat`) decide si basta con uno, si deben estar todos o si cada substat tiene su propia cuota. Dejarlo vacío permite cualquier substat.
- Las substats seleccionadas siempre se clasifican con la fórmula normalizada (glifos ignorados); los pesos aparecen con `Cualquier Substat` y `Todos los Substats`, `Por Substat` usa la ponderación estándar (los empates en el corte se mantienen).
- `≥ Cantidad necesaria` es la promesa que quieres cumplir. Los chips justo debajo de cada selector (todo salvo Rango y Rareza) comparten o duplican la cuota: `Por ranura`, `Por conjunto`, `Por facción` y `Por stat principal` se pueden combinar libremente, y al apagarlos todos la regla vuelve automáticamente a `Por regla`.
- El tooltip de `Cantidad necesaria` muestra la división activa de ámbitos (`X por ranura × por conjunto × ...`) y una línea simple de faltantes (`({missing} faltan)`).
- El escáner solo añade filas de conservación para coincidencias que se venderían y solo cuando la cuota no se cumple. En `Anticipar huecos`, también emite reglas de marcador para combinaciones faltantes.
- **`Probabilidad de mejora ≥ N%`** (explorador de talento opcional): amplía la red de seguridad más allá del top-N estándar. El escáner siempre conserva primero las piezas del top-N por su valor de substat **actual** — esas nunca están en riesgo. Además, protege cualquier pieza *fuera* de ese top-N cuya probabilidad de mejora alcance el umbral. La idea es: «conservar los drops en bruto que tienen buenas posibilidades de ser competitivos una vez mejorados».

  **¿Qué es la probabilidad de mejora?** La app simula todas las formas posibles en que una pieza podría tirar durante las mejoras hasta +16 — algunas tiradas afectan al substat que te interesa, otras no — y cuenta cuántas veces la pieza acaba en tu top N en todos esos futuros. Una pieza con un 68 % de probabilidad de mejora llega al top N en aproximadamente dos de cada tres caminos de mejora simulados.

  **Regla clave: el umbral solo puede añadir protección, nunca quitarla.** Tu top-N actual siempre se conserva, independientemente de su puntuación de probabilidad de mejora. Una pieza completamente mejorada (+16) cuenta directamente su valor actual bloqueado — no puede perder la protección porque «se le acabó el potencial de mejora».

  **Ejemplo — estandartes SPD, Cantidad requerida = 2, Por facción (rango 6 legendario):**

  | Estandarte | SPD | Nivel | Prob. de mejora | Estándar | Umbral ≥ 50 % | Umbral ≥ 25 % |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | 100 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | B | 6 | +16 | 0 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | C | 5 | +0 | 26 % | ✗ vendido | ✗ vendido | ✔ umbral añade |

  Los estandartes de rango 6 tiran SPD en incrementos de **5 o 6** por evento, por lo que los únicos valores realistas en estado fresco son **5** (mínimo) o **6** (máximo). El SPD=12 del estandarte A significa que recibió exactamente una tirada SPD de bonus durante las mejoras (6 inicial + 1 tirada de 6). El estandarte B fue completamente mejorado sin tiradas SPD de bonus — su valor está bloqueado en 6.

  El estandarte B tiene un 0 % de probabilidad de mejora: su SPD=6 fijo perderá previsiblemente frente a cualquier competidor sin mejorar cuyos futuros lanzamientos puedan superarlo. Pese a eso, permanece protegido porque está en el top-2 estándar por valor **actual**. La probabilidad de mejora nunca puede eliminar piezas del top-N — solo la lógica de expansión por umbral la utiliza.

  El estandarte C (SPD=5, fresco) queda justo fuera del top-2 por valor actual. Su probabilidad de mejora del 26 % significa que acabaría en el top-2 en aproximadamente 1 de cada 4 caminos de mejora simulados. Con umbral ≥ **25 %** queda protegido; con umbral ≥ 50 % sigue vendiéndose.

  Si el estandarte C hubiera empezado con **SPD=6**, su probabilidad de mejora sube al **68 %** — un candidato mucho más sólido. Umbral ≥ **65 %** lo protegería.

  **Los estandartes épicos de rango 6** solo reciben **3 eventos de tirada SPD** (frente a 4 para los legendarios, porque la mejora +4 añade un nuevo substat en lugar de tirar uno existente). Las probabilidades resultantes son casi idénticas: SPD=6 fresco → **70 %**, SPD=5 fresco → **26 %**.

  **Umbrales sugeridos (equipo de rango 6):**
  - **65 %** — protege los drops frescos con tirada máxima (SPD=6, ~68–70 % de probabilidad). Buen valor predeterminado si quieres que los drops prometedores sobrevivan mientras se mejoran.
  - **25 %** — también protege los drops con tirada mínima (SPD=5, ~26 % de probabilidad). Red más amplia; úsalo si el espacio en el inventario no es un problema.
  - Evita **100 %**: solo coincide con piezas completamente mejoradas que ya están en el top-N estándar, así que no añade nada más allá del modo estándar.

#### Alcances de cuota de un vistazo

| Botón de ámbito | Comportamiento de la cuota | Cuándo destaca |
| --- | --- | --- |
| `Por regla` | Un único cupo para toda la regla. | Conserva cinco botas SPD sin importar el set. |
| `Por ranura` | Duplica la cuota por cada ranura. | Mantiene dos anillos, dos amuletos y dos estandartes por separado. |
| `Por conjunto` | Duplica la cuota por cada set/metaset de la tarjeta. | Sigue por separado dos caídas de Stoneskin y dos de Protection. |
| `Por facción` | Duplica la cuota por facción. | Garantiza tres anillos Merciless por facción. |
| `Por stat principal` | Duplica la cuota por cada stat principal seleccionado. | Divide los pools para estandartes de ACC y RES. |

#### Ejemplos reales

| Escenario | Filtros | Cantidad necesaria | Chips de ámbito | Lo que garantiza el escáner |
| --- | --- | --- | --- | --- |
| Se acaban las botas de SPD | Ranura = Botas, Stat principal = SPD, Sets en blanco | `5` | `Por regla` | Sobreviven al menos cinco botas SPD, sin importar el set. |
| Mezclar guantes Savage y Lethal | Ranura = Guantes, Sets = Savage + Lethal, Stat principal = CDMG% | `3` | `Por regla` | Conserva tres guantes de daño aunque cambie la mezcla de sets. |
| Anillos Merciless por facción | Ranura = Anillo, Set = Merciless, Facción sin filtrar | `3` | `Por facción` | Cada facción guarda tres anillos propios antes de que la regla se dé por cumplida. |
| Anillos de HP% por facción | Ranura = Anillo, Stat principal = HP%, Sets en blanco | `2` | `Por facción` | Se aseguran dos anillos de HP% por facción. |
| Accesorios básicos por facción | Tres reglas (Anillo, Amuleto, Estandarte), Sets y Stat principal en blanco | `5` | `Por facción` | Cada facción conserva cinco anillos, amuletos y estandartes. |
| Stoneskin + Protection por facción | Ranura = Anillo/Amuleto/Estandarte, Sets = Stoneskin + Protection, Stat principal en blanco | `2` | `Por conjunto` + `Por facción` + `Por ranura` | Cada facción guarda dos piezas Stoneskin y dos Protection en cada ranura. |
| Accesorios con más SPD | Ranura = Anillo/Amuleto/Estandarte, Substats = SPD | `5` | `Por regla` | Conserva las cinco mejores tiradas de SPD en tus accesorios (empates incluidos). |
| Estandartes de ACC con SPD | Ranura = Estandarte, Stat principal = ACC, Substats = SPD + ACC, Pesos: SPD alto | `3` | `Por facción` | Cada facción guarda los mejores estandartes de ACC donde SPD pesa más. |

Consejo: Importa tu `.db` o pega equipo en el diálogo «Equipo» antes de activar el modo Protecciones para que el escáner tenga objetos reales. Haz clic en una tarjeta de regla para resaltar coincidencias; cambia `Filtro` a `Selección` para ver solo esos objetos.

### Botín de mazmorra (Simulador)
Abre «Herramientas» y cambia a **Botín de mazmorra**. Simula el farmeo de mazmorras con tus reglas actuales del Sellfile para ver cuánto equipo conservarías por set y nivel de mejora.

- Elige una mazmorra y una etapa.
- Modo de simulación:
  - `Subida de nivel`: los rolls paran en cuanto el objeto se vendería, así refleja el leveo real.
  - `Instantánea`: los rolls siempre llegan hasta +16, aunque el objeto se habría vendido antes.
- La tabla muestra drops conservados divididos por todos los drops de esa etapa en +0 / +4 / +8 / +12 / +16.
- Haz clic en una celda para ver el desglose por slot + stat principal, luego abre **Probabilidades de substats específicas** para ver chances exactas y estimaciones de ejecuciones.

Notas:
- Usa tus reglas actuales de Conservar/Vender, incluyendo Venta final y Conservar únicos.
- Corre unas 100.000 drops por etapa y se actualiza mientras corre.
- Las tasas de drop y los rolls son simulados; toma los números como estimaciones.

### Gear Lens
Abre «Herramientas» y cambia a la pestaña **Gear Lens** para una vista analítica de tu equipamiento importado.

**Tarjetas KPI (fila superior):** Ocho tarjetas de porcentaje — **Tasa 6★**, **Legendario+**, **Maxeado (+16)**, **Equipado**, **Bloqueado en el cofre**, **Chaos'd**, **Glyphed**, **Ascendido** — cada una con un tooltip.

**Donuts de filtro cruzado:** Seis gráficos — **Ranuras**, **Rango**, **Rareza**, **Resultado**, **Fuente**, **Nivel** — se actualizan mutuamente al hacer clic.
- Haz clic en un segmento para añadirlo como filtro de esa dimensión; todos los demás gráficos se estrechan de inmediato al equipamiento coincidente. Cada gráfico excluye su propia dimensión para mostrar siempre su rango completo.
- Doble clic en un segmento del donut **Ranuras** para seleccionar un grupo entero de una vez: cualquier pieza de armadura (Arma, Yelmo, Escudo, Guantes, Peto, Botas) selecciona las seis ranuras de armadura; cualquier accesorio (Anillo, Amuleto, Estandarte) selecciona los tres.
- Los donuts **Ranuras** y **Fuente** muestran iconos de categoría. El donut **Nivel** etiqueta cada arco con su texto de nivel.


**Treemap de Sets:** Se muestra debajo de los donuts. Cada mosaico representa un set de equipamiento; el área del mosaico es proporcional al número de objetos. El fondo del mosaico se divide de izquierda a derecha en bandas de color por resultado (Vender / Protegido / Conservar / Sin coincidencia). Haz clic en un mosaico para añadir ese set como filtro cruzado.

**Chips de filtro:** Las selecciones activas para cada dimensión aparecen como chips bajo los donuts; haz clic en el icono de eliminar de un chip para quitar solo ese filtro. Las selecciones de mainstat también aparecen como chips. El botón **Borrar filtros** restablece todas las dimensiones a la vez.

**Barra de Mainstats:** Muestra la frecuencia de cada mainstat en el equipamiento filtrado. Haz clic en una barra para profundizar — el gráfico de frecuencia de substats se actualiza mostrando solo los substats del equipamiento con ese mainstat seleccionado. Haz clic de nuevo para deseleccionar.

**Radar de Frecuencia de Substats:** Muestra la frecuencia de cada substat en el equipamiento filtrado (y opcionalmente limitado por mainstat) como gráfico de araña. Haz clic en una marca de eje para seleccionarla como pivote de coocurrencia — el radar se restringe entonces al equipamiento que contiene todos los substats seleccionados a la vez (hasta 4 pivotes). Los pivotes activos aparecen como chips debajo del gráfico; × elimina uno, **Borrar filtros** los elimina todos.

**Mapa de calor Ranura × Mainstat:** Recuento de objetos por ranura (columnas) × mainstat (filas). Haz clic en un encabezado de columna o una celda para filtrar por esa ranura.

**Pestaña Estadísticas de campeones:** Totales de substats sumados de las piezas equipadas por campeón. Filtra por ubicación (**Todos** / **Colección** / **Cofre**), activa solo **Totalmente equipado** e incluye o excluye los glifos. Muestra series Min/Prom/Mediana/Máx.

**Botones:**
- **Copiar captura:** Renderiza la vista analítica completa como PNG y la copia al portapapeles.
- **Aplicar al Inspector de Equipo:** Envía el filtro cruzado activo al filtro de lista del Inspector de Equipo (solo visible cuando hay un filtro activo).

### Gestión de recetas
- Las recetas guardadas aparecen como chips debajo del constructor. Haz clic para seleccionarlas, o clic derecho para duplicar, mover, copiar o borrar.
- «Delete Recetas» elimina todas (con confirmación).
- Vínculo por hover: al pasar el cursor sobre un chip se iluminan las filas asociadas en la vista previa y viceversa.
- Vínculo por clic: al hacer clic en una fila de la tabla se selecciona la receta de origen (las filas de la HSF base no cambian tu selección).
- Copia alternativa: Si el acceso al portapapeles falla, se abre un diálogo con el texto seleccionado para copiarlo manualmente.
- Interruptor de recetas activado/desactivado: el interruptor del encabezado del constructor desactiva globalmente todas las recetas sin eliminarlas y detiene la canalización de vista previa — útil para revisar rápidamente una exportación solo con protecciones o comprobar qué produce la Venta final por sí sola.

### Vista Sellfile (Reglas e Inspector de Equipo)
- El encabezado reúne el interruptor `Reglas`/`Inspector de Equipo`, el botón «Herramientas» y «Cargar Sellfile de RSL Helper», así siempre sabes dónde cambiar de tabla o abrir el diálogo «Equipo».
- Vista `Reglas` (predeterminada): muestra todas las filas que se exportarán, incluidas las provenientes de la `.hsf` base opcional. Los contadores siguen en Conservar vs Vender, la fila de filtros mantiene los chips Cualquiera/Solo para Ranura/Rango/Rareza/Nivel y ahora muestra los dos botones de Recetas en paralelo: `Reducir` decide si se ocultan los chips fuera de los filtros actuales y la nueva `Selección` funciona como un interruptor Activado/Desactivado que limita las filas del Sellfile a tus chips seleccionados (dejando al mismo tiempo el filtro preparado para el Inspector de Equipo).
- Vista `Inspector de Equipo`: cambia la tabla al listado del Inspector de Equipo para que revises piezas importadas o creadas sin reabrir el diálogo Herramientas. Los contadores y chips pasan a Conservar/Vender/Ámbito/Sin regla (según la regla «la primera coincidencia gana») y la fila de filtros mantiene ambos botones de Recetas lado a lado (`Reducir` + `Selección`). El primero sigue controlando la visibilidad de chips, mientras que la `Selección` se expande al triestado (`Off` → `Primera` → `Por coincidencia`) para aislar las filas del Inspector de Equipo y sigue limitando las reglas del Sellfile cuando regreses a `Reglas`. Importar `.db` conmuta automáticamente a esta vista, pero puedes volver a `Reglas` cuando quieras.
- «Cargar Sellfile de RSL Helper» se comporta igual que arrastrar y soltar: `.sfc` reemplaza el estado del constructor, `.hsf` añade la Sellfile base opcional y `.db` envían piezas directamente al Inspector de Equipo (sin tocar tus recetas). El botón «Limpiar» desacopla la `.hsf` base.
- El icono de paleta abre Gestionar colores para personalizar texto y fondo de los substats.
- En la vista `Reglas` las columnas «Idx» y «Receta» se mantienen (las filas de la `.hsf` base dejan «Receta» vacío). En la vista `Inspector de Equipo`, ese espacio muestra slot/set, estadísticas del objeto y la primera receta/regla que coincide, de modo que ves qué ocurriría con cada pieza desde la vista previa.

### Controles de Vista Sellfile
- Gestionar colores: usa el icono de la paleta; «Restablecer valores predeterminados» recupera los recomendados.
- Filtros: Pulsa `Ctrl+F` (`Cmd+F` en macOS) para abrir el panel y enfocar al instante la búsqueda de recetas. Haz clic derecho en cualquier encabezado de sección (o `Ctrl`/`Cmd`+clic en su chevrón) para colapsar o expandir todas las secciones de una sola vez. `Reducir` oculta chips que no coinciden con el filtro activo para que la tabla siga legible. `Selección` decide qué recetas se permiten en la tabla: en `Reglas` actúa como un simple interruptor Activado/Desactivado, y en el Inspector de Equipo rota por `Off` → `Primera` → `Por coincidencia` para controlar también cómo responden las filas del Inspector de Equipo.
- Menú de columnas (clic derecho en la cabecera):
  - Restablecer columnas: vuelve a los valores iniciales.
  - Ajustar anchura: adapta las columnas al ancho de la ventana.
  - Permitir filas multilínea: habilita el salto de línea (útil para Substats).
  - Mostrar/Ocultar columnas: casillas individuales por columna.
- Reordenar columnas: arrastra una cabecera horizontalmente.
- Redimensionar columnas: arrastra el borde derecho de la cabecera.
- Comportamiento de clic: una fila selecciona la receta correspondiente (sin desplazamiento automático). Un clic en el chip de la receta desplaza la tabla a la primera coincidencia.

### Inspector de Equipo
- Haz clic en «Herramientas» en el encabezado de la vista previa para abrir el diálogo «Equipo». Crea equipo de ejemplo. Los objetos se sincronizan al instante con la vista previa, así que cerrar el diálogo no borra la cuadrícula del Inspector de Equipo.
- Conecta RSL Helper para sincronización en vivo (el botón Connect en el encabezado de la vista previa) o importa archivos `.db` arrastrándolos a la app o usando el botón «Cargar Sellfile de RSL Helper».- Cada fila del Inspector de Equipo muestra slot, set, nivel, stat principal, un resumen de substats (con glifos y recuentos de tiradas), la fuente (inventario vs bandeja) y chips de Conservar/Vender junto con la primera receta/regla que coincidió. Las reglas desactivadas nunca coinciden, por lo que «Sin coincidencia» representa equipo que la Sellfile dejaría intacto.
- Los contadores del encabezado muestran los totales de Conservar/Vender/Ámbito/Sin regla. Los cuatro botones de filtro de resultado — **Conservar**, **Vender**, **Ámbito** y **Sin regla** — funcionan como conmutadores independientes: activa cualquier combinación para reducir la lista. **Ámbito** atenúa (pero mantiene visibles) los objetos que comparten el mismo set+ranura que una pieza que tus reglas venderían, para que puedas comparar un candidato con su competencia en una sola vista sin necesidad de dos pasadas de filtro. Cuando también se seleccionan una o más **Fuentes**, estas actúan como conjunto de referencia — solo los objetos marcados para vender de las fuentes seleccionadas se convierten en elementos principales, mientras que los acompañantes se extraen de *todas* las fuentes, lo que permite ver cada copia de esa pieza de equipo independientemente de dónde esté. **Sin regla** muestra el equipo que ninguna regla toca: útil para detectar huecos en tus recetas. Combínalos con el selector `Primera`/`Por coincidencia` de Recetas para centrarte en los casos límite antes de exportar.
- Usa el interruptor de vista previa para alternar entre las tablas de Reglas y del Inspector de Equipo sin volver a abrir el diálogo Herramientas, ideal para comparar el resultado de cada regla con la pieza que la activó.
- La tabla del Inspector de Equipo está virtualizada, de modo que incluso con más de 7000 filas importadas sigue respondiendo con fluidez.

### Exportar
- «Exportar Sellfile de RSL Helper combinada» aparece cuando hay archivo base; si no, verás «Exportar Sellfile de RSL Helper».
- Usa «Guardar recetas» y «Cargar recetas» en el constructor para conservar tu trabajo.
- El nombre predeterminado del archivo exportado es `Sellfile_AAAA MM DD_HHMM.hsf`.

## Ejemplos

Todos los ejemplos usan objetivos de substats de 6★ por unidad de tirada: SPD=5, CR%=5, CDMG%=5.

**Temprano vs. Tardío**
- **Temprano**: los umbrales reflejan las tiradas que ya llevas. Con ★ + suma mínima, solo muestra las divisiones mínimas en cada hito (lista estable). En otros casos enumera el progreso de los stats seleccionados hasta que la meta de +16 se vuelve viable y luego se queda en tus objetivos por stat (a menos que una suma global exija más).
- **Tardío**: solo exige lo que debe existir ahora para que la meta de +16 siga posible. Con ★ + suma mínima repite esas divisiones en los primeros hitos y otra vez en +16. Con objetivos por stat emite los límites inferiores necesarios en cada nivel.

#### Escenarios del constructor de un vistazo

| Escenario | Receta | Lo que emite el constructor |
| --- | --- | --- |
| Temprano (2 substats) | SPD mín = 2, CR% mín = 1, Niveles +0..+16 | `+0:` SPD ≥ 5, CR ≥ 5<br>`+4:` [10,5] y [5,10]<br>`+8:` [15,5], [10,10], [5,15]<br>`+12/+16:` [15,10] |
| Tardío (2 substats) | Igual que arriba | `+0/+4:` [5,5]<br>`+8:` [10,5] o [5,10]<br>`+12:` [15,5] o [10,10]<br>`+16:` [15,10] |
| Temprano (3 substats) | SPD mín = 2, CR% mín = 1, CDMG% seleccionado, Requeridos = 3 | `+0:` [SPD,CR,CDMG] ≥ [5,5,5]<br>`+4:` divisiones de una tirada (permutaciones 10/5/5)<br>`+8:` todas las permutaciones de dos tiradas (respetando límites superiores)<br>`+12/+16:` [15,10,5] |
| Tardío (3 substats) | Mismos stats que arriba | `+0/+4:` [5,5,5]<br>`+8:` [10,5,5] o [5,10,5]<br>`+12:` [15,5,5] o [10,10,5]<br>`+16:` [15,10,5] |
| Bloquear uno, exigir dos | Substats SPD/HP/ATK; bloquea SPD (🔒); Substats requeridos = 2 | Se generan filas SPD+HP y SPD+ATK; HP+ATK queda fuera porque SPD bloqueado debe aparecer en todas. |
| Tiradas en 3 stats y slot flexible congelado | Substats SPD/CR%/CDMG%/HP%/ATK%/DEF%; Substats requeridos = 4; SPD/CR%/CDMG% con Tiradas mín = 1; HP%/ATK%/DEF% con límite superior de tiradas = 0 | SPD/CR%/CDMG% reciben siempre las tiradas y el cuarto stat (cualquiera de HP%/ATK%/DEF%) se queda en base. Usa límites superiores (clic derecho desde ★) cuando un stat no debe mejorar. |
| Temprano con comodín | Substats SPD (mín = 2) y ACC (comodín ★); Substats requeridos = Auto; Niveles +0..+16 | Los hitos tempranos resaltan piezas que aún pueden alcanzar SPD(2) en +16 (filas donde SPD o ACC reciben tirada). Cuando ya son posibles dos tiradas en SPD, aparece la fila SPD ≥. |
| Suma de tiradas con comodines | Substats SPD y ACC como comodines ★; Substats requeridos = 2; Tiradas mínimas = 1 | **Temprano:** en +4/+8/+12/+16 muestra las dos divisiones mínimas (SPD ≥ 10 y ACC ≥ 9, además de SPD ≥ 5 y ACC ≥ 18).<br>**Tardío:** +0/+4/+8/+12 muestran filas base y +16 repite esas dos divisiones. Con objetivos mayores, Tardío exige antes la suma necesaria (p. ej. con mínimo = 2, +12 muestra divisiones de una tirada y +16 las de dos). |

## Notas para colaboradores

- Traducciones: Los paquetes de lanzamiento incluyen plantillas de localización en `i18n/` (p. ej., `i18n/es-ES.l10n.json`).
- Editar y probar: Abre la app y arrastra tu `*.l10n.json` editado para aplicarlo de inmediato en la sesión actual (no se necesita ni se puede instalar nada).
- Enviar correcciones: Envía el JSON actualizado por mensaje de Discord. Mantén las claves sin cambios; las claves que falten volverán al inglés.
- Idiomas integrados: Todos los idiomas incluidos se compilan en el único HTML, por lo que la app funciona completamente sin conexión. Tus correcciones se integrarán en la siguiente versión.
- `Stream-Helper-DB-to-Creator.bat` inicia el DB watcher y transmite la base de datos predeterminada de RSL Helper a Sellfile Creator para comprobar recetas en vivo más fácilmente.

## Agradecimientos

Muchas gracias a **[STBL] Nasgor** por sus aportes invaluables,  
a **[SP] Panda** por sus Sellfiles,  
a **KruYseN** por sus vídeos de limpieza de equipo,  
y por supuesto a **Farbstoff** por RSL Helper.

## Autoría
Hecho por [STBL] Nusi㊷  
Localización de AI

© Nusi㊷ - 2026
