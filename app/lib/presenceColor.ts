// Deterministic background color for presence avatars based on user ID.
// Uses a fixed palette so a user's color is stable across reconnects and refreshes.

const PALETTE = [
  "#e11d48", // rose-600
  "#7c3aed", // violet-600
  "#2563eb", // blue-600
  "#0891b2", // cyan-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#dc2626", // red-600
  "#9333ea", // purple-600
];

export function presenceColor(userId: number): string {
  return PALETTE[userId % PALETTE.length];
}
