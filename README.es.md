# RSL Helper Sellfile Creator

Crea, revisa y exporta reglas de venta para RSL Helper con una interfaz sencilla.

> Herramienta creada por fans. No está afiliada a Plarium, Raid: Shadow Legends ni RSL Helper. Todas las marcas mencionadas pertenecen a sus dueños.

## Funciones
- Construir y guardar reglas: crea configuraciones y mantén una biblioteca reutilizable.
- Vista previa del Sellfile: revisa las reglas generadas, con o sin tu sellfile actual.
- Vista previa con tu sellfile (opcional): arrastra tu `.hsf` a la app para verla junto con tus reglas. También puedes soltar un archivo de configuraciones (`.hsfc`). La superposición confirma qué archivos se aceptan.
- Metasets: agrupa conjuntos de equipo (por ejemplo, Velocidad + Percepción) y reutilízalos en varias reglas.
- Exportación con un clic: genera un archivo HSF (Sellfile de RSL Helper) listo para cargar en RSL Helper.

## Cómo usarlo

### Archivo de configuraciones
- HSFC (`.hsfc`): archivo de proyecto para esta app. Piénsalo como una partida guardada que puedes cargar o compartir. RSL Helper no usa HSFC directamente.
- HSF (`.hsf`): el sellfile que consume RSL Helper. Expórtalo desde la app y luego cárgalo dentro de RSL Helper.
- Nombre predeterminado al guardar: `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Configs Builder
- Completa el Configs Builder y da un nombre claro a tu configuración.
- Pulsa «Agregar como nueva config» para guardarla. Después selecciónala en la lista debajo del builder para editarla y guarda los cambios con «Actualizar config seleccionada».
- Cargar/Guardar: usa «Cargar configs» y «Guardar configs» para reutilizar tus reglas. Estas acciones incluyen todo lo necesario para reconstruir la vista previa.
- Nota: pulsa «Agregar nota» (o «Editar nota») para adjuntar un texto al archivo de configuraciones. Al cargar un archivo que contiene nota, se mostrará automáticamente.

### Diseño del builder (de arriba hacia abajo)
- Acción: Conservar o Vender, además del interruptor Activado.
  - «Activado» decide si las reglas de esa configuración están activas. Si está apagado, las reglas se exportan pero RSL Helper las ignora. En la vista previa se muestran con una línea blanca y la etiqueta guardada aparece tachada.
- Rango, Rareza, Facción, Niveles.
  - Facción (opcional) solo aplica a accesorios (Anillo, Amuleto, Estandarte).
  - Niveles: elige Nivel mínimo y máximo entre +0, +4, +8, +12, +16. El sistema genera reglas para cada hito dentro de esa ventana.
  - Rareza = Auto (recomendado): selecciona la rareza más baja que permite cumplir tus requisitos en el rango de niveles.
    - ¿Sin mínimos de tiradas? Auto deja las reglas amplias y válidas para todas las rarezas.
    - ¿Exiges 1/2/3/4 substats en +0? Auto asegura que la rareza pueda comenzar con esa cantidad (1 → ≥ Poco común, 2 → ≥ Raro, 3 → ≥ Épico, 4 → ≥ Legendario).
    - ¿Exiges número de tiradas (p. ej. «al menos 3 tiradas»)? Auto elige la rareza que puede alcanzar esa suma a +16. Para 5 tiradas, selecciona Mítico.
    - Chip «Auto ≥» (junto a Rareza): establece un mínimo para Auto y, con Late, añade filas «≥» adicionales en los hitos relevantes.
      - Secuencia: Poco común → Raro → Épico. «Auto ≥ Raro» significa que Auto no bajará de ≥ Raro.
      - Funciona mejor con Late + mínimos de tiradas. Si está inactivo, verás «Auto + Late» con una barra diagonal.
      - Ejemplo: Estandarte con SPD y ATK%, ATK% necesita 2 tiradas. Configura Rareza = Auto, Modo = Late y Auto ≥ Épico.
        - Obtendrás filas Épicas en toda la ventana de niveles y filas ≥ Legendarias en +8/+12 (Legendario suele recibir la última tirada en +16).
        - Resultado: Épico mantiene un ritmo estricto y Legendario sigue siendo justo; nadie queda fuera por tener más rareza.
    - Presencia antes de +16: si la rareza aún no puede tener todos los substats deseados, la regla usa el máximo disponible en ese hito. A +16 se aplican tus objetivos.

- Mainstat y Substats – tres filas con los mismos botones:
  1) Any
  2) HP, HP%, ATK, ATK%, DEF, DEF%
  3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat permite selecciones múltiples. Sin selección = Any. Con varios valores, la app genera una regla por mainstat.
  - «Any» es un reinicio rápido. En Substats, Any equivale a ninguno; al elegir substats, Any se desactiva.
  - Los substats tienen tres estados: clic = seleccionar; clic de nuevo = fijar (🔒); clic otra vez = quitar. Los substats fijados siempre aparecen en la regla. El total apuntado es max(Obligatorio, Fijado) limitado a 4.
  - Indicador de tiradas: círculo pequeño en cada substat seleccionado.
    - Clic izquierdo = aumentar. Derecho = reducir.
    - Comodín (★): las tiradas pueden caer en cualquier parte de ese substat.
    - Clic izquierdo en ★ define tiradas mínimas (verde): 0 → 1 → 2 → 3 → 4 → 5 → ★.
    - Clic derecho en ★ define límite de tiradas (rojo): 0 → 1 → 2 → 3 → 4 → ★. Un límite en 0 prohíbe tiradas.
    - Mínimo y Límite se excluyen mutuamente.
- Substats requeridos – a la derecha. Define cuántos substats elegidos debe tener el objeto. Los substats bloqueados cuentan siempre.
- Selección de Sets/Metasets: los chips bajo los substats muestran los sets y metasets elegidos.
- Modo Early/Late:
  - Early: cada nivel incluye las distribuciones que funcionan a lo largo del progreso hasta el objetivo. Con comodines + mínimo requerido, Early lista todas las divisiones posibles por nivel. Los límites se respetan.
  - Late: exige solo lo necesario en cada momento para alcanzar el objetivo de +16. Con comodín + mínimo requerido, Late muestra presencia en niveles tempranos y aplica las divisiones mínimas a +16. Con mínimos por stat, Late genera los límites mínimos por nivel.

Ejemplo: Early (2 substats) – SPD mín = 2, CR% mín = 1 (niveles 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] y [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Ejemplo: Late (2 substats) – SPD mín = 2, CR% mín = 1 (0..16)
- +0/+4: [5,5]
- +8: [10,5] o [5,10]
- +12: [15,5] o [10,10]
- +16: [15,10]

Ejemplo: Early (3 substats) – SPD mín = 2, CR% mín = 1, CDMG% libre, Requerido = 3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: divisiones de una tirada: [10,5,5], [5,10,5], [5,5,10]
- +8: divisiones de dos tiradas (respetando límites)
- +12/+16: [15,10,5]

Ejemplo: Late (3 substats) – SPD mín = 2, CR% mín = 1, CDMG% libre, Requerido = 3
- +0/+4: [5,5,5]
- +8: [10,5,5] o [5,10,5]
- +12: [15,5,5] o [10,10,5]
- +16: [15,10,5]

Consejo: usa límites para prohibir tiradas en un stat. Desde ★, clic derecho y establece el límite en 0. Así CDMG% se queda base y SPD/CR reciben las tiradas.

Ejemplo: Bloquear uno y exigir dos
- Selecciona SPD, HP, ATK. Haz doble clic en SPD para bloquearlo (🔒).
- Substats requeridos = 2.
- Resultado: las reglas incluyen SPD+HP y SPD+ATK, pero no HP+ATK sin SPD.

Ejemplo: Enfocar tiradas en 3 stats y prohibir la 4ª
- Objetivo: conservar objetos con SPD, CR%, CDMG% y uno de HP%/ATK%/DEF%, pero sin tiradas en ese cuarto stat.
- Selecciona SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Substats requeridos = 4.
- Indicadores:
  - Desde ★, clic izquierdo (mínimos): pon SPD/CR%/CDMG% en tus mínimos (p. ej. 1 cada uno).
  - Desde ★, clic derecho (límite): fija HP%/ATK%/DEF% en 0.
- Resultado: el cuarto substat rota entre los tres, pero sin tiradas; SPD/CR%/CDMG% absorben las tiradas.

Ejemplo: Early con comodín (solo seleccionados)
- Selecciona SPD y ACC.
- Indicadores: SPD mín = 2; ACC = ★.
- Substats requeridos: Auto (2).
- Niveles: +0 a +16.
- Resultado: Early muestra objetos que pueden llegar a SPD(2) en +16 (filas donde SPD o ACC ha recibido tirada). Cuando dos tiradas en SPD son posibles, aparece la fila con el mínimo.

Ejemplo: Suma de tiradas con comodines (2 substats)
- Selecciona SPD y ACC, ambos en ★.
- Substats requeridos: 2. Tiradas mínimas requeridas: 1.
- Early:
  - +4/+8/+12/+16: dos filas – SPD ≥ 10, ACC ≥ 9 y SPD ≥ 5, ACC ≥ 18 (repartos mínimos, estables).
- Late:
  - +0/+4/+8/+12: solo presencia (mínimo actual = 0); +16: las dos filas superiores. Con mínimos mayores, Late exige los repartos mínimos en los hitos apropiados.

## Notas para colaboradores

- Traducciones: Los paquetes de la versión incluyen plantillas de localización en `i18n/` (p. ej. `i18n/en-US.l10n.json`, `i18n/de-DE.l10n.json`, `i18n/fr-FR.l10n.json`, `i18n/es-ES.l10n.json`, `i18n/pt-PT.l10n.json`, además de esqueletos para `i18n/ru-RU.l10n.json`, `i18n/uk-UA.l10n.json`, `i18n/tr-TR.l10n.json`).
- Editar y probar: Abre la app y arrastra tu `*.l10n.json` editado para aplicarlo inmediatamente en la sesión actual (no necesita instalación).
- Enviar correcciones: Envía la JSON actualizada mediante un pull request (preferido) o adjúntala a un issue. Mantén las claves sin cambios; las claves que falten se mostrarán en inglés.
- Idiomas integrados: Todos los idiomas incluidos vienen incrustados en el HTML único para que la app funcione sin conexión. Tus mejoras se incorporarán en la siguiente versión.

## Agradecimientos

Muchas gracias a [STBL] Nasgor por sus contribuciones invaluables,  
y gracias también a Farbstoff por RSL Helper.

## Autoría
Hecho por [STBL] Nusi㊷
Localización de Codex
