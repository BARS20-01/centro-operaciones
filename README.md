# NEXUS PRIME

**Engineering Operations Nexus**  
Digital Twin Platform para visualizar infraestructura, servicios, aplicaciones y laboratorios desde un Command Center.

> **Versión de trabajo: v0.7.0-alpha.** Según la validación comunicada en VPS-WEB, Docker LIVE y Coolify LIVE están **VALIDATED**; Proxmox LIVE está **VALIDATION IN PROGRESS**. La integración Proxmox está implementada y TLS fue validado, pero la autenticación y el inventario real aún no están confirmados. Esta versión incluye cambios locales pendientes de publicación y no constituye una certificación de producción.

El grafo de Operations Center mezcla fuentes reales y simuladas; KPI generales, historial e incidentes simulados no deben confundirse con telemetría real. La API no implementa autenticación propia y requiere protección externa.

## Visión

NEXUS PRIME representa componentes tecnológicos y sus relaciones en un Digital Twin interactivo. El objetivo es pasar de una lista de estados independientes a una vista operacional que permita responder:

- ¿Qué servicios están degradados o impactados por una dependencia?
- ¿Qué nodos podrían verse afectados por la caída de un componente?
- ¿Cómo evolucionan la salud y los eventos del entorno?

La aplicación presenta un Service Map, indicadores globales, un Inspector y una Mission Console. Las integraciones actuales son una base para incorporar fuentes reales, no una plataforma de observabilidad completa.

## Objetivos

- **Descubrimiento automático:** incorporar nodos y relaciones desde fuentes compatibles.
- **Análisis de dependencias:** representar hosting y dependencias entre componentes.
- **Impact Propagation:** identificar componentes impactados por fallos aguas arriba.
- **Root Cause Analysis:** explorar causas y alcance de impacto a partir del grafo.
- **Monitoring Platform:** consolidar indicadores y eventos en una vista operacional.
- **Future Operational Intelligence:** evolucionar hacia análisis con fuentes reales y contexto histórico.

Estos objetivos se encuentran en distintas etapas: Operations Center combina simulación con descubrimiento Docker, Coolify y Proxmox.

## Componentes

| Componente | Responsabilidad actual |
|---|---|
| NEXUS CORE | Nodo central del mapa y representación visual de la salud global. |
| Discovery Engine | Contrato de descubrimiento y combinación de nodos y relaciones. |
| Operational Health Engine | Estado efectivo, NEXUS HEALTH y Operational Score. |
| Service Map | Visualización del grafo, filtros, ramas e Inspector. |
| Mission Console | Flujo de eventos con procedencia LIVE o SIMULATED. |
| Timeline | Resumen temporal de eventos por categoría. |
| Docker Integration Adapter | Descubrimiento mediante HTTP normalizado o simulación. |
| Coolify Integration | Proyectos, entornos, recursos y despliegues activos. |
| Proxmox Integration | Hosts, VMs, contenedores, almacenamiento, snapshots y backups, sujeto a permisos y validación. |

## View Modes

Los modos son presentaciones alternativas del mismo `TwinGraph`, el mismo informe `HealthReport` y el mismo flujo de descubrimiento. No crean stores, integraciones ni cálculos operacionales separados.

| Modo | Presentación |
|---|---|
| NEXUS MODE | Árbol jerárquico existente con filtros y ramas expandibles. |
| OBSIDIAN MODE | Knowledge Graph distribuido en columnas por capa; conserva relaciones de hosting y destaca dependencias. |
| HOMELAB MODE | Árbol de hosting rotado para seguir el flujo físico de host a guest; oculta las aristas de dependencias para enfocar la infraestructura alojada. |
| OPERATIONS MODE | Matriz priorizada por estado efectivo, con NEXUS HEALTH, Timeline, Mission Console e Impact Propagation. |

Estos View Modes son independientes del selector de Workspaces descrito abajo.

## Workspace Engine

El selector **Workspace** del encabezado cambia la perspectiva y guarda la selección en `localStorage` (`nexus-prime-workspace`). **Operations Center** es la opción inicial y mantiene la interfaz y fuentes existentes. Las vistas visitadas permanecen montadas al cambiar de workspace para preservar su estado durante la sesión; al recargar la página o salir de la ruta principal, el estado temporal se reinicia. System Diagnostics sigue disponible desde Operations Center y en `/diagnostics`.

| Workspace | Alcance |
|---|---|
| Operations Center | Experiencia operacional existente y sus integraciones configuradas. |
| Security Command | Visualización 3D y eventos, métricas e incidentes de ejemplo; acciones deshabilitadas. |
| Digital Twin | Topología e indicadores de ejemplo, independientes del descubrimiento LIVE. |
| AI Operations | Grafo 3D conceptual, interfaz y respuestas preescritas; no hay proveedor de IA conectado. |
| Executive Overview | Indicadores ilustrativos para gestión. |
| Homelab Mission Control | Puesto de misión con una flota, almacenamiento, respaldos y salud de ejemplo. |

Las vistas de ejemplo se identifican como **SIMULATED · MOCK DATA** y no realizan consultas a proveedores. El mapa Digital Twin utiliza un trazado por fuerzas con relaciones simuladas seleccionables; Knowledge Core permite explorar relaciones ficticias. Las escenas 3D se cargan bajo demanda y utilizan alternativas estáticas con movimiento reducido o cuando WebGL no está disponible; se detienen al cambiar de workspace o al ocultar la página. El objetivo es una animación fluida, pero no se garantiza una tasa de 60 fps en todos los dispositivos. Los contratos en `src/workspaces/shared/ProviderAdapters.ts` son únicamente interfaces para integraciones futuras, no adaptadores operativos. No se han instalado ni configurado herramientas de seguridad o proveedores de IA.

## Theme Engine

La plataforma ofrece cinco identidades visuales intercambiables desde el encabezado: NEXUS, ALTAIR, OBSIDIAN, HELIX y UNAB. `ThemeProvider` guarda la selección en `localStorage` y actualiza tokens CSS semánticos sin cambiar la fuente de datos, el modo operacional ni el cálculo de layouts.

Los tokens compartidos incluyen fondo, superficie, primario, secundario, éxito, advertencia, error, glow y conexiones. El Knowledge Core del workspace AI es una visualización conceptual simulada, no una integración de inteligencia artificial.

## Arquitectura actual

```text
  Navegador / Workspace Engine
    ├── Operations Center: TwinGraph, salud, RCA, Mission Console
    └── Security, Digital Twin, AI, Executive, Homelab: vistas simuladas
                    │ /api, mismo origen
                    ▼
             Nginx → Express API
                       ├── Docker CLI → Socket Proxy → Docker Engine
                       ├── Coolify API
                       └── Proxmox API (HTTPS con CA confiable)

  Simulación + descubrimiento → mergeDiscovery → TwinGraph
                               → salud, impacto y vistas operacionales
```

`useMockOps` conserva el estado en memoria, actualiza KPI simulados y consulta Docker, Coolify y Proxmox. Docker se sondea cinco segundos después de cada consulta; Coolify y Proxmox, cada 30 segundos. `settle()` recalcula el informe de salud a partir del grafo, los KPI, los eventos y el historial de puntuación. Recargar la página reinicia ese estado.

### Stack y estructura

React, TypeScript y Vite; Tailwind CSS, Framer Motion, React Three Fiber y Drei para las experiencias visuales, `@xyflow/react` para el grafo, Lucide para iconos y React Router para la navegación. La API utiliza Node.js, Express y la CLI de Docker.

```text
src/
  app/                 Router, workspaces y diagnóstico
  data/mock.ts         Topología, KPI e historial simulados
  domain/              Grafo, análisis, salud y timeline
  features/
    topology/          Service Map, nodos, aristas e Inspector
    health/            NEXUS HEALTH y Operational Score
    console/           Mission Console
    timeline/          Resumen temporal de eventos
    dashboard/         Tarjetas KPI
  hooks/useMockOps.ts  Simulación, sondeo de integraciones y estado
  integrations/        Adaptadores Docker, Coolify y Proxmox
  workspaces/          Selector y experiencias operacionales
  pages/               Composición de la página
  types/               Tipos del dominio
server/                API Express y recopilación mediante Docker CLI
frontend/              Dockerfile y configuración Nginx del frontend
backend/               Dockerfile de runtime para la API Node
deploy/compose.yaml    Stack Coolify: web, API y Docker Socket Proxy
```

`frontend/` y `backend/` contienen los artefactos de empaquetado/despliegue; el código fuente actual permanece en `src/` y `server/` para no cambiar las rutas ni el flujo de desarrollo.

### Modelo del Digital Twin

`TwinGraph` contiene nodos, relaciones de hosting (`parentId`, `children`, `roots`), un índice `topology` y dependencias explícitas. La jerarquía declarada es:

```text
Proxmox
  |
  +-- NEXUS CORE [vps-web]
        +-- Docker
        |     +-- contenedores descubiertos
        +-- Coolify
        +-- Grafana
        +-- Uptime Kuma
        +-- PostgreSQL
        +-- SGS
        +-- Wallboard
        +-- LabScreen
              +-- ACA001, ING101, ING201, ING202, ING203, ING204

Dependencias adicionales (origen depende de destino):
  Coolify   ---> Docker
  SGS       ---> PostgreSQL
  Wallboard ---> PostgreSQL
```

Las relaciones de hosting y de dependencia tienen semánticas distintas. La visualización permite filtrar capas, expandir o colapsar ramas y seleccionar nodos. Una capa filtrada se contrae en la vista, conectando sus descendientes visibles con el ancestro visible más cercano; no elimina datos del grafo.

## NEXUS CORE

NEXUS CORE es el nodo central visual, con identificador interno `vps-web` y host Proxmox. Sus anillos y pulsos representan el núcleo del mapa. Su color y etiqueta reflejan el nivel global de NEXUS HEALTH; no implican que exista telemetría real del VPS. Es un nodo fijado al filtrar capas, pero respeta el filtro de origen.

## Discovery Engine

### Topology sources and duplicate investigation

Operations Center starts from a simulated seed, then merges Docker, Coolify and Proxmox discovery by node ID. It is intentionally a mixed graph: simulated seed nodes remain unless a discovery source explicitly updates the same ID. Docker can also fall back to simulated containers. The separate Digital Twin workspace uses its own mock topology and is not the LIVE Operations Center graph.

The previous Proxmox adapter generated both a synthetic `proxmox` root and `proxmox-node/proxmox` for the real node. The seed already had `proxmox`, so a LIVE response for node `proxmox` produced two Proxmox-labelled entries, not evidence of two hosts. The adapter now maps that explicitly known host to `proxmox`, replacing the seed with its LIVE reading, and keeps other actual hosts as separate roots. VM 200 is mapped to `vps-web` only when reported on `proxmox`.

Proxmox storage resources are represented as separate nodes with IDs `proxmox-storage/<node>/<storage>`. Therefore `local` and `local-lan` can appear when returned as storage names by the Proxmox API; they are not generated by the seed or a second Proxmox host. Their exact origin in a particular deployment must be checked against its discovery response and node category; the repository alone cannot prove the contents of production. Do not remove storage solely because its label resembles another resource.

Proxmox identity is derived from the normalized resource ID and verified against type, node, VMID and storage name. Identical repeated records collapse; conflicting records for the same identity fail discovery rather than arbitrarily selecting one. Duplicate labels alone are not sufficient evidence for deduplication: separate hosts, storage pools, and resources from different providers can legitimately share a name. Graph roots, children and dependencies use stable ID ordering; equal inputs produce the same structural layout order, but different LIVE inventories, simulated telemetry, health states, filtering or view modes can still produce different results.

In a Vite development build, open browser developer tools and expand **Topology sources (development)** to see node IDs, labels, providers, source modes, parents and categories. A warning lists duplicate labels with their IDs and providers; it does not claim that they are the same resource. The log updates only when these fields change. These logs are disabled in production builds and can contain infrastructure names, so handle screenshots and console exports accordingly. To confirm the reported production case, inspect the authorized `/api/proxmox/discovery` response and compare its `resources` IDs, types, names and nodes; do not share API tokens.

### Clasificación de fuentes

En Operations Center los nodos de integraciones muestran el estado compartido del Source Manager: `LIVE`, `PARTIAL`, `OFFLINE` o `UNKNOWN`. La salud del recurso se muestra por separado: un contenedor detenido no implica que Docker esté desconectado. El Inspector muestra también la procedencia real del recurso y si está desactualizado. Para entidades sin integración se conserva la clasificación por procedencia. Los filtros **Todo**, **Solo LIVE** y **Solo SIMULATED** seleccionan por procedencia y no modifican el cálculo global de salud.

Las identidades explícitas compartidas para Docker, Coolify, el host Proxmox conocido y VM 200 permiten que una lectura LIVE sustituya al nodo simulado del mismo ID. El resto de nodos simulados se conserva. No se suprimen entidades de otros proveedores solo por coincidir en nombre: se necesita una identidad verificable para evitar ocultar servicios o hosts distintos. Mission Console y Timeline indican la procedencia de cada evento, independientemente de que el flujo esté activo. System Diagnostics enumera fuentes LIVE, simuladas y fuentes sin integración LIVE disponible; las comprobaciones pendientes no se presentan como fallos confirmados.

[`DiscoverySource`](src/integrations/types.ts) define `discover(): Promise<DiscoveryResult>`. El resultado puede contener nodos, dependencias y IDs eliminados. [`mergeDiscovery`](src/domain/graph.ts) incorpora las novedades al grafo:

- Realiza upserts idempotentes, preserva la criticidad existente si la fuente no la proporciona y mantiene la identidad del grafo cuando no hay cambios.
- Resuelve hosts presentes en el mismo lote; rechaza hosts desconocidos, ciclos de hosting y dependencias con extremos inválidos.
- Al eliminar un nodo, elimina su subárbol alojado y las dependencias asociadas.
- Mantiene el índice `topology` en cambios no estructurales. La vista y el layout están memoizados respecto a la topología y los filtros, evitando recalcular el layout por cada cambio de estado o métricas.

Docker, Coolify y Proxmox están conectados al sondeo de `useMockOps`. Registrar otro adaptador no inicia su descubrimiento automáticamente: también debe conectarse al flujo de sondeo o de ingestión.

## Operational Health Engine

[`health.ts`](src/domain/health.ts) calcula el estado efectivo de cada nodo, NEXUS HEALTH y Operational Score. El modelo por grafo está memoizado.

### NEXUS HEALTH

Puntuación entera de 0 a 100 calculada con:

| Componente | Peso | Fuente actual |
|---|---:|---|
| Disponibilidad | 40 % | Estados efectivos ponderados por criticidad |
| Dependencias | 15 % | Estado de los destinos e impacto ponderado |
| Recursos | 20 % | KPI de CPU, RAM y disco; la penalización empieza por encima del 70 % |
| Alertas | 10 % | Eventos `warn` y `error` de los últimos 60 segundos |
| Nodos críticos | 15 % | Penalización por nodos `offline` o `critical`, según criticidad |

La disponibilidad asigna un factor de 1 a `ok`, 0,8 a `warn`, 0,5 a `impacted` y 0 a `offline` y `critical`. Los pesos de criticidad son CRITICAL 8, HIGH 4, MEDIUM 2 y LOW 1. Una caída de criticidad CRITICAL, HIGH o MEDIUM limita respectivamente el resultado a 39, 59 o 79; LOW no impone un límite adicional.

| Puntuación | Nivel |
|---:|---|
| 95–100 | OPTIMAL |
| 80–94 | HEALTHY |
| 60–79 | DEGRADED |
| 40–59 | AT RISK |
| 0–39 | CRITICAL |

Estos pesos y umbrales son heurísticas locales del prototipo, no un SLA ni una medición validada contra datos reales.

### Operational Score

Combina NEXUS HEALTH (40 %), dependencias (20 %), disponibilidad (25 %) y tendencia (15 %). La tendencia compara promedios de muestras recientes de salud; una tendencia descendente reduce su componente.

| Puntuación | Etiqueta |
|---:|---|
| 90–100 | Excellent |
| 75–89 | Good |
| 50–74 | Warning |
| 0–49 | Critical |

### Criticidad

Proxmox, NEXUS CORE y Docker son **CRITICAL**; Coolify y PostgreSQL son **HIGH**; Grafana, Uptime Kuma, SGS, Wallboard y LabScreen son **MEDIUM**; los laboratorios son **LOW**. Los nodos descubiertos sin clasificación utilizan un valor por defecto por capa: infraestructura HIGH, servicios y aplicaciones MEDIUM, laboratorios LOW.

## Impact Propagation

El motor recorre hacia arriba hosts y dependencias, de forma transitiva. Si encuentra un componente `offline` o `critical`, un nodo que no esté él mismo caído pasa al estado efectivo `impacted`; su estado reportado no se modifica. Los estados efectivos son `ok`, `warn`, `impacted`, `offline` y `critical`.

```text
PostgreSQL OFFLINE
       |
       +---- impacto ----> SGS       IMPACTED
       +---- impacto ----> Wallboard IMPACTED
```

Las dependencias declaradas de SGS y Wallboard hacia PostgreSQL son independientes entre sí: la topología inicial **no** declara una dependencia de Wallboard hacia SGS. El mapa señala el impacto con color, borde y líneas; las partículas de las aristas de dependencia afectadas viajan desde la dependencia hacia el consumidor.

## Root Cause Analysis

Al seleccionar un nodo, el Inspector muestra su estado efectivo, criticidad, ruta de hosting, dependencias, consumidores y nodos alojados. La sección **Root Cause Analysis** busca fallos aguas arriba por hosting y dependencias y presenta las rutas encontradas. Para un nodo caído muestra también su alcance de impacto: descendientes alojados y consumidores transitivos.

La detección se basa en las relaciones y estados disponibles en el grafo; no correlaciona logs ni demuestra causalidad externa. El modelo de impacto asigna una causa encontrada por nodo, mientras el Inspector puede mostrar varias causas aguas arriba.

## Laboratory Grid

La capa **Laboratory Grid** contiene `ACA001`, `ING101`, `ING201`, `ING202`, `ING203` e `ING204`, alojados bajo LabScreen. Sus estados e incidentes son simulados. Al seleccionar un laboratorio se pueden consultar su ruta y su estado en el Inspector.

Para ensayar el mapa con nodos adicionales se puede abrir `/?stress=200`, `/?stress=400` o `/?stress=600`. El parámetro añade hasta 600 nodos simulados bajo LabScreen; las ramas con más de 24 hijos empiezan colapsadas. React Flow activa el renderizado de elementos visibles por encima de 80 nodos y reduce el número de partículas en grafos grandes. Esto es un mecanismo de prueba, no una garantía de rendimiento.

## Docker Integration

En desarrollo, Diagnostics y la API operacional usan el mismo proxy `/api`. Configura `NEXUS_API_TARGET` en `.env.local` (ignorado por Git) con el origen HTTP(S) de la API del entorno elegido y reinicia Vite; sin esa variable se usa `http://127.0.0.1:3001`. La antigua variable `NEXUS_DIAGNOSTICS_API_TARGET` ya no selecciona un destino: migra su valor explícitamente si deseas que **toda** la aplicación consulte esa API. Usar un destino remoto puede consultar infraestructura real; usa HTTPS para acceso externo y protege la API. En producción, `/api` continúa usando el proxy del despliegue.

[`docker.integration.ts`](src/integrations/docker.integration.ts) implementa `Integration` y `DockerTransport`. Por defecto consulta desde el navegador:

```text
GET /api/docker/containers
Accept: application/json
```

La integración consulta `GET /api/docker/containers` y `GET /api/docker/stats` a través del mismo origen `/api` que Diagnostics. Las antiguas variables `VITE_DOCKER_API_URL` y `VITE_DOCKER_STATS_URL` solo admiten esas rutas predeterminadas; otros valores detienen el build para evitar fuentes contradictorias. El endpoint de contenedores devuelve un arreglo normalizado, no la respuesta nativa del Docker Engine:

```json
[
  {
    "id": "container-id",
    "name": "sgs-api",
    "image": "sgs/api:latest",
    "state": "running",
    "startedAt": "2026-01-01T10:00:00Z",
    "cpuPercent": 12.5,
    "memBytes": 429916160,
    "memLimitBytes": 1073741824,
    "status": "running",
    "cpu": 12.5,
    "ram": { "bytes": 429916160, "limitBytes": 1073741824, "percent": 40 },
    "uptime": 3600,
    "ports": ["127.0.0.1:3000 → 3000/tcp"],
    "networks": ["nexus"],
    "dependsOn": ["postgres"]
  }
]
```

Cada lectura incluye estado, imagen, uso de CPU y RAM, porcentaje de memoria, inicio, uptime (segundos), puertos, redes y dependencias disponibles. `/api/docker/stats` devuelve solo contenedores activos con `id`, `name`, `cpu`, `memory`, `memoryLimit` y `memoryPercent`. Las dependencias se extraen de etiquetas Compose `com.docker.compose.depends_on` y enlaces Docker heredados; Docker no ofrece una relación de dependencias genérica para contenedores sin esos metadatos.

Los estados aceptados son `running`, `restarting`, `paused`, `exited` y `dead`. Todos los contenedores encontrados se descubren bajo Docker, incluidos nombres no conocidos de antemano como `coolify-db`, `coolify-redis`, `coolify-proxy` y `coolify-sentinel`. El Inspector muestra imagen, puertos, redes, fecha de inicio, CPU, RAM y uptime.

El backend ejecuta `docker ps --all`, `docker inspect` y `docker stats --no-stream`: lista todos los contenedores y recopila CPU y memoria de los que están ejecutándose. Para los detenidos informa métricas de CPU y memoria cero. El inicio obtenido mediante `inspect` permite al adaptador calcular el uptime. Las imágenes, nombres, puertos y redes proceden de Docker; no hay una lista fija de contenedores reales. Las respuestas concurrentes de ambos endpoints comparten una misma recopilación en curso.

La petición tiene un timeout de 40 segundos; cada comando Docker tiene un límite de 12 segundos. Los IDs se inspeccionan y consultan en lotes de 100. Si la API falla o devuelve datos inválidos, el adaptador puede usar el simulador en LOCAL y STAGING y espera al menos 30 segundos antes de reintentar HTTP; el estado compartido es PARTIAL y Diagnostics indica el origen simulado. En PRODUCTION y UNKNOWN el fallback está deshabilitado.

La API devuelve HTTP 503 ante fallos de la CLI o datos incompletos; los detalles se registran en el servidor. Es de solo lectura, no acepta comandos Docker desde el cliente, no habilita CORS y configura respuestas `no-store` y encabezados de seguridad. Escucha por defecto en `127.0.0.1:3001`; para enlazar una interfaz remota se requieren `API_HOST` y `API_ALLOW_REMOTE=true`. No la expongas directamente a Internet ni expongas el socket Docker: una API remota requiere un proxy con autenticación y TLS. La cuenta que ejecuta la API necesita acceso al daemon Docker, privilegio equivalente a control elevado del host.

Docker LIVE fue validado en VPS-WEB según el resultado comunicado. Las pruebas locales mediante fixtures son independientes de esa validación y no la sustituyen en un despliegue nuevo.

## Mission Console y Timeline

Operational Status permanece en la barra superior con el estado compacto por integración y abre System Diagnostics como panel contextual; `/diagnostics` también sigue disponible. El panel concentra contadores, última sincronización y motivos. **LIVE** significa lectura real correcta; **PARTIAL**, comprobaciones incompletas, discrepancias o fallback simulado; **OFFLINE**, integración no disponible (no necesariamente servidor apagado); **UNKNOWN**, comprobación pendiente o inconclusa. El estado se comparte con Console, Timeline, topología e Inspector.

El Source Manager comparte las lecturas e inventarios entre Diagnostics, Operations Center y el resumen del Digital Twin. `VITE_NEXUS_ENVIRONMENT` selecciona `LOCAL`, `STAGING` o `PRODUCTION`: LOCAL y STAGING permiten el fallback Docker simulado; PRODUCTION y UNKNOWN no lo permiten. Si Proxmox devuelve modo simulado en PRODUCTION o UNKNOWN, se muestra UNKNOWN. LOCAL es el valor predeterminado en Vite dev; una compilación sin configurar muestra UNKNOWN. Docker y Coolify se consultan de manera LIVE primero. El entorno no prueba por sí mismo que una fuente sea LIVE.

El Data Source Consistency Check compara la lectura con el grafo operacional. Una mezcla LIVE/SIMULATED, un conteo Docker discordante, un nodo o una relación no aplicados, o un inventario incompleto producen PARTIAL con el motivo. No se generan eventos simulados para Docker, Coolify o Proxmox; las simulaciones de SGS, Wallboard, LabScreen y otras entidades siguen identificadas como simuladas. El mapa de demostración del workspace Digital Twin es simulado y oculta los equivalentes de fuentes LIVE o PARTIAL; para ver el grafo operacional utiliza Operations Center.

**Last LIVE Sync** conserva la última fecha real conocida durante la sesión: `lastDiscovery` para Docker y `checkedAt` para Coolify y Proxmox; una lectura Proxmox PARTIAL puede estar incompleta. La fecha no implica que la fuente siga LIVE; `—` significa que no hay fecha real conocida. Las fechas se muestran en la zona horaria del navegador.

Los conteos LIVE corresponden a recursos visibles y no certifican permisos ni inventario completo. La lectura Docker combina Diagnostics con el inventario operacional; si ambos no coinciden, se muestra PARTIAL. NEXUS HEALTH se basa en el grafo mixto y no implica que todas sus fuentes sean LIVE. Proxmox LIVE sigue en validación operativa.

Mission Console mantiene una vista de terminal ampliable y contraíble, con filtros por severidad. Timeline ofrece una vista cronológica independiente con hora, fuente, origen, estado (severidad), categoría y evento; permite seleccionar 5 minutos, 1 hora, 24 horas o 7 días, con histogramas por categoría. Para limitar el volumen visual presenta hasta 40 eventos recientes por categoría; los totales incluyen todos los eventos del intervalo. En Operations Mode se muestra como panel separado y los filtros de la consola no alteran ese panel.

Los eventos se guardan solo en memoria, con un máximo de 3.000; el historial inicial de siete días se genera de forma simulada. Las categorías de seguridad no representan un sistema real de auditoría o detección.

## Infrastructure Sources

| Fuente | Situación actual | Alcance y siguientes pasos |
|---|---|---|
| Docker LIVE | **VALIDATED** en VPS-WEB, según reporte | Inventario y estadísticas mediante proxy de solo lectura; fallback simulado. |
| Coolify LIVE | **VALIDATED** en VPS-WEB, según reporte | Proyectos, entornos, recursos y despliegues activos; no incluye historial completo. |
| Proxmox LIVE | **VALIDATION IN PROGRESS** | Adaptador implementado; DNS y TLS validados según reporte, autenticación e inventario pendientes de confirmación. |
| SGS, Wallboard, LabScreen | Entradas placeholder en registry | Adaptadores para estado y métricas de aplicaciones |
| Inventario, licencias, proyectos estudiantiles | Sin adaptadores ni entradas en registry | Definir contratos, identificadores y relaciones |

Las entradas placeholder responden `false` a `ping()` y no descubren nodos. Un adaptador futuro puede implementar `Integration` y `DiscoverySource`, producir `DiscoveryResult` y pasar sus resultados por `mergeDiscovery`; además necesita conectarse al mecanismo de ingestión correspondiente.

## Operational Validation

| Comprobación | Estado comunicado | Evidencia y límites |
|---|---|---|
| Docker LIVE | **VALIDATED** | Validación operativa reportada por el usuario; no verificada de nuevo desde este entorno. |
| Coolify LIVE | **VALIDATED** | Validación operativa reportada por el usuario; no verificada de nuevo desde este entorno. |
| Proxmox DNS y TLS | **VALIDATED** | `proxmox.unab.ccp` resolvió a `10.91.32.30` y la petición HTTPS devolvió HTTP 401 sin token, evidenciando conexión TLS; no demuestra autenticación. |
| Proxmox LIVE | **VALIDATION IN PROGRESS** | Pendiente verificar token, permisos y datos de `/api/proxmox/health` y `/api/proxmox/discovery`. |
| Revisión v0.7.0-alpha | **PENDIENTE** | Los cambios locales deben publicarse y verificarse en el despliegue; los resultados previos no certifican esta revisión. |

## Desarrollo local

Requisitos: Node.js compatible con Vite y el plugin React instalados (`^20.19.0` o `>=22.12.0`), npm y las dependencias del lockfile. Para datos reales se necesita la CLI de Docker, un daemon accesible y permisos para ejecutar `docker ps`, `docker inspect` y `docker stats`. El proyecto no fija actualmente `engines.node`.

```bash
npm ci
npm run dev
```

`npm run dev` inicia la API en `127.0.0.1:3001` y Vite; este hace proxy de `/api` a la API. Vite muestra la URL local al arrancar. Si Docker no está instalado o accesible, la aplicación continúa en modo simulado. Para comprobar y generar la compilación:

```bash
npm run lint
npm test
npm run build
npm run start:api
```

`build` ejecuta TypeScript y genera el frontend en `dist/` y la API en `dist-server/`. `start:api` requiere un build previo y solo inicia la API. `npm run preview` permite inspeccionar el frontend, pero no configura un proxy a la API; sirve ambos bajo un proxy externo para probar la integración completa. `API_HOST` y `API_PORT` configuran la escucha de la API; el proxy de desarrollo de Vite apunta a `127.0.0.1:3001`, por lo que cambiar ese puerto requiere ajustar también el proxy.

## Deployment en Coolify — VPS-WEB

Para el procedimiento paso a paso, configuración de servicios y checklist de aceptación, consulta la [guía de despliegue en Coolify](docs/deployment-coolify.md).

El despliegue de producción recomendado es un solo recurso **Docker Compose** en Coolify que crea tres servicios separados:

```text
Coolify HTTPS ingress
        |
        v
nexus-prime-web (Nginx :80)
        | /api/* en red web-api
        v
nexus-prime-api (Express :3001)
        | DOCKER_HOST=tcp://nexus-prime-docker-proxy:2375
        | red api-docker privada
        v
nexus-prime-docker-proxy
        | único servicio que monta el socket del host
        v
/var/run/docker.sock
```

`deploy/compose.yaml` declara web, API, proxy Docker y redes separadas. Crea una **aplicación Compose desde Git** en Coolify con **Base Directory `/deploy`** y **Docker Compose Location `/compose.yaml`**: así `context: ..` apunta a la raíz del checkout. No pegues este archivo en Docker Compose Empty esperando que Coolify clone el código. Consulta la [guía](docs/deployment-coolify.md#diagnóstico-del-error-de-rutas) para diagnosticar el error de rutas y comparar alternativas. Configura el dominio HTTPS únicamente en `nexus-prime-web`, puerto interno `80`; no publiques API ni socket proxy. Nginx sirve `dist/`, resuelve rutas SPA y reenvía `/api/` por la red privada al backend.

La ruta `/diagnostics` presenta el estado de API, Docker Proxy, Docker Engine y descubrimiento, e identifica el modo `LIVE` o `SIMULATED`. No sustituye una comprobación contra el VPS-WEB; la guía de despliegue documenta límites y criterios de aceptación.

### Build y start

| Servicio | Dockerfile | Build Command | Start Command | Puerto |
|---|---|---|---|---|
| `nexus-prime-web` | `frontend/Dockerfile` | Build de imagen; dentro ejecuta `npm ci && npm run build` y copia `dist/` a Nginx | Nginx, comando de imagen | `80` interno, publicado por Coolify con HTTPS |
| `nexus-prime-api` | `backend/Dockerfile` | Build de imagen; dentro ejecuta `npm ci && npm run build`, luego elimina dependencias de desarrollo | `node dist-server/index.js` | `3001` solo en las redes Compose |
| `nexus-prime-docker-proxy` | Imagen proxy externa | No se construye en este repositorio | Comando de la imagen | `2375` solo en `api-docker`; no publicar |

Para ejecución fuera de Coolify, desde la raíz:

```sh
docker compose -f deploy/compose.yaml up -d --build
```

Coolify usa los Dockerfiles indicados por el Compose; no configures `dist/` como Publish Directory de ese recurso. Si se despliega solo el frontend, el Publish Directory es `dist/`, pero ese modo requiere que se configure por separado un reverse proxy `/api` hacia la API.

### Variables

Define las variables en el recurso Compose de Coolify. `VITE_*` se usan como build args y requieren rebuild al cambiar. Las variables del backend son runtime:

| Variable | Servicio | Valor recomendado / propósito |
|---|---|---|
| `DOCKER_SOCKET_PROXY_IMAGE` | socket proxy | Opcional. El Compose usa por defecto `ghcr.io/tecnativa/docker-socket-proxy@sha256:1f5038b54f06c3e18422902cf00ba21803d1c97805aae032e5e6673d532d3459` (release v0.5.0). Si se sobrescribe, fijar un digest SHA-256 aprobado; no usar `latest`. |
| `DOCKER_SOCKET_PATH` | socket proxy | `/var/run/docker.sock` por defecto; ruta del socket en el host Docker de Coolify. |
| `VITE_DOCKER_API_URL` | web (build), legado | Solo se admite `/api/docker/containers`; configura el origen compartido en el proxy. |
| `VITE_DOCKER_STATS_URL` | web (build), legado | Solo se admite `/api/docker/stats`; configura el origen compartido en el proxy. |
| `VITE_NEXUS_ENVIRONMENT` | web (build) | `LOCAL`, `STAGING` o `PRODUCTION`; vacío en una compilación muestra `UNKNOWN`. Configurar explícitamente para cada entorno. |
| `COOLIFY_URL` | API | Origen de la instancia Coolify, sin `/api/v1` ni credenciales; HTTPS recomendado. |
| `COOLIFY_API_KEY` | API | Token secreto de lectura del equipo; configurar en Coolify, nunca en variables `VITE_*`. |
| `COOLIFY_ALLOW_INSECURE_HTTP` | API | `false` por defecto. `true` autoriza HTTP sin cifrado solo tras aceptar el riesgo; consultar la guía. |
| `PROXMOX_URL` | API | En VPS-WEB, `https://proxmox.unab.ccp:8006`, nombre incluido en el certificado. |
| `PROXMOX_API_TOKEN` | API | Token secreto con permisos de lectura; configurar en Coolify y no exponer en frontend. |
| `PROXMOX_MODE` | API | `live` por defecto. |
| `PROXMOX_CA_PATH` | host/Compose | Archivo CA en el host, por defecto `/etc/nexus-prime/certs/proxmox-ca.pem`; se monta en solo lectura. |
| `NODE_EXTRA_CA_CERTS` | API | Compose lo apunta al archivo CA montado; mantiene la validación TLS estricta. |
| `DOCKER_HOST` | API | `tcp://nexus-prime-docker-proxy:2375`; no apuntar la API al socket del host. |
| `API_HOST` | API | `0.0.0.0` dentro de la red privada Compose. |
| `API_PORT` | API | `3001`. |
| `API_ALLOW_REMOTE` | API | `true` solo dentro de la topología privada descrita. No publicar el puerto del backend. |

El descubrimiento Coolify usa las variables runtime del backend y funciona independientemente de Docker. Expone al dashboard solo campos seleccionados de proyectos, entornos, recursos y despliegues activos. La fuente se muestra como LIVE solo al completar el descubrimiento; los resultados anteriores quedan señalados como desactualizados si falla la sincronización. El alcance del token está limitado a su equipo. El historial de despliegues, builds y asociación con contenedores aún no están implementados. Consulta la [guía de despliegue](docs/deployment-coolify.md#integración-coolify-alcance-y-validación) para requisitos de acceso y limitaciones.

El Compose resuelve `proxmox.unab.ccp` mediante `extra_hosts` hacia `10.91.32.30` y añade la CA de Proxmox a la confianza de Node. La validación TLS permanece activa. Consulta las variables, los permisos y la validación en la [guía de despliegue](docs/deployment-coolify.md).

### Acceso seguro a Docker

La API usa la CLI Docker, pero **no monta `/var/run/docker.sock`**. Solo `nexus-prime-docker-proxy` recibe ese bind mount. El proxy se conecta al socket y la API habla con él por la red `api-docker`, marcada `internal`. El servicio web no pertenece a esa red; por tanto, no tiene ruta al proxy Docker. El socket/proxy no debe recibir una ruta de ingress o un puerto publicado.

El Compose habilita `CONTAINERS=1` para listar, inspeccionar y leer estadísticas; permite `VERSION=1` y `PING=1` para la versión y comprobación de conexión. `POST=0` limita las peticiones a GET/HEAD y los permisos de inicio, parada, reinicio y pausa están negados explícitamente. Las etiquetas Compose pueden declarar dependencias, pero NEXUS PRIME no debe inferir dependencias de aplicación si Docker no las reporta.

El socket sigue siendo una interfaz de privilegio elevado, aunque solo se monte en el proxy. Revisa y fija una versión/digest del proxy, limita sus redes y permisos al mínimo, y no agregues `privileged` salvo que el host requiera explícitamente ese ajuste por SELinux/AppArmor. La API de NEXUS PRIME no tiene autenticación propia; restringe el acceso al dashboard/API con la política de identidad/autenticación del ingress de Coolify cuando corresponda. Nunca publiques `2375`, el socket Unix ni el puerto `3001` a Internet.

### Procedimiento de despliegue y comprobación

1. Confirma en VPS-WEB que Coolify puede acceder al socket Docker del host y que la ruta corresponde al daemon que aloja los contenedores objetivo.
2. Selecciona un digest revisado de Docker Socket Proxy y define `DOCKER_SOCKET_PROXY_IMAGE` y, si es necesario, `DOCKER_SOCKET_PATH`.
3. Crea en Coolify la aplicación Compose desde Git con Base Directory `/deploy` y Docker Compose Location `/compose.yaml`; comprueba que el contexto efectivo sea la raíz del checkout. Construye web y API, descarga la imagen del proxy y levanta los tres servicios.
4. Asigna el dominio TLS solamente a `nexus-prime-web` en el puerto `80`; no publiques los otros servicios.
5. Comprueba los healthchecks y logs; consulta desde un entorno autorizado `/api/health`, `/api/diagnostics`, `GET /api/docker/containers` y `GET /api/docker/stats` por el dominio web. Verifica los datos de contenedores esperados y que Diagnostics y el dashboard indiquen fuente `LIVE`.
6. Si la API responde `503`, confirma primero conectividad API→proxy, el allowlist de `CONTAINERS`, compatibilidad de la CLI/Engine y los logs del backend. No soluciones el problema publicando el socket o el proxy.

El build y los tests locales validan código y fixtures, pero no sustituyen las pruebas operativas de cada revisión desplegada. La validación Docker LIVE reportada corresponde al entorno probado, no certifica automáticamente esta versión de trabajo.

## Roadmap

Objetivos propuestos, sujetos a cambios y sin fechas comprometidas:

| Horizonte | Alcance previsto |
|---|---|
| v0.7.0-alpha, en preparación | Publicar y validar la revisión actual; completar autenticación, permisos e inventario Proxmox LIVE. |
| Posterior, sin versión comprometida | Integraciones SGS, Wallboard y LabScreen; ampliar telemetría y cobertura de fuentes reales. |
| Largo plazo | Digital Twin operacional con persistencia, controles de acceso, auditoría y modelos validados con telemetría real. |

El camino hacia una operación real también requiere persistencia, autenticación, autorización, auditoría y validación de los modelos con telemetría real. Inventario, licencias, LabScreen y proyectos estudiantiles son candidatos para integraciones posteriores; no tienen una versión comprometida.

## Estado actual y publicación

La versión de trabajo preparada para validación es **v0.7.0-alpha**. Consulta el [changelog](CHANGELOG.md), las [notas v0.7.0-alpha](docs/release-notes/v0.7.0-alpha.md) y las [notas históricas v0.6.1-alpha](docs/release-notes/v0.6.1-alpha.md). La licencia está pendiente de decisión del propietario; la publicación en GitHub no concede por sí misma una licencia de uso.

### Release Candidate Checklist

- [x] `VERSION`, `package.json` y `package-lock.json` sincronizados en `0.7.0-alpha`.
- [x] Notas de versión y changelog preparados para `v0.7.0-alpha`.
- [ ] Ejecutar build, lint y tests sobre la revisión candidata final.
- [ ] Confirmar rama y publicar/taggear el release candidate en GitHub.
- [ ] Validar Compose e imágenes en Linux con Docker Compose.
- [ ] Ejecutar en VPS-WEB la [Deployment Validation Checklist](docs/deployment-coolify.md#deployment-validation-checklist).

### Deployment Validation Checklist

Las siguientes verificaciones corresponden a la revisión candidata, no a las validaciones previamente comunicadas:

- [ ] Coolify despliega el Compose con Base Directory `/deploy`, contexto de build en la raíz y los tres servicios quedan saludables.
- [ ] HTTPS funciona en el servicio web; API y socket proxy no tienen puertos ni dominios públicos.
- [ ] `/api/health` y `/api/diagnostics` responden correctamente desde el dominio autorizado.
- [ ] `/api/docker/containers` y `/api/docker/stats` responden HTTP 200 con datos del Docker Engine esperado.
- [ ] System Diagnostics muestra fuente `LIVE`, versión Docker, conteo de contenedores y última detección.
- [ ] Coolify LIVE muestra los recursos esperados para el equipo autorizado.
- [ ] Proxmox conserva DNS, CA y TLS estrictos; autentica el token, tiene permisos de lectura y devuelve el inventario esperado en health/discovery.
- [ ] Revisados logs, autenticación del dominio, permisos del proxy y reinicio/recuperación en VPS-WEB.

Las casillas marcadas corresponden a comprobaciones locales de release; las casillas sin marcar siguen pendientes en GitHub, Linux o VPS-WEB según corresponda. No declarar `DEPLOYMENT READY` hasta completar los checks del VPS.

Las [plantillas de issues y pull requests](.github/) y la [guía de etiquetas](docs/github-labels.md) preparan el flujo de colaboración. Las etiquetas documentadas deben crearse o verificarse en el repositorio de GitHub.

## Version History

Las etapas V1–V5 describen la evolución funcional, no etiquetas Git. Las entradas versionadas describen su alcance; la presencia de una entrada aquí no confirma su publicación ni su despliegue.

| Etapa | Cambios principales |
|---|---|
| V1 | Dashboard inicial con KPI, eventos simulados y arquitectura modular. |
| V2 | Mission Control visual, núcleo animado y nodos individuales. |
| V3 | Digital Twin jerárquico, dependencias, filtros, colapso y descubrimiento. |
| V4 | Identidad NEXUS PRIME y adaptador Docker con fallback simulado. |
| V5 | Operational Health Engine, propagación de impacto, RCA, criticidad, Timeline y Operational Score. |
| v0.6.1-alpha | Diagnóstico de sistema, API Docker LIVE, healthchecks y preparación de despliegue. |
| v0.7.0-alpha, en preparación | Workspace Engine, fuentes Docker/Coolify/Proxmox, clasificación y limpieza de topología; validación Proxmox pendiente. |
