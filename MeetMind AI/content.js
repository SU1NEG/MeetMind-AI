let recognition = null;
let transcription = "";
let transcriptionContainer = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Mesaj alındı:", request.action);
  if (request.action === "startRecording") {
    transcription = ""; // Yeni kayıt başlatılırken önceki transcription'ı temizle
    startSpeechRecognition();
  } else if (request.action === "stopRecording") {
    stopSpeechRecognition();
  }
  sendResponse({ received: true });
  return true;
});

function startSpeechRecognition() {
  console.log("Kayıt başlatılıyor...");
  if (!recognition) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "tr-TR";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript !== "") {
        transcription += finalTranscript + " ";
        console.log("Yeni metin eklendi:", finalTranscript);
      }

      updateTranscriptionDisplay(transcription + interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error("Konuşma tanıma hatası:", event.error);
    };

    recognition.onend = () => {
      if (recognition) {
        try {
          recognition.start();
        } catch (error) {
          console.error("Kayıt yeniden başlatma hatası:", error);
        }
      }
    };

    try {
      recognition.start();
      createTranscriptionDisplay();
    } catch (error) {
      console.error("Kayıt başlatma hatası:", error);
    }
  }
}

function stopSpeechRecognition() {
  console.log("Kayıt durduruluyor...");

  if (recognition) {
    recognition.stop();
    recognition = null;

    const trimmedTranscription = transcription.trim();
    console.log("Kaydedilecek metin:", trimmedTranscription);

    if (trimmedTranscription) {
      const meetingData = {
        timestamp: Date.now(),
        content: trimmedTranscription,
      };

      saveMeetingData(meetingData)
        .then(() => {
          console.log("Toplantı başarıyla kaydedildi");
          chrome.runtime.sendMessage({
            type: "saveTranscript",
            data: meetingData,
          });
        })
        .catch((error) => {
          console.error("Kaydetme hatası:", error);
        });
    } else {
      console.warn("Kaydedilecek metin bulunamadı");
    }

    if (transcriptionContainer) {
      transcriptionContainer.remove();
      transcriptionContainer = null;
    }

    transcription = "";
  }
}

async function saveMeetingData(meetingData) {
  try {
    const result = await chrome.storage.local.get(["meetings"]);
    const meetings = result.meetings || [];
    meetings.push(meetingData);
    await chrome.storage.local.set({ meetings });
    const verification = await chrome.storage.local.get(["meetings"]);
    console.log("Kayıt sonrası storage durumu:", verification);
    return true;
  } catch (error) {
    console.error("Storage kaydetme hatası:", error);
    throw error;
  }
}

function createTranscriptionDisplay() {
  if (!transcriptionContainer) {
    transcriptionContainer = document.createElement("div");
    transcriptionContainer.id = "transcriptionContainer";
    transcriptionContainer.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      max-width: 300px;
      max-height: 200px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      overflow-y: auto;
      z-index: 10000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;
    document.body.appendChild(transcriptionContainer);
  }
}

function updateTranscriptionDisplay(text) {
  if (transcriptionContainer) {
    transcriptionContainer.textContent = text;
    transcriptionContainer.scrollTop = transcriptionContainer.scrollHeight;
  }
}

window.addEventListener("beforeunload", () => {
  if (recognition) {
    stopSpeechRecognition();
  }
});
