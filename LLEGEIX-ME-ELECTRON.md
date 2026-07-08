# POS Gelateria — App de escritorio Windows (Electron + NSIS)

Esta versión envuelve el TPV en una app de escritorio Windows instalable.
**La lógica de ventas, impresión y cajón NO se ha reescrito.** Solo se ha
añadido la capa Electron, se ha movido la BD a una ruta escribible y se ha
dejado el script PowerShell fuera del asar.

---

## Generar el instalador (en el Mac mini o en un Windows con Node 22+)

> El `.exe` se genera **en Windows** (o con las herramientas de electron-builder).
> electron-builder descarga los binarios de Electron 42, por eso necesita red.

```
cd POS-Gelateria-USB
npm install
npm run dist
```

- `npm run dist` primero ejecuta `check-sqlite` (comprobación obligatoria de
  `node:sqlite`/`DatabaseSync`). **Si falla, aborta y no genera instalador.**
- Luego electron-builder crea el instalador NSIS en:

```
dist\POS-Gelateria-Setup.exe
```

---

## Instalar en el TPV

1. Copiar `POS-Gelateria-Setup.exe` al TPV.
2. Doble clic → instalar (permite elegir carpeta; por defecto Program Files).
3. Se crean accesos en **escritorio** y **menú inicio** con el nombre **POS Gelateria**.
4. Doble clic en el icono → se abre el TPV a pantalla completa, sin navegador.

---

## Dónde queda la base de datos

En la carpeta de datos de usuario de Windows (escribible, a diferencia de
Program Files):

```
C:\Users\<usuario>\AppData\Roaming\POS Gelateria\pos.sqlite
```

- El `main` de Electron fija `POS_DB_DIR` a esa carpeta y `db.js` la usa.
- En el primer arranque, si no existe, se crea con el seed (categorías/productos).
- Ahí van también futuros config/logs/backups.
- **Para hacer copia de seguridad de las ventas: copiar esa carpeta.**
- **Para actualizar la app sin perder ventas:** reinstalar el `.exe` NO borra
  esa carpeta, así que las ventas se conservan.

---

## Impresión y cajón (sin cambios)

- Impresora Windows: **TIQUETS**
- Comando de cajón: **1B700019A3** → `Buffer.from([0x1B,0x70,0x00,0x19,0xA3])`
- El script `rawprint-worker.ps1` se desempaqueta con `asarUnpack` para que
  PowerShell pueda ejecutarlo (no funcionaría dentro de app.asar).
- Cobrar NO imprime ticket. El ticket solo se imprime a mano desde
  "Últims tiquets". Admin conserva "Imprimir tiquet de prova" y
  "Provar obrir calaix".

---

## Volver a modo desarrollo (probar sin instalar)

Arrancar solo el backend en el navegador, como antes:

```
npm run dev-server
```
y abrir http://localhost:3001

O arrancar la app Electron en modo desarrollo (con DevTools):

```
set POS_DEV=1
npm start
```

---

## Versión de Electron

Fijada a **Electron 42.x** (Node 24) porque el backend usa `node:sqlite`
(`DatabaseSync`), disponible desde Node 22.5.0. **No bajar a Electron 33/34**
(llevan Node 20 y `node:sqlite` no está garantizado).

---

## Icono

`electron/icono.ico` es un **placeholder**. Sustitúyelo por el icono real de
POS Gelateria (formato .ico, con tamaños 256/128/64/48/32/16) antes del build
final, manteniendo el mismo nombre y ruta.
