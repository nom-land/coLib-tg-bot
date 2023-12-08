export const settings = {
    appName: "nunti", //will be used in the "sources" of metadata
    idMapTblName: "nunti-idMap",
    defaultCurationList: "general", //will be used in the new created linklist in the community
    prompt: {
        load: "⛏️ Processing...",
        // (Sorry I'm a little slow for now - but all my content is stored decentrally using blockchain so it's worth it)",
        succeed(curatorId: string, noteId: string) {
            return `🎉 Curation is successfully processed. See: ${feedbackUrl(
                curatorId,
                noteId
            )}
✉️ Attention: all replies to this curation will be recorded on chain`;
        },
        fail: "😢 Curation is not successfully processed.",
    },
};

export function feedbackUrl(curatorId: string, noteId: string) {
    return `https://colib.app/curation/${curatorId}-${noteId}`;
}
