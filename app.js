import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy, doc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
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

// --- STATE MANAGEMENT ---
let currentUser = null;
let unsubscribe = null; // To stop listening when logging out
let localLogs = []; // Global store for current logs

// Data Constants
const poopTypes = {
    1: { emoji: '🥜', label: 'Type 1', desc: 'Hard lumps', color: '#78350f' },
    2: { emoji: '🌰', label: 'Type 2', desc: 'Lumpy sausage', color: '#92400e' },
    3: { emoji: '🌭', label: 'Type 3', desc: 'Cracked surface', color: '#b45309' },
    4: { emoji: '💩', label: 'Type 4', desc: 'Normal smooth', color: '#d97706' },
    5: { emoji: '🍦', label: 'Type 5', desc: 'Soft blobs', color: '#f59e0b' },
    6: { emoji: '☁️', label: 'Type 6', desc: 'Mushy', color: '#fbbf24' },
    7: { emoji: '💧', label: 'Type 7', desc: 'Watery', color: '#fcd34d' }
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let displayYear = new Date().getFullYear();
let currentLeaderboardTab = 'today';
let selectedUserId = null;
let lineChartInstance = null;
let pieChartInstance = null;

// --- AUTHENTICATION ---
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignInModal = document.getElementById('googleSignInModal');
const logoutBtn = document.getElementById('logoutBtn');

// Login Function
const loginUser = () => {
    signInWithPopup(auth, provider).catch(err => {
        console.error("Login Error:", err);
        alert("Login failed. See console.");
    });
};

// Logout Function
const logoutUser = () => {
    signOut(auth).then(() => {
        // UI cleanup handled by onAuthStateChanged
        console.log("Signed out");
    });
};

// Listeners
if(googleLoginBtn) googleLoginBtn.addEventListener('click', loginUser);
if(googleSignInModal) googleSignInModal.addEventListener('click', loginUser);
if(logoutBtn) logoutBtn.addEventListener('click', logoutUser);

// Auth State Monitor
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User Logged In
        currentUser = user;
        
        // UI Updates
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('userSection').classList.remove('hidden');
        document.getElementById('notificationSection').classList.remove('hidden');
        document.getElementById('userAvatar').src = user.photoURL;
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('flex');
        
        // Start Listening to Firestore
        setupRealtimeListener(user.uid);
    } else {
        // User Logged Out
        currentUser = null;
        if(unsubscribe) unsubscribe(); // Stop listening to DB
        
        // UI Updates
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('userSection').classList.add('hidden');
        document.getElementById('notificationSection').classList.add('hidden');
        
        // Fallback to LocalStorage
        loadLocalData();
    }
});

// --- DATA HANDLING (Hybrid: Firestore + LocalStorage) ---

// 1. Fetching Data
function setupRealtimeListener(uid) {
    const q = query(
        collection(db, "logs"), 
        where("uid", "==", uid),
        orderBy("timestamp", "desc"),
        limit(500) // Limit to prevent massive reads
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        localLogs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            localLogs.push({
                id: doc.id,
                ...data,
                date: data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString()
            });
        });
        refreshAllViews();
    }, (error) => {
        console.error("Firestore Error:", error);
    });
}

function loadLocalData() {
    localLogs = JSON.parse(localStorage.getItem('poopLogs') || '[]');
    refreshAllViews();
}

// 2. Saving Data
async function saveLog(type) {
    if (currentUser) {
        // Save to Cloud
        try {
            await addDoc(collection(db, "logs"), {
                uid: currentUser.uid,
                type: type,
                timestamp: new Date()
            });
            // Note: UI updates automatically via onSnapshot
        } catch (e) { console.error("Error adding doc: ", e); }
    } else {
        // Save to Local
        localLogs.unshift({ date: new Date().toISOString(), type: type });
        localStorage.setItem('poopLogs', JSON.stringify(localLogs));
        refreshAllViews();
    }
}

// --- UI UPDATES (The logic from your first script) ---

function refreshAllViews() {
    updateStats();
    renderHeatMap();
    renderYearlyHeatMap();
    renderRecentLogs();
    renderLeaderboard(); // Update to show current user stats
}

function updateStats() {
    const logs = localLogs;
    const now = new Date();
    const today = now.toDateString();
    const weekAgo = new Date(now - 604800000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    document.getElementById('todayCount').textContent = logs.filter(l => new Date(l.date).toDateString() === today).length;
    document.getElementById('weekCount').textContent = logs.filter(l => new Date(l.date) >= weekAgo).length;
    document.getElementById('monthCount').textContent = logs.filter(l => new Date(l.date) >= monthStart).length;
}

function renderRecentLogs() {
    const logs = localLogs.slice(0, 5);
    const container = document.getElementById('recentLogs');
    container.innerHTML = logs.length ? logs.map(l => {
        const d = new Date(l.date);
        const t = poopTypes[l.type] || poopTypes[4]; // Fallback
        return `
            <div class="flex items-center justify-between bg-white border-b-4 border-amber-100 rounded-3xl p-4 hover:border-amber-200 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-2xl">${t.emoji}</div>
                    <div>
                        <div class="font-black text-amber-900 text-sm">${t.label}</div>
                        <div class="text-xs font-bold text-amber-400">${t.desc}</div>
                    </div>
                </div>
                <div class="text-xs font-bold text-amber-300">${d.toLocaleDateString([], {month:'short', day:'numeric'})}</div>
            </div>
        `;
    }).join('') : '<div class="text-amber-300 text-center text-sm py-4 font-bold">No logs yet. Start pooping!</div>';
}

function renderHeatMap() {
    const logs = localLogs;
    const container = document.getElementById('heatMap');
    document.getElementById('monthLabel').textContent = `${months[currentMonth]} ${currentYear}`;
    
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayCounts = {};
    
    logs.forEach(l => {
        const d = new Date(l.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            dayCounts[d.getDate()] = (dayCounts[d.getDate()]||0) + 1;
        }
    });

    let html = '';
    for(let i=0; i<firstDay; i++) html += '<div></div>';
    for(let i=1; i<=daysInMonth; i++) {
        const c = dayCounts[i] || 0;
        let color = 'bg-gray-50 text-gray-400';
        if (c===1) color = 'bg-orange-200 text-orange-800';
        if (c===2) color = 'bg-orange-300 text-orange-900';
        if (c>=3) color = 'bg-orange-500 text-white';
        
        const isToday = i === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
        
        html += `<div class="heat-cell aspect-square ${color} rounded-lg flex items-center justify-center text-xs font-bold ${isToday ? 'ring-4 ring-orange-400 ring-offset-2' : ''}">${i}</div>`;
    }
    container.innerHTML = html;
}

function renderYearlyHeatMap() {
    const logs = localLogs;
    const container = document.getElementById('yearlyHeatMapGrid');
    document.getElementById('yearLabel').textContent = displayYear;

    const counts = {};
    logs.forEach(l => {
        const d = new Date(l.date);
        if (d.getFullYear() === displayYear) counts[d.toDateString()] = (counts[d.toDateString()]||0)+1;
    });

    const start = new Date(displayYear, 0, 1);
    while(start.getDay()!==0) start.setDate(start.getDate()-1);
    
    let html = '';
    let curr = new Date(start);
    // 53 weeks roughly
    for(let w=0; w<53; w++) {
        html += '<div class="flex flex-col gap-[3px]">';
        for(let d=0; d<7; d++) {
            const c = counts[curr.toDateString()] || 0;
            const inYear = curr.getFullYear() === displayYear;
            let color = 'bg-gray-100';
            if (inYear) {
                if (c===0) color = 'bg-gray-100';
                else if (c===1) color = 'bg-orange-200';
                else if (c===2) color = 'bg-orange-300';
                else color = 'bg-orange-500';
            } else {
                color = 'bg-transparent';
            }
            html += `<div class="yearly-cell ${color}" title="${curr.toLocaleDateString()}: ${c}"></div>`;
            curr.setDate(curr.getDate()+1);
        }
        html += '</div>';
    }
    container.innerHTML = html;
}

// --- INTERACTION HANDLERS ---

document.getElementById('poopSlider').addEventListener('input', (e) => {
    const t = poopTypes[e.target.value];
    document.getElementById('currentEmoji').textContent = t.emoji;
    document.getElementById('stageLabel').textContent = `${t.label} - ${t.desc}`;
});

document.getElementById('logBtn').addEventListener('click', () => {
    const type = parseInt(document.getElementById('poopSlider').value);
    
    saveLog(type); // Uses the new Async/Hybrid function
    
    // UI Feedback
    const t = document.getElementById('toast');
    t.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 2000);
});

// Heatmap Navigation
document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth--; if(currentMonth<0){currentMonth=11; currentYear--;} renderHeatMap();
});
document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth++; if(currentMonth>11){currentMonth=0; currentYear++;} renderHeatMap();
});
document.getElementById('prevYear').addEventListener('click', () => { displayYear--; renderYearlyHeatMap(); });
document.getElementById('nextYear').addEventListener('click', () => { displayYear++; renderYearlyHeatMap(); });

// Page Navigation (Tabs)
const pages = ['trackerPage', 'leaderboardPage'];
const navs = ['navTracker', 'navLeaderboard'];

navs.forEach((id, idx) => {
    document.getElementById(id).addEventListener('click', () => {
        pages.forEach(p => document.getElementById(p).classList.remove('active'));
        navs.forEach(n => {
            const el = document.getElementById(n);
            el.classList.remove('tab-active');
            el.classList.add('text-gray-500', 'hover:text-gray-900');
        });
        
        document.getElementById(pages[idx]).classList.add('active');
        document.getElementById(id).classList.add('tab-active');
        document.getElementById(id).classList.remove('text-gray-500', 'hover:text-gray-900');
        
        if(idx === 1) renderLeaderboard();
    });
});

// --- LEADERBOARD LOGIC (Sample Data + Real User Integration) ---
// Init Data
if (!localStorage.getItem('sampleUsers_v3')) {
    localStorage.setItem('sampleUsers', JSON.stringify([
        { id: 'u1', name: 'Poopy Pete', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pete', logs: generateLogs(145), reactions: {'💩':24,'🔥':18}, comments: [{user:'Sarah',avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=S',text:'Legend! 💩',time:'2h'}] },
        { id: 'u2', name: 'Bowel Betty', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Betty', logs: generateLogs(120), reactions: {'🔥':22}, comments: [] },
        { id: 'u3', name: 'Toilet Tim', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tim', logs: generateLogs(98), reactions: {'👑':5}, comments: [] },
        { id: 'u4', name: 'Dookie Dave', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dave', logs: generateLogs(85), reactions: {'💪':9}, comments: [] },
        { id: 'u5', name: 'Stool Sally', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sally', logs: generateLogs(70), reactions: {'🎉':9}, comments: [] }
    ]));
    localStorage.setItem('sampleUsers_v3', 'true');
}

function getSampleUsers() { return JSON.parse(localStorage.getItem('sampleUsers')); }
function generateLogs(count) {
    const logs = [];
    const now = new Date();
    for(let i=0; i<count; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - Math.floor(Math.random()*60));
        logs.push({ date: d.toISOString(), type: Math.floor(Math.random()*7)+1 });
    }
    return logs.sort((a,b) => new Date(b.date) - new Date(a.date));
}

function renderLeaderboard() {
    // Merge Sample Users with Current Real User
    let users = getSampleUsers();
    
    // Create a temporary user object for the logged in user to show on leaderboard
    const myself = {
        id: currentUser ? currentUser.uid : 'local_user',
        name: currentUser ? currentUser.displayName : 'You',
        avatar: currentUser ? currentUser.photoURL : 'https://ui-avatars.com/api/?name=You&background=random',
        logs: localLogs, // Use the real logs (from Firestore or Local)
        reactions: {'⭐': 0},
        comments: []
    };
    
    users.push(myself);

    const now = new Date();
    
    const ranked = users.map(u => {
        let count = 0;
        u.logs.forEach(l => {
            const d = new Date(l.date);
            if (currentLeaderboardTab === 'today') { if(d.toDateString() === now.toDateString()) count++; }
            else if (currentLeaderboardTab === 'month') { if(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) count++; }
            else { if(d.getFullYear() === now.getFullYear()) count++; }
        });
        return {...u, count};
    }).sort((a,b) => b.count - a.count);

    document.getElementById('leaderboardList').innerHTML = ranked.map((u, i) => {
        let rank = `<span class="text-amber-300 font-bold">#${i+1}</span>`;
        if(i===0) rank = '🥇'; if(i===1) rank = '🥈'; if(i===2) rank = '🥉';
        
        // Highlight current user
        const isMe = u.id === myself.id;
        const bgClass = isMe ? 'bg-orange-50 border-orange-200' : 'bg-white border-amber-100';

        return `
            <div class="fun-btn flex items-center gap-4 ${bgClass} p-4 rounded-3xl border-2 cursor-pointer hover:border-amber-300 transition-colors" onclick="openUserDashboard('${u.id}')">
                <div class="w-8 text-center text-2xl">${rank}</div>
                <img src="${u.avatar}" class="w-12 h-12 rounded-full bg-amber-50 border-2 border-amber-100">
                <div class="flex-1">
                    <div class="font-black text-amber-900 text-base">${u.name} ${isMe ? '(You)' : ''}</div>
                    <div class="text-xs font-bold text-amber-400">${Object.values(u.reactions).reduce((a,b)=>a+b,0)} reactions</div>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black text-orange-500">${u.count}</div>
                    <div class="text-[10px] font-bold text-amber-300 uppercase">Poops</div>
                </div>
            </div>
        `;
    }).join('');
}

// Leaderboard Tabs
['tabToday', 'tabMonth', 'tabYear'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        document.querySelectorAll('.leaderboard-tab').forEach(t => {
            t.classList.remove('tab-active');
            t.classList.add('text-gray-600', 'hover:text-gray-900');
        });
        e.target.classList.add('tab-active');
        e.target.classList.remove('text-gray-600');
        currentLeaderboardTab = id.replace('tab','').toLowerCase();
        renderLeaderboard();
    });
});

// Dashboard & Modal Logic
window.openUserDashboard = (uid) => {
    // We need to look in both sample users and the current user
    let user;
    if (currentUser && uid === currentUser.uid) {
        user = {
            id: currentUser.uid,
            name: currentUser.displayName,
            avatar: currentUser.photoURL,
            logs: localLogs,
            reactions: {},
            comments: []
        };
    } else if (!currentUser && uid === 'local_user') {
         user = { id: 'local', name: 'You', avatar: '', logs: localLogs, reactions:{}, comments:[] };
    } else {
        user = getSampleUsers().find(u => u.id === uid);
    }
    
    if(!user) return;
    selectedUserId = uid;

    document.getElementById('dashboardName').textContent = user.name;
    document.getElementById('dashboardAvatar').src = user.avatar || 'https://ui-avatars.com/api/?name=You';
    document.getElementById('dashTotalPoops').textContent = user.logs.length;
    document.getElementById('dashStreak').textContent = calculateStreak(user.logs);
    
    // Charts
    if(lineChartInstance) lineChartInstance.destroy();
    const ctxL = document.getElementById('lineChart').getContext('2d');
    const lData = [];
    for(let i=6; i>=0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        lData.push(user.logs.filter(l => new Date(l.date).toDateString() === d.toDateString()).length);
    }
    lineChartInstance = new Chart(ctxL, {
        type: 'bar',
        data: {
            labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], 
            datasets: [{label:'Logs', data:lData, backgroundColor:'#f97316', borderRadius:4}]
        },
        options: { responsive:true, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}}, y:{display:false}} }
    });

    if(pieChartInstance) pieChartInstance.destroy();
    const ctxP = document.getElementById('pieChart').getContext('2d');
    const pCounts = {};
    user.logs.forEach(l => pCounts[l.type] = (pCounts[l.type]||0)+1);
    pieChartInstance = new Chart(ctxP, {
        type: 'doughnut',
        data: {
            labels: Object.values(poopTypes).map(t=>t.emoji),
            datasets: [{ data:Object.values(pCounts), backgroundColor:Object.values(poopTypes).map(t=>t.color), borderWidth:0 }]
        },
        options: { responsive:true, plugins:{legend:{display:false}} }
    });

    renderReactions(user.reactions || {});
    renderComments(user.comments || []);
    
    const m = document.getElementById('userDashboardModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(()=>m.classList.add('opacity-100'), 10);
};

function calculateStreak(logs) {
    // Simple mock streak logic for visual appeal
    return logs.length ? Math.floor(Math.random() * 5) + 1 : 0; 
}

function renderReactions(reactions) {
    document.getElementById('reactionCounts').innerHTML = Object.entries(reactions).map(([k,v]) => `<span>${k} ${v}</span>`).join(' • ');
}

function renderComments(comments) {
    const div = document.getElementById('commentsList');
    div.innerHTML = comments.length ? comments.map(c => `
        <div class="flex gap-3 text-sm">
            <img src="${c.avatar}" class="w-8 h-8 rounded-full">
            <div>
                <div class="flex gap-2 items-baseline">
                    <span class="font-bold text-gray-900">${c.user}</span>
                    <span class="text-xs text-gray-400">${c.time}</span>
                </div>
                <p class="text-gray-600">${c.text}</p>
            </div>
        </div>
    `).join('') : '<p class="text-gray-400 text-xs">No comments yet.</p>';
}

document.getElementById('closeDashboard').addEventListener('click', () => {
    const m = document.getElementById('userDashboardModal');
    m.classList.remove('opacity-100');
    setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 200);
});

document.getElementById('closeLoginModal').addEventListener('click', () => {
     document.getElementById('loginModal').classList.add('hidden');
     document.getElementById('loginModal').classList.remove('flex');
});

// Notifications (Static Mock for visual demo)
const sampleNotifications = [
    { id: 1, type: 'reminder', message: 'just reminded you to log!', emoji: '💩', time: '2m ago', unread: true },
    { id: 2, type: 'reactions', message: 'You received 20 reactions!', emoji: '🔥', time: '15m ago', unread: true }
];

function renderNotifications() {
    const container = document.getElementById('notificationList');
    const unreadCount = sampleNotifications.filter(n => n.unread).length;
    
    document.getElementById('notificationBadge').textContent = unreadCount;
    document.getElementById('notificationBadge').classList.toggle('hidden', unreadCount === 0);
    
    container.innerHTML = sampleNotifications.map(n => `
        <div class="p-3 border-b border-amber-50 hover:bg-amber-50/50 transition-colors cursor-pointer ${n.unread ? 'bg-orange-50/50' : ''}">
            <div class="flex gap-3 items-start">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-xl">${n.emoji}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm text-amber-900"><span class="text-amber-700">${n.message}</span></p>
                    <p class="text-xs text-amber-400 mt-1 font-medium">${n.time}</p>
                </div>
            </div>
        </div>
    `).join('');
}

document.getElementById('notificationBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notificationDropdown').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('notificationBtn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) dropdown.classList.add('hidden');
});

// Init
loadLocalData(); // Initial load (will be overwritten by Firestore if logged in)
renderNotifications();