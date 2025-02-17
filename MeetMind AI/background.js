// Service worker olarak çalışacak background script
let activeTab = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Uzantı yüklendi ve başlatıldı");
});

// Content script ile iletişim için message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "saveTranscript") {
    // Transcript'i kaydetme işlemleri burada yapılabilir
    console.log("Transcript kaydedildi:", request.data);
  } else if (request.action === "startRecording") {
    startCapture(sender.tab.id);
    sendResponse({ received: true });
  } else if (request.action === "stopRecording") {
    stopCapture();
    sendResponse({ received: true });
  }
  return true;
});

// Tab değişikliklerini dinle
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Desteklenen toplantı platformları için URL kontrolleri
  const meetingUrls = ["meet.google.com", "zoom.us", "teams.microsoft.com"];

  if (changeInfo.status === "complete" && tab.url) {
    const url = new URL(tab.url);
    if (meetingUrls.some((meetingUrl) => url.hostname.includes(meetingUrl))) {
      // Toplantı sayfası tespit edildi
      console.log("Toplantı sayfası tespit edildi:", tab.url);
    }
  }
});

// Ses yakalama fonksiyonları
async function startCapture(tabId) {
  try {
    const stream = await chrome.tabCapture.capture({
      audio: true,
      video: false,
    });

    activeTab = tabId;

    // Stream'i content script'e gönder
    chrome.tabs.sendMessage(tabId, {
      action: "streamReady",
      stream: stream,
    });
  } catch (error) {
    console.error("Ses yakalama hatası:", error);
    chrome.tabs.sendMessage(tabId, {
      action: "error",
      error: error.message,
    });
  }
}

function stopCapture() {
  if (activeTab) {
    chrome.tabs.sendMessage(activeTab, {
      action: "stopStream",
    });
    activeTab = null;
  }
}
