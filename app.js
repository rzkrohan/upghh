// UpToGH — upload file/dokumen/media ke GitHub repository
// © 2026 rizky rohan

const API_BASE = "https://api.github.com";

const state = {
  username: "",
  token: "",
  selectedFiles: [],
};

// ---------- Elements ----------
const loginCard = document.getElementById("loginCard");
const uploadCard = document.getElementById("uploadCard");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const ghUsername = document.getElementById("ghUsername");
const ghToken = document.getElementById("ghToken");

const userChip = document.getElementById("userChip");
const userChipName = document.getElementById("userChipName");
const logoutBtn = document.getElementById("logoutBtn");

const uploadForm = document.getElementById("uploadForm");
const uploadBtn = document.getElementById("uploadBtn");
const repoNameInput = document.getElementById("repoName");
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const dropzoneTitle = document.getElementById("dropzoneTitle");

const zipToggleRow = document.getElementById("zipToggleRow");
const zipToggle = document.getElementById("zipToggle");

const progressBox = document.getElementById("progressBox");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const logList = document.getElementById("logList");

const resultBox = document.getElementById("resultBox");
const resultLink = document.getElementById("resultLink");

// ---------- Helpers ----------
function authHeaders() {
  return {
    Authorization: `Bearer ${state.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function setLoading(btn, loading, textWhileLoading) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = textWhileLoading;
  } else if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
  }
}

function logLine(text, status) {
  const li = document.createElement("li");
  li.textContent = text;
  if (status) li.classList.add(status);
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
}

function setProgress(done, total, label) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressLabel.textContent = label || `${done} / ${total} file selesai (${pct}%)`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Gagal membaca file: " + file.name));
    reader.readAsDataURL(file);
  });
}

function isZipFile(file) {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip")
  );
}

// ---------- Login ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const username = ghUsername.value.trim();
  const token = ghToken.value.trim();

  if (!username || !token) return;

  setLoading(loginBtn, true, "Memeriksa...");
  try {
    const res = await fetch(`${API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      throw new Error(
        res.status === 401
          ? "Token tidak valid atau sudah kedaluwarsa."
          : `Gagal masuk (status ${res.status}).`
      );
    }

    const data = await res.json();
    const actualLogin = (data.login || "").toLowerCase();

    if (actualLogin !== username.toLowerCase()) {
      throw new Error(
        `Token ini milik akun "${data.login}", bukan "${username}". Periksa kembali username kamu.`
      );
    }

    state.username = data.login;
    state.token = token;

    userChipName.textContent = data.login;
    userChip.hidden = false;
    loginCard.hidden = true;
    uploadCard.hidden = false;
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  } finally {
    setLoading(loginBtn, false);
  }
});

logoutBtn.addEventListener("click", () => {
  state.username = "";
  state.token = "";
  state.selectedFiles = [];
  ghToken.value = "";
  userChip.hidden = true;
  uploadCard.hidden = true;
  loginCard.hidden = false;
  resetUploadUI();
});

// ---------- File selection ----------
fileInput.addEventListener("change", () => {
  state.selectedFiles = Array.from(fileInput.files || []);
  updateDropzoneLabel();
  updateZipToggleVisibility();
});

["dragover", "dragenter"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length) {
    state.selectedFiles = files;
    fileInput.files = e.dataTransfer.files;
    updateDropzoneLabel();
    updateZipToggleVisibility();
  }
});

function updateDropzoneLabel() {
  if (state.selectedFiles.length === 0) {
    dropzoneTitle.textContent = "Klik atau seret file ke sini";
  } else if (state.selectedFiles.length === 1) {
    dropzoneTitle.textContent = state.selectedFiles[0].name;
  } else {
    dropzoneTitle.textContent = `${state.selectedFiles.length} file dipilih`;
  }
}

function updateZipToggleVisibility() {
  const hasZip = state.selectedFiles.some(isZipFile);
  zipToggleRow.hidden = !hasZip;
  if (!hasZip) zipToggle.checked = false;
}

// ---------- Upload ----------
uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const repo = repoNameInput.value.trim();
  if (!repo) return;
  if (state.selectedFiles.length === 0) {
    alert("Pilih minimal satu file terlebih dahulu.");
    return;
  }

  resetProgressUI();
  progressBox.hidden = false;
  setLoading(uploadBtn, true, "Mengupload...");

  try {
    await ensureRepoExists(repo);

    const uploadPlan = await buildUploadPlan(state.selectedFiles, zipToggle.checked);

    let done = 0;
    setProgress(done, uploadPlan.length);

    for (const item of uploadPlan) {
      try {
        await uploadFileToRepo(repo, item.path, item.base64Content);
        done += 1;
        logLine(`✔ ${item.path}`, "ok");
      } catch (err) {
        logLine(`✘ ${item.path} — ${err.message}`, "fail");
      }
      setProgress(done, uploadPlan.length);
    }

    const repoUrl = `https://github.com/${state.username}/${repo}`;
    resultLink.textContent = repoUrl;
    resultLink.href = repoUrl;
    resultBox.hidden = false;
    progressLabel.textContent = `Selesai — ${done} / ${uploadPlan.length} file berhasil diupload.`;
  } catch (err) {
    logLine(`✘ ${err.message}`, "fail");
    progressLabel.textContent = "Upload gagal. Lihat log di atas.";
  } finally {
    setLoading(uploadBtn, false);
  }
});

async function ensureRepoExists(repo) {
  const checkRes = await fetch(`${API_BASE}/repos/${state.username}/${repo}`, {
    headers: authHeaders(),
  });

  if (checkRes.ok) {
    logLine(`Repository "${repo}" ditemukan.`, "ok");
    return;
  }

  if (checkRes.status !== 404) {
    throw new Error(`Gagal memeriksa repository (status ${checkRes.status}).`);
  }

  logLine(`Repository "${repo}" belum ada, membuat repository baru...`);
  const createRes = await fetch(`${API_BASE}/user/repos`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: repo, private: false, auto_init: true }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.message || `Gagal membuat repository (status ${createRes.status}).`);
  }

  logLine(`Repository "${repo}" berhasil dibuat.`, "ok");
}

async function buildUploadPlan(files, extractZip) {
  const plan = [];

  for (const file of files) {
    if (extractZip && isZipFile(file)) {
      logLine(`Mengekstrak "${file.name}"...`);
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir);

      for (const entry of entries) {
        const base64Content = await entry.async("base64");
        plan.push({ path: entry.name, base64Content });
      }
      logLine(`"${file.name}" diekstrak menjadi ${entries.length} file.`, "ok");
    } else {
      const base64Content = await readFileAsBase64(file);
      plan.push({ path: file.name, base64Content });
    }
  }

  return plan;
}

async function uploadFileToRepo(repo, path, base64Content) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${API_BASE}/repos/${state.username}/${repo}/contents/${encodedPath}`;

  // check if file already exists to get its sha (needed to update)
  let sha;
  const existingRes = await fetch(url, { headers: authHeaders() });
  if (existingRes.ok) {
    const existingData = await existingRes.json();
    sha = existingData.sha;
  }

  const body = {
    message: sha ? `Update ${path} via UpToGH` : `Upload ${path} via UpToGH`,
    content: base64Content,
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(errData.message || `status ${putRes.status}`);
  }
}

// ---------- UI reset ----------
function resetProgressUI() {
  logList.innerHTML = "";
  progressFill.style.width = "0%";
  progressLabel.textContent = "Menyiapkan upload...";
  resultBox.hidden = true;
}

function resetUploadUI() {
  repoNameInput.value = "";
  fileInput.value = "";
  state.selectedFiles = [];
  updateDropzoneLabel();
  zipToggleRow.hidden = true;
  zipToggle.checked = false;
  progressBox.hidden = true;
  resultBox.hidden = true;
  logList.innerHTML = "";
}
