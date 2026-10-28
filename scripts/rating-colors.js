export function ratingMood(rating) {
  const value = Number(rating) || 0;
  if (value >= 4) return { color: "#8edfd4", background: "#163b39" };
  if (value >= 3) return { color: "#ffe58c", background: "#3d3726" };
  if (value > 0) return { color: "#ff9f9a", background: "#462c34" };
  return { color: "#bdb1ca", background: "#332c3b" };
}
