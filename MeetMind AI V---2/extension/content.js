const timeFormat = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};
const extensionStatusJSON_bug = {
  status: 400,
  message:
    "<strong>MeetMind AI encountered a new error</strong> <br /> Please report it <a href='https://github.com/SU1NEG/MeetMind-AI/issues' target='_blank'>here</a>.",
};
const reportErrorMessage =
  "There is a bug in MeetMind AI. Please report it at https://github.com/SU1NEG/MeetMind-AI/issues";
const mutationConfig = {
  childList: true,
  attributes: true,
  subtree: true,
  characterData: true,
};

let userName = "You";
overWriteChromeStorage(["userName"], false);
let transcript = [];
overWriteChromeStorage(["transcript"], false);
let personNameBuffer = "",
  transcriptTextBuffer = "",
  timeStampBuffer = undefined;
let beforePersonName = "",
  beforeTranscriptText = "";
let chatMessages = [];
overWriteChromeStorage(["chatMessages"], false);

let meetingStartTimeStamp = new Date()
  .toLocaleString("default", timeFormat)
  .replace(/[/:]/g, "-")
  .toUpperCase();
let meetingTitle = document.title;
overWriteChromeStorage(["meetingStartTimeStamp", "meetingTitle"], false);
let isTranscriptDomErrorCaptured = false;
let isChatMessagesDomErrorCaptured = false;
let hasMeetingStarted = false;
let hasMeetingEnded = false;

let extensionStatusJSON;

let canUseAriaBasedTranscriptSelector = true;

checkExtensionStatus().then(() => {
  chrome.storage.local.get(["extensionStatusJSON"], function (result) {
    extensionStatusJSON = result.extensionStatusJSON;
    console.log("Extension status " + extensionStatusJSON.status);

    if (extensionStatusJSON.status == 200) {
      waitForElement(".awLEm").then(() => {
        const captureUserNameInterval = setInterval(() => {
          userName = document.querySelector(".awLEm").textContent;
          if (userName || hasMeetingStarted) {
            clearInterval(captureUserNameInterval);
            if (userName != "") overWriteChromeStorage(["userName"], false);
          }
        }, 100);
      });

      meetingRoutines(2);
    } else {
      showNotification(extensionStatusJSON);
    }
  });
});

function meetingRoutines(uiType) {
  const meetingEndIconData = {
    selector: "",
    text: "",
  };
  const captionsIconData = {
    selector: "",
    text: "",
  };
  switch (uiType) {
    case 1:
      meetingEndIconData.selector = ".google-material-icons";
      meetingEndIconData.text = "call_end";
      captionsIconData.selector = ".material-icons-extended";
      captionsIconData.text = "closed_caption_off";
      break;
    case 2:
      meetingEndIconData.selector = ".google-symbols";
      meetingEndIconData.text = "call_end";
      captionsIconData.selector = ".google-symbols";
      captionsIconData.text = "closed_caption_off";
    default:
      break;
  }

  waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(
    () => {
      console.log("Meeting started");
      chrome.runtime.sendMessage(
        { type: "new_meeting_started" },
        function (response) {
          console.log(response);
        }
      );
      hasMeetingStarted = true;

      setTimeout(() => updateMeetingTitle(), 5000);

      let transcriptObserver;
      let chatMessagesObserver;

      try {
        const captionsButton = selectElements(
          captionsIconData.selector,
          captionsIconData.text
        )[0];

        chrome.storage.sync.get(["operationMode"], function (result) {
          if (result.operationMode == "manual")
            console.log("Manual mode selected, leaving transcript off");
          else captionsButton.click();
        });

        let transcriptTargetNode = document.querySelector(
          'div[role="region"][tabindex="0"]'
        );
        if (!transcriptTargetNode) {
          transcriptTargetNode = document.querySelector(".a4cQT");
          canUseAriaBasedTranscriptSelector = false;
        }

        canUseAriaBasedTranscriptSelector
          ? transcriptTargetNode.setAttribute("style", "opacity:0.2")
          : transcriptTargetNode.childNodes[1].setAttribute(
              "style",
              "opacity:0.2"
            );

        transcriptObserver = new MutationObserver(transcriptMutationCallback);

        transcriptObserver.observe(transcriptTargetNode, mutationConfig);
      } catch (err) {
        console.error(err);
        isTranscriptDomErrorCaptured = true;
        showNotification(extensionStatusJSON_bug);

        logError("001", err);
      }

      try {
        const chatMessagesButton = selectElements(".google-symbols", "chat")[0];
        chatMessagesButton.click();

        waitForElement('div[aria-live="polite"].Ge9Kpc').then(() => {
          chatMessagesButton.click();
          try {
            const chatMessagesTargetNode = document.querySelector(
              'div[aria-live="polite"].Ge9Kpc'
            );

            chatMessagesObserver = new MutationObserver(
              chatMessagesMutationCallback
            );

            chatMessagesObserver.observe(
              chatMessagesTargetNode,
              mutationConfig
            );
          } catch (err) {
            console.error(err);
            showNotification(extensionStatusJSON_bug);

            logError("002", err);
          }
        });
      } catch (err) {
        console.error(err);
        isChatMessagesDomErrorCaptured = true;
        showNotification(extensionStatusJSON_bug);

        logError("003", err);
      }

      if (!isTranscriptDomErrorCaptured && !isChatMessagesDomErrorCaptured) {
        chrome.storage.sync.get(["operationMode"], function (result) {
          if (result.operationMode == "manual") {
            showNotification({
              status: 400,
              message:
                "<strong>MeetMind AI is not running</strong> <br /> Turn on captions using the CC icon, if needed",
            });
          } else {
            showNotification(extensionStatusJSON);
          }
        });
      }

      try {
        selectElements(
          meetingEndIconData.selector,
          meetingEndIconData.text
        )[0].parentElement.parentElement.addEventListener("click", () => {
          hasMeetingEnded = true;
          if (transcriptObserver) {
            transcriptObserver.disconnect();
          }
          if (chatMessagesObserver) {
            chatMessagesObserver.disconnect();
          }

          if (personNameBuffer != "" && transcriptTextBuffer != "")
            pushBufferToTranscript();
          overWriteChromeStorage(["transcript", "chatMessages"], true);
        });
      } catch (err) {
        console.error(err);
        showNotification(extensionStatusJSON_bug);

        logError("004", err);
      }
    }
  );
}

function transcriptMutationCallback(mutationsList, observer) {
  mutationsList.forEach((mutation) => {
    try {
      const peopleSelector = canUseAriaBasedTranscriptSelector
        ? 'div[role="region"][tabindex="0"]'
        : ".a4cQT";
      const transcriptRoot = document.querySelector(peopleSelector);

      if (!transcriptRoot) {
        return;
      }

      const people = canUseAriaBasedTranscriptSelector
        ? transcriptRoot.children
        : transcriptRoot.childNodes[1]?.firstChild?.childNodes;

      if (!people) {
        return;
      }

      if (people.length > 0) {
        const personIndex = canUseAriaBasedTranscriptSelector
          ? Math.max(0, people.length - 2)
          : Math.max(0, people.length - 1);
        const person = people[personIndex];

        if (!person) {
          return;
        }

        if (!person.childNodes || person.childNodes.length < 2) {
          return;
        }

        const personNameElement = person.childNodes[0];
        const transcriptTextContainer = person.childNodes[1];

        if (
          !personNameElement ||
          typeof personNameElement.textContent === "undefined"
        ) {
          return;
        }
        const currentPersonName = personNameElement.textContent;

        if (
          !transcriptTextContainer ||
          !transcriptTextContainer.lastChild ||
          typeof transcriptTextContainer.lastChild.textContent === "undefined"
        ) {
          return;
        }
        const currentTranscriptText =
          transcriptTextContainer.lastChild.textContent;

        if (beforeTranscriptText == "") {
          personNameBuffer = currentPersonName;
          timeStampBuffer = new Date()
            .toLocaleString("default", timeFormat)
            .toUpperCase();
          beforeTranscriptText = currentTranscriptText;
          transcriptTextBuffer = currentTranscriptText;
        } else {
          if (personNameBuffer != currentPersonName) {
            pushBufferToTranscript();
            beforeTranscriptText = currentTranscriptText;
            personNameBuffer = currentPersonName;
            timeStampBuffer = new Date()
              .toLocaleString("default", timeFormat)
              .toUpperCase();
            transcriptTextBuffer = currentTranscriptText;
          } else {
            if (canUseAriaBasedTranscriptSelector) {
              if (
                currentTranscriptText.length - transcriptTextBuffer.length <
                -250
              ) {
                pushBufferToTranscript();
              }
            }
            transcriptTextBuffer = currentTranscriptText;
            timeStampBuffer = new Date()
              .toLocaleString("default", timeFormat)
              .toUpperCase();
            beforeTranscriptText = currentTranscriptText;
            if (!canUseAriaBasedTranscriptSelector) {
              if (currentTranscriptText.length > 250) person.remove();
            }
          }
        }
      } else {
        console.log("No active transcript");
        if (personNameBuffer != "" && transcriptTextBuffer != "") {
          pushBufferToTranscript();
        }
        beforePersonName = "";
        beforeTranscriptText = "";
        personNameBuffer = "";
        transcriptTextBuffer = "";
      }
      if (transcriptTextBuffer.length > 125) {
        console.log(
          transcriptTextBuffer.slice(0, 50) +
            " ... " +
            transcriptTextBuffer.slice(-50)
        );
      } else {
        console.log(transcriptTextBuffer);
      }
    } catch (err) {
      console.error(err);
      if (!isTranscriptDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage);
        showNotification(extensionStatusJSON_bug);

        logError("005", err);
      }
      isTranscriptDomErrorCaptured = true;
    }
  });
}

function chatMessagesMutationCallback(mutationsList, observer) {
  mutationsList.forEach((mutation) => {
    try {
      const chatMessagesElement = document.querySelector(
        'div[aria-live="polite"].Ge9Kpc'
      );
      if (chatMessagesElement.children.length > 0) {
        const chatMessageElement = chatMessagesElement.lastChild;
        const personName = chatMessageElement.firstChild.firstChild.textContent;
        const timeStamp = new Date()
          .toLocaleString("default", timeFormat)
          .toUpperCase();
        const chatMessageText =
          chatMessageElement.lastChild.lastChild.textContent;

        const chatMessageBlock = {
          personName: personName,
          timeStamp: timeStamp,
          chatMessageText: chatMessageText,
        };

        pushUniqueChatBlock(chatMessageBlock);
      }
    } catch (err) {
      console.error(err);
      if (!isChatMessagesDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage);
        showNotification(extensionStatusJSON_bug);

        logError("006", err);
      }
      isChatMessagesDomErrorCaptured = true;
    }
  });
}

function pushBufferToTranscript() {
  transcript.push({
    personName: personNameBuffer,
    timeStamp: timeStampBuffer,
    personTranscript: transcriptTextBuffer,
  });
  overWriteChromeStorage(["transcript"], false);
}

function pushUniqueChatBlock(chatBlock) {
  const isExisting = chatMessages.some(
    (item) =>
      item.personName == chatBlock.personName &&
      item.timeStamp == chatBlock.timeStamp &&
      chatBlock.chatMessageText.includes(item.chatMessageText)
  );
  if (!isExisting) {
    console.log(chatBlock);
    chatMessages.push(chatBlock);
    overWriteChromeStorage(["chatMessages", false]);
  }
}

function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {};
  if (keys.includes("userName")) objectToSave.userName = userName;
  if (keys.includes("transcript")) objectToSave.transcript = transcript;
  if (keys.includes("meetingTitle")) objectToSave.meetingTitle = meetingTitle;
  if (keys.includes("meetingStartTimeStamp"))
    objectToSave.meetingStartTimeStamp = meetingStartTimeStamp;
  if (keys.includes("chatMessages")) objectToSave.chatMessages = chatMessages;

  chrome.storage.local.set(objectToSave, function () {
    if (sendDownloadMessage) {
      chrome.runtime.sendMessage({ type: "download" }, function (response) {
        console.log(response);
      });
    }
  });
}

function updateMeetingTitle() {
  try {
    const title = document.querySelector(".u6vdEc").textContent;
    const invalidFilenameRegex =
      /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/giu;
    meetingTitle = title.replaceAll(invalidFilenameRegex, "_");
    overWriteChromeStorage(["meetingTitle"], false);
  } catch (err) {
    console.error(err);

    if (!hasMeetingEnded) {
      logError("007", err);
    }
  }
}

function selectElements(selector, text) {
  var elements = document.querySelectorAll(selector);
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent);
  });
}

const waitForElement = async (selector, text) => {
  if (text) {
    while (
      !Array.from(document.querySelectorAll(selector)).find(
        (element) => element.textContent === text
      )
    ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } else {
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return document.querySelector(selector);
};

function showNotification(extensionStatusJSON) {
  let html = document.querySelector("html");
  let obj = document.createElement("div");
  let logo = document.createElement("img");
  let text = document.createElement("p");

  logo.setAttribute(
    "src",
    "https://alperencavus.github.io/MeetMindAI/icon.png"
  );
  logo.setAttribute("height", "32px");
  logo.setAttribute("width", "32px");
  logo.style.cssText = "border-radius: 4px";

  setTimeout(() => {
    obj.style.display = "none";
  }, 5000);

  if (extensionStatusJSON.status == 200) {
    obj.style.cssText = `background: rgba(139, 92, 246, 0.9); color: white; ${commonCSS
      .replace(/background:[^;]+;/g, "")
      .replace(/backdrop-filter:[^;]+;/g, "")}`;
    text.innerHTML = extensionStatusJSON.message;
  } else {
    obj.style.cssText = `background: rgba(255, 165, 0, 0.9); color: white; ${commonCSS
      .replace(/background:[^;]+;/g, "")
      .replace(/backdrop-filter:[^;]+;/g, "")}`;
    text.innerHTML = extensionStatusJSON.message;
  }

  obj.prepend(text);
  obj.prepend(logo);
  if (html) html.append(obj);
}

const commonCSS = ` 
    position: fixed;
    top: 5%; 
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 780px;  
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 1rem; 
    line-height: 1.5; 
    font-family: 'Google Sans',Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`;

function logError(code, err) {
  fetch(
    `https://script.google.com/macros/s/AKfycbxiyQSDmJuC2onXL7pKjXgELK1vA3aLGZL5_BLjzCp7fMoQ8opTzJBNfEHQX_QIzZ-j4Q/exec?version=${
      chrome.runtime.getManifest().version
    }&code=${code}&error=${encodeURIComponent(err)}`,
    { mode: "no-cors" }
  );
}

async function checkExtensionStatus() {
  chrome.storage.local.set({
    extensionStatusJSON: {
      status: 200,
      message:
        "<strong>MeetMind AI is running</strong> <br /> Do not turn off captions",
    },
  });

  await fetch("https://alperencavus.github.io/MeetMindAI/status.json", {
    cache: "no-store",
  })
    .then((response) => response.json())
    .then((result) => {
      chrome.storage.local.set({ extensionStatusJSON: result }, function () {
        console.log("Extension status fetched and saved");
      });
    })
    .catch((err) => {
      console.error(err);

      logError("008", err);
    });
}
