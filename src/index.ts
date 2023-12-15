import "dotenv/config";
import { log } from "./utils/log";
import Nomland, { parseRecord } from "nomland.js";

import {
    handleEvent,
    helpInfoInGroup,
    isAdmin,
    mentions,
} from "./utils/telegram";
import { Bot, CommandContext, Context } from "grammy";
import { helpMsg } from "./utils/constants";
import {
    getCommunity,
    getFirstUrl,
    getMessageId,
    getMsgText,
    getNoteAttachments,
    getPosterAccount,
} from "./utils/common";
import { settings } from "./config";
import { Message } from "grammy/types";
import { addKeyValue, loadKeyValuePairs } from "./utils/keyValueStore";

async function main() {
    try {
        const botToken = process.env["BOT_TOKEN"] || "";
        const appKey = (process.env.APP_ADMIN || "0x0") as `0x${string}`;
        const bot = new Bot(botToken);
        await bot.init();

        const botUsername = bot.botInfo.username;

        const nomland = new Nomland(settings.appName, appKey);
        console.log(nomland.getConfig().botConfig);

        const idMap = new Map<string, string>();
        loadKeyValuePairs(idMap, settings.idMapTblName);

        bot.command("help", async (ctx) => {
            const inDM = ctx.msg.chat.type === "private";
            if (inDM) {
                ctx.reply(helpMsg(botUsername, "dm"));
            } else {
                const fromMsg = ctx.msg;
                const helpMsg = await helpInfoInGroup(bot, fromMsg);
                ctx.reply(helpMsg, {
                    reply_to_message_id: fromMsg.message_id,
                });

                const botId = bot.botInfo.id;
                const botHasAdmin = await isAdmin(bot, fromMsg.chat.id, botId);
                if (!botHasAdmin) {
                    ctx.reply(
                        "But first of all I need to be prompted as an admin so that I can start to work!",
                        {
                            reply_to_message_id: fromMsg.message_id,
                        }
                    );
                }
                if (ctx.msg.chat.type === "private") {
                    ctx.reply(
                        "Sorry but private chat hasn't been supported yet.",
                        {
                            reply_to_message_id: fromMsg.message_id,
                        }
                    );
                }
            }
        });

        // Curation will be processed in the following cases:
        // 1. @Bot && URL: when a message contains both @Bot and URL, the URL will be processed as curation, no matter if the message is a reply.
        // 2. @Bot && !URL: when a message contains @Bot but no URL, the message will be processed as curation if the original message contains URL and !@Bot:
        //    a. The author of the two messages are the same: the original message will be processed as curation. // TODO
        //    b. The author of the two messages are different: the URL and the content of the reply message will be processed as curation, and the curator will be the author of the reply message.
        // 3. @Bot && not covered by 1 and 2: /help
        bot.on("message", async (ctx) => {
            const msg = ctx.msg;

            if (mentions(msg, botUsername)) {
                // TODO: only the first file will be processed, caused by Telegram design
                processCurationMessage(ctx as any, nomland, bot, idMap);
            } else if (msg.reply_to_message) {
                processDiscussionMessage(ctx as any, nomland, bot, idMap);
            }
        });

        /* DEBUG
        bot.on("msg::url", async (ctx) => {
            // const profiles = await ctx.getUserProfilePhotos();
            // console.log(profiles.photos);
            // bot.api.getFile(ctx.msg.photo[0].file_id).then((res) => {
            // https://stackoverflow.com/a/32679930

            if (ctx.msg.text) {
                const url = getFirstUrl(ctx.msg.text);
                if (url) {
                    const res = await parseRecord(url, "extractus");
                    console.log(res);
                }
            }
        });
        */

        bot.start();
        log.info("🎉 Bot is up and running.");
    } catch (error) {
        log.error("🚨 Error starting bot.");
        log.error(error);
    }
}

async function processCurationMessage(
    ctx: CommandContext<Context>,
    nomland: Nomland,
    bot: Bot,
    idMap: Map<string, string>
) {
    try {
        const msg = ctx.msg;

        const msgText = getMsgText(msg);
        if (!msgText) return;

        const url = getFirstUrl(msgText);

        let notRecognized = true;

        if (url) {
            // Scenario 1
            handleEvent(ctx, idMap, nomland, url, bot);

            notRecognized = false;
        } else {
            // Scenario 2
            const replyToMsg = msg.reply_to_message;

            const replyToMsgText = getMsgText(replyToMsg as Message);

            if (replyToMsg && replyToMsgText && replyToMsg.from) {
                const replyToMsgUrl = getFirstUrl(replyToMsgText);
                if (replyToMsgUrl) {
                    handleEvent(ctx, idMap, nomland, replyToMsgUrl, bot);

                    notRecognized = false;
                }
            }
        }

        if (notRecognized) {
            const helpMsg = await helpInfoInGroup(bot, ctx.msg);
            ctx.reply(helpMsg, {
                reply_to_message_id: msg.message_id,
            });
        }
    } catch (e) {
        console.log(e);
    }
}

async function processDiscussionMessage(
    ctx: CommandContext<Context>,
    nomland: Nomland,
    bot: Bot,
    idMap: Map<string, string>
) {
    const msg = ctx.msg;
    const reply_to_message = msg.reply_to_message;
    if (!reply_to_message || !msg.from) return;

    const community = getCommunity(msg);
    if (!community) return;

    const msgText = getMsgText(msg);
    if (!msgText) return;

    // if the original msg is a curation, then the reply msg will be processed as discussion
    const replyToMsgId = getMessageId(reply_to_message);
    if (!replyToMsgId) return;

    const replyToPostId = idMap.get(replyToMsgId);
    if (!replyToPostId) return;

    console.log("Prepare to process discussion...", replyToMsgId);

    const poster = await getPosterAccount(ctx, bot, nomland);
    if (!poster) return;

    const attachments = await getNoteAttachments(ctx, msg, bot.token);

    const { characterId, noteId } = await nomland.processDiscussion(
        poster,
        community,
        {
            content: msgText,
            attachments,
        },
        replyToPostId
    );

    const msgId = getMessageId(msg);

    const postId = characterId.toString() + "-" + noteId.toString();

    if (addKeyValue(msgId, postId, settings.idMapTblName)) {
        idMap.set(msgId, postId);
    }
}

main();
