export const SIZE = 9 as const;
export const BOX = 3 as const;
export const DIGITS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const toBoxIndex = (r: number, c: number) =>
  Math.floor(r / BOX) * BOX + Math.floor(c / BOX);

export const keyOf = (r: number, c: number) => `${r},${c}`;
