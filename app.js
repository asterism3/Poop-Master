// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy, doc, deleteDoc, setDoc, increment, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBTs8gWw2AVxW8prGSdQPe6760f6UcgZIk",
    authDomain: "poopmaster-f3d8a.firebaseapp.com",
    projectId: "poopmaster-f3d8a",
    storageBucket: "poopmaster-f3d8a.firebasestorage.app",
    messagingSenderId: "143478170266",
    appId: "1:143478170266:web:30ba77baa689a4b51e7523",
    measurementId: "G-Y90TJHEK74"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- Data ---
const bristolScale = {
    1: { emoji: '🪨', title: 'Type 1', desc: 'Separate hard lumps, like nuts' },
    2: { emoji: '🍇', title: 'Type 2', desc: 'Sausage-shaped, but lumpy' },
    3: { emoji: '🌽', title: 'Type 3', desc: 'Sausage-like but cracked' },
    4: { emoji: '🌭', title: 'Type 4', desc: 'Smooth sausage, like a snake' },
    5: { emoji: '🍗', title: 'Type 5', desc: 'Soft blobs with clear edges' },
    6: { emoji: '🍦', title: 'Type 6', desc: 'Mushy stool, ragged edges' },
    7: { emoji: '🌊', title: 'Type 7', desc: 'Watery, no solid pieces' }
};

let currentType = 4;
let logs = []; 
let currentUser = null;
let unsubscribe = null; 

// --- DOM Elements ---
const slider = document.getElementById('poopSlider');
const emojiDisplay = document.getElementById('emojiDisplay');
const typeTitle = document.getElementById('typeTitle');
const typeDesc = document.getElementById('typeDesc');
const logBtn = document.getElementById('logBtn');
const calendarGrid = document.getElementById('calendarGrid');
const logsList = document.getElementById('logsList');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const logoutBtn = document.getElementById('logoutBtn');
const storageIndicator = document.getElementById('storageType');

// --- Init ---
function init() {
    updateUI(currentType);
    const now = new Date();
    document.getElementById('currentMonthLabel').innerText = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    // Default to loading local data first
    loadLocalData();
}

// --- Auth Logic ---
googleLoginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(err => {
        alert("Login Error: " + err.message + "\nCheck console for details.");
        console.error(err);
    });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userAvatar.src = user.photoURL;
        googleLoginBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        storageIndicator.innerText = "Cloud (Firebase)";
        storageIndicator.classList.add('text-green-500');
        setupRealtimeListener(user.uid);
    } else {
        currentUser = null;
        if(unsubscribe) unsubscribe(); 
        userProfile.classList.add('hidden');
        googleLoginBtn.classList.remove('hidden');
        storageIndicator.innerText = "Local Device";
        storageIndicator.classList.remove('text-green-500');
        loadLocalData();
    }
});

// --- Data Handling (Hybrid) ---

logBtn.addEventListener('click', async () => {
    if(currentUser) {
        try {
            await addDoc(collection(db, "logs"), {
                uid: currentUser.uid,
                type: currentType,
                timestamp: new Date()
            });
            triggerButtonAnimation();
        } catch (e) { console.error(e); }
    } else {
        const newLog = {
            id: Date.now(),
            type: currentType,
            timestamp: new Date().toISOString()
        };
        const currentLocal = JSON.parse(localStorage.getItem('poopLogs')) || [];
        currentLocal.unshift(newLog);
        localStorage.setItem('poopLogs', JSON.stringify(currentLocal));
        triggerButtonAnimation();
        loadLocalData();
    }
});

window.deleteLog = async function(id) {
    if(!confirm('Delete this entry?')) return;
    if (typeof id === 'string') {
        try { await deleteDoc(doc(db, "logs", id)); } catch(e) { console.error(e); }
    } else {
        let local = JSON.parse(localStorage.getItem('poopLogs')) || [];
        local = local.filter(l => l.id !== id);
        localStorage.setItem('poopLogs', JSON.stringify(local));
        loadLocalData();
    }
};

function loadLocalData() {
    const stored = JSON.parse(localStorage.getItem('poopLogs')) || [];
    logs = stored.map(l => ({
        id: l.id,
        type: l.type,
        dateObj: new Date(l.timestamp)
    }));
    updateAllViews();
}

function setupRealtimeListener(uid) {
    const q = query(
        collection(db, "logs"), 
        where("uid", "==", uid),
        orderBy("timestamp", "desc"),
        limit(20) // Optimization: Only fetch the last 20, not the whole history!
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        logs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Handle timestamp safely (it might be null briefly on local writes)
            const dateObj = data.timestamp ? data.timestamp.toDate() : new Date();
            
            logs.push({
                id: doc.id, 
                ...data,
                dateObj: dateObj 
            });
        });
        updateAllViews();
    }, (error) => {
        // --- THIS IS CRITICAL ---
        // If an index is missing, this will print a link in your browser console.
        // Click that link to auto-create the index.
        console.error("Firebase Query Error:", error);
    });
}

// --- UI Rendering ---
function updateAllViews() {
    renderCalendar();
    renderRecentLogs();
}

function updateUI(type) {
    const data = bristolScale[type];
    emojiDisplay.innerText = data.emoji;
    typeTitle.innerText = data.title;
    typeDesc.innerText = data.desc;
}

function triggerEmojiAnimation() {
    emojiDisplay.classList.remove('emoji-pop');
    void emojiDisplay.offsetWidth; 
    emojiDisplay.classList.add('emoji-pop');
}

function triggerButtonAnimation() {
    logBtn.innerText = "Logged!";
    logBtn.classList.add("bg-green-600");
    logBtn.classList.remove("bg-stone-900");
    setTimeout(() => {
        logBtn.innerHTML = `<span>Log It</span><span id="btnEmoji">👇</span>`;
        logBtn.classList.remove("bg-green-600");
        logBtn.classList.add("bg-stone-900");
    }, 1000);
}

slider.addEventListener('input', (e) => {
    currentType = parseInt(e.target.value);
    updateUI(currentType);
    triggerEmojiAnimation();
});

function renderRecentLogs() {
    logsList.innerHTML = '';
    const recent = logs.slice(0, 5);
    if (recent.length === 0) {
        logsList.innerHTML = '<div class="text-center text-stone-300 text-sm py-4 italic">No logs yet.</div>';
        return;
    }
    recent.forEach(log => {
        const date = log.dateObj;
        const info = bristolScale[log.type];
        const idParam = typeof log.id === 'string' ? `'${log.id}'` : log.id;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded-2xl shadow-sm flex items-center justify-between border border-stone-100';
        div.innerHTML = `
            <div class="flex items-center gap-4">
                <span class="text-3xl">${info.emoji}</span>
                <div>
                    <div class="font-bold text-stone-700">Type ${log.type}</div>
                    <div class="text-xs text-stone-400 font-medium">${date.toLocaleDateString()} &bull; ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
            </div>
            <button onclick="window.deleteLog(${idParam})" class="text-stone-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>`;
        logsList.appendChild(div);
    });
}

function renderCalendar() {
    calendarGrid.innerHTML = '';
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = new Date(year, month, 1).getDay();

    for (let i = 0; i < startOffset; i++) {
        calendarGrid.appendChild(Object.assign(document.createElement('div'), {className: 'calendar-day opacity-0'}));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day bg-stone-100 text-stone-400'; 
        cell.innerText = day;
        const currentDayStart = new Date(year, month, day);
        const currentDayEnd = new Date(year, month, day + 1);
        const dayLogs = logs.filter(log => log.dateObj >= currentDayStart && log.dateObj < currentDayEnd);

        if (dayLogs.length > 0) {
            let intensityClass = 'intensity-1';
            if (dayLogs.length === 2) intensityClass = 'intensity-2';
            if (dayLogs.length >= 3) intensityClass = 'intensity-3';
            cell.className = `calendar-day ${intensityClass} font-bold`;
        }
        if (day === now.getDate() && month === now.getMonth()) {
            cell.classList.add('ring-2', 'ring-stone-800', 'ring-offset-2');
        }
        calendarGrid.appendChild(cell);
    }
}

init();

