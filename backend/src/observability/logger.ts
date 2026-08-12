type Level = "debug" | "info" | "warn" | "error";

const priorities: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const configured = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  if (priorities[level] < priorities[configured]) return;
  const record = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}
