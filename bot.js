const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const token = "7544451313:AAHhCZh2iOsSUJes_1m3jxu-cLJy0uSKC8g";

// інстанс бота
const bot = new TelegramBot(token, { polling: true });

let tasks = [];
let nextId = 1; // Змінна для ID завдання

// Функція для збереження JSON
function saveTasksToFile() {
  fs.writeFileSync("tasks.json", JSON.stringify(tasks, null, 2), "utf8");
}

// Функція для завантаження із JSON
function loadTasksFromFile() {
  if (fs.existsSync("tasks.json")) {
    tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));
    nextId = tasks.length ? Math.max(tasks.map((task) => task.id)) + 1 : 1;
  }
}

// Завантажуємо завдання при старті бота
loadTasksFromFile();

function createTask(text) {
  return {
    id: nextId++,
    text: text,
    done: false,
  };
}

// Функція для оновлення завдань
function updateTasks(chatId) {
  if (tasks.length === 0) {
    bot.sendMessage(chatId, "У вас немає завдань.");
    return;
  }

  const taskButtons = tasks.map((task) => [
    {
      text: `${task.id}. ${task.text} - ${task.done ? "✅" : "❌"}`,
      callback_data: `done_${task.id}`,
    },
  ]);

  bot.sendMessage(chatId, "Ваші завдання:", {
    reply_markup: {
      inline_keyboard: taskButtons,
    },
  });
}

// Головне меню
const mainMenu = {
  reply_markup: {
    keyboard: [[{ text: "Додати завдання" }], [{ text: "Мої завдання" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

// Команда для старту бота
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привіт! Обери дію:", mainMenu);
});

// Обробка вибору кнопки "Мої завдання"
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (msg.text === "Мої завдання") {
    if (tasks.length === 0) {
      bot.sendMessage(chatId, "У вас немає завдань.");
    } else {
      updateTasks(chatId);
    }
  } else if (msg.text === "Додати завдання") {
    bot.sendMessage(chatId, "Введіть текст завдання:");
    bot.once("message", (msg) => {
      const taskText = msg.text;
      const newTask = createTask(taskText);
      tasks.push(newTask);

      bot.sendMessage(chatId, `Завдання додано: "${taskText}".`);
      saveTasksToFile();
      updateTasks(chatId);
    });
  }
});

// Обробка кнопок завершення завдань
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  if (action.startsWith("done_")) {
    const taskId = parseInt(action.split("_")[1], 10);

    const taskIndex = tasks.findIndex((task) => task.id === taskId);

    if (taskIndex >= 0) {
      const completedTask = tasks[taskIndex];
      tasks.splice(taskIndex, 1);

      saveTasksToFile();
      await bot.sendMessage(
        chatId,
        `Завдання "${completedTask.text}" виконано!`
      );
      updateTasks(chatId);
    } else {
      bot.sendMessage(chatId, `Невірний номер завдання.`);
    }
  }
});
