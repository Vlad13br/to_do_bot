const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const schedule = require("node-schedule");
require("dotenv").config();

const token = process.env.TOKEN;

const bot = new TelegramBot(token, { polling: true });

let tasks = [];
let nextId = 1;

function saveTasksToFile() {
  fs.writeFileSync("tasks.json", JSON.stringify(tasks, null, 2), "utf8");
}

function loadTasksFromFile() {
  if (fs.existsSync("tasks.json")) {
    tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));
    nextId = tasks.length ? Math.max(...tasks.map((task) => task.id)) + 1 : 1;
  }
}

loadTasksFromFile();

function createTaskWithReminder(text, reminderTime) {
  return {
    id: nextId++,
    text,
    done: false,
    reminderTime,
  };
}

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

const mainMenu = {
  reply_markup: {
    keyboard: [[{ text: "Додати завдання" }], [{ text: "Мої завдання" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привіт! Обери дію:", mainMenu);
});

function scheduleReminder(task, chatId) {
  if (task.reminderTime) {
    const reminderDate = new Date(task.reminderTime);
    if (reminderDate > new Date()) {
      schedule.scheduleJob(reminderDate, () => {
        bot.sendMessage(chatId, `⏰ Нагадування про завдання: "${task.text}"`);
      });
    }
  }
}

bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (msg.text === "Додати завдання") {
    bot.sendMessage(chatId, "Введіть текст завдання:");
    bot.once("message", (msg) => {
      const taskText = msg.text;

      bot.sendMessage(
        chatId,
        "Введіть дату та час нагадування (YYYY-MM-DD HH:mm):"
      );
      bot.once("message", (msg) => {
        const reminderTime = msg.text;

        // Перевірка на правильність формату дати
        if (isNaN(Date.parse(reminderTime))) {
          bot.sendMessage(chatId, "Невірний формат дати. Спробуйте ще раз.");
          return;
        }

        const newTask = createTaskWithReminder(taskText, reminderTime);
        tasks.push(newTask);

        saveTasksToFile();
        scheduleReminder(newTask, chatId);

        bot.sendMessage(chatId, `Завдання додано: "${taskText}".`);
        updateTasks(chatId);
      });
    });
  } else if (msg.text === "Мої завдання") {
    updateTasks(chatId);
  }
});

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
