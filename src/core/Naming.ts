/** 名前の形の検査と変換。入力はケバブ (`stock-item`) だけを受ける。 */

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const isKebab = (value: string): boolean => KEBAB_RE.test(value);

/** `stock-item` → `StockItem` */
export const toPascal = (kebab: string): string =>
  kebab
    .split('-')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** `StockItem` → `stockItem` */
export const lowerFirst = (pascal: string): string => pascal.charAt(0).toLowerCase() + pascal.slice(1);

/** `stock-item` → `stockItem` */
export const toCamel = (kebab: string): string => lowerFirst(toPascal(kebab));

/** `StockItem` → `stock-item` */
export const toKebab = (pascal: string): string =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** `stock-item` → `stock_item` */
export const toSnake = (kebab: string): string => kebab.replace(/-/g, '_');
