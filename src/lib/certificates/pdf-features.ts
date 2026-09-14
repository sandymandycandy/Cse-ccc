/**
 * OpenType features switched off on BOTH sides (spec §6.2): pdf-lib's embed
 * option here, and the matching CSS in the editor (`.cd-text`). With ligatures,
 * contextual alternates and kerning off, a glyph's advance is exactly the width
 * in metrics/*.json, so the browser and the PDF break lines identically.
 */
export const NO_FEATURES = { liga: false, clig: false, calt: false, dlig: false, kern: false };

export const NO_FEATURES_CSS =
  'font-kerning:none;font-feature-settings:"liga" 0,"clig" 0,"calt" 0,"dlig" 0,"kern" 0;font-synthesis:none';
