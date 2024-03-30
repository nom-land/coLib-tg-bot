import Nomland, {
    Accountish,
    NoteDetails,
    NoteKey,
    Parser,
    ShareInput,
} from "nomland.js";
import { log } from "./log";

export async function createShare(
    nomland: Nomland,
    url: string,
    details: NoteDetails,
    curator: Accountish,
    context: Accountish,
    replyToPostId: NoteKey | null,
    parser: Parser
) {
    try {
        const shareInput = {
            author: curator,
            context,
            details,
            entityUrl: url,
            parser,
        } as ShareInput;

        if (replyToPostId) {
            shareInput.replyTo = replyToPostId;
        }

        const { noteKey } = await nomland.createShare(shareInput);

        return noteKey;
    } catch (e) {
        log.error(e);
        return null;
    }
}
