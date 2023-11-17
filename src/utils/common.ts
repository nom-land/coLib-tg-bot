import { Message } from "grammy/types";
import { RawCuration } from "nomland.js";
import { makeMsgLink } from "./telegram";

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
export function getTagsOrList(str: string) {
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
        let communityName = "Telegram";
        if ("title" in msg.chat) {
            communityName = msg.chat.title;
        }

        const topicName =
            msg.reply_to_message?.forum_topic_created?.name || "General";
        const msgLink = makeMsgLink(msg);
        const raw = {
            content: msg.text,
            sources: [communityName, topicName],
            date_published: convertDate(msg.date),
        } as RawCuration;
        if (msgLink) {
            raw.external_url = msgLink;
        }
        raws.push(raw);
    }

    return raws;
}
