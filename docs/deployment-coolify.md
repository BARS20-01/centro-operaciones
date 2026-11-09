# Guía de despliegue de NEXUS PRIME en Coolify

- **Referencia de versión:** v0.6.1-alpha
- **Recurso recomendado:** una aplicación Docker Compose
- **Archivo:** [`deploy/compose.yaml`](../deploy/compose.yaml)

> La versión indicada corresponde al estado solicitado para esta guía. En el checkout analizado, `package.json` y el encabezado del README todavía indican `0.5.0`; confirma la rama o etiqueta correcta antes de desplegar.

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

## 1. Crear el recurso y el servicio frontend

1. En Coolify, abre el proyecto y el entorno de destino y selecciona **+ New**.
2. Selecciona el repositorio de Git (o una fuente Git autorizada), la rama o etiqueta que contiene la versión a desplegar y el build pack **Docker Compose**.
3. Configura la raíz del repositorio como directorio de trabajo (`/`) y el archivo Compose como `deploy/compose.yaml`. Mantén la raíz como contexto: ambos Dockerfiles copian `package.json` y `package-lock.json` desde la raíz.
4. Carga/revisa la definición y confirma que Coolify muestra los servicios `nexus-prime-web`, `nexus-prime-api` y `nexus-prime-docker-proxy`.
5. Configura el dominio HTTPS únicamente para el servicio `nexus-prime-web`, con puerto de destino `80`.
6. No asignes dominio, exposición pública ni puerto publicado a los servicios API o proxy. No uses `dist/` como Publish Directory; Nginx ya sirve el build estático.

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

El Compose declara `expose` para los puertos de web y API, no `ports`. La comunicación entre servicios se realiza por sus redes Compose y no crea bindings de puertos del host.

## 4. Variables de entorno

Define las variables interpoladas por el Compose en la configuración de variables del recurso Docker Compose de Coolify, antes de desplegar:

| Variable | Servicio / etapa | Valor |
|---|---|---|
| `DOCKER_SOCKET_PROXY_IMAGE` | Proxy, runtime | **Obligatoria.** Imagen de Docker Socket Proxy revisada y fijada a un digest SHA-256 aprobado, por ejemplo `ghcr.io/tecnativa/docker-socket-proxy@sha256:<digest-validado>`. Sustituye el marcador por un digest real; no uses una etiqueta mutable en producción. |
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

El servicio `nexus-prime-docker-proxy` recibe el socket del host y es el único componente que lo monta. El Compose configura `CONTAINERS=1` para las operaciones de lista, inspección y estadísticas, `POST=0` y desactiva explícitamente las demás secciones indicadas. La API necesita que la imagen seleccionada permita también las llamadas estándar de comprobación de versión/conexión del cliente Docker.

- Confirma que el socket pertenece al mismo Docker Engine que ejecuta los contenedores que se quieren observar.
- Usa una imagen compatible, revisada y fijada por digest. La variable obligatoria sin definir hace que Compose rechace la configuración.
- Mantén el bind mount como está (`:ro`) y no añadas `privileged`.
- El montaje `:ro` por sí solo **no** vuelve de solo lectura la API HTTP del daemon; conserva `POST=0` y el allowlist mínimo del proxy.
- No publiques el puerto `2375`, no asignes dominio al proxy y nunca expongas el socket Unix a Internet.

El proxy Docker sigue siendo una interfaz sensible del host. Revisa los permisos de la imagen y del socket antes de producción.

## 6. Redes y comunicación

El Compose ya crea las redes; no se deben reemplazar por redes adicionales configuradas manualmente en Coolify:

| Red | Miembros | Configuración |
|---|---|---|
| `web-api` | `nexus-prime-web`, `nexus-prime-api` | Comunicación HTTP de Nginx con Express. |
| `api-docker` | `nexus-prime-api`, `nexus-prime-docker-proxy` | `internal: true`; comunicación de la CLI Docker con el proxy. |

El ingress de Coolify envía solicitudes públicas al frontend en el puerto 80. La API se alcanza por el nombre Compose `nexus-prime-api`; la API alcanza al proxy por `nexus-prime-docker-proxy:2375`. El frontend no pertenece a `api-docker` y no tiene conectividad directa con el proxy.

## Checklist de validación

- [ ] Se seleccionaron la rama/etiqueta esperada y la raíz del repositorio; Coolify carga `deploy/compose.yaml`.
- [ ] `DOCKER_SOCKET_PROXY_IMAGE` tiene un digest aprobado y `DOCKER_SOCKET_PATH` apunta al socket del host correcto, si se requiere una ruta distinta.
- [ ] Coolify construye los tres servicios sin errores y estos permanecen ejecutándose.
- [ ] El dominio HTTPS está vinculado solo a `nexus-prime-web`, puerto interno `80`, con certificado válido.
- [ ] No hay dominios ni puertos públicos para `nexus-prime-api` ni `nexus-prime-docker-proxy`; no se publica `3001`, `2375` ni el socket.
- [ ] El frontend carga y las rutas de la aplicación funcionan (fallback SPA de Nginx).
- [ ] `GET https://<dominio>/api/docker/containers` devuelve HTTP 200 y un arreglo JSON.
- [ ] `GET https://<dominio>/api/docker/stats` devuelve HTTP 200 y JSON de estadísticas.
- [ ] El dashboard muestra `Docker: LIVE` y los contenedores/estadísticas corresponden al Engine esperado.
- [ ] Los logs de la API no muestran errores de conexión o ejecución de Docker.
- [ ] Se verificó externamente que la API y el proxy no son accesibles desde Internet.
- [ ] Se definió control de acceso para el dashboard: la API no implementa autenticación propia y los endpoints exponen inventario/metadatos Docker.

Si un endpoint responde `503`, revisa los logs de la API, la resolución de `nexus-prime-docker-proxy`, el acceso del proxy al socket y su allowlist. No lo resuelvas exponiendo directamente el puerto 2375 o el socket. El dashboard puede mostrar datos simulados si falla la API; confirma los HTTP 200 y el indicador `Docker: LIVE` antes de dar el despliegue por validado.

## Referencia de Coolify

La configuración sigue el flujo de [Docker Compose desde un repositorio Git en la documentación de Coolify](https://coolify.io/docs/applications/builds/docker-compose). Los nombres exactos de controles de la interfaz pueden variar entre versiones, pero el recurso debe conservar el archivo Compose, su raíz y el servicio público descritos arriba.
