# NEXUS PRIME

**Engineering Operations Nexus**  
Digital Twin Platform para visualizar infraestructura, servicios, aplicaciones y laboratorios desde un Command Center.

> **Release candidate actual: v0.6.1-alpha.** Build, lint y pruebas locales pasan; el despliegue y Docker LIVE todavía requieren validación en VPS-WEB. La API Express consulta Docker mediante una CLI conectada a un Docker Socket Proxy con permisos de solo lectura; si la API no está disponible, el adaptador usa datos simulados. El grafo inicial, los KPI generales, los incidentes y la línea de tiempo siguen siendo simulados. La API no implementa autenticación propia. Los indicadores no sustituyen herramientas de monitorización de producción.

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

Estos objetivos se encuentran en distintas etapas: la implementación actual combina simulación con un adaptador Docker preparado para un endpoint externo.

## Componentes

| Componente | Responsabilidad actual |
|---|---|
| NEXUS CORE | Nodo central del mapa y representación visual de la salud global. |
| Discovery Engine | Contrato de descubrimiento y combinación de nodos y relaciones. |
| Operational Health Engine | Estado efectivo, NEXUS HEALTH y Operational Score. |
| Service Map | Visualización del grafo, filtros, ramas e Inspector. |
| Mission Console | Flujo y filtros de eventos simulados. |
| Timeline | Resumen temporal de eventos por categoría. |
| Docker Integration Adapter | Descubrimiento mediante HTTP normalizado o simulación. |

## View Modes

Los modos son presentaciones alternativas del mismo `TwinGraph`, el mismo informe `HealthReport` y el mismo flujo de descubrimiento. No crean stores, integraciones ni cálculos operacionales separados.

| Modo | Presentación |
|---|---|
| NEXUS MODE | Árbol jerárquico existente con filtros y ramas expandibles. |
| OBSIDIAN MODE | Knowledge Graph distribuido en columnas por capa; conserva relaciones de hosting y destaca dependencias. |
| HOMELAB MODE | Árbol de hosting rotado para seguir el flujo físico de host a guest; oculta las aristas de dependencias para enfocar la infraestructura alojada. |
| OPERATIONS MODE | Matriz priorizada por estado efectivo, con NEXUS HEALTH, Timeline, Mission Console e Impact Propagation. |

AI Operations, Security Operations e Infrastructure Operations quedan como modos futuros deshabilitados, no como vistas funcionales.

## Theme Engine

El dashboard ofrece cinco identidades visuales intercambiables desde el encabezado: NEXUS, ALTAIR, OBSIDIAN, HELIX y UNAB. `ThemeProvider` guarda la selección en `localStorage` y actualiza tokens CSS semánticos sin cambiar la fuente de datos, el modo operacional ni el cálculo de layouts.

Los tokens compartidos incluyen fondo, superficie, primario, secundario, éxito, advertencia, error, glow y conexiones. Los metadatos de contexto del Inspector son opcionales para mantener compatibilidad con entidades existentes. `KnowledgeEntity` y `KnowledgeRelation` definen contratos desacoplados para una futura vista de Knowledge Graph; esa vista aún no está implementada.

## Arquitectura actual

```text
  Datos iniciales y simulación                 Docker Integration
  src/data/mock.ts + useMockOps                HTTP o simulador
             |                                      |
             |                          discover() + espera de 5 s
             |                                      |
             |                  Express API <-- Docker CLI (host)
             |                         |
             |                    HTTP normalizado
             |                         |
             +------------------+-------------------+
                                v
                     mergeDiscovery / TwinGraph
                     nodos + hosts + dependencias
                                |
              +-----------------+-----------------+
              v                 v                 v
        análisis de impacto   assess()       eventos en memoria
        y causas raíz         salud y score        |
              |                 |                  v
              +--------+--------+          Mission Console
                       v                   y Timeline
                Dashboard React
          KPI + HealthStrip + Service Map
                       |
              selección de nodo
                       v
                   Inspector
```

`useMockOps` conserva el estado en memoria, actualiza KPI simulados cada 2 segundos, genera eventos e incidentes y consulta el adaptador Docker. El sondeo se programa cinco segundos después de completar cada consulta. `settle()` recalcula el informe de salud a partir del grafo, los KPI, los eventos y el historial de puntuación. Recargar la página reinicia ese estado.

### Stack y estructura

React, TypeScript y Vite; Tailwind CSS para estilos, Framer Motion para animaciones, `@xyflow/react` para el grafo, Lucide para iconos y React Router para la navegación. La API utiliza Node.js, Express y la CLI de Docker.

```text
src/
  app/                 Router: dashboard y página 404
  data/mock.ts         Topología, KPI e historial simulados
  domain/              Grafo, análisis, salud y timeline
  features/
    topology/          Service Map, nodos, aristas e Inspector
    health/            NEXUS HEALTH y Operational Score
    console/           Mission Console
    timeline/          Resumen temporal de eventos
    dashboard/         Tarjetas KPI
  hooks/useMockOps.ts  Simulación, sondeo Docker y estado
  integrations/        Contratos, registry y adaptador Docker
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

NEXUS CORE es el nodo central visual, con identificador interno `vps-web` y host Proxmox. Sus anillos y pulsos representan el núcleo del mapa. Su color y etiqueta reflejan el nivel global de NEXUS HEALTH; no implican que exista telemetría real del VPS. Es un nodo fijado en la vista incluso al filtrar capas.

## Discovery Engine

[`DiscoverySource`](src/integrations/types.ts) define `discover(): Promise<DiscoveryResult>`. El resultado puede contener nodos, dependencias y IDs eliminados. [`mergeDiscovery`](src/domain/graph.ts) incorpora las novedades al grafo:

- Realiza upserts idempotentes, preserva la criticidad existente si la fuente no la proporciona y mantiene la identidad del grafo cuando no hay cambios.
- Resuelve hosts presentes en el mismo lote; rechaza hosts desconocidos, ciclos de hosting y dependencias con extremos inválidos.
- Al eliminar un nodo, elimina su subárbol alojado y las dependencias asociadas.
- Mantiene el índice `topology` en cambios no estructurales. La vista y el layout están memoizados respecto a la topología y los filtros, evitando recalcular el layout por cada cambio de estado o métricas.

El contrato admite otras fuentes, pero **solo Docker está conectado al sondeo de `useMockOps`**. Registrar un adaptador adicional no inicia su descubrimiento automáticamente: también debe conectarse al flujo de sondeo o de ingestión.

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

[`docker.integration.ts`](src/integrations/docker.integration.ts) implementa `Integration` y `DockerTransport`. Por defecto consulta desde el navegador:

```text
GET /api/docker/containers
Accept: application/json
```

La integración consulta `GET /api/docker/containers` y `GET /api/docker/stats`. `VITE_DOCKER_API_URL` y `VITE_DOCKER_STATS_URL` permiten configurar ambas URLs **en tiempo de build**; por defecto se usan las rutas anteriores. El endpoint de contenedores devuelve un arreglo normalizado, no la respuesta nativa del Docker Engine:

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

La petición tiene un timeout de 40 segundos; cada comando Docker tiene un límite de 12 segundos. Los IDs se inspeccionan y consultan en lotes de 100. Si la API falla o devuelve datos inválidos, el adaptador usa el simulador y espera al menos 30 segundos antes de reintentar HTTP. La barra del mapa indica **Docker: LIVE** o **SIMULATED**, además de `CHECKING` durante la primera consulta y `UNAVAILABLE` si también falla la simulación. El indicador se refiere exclusivamente a Docker, no a los KPI y eventos generales.

La API devuelve HTTP 503 ante fallos de la CLI o datos incompletos; los detalles se registran en el servidor. Es de solo lectura, no acepta comandos Docker desde el cliente, no habilita CORS y configura respuestas `no-store` y encabezados de seguridad. Escucha por defecto en `127.0.0.1:3001`; para enlazar una interfaz remota se requieren `API_HOST` y `API_ALLOW_REMOTE=true`. No la expongas directamente a Internet ni expongas el socket Docker: una API remota requiere un proxy con autenticación y TLS. La cuenta que ejecuta la API necesita acceso al daemon Docker, privilegio equivalente a control elevado del host.

La respuesta Docker real no ha podido validarse contra un daemon en el entorno de desarrollo actual porque la CLI Docker no está instalada; las pruebas cubren la normalización mediante fixtures. Antes de declarar el despliegue operativo, ejecutar el backend en VPS-WEB y comprobar `/api/docker/containers`, `/api/docker/stats` y el indicador `LIVE` desde el dashboard.

## Mission Console y Timeline

La consola presenta eventos `info`, `success`, `warn` y `error`, con filtros por severidad. La pestaña Timeline muestra rangos de 5 minutos, 1 hora, 24 horas y 7 días, agrupados en infraestructura, aplicaciones, laboratorios y seguridad. Incluye histogramas y eventos recientes.

Los eventos se guardan solo en memoria, con un máximo de 3.000; el historial inicial de siete días se genera de forma simulada. Las categorías de seguridad no representan un sistema real de auditoría o detección.

## Future Integrations

| Fuente | Situación actual | Trabajo futuro |
|---|---|---|
| Docker | Backend CLI, endpoints de contenedores/estadísticas, adaptador HTTP y fallback simulado | Validación en un Docker Engine real y despliegue detrás de un proxy autenticado |
| Proxmox | Entrada placeholder en registry | Adaptador para hosts y máquinas virtuales |
| Coolify | Entrada placeholder en registry | Adaptador para despliegues y recursos |
| SGS, Wallboard, LabScreen | Entradas placeholder en registry | Adaptadores para estado y métricas de aplicaciones |
| Inventario, licencias, proyectos estudiantiles | Sin adaptadores ni entradas en registry | Definir contratos, identificadores y relaciones |

Las entradas placeholder responden `false` a `ping()` y no descubren nodos. Un adaptador futuro puede implementar `Integration` y `DiscoverySource`, producir `DiscoveryResult` y pasar sus resultados por `mergeDiscovery`; además necesita conectarse al mecanismo de ingestión correspondiente.

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
| `VITE_DOCKER_API_URL` | web (build) | `/api/docker/containers` por defecto, mismo origen HTTPS. |
| `VITE_DOCKER_STATS_URL` | web (build) | `/api/docker/stats` por defecto, mismo origen HTTPS. |
| `DOCKER_HOST` | API | `tcp://nexus-prime-docker-proxy:2375`; no apuntar la API al socket del host. |
| `API_HOST` | API | `0.0.0.0` dentro de la red privada Compose. |
| `API_PORT` | API | `3001`. |
| `API_ALLOW_REMOTE` | API | `true` solo dentro de la topología privada descrita. No publicar el puerto del backend. |

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

El build y los tests locales validan el código y fixtures, pero no sustituyen la prueba contra el Docker Engine real de VPS-WEB. Hasta completar esa comprobación, el despliegue LIVE debe considerarse pendiente de aceptación operativa.

## Roadmap

Objetivos propuestos, sujetos a cambios y sin fechas comprometidas:

| Versión objetivo | Alcance previsto |
|---|---|
| v0.6.0 | Docker LIVE: endpoints de contenedores y estadísticas, descubrimiento dinámico y metadatos de runtime; despliegue Compose y proxy de socket preparados, pendiente de validación en VPS-WEB. |
| v0.6.1-alpha | Release candidate con System Diagnostics, healthchecks y checklist de despliegue; lista para validación operativa, aún no certificada para producción. |
| v0.7.0 | Coolify Integration. |
| v0.8.0 | Proxmox Integration. |
| v0.9.0 | SGS & Wallboard Integration. |
| v1.0.0 | Operational Digital Twin con fuentes reales y capacidades operacionales. |

El camino hacia una operación real también requiere persistencia, autenticación, autorización, auditoría y validación de los modelos con telemetría real. Inventario, licencias, LabScreen y proyectos estudiantiles son candidatos para integraciones posteriores; no tienen una versión comprometida.

## Estado actual y publicación

La versión preparada para validación es **v0.6.1-alpha**. `VERSION`, `package.json` y `package-lock.json` deben coincidir; consulta el [changelog](CHANGELOG.md), las [notas v0.5.0](docs/release-notes/v0.5.0.md) y las [notas v0.6.1-alpha](docs/release-notes/v0.6.1-alpha.md). La licencia está pendiente de decisión del propietario; la publicación en GitHub no concede por sí misma una licencia de uso.

### Release Candidate Checklist

- [x] `VERSION`, `package.json` y `package-lock.json` sincronizados en `0.6.1-alpha`.
- [x] `npm run build`, `npm run lint` y `npm test` pasan localmente.
- [x] Notas de versión y changelog preparados para `v0.6.1-alpha`.
- [ ] Confirmar rama y publicar/taggear el release candidate en GitHub.
- [ ] Validar Compose e imágenes en Linux con Docker Compose.
- [ ] Ejecutar en VPS-WEB la [Deployment Validation Checklist](docs/deployment-coolify.md#deployment-validation-checklist).

### Deployment Validation Checklist

- [ ] Coolify despliega el Compose con Base Directory `/deploy`, contexto de build en la raíz y los tres servicios quedan saludables.
- [ ] HTTPS funciona en el servicio web; API y socket proxy no tienen puertos ni dominios públicos.
- [ ] `/api/health` y `/api/diagnostics` responden correctamente desde el dominio autorizado.
- [ ] `/api/docker/containers` y `/api/docker/stats` responden HTTP 200 con datos del Docker Engine esperado.
- [ ] System Diagnostics muestra fuente `LIVE`, versión Docker, conteo de contenedores y última detección.
- [ ] Revisados logs, autenticación del dominio, permisos del proxy y reinicio/recuperación en VPS-WEB.

Las casillas marcadas corresponden a comprobaciones locales de release; las casillas sin marcar siguen pendientes en GitHub, Linux o VPS-WEB según corresponda. No declarar `DEPLOYMENT READY` hasta completar los checks del VPS.

Las [plantillas de issues y pull requests](.github/) y la [guía de etiquetas](docs/github-labels.md) preparan el flujo de colaboración. Las etiquetas documentadas deben crearse o verificarse en el repositorio de GitHub.

## Version History

Las siguientes etapas describen la evolución funcional del proyecto; no son versiones publicadas ni etiquetas Git verificadas.

| Etapa | Cambios principales |
|---|---|
| V1 | Dashboard inicial con KPI, eventos simulados y arquitectura modular. |
| V2 | Mission Control visual, núcleo animado y nodos individuales. |
| V3 | Digital Twin jerárquico, dependencias, filtros, colapso y descubrimiento. |
| V4 | Identidad NEXUS PRIME y adaptador Docker con fallback simulado. |
| V5 | Operational Health Engine, propagación de impacto, RCA, criticidad, Timeline y Operational Score. |
