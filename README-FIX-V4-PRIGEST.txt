FIX v4 - Impresora/cajón según copia antigua Prigest
====================================================

De la base de datos antigua Prigest se ha sacado la configuración real:

- TERM_IMPPARAM = EPSON
- TERM_IMPPORT = TIQUETS
- TERM_CALAIXPORT = TIQUETS
- TERM_OBRIRCALAIX = 1B700019A3
- TERM_TIPUSIMPRESSORATIQUETS = T

Cambios:

1) El cajón ahora intenta primero EXACTAMENTE el pulso de Prigest:
   HEX: 1B 70 00 19 A3
   Enviado a la impresora Windows llamada TIQUETS.

2) Admin > Imprimir tiquet de prova ahora usa el mismo sistema que ya funcionaba
   en Ventas: window.print() del navegador.

3) Se eliminan dependencias de \\localhost\TIQUETS y de compartir la impresora.

Prueba recomendada:

- Config > Nom impressora: TIQUETS
- Desar
- Provar obrir calaix
- Imprimir tiquet de prova

Si imprime pero no abre, revisar cable RJ11/RJ12 al puerto DK/Drawer de la Posiflex
u opciones del driver de Posiflex/Generic Text Only para cajón.
