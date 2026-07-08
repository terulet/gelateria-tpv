// ============================================================
//  ACTUALIZAR PRECIOS - La Gelateria de Roses
//  Aplica los precios de productos-iniciales.js a la base de
//  datos EXISTENTE, sin borrar ventas ni cierres.
//
//  Uso:  doble clic a ACTUALITZAR-PREUS.bat
//        (o: node servidor/actualizar-precios.js)
// ============================================================

const { db } = require('./db.js');
const { CATEGORIAS, PRODUCTOS } = require('./productos-iniciales.js');

console.log('');
console.log('  Actualitzant preus i productes...');
console.log('');

let nuevos = 0, actualizados = 0, categoriasNuevas = 0;

// 1) Asegurar que todas las categorías existen
const getCat = db.prepare('SELECT id FROM categorias WHERE id = ?');
const insCat = db.prepare('INSERT INTO categorias (id, nombre, color, orden) VALUES (?, ?, ?, ?)');
const updCat = db.prepare('UPDATE categorias SET nombre = ?, color = ?, orden = ? WHERE id = ?');
for (const c of CATEGORIAS) {
  if (getCat.get(c.id)) updCat.run(c.nombre, c.color, c.orden, c.id);
  else { insCat.run(c.id, c.nombre, c.color, c.orden); categoriasNuevas++; }
}

// 2) Para cada producto del archivo: si existe (misma categoría+nombre) actualiza precio;
//    si no existe, lo crea.
const findProd = db.prepare('SELECT id, precio, color FROM productos WHERE categoria = ? AND nombre = ?');
const updProd = db.prepare('UPDATE productos SET precio = ?, color = ? WHERE id = ?');
const maxOrden = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM productos');
const insProd = db.prepare('INSERT INTO productos (categoria, nombre, precio, color, orden) VALUES (?, ?, ?, ?, ?)');

for (const p of PRODUCTOS) {
  const existe = findProd.get(p.categoria, p.nombre);
  if (existe) {
    if (existe.precio !== (p.precio || 0) || existe.color !== (p.color || null)) {
      updProd.run(p.precio || 0, p.color || null, existe.id);
      actualizados++;
    }
  } else {
    const orden = maxOrden.get().m + 1;
    insProd.run(p.categoria, p.nombre, p.precio || 0, p.color || null, orden);
    nuevos++;
  }
}

console.log(`  ✅ Preus aplicats correctament:`);
console.log(`     · ${actualizados} preus actualitzats`);
console.log(`     · ${nuevos} productes nous afegits`);
if (categoriasNuevas) console.log(`     · ${categoriasNuevas} categories noves`);
console.log('');
console.log('  Les vendes i tancaments NO s\'han tocat.');
console.log('  Ja pots tancar aquesta finestra.');
console.log('');
