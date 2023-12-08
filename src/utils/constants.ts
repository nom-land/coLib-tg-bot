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
  Hi! I'm nunti. I have to be used in a group. If you are admin of a group, you can add me to the group and give me the admin permission. I can help your community have better sharing experience and help your community easily build your brand.
      
  1. To manage your community sharing lists, you can use the following commands(admin permission required):
${adminCommands}

  2. If you want to share something, just in the group paste the URL then @ me(no permission required). e.g.
  
  This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBook
  
  3. You can also reply to a message containing URL to make a curation(no permission required). e.g.
  
  Message A: This book is amazing!!! https://example.com/u/xyz 
  Message B(replying to A): @${botUsername} #Romantic #AmazingBook
  
  4. Replying to any existed curation message will also be recorded with the curation together. (Welcome! Discussion is encouraged!)
  `;
    else
        return `Hi! I'm nunti.
      
    1. If you want to share something, just in the group paste the URL then @ me. e.g.
    
    This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBook
    
    2. You can also reply to a message containing URL to make a curation. e.g.
    
    Message A: This book is amazing!!! https://example.com/u/xyz 
    Message B(replying to A): @${botUsername} #Romantic #AmazingBook

🕘 Coming Soon: Managing the curation list will be possible.
    `;
}
