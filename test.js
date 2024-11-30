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
    reminderJob: null, // Додаємо поле для зберігання запланованої задачі
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
      task.reminderJob = schedule.scheduleJob(reminderDate, () => {
        bot.sendMessage(chatId, `⏰ Нагадування про завдання: "${task.text}"`, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Повторити",
                  callback_data: `reminder_repeat_${task.id}`,
                },
                { text: "Ні", callback_data: `reminder_no_${task.id}` },
              ],
            ],
          },
        });
      });
    }
  }
}

// Функція для додавання 3 годин до часу нагадування
function addThreeHoursToReminderTime(reminderTime) {
  const newTime = new Date(reminderTime);
  newTime.setHours(newTime.getHours() + 3); // додаємо 3 години
  return newTime;
}

bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (msg.text === "Додати завдання") {
    bot.sendMessage(chatId, "Введіть текст завдання:");
    bot.once("message", (msg) => {
      const taskText = msg.text;

      // Додаємо кнопки для вибору, чи робити нагадування
      bot.sendMessage(chatId, "Чи хочете ви додати нагадування?", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Так", callback_data: `reminder_yes_${taskText}` },
              { text: "Ні", callback_data: `reminder_no_${taskText}` },
            ],
          ],
        },
      });
    });
  } else if (msg.text === "Мої завдання") {
    updateTasks(chatId);
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const taskId = parseInt(action.split("_")[2], 10);

  if (action.startsWith("reminder_yes_")) {
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

      bot.sendMessage(chatId, `Завдання додано: "${taskText}" з нагадуванням.`);
      updateTasks(chatId);
    });
  } else if (action.startsWith("reminder_no_")) {
    const newTask = createTaskWithReminder(taskText, null);
    tasks.push(newTask);

    saveTasksToFile();
    bot.sendMessage(chatId, `Завдання додано: "${taskText}" без нагадування.`);
    updateTasks(chatId);
  } else if (action.startsWith("done_")) {
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
  } else if (action.startsWith("reminder_repeat_")) {
    const taskIndex = tasks.findIndex((task) => task.id === taskId);
    if (taskIndex >= 0) {
      const task = tasks[taskIndex];

      // Додаємо 3 години до часу нагадування
      const newReminderTime = addThreeHoursToReminderTime(task.reminderTime);
      task.reminderTime = newReminderTime;
      saveTasksToFile();

      // Скасувати попереднє нагадування та створити нове
      if (task.reminderJob) {
        task.reminderJob.cancel();
      }

      scheduleReminder(task, chatId);

      bot.sendMessage(chatId, `Нагадування буде повторено через 3 години.`);
    }
  }
});
