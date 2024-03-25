import { cleanContent, getNoteKey, getTags } from "./common";
import Nomland, { Accountish, Parser, ShareInput } from "nomland.js";
import { log } from "./log";
import { NoteMetadata } from "crossbell";

export async function processShare(
    nomland: Nomland,
    url: string,
    text: string,
    raws: string[],
    curator: Accountish,
    msgAttachments: NoteMetadata["attachments"],
    context: Accountish,
    botName: string,
    replyToPostId: string | undefined,
    parser: Parser
) {
    try {
        const contentAfterBot = text.split(botName)[1];
        const tags = getTags(contentAfterBot).map((t) => t.slice(1));
        const comment = cleanContent(text);

        const shareInput = {
            character: curator,
            context,
            shareDetails: {
                content: comment,
                tags: tags,
                attachments: msgAttachments,
                rawContent: raws,
            },
            entityUrl: url,
            parser,
        } as ShareInput;

        if (replyToPostId) {
            shareInput.replyTo = getNoteKey(replyToPostId);
        }

        const { noteKey } = await nomland.createShare(shareInput);

        return noteKey;
    } catch (e) {
        log.error(e);
        return null;
    }
}
