# Guía de despliegue de NEXUS PRIME en Coolify

- **Referencia de versión:** v0.6.1-alpha
- **Recurso recomendado:** una aplicación Docker Compose
- **Archivo:** [`deploy/compose.yaml`](../deploy/compose.yaml)

> **Estado de certificación:** la configuración del repositorio pasa las comprobaciones locales de build, lint y tests, pero el checkout no tiene Docker CLI/daemon ni acceso al VPS-WEB o Coolify. Por lo tanto, no se puede certificar aún el despliegue LIVE ni declarar el entorno de producción `DEPLOYMENT READY`.

## Arquitectura

El Compose define tres servicios y dos redes. En Coolify se crea **un recurso Docker Compose conectado al repositorio**, no dos recursos de aplicación independientes. `nexus-prime-web` y `nexus-prime-api` son servicios del mismo recurso. Separarlos en recursos Coolify exigiría cambiar la resolución DNS de Nginx y configurar manualmente redes compartidas; no corresponde al Compose actual.

```text
Navegador
   │ HTTPS
   ▼
Ingress de Coolify
   │ puerto interno 80
   ▼
nexus-prime-web (Nginx)
   │ /api/* → nexus-prime-api:3001, red web-api
   ▼
nexus-prime-api (Express + Docker CLI)
   │ DOCKER_HOST=tcp://nexus-prime-docker-proxy:2375
   │ red api-docker (interna)
   ▼
nexus-prime-docker-proxy
   │ único servicio con el bind mount del socket
   ▼
Docker Engine del host
```

La red `web-api` permite que Nginx alcance la API. La API también pertenece a `api-docker`, marcada `internal: true`, pero el frontend y el proxy Docker no comparten una red. El socket no se monta en la API ni en el frontend.

## Diagnóstico del error de rutas

`resolve: lstat /data/coolify/services/backend: no such file or directory` indica que el constructor intentó acceder a un directorio `backend` bajo `/data/coolify/services` que no existe en el contexto utilizado. **No demuestra por sí solo** qué tipo de recurso se creó ni cuál fue la configuración efectiva: revisa el tipo de recurso, la definición y los logs de build. Es compatible con haber pegado el Compose en **Docker Compose Empty**, que no clona el repositorio, o con una configuración incorrecta del directorio base de una aplicación Git.

El Compose está en `deploy/compose.yaml`. Sus dos instrucciones `context: ..` necesitan que el directorio base de Compose sea `deploy`; el contexto resultante es la raíz del checkout. Dentro de ese contexto Docker busca `frontend/Dockerfile` y `backend/Dockerfile`. Los Dockerfiles, a su vez, copian desde la raíz `package.json`, `package-lock.json` y el resto de fuentes. Cambiar simplemente el contexto a `./frontend` o `./backend` no funciona, porque esos directorios no contienen todos los archivos de build.

Con Docker Compose ejecutado directamente, los contextos relativos se resuelven desde el directorio del archivo Compose, salvo que se indique otro project directory. En una aplicación Git, la documentación de Coolify indica que el directorio base actúa como project directory. Por eso, para este archivo concreto configura **Base Directory `/deploy`** y **Docker Compose Location `/compose.yaml`**, no Base Directory `/` con `context: ..`. El archivo Compose no necesita cambiar sus rutas: esas rutas son correctas cuando se conserva este directorio base.

```text
raíz-del-checkout/
├── package.json
├── package-lock.json
├── src/
├── server/
├── frontend/
│   ├── Dockerfile
│   └── nginx.conf
├── backend/
│   └── Dockerfile
└── deploy/
    └── compose.yaml    ← Base Directory /deploy; context .. → raíz-del-checkout
```

### Opciones de despliegue

| Opción | Uso de este repositorio | Decisión |
|---|---|---|
| A. Aplicación Docker Compose desde Git | Coolify obtiene el checkout y usa `/deploy` como Base Directory y `/compose.yaml` como Compose Location. | **Recomendada:** mantiene código y Compose versionados y construye ambos Dockerfiles desde la raíz del checkout. |
| B. Docker Compose Empty / embebido | Pegar el YAML no aporta `frontend/`, `backend/`, `src/` ni los manifiestos. Las rutas relativas apuntan al directorio del recurso en el servidor, no al checkout Git. | El YAML actual **no es autónomo** en este modo. Para usarlo, construye y publica previamente las imágenes web/API en un registry y reemplaza `build` por referencias `image` fijadas por digest en el Compose embebido; configura las credenciales de lectura necesarias. Esto requiere un flujo de publicación de imágenes aparte. |
| C. Aplicaciones separadas | Cada aplicación debe obtener el checkout completo y construir desde su raíz con su respectivo Dockerfile. | No es equivalente a este Compose: deben establecerse redes compartidas y DNS/alias estables para `nexus-prime-api` y `nexus-prime-docker-proxy`, incluida la red interna del proxy, sin exponer API ni proxy. No es la opción recomendada sin diseñar y validar esa configuración. |

El YAML corregido para la opción A es el [Compose completo del repositorio](../deploy/compose.yaml), con comentarios que indican los valores de Coolify. No se han modificado los servicios, las redes ni la funcionalidad; el cambio imprescindible para el error es seleccionar el **tipo de recurso y Base Directory correctos**, no reescribir `context: ..`.

> **Git y cambios locales:** Coolify solo puede desplegar archivos presentes en la revisión remota seleccionada. En la copia local analizada, el tag `v0.6.1-alpha` apunta a `c6fba36` y contiene una versión anterior del Compose: exige `DOCKER_SOCKET_PROXY_IMAGE` y no incluye los healthchecks/diagnóstico actuales. Las modificaciones locales todavía no están comprometidas. Antes de desplegar esta configuración, inclúyelas en una revisión aprobada, publícala en Git y selecciónala en Coolify; no asumas que el tag existente contiene el árbol de trabajo. No se ha modificado el tag.

## 1. Crear el recurso y el servicio frontend

1. Confirma la revisión Git que contiene el Compose y los Dockerfiles deseados y publícala en el remoto; si el repositorio es privado, configura una Git App o deploy key con acceso de lectura.
2. En Coolify, abre el proyecto y entorno de VPS-WEB y selecciona **+ New** → repositorio Git (público o autenticado). No selecciones **Docker Compose Empty**.
3. Selecciona el repositorio `BARS20-01/centro-operaciones` y la rama o revisión publicada que contiene los cambios; para un repositorio público, usa **Check Repository**. Selecciona **Compose / Docker Compose** como estrategia de build.
4. En **General > Build pipeline**, establece **Base Directory** en `/deploy` y **Docker Compose Location** en `/compose.yaml`. Coolify combina estos valores para localizar `deploy/compose.yaml` y usa `/deploy` como directorio base de Compose; `context: ..` debe resultar en la raíz del checkout.
5. Guarda y recarga el Compose desde Git. En **Docker Compose Content**, confirma `context: ..`, `dockerfile: frontend/Dockerfile` y `dockerfile: backend/Dockerfile`, así como los tres servicios. Si no aparecen, verifica rama, commit y ruta antes de desplegar.
6. Configura las variables opcionales de la sección 4. En **Domains**, añade HTTPS solo para `nexus-prime-web`, con puerto interno `80`, por ejemplo `https://nexus.example.com:80` según la sintaxis de Coolify; el usuario accede por HTTPS normal, no necesita puerto 80 público.
7. No asignes dominio ni puerto publicado a la API o al proxy. Protege el dominio web con autenticación/autorización en el ingress o una capa externa; la aplicación no la implementa.
8. Selecciona **Deploy** y revisa **Deployment Logs**. Confirma que el contexto de build sea la raíz del checkout, no `/data/coolify/services`; después revisa **Runtime Logs**, healthchecks y la checklist. No uses `dist/` como Publish Directory: Nginx ya sirve el build.

Si existe un recurso **Docker Compose Empty** fallido, crea la aplicación Git como recurso distinto; pegar el mismo YAML allí no arregla el problema. No elimines el recurso anterior hasta verificar qué datos o configuración contiene y confirmar su retirada.

### Comprobación opcional en un checkout Git del VPS

Desde la raíz de un checkout de la **misma revisión** y con Docker Compose instalado:

```sh
git rev-parse HEAD
test -f deploy/compose.yaml && test -f frontend/Dockerfile && test -f backend/Dockerfile && test -f package.json && test -f package-lock.json
docker compose --project-directory deploy -f deploy/compose.yaml config
```

Inspecciona la configuración resuelta: `build.context` de ambos servicios debe apuntar a la raíz de ese checkout. Este comando valida la resolución en ese checkout, no demuestra que Coolify haya desplegado la misma revisión ni valida el funcionamiento del Engine.

El servicio web usa `frontend/Dockerfile` y ejecuta Nginx en el contenedor. Nginx resuelve las rutas SPA y reenvía `/api/` a `http://nexus-prime-api:3001`.

## 2. Servicio API

El servicio API se configura como parte del mismo Compose, no como una segunda aplicación Coolify:

- **Servicio:** `nexus-prime-api`
- **Dockerfile:** `backend/Dockerfile`
- **Puerto interno:** `3001` (solo dentro de las redes Compose)
- **Redes:** `web-api` y `api-docker`
- **Inicio:** el `CMD` del Dockerfile, `node dist-server/index.js`
- **Exposición pública:** ninguna

El nombre `nexus-prime-api` debe mantenerse: Nginx lo utiliza como nombre DNS del upstream. `API_ALLOW_REMOTE=true` permite que Express escuche en `0.0.0.0` dentro de Compose; no significa que se deba publicar el puerto 3001.

## 3. Build, inicio y puertos

No escribas comandos de build o start adicionales en Coolify para estos servicios. El Compose usa los Dockerfiles y sus instrucciones ya definidas.

| Servicio | Build Command ejecutado en el Dockerfile | Start Command | Puerto |
|---|---|---|---|
| `nexus-prime-web` | `npm ci` y `npm run build`; Nginx copia `dist/` al runtime | Comando por defecto de `nginx:alpine` | `80` interno; único servicio con dominio |
| `nexus-prime-api` | `npm ci`, `npm run build` y `npm prune --omit=dev` | `node dist-server/index.js` | `3001` interno; no publicar |
| `nexus-prime-docker-proxy` | No hay build en el repositorio; descarga la imagen indicada | Comando por defecto de la imagen | `2375` en `api-docker`; no publicar |

El Compose declara `expose` para los puertos de web y API, no `ports`. La comunicación entre servicios se realiza por sus redes Compose y no crea bindings de puertos del host. Los tres servicios tienen healthchecks: `wget`/`_ping` valida la ruta proxy→Engine, `/api/health` valida Express sin depender de Docker y una petición local valida Nginx. El API solo depende del arranque del proxy, no de su salud: así, si el Engine/socket falla, el frontend y System Diagnostics pueden iniciar y mostrar el error. El frontend sí espera a que la API esté saludable. Compose no reinicia automáticamente un proceso solo porque se vuelva unhealthy.

## 4. Variables de entorno

Define las variables interpoladas por el Compose en la configuración de variables del recurso Docker Compose de Coolify, antes de desplegar:

| Variable | Servicio / etapa | Valor |
|---|---|---|
| `DOCKER_SOCKET_PROXY_IMAGE` | Proxy, runtime | Opcional. Por defecto, `ghcr.io/tecnativa/docker-socket-proxy@sha256:1f5038b54f06c3e18422902cf00ba21803d1c97805aae032e5e6673d532d3459` (release `v0.5.0`, digest consultado en GHCR el 2026-11-09). Si se sobrescribe, usar un digest SHA-256 aprobado, no `latest` ni una etiqueta mutable. |
| `DOCKER_SOCKET_PATH` | Proxy, runtime | Opcional. Ruta del socket del daemon Docker en el host asignado al recurso. Si no se define, el Compose usa `/var/run/docker.sock`. |
| `VITE_DOCKER_API_URL` | Web, build | Opcional. Por defecto `/api/docker/containers`. |
| `VITE_DOCKER_STATS_URL` | Web, build | Opcional. Por defecto `/api/docker/stats`. |

Las variables `VITE_*` se consumen como argumentos de build; un cambio requiere reconstruir y desplegar el frontend. Se recomienda conservar las rutas relativas por defecto para usar el mismo origen HTTPS y el proxy Nginx existente.

El Compose ya establece estas variables runtime de la API; no hace falta volver a definirlas en Coolify mientras no se modifique ese archivo:

| Variable | Valor del Compose | Función |
|---|---|---|
| `API_HOST` | `0.0.0.0` | Escucha en las interfaces del contenedor. |
| `API_PORT` | `3001` | Puerto de Express. |
| `API_ALLOW_REMOTE` | `true` | Habilita bind no-loopback dentro de la red privada; no publicar la API. |
| `DOCKER_HOST` | `tcp://nexus-prime-docker-proxy:2375` | Envía la CLI Docker al proxy, no directamente al socket. |

## 5. Docker Socket Proxy

El servicio `nexus-prime-docker-proxy` recibe el socket del host y es el único componente que lo monta. La imagen recomendada y fijada es la oficial de Tecnativa en GHCR, release `v0.5.0`; su documentación indica compatibilidad con Docker Engine API hasta `1.51`. El Compose configura `CONTAINERS=1` para las operaciones de lista, inspección y estadísticas, habilita explícitamente `VERSION=1` y `PING=1`, mantiene `POST=0` y desactiva explícitamente los demás grupos, incluido `EVENTS`. También niega explícitamente inicio, parada, reinicio, pausa y reanudación de contenedores.

- Confirma que el socket pertenece al mismo Docker Engine que ejecuta los contenedores que se quieren observar.
- La referencia por defecto está fijada por digest; revisa y vuelve a resolver el digest al actualizar la release.
- Mantén el bind mount como está (`:ro`) y no añadas `privileged`.
- El montaje `:ro` por sí solo **no** vuelve de solo lectura la API HTTP del daemon; conserva `POST=0` y el allowlist mínimo del proxy.
- No publiques el puerto `2375`, no asignes dominio al proxy y nunca expongas el socket Unix a Internet.

El proxy Docker sigue siendo una interfaz sensible del host. `CONTAINERS=1` habilita el grupo de endpoints de contenedores en lectura; el proxy no ofrece una autorización por cada endpoint `GET`. Una API o un proxy comprometido podría leer metadatos/operaciones GET de contenedores, por lo que la red del proxy solo debe tener a la API como consumidor. La imagen oficial no cifra el HTTP interno; la segmentación de red es obligatoria. No se requiere `privileged` en la configuración base; Tecnativa lo menciona solo para contextos SELinux/AppArmor que bloqueen el socket. Si el host impone ese control, revisar la política del VPS antes de añadirlo.

### Alcance de las operaciones Docker

El backend ejecuta `docker ps --all`, `docker inspect` y `docker stats --no-stream`. Son lecturas que el cliente Docker hace mediante la API HTTP del Engine y el proxy Tecnativa puede autorizarlas con `CONTAINERS=1` y `POST=0`. El endpoint `/version` es necesario para mostrar la versión del servidor y está permitido con `VERSION=1`; `PING=1` habilita la comprobación `_ping`.

El permiso mínimo no es equivalente a riesgo cero: acceso al socket Docker implica control elevado del host. La API expone solo endpoints de consulta normalizados y no permite enviar comandos arbitrarios, pero el daemon/socket y la propia red del proxy deben considerarse privilegiados. Además, `/api/docker/containers` expone nombres, imágenes, estados, puertos y redes; protege el dominio mediante autenticación/autorización del ingress de Coolify o una capa equivalente. Esta aplicación no implementa autenticación.

## 6. Redes y comunicación

El Compose ya crea las redes; no se deben reemplazar por redes adicionales configuradas manualmente en Coolify:

| Red | Miembros | Configuración |
|---|---|---|
| `web-api` | `nexus-prime-web`, `nexus-prime-api` | Comunicación HTTP de Nginx con Express. |
| `api-docker` | `nexus-prime-api`, `nexus-prime-docker-proxy` | `internal: true`; comunicación de la CLI Docker con el proxy. |

El ingress de Coolify envía solicitudes públicas al frontend en el puerto 80. La API se alcanza por el nombre Compose `nexus-prime-api`; la API alcanza al proxy por `nexus-prime-docker-proxy:2375`. El frontend no pertenece a `api-docker` y no tiene conectividad directa con el proxy.

## Auditoría de readiness del repositorio

| Área | Resultado verificado | Riesgo / acción |
|---|---|---|
| Compose | Servicios web/API/proxy, redes divididas, sin `ports`, socket solo en proxy; incluye healthchecks y espera de salud solo para el frontend→API. | La salud se tiene que confirmar contra Compose y Engine en el VPS; Docker Compose no está disponible en este entorno. |
| Frontend Dockerfile | Multi-stage: Node solo en build y Nginx Alpine como runtime; copia `dist/`. | Nginx usa la configuración estándar como root para escuchar en 80; considerar Nginx unprivileged y puerto 8080 en una iteración de hardening. Tags de Node/Nginx no fijados por digest. |
| API Dockerfile | Multi-stage, podado de dependencias de desarrollo y ejecuta como usuario no-root `nexus`; Docker CLI está en runtime. | `node:22-alpine` y el paquete `docker-cli` de Alpine no están fijados por versión/digest; fijarlos y escanear imágenes para builds reproducibles. |
| `.dockerignore` | Excluye `node_modules`, artefactos, `.env`, llaves y secretos. | Revisar que ningún secreto se suministre como `ARG` o se copie desde una ruta fuera de este control. |
| API de diagnóstico | `/api/health` verifica Express sin depender de Docker; `/api/diagnostics` comprueba la versión del Engine y la colección Docker. | Los endpoints no incluyen auth; deben permanecer detrás del dominio protegido. |
| Pruebas Docker LIVE | Fixtures validan normalización y estado de error del backend; **System Diagnostics** contrasta API, proxy/ruta, Engine, descubrimiento y fallback simulado. | Fixtures no son una prueba contra Docker Engine real. En estado `SIMULATED`, el despliegue no es LIVE ni aceptable como tal. |

No se midió el tamaño de las imágenes ni se comprobó su arranque: requieren Docker. El uso de multi-stage reduce el runtime respecto al build stage, pero no se informa un tamaño estimado como si fuera medido.

## Deployment Validation Checklist

- [ ] Se seleccionó una revisión publicada que contiene todos los cambios; Coolify carga `deploy/compose.yaml` desde una aplicación Git con Base Directory `/deploy` y Compose Location `/compose.yaml`.
- [ ] `DOCKER_SOCKET_PROXY_IMAGE` tiene un digest aprobado y `DOCKER_SOCKET_PATH` apunta al socket del host correcto, si se requiere una ruta distinta.
- [ ] Coolify construye web y API, descarga la imagen del proxy y los tres servicios permanecen ejecutándose.
- [ ] El dominio HTTPS está vinculado solo a `nexus-prime-web`, puerto interno `80`, con certificado válido.
- [ ] No hay dominios ni puertos públicos para `nexus-prime-api` ni `nexus-prime-docker-proxy`; no se publica `3001`, `2375` ni el socket.
- [ ] El frontend carga y las rutas de la aplicación funcionan (fallback SPA de Nginx).
- [ ] `GET https://<dominio>/api/docker/containers` devuelve HTTP 200 y un arreglo JSON.
- [ ] `GET https://<dominio>/api/docker/stats` devuelve HTTP 200 y JSON de estadísticas.
- [ ] El dashboard muestra `Docker: LIVE` y los contenedores/estadísticas corresponden al Engine esperado.
- [ ] Los logs de la API no muestran errores de conexión o ejecución de Docker.
- [ ] Se verificó externamente que la API y el proxy no son accesibles desde Internet.
- [ ] Se definió control de acceso para el dashboard: la API no implementa autenticación propia y los endpoints exponen inventario/metadatos Docker.

### Checklist de aceptación final

- [ ] **GitHub:** revisión publicada confirmada; comprobar su contenido y la versión en `VERSION`/`package.json` en lugar de asumir que el tag existente contiene los cambios locales.
- [ ] **Build:** CI ejecutó build, lint y tests con resultado exitoso.
- [ ] **Dockerfile:** ambas imágenes construyen en Linux/AMD64 (y cualquier otra arquitectura declarada); imagen final, usuario y escaneo revisados.
- [ ] **Compose:** `docker compose -f deploy/compose.yaml config` valida y los tres healthchecks están `healthy`.
- [ ] **Variables:** rutas Vite relativas; `DOCKER_SOCKET_PATH` apunta al daemon correcto; imagen proxy fijada por digest.
- [ ] **Proxy:** `/_ping` y `VERSION` responden desde el servicio API; `POST=0`; endpoints de mutación denegados; ningún puerto/dominio público.
- [ ] **API:** `/api/health` responde 200; API solo accesible a través del frontend/red interna.
- [ ] **Docker LIVE:** `/api/docker/containers` y `/api/docker/stats` responden 200; versión y cantidad corresponden al Engine objetivo; Diagnostics muestra descubrimiento `OK` y fuente `LIVE`.
- [ ] **Coolify:** aplicación Compose desde Git, Base Directory `/deploy`, Compose Location `/compose.yaml`, build desde raíz del checkout, dominio TLS solo en frontend e ingress/autenticación probados.
- [ ] **VPS-WEB:** prueba operativa posterior a reinicio y confirmación de recuperación de proxy/API/dashboard.

Si un endpoint responde `503`, revisa los logs de la API, la resolución de `nexus-prime-docker-proxy`, el acceso del proxy al socket y su allowlist. No lo resuelvas exponiendo directamente el puerto 2375 o el socket. El dashboard puede mostrar datos simulados si falla la API; confirma los HTTP 200 y el indicador `Docker: LIVE` antes de dar el despliegue por validado.

## Decisión de certificación

**Resultado del repositorio:** listo para ejecutar la validación en Coolify después de desplegar la rama que contiene estos cambios; no se detecta una incompatibilidad Compose estructural conocida. **Resultado VPS-WEB/Coolify:** pendiente, no certificado. Faltan evidencia de parsing/build Docker, permisos reales del socket, estado de los healthchecks, dominio/ingress/autenticación y consultas Docker LIVE contra el daemon objetivo. No marcar `DEPLOYMENT READY` hasta completar todas las casillas de aceptación final.

## Referencia de Coolify

La configuración sigue el flujo de [Docker Compose desde un repositorio Git en la documentación de Coolify](https://coolify.io/docs/applications/builds/docker-compose). La referencia recomendada del proxy corresponde a [Tecnativa docker-socket-proxy v0.5.0](https://github.com/Tecnativa/docker-socket-proxy/releases/tag/v0.5.0) y a su [paquete GHCR](https://github.com/orgs/Tecnativa/packages/container/package/docker-socket-proxy). Los nombres exactos de controles de la interfaz pueden variar entre versiones, pero el recurso debe conservar el archivo Compose, su raíz y el servicio público descritos arriba.
