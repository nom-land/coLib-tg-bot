import { Message } from "grammy/types";
import { cleanContent, getTagsOrList, makeRawCuration } from "./common";
import { settings } from "../config";
import Nomland, { Accountish, Parser, makeAccount } from "nomland.js";
import { log } from "./log";

export async function processCuration(
    nom: Nomland,
    url: string,
    curationMsg: Message,
    community: Accountish,
    botName: string,
    parser: Parser
) {
    try {
        if (!curationMsg.text) return null;
        if (!curationMsg.from) return null;

        const curator = makeAccount(curationMsg.from);
        const raws = makeRawCuration(curationMsg);

        const contentAfterBot = curationMsg.text.split(botName)[1];
        const tagsOrList = getTagsOrList(contentAfterBot);
        const comment = cleanContent(curationMsg.text);

        const { tagSuggestions, listSuggestions } = await nom.getTagsAndLists(
            tagsOrList,
            community
        );
        if (listSuggestions.length == 0) {
            listSuggestions.push(settings.defaultCurationList);
        }

        console.log(
            JSON.stringify({
                curator,
                community,
                lists: listSuggestions,
                reason: {
                    comment,
                    tagSuggestions,
                },
                raws,
            })
        );

        const { curatorId, noteId } = await nom.processCuration(
            {
                curator,
                community,
                lists: listSuggestions,
                reason: {
                    comment,
                    tagSuggestions,
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
