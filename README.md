# NEXUS PRIME

**Engineering Operations Nexus**  
Digital Twin Platform para visualizar infraestructura, servicios, aplicaciones y laboratorios desde un Command Center.

> **Estado actual: versión 0.5.0, prototipo frontend.** El grafo inicial, los KPI, los incidentes y la línea de tiempo son simulados. Docker puede consumir un endpoint HTTP normalizado, pero utiliza datos simulados cuando no está disponible. No existe backend, persistencia, autenticación ni conexión directa al socket Docker en este repositorio. Los indicadores no sustituyen herramientas de monitorización de producción.

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

## Arquitectura actual

```text
  Datos iniciales y simulación                 Docker Integration
  src/data/mock.ts + useMockOps                HTTP o simulador
             |                                      |
             |                               discover() cada 5 s
             |                                      |
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

`useMockOps` conserva el estado en memoria, actualiza KPI simulados cada 2 segundos, genera eventos e incidentes y consulta el adaptador Docker. `settle()` recalcula el informe de salud a partir del grafo, los KPI, los eventos y el historial de puntuación. Recargar la página reinicia ese estado.

### Stack y estructura

React, TypeScript y Vite; Tailwind CSS para estilos, Framer Motion para animaciones, `@xyflow/react` para el grafo, Lucide para iconos y React Router para la navegación.

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
```

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

La URL puede configurarse con `VITE_DOCKER_API_URL` **en tiempo de build**. La respuesta esperada es un arreglo JSON con este contrato normalizado; no es la respuesta nativa del Docker Engine:

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
    "dependsOn": ["postgres"]
  }
]
```

Los estados aceptados son `running`, `restarting`, `paused`, `exited` y `dead`. El adaptador deriva el uptime y el porcentaje de memoria, convierte los contenedores en nodos de la capa de servicios bajo Docker y publica dependencias y eliminaciones. El Inspector muestra CPU, RAM y uptime de los nodos con métricas.

La petición tiene un timeout de 1,5 segundos; si falla, el adaptador usa el simulador e intenta nuevamente la fuente HTTP después de 30 segundos. `source` identifica la última fuente como `live` o `simulated`. El registro de nuevos contenedores indica `live` o `sim`; no existe un indicador persistente de procedencia en el dashboard. Un 404 del endpoint por defecto es esperable si no se ha configurado un servicio.

El proyecto **no incluye** ese endpoint ni autenticación. Para datos reales hace falta un servicio o proxy que produzca el contrato, controles de acceso y una configuración de red apropiada (incluido CORS si corresponde). No expongas el socket de Docker ni credenciales al navegador.

## Mission Console y Timeline

La consola presenta eventos `info`, `success`, `warn` y `error`, con filtros por severidad. La pestaña Timeline muestra rangos de 5 minutos, 1 hora, 24 horas y 7 días, agrupados en infraestructura, aplicaciones, laboratorios y seguridad. Incluye histogramas y eventos recientes.

Los eventos se guardan solo en memoria, con un máximo de 3.000; el historial inicial de siete días se genera de forma simulada. Las categorías de seguridad no representan un sistema real de auditoría o detección.

## Future Integrations

| Fuente | Situación actual | Trabajo futuro |
|---|---|---|
| Docker | Adaptador HTTP normalizado y fallback simulado | Servicio seguro con datos reales y autenticación |
| Proxmox | Entrada placeholder en registry | Adaptador para hosts y máquinas virtuales |
| Coolify | Entrada placeholder en registry | Adaptador para despliegues y recursos |
| SGS, Wallboard, LabScreen | Entradas placeholder en registry | Adaptadores para estado y métricas de aplicaciones |
| Inventario, licencias, proyectos estudiantiles | Sin adaptadores ni entradas en registry | Definir contratos, identificadores y relaciones |

Las entradas placeholder responden `false` a `ping()` y no descubren nodos. Un adaptador futuro puede implementar `Integration` y `DiscoverySource`, producir `DiscoveryResult` y pasar sus resultados por `mergeDiscovery`; además necesita conectarse al mecanismo de ingestión correspondiente.

## Desarrollo local

Requisitos: Node.js compatible con Vite y el plugin React instalados (`^20.19.0` o `>=22.12.0`), npm y las dependencias del lockfile. El proyecto no fija actualmente `engines.node`.

```bash
npm ci
npm run dev
```

Vite muestra la URL local al arrancar. Para comprobar y generar la compilación:

```bash
npm run lint
npm run build
npm run preview
```

`build` ejecuta TypeScript y genera archivos estáticos en `dist/`; `preview` sirve esa compilación para inspección local, no es un servidor de producción.

## Deployment through Coolify

El repositorio contiene código fuente Vite, no un Dockerfile ni un servidor de producción. Una opción es desplegar la salida estática con el build pack **Nixpacks** de Coolify:

1. Conecta el repositorio Git y crea una aplicación con la raíz del proyecto como directorio base.
2. Selecciona **Nixpacks** y el tipo de sitio **SPA** (o la opción equivalente para sitio estático según la versión de Coolify).
3. Configura la instalación con `npm ci`, el build con `npm run build` y el directorio de publicación `dist`. Fija una versión de Node compatible con los requisitos anteriores.
4. Si existe un endpoint Docker, configura `VITE_DOCKER_API_URL` como variable disponible **durante el build**, y vuelve a desplegar cuando cambie. Si usas `/api/docker/containers`, configura por separado un proxy hacia el servicio; el sitio estático no implementa esa ruta.
5. Configura dominio y HTTPS en Coolify. Asegura que las rutas de la SPA vuelvan a `index.html`; si la configuración predeterminada no lo hace, ajusta la configuración de Nginx en Coolify y reconstruye la imagen.
6. Despliega y comprueba la página, los assets, una ruta del cliente y, si procede, el endpoint Docker. Sin endpoint, el adaptador utiliza su simulador.

Los nombres de las opciones pueden variar entre versiones. Consulta la [documentación oficial de Nixpacks en Coolify](https://coolify.io/docs/applications/builds/nixpacks/overview). Esta guía describe una configuración posible; el repositorio no incluye una configuración de despliegue validada ni gestiona secretos, proxy o autenticación.

## Roadmap

Objetivos propuestos, sujetos a cambios y sin fechas comprometidas:

| Versión objetivo | Alcance previsto |
|---|---|
| v0.6.0 | Docker Real Integration: fuente segura de datos reales para el adaptador existente. |
| v0.7.0 | Coolify Integration. |
| v0.8.0 | Proxmox Integration. |
| v0.9.0 | SGS & Wallboard Integration. |
| v1.0.0 | Operational Digital Twin con fuentes reales y capacidades operacionales. |

El camino hacia una operación real también requiere persistencia, autenticación, autorización, auditoría y validación de los modelos con telemetría real. Inventario, licencias, LabScreen y proyectos estudiantiles son candidatos para integraciones posteriores; no tienen una versión comprometida.

## Estado actual y publicación

La versión preparada es **0.5.0**. Consulta el [changelog](CHANGELOG.md) y las [notas de versión](docs/release-notes/v0.5.0.md). La licencia está pendiente de decisión del propietario; la publicación en GitHub no concede por sí misma una licencia de uso.

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
