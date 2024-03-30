import { Message } from "grammy/types";
import { Bot, CommandContext, Context } from "grammy";
import { helpMsg } from "./constants";
import { settings } from "../config";
import {
    getChatId,
    getContext,
    getEntities,
    getMessageId,
    getMsgOrigin,
    getMsgText,
    getNoteAttachments,
    getNoteKey,
    getSenderChatId,
    getShareDetails,
} from "./common";
import { addKeyValue } from "./keyValueStore";
import { createShare } from "./nomland";
import NomlandNode, { Accountish } from "nomland.js";
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
    author: Accountish,
    idMap: Map<string, string>,
    ctxMap: Map<string, string>,
    nom: NomlandNode,
    url: string,
    bot: Bot
) {
    try {
        const msg = ctx.msg;

        const msgAttachments = await getNoteAttachments(ctx, msg, bot.token);

        const community = getContext(msg, ctxMap);

        if (!community) return;

        const res = await ctx.reply(settings.prompt.load, {
            reply_to_message_id: msg.message_id,
        });

        if (!msg.from) return;

        const text = getMsgText(msg);
        if (!text) return null;

        const details = getShareDetails(msg);
        if (!details) return;

        details.attachments = msgAttachments;

        const replyToPostId = getReplyToMsgId(msg, idMap);
        const replyTo = replyToPostId ? getNoteKey(replyToPostId) : null;

        const result = await createShare(
            nom,
            url,
            details,
            author,
            community,
            replyTo,
            "elephant"
        );
        if (result) {
            const { characterId, noteId } = result;

            const msgId = getMessageId(msg);

            const postId = characterId.toString() + "-" + noteId.toString();

            if (addKeyValue(msgId, postId, settings.idMapTblName)) {
                idMap.set(msgId, postId);
            }

            await ctx.api.editMessageText(
                res.chat.id,
                res.message_id,
                settings.prompt.succeed(characterId, noteId)
            );
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

    const replyToMsgId = getMessageId(reply_to_message);

    if (!replyToMsgId) return;

    const replyToPostId = idMap.get(replyToMsgId);
    if (!replyToPostId) return;

    return replyToPostId;
}
