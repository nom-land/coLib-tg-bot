import { Message } from "grammy/types";
import { Bot, CommandContext, Context } from "grammy";
import { helpMsg } from "./constants";
import { settings } from "../config";
import {
    getChannelBroadcastAuthorAccount,
    getChannelId,
    getChatId,
    getContext,
    getContextFromChat,
    getEntities,
    getFwdMsgShareDetails,
    getMessageIdFromFwd,
    getMessageKey,
    getMsgOrigin,
    getMsgText,
    getNoteAttachments,
    getNoteKey,
    getSenderChatId,
    getShareDetails,
    getShareUrlFromMsg,
    storeMsg,
} from "./common";
import { createShare } from "./nomland";
import NomlandNode, { Accountish } from "nomland.js";
import { assert } from "console";
export interface RawMessage {
    content: string;
    sources: string[];
    date_published: string;
    external_url: string;
}

export function mentions(m: Message, username: string) {
    const text = getMsgText(m);
    if (!text) return false;

    const mentions = getEntities(m)
        ?.map((e) => {
            if (e.type === "mention") {
                return text.slice(e.offset, e.offset + e.length);
            }
        })
        .filter((i) => !!i);
    return !!mentions?.includes("@" + username);
}

export async function isAdmin(bot: Bot, chatId: string | number, id: number) {
    // TODO: cache admins
    const admins = await bot.api.getChatAdministrators(chatId);
    return !!admins.find((user) => id === user.user.id);
}

export async function helpInfoInGroup(bot: Bot, fromMsg: Message) {
    const botUsername = bot.botInfo.username;

    const fromAdmin =
        fromMsg.from?.id &&
        (await isAdmin(bot, fromMsg.chat.id, fromMsg.from?.id));

    if (fromAdmin) {
        return helpMsg(botUsername, "admin");
    } else {
        return helpMsg(botUsername, "group");
    }
}

// make message link
export function makeMsgLink(msg: Message) {
    // TODO: public/private group has different logic
    if (getMsgOrigin(msg) === "group") {
        //TODO: double check
        return `https://t.me/c/${getChatId(msg)}/${(
            msg.message_thread_id || 1
        ).toString()}/${msg.message_id.toString()}`;
    } else if (getMsgOrigin(msg) === "channel") {
        const channelHandle = (msg.sender_chat! as any).username;
        const channelId = getSenderChatId(msg);

        const msgId = (msg as any).forward_origin?.message_id.toString();
        if (msgId && channelHandle) {
            return `https://t.me/${channelHandle}/${msgId}`;
        }
        if (msgId && channelId) {
            return `https://t.me/c/${channelId}/${msgId}`;
        }
    } else if (getMsgOrigin(msg) === "admin") {
        if (msg.forward_from_chat) {
            const channelHandle = (msg.forward_from_chat! as any).username;
            const channelId = msg.forward_from_chat.id.toString().slice(4);

            const msgId = (msg as any).forward_origin?.message_id.toString();
            if (msgId && channelHandle) {
                return `https://t.me/${channelHandle}/${msgId}`;
            }
            if (msgId && channelId) {
                return `https://t.me/c/${channelId}/${msgId}`;
            }
        }
    }
    return null;
}

export function parseMsgLink(link: string) {
    // regex: https://t.me/nomland/[number]/[number]
    const urlRegex = /https:\/\/t.me\/([a-zA-Z0-9_]+)\/([0-9]+)\/([0-9]+)/;
    const match = link.match(urlRegex);
    if (!match) return null;
    const message_thread_id = match[2];
    const msgId = match[3];
    return { message_thread_id, msgId };
}

export async function processShareMsg(
    ctx: CommandContext<Context>,
    author: Accountish | undefined,
    idMap: Map<string, string>,
    ctxMap: Map<string, string>,
    nom: NomlandNode,
    url: string,
    bot: Bot,
    msgOrigin: "channel" | "group"
) {
    try {
        const msg = ctx.msg;

        const msgAttachments = await getNoteAttachments(ctx, msg, bot.token);

        const community = await getContext(msg, ctx, nom, ctxMap);

        if (!community) return;

        const res = await ctx.reply(settings.prompt.load, {
            reply_to_message_id: msg.message_id,
        });

        if (!msg.from) return;

        const details = getShareDetails(msg);
        if (!details) return;

        details.attachments = msgAttachments;

        const replyToPostId = getReplyToMsgId(msg, idMap);
        const replyTo = replyToPostId ? getNoteKey(replyToPostId) : null;

        const shareNoteKey = await createShare(
            nom,
            url,
            details,
            // if the author is not provided, we use the community as the author
            author || community,
            community,
            replyTo,
            "elephant"
        );
        if (shareNoteKey) {
            const msgKey = getMessageKey(msg);

            storeMsg(idMap, msgKey, shareNoteKey);
            if (msgOrigin === "group") {
                await ctx.api.editMessageText(
                    res.chat.id,
                    res.message_id,
                    settings.prompt.groupSucceed(shareNoteKey)
                );
            } else {
                await ctx.api.editMessageText(
                    res.chat.id,
                    res.message_id,
                    settings.prompt.channelSucceed(shareNoteKey),
                    {
                        parse_mode: "HTML",
                    }
                );
            }
        } else {
            await ctx.api.editMessageText(
                res.chat.id,
                res.message_id,
                settings.prompt.fail
            );
        }
    } catch (e) {
        console.log(e);
    }
}

export function getReplyToMsgId(msg: Message, idMap: Map<string, string>) {
    const reply_to_message = msg.reply_to_message;
    if (!reply_to_message) return;

    const replyToMsgId = getMessageKey(reply_to_message);

    if (!replyToMsgId) return;

    const replyToPostId = idMap.get(replyToMsgId);
    if (!replyToPostId) return;

    return replyToPostId;
}

export async function prepareFwdMessage(
    ctx: Context,
    contextMap: Map<string, string>,
    bot: Bot,
    nomland: NomlandNode,
    reply: (text: string) => void
) {
    const msg = ctx.msg!;
    assert(msg.forward_from_chat);

    const broadcastId = getMessageIdFromFwd(msg)?.toString();
    if (!broadcastId) return;

    const channelId = getChannelId(msg);
    if (!channelId) return;

    let channelChatId: string;

    const channelInfo = await bot.api.getChat("-100" + channelId);
    if ("linked_chat_id" in channelInfo) {
        channelChatId = (channelInfo as any).linked_chat_id.toString().slice(4);
    } else {
        reply(
            "This channel has not been bound with a chat. I don't have permission to process this message."
        );
        return;
    }

    const chatInfo = await bot.api.getChat("-100" + channelChatId);
    const context = getContextFromChat(chatInfo, contextMap);

    if (!context) {
        reply("Fail to get context");
        return;
    }

    const url = getShareUrlFromMsg(msg);

    if (!url) {
        reply("Message has no url.");
        return;
    }

    // If the message is not signed, we use the context as the author
    const authorAccount = msg.forward_signature
        ? await getChannelBroadcastAuthorAccount(
              "-100" + channelId,
              msg.forward_signature,
              bot,
              ctx as any,
              nomland
          )
        : context;

    if (!authorAccount) {
        reply("Fail to get the author.");
        return;
    }

    const msgAttachments = await getNoteAttachments(ctx as any, msg, bot.token);
    const details = getFwdMsgShareDetails(msg);
    if (!details) {
        reply("Fail to get the share details.");
        return;
    }
    details.attachments = msgAttachments;

    return {
        url,
        details,
        authorAccount,
        context,
        channelId,
        broadcastId,
        channelChatId,
    };
}
