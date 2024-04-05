import "dotenv/config";
import { log } from "./utils/log";
import Nomland, { Accountish, NoteDetails } from "nomland.js";

import {
    getReplyToMsgId,
    processShareMsg,
    helpInfoInGroup,
    isAdmin,
    mentions,
    prepareFwdMessage,
} from "./utils/telegram";
import { Bot, CommandContext, Context } from "grammy";
import { helpMsg } from "./utils/constants";
import {
    getContext,
    getFirstUrl,
    getMessageKey,
    getMsgOrigin,
    getMsgText,
    getNoteAttachments,
    getNoteKey,
    getPosterAccount,
    getChannelBroadcastAuthorAccount,
    storeMsg,
    getKeyFromGroupMessageLink,
} from "./utils/common";
import { feedbackUrl, settings } from "./config";
import { Message } from "grammy/types";
import { addKeyValue, loadKeyValuePairs } from "./utils/keyValueStore";
import { createShare } from "./utils/nomland";

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
            const inDM = getMsgOrigin(ctx.msg) === "private";
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

        let shareParams: ShareParams | undefined;
        interface ShareParams {
            url: string;
            details: NoteDetails;
            authorAccount: Accountish;
            contextId: string;
            channelId: string;
            broadcastId: string;
            channelChatId: string;
            chatMsgId: string | null;
        }
        type ManualShareCmdStatus =
            | "START"
            | "WAIT_MSG_ID"
            | "WAIT_RPL_OPTION"
            // | "RPL_OPTION_RECEIVED"
            | "WAIT_EDIT_LINK";
        // | "EDI_MSG_ID_RECEIVED";

        let manualShareCmdStatus: ManualShareCmdStatus = "START";

        bot.on("message", async (ctx) => {
            const msg = ctx.msg;
            if (getMsgOrigin(msg) === "admin") {
                if (settings.adminCreateShareTopicId) {
                    if (
                        msg.reply_to_message?.message_id !==
                        settings.adminCreateShareTopicId
                    ) {
                        return;
                    }
                }

                const restart = () => {
                    manualShareCmdStatus = "START";
                    shareParams = undefined;
                };

                const reply = (text: string) => {
                    if (settings.adminCreateShareTopicId) {
                        ctx.reply(text, {
                            reply_to_message_id:
                                settings.adminCreateShareTopicId,
                        });
                    } else {
                        ctx.reply(text);
                    }
                };

                try {
                    if (msg.text === "restart") {
                        restart();
                        reply("Restarted.");
                    }
                    if (manualShareCmdStatus === "START") {
                        if (msg.forward_from_chat) {
                            if (msg.forward_from_chat.type != "channel") {
                                reply(
                                    "Currently only support channel broadcast message."
                                );
                                return;
                            }
                            const result = await prepareFwdMessage(
                                ctx,
                                contextMap,
                                bot,
                                nomland,
                                reply
                            );
                            if (!result) return;
                            shareParams = {
                                chatMsgId: null,
                                ...result,
                            };
                            reply(
                                "Please continue to input the chat message link of this channel broadcast."
                            );
                            manualShareCmdStatus = "WAIT_MSG_ID";
                        }
                    } else if (manualShareCmdStatus === "WAIT_MSG_ID") {
                        const msgLink = getFirstUrl(msg.text || "");
                        if (!msgLink) {
                            reply(
                                "Please continue to input the chat message link of this channel broadcast."
                            );
                            return;
                        }

                        const [chatId, chatMsgId] =
                            await getKeyFromGroupMessageLink(
                                msgLink,
                                bot,
                                reply
                            );
                        if (!chatId || !chatMsgId) {
                            reply(
                                "Please input the correct chat message link of this channel broadcast."
                            );
                            return;
                        }

                        if (shareParams?.channelChatId !== chatId) {
                            reply(
                                "Message link mismatches: Expected: " +
                                    shareParams?.channelChatId +
                                    ", but got: " +
                                    chatId +
                                    ". Please input the correct message link of this channel broadcast."
                            );
                            return;
                        }
                        const chatMsgKey =
                            shareParams.channelChatId + "-" + chatMsgId;
                        const noteKey = idMap.get(chatMsgKey);

                        if (noteKey) {
                            const url = feedbackUrl(getNoteKey(noteKey));
                            reply(
                                "This message has been processed. Link is " +
                                    url
                            );
                            restart();

                            return;
                        }
                        shareParams.chatMsgId = chatMsgId;

                        manualShareCmdStatus = "WAIT_RPL_OPTION";
                        reply(
                            "Please continue to input the reply option of this message: 1. Reply to the message; 2. Edit the message."
                        );
                    } else if (manualShareCmdStatus === "WAIT_RPL_OPTION") {
                        const option = msg.text;
                        if (option === "1") {
                            if (!shareParams) {
                                reply("Internal Error. Please try again.");
                                restart();

                                return;
                            }

                            const shareNoteKey = await createShare(
                                nomland,
                                shareParams.url,
                                shareParams.details,
                                shareParams.authorAccount,
                                shareParams.contextId,
                                null, // TODO: manually set one?
                                "elephant"
                            );

                            if (shareNoteKey) {
                                storeMsg(
                                    idMap,
                                    shareParams.channelChatId +
                                        "-" +
                                        shareParams.chatMsgId,
                                    shareNoteKey
                                );
                                ctx.api.sendMessage(
                                    "-100" + shareParams.channelChatId,
                                    settings.prompt.channelSucceed(
                                        shareNoteKey
                                    ),
                                    {
                                        reply_to_message_id: Number(
                                            shareParams.chatMsgId
                                        ),
                                        parse_mode: "HTML",
                                    }
                                );
                            } else {
                                reply("Fail to process.");
                            }

                            manualShareCmdStatus = "START";
                            shareParams = undefined;
                        } else if (option === "2") {
                            manualShareCmdStatus = "WAIT_EDIT_LINK";
                            reply(
                                "Please continue to input the link of the message that you want to edit."
                            );
                        } else {
                            reply(
                                "Please input the correct option: 1. Reply to the message; 2. Edit the message."
                            );
                        }
                    } else if (manualShareCmdStatus === "WAIT_EDIT_LINK") {
                        const msgLink = getFirstUrl(msg.text || "");
                        if (!shareParams) {
                            reply("Internal Error. Please try again.");
                            restart();
                            return;
                        }

                        if (!msgLink) {
                            reply(
                                "Please continue to input the link of the message that you want to edit."
                            );
                            return;
                        }

                        const [chatId, chatMsgId] =
                            await getKeyFromGroupMessageLink(
                                msgLink,
                                bot,
                                reply
                            );

                        if (!chatId || !chatMsgId) {
                            reply(
                                "Please input the correct link of the message you want to edit."
                            );
                            return;
                        }

                        if (shareParams.channelChatId !== chatId) {
                            reply(
                                "Chat Id mismatches. Please input the correct link of the message you want to edit."
                            );
                            return;
                        }
                        manualShareCmdStatus = "START";

                        const shareNoteKey = await createShare(
                            nomland,
                            shareParams.url,
                            shareParams.details,
                            shareParams.authorAccount,
                            shareParams.contextId,
                            null, // TODO: manually set one?
                            "elephant"
                        );

                        if (shareNoteKey) {
                            storeMsg(
                                idMap,
                                shareParams.channelChatId +
                                    "-" +
                                    shareParams.chatMsgId,
                                shareNoteKey
                            );

                            ctx.api.editMessageText(
                                "-100" + chatId,
                                Number(chatMsgId),
                                settings.prompt.channelSucceed(shareNoteKey),
                                {
                                    parse_mode: "HTML",
                                }
                            );
                        } else {
                            reply("Fail to process.");
                        }
                    }
                } catch (e) {
                    console.log("Something went wrong.");
                    console.log(e);
                }
            }

            if (getMsgOrigin(msg) === "private") {
                ctx.reply(helpMsg(botUsername, "dm"));
                return;
            }

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
            if (getMsgOrigin(msg) === "channel") {
                processShareInChannel(
                    ctx as any,
                    nomland,
                    bot,
                    idMap,
                    contextMap
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
        if (!msg.from) return;

        const msgText = getMsgText(msg);
        if (!msgText) return;

        const url = getFirstUrl(msgText);

        let notRecognized = true;

        if (url) {
            // Scenario 1: the message itself is a share
            const author = await getPosterAccount(msg.from, bot, ctx, nomland);
            if (author) {
                processShareMsg(
                    ctx,
                    author,
                    idMap,
                    ctxMap,
                    nomland,
                    url,
                    bot,
                    "group"
                );
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
                            msg.from,
                            bot,
                            ctx,
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
                                bot,
                                "group"
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
    ctxMap: Map<string, string>
) {
    try {
        const msg = ctx.msg;

        if (!msg.forward_signature) return;
        if (!msg.sender_chat?.id) return;

        const msgText = getMsgText(msg);
        if (!msgText) return;

        // TODO: multiple urls
        const url = getFirstUrl(msgText);
        // TODO: filter url

        if (url) {
            const authorAccount = await getChannelBroadcastAuthorAccount(
                msg.sender_chat.id,
                msg.forward_signature,
                bot,
                ctx,
                nomland
            );
            if (authorAccount) {
                processShareMsg(
                    ctx,
                    authorAccount,
                    idMap,
                    ctxMap,
                    nomland,
                    url,
                    bot,
                    "channel"
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
    if (!msg.from) return;

    const context = getContext(msg, ctxMap);
    if (!context) return;

    const msgText = getMsgText(msg);
    if (!msgText) return;

    // if the original msg is a share, then the reply msg will be processed as reply
    const replyToPostId = getReplyToMsgId(msg, idMap);
    if (!replyToPostId) return;

    const poster = await getPosterAccount(msg.from, bot, ctx, nomland);
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

    const msgKey = getMessageKey(msg);

    const postId = characterId.toString() + "-" + noteId.toString();

    if (addKeyValue(msgKey, postId, settings.idMapTblName)) {
        idMap.set(msgKey, postId);
    }
}

main();
