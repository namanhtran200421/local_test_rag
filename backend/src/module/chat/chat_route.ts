import { Router } from "express";
import { postChat } from "./chat_controller.js";

export const chatRouter = Router();
chatRouter.post("/chat", postChat);
