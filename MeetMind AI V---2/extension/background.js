chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Received message in background script:", message);

  if (message.type === "get_transcript") {
    chrome.storage.local.get(
      ["transcriptContent", "savedTranscripts"],
      function (result) {
        sendResponse({
          content: result.transcriptContent,
          savedTranscripts: result.savedTranscripts || {},
        });
      }
    );
    return true;
  }

  if (message.type === "save_transcript") {
    saveTranscriptToStorage(
      message.content,
      message.title,
      message.meetingId
    ).then(function (result) {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === "summarize_transcript") {
    const meetingId = message.meetingId || "current";
    console.log("Summarize transcript request for meeting:", meetingId);

    sendResponse({ status: "started" });

    summarizeWithGemini(meetingId).then(function (result) {
      if (result.success) {
        // Notify UI that summary is ready
        chrome.runtime.sendMessage({
          type: "summary_ready",
          meetingId: meetingId,
        });
      } else {
        // Log error and notify UI about the error
        logError("summarization_error", result.error);
        chrome.runtime.sendMessage({
          type: "summarization_error",
          message: result.error,
        });
      }
    });

    return true;
  }

  if (message.type === "get_summaries") {
    chrome.storage.local.get(null, function (result) {
      // Filter keys to find all summaries
      const summaryKeys = Object.keys(result).filter((key) =>
        key.startsWith("summary_")
      );
      const summaries = {};

      summaryKeys.forEach((key) => {
        summaries[key] = result[key];
      });

      sendResponse({ summaries: summaries });
    });
    return true;
  }

  if (message.type == "new_meeting_started") {
    // Saving current tab id, to download transcript when this tab is closed
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const tabId = tabs[0].id;
      chrome.storage.local.set({ meetingTabId: tabId }, function () {
        console.log("Meeting tab id saved");
      });
    });
  }
  if (message.type == "download") {
    // Invalidate tab id since transcript is downloaded, prevents double downloading of transcript from tab closed event listener
    chrome.storage.local.set({ meetingTabId: null }, function () {
      console.log("Meeting tab id cleared");
    });
    saveTranscriptToStorage();
  }
  if (message.type == "get_meeting_list") {
    chrome.storage.local.get(["savedTranscripts"], function (result) {
      const transcripts = result.savedTranscripts || {};
      sendResponse({
        meetings: Object.keys(transcripts).map((id) => ({
          id,
          title: transcripts[id].title || "Toplantı " + id,
          date: transcripts[id].date || new Date().toLocaleString(),
        })),
      });
    });
    return true;
  }
  return true;
});

// Toplantı sekmesi kapandığında transcript'i kaydet
chrome.tabs.onRemoved.addListener(function (tabid) {
  chrome.storage.local.get(["meetingTabId"], function (data) {
    if (tabid == data.meetingTabId) {
      console.log("Successfully intercepted tab close");
      saveTranscriptToStorage();
      // Clearing meetingTabId to prevent misfires of onRemoved until next meeting actually starts
      chrome.storage.local.set({ meetingTabId: null }, function () {
        console.log("Meeting tab id cleared for next meeting");
      });
    }
  });
});

// Yeni fonksiyon: Transcript'i localStorage'a kaydet
function saveTranscriptToStorage() {
  chrome.storage.local.get(
    [
      "userName",
      "transcript",
      "chatMessages",
      "meetingTitle",
      "meetingStartTimeStamp",
    ],
    function (result) {
      if (
        result.userName &&
        (result.transcript.length > 0 || result.chatMessages.length > 0)
      ) {
        // Create an array to store lines of the text file
        const lines = [];

        // Toplantı başlığı oluştur
        const meetingTitle = result.meetingTitle || "Toplantı";
        const meetingTime =
          result.meetingStartTimeStamp || new Date().toLocaleString();

        if (result.transcript.length > 0) {
          // Iterate through the transcript array and format each entry
          result.transcript.forEach((entry) => {
            lines.push(`${entry.personName} (${entry.timeStamp})`);
            lines.push(entry.personTranscript);
            // Add an empty line between entries
            lines.push("");
          });
          lines.push("");
          lines.push("");
        }

        if (result.chatMessages.length > 0) {
          // Iterate through the chat messages array and format each entry
          lines.push("---------------");
          lines.push("CHAT MESSAGES");
          lines.push("---------------");
          result.chatMessages.forEach((entry) => {
            lines.push(`${entry.personName} (${entry.timeStamp})`);
            lines.push(entry.chatMessageText);
            // Add an empty line between entries
            lines.push("");
          });
          lines.push("");
          lines.push("");
        }

        // Add branding
        lines.push("---------------");
        lines.push("Transcript saved using MeetMind AI Chrome extension");
        lines.push("---------------");

        // Join the lines into a single string, replace "You" with userName from storage
        const textContent = lines
          .join("\n")
          .replace(/You \(/g, result.userName + " (");

        // Save transcript with ID for later selection
        const meetingId = saveTranscriptWithId(
          textContent,
          meetingTitle,
          meetingTime
        );

        // Save the transcript content to storage for use with Gemini
        chrome.storage.local.set(
          {
            transcriptContent: textContent,
            currentTranscriptId: meetingId,
          },
          function () {
            console.log(
              "Transcript content saved to storage for summarization"
            );
          }
        );

        console.log("Transcript saved to storage instead of downloading");
      } else console.log("No transcript found");
    }
  );
}

// API anahtarı bilgileri - dene/geliştir durumunda değiştirilebilir
const GEMINI_API_KEY = "AIzaSyAouVx_k0BhdlXECUNKXqW9Ze1YPRGprM0";
const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Function to call Gemini API to summarize the transcript
async function summarizeWithGemini(meetingId) {
  try {
    console.log("summarizeWithGemini called with meetingId:", meetingId);

    // API anahtarını kontrol et
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "") {
      console.error("API key is missing");
      return {
        success: false,
        error:
          "API anahtarı bulunamadı. Lütfen background.js dosyasında API anahtarınızı ayarlayın.",
      };
    }

    // Transkript içeriğini al - önce savedTranscripts içinden almayı dene
    let transcriptData = null;

    await new Promise((resolve) => {
      chrome.storage.local.get(["savedTranscripts"], (result) => {
        const savedTranscripts = result.savedTranscripts || {};
        if (savedTranscripts[meetingId]) {
          console.log("Found transcript in savedTranscripts");
          transcriptData = savedTranscripts[meetingId];
        }
        resolve();
      });
    });

    // Eğer savedTranscripts içinde yoksa, doğrudan meetingId ile almayı dene
    if (!transcriptData) {
      await new Promise((resolve) => {
        chrome.storage.local.get([meetingId], (result) => {
          console.log("Direct lookup result:", result);
          if (result[meetingId]) {
            console.log("Found transcript with direct meetingId lookup");
            transcriptData = result[meetingId];
          }
          resolve();
        });
      });
    }

    // Hala bulunamadıysa, currentTranscriptId'yi kontrol et
    if (!transcriptData) {
      await new Promise((resolve) => {
        chrome.storage.local.get(
          ["transcriptContent", "currentTranscriptId"],
          (result) => {
            if (
              result.transcriptContent &&
              (meetingId === "current" ||
                meetingId === result.currentTranscriptId)
            ) {
              console.log("Using current transcript content");
              // transcriptContent'ten yeni bir transcriptData objesi oluştur
              transcriptData = {
                content: result.transcriptContent,
                title: "Mevcut Toplantı",
                date: new Date().toLocaleString(),
              };
            }
            resolve();
          }
        );
      });
    }

    if (!transcriptData || !transcriptData.content) {
      console.error("Transcript content not found for meetingId:", meetingId);
      return {
        success: false,
        error: "Toplantı içeriği bulunamadı. Lütfen önce bir toplantı seçin.",
      };
    }

    // Transkript içeriğinin uzunluğunu kontrol et
    console.log(
      "Transcript data found, length:",
      transcriptData.content.length
    );

    if (transcriptData.content.length < 50) {
      console.error("Transcript content too short");
      return {
        success: false,
        error:
          "Toplantı içeriği çok kısa. Lütfen geçerli bir toplantı içeriği olduğundan emin olun.",
      };
    }

    // Toplantı metni çok uzunsa maksimum 10000 karaktere kısalt (token limitlerini aşmamak için)
    let content = transcriptData.content;
    if (content.length > 10000) {
      console.log("Transcript too long, trimming to 10000 characters");
      content = content.substring(0, 10000) + "\n...(devamı kısaltıldı)";
    }

    // Çoklu ajan yaklaşımı için farklı prompt'lar tanımla
    const promptTypes = [
      {
        type: "general_summary",
        prompt: "Bu toplantı transkriptinin genel bir özetini çıkar",
      },
      {
        type: "date_events",
        prompt:
          "Bu toplantı transkriptinde bahsedilen tüm tarihleri ve ilgili etkinlikleri listele",
      },
      {
        type: "key_topics",
        prompt:
          "Bu toplantı transkriptindeki önemli konuları madde madde listele",
      },
      {
        type: "tasks",
        prompt:
          "Bu toplantı transkriptinde atanan görevleri ve sorumluları listele",
      },
    ];

    // Tüm ajanlara istekleri gönder ve sonuçları topla
    const summaryResults = {};
    console.log("Starting API requests");

    // Her bir prompt için sırayla API çağrısı yap
    for (const promptItem of promptTypes) {
      try {
        console.log(`Processing prompt type: ${promptItem.type}`);

        // Güncellenmiş istek formatı (gemini-2.0-flash modeli için)
        const requestBody = {
          contents: [
            {
              parts: [
                {
                  text: `${promptItem.prompt}:\n\n${content}`,
                },
              ],
            },
          ],
        };

        console.log(`Sending API request for ${promptItem.type}...`);

        // API çağrısı yap
        const url = `${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`;
        console.log(`Request URL: ${url.substring(0, 60)}...`);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        console.log(
          `Response status for ${promptItem.type}:`,
          response.status,
          response.statusText
        );

        if (!response.ok) {
          let errorDetails = "";
          try {
            const errorData = await response.json();
            console.error("API error details:", errorData);
            if (errorData.error && errorData.error.message) {
              errorDetails = errorData.error.message;
            }
          } catch (e) {
            errorDetails = await response.text();
          }

          console.error(
            `API error for ${promptItem.type}:`,
            response.status,
            response.statusText
          );
          summaryResults[
            promptItem.type
          ] = `API yanıtı alınamadı: Hata ${response.status}. ${errorDetails}`;
          continue;
        }

        const responseData = await response.json();
        console.log(`Received response for ${promptItem.type}`);

        // Yanıt formatını kontrol et ve özeti al
        if (
          responseData &&
          responseData.candidates &&
          responseData.candidates[0] &&
          responseData.candidates[0].content &&
          responseData.candidates[0].content.parts &&
          responseData.candidates[0].content.parts[0] &&
          responseData.candidates[0].content.parts[0].text
        ) {
          const summaryText = responseData.candidates[0].content.parts[0].text;
          console.log(`Summary created for ${promptItem.type}`);
          summaryResults[promptItem.type] = summaryText;
        } else {
          console.error("Unexpected response format:", responseData);
          summaryResults[promptItem.type] = "API yanıtı beklenmeyen formatta.";
        }
      } catch (error) {
        console.error(`Error in API request for ${promptItem.type}:`, error);
        summaryResults[promptItem.type] = `API hatası: ${error.message}`;
      }

      // API istekleri arasında bekle (rate limit aşmamak için)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Özeti kaydet
    const summaryId = `summary_${meetingId}`;
    const summaryData = {
      meetingId: meetingId,
      title: transcriptData.title || "Adsız Toplantı",
      date: transcriptData.date || new Date().toISOString(),
      summary: summaryResults,
    };

    console.log("Saving summary to Chrome storage with ID:", summaryId);
    await new Promise((resolve) => {
      chrome.storage.local.set({ [summaryId]: summaryData }, () => {
        console.log("Summary saved successfully");
        resolve();
      });
    });

    console.log("Summary saved:", summaryData);
    return { success: true, data: summaryData };
  } catch (error) {
    console.error("Error in summarizeWithGemini:", error);
    return { success: false, error: error.message };
  }
}

// Function to log errors
function logError(source, message, details = null) {
  const errorLog = {
    source,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  console.error("Error logged:", errorLog);

  // Get existing error logs
  chrome.storage.local.get(["errorLogs"], function (result) {
    const logs = result.errorLogs || [];
    logs.push(errorLog);

    // Keep only last 100 errors
    if (logs.length > 100) {
      logs.shift();
    }

    // Save updated logs
    chrome.storage.local.set({ errorLogs: logs });
  });
}

// Function to save transcript with ID for later selection
function saveTranscriptWithId(transcriptContent, meetingTitle, meetingTime) {
  const meetingId = Date.now().toString();

  chrome.storage.local.get(["savedTranscripts"], function (result) {
    const savedTranscripts = result.savedTranscripts || {};

    savedTranscripts[meetingId] = {
      content: transcriptContent,
      title: meetingTitle || `Toplantı ${meetingId}`,
      date: meetingTime || new Date().toLocaleString(),
    };

    chrome.storage.local.set(
      {
        savedTranscripts: savedTranscripts,
        currentTranscriptId: meetingId,
      },
      function () {
        console.log("Transcript saved with ID: " + meetingId);
      }
    );
  });

  return meetingId;
}
