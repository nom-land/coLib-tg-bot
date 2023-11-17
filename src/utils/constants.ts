export function helpMsg(botUsername: string, mode: "dm" | "group" | "admin") {
    const adminCommands = `
  /addlist <list name> <list description>: add a new list
  /dellist <list name>: delete a list
  /list: list all the lists
  /list <list name>: list all the items in a list
  /add <list name> <item>: add an item to a list
  /del <list name> <item>: delete an item from a list
  /help: show this message`;

    if (mode === "dm")
        return `
  Hi! I'm nunti. I have to be used in a group. If you are admin of a group, you can add me to the group and give me the admin permission. I can help your community have better sharing experience and help your community easily build your brand.
      
  1. To manage your community sharing lists, you can use the following commands(admin permission required):
${adminCommands}

  2. If you want to share something, just in the group paste the URL then @ me(no permission required). e.g.
  
  This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBookList
  
  3. You can also reply to a message containing URL to make a curation(no permission required). e.g.
  
  Message A: This book is amazing!!! https://example.com/u/xyz 
  Message B(replying to A): @${botUsername} #Romantic #AmazingBookList
  
  4. Replying to any existed curation message will also be recorded with the curation together. (Welcome! Discussion is encouraged!)
  `;
    else if (mode === "group")
        return `Hi! I'm nunti.
      
    1. If you want to share something, just in the group paste the URL then @ me(no permission required). e.g.
    
    This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBookList
    
    2. You can also reply to a message containing URL to make a curation(no permission required). e.g.
    
    Message A: This book is amazing!!! https://example.com/u/xyz 
    Message B(replying to A): @${botUsername} #Romantic #AmazingBookList
    
    3. Replying to any existed curation message will also be recorded with the curation together. (Welcome! Discussion is encouraged!)
  `;
    else if (mode === "admin")
        return `
    Hi! I'm nunti. I can help your community have better sharing experience and help your community easily build your brand.
      
    1. To manage your community sharing lists, you can use the following commands(admin permission required):
${adminCommands}
  
    2. If you want to share something, just in the group paste the URL then @ me(no permission required). e.g.
    
    This book is amazing!!! https://example.com/u/xyz @${botUsername} #Romantic #AmazingBookList
    
    3. You can also reply to a message containing URL to make a curation(no permission required). e.g.
    
    Message A: This book is amazing!!! https://example.com/u/xyz 
    Message B(replying to A): @${botUsername} #Romantic #AmazingBookList
    
    4. Replying to any existed curation message will also be recorded with the curation together. (Welcome! Discussion is encouraged!)
  `;
    return "";
}
