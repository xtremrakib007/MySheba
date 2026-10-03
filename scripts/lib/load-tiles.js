'use strict';
/**
 * serviceTiles.js as a plain module.
 *
 * It is ESM with no React in it, so stripping the export keywords is enough to
 * run it - and running it beats pattern-matching its source, which is how a
 * list can pass a test while rendering nothing.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'serviceTiles.js'), 'utf8')
  .replace(/^export (const|function) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?$/gm, '');

const mod = {};
new Function('module', 'exports', `${src}
module.exports = {
  TILE_CATEGORIES, groupTilesByCategory, categoryMeta,
  CUSTOMER_SERVICES, STAFF_SERVICES, STAFF_CAPABILITY_TILES, STAFF_ROLES,
  servicesForRole, visibleTiles, overflowTiles, withWebviewConfig, gridKeyFor,
};`)(mod, {});

module.exports = mod.exports;
