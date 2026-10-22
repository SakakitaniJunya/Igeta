export function render(item: string, compact = false) {
  return compact ? item : item.trim();
}
