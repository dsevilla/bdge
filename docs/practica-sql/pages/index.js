/*
 * Catálogo de páginas disponibles en la práctica.
 * Para añadir una página, crea otro módulo en esta carpeta e impórtalo aquí.
 * El motor compartido está en ../app.js; las páginas solo declaran contenido.
 */
import { page as sesion1 } from "./sesion1.js";
import { page as sesion2 } from "./sesion2.js";

export const PRACTICE_PAGES = [sesion1, sesion2];
