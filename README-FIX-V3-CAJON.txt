FIX v3 cajón / impresora

He revisado los SQL que pasaste: son copias de base de datos MySQL/Prigest, no contienen el programa antiguo ni configuración de cajón/impresora.

Cambios técnicos v3:
- Se mantiene envío RAW por WinSpool a la impresora Windows llamada TIQUETS.
- Se añade fallback Out-Printer para drivers Generic / Text Only.
- La apertura de cajón manda varios pulsos ESC/POS por pin 2 y pin 5, con timings diferentes.
- Admin > Provar obrir calaix ahora prueba ambos métodos.

IMPORTANTE:
Si Windows imprime página de prueba pero el cajón no abre ni con v3, revisar físicamente:
1) cable RJ11/RJ12 en puerto DK/Cash Drawer de la impresora;
2) cajón compatible 24V o 12V según impresora;
3) en Propiedades de la impresora / Device Settings, opción Cash Drawer si aparece.
