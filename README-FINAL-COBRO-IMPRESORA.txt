POS Gelateria USB — versión final cobro + cajón + tickets
=========================================================

Flujo final de cobro:

1. Pulsar COBRAR.
2. Sale una ventana interna del TPV con el total.
3. Confirmar con ✓ COBRAR.
4. Se guarda la venta.
5. Se abre el cajón.
6. NO se imprime ticket.
7. NO sale la vista previa de impresión de Windows/navegador.

Tickets:
- Solo se imprimen manualmente desde "Últims tiquets" o desde Admin > "Imprimir tiquet de prova".
- La impresión de ticket ahora va directa por backend a la impresora Windows "TIQUETS".
- No usa window.print(), ni vista previa, ni diálogo de Windows para tickets.

Cajón:
- El cajón va conectado a la impresora por RJ11/RJ12.
- El comando real encontrado en Prigest es: 1B700019A3.
- En JS: Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xA3])
- Se manda a la cola Windows llamada TIQUETS.

Rendimiento:
- Se ha añadido servidor/rawprint-worker.ps1.
- Este worker deja WinSpool cargado y evita arrancar PowerShell completo en cada apertura.
- La primera apertura tras iniciar el TPV puede tardar un poco más; después debería ser mucho más rápida.

No depende de:
- \\localhost\TIQUETS
- copy /B
- USB004
- PRN
- impresora compartida
- vista previa de navegador para tickets

Configuración:
- En Admin > Config, el nombre de impresora debe ser exactamente: TIQUETS
