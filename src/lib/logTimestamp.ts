// Returns a compact HH:MM:SS.mmm timestamp string for prefixing log lines.
// Slicing the ISO string avoids locale-specific Date formatting and stays fast.
export const ts = (): string => new Date().toISOString().slice(11, 23)
