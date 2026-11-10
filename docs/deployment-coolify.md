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
| `COOLIFY_URL` | API, runtime | Opcional. Origen de la instancia Coolify, sin `/api/v1`, credenciales ni parámetros; HTTPS recomendado. Para el VPS indicado, `http://coolify:8080` requiere aceptación explícita de riesgo. |
| `COOLIFY_API_KEY` | API, runtime | Opcional. Token de Coolify del equipo objetivo con permiso **read**; guardar como secreto en Coolify. No usar `VITE_`, `read:sensitive`, `write`, `deploy` ni `root`. |
| `COOLIFY_ALLOW_INSECURE_HTTP` | API, runtime | `false` por defecto. Solo el valor exacto `true` permite HTTP y acepta que la clave y los datos viajen sin cifrar. |
| `COOLIFY_DIAGNOSTICS_LOG` | API, runtime | `false` por defecto. `true` registra temporalmente cada respuesta HTTP de Coolify, con endpoint, estado y duración; nunca la clave ni el cuerpo. |
| `PROXMOX_URL` | API, runtime | Para VPS-WEB configurar `https://proxmox.unab.ccp:8006` en Coolify, sin rutas, credenciales ni parámetros. El nombre debe coincidir con un SAN del certificado. |
| `PROXMOX_API_TOKEN` | API, runtime | Secreto con formato `usuario@realm!tokenid=secreto`, sin el prefijo `PVEAPIToken=`. Solo backend; no usar variables `VITE_`. |
| `PROXMOX_MODE` | API, runtime | `live` por defecto; `simulated` desactiva consultas reales y entrega un inventario vacío identificado explícitamente como simulado. No es un fallback automático. |
| `PROXMOX_DIAGNOSTICS_LOG` | API, runtime | `false` por defecto. `true` habilita temporalmente trazas de requests, respuestas, parsing y descubrimiento sin valores de inventario ni credenciales. |
| `PROXMOX_CA_PATH` | Compose, host | Ruta absoluta al PEM de CA confiable en el host Docker; por defecto `/etc/nexus-prime/certs/proxmox-ca.pem`. El archivo debe existir antes del despliegue. |

Las variables `VITE_*` se consumen como argumentos de build; un cambio requiere reconstruir y desplegar el frontend. Se recomienda conservar las rutas relativas por defecto para usar el mismo origen HTTPS y el proxy Nginx existente.

### Proxmox LIVE

#### CA y TLS en VPS-WEB

El Compose monta `PROXMOX_CA_PATH` como archivo de solo lectura en `/run/nexus-prime/proxmox-ca.pem` y configura `NODE_EXTRA_CA_CERTS` para Node. **El montaje es obligatorio para este Compose, incluso si Proxmox está desactivado:** crea el archivo antes de desplegar; si falta, el contenedor API no arrancará. Si no se usa una CA adicional en otra instalación, proporciona allí un PEM de CA confiable apropiado o adapta el Compose de esa instalación. Node debe poder leerlo como usuario no root. La CA se agrega a la confianza de todo el proceso Node, no solo a Proxmox.

En VPS-WEB, `extra_hosts` resuelve `proxmox.unab.ccp` a `10.91.32.30` únicamente dentro de la API. Cambia en Coolify la variable existente `PROXMOX_URL` a `https://proxmox.unab.ccp:8006`: el Compose recibe su valor del recurso Coolify y no actualiza la configuración remota por sí solo. La entrada es estática; si cambia la IP o la instancia, actualízala después de verificar la identidad del destino y el SAN del certificado. No es un registro DNS global.

1. Identifica el certificado servido por Proxmox y su CA. Si usa el certificado predeterminado de Proxmox VE, la CA pública es `/etc/pve/pve-root-ca.pem`; si usa un certificado personalizado o ACME, utiliza la CA emisora real y asegúrate de que el servidor entregue los intermediarios necesarios. No copies claves privadas. En el nodo Proxmox, obtiene la huella de la CA por un canal administrativo confiable:

   ```sh
   openssl x509 -in /etc/pve/pve-root-ca.pem -noout -subject -issuer -fingerprint -sha256
   ```

2. Desde VPS-WEB, copia la CA pública mediante SSH autenticado; reemplaza `USUARIO_ADMIN` por una cuenta autorizada a leer el archivo:

   ```sh
   scp USUARIO_ADMIN@10.91.32.30:/etc/pve/pve-root-ca.pem /tmp/nexus-proxmox-ca.pem
   openssl x509 -in /tmp/nexus-proxmox-ca.pem -noout -subject -issuer -fingerprint -sha256
   ```

   Compara la huella con la obtenida en el nodo por un canal confiable. No instales la CA si no coinciden. Para una CA distinta, reemplaza la ruta de origen y verifica su huella de la misma manera.

3. En VPS-WEB, instala el PEM comprobado sin sobrescribir una CA existente inadvertidamente:

   ```sh
   sudo install -d -m 755 /etc/nexus-prime/certs
   sudo test ! -e /etc/nexus-prime/certs/proxmox-ca.pem
   ```

   Solo si el último comando finaliza correctamente:

   ```sh
   sudo install -m 644 /tmp/nexus-proxmox-ca.pem /etc/nexus-prime/certs/proxmox-ca.pem
   ```

   Si ya existe, verifica su contenido y coordina su reemplazo; un archivo montado individualmente puede requerir recrear el contenedor tras su rotación. Borra el archivo temporal de forma controlada una vez verificada la instalación.

4. Publica y despliega la revisión que contiene el montaje; recrea `nexus-prime-api`. `NODE_EXTRA_CA_CERTS` se lee al iniciar Node. Confirma que el PEM sea legible dentro del contenedor y revisa sus logs por advertencias de carga. El certificado del servidor debe ser válido para el nombre o IP de `PROXMOX_URL`; importar la CA no corrige un SAN incorrecto. No uses `NODE_TLS_REJECT_UNAUTHORIZED=0` ni desactives la verificación TLS.

5. Dentro de `nexus-prime-api`, verifica primero sin enviar token:

   ```sh
   node -e "require('node:dns').lookup('proxmox.unab.ccp',(e,a)=>{if(e){console.error(e.code);process.exitCode=1}else console.log('IP',a)})"
   node -e "fetch(new URL('/api2/json/version', process.env.PROXMOX_URL), {redirect:'manual',signal:AbortSignal.timeout(15000)}).then(r=>console.log('HTTP',r.status)).catch(e=>{console.error('TLS/transport error:',e.name,e.cause?.code ?? 'unknown');process.exitCode=1})"
   ```

   Confirma que la IP sea `10.91.32.30`. Solo si la petición HTTPS devuelve `200` o `401`, comprueba la autenticación sin imprimir el token ni el cuerpo:

   ```sh
   set +x
   node -e "fetch(new URL('/api2/json/cluster/resources',process.env.PROXMOX_URL),{headers:{Accept:'application/json',Authorization:'PVEAPIToken='+process.env.PROXMOX_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)}).then(r=>{console.log('HTTP',r.status);if(!r.ok)process.exitCode=1}).catch(e=>{console.error('Request error:',e.name,e.cause?.code ?? 'unknown');process.exitCode=1})"
   ```

   `200` confirma esa consulta autenticada, no necesariamente inventario completo. Si TLS falla, corrige la confianza, cadena o identidad del certificado antes de enviar el token. Si el primer paso devuelve otro estado, investígalo antes de continuar.

Define ambas variables en Coolify y despliega la revisión que incorpora el transporte. Usa un token dedicado de solo lectura y limita su alcance al inventario autorizado; para consultar contenido de storage la API requiere `Datastore.Audit` o el privilegio más amplio `Datastore.AllocateSpace`, por lo que se prefiere `Datastore.Audit`. Configura también los permisos de auditoría de nodos y VMs necesarios en la versión y ACL de la instalación; con separación de privilegios, tanto el usuario como el token deben tener acceso. Proxmox puede filtrar recursos por ACL sin error: un 200 no demuestra inventario completo. Nunca concedas permisos de modificación para esta integración.

El backend usa exclusivamente GET: `/api2/json/cluster/resources`, `/api2/json/nodes/{node}/{qemu|lxc}/{vmid}/snapshot` y `/api2/json/nodes/{node}/storage/{storage}/content?content=backup`. Se usan hasta cinco solicitudes concurrentes y un plazo global de 35 segundos. El inventario de snapshots y backups puede ser parcial por permisos, nodos o storages no disponibles o plazo agotado; `snapshotErrors` y `backupErrors` indican consultas incompletas. Se excluye el snapshot especial `current`. Los backups proceden de storages visibles en Proxmox VE, no de un inventario independiente de Proxmox Backup Server; los storages compartidos pueden contar el mismo backup en varios nodos.

VM QEMU **200** en el nodo **`proxmox`** se identifica explícitamente con el núcleo VPS-WEB; la relación solo se establece al observar ambos. Si la VM migra, no se vincula automáticamente a otro nodo hasta actualizar esa identificación. No se infiere que otras VMs alojen servicios. VM 100 apagada sigue en el inventario pero queda fuera de la topología operativa; si vuelve a estar activa aparecerá en el grafo. Estados desconocidos se muestran como advertencia. Para recursos activos, CPU, RAM o disco al 85% generan advertencia y al 95% estado crítico, cuando esas métricas están disponibles; no representan una medición del interior del sistema invitado. Si un nodo previamente descubierto deja de estar visible se conserva como desactualizado para no borrar el núcleo ni los servicios de otras fuentes.

El endpoint `/api/proxmox/discovery` devuelve solo inventario normalizado y no contiene la clave, configuración de VM, rutas de volúmenes o descripciones de snapshots. **La API NEXUS no implementa autenticación:** protege externamente el dominio y `/api/` antes de exponer inventario. No desactives la verificación TLS ni envíes el token a clientes o logs.

`GET /api/proxmox/health` comprueba la lectura autenticada de `/cluster/resources` de forma independiente; `status=OK` con `source=live` indica que respondió esa consulta, no que el inventario esté completo. En modo simulado devuelve `source=simulated` y no comprueba la instancia. El descubrimiento comparte solicitudes concurrentes y almacena el último resultado durante 30 segundos. Si falla, devuelve `503`; no cambia automáticamente a simulación.

Validación: comprueba que `/api/proxmox/health` y `/api/proxmox/discovery` respondan `200` con `source=live`, que los recursos visibles incluyan nodo `proxmox`, VM 200 y VM 100 con su estado real, que `snapshotErrors` y `backupErrors` sean cero y que los storages, snapshots y backups coincidan con Proxmox. Revisa System Diagnostics y el Inspector; provoca una falla controlada solo con autorización y verifica la cadena de causa/impacto sin modificar cargas reales. Docker y Coolify deben permanecer LIVE de forma independiente. Para diagnosticar, activa temporalmente `PROXMOX_DIAGNOSTICS_LOG=true`, recrea la API y consulta los endpoints; revisa las líneas `Proxmox request`, `response`, `parse` y `discovery` en Runtime Logs. Se registran rutas genéricas, estados, cantidades y tiempos, nunca tokens, nombres, identificadores ni cuerpos. Desactiva las trazas después de la validación.

### Integración Coolify: alcance y validación

Habilita el acceso a la API de la instancia y su IP allowlist si corresponde. Configura **ambas** variables `COOLIFY_*` solo en el runtime del backend, reinicia el recurso y protege el acceso al dashboard/API mediante autenticación y autorización externa. La aplicación no incorpora autenticación; el endpoint de inventario muestra nombres y URLs de recursos a quien pueda acceder a `/api/`. No publiques el token, no lo incluyas en una URL y evita registrar la configuración Compose interpolada.

Por defecto `COOLIFY_URL` requiere **HTTPS con certificado válido y confiable** desde el contenedor API. Si no existe HTTPS y el operador acepta el riesgo, configura `COOLIFY_URL=http://coolify:8080` y `COOLIFY_ALLOW_INSECURE_HTTP=true` en el recurso Compose; conserva `COOLIFY_API_KEY` como secreto de solo lectura y recrea la API tras desplegar la revisión que implementa esta opción. HTTP transmite la clave y respuestas sin cifrar: una red Docker interna no protege frente al host, a otros contenedores conectados, a un destinatario DNS incorrecto ni a interceptación. Limita la red a participantes confiables y usa HTTPS en cuanto esté disponible; nunca desactives la validación TLS. El backend emite una advertencia al habilitar HTTP.

El Compose conecta la API a `web-api` y `api-docker`; **no garantiza** que el contenedor `coolify` comparta esas redes ni que su nombre resuelva a la instancia correcta. Comprueba desde el contenedor API, sin token y sin imprimir variables:

```sh
node -e "require('node:dns').lookup('coolify', (e, a) => { if (e) { console.error('DNS: no resuelve'); process.exitCode = 1 } else console.log('DNS resuelto:', a) })"
node -e "fetch('http://coolify:8080/api/health', {signal: AbortSignal.timeout(5000), redirect: 'error'}).then(r => { console.log('Coolify health HTTP', r.status); if (!r.ok) process.exitCode = 1 }).catch(() => { console.error('Coolify health inaccesible'); process.exitCode = 1 })"
```

Un DNS y healthcheck exitosos no garantizan la identidad del servidor ni los permisos del token. Si falla la resolución o conexión, el administrador debe revisar las redes y aliases reales de ambos contenedores y proporcionar una ruta privada de confianza; no conectar automáticamente la API a redes adicionales ni publicar el puerto 8080. Si la salud responde, valida `/api/coolify/discovery` a través del acceso autenticado a NEXUS PRIME. La instancia debe permitir API y aceptar el token y su alcance; no imprimas ni envíes el token al verificarlo.

Si `/api/coolify/discovery` devuelve `404`, comprueba la revisión desplegada, que el build incluya `dist-server/app.js` y `dist-server/coolify.js`, y que Nginx reenvíe `/api/` al backend correcto. Si devuelve `503`, la ruta está activa pero el descubrimiento falló. Los Runtime Logs, desde la versión que incorpora el diagnóstico detallado, indican `NOT_CONFIGURED`, `INVALID_CONFIGURATION`, `UPSTREAM_UNREACHABLE`, `UPSTREAM_HTTP` (con estado HTTP), `RATE_LIMITED` o `INVALID_RESPONSE`, sin registrar la clave ni el cuerpo de la respuesta. Un `503` no permite confirmar por sí solo cuál de estas causas ocurrió.

Para diagnosticar solicitudes, despliega la revisión que incluye estas trazas y activa temporalmente `COOLIFY_DIAGNOSTICS_LOG=true`; recrea la API y consulta una vez `/api/coolify/discovery`. La integración envía GET a `/api/v1/projects`, `/api/v1/resources` y `/api/v1/deployments`, y GET a `/api/v1/projects/{uuid}` por cada proyecto. Los logs identifican endpoint, estado y duración; el UUID se redacta. Las etapas de parsing exitosas indican sus cantidades y el descubrimiento registra inicio, resultado y duración. Ante `INVALID_RESPONSE`, se registra el campo esperado, tipo genérico recibido e índice de la colección, sin registrar valores. Las fallas se registran aun sin activar la variable. Se usa el token como Bearer, pero no se registran headers, URLs configuradas, cuerpos ni excepciones originales. Las primeras tres solicitudes se ejecutan en paralelo: sus líneas pueden aparecer en cualquier orden, incluso después de una línea de fallo.

Interpretación: `DNS_NOT_FOUND`/`DNS_TEMPORARY_FAILURE` apunta a resolución; `CONNECTION_REFUSED`, `CONNECTION_TIMEOUT` o `NETWORK_UNREACHABLE` a conectividad; `TIMEOUT` a plazo agotado; `FETCH_FAILED` incluye otros errores de red o redirecciones rechazadas. `status=401` o `403` requiere revisar token, permisos, API habilitada e IP allowlist; `status=404` indica que el endpoint *upstream* no existe o no está disponible en esa instancia; `429` indica límite. `INVALID_JSON` o `INVALID_RESPONSE` indica formato inesperado. Un `200` HTTP en cada llamada no garantiza que el inventario se haya normalizado. Apaga el log detallado después del diagnóstico y no compartas credenciales ni respuestas completas.

El backend consulta únicamente endpoints GET de proyectos, detalle de proyecto (entornos), recursos y despliegues activos. Coolify v4.7.3 puede serializar los despliegues como una colección con índices numéricos; el transporte acepta tanto ese formato como un array, sin aceptar objetos arbitrarios. `/deployments` contiene solo despliegues en curso o en cola, no el historial completo. La salida se limita a campos seleccionados, excluye credenciales, logs, Compose y valores de entorno, y elimina credenciales, rutas y parámetros de las URLs. Coolify limita el token al equipo y ámbito autorizados: **no se garantiza inventario de otros equipos**. Una respuesta incompleta o un error se comunica como `503`, no como LIVE; tras una pérdida de conexión se conservan nodos anteriores marcados como desactualizados. Sin conexión no se fabrican recursos Coolify simulados.

Las lecturas se comparten y cachean al menos 30 segundos, con TTL mayor para muchos proyectos y espera ante `429`. La API de Coolify y su versión, permisos y rate limit deben verificarse en el entorno real. El endpoint de despliegues consultado solo enumera **despliegues en curso**; el historial y el último despliegue no quedan establecidos por ausencia de resultados. La asociación con contenedores Docker, builds históricos, eventos `Deployment Finished`/`Container Restarted` y la identificación causal de qué despliegue provocó una caída **no están implementados ni verificados**. No inferir estas relaciones por coincidencia de nombres.

Validar desde una sesión autenticada: abre `/diagnostics`, verifica **Coolify Source LIVE**, los conteos y timestamp; confirma en el Digital Twin los proyectos, entornos y recursos del equipo autorizado y en el Inspector la fuente y el estado. Compara los resultados con Coolify y prueba un fallo de conectividad sin exponer el token. La integración con fixtures no certifica que Grafana, Uptime Kuma o NEXUS PRIME sean recursos del equipo/instancia configurados.

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
