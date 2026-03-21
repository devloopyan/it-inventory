export function buildSelectChevronDataUri(color: string, size = 14) {
  const encodedColor = color.replace(/#/g, "%23");
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.25 5.5L7 9.25L10.75 5.5' stroke='${encodedColor}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
}
