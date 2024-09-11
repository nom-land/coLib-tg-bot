import { expect, test } from "vitest";
import { decomposeMsgLink } from "../../src/utils/common";

test("decomposeMsgLink to get correct chatId, topicId and msgId", () => {
    // Public chat with topic
    expect(
        decomposeMsgLink("https://t.me/PublicChatName/3327/3521")
    ).toStrictEqual({
        chatId: "PublicChatName",
        msgId: "3521",
        topicId: "3327",
    });

    // Private chat with topic
    expect(
        decomposeMsgLink("https://t.me/c/1929456123/4113/4114")
    ).toStrictEqual({
        chatId: "1929456123",
        msgId: "4114",
        topicId: "4113",
    });

    // Public topic link
    expect(decomposeMsgLink("https://t.me/PublicChatName/3327")).toStrictEqual({
        chatId: "PublicChatName",
        msgId: "3327",
        topicId: "3327",
    });

    // Private topic link
    expect(decomposeMsgLink("https://t.me/c/1929456123/4113")).toStrictEqual({
        chatId: "1929456123",
        msgId: "4113",
        topicId: "4113",
    });
});
