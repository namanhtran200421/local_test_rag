import { Router } from "express";
import { authenticateInternal } from "./internal_auth.js";
import { postInternalChat } from "./internal_controller.js";

export const internalRouter = Router();
internalRouter.use(authenticateInternal);
internalRouter.post("/chat", postInternalChat);
