import "dotenv/config";
import { log } from "./utils/log";
import Nomland from "nomland.js";

import {
    handleEvent,
    helpInfoInGroup,
    isAdmin,
    makeMsgLink,
    mentions,
} from "./utils/telegram";
import { Bot } from "grammy";
import { helpMsg } from "./utils/constants";
import { getFirstUrl } from "./utils/common";
import { processCuration } from "./utils/nomland";
import { makeAccount } from "nomland.js";

async function main() {
    try {
        const botToken = process.env["BOT_TOKEN"] || "";
        const appKey = (process.env.APP_ADMIN || "0x0") as `0x${string}`;
        const bot = new Bot(botToken);
        await bot.init();
        const botUsername = bot.botInfo.username;

        const nomland = new Nomland("nunti-tg", appKey);
        console.log(nomland.getConfig().botConfig);

        bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));
        bot.command("help", async (ctx) => {
            const inDM = ctx.msg.chat.type === "private";
            if (inDM) {
                ctx.reply(helpMsg(botUsername, "dm"));
            } else {
                const fromMsg = ctx.msg;
                const helpMsg = await helpInfoInGroup(bot, fromMsg);
                ctx.reply(helpMsg);

                const botId = bot.botInfo.id;
                const botHasAdmin = await isAdmin(bot, fromMsg.chat.id, botId);
                if (!botHasAdmin) {
                    return "But first of all I need to be prompted as an admin so that I can start to work!";
                }
                if (ctx.msg.chat.type === "private") {
                    return "Sorry but private chat hasn't been supported yet.";
                }
            }
        });

        // Curation will be processed in the following cases:
        // 1. @Bot && URL: when a message contains both @Bot and URL, the URL will be processed as curation, no matter if the message is a reply.
        // 2. @Bot && !URL: when a message contains @Bot but no URL, the message will be processed as curation if the original message contains URL and !@Bot:
        //    a. The author of the two messages are the same: the original message will be processed as curation.
        //    b. The author of the two messages are different: the URL and the content of the reply message will be processed as curation, and the curator will be the author of the reply message.
        // 3. @Bot && not covered by 1 and 2: /help
        bot.on("message:entities:mention", async (ctx) => {
            const msg = ctx.msg;
            console.log(msg);
            if (msg.chat.type === "private") {
                return;
            }

            const community = makeAccount(msg.chat);

            if (mentions(msg, botUsername)) {
                const url = getFirstUrl(msg.text);
                let notRecognized = true;

                if (url) {
                    // Scenario 1
                    // const res = await parseRecord(url, "elephant");
                    // console.log(res);
                    handleEvent(ctx, msg, processCuration, [
                        nomland,
                        url,
                        msg,
                        community,
                        botUsername,
                        "elephant",
                    ]);

                    notRecognized = false;
                } else {
                    // Scenario 2
                    const replyToMsg = msg.reply_to_message;
                    if (replyToMsg && replyToMsg.text && replyToMsg.from) {
                        const replyToMsgUrl = getFirstUrl(replyToMsg.text);
                        if (replyToMsgUrl) {
                            if (replyToMsg.from.id === msg.from.id) {
                                // Scenario 2.a
                                handleEvent(ctx, msg, processCuration, [
                                    nomland,
                                    replyToMsgUrl,
                                    replyToMsg,
                                    community,
                                    botUsername,
                                    "elephant",
                                ]);
                            } else {
                                // Scenario 2.b
                                handleEvent(ctx, msg, processCuration, [
                                    nomland,
                                    replyToMsgUrl,
                                    msg,
                                    community,
                                    botUsername,
                                    "elephant",
                                ]);
                            }
                            await ctx.reply(
                                "TODO: Processing curation @Bot && !URL && same author..."
                            );
                            notRecognized = false;
                        }
                    }
                }

                if (notRecognized) {
                    const helpMsg = await helpInfoInGroup(bot, ctx.msg);
                    ctx.reply(helpMsg);
                }
            }
        });

        bot.start();
        log.info("🎉 Bot is up and running.");
    } catch (error) {
        log.error("🚨 Error starting bot.");
        log.error(error);
    }
}

main();
