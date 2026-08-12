import { Router } from "express";
import { currentSession, login, logout } from "./auth_controller.js";

export const authRouter = Router();
authRouter.get("/me", currentSession);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
