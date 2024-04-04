import { Note } from "crossbell";
import { NoteKey } from "nomland.js";

export const settings = {
    adminGroupId: process.env.ADMIN_GROUP_ID || "",
    adminCreateShareTopicId: Number(process.env.ADMIN_CREATE_SHARE_TOPIC),
    appName: "nunti", //will be used in the "sources" of metadata
    idMapTblName: "nunti-idMap",
    contextMapTblName: "group-context-map",
    defaultCurationList: "general", //will be used in the new created linklist in the community
    prompt: {
        load: "⛏️ Processing...",
        // (Sorry I'm a little slow for now - but all my content is stored decentrally using blockchain so it's worth it)",
        succeed(noteKey: NoteKey<string>) {
            return `🎉 Share is successfully processed. See: ${feedbackUrl(
                noteKey
            )}
✉️ All replies will also be recorded.`;
        },
        fail: "😢 Nunti needs more time to process sharing. But don’t worry, nunti will continue trying and update the progress.",
    },
};

export function feedbackUrl(noteKey: NoteKey<string>) {
    const { characterId, noteId } = noteKey;
    return `https://colib.app/curation/${characterId}-${noteId}`;
}
