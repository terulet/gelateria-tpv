FLAMA UPDATE — PUBLICACIÓN DE FUTURAS VERSIONES

OBJETIVO
Claude Code o el equipo de desarrollo modifica el TPV, ejecuta pruebas, genera el nuevo app.asar y publica una release. El TPV la detecta en un máximo aproximado de 15 minutos, la descarga y la instala en un momento seguro.

PRIMERA ACTIVACIÓN DEL CANAL
1. En un ordenador con acceso al GitHub de terulet, instalar GitHub CLI y ejecutar gh auth login.
2. Ejecutar ACTIVAR-CANAL-v4-AHORA.ps1.
3. El script crea, si hace falta, el repositorio público terulet/TPV-Gelateria-Updates y publica v4.0.0.
4. El repositorio contiene únicamente app.asar y manifest.json. Nunca datos, ventas, claves o configuraciones del negocio.

PUBLICAR UNA VERSIÓN FUTURA
powershell -ExecutionPolicy Bypass -File PUBLICAR-GITHUB-RELEASE.ps1 -Version 4.0.1 -AppAsar "RUTA\app.asar" -Notes "Descripción de cambios"

PAQUETE MÓVIL DE EMERGENCIA
CREAR-PAQUETE-MOVIL.ps1 genera un único archivo .flamaupdate. Puede descargarse en el iPhone y subirse desde:
http://IP-TAILSCALE-TPV:3001/update.html

IMPORTANTE
La primera versión usa un repositorio público de GitHub Releases para que el TPV pueda descargar sin guardar credenciales. El app.asar contiene software, no datos del negocio. Para vender el sistema a terceros, la evolución correcta es FLAMA Cloud privado con dispositivos, autenticación y permisos por cliente.
