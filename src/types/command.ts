import { User } from "grammy/types";
import { Accountish, NoteDetails } from "nomland.js";

export interface ReplyParams {
    userType: "hidden_user" | "user";
    user: User | null;
    authorId: string | null;
    details: NoteDetails;
    chatId: string | null;
    replyMsgId: string | null;
    originalMsgId: string | null;
}
export type ManualReplyCmdStatus =
    | "START"
    | "WAIT_AUTHOR_ID"
    | "WAIT_MSG_ID"
    | "WAIT_RPL_MSG_ID";

export interface ChannelShareParams {
    fwdFrom: "channel";
    url: string;
    details: NoteDetails;
    authorAccount: Accountish;
    context: Accountish;
    channelId: string;
    broadcastId: string;
    channelChatId: string;
    chatMsgId: string | null;
}
export interface UserShareParams {
    fwdFrom: "group";
    url: string;
    details: NoteDetails;
    authorAccount: Accountish;
    context: Accountish;
    channelChatId: string;
    chatMsgId: string | null;
}
export type ManualShareCmdStatus =
    | "START"
    | "WAIT_MSG_ID"
    | "WAIT_USER_MSG_ID"
    | "WAIT_RPL_OPTION"
    // | "RPL_OPTION_RECEIVED"
    | "WAIT_EDIT_LINK";
// | "EDI_MSG_ID_RECEIVED";
