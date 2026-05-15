
import { webCommand } from "./src/bot/commands/opencli.ts";

// Mock context for testing
const mockCtx = {
  match: "google search 台北 美食",
  reply: async (text: string) => {
    console.log("BOT REPLY:", text);
  },
  answerCallbackQuery: async () => {},
};

console.log("Testing webCommand with multi-word search...");
webCommand(mockCtx as any).then(() => {
  console.log("Test finished.");
}).catch(err => {
  console.error("Test failed:", err);
});
