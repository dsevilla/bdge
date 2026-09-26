/*
 * Catálogo de páginas disponibles en la práctica.
 * Para añadir una página, crea otro módulo en esta carpeta e impórtalo aquí.
 * El motor compartido está en ../app.js; las páginas solo declaran contenido.
 */
import { page as patrones } from "./patrones.js";
import { page as recorridos } from "./recorridos.js";
import { page as escritura } from "./escritura.js";

export const PRACTICE_PAGES = [patrones, recorridos, escritura];
