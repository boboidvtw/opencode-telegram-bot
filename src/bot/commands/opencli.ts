import { CommandContext, Context, InputFile } from "grammy";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

/**
 * Handler for /screenshot command
 * Takes a screenshot of the current browser tab via OpenCLI
 */
export async function screenshotCommand(ctx: CommandContext<Context>) {
  let tempPath: string | null = null;
  try {
    const statusMsg = await ctx.reply("📸 " + t("bot.executing_web"));
    
    tempPath = path.join(process.cwd(), `screenshot_${Date.now()}.png`);
    
    // Execute opencli screenshot
    await execAsync(`opencli operate screenshot "${tempPath}"`);

    if (fs.existsSync(tempPath)) {
      await ctx.replyWithPhoto(new InputFile(tempPath), {
        caption: t("bot.screenshot_success")
      });
      
      // Try to delete the status message
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    } else {
      throw new Error("Screenshot file was not generated");
    }
  } catch (err) {
    logger.error("[OpenCLI] Screenshot error:", err);
    await ctx.reply(t("bot.screenshot_error") + (err instanceof Error ? `\n\nError: ${err.message}` : ""));
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        logger.warn("[OpenCLI] Failed to cleanup temp screenshot:", e);
      }
    }
  }
}

/**
 * Helper to split a command string into arguments as the shell would,
 * respecting single and double quotes.
 */
function parseArgs(input: string): string[] {
  const args: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    // 0: full match, 1: double-quoted, 2: single-quoted
    args.push(match[1] || match[2] || match[0]);
  }

  return args;
}

/**
 * Handler for /web command
 * Pass-through any OpenCLI command with intelligent argument handling
 */
export async function webCommand(ctx: CommandContext<Context>) {
  const rawArgs = ctx.match;
  if (!rawArgs) {
    await ctx.reply("💡 Usage: `/web <command>`\nExample: `/web google search 台北 美食`", { parse_mode: "Markdown" });
    return;
  }

  try {
    const parts = parseArgs(rawArgs);
    
    // Auto-fix for common 'search' commands without quotes
    // e.g. ["google", "search", "台北", "美食"] -> ["google", "search", "台北 美食"]
    if (parts.length > 3 && parts[1] === "search" && !rawArgs.includes('"') && !rawArgs.includes("'")) {
      const site = parts[0];
      const action = parts[1];
      const query = parts.slice(2).join(" ");
      parts.splice(0, parts.length, site, action, query);
    }
    
    await ctx.reply(t("bot.executing_web"));
    
    // Re-construct quoted command for exec
    const cmdStr = parts.map(p => `"${p.replace(/"/g, '\\"')}"`).join(" ");
    
    logger.debug(`[OpenCLI] Executing: opencli ${cmdStr}`);
    
    const { stdout, stderr } = await execAsync(`opencli ${cmdStr}`, { timeout: 30000 });
    
    const output = stdout || stderr;
    if (output) {
      const result = output.length > 3900 ? output.slice(0, 3900) + "\n... (truncated)" : output;
      // Using plain text code block avoids complex MarkdownV2 escaping issues
      await ctx.reply(`\`\`\`\n${result}\n\`\`\``);
    } else {
      await ctx.reply("✅ Command executed (no output)");
    }
  } catch (err) {
    logger.error("[OpenCLI] Web command error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`${t("bot.web_error")}\n\n\`\`\`\n${msg}\n\`\`\``);
  }
}
