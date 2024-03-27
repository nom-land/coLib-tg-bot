import { Message, UserProfilePhotos } from "grammy/types";
import NomlandNode, {
    makeAccount,
    formatHandle,
    Accountish,
    TelegramUser,
} from "nomland.js";
import { RawMessage, makeMsgLink } from "./telegram";
import { Bot, CommandContext, Context } from "grammy";
import { ipfsUploadFile } from "crossbell/ipfs";
import { NoteMetadataAttachmentBase } from "crossbell";
import { log } from "./log";

const urlRegex = /(http|https):\/\/[^\s]+/g;
const tagRegex = /#[^\s]+/g;
const mentionsRegex = /@[^\s]+/g;

//TODO: support multiple URLs
export function getFirstUrl(str: string) {
    const urls = str.match(urlRegex);
    return urls ? urls[0] : null;
}

export function cleanContent(str: string) {
    // remove URLs and mentions and tags and trim
    // TODO: Or remove by entities?
    return str
        .replaceAll(urlRegex, "")
        .replaceAll(mentionsRegex, "")
        .replaceAll(tagRegex, "")
        .trim();
}
export function getTags(str: string) {
    const tags = str.match(tagRegex);
    return tags ? tags : [];
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

export function makeRawCuration(msgs: Message | Message[]) {
    const raws = [];
    if (!Array.isArray(msgs)) {
        msgs = [msgs];
    }
    for (const msg of msgs) {
        //TODO: icon_custom_emoji_id and icon_color
        let communityName = "Telegram Community";
        if ("title" in msg.chat) {
            communityName = msg.chat.title;
        }

        const topicName =
            msg.reply_to_message?.forum_topic_created?.name || "General";
        const msgLink = makeMsgLink(msg);
        const raw = {
            content: msg.text,
            sources: ["Telegram", communityName, topicName],
            date_published: convertDate(msg.date),
        } as RawMessage;
        if (msgLink) {
            raw.external_url = msgLink;
        }
        raws.push(JSON.stringify(raw));
    }

    return raws;
}

export function getMsgText(msg: Message) {
    return msg.text || msg.caption;
}

export function getMessageId(msg: Message) {
    const msgId =
        msg.chat.id.toString().slice(4) + "-" + msg.message_id.toString();
    return msgId;
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
    nomland: NomlandNode
) {
    if (!ctx.msg.from) return null;
    const poster = makeAccount(author);

    const handle = formatHandle(poster);

    const { data } = await nomland.contract.character.getByHandle({
        handle,
    });
    if (
        !data.characterId ||
        !data.metadata?.avatars ||
        data.metadata?.avatars?.length === 0
    ) {
        const ipfsFile = await getUserAvatar(ctx, bot.token, author.id);

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

export async function getPosterAccount(
    ctx: CommandContext<Context>,
    bot: Bot,
    nomland: NomlandNode
) {
    if (!ctx.msg.from) return null;
    const poster = makeAccount(ctx.msg.from);

    const handle = formatHandle(poster);

    const { data } = await nomland.contract.character.getByHandle({
        handle,
    });
    if (
        !data.characterId ||
        !data.metadata?.avatars ||
        data.metadata?.avatars?.length === 0
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

export function getContext(
    msg: Message,
    ctxMap?: Map<string, string>
): Accountish | null {
    if (msg.chat.type === "private") {
        // TODO: What private chat means?
        return null;
    }

    // Firstly to get the context id from group mappings
    const groupId = msg.chat.id.toString().slice(4);
    if (ctxMap && ctxMap.has(groupId)) {
        return Number(ctxMap.get(groupId)) || null;
    }

    return makeAccount(msg.chat);
}

export function getNoteKey(noteKeyString: string) {
    const [characterId, noteId] = noteKeyString.split("-");
    return {
        characterId,
        noteId,
    };
}
