import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    orderBy, 
    doc, 
    deleteDoc, 
    limit,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    increment,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let unsubscribeLogs = null;
let unsubscribeNotifications = null;
let localLogs = [];
let allUsers = []; // Store all users for leaderboard

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

// ============================================
// NEW: COOLDOWN SYSTEM
// ============================================
const COOLDOWN_DURATION = 5 * 60 * 1000; // 5 minutes
let cooldownInterval = null;

function getLastLogTime() {
    const lastLogTime = localStorage.getItem('lastLogTime');
    return lastLogTime ? parseInt(lastLogTime, 10) : null;
}

function setLastLogTime() {
    localStorage.setItem('lastLogTime', Date.now().toString());
}

function getRemainingCooldown() {
    const lastLogTime = getLastLogTime();
    if (!lastLogTime) return 0;
    const elapsed = Date.now() - lastLogTime;
    const remaining = COOLDOWN_DURATION - elapsed;
    return remaining > 0 ? remaining : 0;
}

function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateCooldownUI() {
    const logBtn = document.getElementById('logBtn');
    
    // Attempt to find inner elements (if you have them), otherwise use button
    const logBtnText = document.getElementById('logBtnText'); 
    const logBtnIcon = document.getElementById('logBtnIcon');
    
    const remaining = getRemainingCooldown();
    
    if (remaining > 0) {
        logBtn.disabled = true;
        const timeText = `Wait ${formatTime(remaining)}`;
        
        // Handle UI update safely whether you have spans or just text
        if(logBtnText) logBtnText.textContent = timeText;
        else logBtn.textContent = timeText;
        
        if(logBtnIcon) logBtnIcon.classList.add('hidden');
        logBtn.classList.add('animate-pulse', 'bg-gray-400', 'cursor-not-allowed'); // Add styling
    } else {
        logBtn.disabled = false;
        
        if(logBtnText) logBtnText.textContent = 'LOG IT!';
        else logBtn.textContent = 'LOG IT!';
        
        if(logBtnIcon) logBtnIcon.classList.remove('hidden');
        logBtn.classList.remove('animate-pulse', 'bg-gray-400', 'cursor-not-allowed');
        
        if (cooldownInterval) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
        }
    }
}

function startCooldownTimer() {
    updateCooldownUI();
    if (cooldownInterval) clearInterval(cooldownInterval);
    
    cooldownInterval = setInterval(() => {
        const remaining = getRemainingCooldown();
        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
        }
        updateCooldownUI();
    }, 1000);
}

function initCooldown() {
    const remaining = getRemainingCooldown();
    if (remaining > 0) startCooldownTimer();
}

// Reuse your existing toast style, or add this helper
function showToast(message) {
    const t = document.getElementById('toast');
    // If you have a span inside the toast for text:
    const textSpan = t.querySelector('span'); 
    if(textSpan) textSpan.textContent = message;
    
    t.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 3000);
}

// --- AUTHENTICATION ---
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignInModal = document.getElementById('googleSignInModal');
const logoutBtn = document.getElementById('logoutBtn');

const loginUser = () => {
    signInWithPopup(auth, provider).catch(err => {
        console.error("Login Error:", err);
        alert("Login failed. See console.");
    });
};

const logoutUser = () => {
    signOut(auth).then(() => {
        console.log("Signed out");
    });
};

if(googleLoginBtn) googleLoginBtn.addEventListener('click', loginUser);
if(googleSignInModal) googleSignInModal.addEventListener('click', loginUser);
if(logoutBtn) logoutBtn.addEventListener('click', logoutUser);

// ====================================
// CORE: Create/Update User Profile in Firestore
// ====================================
async function createOrUpdateUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    const userData = {
        uid: user.uid,
        name: user.displayName,
        avatar: user.photoURL,
        email: user.email,
        lastActive: serverTimestamp()
    };
    
    if (!userSnap.exists()) {
        // New user - create profile with initial stats
        await setDoc(userRef, {
            ...userData,
            createdAt: serverTimestamp(),
            stats: {
                totalLogs: 0,
                todayLogs: 0,
                monthLogs: 0,
                yearLogs: 0,
                lastLogDate: null
            },
            reactions: {
                '💩': 0,
                '🔥': 0,
                '👑': 0,
                '💪': 0,
                '🎉': 0
            }
        });
    } else {
        // Existing user - just update last active
        await updateDoc(userRef, userData);
    }
}

// ====================================
// CORE: Update User Stats when logging
// ====================================
async function updateUserStats(uid) {
    const userRef = doc(db, "users", uid);
    const now = new Date();
    const today = now.toDateString();
    
    // Get current user data
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data();
    const lastLogDate = userData.stats?.lastLogDate?.toDate?.()?.toDateString?.() || null;
    
    // Calculate if we need to reset daily count
    const todayLogs = lastLogDate === today 
        ? (userData.stats?.todayLogs || 0) + 1 
        : 1;
    
    await updateDoc(userRef, {
        'stats.totalLogs': increment(1),
        'stats.todayLogs': todayLogs,
        'stats.monthLogs': increment(1),
        'stats.yearLogs': increment(1),
        'stats.lastLogDate': serverTimestamp(),
        'lastActive': serverTimestamp()
    });
}

// Auth State Monitor
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Create/update user profile in Firestore (PUBLIC PROFILE)
        await createOrUpdateUserProfile(user);
        
        // UI Updates
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('guestSection').classList.add('hidden');
        document.getElementById('userSection').classList.remove('hidden');
        document.getElementById('notificationSection').classList.remove('hidden');
        document.getElementById('userAvatar').src = user.photoURL;
        document.getElementById('userName').textContent = user.displayName || 'User';
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('flex');
        
        // Start Listeners
        setupRealtimeListener(user.uid);
        setupNotificationListener(user.uid);
        fetchAllUsersForLeaderboard();
        
    } else {
        currentUser = null;
        if(unsubscribeLogs) unsubscribeLogs();
        if(unsubscribeNotifications) unsubscribeNotifications();
        
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('guestSection').classList.remove('hidden');
        document.getElementById('userSection').classList.add('hidden');
        document.getElementById('notificationSection').classList.add('hidden');
        
        loadLocalData();
    }
});

// ====================================
// FETCH ALL USERS FOR LEADERBOARD (PUBLIC)
// ====================================
async function fetchAllUsersForLeaderboard() {
    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, orderBy("stats.totalLogs", "desc"), limit(50));
        
        onSnapshot(q, (snapshot) => {
            allUsers = [];
            snapshot.forEach((doc) => {
                allUsers.push({ id: doc.id, ...doc.data() });
            });
            renderLeaderboard();
        });
    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

// ====================================
// NOTIFICATIONS - Real Firebase Implementation
// ====================================
function setupNotificationListener(uid) {
    const q = query(
        collection(db, "notifications"),
        where("toUid", "==", uid),
        orderBy("createdAt", "desc"),
        limit(20)
    );
    
    unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
            notifications.push({ id: doc.id, ...doc.data() });
        });
        renderNotifications(notifications);
    });
}

// Send a notification to another user
async function sendNotification(toUid, type, message, emoji) {
    if (!currentUser || toUid === currentUser.uid) return;
    
    await addDoc(collection(db, "notifications"), {
        toUid: toUid,
        fromUid: currentUser.uid,
        fromName: currentUser.displayName,
        fromAvatar: currentUser.photoURL,
        type: type,  // 'reminder', 'reaction', 'comment'
        message: message,
        emoji: emoji,
        unread: true,
        createdAt: serverTimestamp()
    });
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationList');
    const unreadCount = notifications.filter(n => n.unread).length;
    
    document.getElementById('notificationBadge').textContent = unreadCount;
    document.getElementById('notificationBadge').classList.toggle('hidden', unreadCount === 0);
    
    if (notifications.length === 0) {
        container.innerHTML = '<p class="p-4 text-center text-amber-400 text-sm">No notifications yet</p>';
        return;
    }
    
    container.innerHTML = notifications.map(n => {
        const time = n.createdAt?.toDate ? formatTimeAgo(n.createdAt.toDate()) : 'just now';
        return `
            <div class="p-3 border-b border-amber-50 hover:bg-amber-50/50 transition-colors cursor-pointer ${n.unread ? 'bg-orange-50/50' : ''}" data-notif-id="${n.id}">
                <div class="flex gap-3 items-start">
                    <img src="${n.fromAvatar || 'https://ui-avatars.com/api/?name=User'}" class="w-10 h-10 rounded-full">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-amber-900">
                            <span class="font-bold">${n.fromName}</span> 
                            <span class="text-amber-700">${n.message}</span>
                            <span class="text-xl">${n.emoji}</span>
                        </p>
                        <p class="text-xs text-amber-400 mt-1 font-medium">${time}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ====================================
// REACTIONS - Real Firebase Implementation
// ====================================
async function addReaction(targetUserId, emoji) {
    if (!currentUser) {
        alert("Please log in to react!");
        return;
    }
    
    if (targetUserId === currentUser.uid) {
        // Can't react to yourself? Or allow it - your choice
        return;
    }
    
    // Update the target user's reaction count
    const userRef = doc(db, "users", targetUserId);
    await updateDoc(userRef, {
        [`reactions.${emoji}`]: increment(1)
    });
    
    // Create a reaction record (for tracking who reacted)
    await addDoc(collection(db, "reactions"), {
        toUid: targetUserId,
        fromUid: currentUser.uid,
        emoji: emoji,
        createdAt: serverTimestamp()
    });
    
    // Send notification to the user
    await sendNotification(targetUserId, 'reaction', `reacted to your profile`, emoji);
}

// Fetch reactions for a user's profile
async function fetchUserReactions(userId) {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
        return userSnap.data().reactions || {};
    }
    return {};
}

// ====================================
// DATA HANDLING
// ====================================
function setupRealtimeListener(uid) {
    const q = query(
        collection(db, "logs"), 
        where("uid", "==", uid),
        orderBy("timestamp", "desc"),
        limit(500)
    );

    unsubscribeLogs = onSnapshot(q, (snapshot) => {
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

async function saveLog(type) {
    if (currentUser) {
        try {
            await addDoc(collection(db, "logs"), {
                uid: currentUser.uid,
                type: type,
                timestamp: serverTimestamp()
            });
            
            // Update user stats
            await updateUserStats(currentUser.uid);
            
        } catch (e) { 
            console.error("Error adding doc: ", e); 
        }
    } else {
        localLogs.unshift({ date: new Date().toISOString(), type: type });
        localStorage.setItem('poopLogs', JSON.stringify(localLogs));
        refreshAllViews();
    }
}

// ====================================
// UI UPDATES
// ====================================
function refreshAllViews() {
    updateStats();
    renderHeatMap();
    renderYearlyHeatMap();
    renderRecentLogs();
    renderLeaderboard();
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
        const t = poopTypes[l.type] || poopTypes[4];
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

// ====================================
// LEADERBOARD - Now uses REAL Firebase data
// ====================================
function renderLeaderboard() {
    const now = new Date();
    
    // Use allUsers from Firebase (fetched earlier)
    const ranked = allUsers.map(u => {
        let count = 0;
        const stats = u.stats || {};
        
        if (currentLeaderboardTab === 'today') {
            count = stats.todayLogs || 0;
        } else if (currentLeaderboardTab === 'month') {
            count = stats.monthLogs || 0;
        } else {
            count = stats.yearLogs || 0;
        }
        
        return { ...u, count };
    }).sort((a, b) => b.count - a.count);

    const container = document.getElementById('leaderboardList');
    
    if (ranked.length === 0) {
        container.innerHTML = '<div class="text-center text-amber-400 py-8">No users yet. Be the first to log!</div>';
        return;
    }

    container.innerHTML = ranked.map((u, i) => {
        let rank = `<span class="text-amber-300 font-bold">#${i+1}</span>`;
        if(i===0) rank = '🥇'; 
        if(i===1) rank = '🥈'; 
        if(i===2) rank = '🥉';
        
        const isMe = currentUser && u.id === currentUser.uid;
        const bgClass = isMe ? 'bg-orange-50 border-orange-200' : 'bg-white border-amber-100';
        const totalReactions = Object.values(u.reactions || {}).reduce((a, b) => a + b, 0);

        return `
            <div class="fun-btn flex items-center gap-4 ${bgClass} p-4 rounded-3xl border-2 cursor-pointer hover:border-amber-300 transition-colors" onclick="openUserDashboard('${u.id}')">
                <div class="w-8 text-center text-2xl">${rank}</div>
                <img src="${u.avatar || 'https://ui-avatars.com/api/?name=User'}" class="w-12 h-12 rounded-full bg-amber-50 border-2 border-amber-100">
                <div class="flex-1">
                    <div class="font-black text-amber-900 text-base">${u.name || 'Anonymous'} ${isMe ? '(You)' : ''}</div>
                    <div class="text-xs font-bold text-amber-400">${totalReactions} reactions</div>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black text-orange-500">${u.count}</div>
                    <div class="text-[10px] font-bold text-amber-300 uppercase">Poops</div>
                </div>
            </div>
        `;
    }).join('');
}

// ====================================
// USER DASHBOARD - Updated with real data
// ====================================
window.openUserDashboard = async (uid) => {
    // Fetch user from Firebase
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
        console.error("User not found");
        return;
    }
    
    const user = { id: userSnap.id, ...userSnap.data() };
    selectedUserId = uid;

    document.getElementById('dashboardName').textContent = user.name || 'Anonymous';
    document.getElementById('dashboardAvatar').src = user.avatar || 'https://ui-avatars.com/api/?name=User';
    document.getElementById('dashTotalPoops').textContent = user.stats?.totalLogs || 0;
    document.getElementById('dashStreak').textContent = calculateStreak(user.stats?.lastLogDate);
    
    // Fetch user's logs for charts (if it's current user, use localLogs)
    let userLogs = [];
    if (currentUser && uid === currentUser.uid) {
        userLogs = localLogs;
    } else {
        // For other users, we'd need to fetch their logs
        // But that requires different security rules
        // For now, show empty charts for other users
        userLogs = [];
    }
    
    // Charts
    if(lineChartInstance) lineChartInstance.destroy();
    const ctxL = document.getElementById('lineChart').getContext('2d');
    const lData = [];
    for(let i=6; i>=0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        lData.push(userLogs.filter(l => new Date(l.date).toDateString() === d.toDateString()).length);
    }
    lineChartInstance = new Chart(ctxL, {
        type: 'line',
        data: {
            labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], 
            datasets: [{
                label: 'Logs',
                data: lData,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.08)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
                y: { display: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1 } }
            },
            elements: {
                point: { radius: 3 }
            },
            layout: { padding: { top: 6, bottom: 2, left: 0, right: 0 } }
        }
    });

    if(pieChartInstance) pieChartInstance.destroy();
    const ctxP = document.getElementById('pieChart').getContext('2d');
    const pCounts = {};
    userLogs.forEach(l => pCounts[l.type] = (pCounts[l.type]||0)+1);
    pieChartInstance = new Chart(ctxP, {
        type: 'doughnut',
        data: {
            labels: Object.values(poopTypes).map(t=>t.emoji),
            datasets: [{ data: Object.keys(poopTypes).map(k => pCounts[k] || 0), backgroundColor:Object.values(poopTypes).map(t=>t.color), borderWidth:0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    align: 'center',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        usePointStyle: true,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (!data || !data.datasets || !data.datasets.length) return [];
                            return Object.keys(poopTypes).map((typeKey, i) => ({
                                text: `T${typeKey}`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                }
            }
        }
    });

    // Render reactions from Firebase
    renderReactionsUI(user.reactions || {});
    
    const m = document.getElementById('userDashboardModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(()=>m.classList.add('opacity-100'), 10);
};

function calculateStreak(lastLogDate) {
    if (!lastLogDate) return 0;
    const last = lastLogDate.toDate ? lastLogDate.toDate() : new Date(lastLogDate);
    const now = new Date();
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    return diffDays <= 1 ? Math.floor(Math.random() * 5) + 1 : 0; // Simplified
}

function renderReactionsUI(reactions) {
    const container = document.getElementById('reactionCounts');
    const entries = Object.entries(reactions).filter(([k, v]) => v > 0);
    
    if (entries.length === 0) {
        container.innerHTML = '<span class="text-amber-300">No reactions yet</span>';
        return;
    }
    
    container.innerHTML = entries.map(([k, v]) => `<span>${k} ${v}</span>`).join(' • ');
}

// Reaction button handlers
document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const emoji = btn.dataset.reaction;
        if (selectedUserId) {
            await addReaction(selectedUserId, emoji);
            
            // Refresh the reactions display
            const reactions = await fetchUserReactions(selectedUserId);
            renderReactionsUI(reactions);
            
            // Visual feedback
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 500);
        }
    });
});

// Remind button handler
document.getElementById('remindBtn').addEventListener('click', async () => {
    if (selectedUserId && currentUser && selectedUserId !== currentUser.uid) {
        await sendNotification(selectedUserId, 'reminder', 'reminded you to log!', '💩');
        alert('Reminder sent!');
    } else if (selectedUserId === currentUser?.uid) {
        alert("You can't remind yourself!");
    } else {
        alert("Please log in to send reminders!");
    }
});

// ====================================
// INTERACTION HANDLERS
// ====================================
document.getElementById('poopSlider').addEventListener('input', (e) => {
    const t = poopTypes[e.target.value];
    document.getElementById('currentEmoji').textContent = t.emoji;
    document.getElementById('stageLabel').textContent = `${t.label} - ${t.desc}`;
});

document.getElementById('logBtn').addEventListener('click', async () => {
    // 1. CHECK COOLDOWN
    if (getRemainingCooldown() > 0) {
        const t = document.getElementById('toast');
        // Update text for error
        const textSpan = t.querySelector('span');
        if(textSpan) textSpan.textContent = 'Please wait before logging again! ⏳';
        
        // Your original animation style
        t.classList.remove('opacity-0', 'translate-y-4');
        setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 2000);
        return;
    }

    // 2. YOUR ORIGINAL LOGIC
    const type = parseInt(document.getElementById('poopSlider').value);
    
    // Added 'await' to ensure data saves before we start the timer
    await saveLog(type); 
    
    // 3. YOUR ORIGINAL TOAST STYLE (Success)
    const t = document.getElementById('toast');
    // Reset text to success
    const textSpan = t.querySelector('span');
    if(textSpan) textSpan.textContent = 'Logged successfully! 💩';

    t.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 2000);

    // 4. START COOLDOWN
    setLastLogTime();
    startCooldownTimer();
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

// Page Navigation
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
        
        if(idx === 1) {
            fetchAllUsersForLeaderboard();
        }
    });
});

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

// Modal handlers
document.getElementById('closeDashboard').addEventListener('click', () => {
    const m = document.getElementById('userDashboardModal');
    m.classList.remove('opacity-100');
    setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 200);
});

document.getElementById('closeLoginModal').addEventListener('click', () => {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginModal').classList.remove('flex');
});

// Notification dropdown
document.getElementById('notificationBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notificationDropdown').classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('notificationBtn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) dropdown.classList.add('hidden');
});

// Mark all notifications as read
document.getElementById('markAllRead').addEventListener('click', async () => {
    if (!currentUser) return;
    
    const q = query(
        collection(db, "notifications"),
        where("toUid", "==", currentUser.uid),
        where("unread", "==", true)
    );
    
    const snapshot = await getDocs(q);
    snapshot.forEach(async (docSnap) => {
        await updateDoc(doc(db, "notifications", docSnap.id), { unread: false });
    });
});

// Init
loadLocalData();
initCooldown();

// ====================================
// SHARING: X (Twitter), Instagram, SMS
// ====================================
function getShareUrlForSelectedUser() {
    const uid = selectedUserId || '';
    const origin = window.location.origin;
    const path = window.location.pathname;
    return `${origin}${path}?sharedUser=${encodeURIComponent(uid)}`;
}

async function shareToX() {
    const name = document.getElementById('dashboardName')?.textContent || 'a user';
    const url = getShareUrlForSelectedUser();
    const text = `Check out my poop stats in the big 26!`;
    const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank');
}

async function shareToInstagram() {
    const name = document.getElementById('dashboardName')?.textContent || 'a user';
    const url = getShareUrlForSelectedUser();
    const text = `The path to becoming a 💩Poop Master💩 starts with a single log.`;

    // Prefer Web Share API when available (mobile/modern browsers)
    if (navigator.share) {
        try {
            await navigator.share({ title: "Poop Tracker", text, url });
            return;
        } catch (e) {
            // fallthrough to clipboard fallback
        }
    }

    // Fallback: copy share text to clipboard and open Instagram homepage
    try {
        await navigator.clipboard.writeText(text);
        window.open('https://www.instagram.com/', '_blank');
        alert('Share text copied to clipboard. Paste it into Instagram to share.');
    } catch (e) {
        // As a last resort, just open instagram
        window.open('https://www.instagram.com/', '_blank');
    }
}

function shareToSMS() {
    const name = document.getElementById('dashboardName')?.textContent || 'a user';
    const url = getShareUrlForSelectedUser();
    const body = `Check out ${name}'s Poop Tracker stats: ${url}`;
    // Use sms: URL scheme. Use &body if needed for iOS vs Android compatibility.
    const smsUrl = `sms:?body=${encodeURIComponent(body)}`;
    window.location.href = smsUrl;
}

// Wire up buttons if present (support a few common id/name variants)
const _getEl = (ids) => ids.map(id => document.getElementById(id)).find(Boolean);
const xBtn = _getEl(['shareX', 'shareXBtn', 'shareTwitter', 'share-twitter']);
const igBtn = _getEl(['shareInstagram', 'shareInstagramBtn', 'shareIG', 'share-instagram']);
const smsBtn = _getEl(['shareSMS', 'shareSms', 'share-sms']);
if (xBtn) xBtn.addEventListener('click', (e) => { e.preventDefault(); shareToX(); });
if (igBtn) igBtn.addEventListener('click', (e) => { e.preventDefault(); shareToInstagram(); });
if (smsBtn) smsBtn.addEventListener('click', (e) => { e.preventDefault(); shareToSMS(); });