import { Message } from "grammy/types";
import { Bot } from "grammy";
import { helpMsg } from "./constants";
import { settings } from "../config";
import {
    getCommunity,
    getEntities,
    getMessageId,
    getMsgText,
    getNoteAttachments,
    getPosterAccount,
    makeRawCuration,
} from "./common";
import { addKeyValue } from "./keyValueStore";
import { processCuration } from "./nomland";
import NomlandNode from "nomland.js";

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
    if (msg.chat.type === "supergroup") {
        //TODO: double check
        return `https://t.me/c/${msg.chat.id.toString().slice(4)}/${(
            msg.message_thread_id || 1
        ).toString()}/${msg.message_id.toString()}`;
    } else {
        return null;
    }
}

export async function handleEvent(
    ctx: any,
    idMap: Map<string, string>,
    nom: NomlandNode,
    url: string,
    bot: Bot
) {
    const msg = ctx.msg;

    const msgAttachments = await getNoteAttachments(ctx, msg, bot.token);

    const community = getCommunity(msg);

    if (!community) return;

    const res = await ctx.reply(settings.prompt.load, {
        reply_to_message_id: msg.message_id,
    });

    if (!msg.from) return;

    const curator = await getPosterAccount(ctx, bot, nom);
    if (!curator) return;

    const text = getMsgText(msg);
    if (!text) return null;

    if (!msg.from) return null;

    const raws = makeRawCuration(msg);

    const result = await processCuration(
        nom,
        url,
        text,
        raws,
        curator,
        msgAttachments,
        community,
        bot.botInfo.username,
        "elephant"
    );

    if (result) {
        const { curatorId, noteId } = result;

        const msgId = getMessageId(msg);

        const postId = curatorId.toString() + "-" + noteId.toString();

        if (addKeyValue(msgId, postId, settings.idMapTblName)) {
            idMap.set(msgId, postId);
        }

        await ctx.api.editMessageText(
            res.chat.id,
            res.message_id,
            settings.prompt.succeed(curatorId, noteId)
        );
    } else {
        await ctx.api.editMessageText(
            res.chat.id,
            res.message_id,
            settings.prompt.fail
        );
    }
}
