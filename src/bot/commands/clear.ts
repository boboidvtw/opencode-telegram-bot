import { CommandContext, Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { setCurrentSession, SessionInfo } from "../../session/manager.js";
import { ingestSessionInfoForCache } from "../../session/cache-manager.js";
import { getCurrentProject } from "../../settings/manager.js";
import { clearAllInteractionState } from "../../interaction/cleanup.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { keyboardManager } from "../../keyboard/manager.js";
import { getStoredAgent } from "../../agent/manager.js";
import { getStoredModel } from "../../model/manager.js";
import { formatVariantForButton } from "../../variant/manager.js";
import { createMainKeyboard } from "../utils/keyboard.js";
import { isForegroundBusy, replyBusyBlocked } from "../utils/busy-guard.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";

/**
 * Clear command: Resets the session context by creating a new one.
 * Is effectively a shortcut for /new but with "clear" semantics for the user.
 */
export async function clearCommand(ctx: CommandContext<Context>) {
  try {
    if (isForegroundBusy()) {
      await replyBusyBlocked(ctx);
      return;
    }

    const currentProject = getCurrentProject();

    if (!currentProject) {
      await ctx.reply(t("new.project_not_selected"));
      return;
    }

    logger.info(`[Bot] Clearing conversation for project: ${currentProject.name}`);

    // Create a new session in OpenCode
    const { data: session, error } = await opencodeClient.session.create({
      directory: currentProject.worktree,
    });

    if (error || !session) {
      throw error || new Error("No data received from server");
    }

    const sessionInfo: SessionInfo = {
      id: session.id,
      title: session.title,
      directory: currentProject.worktree,
    };
    
    // Reset all states
    setCurrentSession(sessionInfo);
    summaryAggregator.clear();
    clearAllInteractionState("conversation_cleared");
    await ingestSessionInfoForCache(session);

    // Re-initialize managers for the new session
    if (!pinnedMessageManager.isInitialized()) {
      pinnedMessageManager.initialize(ctx.api, ctx.chat.id);
    }
    keyboardManager.initialize(ctx.api, ctx.chat.id);

    try {
      // Unpin old and create new pinned message
      await pinnedMessageManager.onSessionChange(session.id, session.title);
    } catch (err) {
      logger.error("[Bot] Error updating pinned message after clear:", err);
    }

    // Get current state for keyboard
    const currentAgent = getStoredAgent();
    const currentModel = getStoredModel();
    const contextInfo = pinnedMessageManager.getContextInfo();
    const variantName = formatVariantForButton(currentModel.variant || "default");
    const keyboard = createMainKeyboard(
      currentAgent,
      currentModel,
      contextInfo ?? undefined,
      variantName,
    );

    // Notify user
    await ctx.reply(t("clear.success", { title: session.title }), {
      reply_markup: keyboard,
    });
    
    logger.info(`[Bot] Successfully cleared conversation. New session: ${session.id}`);
  } catch (error) {
    logger.error("[Bot] Error clearing conversation:", error);
    await ctx.reply(t("clear.error"));
  }
}
