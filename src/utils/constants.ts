import { settings } from "../config";

export function helpMsg(botUsername: string, mode: "dm" | "group" | "admin") {
    //TODO: /admin command shows the admin commands
    const adminCommands = `
  /addlist <list name> <list description>: add a new list (coming soon)
  /dellist <list name>: delete a list (coming soon)
  /list: list all the lists (coming soon)
  /list <list name>: list all the items in a list (coming soon)
  /add <list name> <item>: add an item to a list (coming soon)
  /del <list name> <item>: delete an item from a list (coming soon)
  /help: show this message`;

    if (mode === "dm")
        return `
  Hi! I'm nunti. 
  
  I'm designed to be used in a Telegram (TG) group or TG channel.

  If you're an admin of a group, you can add me to the TG group and grant me admin permissions. I can help improve your community's sharing experience and make it easier to build your brand.

  I can also be utilized in a TG channel that is connected with a group. You'll need to add me as an admin in both the channel and the group.

  Anyone can share something in the group by pasting the URL and then mentioning me. For example:

  "This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBook"

  If you are a Telegram Channel Admin, you do not need to include "@${botUsername}" when sharing in the Telegram Channel.

  Responding to any existing share message will be recorded along with the share. (Welcome! Discussion is encouraged!)

  Feel free to give us some feedback at ${settings.media.telegram}
  `;
    else
        return `Hi! I'm nunti.
      
    Anyone can share something in the group. Just paste the URL and then mention me. For example:
    
    "This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBook"
    
    If you are a Telegram Channel Admin, you do not need to include "@${botUsername}" when sharing in the Telegram Channel.

    Feel free to give us some feedback at ${settings.media.telegram}
    `;
}
