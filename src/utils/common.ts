import {
    Chat,
    ChatFromGetChat,
    ChatMemberAdministrator,
    ChatMemberOwner,
    Message,
    User,
    UserProfilePhotos,
} from "grammy/types";
import Nomland, {
    makeAccount,
    formatHandle,
    Accountish,
    TelegramUser,
    NoteDetails,
    NoteKey,
} from "nomland.js";
import { setKeyValue } from "./keyValueStore";
import { settings } from "../config";

import { makeMsgLink } from "./telegram";
import { Bot, CommandContext, Context } from "grammy";
import { ipfsUploadFile } from "crossbell/ipfs";
import { NoteMetadataAttachmentBase } from "crossbell";
import { log } from "./log";
import md5 from "md5";
import NomlandNode from "nomland.js";

const urlRegex = /(http|https):\/\/[^\s]+/g;
const tagRegex = /#[^\s]+/g;
// const mentionsRegex = /@[^\s]+/g;

//TODO: support multiple URLs
export function getFirstUrl(str: string) {
    const urls = str.match(urlRegex);
    return urls ? urls[0] : null;
}

export function getUrlFromMessage(msg: Message) {
    const msgText = getMsgText(msg);
    if (!msgText) return;

    const url = getFirstUrl(msgText);
    if (url) return url;
    console.log("msg.entities", msg.entities);
    if (msg.entities) {
        for (const entity of msg.entities) {
            if (entity.type === "text_link") {
                return (entity as any).url as string;
            }
        }
    }
}

export function getShareUrlFromMsg(msg: Message) {
    const url = getUrlFromMessage(msg);

    // TODO: multiple urls
    return filterUrl(url);
}

export function cleanContent(str: string, botName: string) {
    // remove URLs and mentions and tags and trim
    // TODO: Or remove by entities?
    return (
        str
            .replaceAll(urlRegex, "")
            .replaceAll("@" + botName, "")
            // .replaceAll(tagRegex, "")
            .trim()
    );
}

export function getTags(str: string) {
    const tags = str.match(tagRegex);
    return tags ? tags : [];
}

export function removeTags(msg: Message) {
    const msgText = getMsgText(msg)!;

    let contentWithoutTags = msgText!;
    let reducedLength = 0;
    const tags = [] as string[];
    const entities = getEntities(msg);
    if (!entities) return { tags, contentWithoutTags };

    entities.forEach((entity) => {
        if (entity.type === "hashtag") {
            tags.push(
                msgText.slice(entity.offset + 1, entity.offset + entity.length)
            );
            contentWithoutTags =
                contentWithoutTags.slice(0, entity.offset - reducedLength) +
                contentWithoutTags.slice(
                    entity.offset + entity.length - reducedLength
                );
            reducedLength += entity.length;
        }
    });

    return { tags, contentWithoutTags };
}

export function convertDate(date: number) {
    if (date.toString().length === 10) {
        return new Date(date * 1000).toISOString();
    } else if (date.toString().length === 13) {
        return new Date(date).toISOString();
    } else {
        return date.toString();
    }
}

// get message details without attachment
export function getShareDetails(msg: Message, botName: string) {
    const text = getMsgText(msg);
    if (!text) return null;

    //TODO: icon_custom_emoji_id and icon_color
    let communityName = "Telegram Community";
    if ("title" in msg.chat) {
        communityName = msg.chat.title;
    }

    const topicName =
        msg.reply_to_message?.forum_topic_created?.name || "General";
    const msgLink = makeMsgLink(msg);

    const { tags, contentWithoutTags } = removeTags(msg);
    const content = cleanContent(contentWithoutTags, botName);

    const raw = {
        content,
        rawContent: msg.text,
        tags,
        sources: ["Telegram", communityName, topicName],
        date_published: convertDate(msg.date),
    } as NoteDetails;
    if (msgLink) {
        raw.external_url = msgLink;
    }

    return raw;
}

export async function getChannelBroadcastAuthorAccount(
    channelId: string | number,
    signature: string,
    bot: Bot,
    ctx: CommandContext<Context>,
    nomland: Nomland
) {
    const admins = await bot.api.getChatAdministrators(channelId);

    const author = getChannelBroadcastAuthor(admins, signature);
    if (!author) return;
    const authorAccount = await getChannelPosterAccount(
        ctx,
        author,
        bot,
        nomland
    );
    return authorAccount;
}

export function getChannelId(fwdMsg: Message) {
    return fwdMsg.forward_from_chat?.id.toString().slice(4);
}

export function getChannelChatIdByChannelId(
    channelId: string,
    contextMap: Map<string, string>
) {
    const contextId = contextMap.get(channelId);
    if (!contextId) return;
    let channelChatId;

    for (const chatId of contextMap) {
        if (chatId[0] !== channelId && chatId[1] === contextId) {
            channelChatId = chatId[0];
            break;
        }
    }

    return channelChatId;
}

// get forward message details without attachment
export function getChannelFwdMsgShareDetails(msg: Message, botName: string) {
    if (!msg.forward_from_chat) return null;
    if (!msg.forward_date) return null;

    const text = getMsgText(msg);
    if (!text) return null;

    //TODO: icon_custom_emoji_id and icon_color
    let communityName = "Telegram Community";
    if ("title" in msg.forward_from_chat) {
        communityName = msg.forward_from_chat.title;
    }

    const topicName =
        msg.reply_to_message?.forum_topic_created?.name || "General";
    // const msgLink = makeMsgLink(msg);
    let msgLink = "";
    const channelHandle = (msg.forward_from_chat as any).username;
    const channelId = getChannelId(msg);

    const msgId = getMessageIdFromFwd(msg);
    if (msgId && channelHandle) {
        msgLink = `https://t.me/${channelHandle}/${msgId}`;
    } else if (msgId && channelId) {
        msgLink = `https://t.me/c/${channelId}/${msgId}`;
    }

    // const contentAfterBot = text.split(botName)[1]; // TODO? remove it?
    const { tags, contentWithoutTags } = removeTags(msg);
    const content = cleanContent(contentWithoutTags, botName);

    const raw = {
        content,
        rawContent: msg.text,
        tags,
        sources: ["Telegram", communityName, topicName],
        date_published: convertDate(msg.forward_date),
    } as NoteDetails;
    if (msgLink) {
        raw.external_url = msgLink;
    }

    return raw;
}

export function getUserFwdMsgShareDetails(msg: Message, botName: string) {
    if (!msg.forward_date) return null;

    const text = getMsgText(msg);
    if (!text) return null;

    // const contentAfterBot = text.split(botName)[1]; // TODO? remove it?
    const { tags, contentWithoutTags } = removeTags(msg);
    const content = cleanContent(contentWithoutTags, botName);

    const raw = {
        content,
        rawContent: msg.text,
        tags,
        sources: ["Telegram"],
        date_published: convertDate(msg.forward_date),
    } as NoteDetails;

    return raw;
}

export function getMsgOrigin(msg: Message) {
    if (msg.chat.id.toString() === settings.adminGroupId) {
        return "admin";
    }
    if (msg.chat.type === "private") {
        return "private";
    }
    if (msg.sender_chat?.type === "channel") {
        return "channel";
    } else {
        return "group";
    }
}

export function getMsgText(msg: Message) {
    return msg.text || msg.caption;
}

export function getChatId(msg: Message | Chat) {
    if ("chat" in msg) {
        return msg.chat.id.toString().slice(4);
    } else {
        return msg.id.toString().slice(4);
    }
}

export function getSenderChatId(msg: Message) {
    return msg.sender_chat?.id.toString().slice(4);
}

export function getMessageKey(msg: Message) {
    const msgId = getChatId(msg) + "-" + msg.message_id.toString();
    return msgId;
}

export function getMessageIdFromFwd(fwdMsg: Message): number | undefined {
    return (fwdMsg as any).forward_origin?.message_id;
}

export function getEntities(msg: Message) {
    return msg.entities || msg.caption_entities;
}

export async function getIpfsByUrl(url: string) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Response error: ${response.statusText}`);
    } else {
        const ipfsFile = await ipfsUploadFile(await response.blob());
        return ipfsFile;
    }
}

export async function getPhoto(filePath: string, botToken: string) {
    try {
        const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        return getIpfsByUrl(url);
    } catch (error) {
        log.error(`Response error: ${error}`);
    }
}

async function getMsgAttachments(
    ctx: CommandContext<Context>,
    msg: Message,
    botToken: string
) {
    try {
        const res = await ctx.getFile();

        if (!res.file_path) return null;

        const ipfsFile = await getPhoto(res.file_path, botToken);

        if (!ipfsFile) return null;

        return {
            address: ipfsFile.url,
            size_in_bytes: res.file_size,
            width: msg.photo?.find((p) => p.file_size === res.file_size)?.width,
            height: msg.photo?.find((p) => p.file_size === res.file_size)
                ?.height,
            mime_type: "image/jpeg",
        } as NoteMetadataAttachmentBase<"address">;
    } catch (error) {
        console.error("Fail to fetch photo: ", error);
    }
}

export async function getChannelPosterAccount(
    ctx: CommandContext<Context>,
    author: TelegramUser,
    bot: Bot,
    nomland: Nomland
) {
    if (!ctx.msg.from) return;
    const poster = makeAccount(author);

    const handle = formatHandle(poster);

    const { data } = await nomland.contract.character.getByHandle({
        handle,
    });
    // forward message doesn't have avatar. skip avatar fetching
    return poster;
}

export async function getPosterAccount(
    user: User,
    bot: Bot,
    ctx: CommandContext<Context>,
    nomland: Nomland,
    fetchAvatar = true
) {
    const poster = makeAccount(user);

    const handle = formatHandle(poster);

    const { data } = await nomland.contract.character.getByHandle({
        handle,
    });
    if (
        fetchAvatar &&
        (!data.characterId ||
            !data.metadata?.avatars ||
            data.metadata?.avatars?.length === 0)
    ) {
        const ipfsFile = await getUserAvatar(ctx, bot.token);

        if (ipfsFile?.url && data.characterId) {
            if (
                !data.metadata?.avatars ||
                data.metadata?.avatars?.length === 0
            ) {
                const oldProfile = data.metadata;

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

async function getUserAvatar(
    ctx: CommandContext<Context>,
    botToken: string,
    userId?: number
) {
    let userProfiles: UserProfilePhotos;
    if (userId) userProfiles = await ctx.api.getUserProfilePhotos(userId);
    else userProfiles = await ctx.getUserProfilePhotos();

    console.log("userProfiles", userProfiles);

    if (userProfiles.total_count > 0) {
        const avatarPhoto = userProfiles.photos[0].reduce((p1, p2) =>
            (p1.file_size || 0) > (p2.file_size || 0) ? p1 : p2
        );
        const filePathUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${avatarPhoto.file_id}`;
        const response = await fetch(filePathUrl);
        const data = await response.json();

        if (!response.ok || !response.body || !data.ok) {
            log.error(`Response error: ${response.statusText}`);
        }

        const ipfsFile = await getPhoto(data.result.file_path, botToken);

        return ipfsFile;
    }
}

export async function getNoteAttachments(
    ctx: CommandContext<Context>,
    msg: Message,
    botToken: string
) {
    const attachments = [] as NoteMetadataAttachmentBase<"address">[];
    if (msg.photo) {
        const pic = await getMsgAttachments(ctx, msg, botToken);
        if (pic) {
            attachments.push(pic);
        }
    }
    return attachments;
}

export function getContextFromChat(
    chat: ChatFromGetChat,
    ctxMap: Map<string, string>
) {
    const groupId = getChatId(chat);
    if (ctxMap && ctxMap.has(groupId)) {
        return Number(ctxMap.get(groupId)) || null;
    }

    return makeAccount({
        id: chat.id,
        type: chat.type,
        title: (chat as any).title || "",
        username: (chat as any).username || "",
    });
}

export async function getContext(
    msg: Message,
    ctx: CommandContext<Context>,
    nomland: NomlandNode,
    ctxMap?: Map<string, string>
): Promise<Accountish | null> {
    if (msg.chat.type === "private") {
        // TODO: What private chat means?
        return null;
    }

    // Firstly to get the context id from group mappings
    const groupId = getChatId(msg);
    if (ctxMap && ctxMap.has(groupId)) {
        return Number(ctxMap.get(groupId)) || null;
    }

    const ctxHandle = getContextHandle(msg);
    const contextId = await getCharacter(ctxHandle, nomland);
    if (Number(contextId) === 0) {
        const chatInfo = await ctx.api.getChat(msg.chat.id);
        if ("linked_chat_id" in chatInfo) {
            const channelId = (chatInfo as any).linked_chat_id.toString();
            const linkedChatInfo = await ctx.api.getChat(channelId);
            if (linkedChatInfo.type === "channel") {
                const context = makeAccount(msg.chat);
                context.nickname = linkedChatInfo.title;
                context.description = linkedChatInfo.description;
                return context;
            }
        }
        const context = makeAccount(msg.chat);
        return context;
    } else {
        return contextId;
    }
}

export async function getContextFromChatId(
    groupId: string, // with out -100
    ctx: CommandContext<Context>,
    nomland: NomlandNode,
    ctxMap?: Map<string, string>
): Promise<Accountish | null> {
    // Firstly to get the context id from group mappings
    if (ctxMap && ctxMap.has(groupId)) {
        return Number(ctxMap.get(groupId)) || null;
    }

    const ctxHandle = getContextHandle("-100" + groupId);

    const contextId = await getCharacter(ctxHandle, nomland);

    if (Number(contextId) === 0) {
        const chatInfo = await ctx.api.getChat("-100" + groupId);
        const context = makeAccount({
            id: +groupId,
            type: "group",
            title: (chatInfo as any).title || "",
            description: (chatInfo as any).description || "",
        });
        return context;
    } else {
        return contextId;
    }
}

export function getNoteKey(noteKeyString: string) {
    const [characterId, noteId] = noteKeyString.split("-");
    return {
        characterId,
        noteId,
    };
}

export function decomposeMsgLink(link: string) {
    const parts = link.split("/");
    const msgId = parts.pop();
    let chatId;
    const chatOrTopicId = parts.pop();
    const nextPart = parts.pop();
    if (nextPart !== "c" && nextPart !== "t.me") {
        chatId = nextPart;
    } else {
        chatId = chatOrTopicId;
    }

    return [chatId, msgId];
}

export async function getKeyFromGroupMessageLink(
    link: string,
    bot: Bot,
    reply: (text: string) => void
) {
    const [chatId, msgId] = decomposeMsgLink(link);
    if (!chatId || !msgId) return [null, null];

    let chatNumId = chatId;
    // if chatId is not a number, it's a username
    if (isNaN(Number(chatId))) {
        const chatInfo = await bot.api.getChat("@" + chatId);
        if (chatInfo.type !== "group" && chatInfo.type !== "supergroup") {
            reply(
                "It's not a group chat message. Please input the correct chat message link."
            );
            return [null, null];
        }
        chatNumId = chatInfo.id.toString().slice(4);
    }
    return [chatNumId, msgId];
}

export function storeContextMapValue(
    key: string,
    value: string,
    contextMap: Map<string, string>
) {
    if (setKeyValue(key, value, settings.contextMapTblName)) {
        contextMap.set(key, value);
    }
}

export function storeMsg(
    idMap: Map<string, string>,
    msgKey: string,
    noteKey: NoteKey
) {
    const { characterId, noteId } = noteKey;
    const postId = characterId.toString() + "-" + noteId.toString();

    if (setKeyValue(msgKey, postId, settings.idMapTblName)) {
        idMap.set(msgKey, postId);
    }
}

function getChannelBroadcastAuthor(
    channelAdmins: (ChatMemberOwner | ChatMemberAdministrator)[],
    sig: string
) {
    return channelAdmins.find((admin) =>
        admin.user.last_name
            ? admin.user.first_name + " " + admin.user.last_name === sig
            : admin.user.first_name === sig
    )?.user;
}

// Only apply to channel sharing
function filterUrl(url: string | null | undefined) {
    if (!url) return null;
    const ignoreList = [
        "notion.site",
        "notion.so",
        "docs.google.com",
        "meet.google.com",
        "photos.google.com",
        "drive.google.com",
        "calendar.google.com",
        "dropbox",
        "dropbox.com",
        "discord.gg",
        "zoom.us",
        "zoom.com",
        "meeting.tencent.com",
        "tally.so",
        "twitter.com/i/spaces/",
        "lu.ma",
        "app.sola.day",
        "artsandculture.google.com",
        "google.com/map",
        "google.com/travel",
        "store.google.com",
    ];
    if (ignoreList.some((i) => url.includes(i))) {
        return null;
    }
    return url;
}

function getContextHandle(msgOrId: Message | string) {
    if (typeof msgOrId === "string")
        return formatHandle({
            handle: hashOf(msgOrId, 12),
            platform: "Telegram",
        });

    const handle = hashOf(msgOrId.chat.id.toString(), 12);
    return formatHandle({
        handle,
        platform: "Telegram",
    });
}

// TODO: import from nomland
async function getCharacter(handle: string, nomland: Nomland) {
    const { data } = await nomland.contract.character.getByHandle({
        handle,
    });
    return data.characterId;
}

// TODO: import from nomland
function hashOf(content: string, digits = 4, suffix = true): string {
    const hash = md5(content);
    if (suffix) return hash.slice(hash.length - digits, hash.length);
    else return hash.slice(0, digits);
}
