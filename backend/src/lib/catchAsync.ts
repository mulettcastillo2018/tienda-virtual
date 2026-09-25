import type { NextFunction, Request, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function catchAsync(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
