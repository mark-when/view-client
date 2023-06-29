export type EventPath = number[];

export const equivalentPaths = (p1?: EventPath, p2?: EventPath): boolean => {
  if (!p1 || !p2) {
    return false;
  }
  const path1 = p1;
  const path2 = p2;

  return path1.join(",") === path2.join(",");
};
