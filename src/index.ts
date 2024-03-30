import "dotenv/config";
import { log } from "./utils/log";
import Nomland, { TelegramGroup, TelegramUser, makeAccount } from "nomland.js";

import {
    getReplyToMsgId,
    processShareMsg,
    helpInfoInGroup,
    isAdmin,
    mentions,
    makeMsgLink,
} from "./utils/telegram";
import { Bot, CommandContext, Context } from "grammy";
import { helpMsg } from "./utils/constants";
import {
    getChannelPosterAccount,
    getContext,
    getFirstUrl,
    getMessageId,
    getMsgOrigin,
    getMsgText,
    getNoteAttachments,
    getNoteKey,
    getPosterAccount,
} from "./utils/common";
import { settings } from "./config";
import {
    ChatMemberAdministrator,
    ChatMemberOwner,
    Message,
} from "grammy/types";
import { addKeyValue, loadKeyValuePairs } from "./utils/keyValueStore";

async function main() {
    try {
        const botToken = process.env["BOT_TOKEN"] || "";
        const appKey = (process.env.APP_ADMIN || "0x0") as `0x${string}`;
        const bot = new Bot(botToken);
        await bot.init();

        const botUsername = bot.botInfo.username;

        console.log("Bot username: ", botUsername);

        const nomland = new Nomland(settings.appName, appKey);
        console.log(nomland.getConfig().botConfig);

        const idMap = new Map<string, string>();
        loadKeyValuePairs(idMap, settings.idMapTblName);

        const contextMap = new Map<string, string>();
        loadKeyValuePairs(contextMap, settings.contextMapTblName);

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

        // Share will be processed in the following cases:
        // 1. It's a channel broadcast message and contains a URL.
        // 2. It's not a channel message and it's a reply to a channel broadcast
        //      2.1 The reply message contains URL: the URL will be processed as share.
        // 3. It's not a channel message and it's not a reply to a channel broadcast
        //      3.1 @Bot && URL: when a message contains both @Bot and URL, the URL will be processed as share, no matter if the message is a reply.
        //      3.2 @Bot && !URL: when a message contains @Bot but no URL, the message will be processed as curation if the original message contains URL and !@Bot:
        //          a. The author of the two messages are the same: the original message will be processed as curation. // TODO
        //          b. The author of the two messages are different: the URL and the content of the reply message will be processed as curation, and the curator will be the author of the reply message.
        //      3.3. @Bot && not covered by 1 and 2: /help

        bot.on("message", async (ctx) => {
            const msg = ctx.msg;
            if (getMsgOrigin(msg) === "private") {
                ctx.reply(helpMsg(botUsername, "dm"));
                return;
            }

            if (getMsgOrigin(msg) === "channel") {
                const admins = await bot.api.getChatAdministrators(
                    msg.sender_chat!.id
                );
                processShareInChannel(
                    ctx as any,
                    nomland,
                    bot,
                    idMap,
                    contextMap,
                    admins
                );
            } else {
                if (mentions(msg, botUsername)) {
                    // TODO: only the first file will be processed, caused by Telegram design
                    processShareInGroup(
                        ctx as any,
                        nomland,
                        bot,
                        idMap,
                        contextMap
                    );
                } else if (msg.reply_to_message) {
                    processReply(ctx as any, nomland, bot, idMap, contextMap);
                }
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
                    const res = await parseRecord(url, "elephant");
                    console.log(res);
                }
            }
        });
        // */

        bot.start();
        log.info("🎉 Bot is up and running.");
    } catch (error) {
        log.error("🚨 Error starting bot.");
        log.error(error);
    }
}

// @Bot will trigger processing share in group
async function processShareInGroup(
    ctx: CommandContext<Context>,
    nomland: Nomland,
    bot: Bot,
    idMap: Map<string, string>,
    ctxMap: Map<string, string>
) {
    try {
        const msg = ctx.msg;

        const msgText = getMsgText(msg);
        if (!msgText) return;

        const url = getFirstUrl(msgText);

        let notRecognized = true;

        if (url) {
            // Scenario 1: the message itself is a share
            const author = await getPosterAccount(ctx, bot, nomland);
            if (author) {
                processShareMsg(ctx, author, idMap, ctxMap, nomland, url, bot);
                notRecognized = false;
            }
        } else {
            // Scenario 2: the reply to message is a share
            const replyToMsg = msg.reply_to_message;
            if (replyToMsg) {
                const replyToMsgText = getMsgText(replyToMsg as Message);
                if (replyToMsgText && replyToMsg.from) {
                    const replyToMsgUrl = getFirstUrl(replyToMsgText);
                    if (replyToMsgUrl) {
                        const author = await getPosterAccount(
                            ctx,
                            bot,
                            nomland
                        );
                        if (author) {
                            processShareMsg(
                                ctx,
                                author,
                                idMap,
                                ctxMap,
                                nomland,
                                replyToMsgUrl,
                                bot
                            );
                            notRecognized = false;
                        }
                    }
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

// Channel broadcast message will trigger processing share in channel
async function processShareInChannel(
    ctx: CommandContext<Context>,
    nomland: Nomland,
    bot: Bot,
    idMap: Map<string, string>,
    ctxMap: Map<string, string>,
    channelAdmins: (ChatMemberOwner | ChatMemberAdministrator)[]
) {
    try {
        const msg = ctx.msg;

        const msgText = getMsgText(msg);
        if (!msgText) return;

        // TODO: multiple urls
        const url = getFirstUrl(msgText);
        // TODO: filter url

        if (url) {
            const author = channelAdmins.find((admin) =>
                admin.user.last_name
                    ? admin.user.first_name + " " + admin.user.last_name
                    : admin.user.first_name === msg.forward_signature
            )?.user;
            if (!author) {
                log.warn("Author not found: ", msg);
                return;
            }
            const authorAccount = await getChannelPosterAccount(
                ctx,
                author,
                bot,
                nomland
            );
            console.log("Author account: ", authorAccount);
            if (authorAccount) {
                processShareMsg(
                    ctx,
                    authorAccount,
                    idMap,
                    ctxMap,
                    nomland,
                    url,
                    bot
                );
            }
        }
    } catch (e) {
        console.log(e);
    }
}

async function processReply(
    ctx: CommandContext<Context>,
    nomland: Nomland,
    bot: Bot,
    idMap: Map<string, string>,
    ctxMap: Map<string, string>
) {
    const msg = ctx.msg;

    const context = getContext(msg, ctxMap);
    if (!context) return;

    const msgText = getMsgText(msg);
    if (!msgText) return;

    // if the original msg is a share, then the reply msg will be processed as reply
    const replyToPostId = getReplyToMsgId(msg, idMap);
    if (!replyToPostId) return;

    console.log("Prepare to process reply...", replyToPostId);

    const poster = await getPosterAccount(ctx, bot, nomland);
    if (!poster) return;

    const attachments = await getNoteAttachments(ctx, msg, bot.token);

    const { characterId, noteId } = await nomland.createReply(
        poster,
        context,
        {
            content: msgText,
            attachments,
        },
        getNoteKey(replyToPostId)
    );

    const msgId = getMessageId(msg);

    const postId = characterId.toString() + "-" + noteId.toString();

    if (addKeyValue(msgId, postId, settings.idMapTblName)) {
        idMap.set(msgId, postId);
    }
}

main();
