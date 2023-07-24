import os from "os";
import inquirer from "inquirer";
import fetch from "node-fetch";
import * as fsPromises from "fs/promises";
import path from "path";
import Table from "cli-table";

//=============================================================================
// const serverURI = "localhost";
const serverURI = "185.185.68.238";
const serverPORT = 3330;
//=============================================================================

import WebSocket from 'ws';

const wsProto = 'ws'
const client = new WebSocket(`${wsProto}://${serverURI}:${serverPORT}`)

let activeTimers = [];
let oldTimers = [];

// TODO заменить путь на путь до временных файлов в системе
// const tempDir = path.dirname(os.tmpdir());
const tempDir = path.dirname(process.argv[1]);
const isWindows = os.type().match(/windows/i);
const sessionFileName = path.normalize(path.join(tempDir, `${isWindows ? "_" : "."}sb-timers-session`));
//=============================================================================
// array question and check
const requireLetterAndNumber = (value) => {
  if (/\w/.test(value) && /\d/.test(value)) {
    return true;
  }
  return "Password need to have at least a letter and a number";
};
//=============================================================================
const questionsUsername = [
  {
    type: "input",
    name: "username",
    message: "Username:",
  },
  {
    type: "password",
    message: "Password:",
    name: "password",
    mask: "*",
    validate: requireLetterAndNumber,
  },
];

const questionsSelect = [
  {
    type: "rawlist",
    name: "userAction",
    message: "Select action",
    choices: [
      'signup',
      'login',
      'exit'
    ],
  },
]

const questionsTimers = [
  {
    type: "rawlist",
    name: "userTimer",
    message: "Select action Timer",
    choices: [
      'start',
      'stop',
      'status',
      'logout'
    ],
  },
]

const questionsStartTimer = [
  {
    type: "input",
    name: "timeName",
    message: "Time name:",
  }
];

const questionsStopTimer = [
  {
    type: "input",
    name: "timeId",
    message: "Time ID:",
  }
];

const questionsStatusOneTimer = [
  {
    type: "input",
    name: "timeId",
    message: "Time ID:",
  }
];

const questionsStatusTimer = [
  {
    type: "rawlist",
    name: "timerStatus",
    message: "Select action status",
    choices: [
      'status one timer',
      'status all active timers',
      'status all old timers',
      'back step',
    ],
  },
]
//=============================================================================
// questions for user



function selectionActions() {
  inquirer.prompt(questionsSelect).then((answer) => {
    switch (answer.userAction) {
      case "signup":
        inquirer.prompt(questionsUsername).then((answerSignup) => {
          dataSendPost("signup", answerSignup).then((resolve) => {
            console.log(resolve.data.responseDB);
            selectionActions();
          });
        });
        break;
      case "login":
        inquirer.prompt(questionsUsername).then((answerLogin) => {
          client.send(JSON.stringify({
            type: "login",
            username: answerLogin.username,
            password: answerLogin.password,
          }))
        });

        break;
      case "exit":
        console.log("Good by");
        process.exit(0)
      default:
        console.log("Not answer");
        selectionActions();
    }
  });


}
//=============================================================================
//
function userTimers() {
  let sessionId = "";
  let timerId = "";
  let description = "";
  inquirer.prompt(questionsTimers).then(async (answers) => {
    switch (answers.userTimer) {
      case "start":
        inquirer.prompt(questionsStartTimer).then(async (answerStartTimer) => {
          description = answerStartTimer.timeName;
          if (description) {
            sessionId = await readFileSessionId();
            if (sessionId) {
              client.send(JSON.stringify({
                type: "timer_start",
                sessionId,
                description,
              }))
            } else {
              console.log(`No file access: SessionId.   Path: ${sessionFileName}`);
              userTimers();
            }
          } else {
            console.log(`No description`);
            userTimers();
          }
        })
        break;
      case "stop":
        inquirer.prompt(questionsStopTimer).then(async (answerStopTimer) => {
          timerId = answerStopTimer.timeId;
          sessionId = await readFileSessionId();
          if (sessionId) {
            client.send(JSON.stringify({
              type: "timer_stop",
              sessionId,
              timerId,
            }))
          } else {
            console.log(`No file access: SessionId.   Path: ${sessionFileName}`);
            userTimers();
          }
        })
        break;
      case "status":
        userTimersStatus();
        break;
      case "logout":
        sessionId = await readFileSessionId();
        if (sessionId) {
          client.send(JSON.stringify({
            type: "logout",
            sessionId,
          }))
        } else {
          console.log(`No file access: SessionId.   Path: ${sessionFileName}`);
        }
        break;
      default:
    }
  })
}
//=============================================================================
//
function userTimersStatus() {
  inquirer.prompt(questionsStatusTimer).then(async (answerStatusTimer) => {
    const sessionId = await readFileSessionId();
    if (sessionId) {
      switch (answerStatusTimer.timerStatus) {
        case "status one timer":
          inquirer.prompt(questionsStatusOneTimer).then((answerStatusOneTimer) => {
            let findTimer = activeTimers.find(function (item, index, array) {
              if (item.id === answerStatusOneTimer.timeId) {
                return true
              } else {
                return false
              }
            });
            if (!findTimer) {
              findTimer = oldTimers.find(function (item, index, array) {
                if (item.id === answerStatusOneTimer.timeId) {
                  return true
                } else {
                  return false
                }
              });
            }
            if (!findTimer) {
              console.log(`No timer ID = ${answerStatusOneTimer.timeId}`)
            } else {
              createTableTimers([findTimer]);
            }
            userTimersStatus();
          })
          break;
        case "status all active timers":
          createTableTimers(activeTimers);
          userTimers();
          break;
        case "status all old timers":
          createTableTimers(oldTimers);
          userTimers();
          break;
        case "back step":
          userTimers();
          break;
        default:
      }
    } else {
      console.log(`No file access: SessionId.   Path: ${sessionFileName}`);
      userTimersStatus()
    }
  })
}
//=============================================================================

client.on("message", (data) => {
  try {
    data = JSON.parse(data)
  } catch (error) {
    console.log('---- error JSON parse ---')
    return
  }

  if (data.type === "auth_success") {
    writeFileSessionId(data.sessionId);
    userTimers();
  }

  if (data.type === "auth_error") {
    console.log(data.message)
    selectionActions();
  }

  if (data.type === "all_timers") {
    activeTimers.splice(0, activeTimers.length);
    data.activeTimers.forEach(element => {
      activeTimers.push(element)
    });
    oldTimers.splice(0, oldTimers.length);
    data.oldTimers.forEach(element => {
      oldTimers.push(element)
    });
  }

  if (data.type === "timer") {
    console.log(`${data.message} ID = ${data.timer_id}`);
    userTimers();
  }

  if (data.type === "timer_error") {
    console.log(data.message)
    userTimers();
  }

  if (data.type === "logout_success") {
    const delFile = deleteFileSessionId();
    delFile.then((result) => {
      console.log(result)
      selectionActions();
    })
  }

  if (data.type === "logout_error") {
    console.log(data.message)
    userTimers();
  }
})


//=============================================================================
// create table for array timers
function createTableTimers(timers) {
  let tableTimers = new Table({ head: ["id", "Task", "Time"] });
  for (let value of timers) {
    let duration = null;
    if (value.is_active === "0") {
      duration = formatDuration(Number(value.duration));
    } else {
      duration = formatDuration(Date.now() - Number(value.start));
    }
    let arrayTimer = [value.id, value.description, duration];
    tableTimers.push(arrayTimer);
  }
  console.log(tableTimers.toString());
}
//=============================================================================
// time calculation
function formatDuration(d) {
  d = Math.floor(d / 1000);
  const s = d % 60;
  d = Math.floor(d / 60);
  const m = d % 60;
  const h = Math.floor(d / 60);
  return [h > 0 ? h : null, m, s]
    .filter((x) => x !== null)
    .map((x) => (x < 10 ? "0" : "") + x)
    .join(":");
}
//=============================================================================
// writing file for sessionId
async function writeFileSessionId(sessionId) {
  console.log("File to keep the session ID:", sessionFileName);
  try {
    await fsPromises.access(tempDir, fsPromises.constants.R_OK | fsPromises.constants.W_OK);
    const promise = await fsPromises.writeFile(sessionFileName, sessionId, { encoding: "utf8" });
    if (!promise) {
      console.log(`Logged in successfully!`);
    } else {
      console.log(`Logged in ERROR`);
    }
  } catch (error) {
    console.error(error);
  }
}
//=============================================================================
// reading file sessionId
async function readFileSessionId() {
  try {
    await fsPromises.access(sessionFileName, fsPromises.constants.R_OK | fsPromises.constants.W_OK);
    const sessionId = await fsPromises.readFile(sessionFileName, { encoding: "utf8" });
    return sessionId;
  } catch (error) {
    return "";
  }
}
//=============================================================================
// deleting file sessionId
async function deleteFileSessionId() {
  try {
    await fsPromises.access(sessionFileName, fsPromises.constants.R_OK | fsPromises.constants.W_OK);
    const promise = await fsPromises.rm(sessionFileName);
    if (!promise) {
      return `Logged out successfully!`
    } else {
      return `Logged out ERROR`
    }
  } catch (error) {
    console.error(error);
  }
}
//=============================================================================
// send request method POST
async function dataSendPost(pathSend, dataBody, dataHeaders = { "Content-Type": "application/json;charset=utf-8" }) {
  try {
    const response = await fetch(`http://${serverURI}:${serverPORT}/${pathSend}`, {
      method: "POST",
      headers: dataHeaders,
      body: JSON.stringify(dataBody),
    });
    const data = await response.json();
    const dataStatus = response.status;
    const info = {
      data,
      dataStatus,
    };
    return info;
  } catch (error) {
    console.log(error);
  }
}
//=============================================================================
// send request method GET
async function dataSendGet(pathSend, dataHeaders) {
  try {
    const response = await fetch(`http://${serverURI}:${serverPORT}/${pathSend}`, {
      method: "GET",
      headers: dataHeaders,
    });
    const data = await response.json();
    const dataStatus = response.status;
    const info = {
      data,
      dataStatus,
    };
    return info;
  } catch (error) {
    console.log(error);
  }
}

selectionActions();
