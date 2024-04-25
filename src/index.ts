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
    getContextFromChat,
    storeContextMapValue,
    convertDate,
    getShareUrlFromMsg,
} from "./utils/common";
import { feedbackUrl, settings } from "./config";
import { Message, User } from "grammy/types";
import {
    setKeyValue,
    loadKeyValuePairs,
    removeKeyValue,
} from "./utils/keyValueStore";
import { createShare } from "./utils/nomland";
import {
    ManualReplyCmdStatus,
    ManualShareCmdStatus,
    ReplyParams,
    ShareParams,
} from "./types/command";

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
        let replyParams: ReplyParams | undefined;

        let manualShareCmdStatus: ManualShareCmdStatus = "START";
        let manualReplyCmdStatus: ManualReplyCmdStatus = "START";

        bot.on("message", async (ctx) => {
            const msg = ctx.msg;
            if (getMsgOrigin(msg) === "admin") {
                if (settings.adminCreateShareTopicId) {
                    if (
                        msg.reply_to_message?.message_id ===
                        settings.adminCreateShareTopicId
                    ) {
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
                                    if (
                                        msg.forward_from_chat.type != "channel"
                                    ) {
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
                                        "Please continue to input the chat message link of this channel broadcast.\n填写群链接！！不能带channel地址的那个！！！"
                                    );
                                    manualShareCmdStatus = "WAIT_MSG_ID";
                                }
                            } else if (manualShareCmdStatus === "WAIT_MSG_ID") {
                                const msgLink = getFirstUrl(msg.text || "");
                                if (!msgLink) {
                                    reply(
                                        "Please continue to input the chat message link of this channel broadcast.\n填写群链接！！不能带channel地址的那个！！！"
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
                                        "Please input the correct chat message link of this channel broadcast.\n填写群链接！！不能带channel地址的那个！！！"
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
                                    const url = feedbackUrl(
                                        getNoteKey(noteKey)
                                    );
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
                            } else if (
                                manualShareCmdStatus === "WAIT_RPL_OPTION"
                            ) {
                                const option = msg.text;
                                if (option === "1") {
                                    if (!shareParams) {
                                        reply(
                                            "Internal Error. Please try again."
                                        );
                                        restart();

                                        return;
                                    }

                                    const shareNoteKey = await createShare(
                                        nomland,
                                        shareParams.url,
                                        shareParams.details,
                                        shareParams.authorAccount,
                                        shareParams.context,
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
                                        reply(
                                            "Succeed. CharacterId: " +
                                                shareNoteKey.characterId +
                                                ", NoteId: " +
                                                shareNoteKey.noteId
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
                            } else if (
                                manualShareCmdStatus === "WAIT_EDIT_LINK"
                            ) {
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
                                    shareParams.context,
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
                                        settings.prompt.channelSucceed(
                                            shareNoteKey
                                        ),
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
                }
                if (settings.adminBindContextTopicId) {
                    const reply = (text: string) => {
                        if (settings.adminBindContextTopicId) {
                            ctx.reply(text, {
                                reply_to_message_id:
                                    settings.adminBindContextTopicId,
                            });
                        } else {
                            ctx.reply(text);
                        }
                    };

                    if (
                        msg.reply_to_message?.message_id ===
                        settings.adminBindContextTopicId
                    ) {
                        const msgText = getMsgText(msg);
                        if (!msgText) return;

                        console.log(contextMap);
                        if (msgText.startsWith("/ls")) {
                            let text = "";
                            for (const [k, v] of contextMap) {
                                if (k.startsWith("//")) {
                                    text += k.slice(3) + ": " + v + "\n";
                                }
                            }
                            reply(text);
                        } else if (msgText.startsWith("/remove")) {
                            const contextId = msgText.split(" ")[1];
                            console.log(contextId);
                            for (const [k, v] of contextMap) {
                                if (v === contextId) {
                                    removeKeyValue(
                                        k,
                                        settings.contextMapTblName
                                    );
                                    contextMap.delete(k);
                                }
                            }
                            reply("Succeed.");
                        } else if (msgText.startsWith("/setcontext")) {
                            const channelIdentifier = msgText.split(" ")[1];
                            const contextId = msgText.split(" ")[2];
                            const idDesc = msgText.split(" ")[3];
                            if (!channelIdentifier || !contextId || !idDesc) {
                                reply("Invalid input.");
                                return;
                            }

                            const chat_id = isNaN(Number(channelIdentifier))
                                ? channelIdentifier.startsWith("@")
                                    ? channelIdentifier
                                    : "@" + channelIdentifier
                                : "-100" + channelIdentifier;

                            const chatInfo = await bot.api.getChat(chat_id);
                            const channelId = chatInfo.id.toString().slice(4);
                            if ("linked_chat_id" in chatInfo) {
                                const channelChatId = (
                                    chatInfo as any
                                ).linked_chat_id
                                    .toString()
                                    .slice(4);

                                storeContextMapValue(
                                    channelId,
                                    contextId,
                                    contextMap
                                );
                                storeContextMapValue(
                                    channelChatId,
                                    contextId,
                                    contextMap
                                );
                                storeContextMapValue(
                                    "// " +
                                        channelChatId +
                                        " " +
                                        idDesc +
                                        " Chat Group",
                                    contextId,
                                    contextMap
                                );
                                storeContextMapValue(
                                    "// " +
                                        channelId +
                                        " " +
                                        idDesc +
                                        " Channel",
                                    contextId,
                                    contextMap
                                );
                                reply("Succeed.");
                            } else {
                                reply(
                                    "This channel has not been bound with a chat."
                                );
                                return;
                            }
                        }
                    }
                }
                if (settings.adminCreateReplyTopicId) {
                    if (
                        msg.reply_to_message?.message_id ===
                        settings.adminCreateReplyTopicId
                    ) {
                        const reply = (text: string) => {
                            if (settings.adminCreateReplyTopicId) {
                                ctx.reply(text, {
                                    reply_to_message_id:
                                        settings.adminCreateReplyTopicId,
                                });
                            } else {
                                ctx.reply(text);
                            }
                        };

                        if (manualReplyCmdStatus === "START") {
                            const fwdOrigin = (ctx.msg as any).forward_origin;

                            const msgText = getMsgText(msg) || "";
                            if (!msg.forward_date) return;

                            if (
                                (fwdOrigin &&
                                    fwdOrigin.type === "hidden_user") ||
                                (fwdOrigin && fwdOrigin.type === "user")
                            ) {
                                const attachments = await getNoteAttachments(
                                    ctx as any,
                                    msg,
                                    bot.token
                                );

                                const date_published = convertDate(
                                    msg.forward_date
                                );

                                if (
                                    fwdOrigin &&
                                    fwdOrigin.type === "hidden_user"
                                ) {
                                    replyParams = {
                                        userType: "hidden_user",
                                        user: null,
                                        authorId: null,
                                        details: {
                                            content: msgText,
                                            attachments,
                                            date_published,
                                        },
                                        replyMsgId: null,
                                        chatId: null,
                                        originalMsgId: null,
                                    };
                                    manualReplyCmdStatus = "WAIT_AUTHOR_ID";
                                    reply(
                                        "This is a hidden user. Please continue to input the author id."
                                    );
                                } else if (
                                    fwdOrigin &&
                                    fwdOrigin.type === "user"
                                ) {
                                    const user = fwdOrigin.sender_user;
                                    replyParams = {
                                        userType: "user",
                                        user: user,
                                        authorId: null,
                                        details: {
                                            content: msgText,
                                            attachments,
                                            date_published,
                                        },
                                        replyMsgId: null,
                                        chatId: null,
                                        originalMsgId: null,
                                    };
                                    manualReplyCmdStatus = "WAIT_RPL_MSG_ID";
                                    reply(
                                        "Please continue to input the link of this reply message.\n填写这条回复的群链接！！不能带channel地址的那个！！！"
                                    );
                                }
                            }
                        } else if (manualReplyCmdStatus === "WAIT_AUTHOR_ID") {
                            if (!replyParams) {
                                reply("Internal Error. Please try again.");
                                manualReplyCmdStatus = "START";
                                return;
                            }
                            if (msg.text) {
                                const authorId = msg.text;
                                const author =
                                    await nomland.contract.character.get({
                                        characterId: authorId,
                                    });
                                if (!author) {
                                    reply(
                                        "Author not found. Please input the correct author id."
                                    );
                                    return;
                                } else {
                                    replyParams.authorId = authorId;
                                    reply(
                                        "Please continue to input the link of this reply message."
                                    );
                                    manualReplyCmdStatus = "WAIT_RPL_MSG_ID";
                                }
                            } else {
                                reply("Please input the correct username.");
                            }
                        } else if (manualReplyCmdStatus === "WAIT_RPL_MSG_ID") {
                            if (!replyParams) {
                                reply("Internal Error. Please try again.");
                                manualReplyCmdStatus = "START";
                                return;
                            }
                            const msgLink = getFirstUrl(msg.text || "");
                            if (!msgLink) {
                                reply(
                                    "Please continue to input the link of this reply message."
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
                                    "Please input the correct link of this reply message."
                                );
                                return;
                            }

                            const noteKeyString = idMap.get(
                                chatId + "-" + chatMsgId
                            );
                            if (noteKeyString) {
                                reply(
                                    "The message has been processed. CharacterId: " +
                                        idMap.get(chatId + "-" + chatMsgId)
                                );
                                manualReplyCmdStatus = "START";
                                return;
                            }

                            replyParams.chatId = chatId;
                            replyParams.replyMsgId = chatMsgId;

                            reply(
                                "Please input the message link that you want to reply.\n填写被回复的消息的群链接！！不能带channel地址的那个！！！"
                            );
                            manualReplyCmdStatus = "WAIT_MSG_ID";
                        } else if (manualReplyCmdStatus === "WAIT_MSG_ID") {
                            if (!replyParams) {
                                reply("Internal Error. Please try again.");
                                manualReplyCmdStatus = "START";
                                return;
                            }
                            const msgLink = getFirstUrl(msg.text || "");
                            if (!msgLink) {
                                reply(
                                    "Please continue to input the link of the message that you want to reply."
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
                                    "Please input the correct link of the message you want to reply."
                                );
                                return;
                            }
                            if (chatId !== replyParams.chatId) {
                                reply(
                                    "Chat Id mismatches. Please input the correct link of the message you want to reply."
                                );
                                return;
                            }

                            replyParams.originalMsgId = chatMsgId;
                            const noteKeyString = idMap.get(
                                chatId + "-" + chatMsgId
                            );
                            if (!noteKeyString) {
                                reply(
                                    "The message you want to reply has not been processed."
                                );
                                manualReplyCmdStatus = "START";
                                return;
                            }
                            const replyToNoteKey = getNoteKey(noteKeyString);

                            let poster: Accountish;
                            if (
                                replyParams.userType === "user" &&
                                replyParams.user
                            ) {
                                poster = await getPosterAccount(
                                    replyParams.user,
                                    bot,
                                    ctx as any,
                                    nomland
                                );
                            } else if (
                                replyParams.userType === "hidden_user" &&
                                replyParams.authorId
                            ) {
                                poster = replyParams.authorId;
                            } else {
                                console.log(replyParams);
                                reply("Internal Error. Please try again.");
                                manualReplyCmdStatus = "START";
                                return;
                            }

                            const chatInfo = await bot.api.getChat(
                                "-100" + chatId
                            );
                            const contextId = getContextFromChat(
                                chatInfo,
                                contextMap
                            );
                            if (!contextId) {
                                reply("Fail to get the context id.");
                                manualReplyCmdStatus = "START";
                                return;
                            }
                            console.log(contextId);

                            const replyNoteKey = await nomland.createReply(
                                poster,
                                contextId,
                                replyParams.details,
                                replyToNoteKey
                            );

                            if (replyNoteKey) {
                                storeMsg(
                                    idMap,
                                    replyParams.chatId +
                                        "-" +
                                        replyParams.replyMsgId,
                                    replyNoteKey
                                );
                                reply(
                                    "Succeed. CharacterId: " +
                                        replyNoteKey.characterId +
                                        ", NoteId: " +
                                        replyNoteKey.noteId
                                );
                            } else {
                                reply("Fail to process.");
                            }

                            manualReplyCmdStatus = "START";
                            replyParams = undefined;
                        }
                    }
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

        // if (!msg.forward_signature) return;
        if (!msg.sender_chat?.id) return;

        // TODO: multiple urls
        const url = getShareUrlFromMsg(msg);
        if (url) {
            const authorAccount = msg.forward_signature
                ? await getChannelBroadcastAuthorAccount(
                      msg.sender_chat.id,
                      msg.forward_signature,
                      bot,
                      ctx,
                      nomland
                  )
                : undefined;

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

    const msgText = getMsgText(msg) || "";

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

    if (setKeyValue(msgKey, postId, settings.idMapTblName)) {
        idMap.set(msgKey, postId);
    }
}

main();
