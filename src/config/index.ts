import { NoteKey } from "nomland.js";

export const settings = {
    adminGroupId: process.env.ADMIN_GROUP_ID || "",
    adminBindContextTopicId: Number(process.env.ADMIN_BIND_CONTEXT_TOPIC),
    adminCreateShareTopicId: Number(process.env.ADMIN_CREATE_SHARE_TOPIC),
    adminCreateReplyTopicId: Number(process.env.ADMIN_CREATE_REPLY_TOPIC),
    adminErrorLogTopicId: Number(process.env.ADMIN_ERROR_LOG_TOPIC),
    adminEditTopicId: Number(process.env.ADMIN_EDIT_TOPIC),
    adminWatchChatTopicId: Number(process.env.ADMIN_WATCH_CHAT_TOPIC),
    appName: "nunti", //will be used in the "sources" of metadata
    idMapTblName: "nunti-idMap",
    contextMapTblName: "group-context-map",
    watchTopicListTblName: "watch-topic-list",
    defaultCurationList: "general", //will be used in the new created linklist in the community
    media: {
        telegram: "https://t.me/nomland",
    },
    prompt: {
        load: "⛏️ Processing...",
        // (Sorry I'm a little slow for now - but all my content is stored decentrally using blockchain so it's worth it)",
        groupSucceed(noteKey: NoteKey<string>) {
            return `🎉 Share is successfully processed. See: ${feedbackUrl(
                noteKey
            )}
✉️ All replies will also be recorded.`;
        },
        channelSucceed(noteKey: NoteKey<string>) {
            return `📒 Discussion aggregation feature is supported by <a href="${feedbackUrl(
                noteKey
            )}">CoLib</a>.`;
        },

        fail: "😢 Nunti needs more time to process sharing. But don’t worry, nunti will continue trying and update the progress.",
    },
};

export function feedbackUrl(noteKey: NoteKey<string>) {
    const { characterId, noteId } = noteKey;
    return `https://colib.app/curation/${characterId}-${noteId}`;
}
