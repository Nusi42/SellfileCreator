# RSL Helper Sellfile Creator

Crea, revisa y exporta reglas de venta para RSL Helper con una interfaz sencilla.

> Herramienta creada por fans. No está afiliada a Plarium, Raid: Shadow Legends ni RSL Helper. Todas las marcas mencionadas pertenecen a sus dueños.

## Funciones
- Construir y guardar reglas: crea configs y conserva una biblioteca reutilizable.
- Interruptor Vista Sellfile: cambia desde el encabezado entre la tabla de Reglas y la tabla del Probador. Los contadores/chips se adaptan (Conservar/Vender para reglas, Coincidencia/Sin coincidencia para el tester) y los filtros siguen el modo que elijas.
- Arrastrar y soltar o botón «Cargar Sellfile de RSL Helper»: arrastra `.hsfc`, `.hsf` o `.db` a cualquier parte (la superposición lo confirma) o haz clic en el botón. Ambos caminos hacen lo mismo: `.hsfc` reemplaza el constructor, `.hsf` añade la Sellfile base opcional y las `.db` van directas a la cola del Probador sin tocar tus configs.
- Metasets: agrupa conjuntos de equipo (por ejemplo, Velocidad + Percepción) y reutilízalos en varias reglas.
- Exportación con un clic: genera un archivo HSF (Sellfile de RSL Helper) listo para cargar en RSL Helper.
- Vista del Probador + pestaña «Equipo...»: haz clic en el botón del encabezado para abrir el diálogo de Venta final directamente en la pestaña Equipo, crea equipo de ejemplo, pega filas o arrastra tu base de datos de RSL Helper (normalmente `%APPDATA%\\RslHelper\\Config`). Después puedes cerrar el diálogo y usar el interruptor de vista previa para mantener ese equipo visible mientras lo comparas con tus reglas.
- Pestaña «Conservar únicos»: define las combinaciones que nunca quieres perder. El escáner genera reglas de conservación automáticamente cuando tus configs más tus reglas de venta actualmente activas eliminarían todas las copias.

## Cómo usarlo

### Archivo de configs
- HSFC (`.hsfc`): archivo de proyecto para esta app. Piénsalo como una partida guardada que puedes cargar o compartir. RSL Helper no usa HSFC directamente.
- HSF (`.hsf`): el Sellfile que consume RSL Helper. Expórtalo desde la app y luego cárgalo dentro de RSL Helper.
- El nombre predeterminado al guardar es `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Constructor de configs
- Completa el Constructor de configs y da un nombre claro a tu config.
- Pulsa «Agregar como nueva config» para guardarla. Después selecciónala en la lista debajo del constructor para editarla y guarda los cambios con «Actualizar config seleccionada».
- Cargar/Guardar: usa «Cargar configs» y «Guardar configs» para reutilizar tus reglas. Estas acciones guardan todo lo necesario para reconstruir la vista previa.
- Menús de Reset/Insert/Apply: haz clic derecho en «Reset», «Insert as config» o «Apply as config» para abrir las opciones compartidas. Guarda el estado actual del constructor como plantilla predeterminada, vuelve a los valores de fábrica, habilita «Auto reset after Insert» (limpia el constructor en cuanto insertas una config) o «Auto apply to selected config» (envía los cambios a la config seleccionada automáticamente tras ~400 ms de inactividad). Auto reset y Auto apply no pueden estar activos al mismo tiempo: al activar uno se apaga el otro, y ambas preferencias permanecen entre sesiones.
- Nota: pulsa «Agregar nota…» (o «Editar nota…») para adjuntar un texto al archivo de configs. Al cargar un archivo que contiene nota, se mostrará automáticamente. Usa `<!-- configs:1,0 -->` para insertar chips de configs concretas (0 toma la siguiente config). Usa `<!-- configs-re:"speed" -->` para mostrar todas las configs cuyo nombre coincide con el patrón (sin distinguir mayúsculas/minúsculas).
- Restaurar Autosave: al iniciar, el diálogo lista cada sección autoguardada con su propia casilla. Restaura solo lo que necesites — configs (incluida la selección actual), metasets, Objetivos de substats, resto de Venta final, nota fijada, panel de filtros (estado, chips, secciones colapsadas) e importaciones del Probador. Deja una casilla desmarcada para conservar tu trabajo. Autosave también recuerda qué interruptores de Venta final (Artefactos, Accesorios y rangos de nivel) estaban activos, así que al reabrirlo refleja exactamente lo que exportaste la última vez.

### Diseño del constructor (de arriba hacia abajo)
- Acción y Activado: Indica qué debe ocurrir cuando un objeto coincide con la config.
  - `Conservar` marca el objeto como Conservar; RSL Helper lo deja intacto.
  - `Vender` marca el objeto como Vender; RSL Helper lo pone en la cola de venta.
  - El interruptor «Activado en el Sellfile» decide si las filas exportadas siguen activas. Las configs desactivadas se exportan con Use = false (se ven tachadas en la vista previa); activa «Omitir reglas desactivadas al exportar» en el menú de exportación si prefieres dejarlas fuera.
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
- Abre el diálogo mediante «Objetivos de substats…» en la esquina superior derecha del constructor.
- Los objetivos son globales: afectan a todas las configs.
- Estos objetivos definen las referencias por rango de nivel (0–3, 4–7, 8–11, 12–15, 16) y sirven como respaldo en la cuadrícula de Objetivos de tiradas.
- Usa «Restablecer valores predeterminados» para volver a los objetivos recomendados.

### Metasets
- Pulsa «Gestionar metasets…» para abrir el diálogo.
- Crea o renombra metasets y asigna los sets que contiene cada uno. La vista usa la misma búsqueda que el selector de sets.
- Se incluyen metasets iniciales para empezar rápido; puedes editarlos o eliminarlos.
- «Restablecer valores predeterminados» ofrece opciones seguras cuando un metaset está en uso (eliminar, sustituir por sets explícitos o por otro metaset).

### Venta final
- Interruptor junto al botón Exportar que añade reglas de venta para lo que no coincidió en otras configs. Está activado por defecto.
- Decide si afecta a Artefactos y/o Accesorios y qué rangos de nivel (0–3, 4–7, 8–11, 12–15, 16). El valor por defecto cubre 0–15 para no vender piezas ya subidas a +16.
- Sin venta final, RSL Helper conserva todo lo que no coincide con una regla. Solo se vende si una regla explícita indica Vender.
- Con venta final activa, las reglas generadas incluyen todos los sets conocidos. En la vista previa se muestra «Todos los sets conocidos» para reducir ruido, pero el archivo exportado enumera cada set.

### Conservar únicos
- Abre el diálogo de Venta final y cambia a la pestaña `Conservar únicos` para marcar las combinaciones que nunca quieres perder. Activa `Activar Conservar únicos` para empezar a editar.
- Cada regla de conservación te deja elegir ranura, sets o metasets, rangos, rarezas, stats principales y (en accesorios) facciones. Sin selección significa «cualquiera».
- Encontrarás una regla predeterminada para anillos, amuletos y estandartes de 5★/6★ en todos los sets 1–9 y de accesorio individual, con `Por ranura`, `Por conjunto`, `Por facción` y `Por stat principal` activados para que cada mezcla conserve al menos una pieza.
- También hay una regla de ayuda desactivada que cubre armas/piezas de armadura (arma, casco, escudo, guantes, peto, botas) en los sets stun/toxic/daze/cursed/provoke/destroy a 5★/6★, con `Por ranura` y `Por conjunto` preparados para habilitarla cuando estos sets raros necesiten blindaje adicional.
- `≥ Cantidad necesaria` es la promesa que quieres cumplir. Los chips justo debajo de cada selector (todo salvo Rango y Rareza) comparten o duplican la cuota: `Por ranura`, `Por conjunto`, `Por facción` y `Por stat principal` se pueden combinar libremente, y al apagarlos todos la regla vuelve automáticamente a `Por regla`.
- El contador `Hay {have} / Conservar {keep}` refleja lo mismo que explica la ayuda: **Hay** cuenta piezas ya protegidas por configs, Venta final o reglas existentes, mientras que **Conservar** es la cuota que fijaste en `≥ Cantidad necesaria`. Solo se tienen en cuenta los objetos que coinciden con la regla.
- El escáner solo añade filas de conservación cuando cada objeto coincidente acabaría vendido. Si tus configs normales ya salvan suficientes piezas, verás «Cubierto en otro lugar» y no se exporta nada nuevo.

#### Alcances de cuota de un vistazo

| Botón de ámbito | Comportamiento de la cuota | Cuándo destaca |
| --- | --- | --- |
| `Por regla` | Un único cupo para toda la regla. | Conserva cinco botas SPD sin importar el set. |
| `Por ranura` | Duplica la cuota por cada ranura. | Mantiene dos anillos, dos amuletos y dos estandartes por separado. |
| `Por conjunto` | Duplica la cuota por cada set/metaset de la tarjeta. | Sigue por separado dos caídas de Stoneskin y dos de Protection. |
| `Por facción` | Duplica la cuota por facción. | Garantiza tres anillos Merciless por facción. |
| `Por stat principal` | Duplica la cuota por cada stat principal seleccionado. | Divide los pools para estandartes de ACC y RES. |

#### Ejemplos reales

| Escenario | Filtros | Chips de ámbito | Lo que garantiza el escáner |
| --- | --- | --- | --- |
| Se acaban las botas de SPD | Ranura = Botas, Stat principal = SPD, Sets en blanco | `Por regla` | Sobreviven al menos cinco botas SPD, sin importar el set. |
| Mezclar guantes Savage y Lethal | Ranura = Guantes, Sets = Savage + Lethal, Stat principal = CDMG% | `Por regla` | Conserva tres guantes de daño aunque cambie la mezcla de sets. |
| Anillos Merciless por facción | Ranura = Anillo, Set = Merciless, Facción sin filtrar | `Por facción` | Cada facción guarda tres anillos propios antes de que la regla se dé por cumplida. |
| Anillos de HP% por facción | Ranura = Anillo, Stat principal = HP%, Sets en blanco | `Por facción` | Se aseguran dos anillos de HP% por facción. |
| Accesorios básicos por facción | Tres reglas (Anillo, Amuleto, Estandarte), Sets y Stat principal en blanco | `Por facción` | Cada facción conserva cinco piezas por ranura. |
| Stoneskin + Protection por facción | Ranura = Anillo/Amuleto/Estandarte, Sets = Stoneskin + Protection, Stat principal en blanco | `Por conjunto` + `Por facción` | Cada facción guarda dos piezas Stoneskin y dos Protection en cada ranura. |

Consejo: Importa tu `.db` o pega equipo en la pestaña Equipo (Probador) antes de abrir la pestaña para que el escáner tenga objetos reales. Cuando una regla muestre «Faltan 2», haz clic para resaltar ese equipo en el Probador y ver qué facción o set necesita ayuda.

### Gestión de configs
- Las configs guardadas aparecen como chips debajo del constructor. Haz clic para seleccionarlas, o clic derecho para duplicar, mover, copiar o borrar.
- «Delete Configs» elimina todas (con confirmación).
- Vínculo por hover: al pasar el cursor sobre un chip se iluminan las filas asociadas en la vista previa y viceversa.
- Vínculo por clic: al hacer clic en una fila de la tabla se selecciona la config de origen (las filas de la HSF base no cambian tu selección).
- Copia alternativa: Si el acceso al portapapeles falla, se abre un diálogo con el texto seleccionado para copiarlo manualmente.

### Vista Sellfile (Reglas y Probador)
- El encabezado reúne el interruptor `Reglas`/`Probador`, el botón «Equipo...» y «Cargar Sellfile de RSL Helper», así siempre sabes dónde cambiar de tabla o abrir la pestaña Equipo del diálogo de Venta final.
- Vista `Reglas` (predeterminada): muestra todas las filas que se exportarán, incluidas las provenientes de la `.hsf` base opcional. Los contadores siguen en Conservar vs Vender, la fila de filtros mantiene los chips Cualquiera/Solo para Ranura/Rango/Rareza/Nivel y ahora muestra los dos botones de Configs en paralelo: `Configs vista` decide si se ocultan los chips fuera de los filtros actuales y el nuevo `Filtro de configs` funciona como un interruptor Activado/Desactivado que limita las filas del Sellfile a tus chips seleccionados (dejando al mismo tiempo el filtro preparado para cuando abras el tester).
- Vista `Probador`: cambia la tabla al listado del Probador para que revises piezas importadas o creadas sin reabrir el diálogo de Venta final. Los contadores y chips pasan a Coincidencia vs Sin coincidencia (además de Conservar/Vender según la regla de «la primera coincidencia gana») y la fila de filtros mantiene ambos botones de Configs lado a lado (`Configs vista` + `Filtro de configs`). El primero sigue controlando la visibilidad de chips, mientras que el `Filtro de configs` se expande al triestado (`Off` → `Primera` → `Cualquiera`) para aislar las filas del Probador y sigue limitando las reglas del Sellfile cuando regreses a `Reglas`. A eso se suma el filtro de resultados específico (Conservar/Vender vs Coincidencia/Sin coincidencia), así puedes aislar piezas cuyo primer match, o cualquier match, pertenece a tu selección sin ocultar chips. Importar `.db` conmuta automáticamente a esta vista, pero puedes volver a `Reglas` cuando quieras.
- «Cargar Sellfile de RSL Helper» se comporta igual que arrastrar y soltar: `.hsfc` reemplaza el estado del constructor, `.hsf` añade la Sellfile base opcional y `.db` envían piezas directamente a la vista del Probador (sin tocar tus configs). El botón «Limpiar» desacopla la `.hsf` base.
- El icono de paleta abre Gestionar colores para personalizar texto y fondo de los substats.
- En la vista `Reglas` las columnas «Idx» y «Cfg» se mantienen (las filas de la `.hsf` base dejan «Cfg» vacío). En la vista `Probador`, ese espacio muestra slot/set, estadísticas del objeto y la primera config/regla que coincide, de modo que ves qué ocurriría con cada pieza desde la vista previa.

### Controles de Vista Sellfile
- Gestionar colores: usa el icono de la paleta; «Restablecer valores predeterminados» recupera los recomendados.
- Filtros: Pulsa `Ctrl+F` (`Cmd+F` en macOS) para abrir el panel y enfocar al instante la búsqueda de configs. Haz clic derecho en cualquier encabezado de sección (o `Ctrl`/`Cmd`+clic en su chevrón) para colapsar o expandir todas las secciones de una sola vez. `Configs vista` oculta chips que no coinciden con el filtro activo para que la tabla siga legible. `Filtro de configs` decide qué configs se permiten en la tabla: en `Reglas` actúa como un simple interruptor Activado/Desactivado, y en la vista del Probador rota por `Off` → `Primera` → `Cualquiera` para controlar también cómo responden las filas del Probador.
- Menú de columnas (clic derecho en la cabecera):
  - Restablecer columnas: vuelve a los valores iniciales.
  - Ajustar anchura: adapta las columnas al ancho de la ventana.
  - Permitir filas multilínea: habilita el salto de línea (útil para Substats).
  - Mostrar/Ocultar columnas: casillas individuales por columna.
- Reordenar columnas: arrastra una cabecera horizontalmente.
- Redimensionar columnas: arrastra el borde derecho de la cabecera.
- Comportamiento de clic: una fila selecciona la config correspondiente (sin desplazamiento automático). Un clic en el chip de la config desplaza la tabla a la primera coincidencia.

### Vista del Probador
- Haz clic en «Equipo...» en el encabezado de la vista previa para abrir el diálogo de Venta final en la pestaña Equipo. Crea equipo de ejemplo o pega filas (JSON/texto). Los objetos se sincronizan al instante con la vista previa, así que cerrar el diálogo no borra la cuadrícula del Probador.
- Importa tu base de datos de RSL Helper arrastrando archivos `.db` a la app o usando el botón «Cargar Sellfile de RSL Helper» (se comporta igual). Estas importaciones ponen en cola miles de artefactos más el buzón, cambian la vista a `Probador` y dejan intactos el constructor y el estado de exportación.
- Cada fila del Probador muestra slot, set, nivel, stat principal, un resumen de substats (con glifos y recuentos de tiradas), la fuente (inventario vs bandeja) y chips de Conservar/Vender junto con la primera config/regla que coincidió. Las reglas desactivadas nunca coinciden, por lo que «Sin coincidencia» representa equipo que la Sellfile dejaría intacto.
- Los contadores del encabezado pasan a Coincidencia vs Sin coincidencia y también desglosan Conservar/Vender. Combínalos con los filtros del Probador (resultado + `Configs tester` con `Off`/`Primera`/`Cualquiera`) para centrarte en casos límite antes de exportar.
- Usa el interruptor de vista previa para alternar entre las tablas de Reglas y del Probador sin volver a abrir el diálogo de Venta final, ideal para comparar el resultado de cada regla con la pieza que la activó.
- La tabla del Probador está virtualizada, de modo que incluso con más de 7000 filas importadas sigue respondiendo con fluidez.

### Exportar
- «Exportar Sellfile de RSL Helper combinada» aparece cuando hay archivo base; si no, verás «Exportar Sellfile de RSL Helper».
- Usa «Guardar configs» y «Cargar configs» en el constructor para conservar tu trabajo.
- El nombre predeterminado del archivo exportado es `Sellfile_AAAA MM DD_HHMM.hsf`.

## Ejemplos

Todos los ejemplos usan objetivos de substats de 6★ por unidad de tirada: SPD=5, CR%=5, CDMG%=5.

**Temprano vs. Tardío**
- **Temprano**: los umbrales reflejan las tiradas que ya llevas. Con ★ + suma mínima, solo muestra las divisiones mínimas en cada hito (lista estable). En otros casos enumera el progreso de los stats seleccionados hasta que la meta de +16 se vuelve viable y luego se queda en tus objetivos por stat (a menos que una suma global exija más).
- **Tardío**: solo exige lo que debe existir ahora para que la meta de +16 siga posible. Con ★ + suma mínima repite esas divisiones en los primeros hitos y otra vez en +16. Con objetivos por stat emite los límites inferiores necesarios en cada nivel.

#### Escenarios del constructor de un vistazo

| Escenario | Configuración | Lo que emite el constructor |
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
- Vigila la base de datos de RSL Helper: ejecuta `scripts/run-sample-server.ps1 -WatchGearDb` (o pasa `-GearDbPath <archivo>`) para observar `%APPDATA%\\RslHelper\\Config`. Cada vez que la `.db` cambie, el servidor de ejemplo la envía al Probador que abrió y, si hay varias bases, te preguntará cuál seguir.
- Lanzador rápido: `Stream-Helper-DB-to-Creator.bat` abre el servidor de ejemplo en PowerShell con `-WatchGearDb "%APPDATA%\\RslHelper\\Config"` para transmitir la base predeterminada de RSL Helper sin tocar la consola; añade banderas extra después del nombre del `.bat` si quieres personalizar la ejecución.

## Agradecimientos

Muchas gracias a **[STBL] Nasgor** por sus aportes invaluables,  
a **[SP] Panda** por sus Sellfiles,  
a **KruYseN** por sus vídeos de limpieza de equipo,  
y por supuesto a **Farbstoff** por RSL Helper.

## Autoría
Hecho por [STBL] Nusi㊷  
Localización de Codex

© Nusi㊷ - 2025
