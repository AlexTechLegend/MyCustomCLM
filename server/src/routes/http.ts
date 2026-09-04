import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { AuthedRequest } from '../services/auth.js';

export type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  try {
    Promise.resolve(fn(req, res)).catch(next);
  } catch (err) {
    next(err);
  }
};

export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* comma separated */
    }
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

export function actorId(req: Request): string | null {
  return (req as AuthedRequest).user?.id ?? null;
}

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 12 } });
