export const settings = {
    appName: "nunti", //will be used in the "sources" of metadata
    idMapTblName: "nunti-idMap",
    contextMapTblName: "group-context-map",
    defaultCurationList: "general", //will be used in the new created linklist in the community
    prompt: {
        load: "⛏️ Processing...",
        // (Sorry I'm a little slow for now - but all my content is stored decentrally using blockchain so it's worth it)",
        succeed(curatorId: string, noteId: string) {
            return `🎉 Share is successfully processed. See: ${feedbackUrl(
                curatorId,
                noteId
            )}
✉️ Attention: all replies will also be recorded.`;
        },
        fail: "😢 Nunti needs more time to process sharing. But don’t worry, nunti will continue trying and update the progress.",
    },
};

export function feedbackUrl(curatorId: string, noteId: string) {
    return `https://colib.app/curation/${curatorId}-${noteId}`;
}
