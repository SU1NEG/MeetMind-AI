let isRecording = false;

document
  .getElementById("startRecording")
  .addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    chrome.tabs.sendMessage(
      tab.id,
      { action: "startRecording" },
      (response) => {
        if (response && response.received) {
          isRecording = true;
          updateUI();
          console.log("Kayıt başlatma mesajı gönderildi ve alındı");
        }
      }
    );
  });

document.getElementById("stopRecording").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(
    tab.id,
    { action: "stopRecording" },
    async (response) => {
      if (response && response.received) {
        isRecording = false;
        updateUI();
        console.log("Kayıt durdurma mesajı gönderildi ve alındı");

        showNotification("Kayıt başarıyla tamamlandı ve kaydedildi!");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        displaySavedNotes();
      }
    }
  );
});

function updateUI() {
  const startButton = document.getElementById("startRecording");
  const stopButton = document.getElementById("stopRecording");
  const statusDiv = document.getElementById("recordingStatus");

  startButton.disabled = isRecording;
  stopButton.disabled = !isRecording;

  if (isRecording) {
    statusDiv.classList.add("recording");
  } else {
    statusDiv.classList.remove("recording");
  }
}

function showNotification(message) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #4caf50;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 1000;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 3000);
}

async function deleteMeeting(index) {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["meetings"], resolve);
  });

  if (result.meetings) {
    result.meetings.splice(index, 1);
    await new Promise((resolve) => {
      chrome.storage.local.set({ meetings: result.meetings }, resolve);
    });
    showNotification("Not başarıyla silindi!");
    displaySavedNotes();
  }
}

async function displaySavedNotes() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(["meetings"], (data) => {
        console.log("Okunan storage verisi:", data);
        resolve(data);
      });
    });

    const notesContainer = document.getElementById("savedNotes");
    notesContainer.innerHTML = "<h3>Kaydedilen Notlar</h3>";

    if (result.meetings && result.meetings.length > 0) {
      console.log("Gösterilecek toplantı sayısı:", result.meetings.length);

      result.meetings.forEach((meeting, index) => {
        const noteDiv = document.createElement("div");
        noteDiv.className = "noteItem";

        // Debug için içerik kontrolü
        console.log(`Toplantı ${index + 1} içeriği:`, meeting.content);

        const contentDiv = document.createElement("div");
        contentDiv.innerHTML = `
          <strong>Toplantı ${index + 1}</strong><br>
          <small>${new Date(meeting.timestamp).toLocaleString()}</small><br>
          <small>${
            meeting.content
              ? meeting.content.substring(0, 50) + "..."
              : "İçerik yok"
          }</small>
        `;

        contentDiv.addEventListener("click", () => {
          console.log("Not detayları açılıyor:", meeting);
          openNoteDetails(meeting);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "deleteBtn";
        deleteBtn.innerHTML = "×";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Bu notu silmek istediğinizden emin misiniz?")) {
            deleteMeeting(index);
          }
        });

        noteDiv.appendChild(contentDiv);
        noteDiv.appendChild(deleteBtn);
        notesContainer.appendChild(noteDiv);
      });
    } else {
      console.log("Kayıtlı not bulunamadı");
      notesContainer.innerHTML += "<p>Henüz kaydedilmiş not bulunmuyor.</p>";
    }
  } catch (error) {
    console.error("Notları görüntüleme hatası:", error);
    document.getElementById("savedNotes").innerHTML =
      '<p style="color: red;">Notlar yüklenirken bir hata oluştu.</p>';
  }
}

async function openNoteDetails(meeting) {
  await new Promise((resolve) => {
    chrome.storage.local.set({ currentMeeting: meeting }, resolve);
  });

  chrome.windows.create({
    url: "noteDetails.html",
    type: "popup",
    width: 800,
    height: 600,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateUI();
  displaySavedNotes();
});
