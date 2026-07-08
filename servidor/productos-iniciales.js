// ============================================================
//  PRODUCTOS INICIALES - La Gelateria de Roses
//  Precios reales + colores estilo Prigest (03/07/2026)
// ============================================================

const CATEGORIAS = [
  { id: 'gelat',      nombre: 'GELAT',      color: '#E8D53A', orden: 1 },
  { id: 'granitzat',  nombre: 'GRANITZAT',  color: '#3B6FD4', orden: 2 },
  { id: 'milkshake',  nombre: 'MILKSHAKE',  color: '#D93A2B', orden: 3 },
  { id: 'crepes',     nombre: 'CREPES',     color: '#D98E3A', orden: 4 },
  { id: 'gofres',     nombre: 'GOFRES',     color: '#7B3FD4', orden: 5 },
  { id: 'begudes',    nombre: 'BEGUDES',    color: '#4ECDC4', orden: 6 },
  { id: 'extras',     nombre: 'EXTRAS',     color: '#E8E4DC', orden: 7 },
  { id: 'polos',      nombre: 'POLOS',      color: '#E8E4DC', orden: 8 },
  { id: 'cafe',       nombre: 'CAFÉ',       color: '#3E2418', orden: 9 },
  { id: 'taxi',       nombre: 'TAXI',       color: '#E8E4DC', orden: 10 },
];

// Colores estilo Prigest (de las fotos originales)
const C = {
  lila:     '#8f9de8',  // cono
  amarillo: '#e8e23a',  // tarrina
  verde:    '#7ec83a',  // danes
  magenta:  '#e13ad4',  // cono extra
  oliva:    '#a8a83a',  // crocanti
  turquesa: '#5fd0d0',  // soft
  morado:   '#c86fd4',  // porex
  azul:     '#3b8fd4',  // granizat
  rojo:     '#d93a2b',  // milkshake
  naranja:  '#d98e3a',  // crepes/canario
  blanco:   '#f0f0f0',  // varios
  cafe:     '#5a3820',  // café
  verdelima:'#a8e83a',  // gofre
};

// [categoria, nombre, precio, color]
const PRODUCTOS = [
  // ===== GELAT =====
  { categoria: 'gelat', nombre: '1 BOLA CONO', precio: 3.00, color: C.lila },
  { categoria: 'gelat', nombre: '2 BOLAS CONO', precio: 4.70, color: C.lila },
  { categoria: 'gelat', nombre: '3 BOLAS CONO', precio: 5.70, color: C.lila },
  { categoria: 'gelat', nombre: '4 BOLAS CONO', precio: 6.70, color: C.lila },
  { categoria: 'gelat', nombre: 'SOFT S', precio: 3.00, color: C.turquesa },
  { categoria: 'gelat', nombre: 'SOFT M', precio: 4.70, color: C.turquesa },
  { categoria: 'gelat', nombre: 'SOFT L', precio: 5.70, color: C.turquesa },
  { categoria: 'gelat', nombre: 'SOFT XL', precio: 6.70, color: C.turquesa },
  { categoria: 'gelat', nombre: '1 BOLA TARRINA', precio: 3.00, color: C.amarillo },
  { categoria: 'gelat', nombre: '2 BOLAS TARRINA', precio: 4.70, color: C.amarillo },
  { categoria: 'gelat', nombre: '3 BOLAS TARRINA', precio: 5.70, color: C.amarillo },
  { categoria: 'gelat', nombre: '4 BOLAS TARRINA', precio: 6.70, color: C.amarillo },
  { categoria: 'gelat', nombre: 'DANES 2 BOLAS', precio: 5.50, color: C.verde },
  { categoria: 'gelat', nombre: 'DANES 3 BOLAS', precio: 6.50, color: C.verde },
  { categoria: 'gelat', nombre: 'POREX 1/2', precio: 9.00, color: C.morado },
  { categoria: 'gelat', nombre: 'POREX 1 L', precio: 18.00, color: C.morado },
  { categoria: 'gelat', nombre: '1 BOLA CONO EXTRA', precio: 3.50, color: C.magenta },
  { categoria: 'gelat', nombre: '2 BOLAS CONO EXTRA', precio: 5.00, color: C.magenta },
  { categoria: 'gelat', nombre: '3 BOLAS CONO EXTRA', precio: 6.00, color: C.magenta },
  { categoria: 'gelat', nombre: 'crocanti soft S', precio: 3.50, color: C.oliva },
  { categoria: 'gelat', nombre: 'crocanti soft M', precio: 5.00, color: C.oliva },
  { categoria: 'gelat', nombre: 'SOFT XOCO BERRY', precio: 5.50, color: C.blanco },
  { categoria: 'gelat', nombre: 'Topping', precio: 0.50, color: C.rojo },

  // ===== GRANITZAT =====
  { categoria: 'granitzat', nombre: 'GRANITZAT S', precio: 2.50, color: C.azul },
  { categoria: 'granitzat', nombre: 'GRANITZAT M', precio: 3.50, color: C.azul },
  { categoria: 'granitzat', nombre: 'GRANITZAT L', precio: 4.50, color: C.azul },
  { categoria: 'granitzat', nombre: 'YARDA', precio: 5.50, color: C.morado },
  { categoria: 'granitzat', nombre: 'yarda batut', precio: 6.50, color: C.blanco },
  { categoria: 'granitzat', nombre: 'YARDA SOLA', precio: 4.50, color: C.azul },
  { categoria: 'granitzat', nombre: 'MILKSHAKE/SMOOTHIE YARDA', precio: 6.90, color: C.rojo },
  { categoria: 'granitzat', nombre: 'BUBBLE TEA', precio: 5.50, color: C.rojo },
  { categoria: 'granitzat', nombre: 'HORCHATA S', precio: 3.50, color: C.amarillo },
  { categoria: 'granitzat', nombre: 'HORCHATA M', precio: 4.50, color: C.amarillo },
  { categoria: 'granitzat', nombre: 'HORCHATA L', precio: 5.50, color: C.amarillo },
  { categoria: 'granitzat', nombre: 'HORCHATA 1L', precio: 8.00, color: C.magenta },
  { categoria: 'granitzat', nombre: 'Cubano horchata M', precio: 5.50, color: C.blanco },
  { categoria: 'granitzat', nombre: 'Cubano horchata L', precio: 6.50, color: C.blanco },
  { categoria: 'granitzat', nombre: 'CANARIO S', precio: 3.00, color: C.naranja },
  { categoria: 'granitzat', nombre: 'CANARIO M', precio: 4.00, color: C.naranja },
  { categoria: 'granitzat', nombre: 'CANARIO L', precio: 5.00, color: C.naranja },

  // ===== MILKSHAKE =====
  { categoria: 'milkshake', nombre: 'MILK SHAKE 2 BOLAS', precio: 5.50, color: C.rojo },
  { categoria: 'milkshake', nombre: 'MILK SHAKE 3 BOLAS', precio: 6.90, color: C.rojo },
  { categoria: 'milkshake', nombre: 'SMOOT 2 BOLAS', precio: 5.50, color: C.turquesa },
  { categoria: 'milkshake', nombre: 'SMOOT 3 bolas', precio: 6.90, color: C.turquesa },
  { categoria: 'milkshake', nombre: 'FRAPPE', precio: 5.50, color: C.morado },

  // ===== CREPES =====
  { categoria: 'crepes', nombre: 'CREPE 1 TOPPING', precio: 4.00, color: C.naranja },
  { categoria: 'crepes', nombre: 'CREPE 2 TOPPING', precio: 4.50, color: C.naranja },
  { categoria: 'crepes', nombre: 'CREPE 3 TOPPING', precio: 5.00, color: C.naranja },
  { categoria: 'crepes', nombre: 'CREPE GELAT', precio: 5.90, color: C.magenta },
  { categoria: 'crepes', nombre: 'CREPE EXTRA TOPPING', precio: 0.50, color: C.blanco },

  // ===== GOFRES =====
  { categoria: 'gofres', nombre: 'GOFRE 1 TOPPING', precio: 4.50, color: C.verdelima },
  { categoria: 'gofres', nombre: 'GOFRE 2 TOPPING', precio: 5.00, color: C.verdelima },
  { categoria: 'gofres', nombre: 'GOFRE 3 TOPPING', precio: 5.50, color: C.verdelima },
  { categoria: 'gofres', nombre: 'GOFRE GELAT', precio: 6.50, color: C.turquesa },
  { categoria: 'gofres', nombre: 'GOFRE EXTRA topping', precio: 0.50, color: C.blanco },

  // ===== BEGUDES =====
  { categoria: 'begudes', nombre: 'AIGUA PETITA', precio: 1.50, color: C.turquesa },
  { categoria: 'begudes', nombre: 'AIGUA GRAN', precio: 2.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'COCACOLA LLAUNA', precio: 2.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'FANTA LLAUNA', precio: 2.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'AQUARIUS LLAUNA', precio: 2.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'AIGUA AMB GAS', precio: 2.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'RED BULL', precio: 3.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'NESTEA LLAUNA', precio: 2.00, color: C.turquesa },
  { categoria: 'begudes', nombre: 'cerveza', precio: 2.50, color: C.turquesa },

  // ===== EXTRAS =====
  { categoria: 'extras', nombre: 'NATA', precio: 1.00, color: C.blanco },
  { categoria: 'extras', nombre: 'TOPPING', precio: 0.50, color: C.blanco },
  { categoria: 'extras', nombre: '1 BOLA', precio: 2.00, color: C.blanco },
  { categoria: 'extras', nombre: 'TRUFAS', precio: 1.00, color: C.blanco },

  // ===== POLOS =====
  { categoria: 'polos', nombre: 'FRUITA', precio: 3.00, color: C.blanco },
  { categoria: 'polos', nombre: 'MAGNUM', precio: 3.50, color: C.blanco },

  // ===== CAFÉ =====
  { categoria: 'cafe', nombre: 'CAFÉ SOL', precio: 1.50, color: C.cafe },
  { categoria: 'cafe', nombre: 'CAFÉ AMB LLET', precio: 2.00, color: C.cafe },
  { categoria: 'cafe', nombre: 'AMERICANO', precio: 2.50, color: C.cafe },
  { categoria: 'cafe', nombre: 'cortado', precio: 1.50, color: C.cafe },

  // ===== TAXI =====
  { categoria: 'taxi', nombre: 'AIGUA PETITA', precio: 0.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'AIGUA GRAN', precio: 1.00, color: C.turquesa },
  { categoria: 'taxi', nombre: 'COCACOLA LLAUNA', precio: 1.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'FANTA LLAUNA', precio: 1.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'AQUARIUS LLAUNA', precio: 1.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'AIGUA AMB GAS', precio: 1.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'NESTEA LLAUNA', precio: 1.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'RED BULL', precio: 2.50, color: C.turquesa },
  { categoria: 'taxi', nombre: 'cerveza', precio: 2.00, color: C.turquesa },
];

module.exports = { CATEGORIAS, PRODUCTOS };
