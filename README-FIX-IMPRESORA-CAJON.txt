FIX impresora/cajón v2
======================

Qué cambia:
- Se elimina la impresión por puerto USB004/copy /B.
- Ahora se envía RAW ESC/POS a la cola de Windows por nombre de impresora usando WinSpool.
- Debe funcionar con la impresora USB llamada TIQUETS sin compartirla en red.
- La apertura de cajón envía pulso a pin 2 y pin 5 para cubrir cajones Posiflex/Epson compatibles.

Cómo probar:
1) Cierra el TPV viejo.
2) Descomprime esta carpeta completa.
3) Abre INICIAR-POS.bat.
4) En Admin > Config escribe exactamente TIQUETS y pulsa Desar.
5) Prueba primero: Imprimir tiquet de prova.
6) Luego: Provar obrir calaix.
7) En ventas, cobra una prueba. El ticket puede seguir saliendo por la impresión normal del navegador; el cajón se abre por el endpoint /api/abrir-cajon.

Si imprime pero no abre:
- Revisa que el cable RJ11 del cajón esté en el puerto DK / Drawer de la Posiflex, no en red/LAN.
- Prueba apagar y encender impresora y cajón.
