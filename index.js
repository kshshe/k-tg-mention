require("dotenv").config();
const { Telegraf } = require("telegraf");
const storage = require("node-persist");

const bot = new Telegraf(process.env.TOKEN);

const storages = {};

const getOrCreateStorage = async (storageName) => {
  if (storages[storageName]) {
    return storages[storageName];
  }

  const newStorage = await storage.create({
    dir: `.storage/${storageName}`,
    ttl: false,
    forgiveParseErrors: true,
  });
  await newStorage.init();
  return newStorage;
};

const setItem = async (storageName, item, value) => {
  const currentStorage = await getOrCreateStorage(storageName);
  return currentStorage.setItem(`${item}`, JSON.stringify(value));
};

const removeItem = async (storageName, item, value) => {
  const currentStorage = await getOrCreateStorage(storageName);
  return currentStorage.removeItem(`${item}`);
};

const getItem = async (storageName, item, fallback) => {
  try {
    const currentStorage = await getOrCreateStorage(storageName);
    const storedItem = JSON.parse(await currentStorage.getItem(`${item}`));
    return storedItem || fallback;
  } catch {
    return fallback;
  }
};

const saveChatUser = async (chatId, userInfo) => {
  const {
    is_bot: isBot,
    id: memberId,
    first_name: firstName,
    username,
  } = userInfo;
  if (isBot) {
    return;
  }
  await setItem(`${chatId}/members/info`, memberId, {
    memberId,
    firstName,
    username,
  });
  const membersList = await getItem(`${chatId}/members/list`, chatId, []);
  if (!membersList.some((id) => id == memberId)) {
    await setItem(`${chatId}/members/list`, chatId, [...membersList, memberId]);
  }
};

(async () => {
  bot.hears(/@all/gi, async (ctx) => {
    const chatId = ctx.chat.id;

    const membersList = await getItem(`${chatId}/members/list`, chatId, []);
    const mentions = await Promise.all(
      membersList.map(async (memberId) => {
        const userInfo = await getItem(`${chatId}/members/info`, memberId, {});
        const displayName = userInfo.firstName || userInfo.username || "ты";
        return `[${displayName}](tg://user?id=${memberId})`;
      })
    );
    await ctx.reply(`${mentions.join(", ")}`, {
      parse_mode: "Markdown",
    });
  });
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    await saveChatUser(chatId, ctx.message.from);
  });
  bot.on("new_chat_member", async (ctx) => {
    const chatId = ctx.chat.id;
    await saveChatUser(chatId, ctx.message.new_chat_member);
  });
  bot.on("left_chat_member", async (ctx) => {
    const chatId = ctx.chat.id;
    const {
      is_bot: isBot,
      id: memberId,
      first_name: firstName,
      username,
    } = ctx.message.left_chat_member;
    if (!isBot) {
      console.log("left", { memberId, firstName, username, chatId });
      const membersList = await getItem(`${chatId}/members/list`, chatId, []);
      await removeItem(`${chatId}/members/info`, memberId);
      await setItem(
        `${chatId}/members/list`,
        chatId,
        membersList.filter((id) => id !== memberId)
      );
    }
  });

  await bot.launch();
  console.log("running");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
})();
