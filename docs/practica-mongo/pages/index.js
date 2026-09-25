/*
 * Catálogo de páginas disponibles en la práctica.
 * Para añadir una página, crea otro módulo en esta carpeta e impórtalo aquí.
 * El motor compartido está en ../app.js; las páginas solo declaran contenido.
 */
import { page as consultas } from "./consultas.js";
import { page as agregacion } from "./agregacion.js";
import { page as relaciones } from "./relaciones.js";

export const PRACTICE_PAGES = [consultas, agregacion, relaciones];
