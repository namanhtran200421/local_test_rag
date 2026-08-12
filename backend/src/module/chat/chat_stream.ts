import type { Request, Response } from "express";
import type { ChatProgressUpdate, ChatResponse } from "./chat_type.js";

export interface StreamError {
  status: number;
  error: string;
  message: string;
}

export function acceptsProgressStream(req: Request): boolean {
  return req.header("accept")?.toLocaleLowerCase().includes("application/x-ndjson") ?? false;
}

export function startProgressStream(res: Response): () => void {
  res.status(200);
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("x-accel-buffering", "no");
  res.flushHeaders();

  const heartbeat = setInterval(() => writeEvent(res, { type: "heartbeat" }), 15_000);
  return () => clearInterval(heartbeat);
}

export function writeProgress(res: Response, update: ChatProgressUpdate): void {
  writeEvent(res, { type: "progress", ...update });
}

export function writeResult(res: Response, data: ChatResponse): void {
  writeEvent(res, { type: "result", data });
}

export function writeStreamError(res: Response, error: StreamError): void {
  writeEvent(res, { type: "error", ...error });
}

function writeEvent(res: Response, event: object): void {
  if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
}
