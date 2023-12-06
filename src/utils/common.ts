import { Message } from "grammy/types";
import { RawCuration } from "nomland.js";
import { makeMsgLink } from "./telegram";
import { CommandContext, Context } from "grammy";
import { ipfsUploadFile } from "crossbell/ipfs";
import { NoteMetadataAttachmentBase } from "crossbell";

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
        } as RawCuration;
        if (msgLink) {
            raw.external_url = msgLink;
        }
        raws.push(raw);
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

async function getMsgAttachments(
    ctx: CommandContext<Context>,
    msg: Message,
    botToken: string
) {
    try {
        const res = await ctx.getFile();

        const url = `https://api.telegram.org/file/bot${botToken}/${res.file_path}`;

        const response = await fetch(url);
        if (!response.ok || !response.body) {
            throw new Error(`Response error: ${response.statusText}`);
        }

        const ipfsFile = await ipfsUploadFile(await response.blob());
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
