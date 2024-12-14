const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const schedule = require("node-schedule");
require("dotenv").config();

const token = process.env.TOKEN;

const bot = new TelegramBot(token, { polling: true });

let tasks = [];
let nextId = 1;

async function saveTasksToFile() {
  const tasksToSave = tasks.map(({ reminderJob, ...rest }) => rest);
  fs.writeFileSync("tasks.json", JSON.stringify(tasksToSave, null, 2), "utf8");
}

async function loadTasksFromFile() {
  if (fs.existsSync("tasks.json")) {
    const savedTasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));
    tasks = savedTasks.map((task) => ({
      ...task,
      reminderJob: null,
    }));

    nextId = tasks.length ? Math.max(...tasks.map((task) => task.id)) + 1 : 1;

    tasks.forEach((task) => {
      if (task.reminderTime) {
        const chatId = task.chatId;
        scheduleReminder(task, chatId);
      }
    });
  }
}

loadTasksFromFile();

function createTaskWithReminder(text, reminderTime) {
  return {
    id: nextId++,
    text,
    done: false,
    reminderTime,
    reminderJob: null,
  };
}

function updateTasks(chatId, page = 1, pageSize = 5) {
  const totalPages = Math.ceil(tasks.length / pageSize);
  if (tasks.length === 0) {
    bot.sendMessage(chatId, "У вас немає завдань.");
    return;
  }

  if (page < 1 || page > totalPages) {
    bot.sendMessage(chatId, "Невірна сторінка.");
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const tasksToShow = tasks.slice(start, end);

  const taskButtons = tasksToShow.map((task) => [
    {
      text: `${task.id}. ${task.text} - ${task.done ? "✅" : "❌"}`,
      callback_data: `done_${task.id}`,
    },
  ]);

  const paginationButtons = [];
  if (page > 1) {
    paginationButtons.push({
      text: "⬅️ Попередня",
      callback_data: `page_${page - 1}`,
    });
  }
  if (page < totalPages) {
    paginationButtons.push({
      text: "➡️ Наступна",
      callback_data: `page_${page + 1}`,
    });
  }

  bot.sendMessage(chatId, `Ваші завдання (сторінка ${page} з ${totalPages}):`, {
    reply_markup: {
      inline_keyboard: [...taskButtons, paginationButtons],
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
    if (reminderDate <= new Date()) {
      bot.sendMessage(chatId, "Дата нагадування має бути у майбутньому.");
      return;
    }

    if (reminderDate > new Date()) {
      task.reminderJob = schedule.scheduleJob(reminderDate, () => {
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
    updateTasks(chatId, 1);
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  if (action.startsWith("reminder_yes_")) {
    let taskText = action.replace("reminder_yes_", "");
    bot.sendMessage(chatId, "Введіть рік нагадування (YYYY):");

    bot.once("message", (msg) => {
      const year = msg.text;

      if (isNaN(year) || year.length !== 4) {
        bot.sendMessage(chatId, "Невірний рік. Спробуйте ще раз.");
        return;
      }

      bot.sendMessage(chatId, "Введіть місяць (MM):");

      bot.once("message", (msg) => {
        const month = msg.text;

        if (isNaN(month) || month < 1 || month > 12) {
          bot.sendMessage(chatId, "Невірний місяць. Спробуйте ще раз.");
          return;
        }

        bot.sendMessage(chatId, "Введіть день (DD):");

        bot.once("message", (msg) => {
          const day = msg.text;

          if (isNaN(day) || day < 1 || day > 31) {
            bot.sendMessage(chatId, "Невірний день. Спробуйте ще раз.");
            return;
          }

          bot.sendMessage(chatId, "Введіть годину (HH):");

          bot.once("message", (msg) => {
            const hour = msg.text;

            if (isNaN(hour) || hour < 0 || hour > 23) {
              bot.sendMessage(chatId, "Невірна година. Спробуйте ще раз.");
              return;
            }

            bot.sendMessage(chatId, "Введіть хвилини (MM):");

            bot.once("message", (msg) => {
              const minute = msg.text;

              if (isNaN(minute) || minute < 0 || minute > 59) {
                bot.sendMessage(chatId, "Невірні хвилини. Спробуйте ще раз.");
                return;
              }

              const reminderTime = `${year}-${month}-${day} ${hour}:${minute}`;
              const newTask = createTaskWithReminder(taskText, reminderTime);
              tasks.push(newTask);

              saveTasksToFile();
              scheduleReminder(newTask, chatId);

              bot.sendMessage(
                chatId,
                `Завдання додано: "${taskText}" з нагадуванням.`
              );
              updateTasks(chatId);
            });
          });
        });
      });
    });
  } else if (action.startsWith("done_")) {
    const taskId = parseInt(action.replace("done_", ""), 10);
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex !== -1) {
      const task = tasks[taskIndex];
      tasks.splice(taskIndex, 1);
      saveTasksToFile();

      bot.sendMessage(
        chatId,
        `Завдання "${task.text}" виконане та видалене ✅.`
      );
      updateTasks(chatId);
    } else {
      bot.sendMessage(chatId, "Завдання не знайдено.");
    }
  } else if (action.startsWith("reminder_no_")) {
    const taskText = action.replace("reminder_no_", "");
    const newTask = createTaskWithReminder(taskText, null);
    tasks.push(newTask);

    saveTasksToFile();

    bot.sendMessage(chatId, `Завдання додано: "${taskText}".`);
    updateTasks(chatId);
  } else if (action.startsWith("page_")) {
    const page = parseInt(action.replace("page_", ""), 10);
    updateTasks(chatId, page);
  }
});
