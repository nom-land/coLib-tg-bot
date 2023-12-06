import { Message } from "grammy/types";
import { cleanContent, getMsgText, getTags, makeRawCuration } from "./common";
import Nomland, { Accountish, Parser, makeAccount } from "nomland.js";
import { log } from "./log";
import { NoteMetadata } from "crossbell";

export async function processCuration(
    nom: Nomland,
    url: string,
    curationMsg: Message,
    msgAttachments: NoteMetadata["attachments"],
    community: Accountish,
    botName: string,
    parser: Parser
) {
    try {
        const text = getMsgText(curationMsg);
        if (!text) return null;
        if (!curationMsg.from) return null;

        const curator = makeAccount(curationMsg.from);
        const raws = makeRawCuration(curationMsg);

        const contentAfterBot = text.split(botName)[1];
        const tags = getTags(contentAfterBot).map((t) => t.slice(1));
        const comment = cleanContent(text);

        console.log(
            JSON.stringify({
                curator,
                community,
                reason: {
                    comment,
                    tagSuggestions: tags,
                },
                raws,
            })
        );

        const { curatorId, noteId } = await nom.processCuration(
            {
                curator,
                community,
                lists: [],
                reason: {
                    comment,
                    tagSuggestions: tags,
                    attachments: msgAttachments,
                },
                raws, //TODO: support multiple raws
                raw: raws[0],
            },
            url,
            parser
        );
        return {
            curatorId,
            noteId,
        };
    } catch (e) {
        log.error(e);
        return null;
    }
}
