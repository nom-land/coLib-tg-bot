import NomlandNode, { formatHandle, makeAccount } from "nomland.js";
import {
    getContext,
    getFirstUrl,
    getIpfsByUrl,
    getMessageId,
    getMsgText,
    makeRawCuration,
} from "./utils/common";
import { processShare } from "./utils/nomland";
import { Message } from "grammy/types";
import { parseMsgLink } from "./utils/telegram";
import { Bot } from "grammy";

export const fwdMsg = {
    message_id: 404,
    from: {
        id: 6082185442,
        is_bot: false,
        first_name: "Sal",
        last_name: "Devo",
        username: "saldevo",
        language_code: "en",
    },
    chat: {
        id: -1001918703227,
        title: "Salta & DevBot",
        is_forum: true,
        type: "supergroup",
    },
    date: 1702656377,
    message_thread_id: 8,
    forward_from: {
        id: 1170388515,
        is_bot: false,
        first_name: "Bigsong",
        username: "BigSongEth",
    },
    forward_date: 1702616584,
    reply_to_message: {
        message_id: 8,
        from: {
            id: 6082185442,
            is_bot: false,
            first_name: "Sal",
            last_name: "Devo",
            username: "saldevo",
            language_code: "en",
        },
        chat: {
            id: -1001918703227,
            title: "Salta & DevBot",
            is_forum: true,
            type: "supergroup",
        },
        date: 1682863549,
        message_thread_id: 8,
        forum_topic_created: { name: "test", icon_color: 16749490 },
        is_topic_message: true,
    },
    text:
        "https://readwise.io/reader/shared/01hh1d063d63tav253wtn4wgfp/?utm_source=substack&utm_medium=email\n" +
        "\n" +
        "如果机制设计是一个民主社会的根，且看吴敬琏如何贴着这个根施肥。\n" +
        "\n" +
        " @nuntibot #公共政策与法治 #组织机制设计",
    entities: [
        { offset: 0, length: 98, type: "url" },
        { offset: 134, length: 9, type: "mention" },
        { offset: 144, length: 8, type: "hashtag" },
        { offset: 153, length: 7, type: "hashtag" },
    ],
    is_topic_message: true,
};

//   https://t.me/theuncommons/807/12650
export function convertForwardMsg2Msg(fwdMsg: any, msgLink: string) {
    const data = parseMsgLink(msgLink);
    if (!data) return null;
    const { message_thread_id, msgId } = data;
    return {
        message_id: Number(msgId),
        message_thread_id: Number(message_thread_id),
        from: {
            id: fwdMsg.forward_from.id,
            is_bot: false,
            first_name: fwdMsg.forward_from.first_name,
            last_name: fwdMsg.forward_from.last_name,
            username: fwdMsg.forward_from.username,
        },
        chat: {
            id: -1001946851006, // Uncommons id
            title: "Uncommons｜💚💊", // Uncommons name
            is_forum: true,
            type: "supergroup",
        },
        date: fwdMsg.forward_date,
        text: fwdMsg.text,
        entities: fwdMsg.entities,
    } as Message;
}

async function getPosterAccount(
    avatarUrl: string,
    msg: Message,
    nomland: NomlandNode
) {
    if (!msg.from) return null;

    const poster = makeAccount(msg.from);

    const handle = formatHandle(poster);

    console.log("before getAccountByHandle");
    const { data } = await nomland.contract.character.getByHandle({
        handle,
    });

    console.log(handle, data.characterId, !data.characterId);
    if (
        !data.characterId ||
        !data.metadata?.avatars ||
        data.metadata?.avatars?.length === 0
    ) {
        console.log("before getIpfsByUrl");

        const ipfsFile = await getIpfsByUrl(avatarUrl);

        if (ipfsFile?.url) {
            if (
                data.characterId &&
                (!data.metadata?.avatars ||
                    data.metadata?.avatars?.length === 0)
            ) {
                const oldProfile = data.metadata;

                console.log("before setMetadata");
                await nomland.contract.character.setMetadata({
                    characterId: data.characterId,
                    metadata: {
                        avatars: [ipfsFile.url],
                        ...oldProfile,
                    },
                });
            }
            poster.avatar = ipfsFile.url;
        }
    }
    return poster;
}

export async function reprocessMessage(
    msg: Message,
    nom: NomlandNode,
    avatarUrl: string
) {
    try {
        if (!msg.from) return null;

        // const msgAttachments = await getNoteAttachments(ctx, msg, bot.token);
        console.log("before getCommunity");
        const community = getContext(msg);

        if (!community) return;

        if (!msg.from) return;

        console.log("before getPosterAccount");
        const curator = await getPosterAccount(avatarUrl, msg, nom);
        if (!curator) return;

        const text = getMsgText(msg);
        if (!text) return null;

        const url = getFirstUrl(text);
        if (!url) return null;

        const raws = makeRawCuration(msg);
        msg.message_thread_id = 0;
        const result = await processShare(
            nom,
            "https://chinadigitaltimes.net/chinese/702954.html",
            text,
            raws,
            curator,
            [],
            community,
            "nuntibot",
            undefined,
            "elephant"
        );
        console.log(result);
        if (!result) {
            return;
        }
        const { curatorId, noteId } = result;

        const msgId = getMessageId(msg);

        const postId = curatorId.toString() + "-" + noteId.toString();
        console.log(msgId, postId);
        // TODO: add msgId, postId in json
    } catch (e) {
        console.log(e);
    }
}

export async function sendMsg(bot: Bot) {
    // https://t.me/c/2026448452/3
    // https://t.me/c/2026448452/4
    // https://t.me/c/2026448452/16
    await bot.api.sendMessage(
        "-1002026448452", // Raw Group
        '📒 Discussion aggregation feature is supported by <a href="https://colib.app">CoLib</a>.',
        {
            reply_to_message_id: 16,
            parse_mode: "HTML",
        }
    );
}

// try {
//     console.log("start editMessageText");
//     await bot.api.raw.editMessageText({
//         chat_id: "-1001946851006",
//         message_id: 12651,
//         text: settings.prompt.succeed("60177", "1"),
//     });
//     console.log("editMessageText success");
// } catch (e) {
//     console.log(e);
// }

// const manualMsg = convertForwardMsg2Msg(
//     fwdMsg,
//     "https://t.me/theuncommons/807/12650"
// );
// if (manualMsg) {
//     console.log(manualMsg);
//     reprocessMessage(
//         manualMsg,
//         nomland,
//         "https://cdn5.cdn-telegram.org/file/LV2zy77JMg4KBxPE-5_R1qkfdt4CEGbFmPpg3PUbgnQL7YFkYmcV9Hpe--KhRsyHql3cai_sy7_IQK_n0hd6nYvMzlpw3t-NS8ZKQQfjRMd-8iYvP28ZXWiKe9wQIg0XZGO85nBwODGzBP3zrfoLZ84UIOkXoGNAtTQ5U0C7uHOXW5SbJ3ohMO1TwPslncfiT6HczN9r96G0bCsm3xY_A07UOC62DBxVpvgw6nNkmgd5pZmZrFVqoFK78mlTDBxiTiyoHsM9CdrT3ZPeGc2TP6k1c-Y40Nsaq13ZPmmpth9qgDzfTKIUAwU8vNVSjaRvd8jClsNrpBLceGw2Spk5mg.jpg"
//     );
// }

// bot.api.deleteMessage("-1001946851006", 13514);
