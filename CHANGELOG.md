# Changelog

Los cambios relevantes del proyecto se documentan aquí conforme a [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

Sin cambios registrados.

## [0.6.1-alpha] - 2026-11-09

### Added

- System Diagnostics para consultar API, versión Docker, contenedores encontrados, última detección y estado de descubrimiento.
- API Express para Docker LIVE, endpoints de diagnóstico y healthcheck HTTP.
- Indicador de procedencia Docker y pruebas de la API; se mantiene el fallback simulado.
- Healthchecks de frontend, API y Docker Socket Proxy en Compose, y política explícita de solo lectura.
- Checklists de Release Candidate y validación de despliegue en VPS-WEB/Coolify.

### Changed

- Sincronizada la versión del proyecto en `VERSION`, `package.json` y `package-lock.json`.
- Fijada por digest la imagen predeterminada de Docker Socket Proxy y explicitados permisos mínimos de solo lectura.
- Actualizada la documentación para indicar que la validación real en VPS-WEB sigue pendiente.

## [0.5.0]

Primera versión preparada para publicación; fecha de publicación pendiente.

### Added

- Digital Twin jerárquico con relaciones de hosting y dependencias.
- NEXUS CORE y Service Map con filtros, selección y expansión de ramas.
- Discovery Engine con combinación de nodos, dependencias y eliminaciones.
- Operational Health Engine con NEXUS HEALTH, criticidad y Operational Score.
- Impact Propagation y análisis de causas raíz en el Inspector.
- Mission Console y Timeline operacional agrupado por categorías.
- Adaptador Docker con transporte HTTP normalizado y fallback simulado.
- Laboratory Grid con ACA001, ING101, ING201, ING202, ING203 e ING204.

### Limitations

- La aplicación es frontend; KPI, eventos y topología inicial son simulados y se mantienen en memoria.
- El endpoint Docker y la autenticación no están incluidos. Las demás integraciones registradas son placeholders.
