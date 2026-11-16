/**
 * Nombre del producto en la interfaz. El nombre oficial lo define la Prefectura;
 * los identificadores internos (schema `geriam`, prefijos de recursos, clases CSS)
 * no cambian con él.
 */
export const APP_NAME = "Sistema de Alerta Temprana Embalses Tungurahua";
/** Para el ícono de la pantalla de inicio y espacios reducidos (≈12 caracteres). */
export const APP_SHORT_NAME = "SAT Embalses";
/** Cómo se parte el nombre en el logotipo: antetítulo, nombre principal y remate. */
export const APP_NAME_LINES = { pre: "Sistema de", main: ["Alerta", "Temprana"], post: "Embalses Tungurahua" } as const;
/** Actor que figura en la bitácora para las acciones automáticas. */
export const SYSTEM_ACTOR = "Sistema de Alerta Temprana";
/** Nombres anteriores del actor automático, para mostrar bien las filas ya guardadas. */
export const LEGACY_SYSTEM_ACTORS = ["Sistema GeRiAm"];
