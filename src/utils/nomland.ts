import { cleanContent, getTags } from "./common";
import Nomland, { Accountish, Parser, RawCuration } from "nomland.js";
import { log } from "./log";
import { NoteMetadata } from "crossbell";

export async function processCuration(
    nom: Nomland,
    url: string,
    text: string,
    raws: RawCuration[],
    curator: Accountish,
    msgAttachments: NoteMetadata["attachments"],
    community: Accountish,
    botName: string,
    replyToPostId: string | undefined,
    parser: Parser
) {
    try {
        const contentAfterBot = text.split(botName)[1];
        const tags = getTags(contentAfterBot).map((t) => t.slice(1));
        const comment = cleanContent(text);

        const { curatorId, noteId } = await nom.processCuration(
            {
                curator,
                community,
                reason: {
                    comment,
                    tagSuggestions: tags,
                    attachments: msgAttachments,
                },
                raws, //TODO: support multiple raws
                raw: raws[0],
            },
            url,
            replyToPostId,
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
