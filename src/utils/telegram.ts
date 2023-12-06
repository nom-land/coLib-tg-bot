import { Message } from "grammy/types";
import { Bot } from "grammy";
import { helpMsg } from "./constants";
import { settings } from "../config";
import { getEntities, getMsgText } from "./common";

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
    msg: Message,
    processFunc: (...args: any[]) => Promise<{
        curatorId: string;
        noteId: string;
    } | null>,
    args: any[]
) {
    const res = await ctx.reply(settings.prompt.load, {
        reply_to_message_id: msg.message_id,
    });
    const data = await processFunc(...args);
    if (data) {
        const { curatorId, noteId } = data;
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
