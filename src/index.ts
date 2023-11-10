import { Bot } from "grammy";
import "dotenv/config";
import { log } from "./utils/log";

function main() {
    try {
        const botToken = process.env["BOT_TOKEN"] || "";
        const bot = new Bot(botToken);

        bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

        bot.on("message", (ctx) => ctx.reply("Got another message!"));

        bot.start();
        log.info("🎉 Bot is up and running.");
    } catch (error) {
        log.error("🚨 Error starting bot.");
        log.error(error);
    }
}

main();
