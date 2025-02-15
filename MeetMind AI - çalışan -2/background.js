// Service worker olarak çalışacak background script
chrome.runtime.onInstalled.addListener(() => {
  console.log("Uzantı yüklendi ve başlatıldı");
});

// Content script ile iletişim için message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "saveTranscript") {
    // Transcript'i kaydetme işlemleri burada yapılabilir
    console.log("Transcript kaydedildi:", request.data);
  }
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
