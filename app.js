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
let allUsers = [];

// Custom profile data (for guests and custom overrides)
let customProfile = {
    name: null,
    avatar: null
};

// Data Constants
const poopTypes = {
    1: { emoji: '🍇', label: 'Type 1', desc: 'Hard lumps', color: '#78350f' },
    2: { emoji: '🌽', label: 'Type 2', desc: 'Lumpy sausage', color: '#92400e' },
    3: { emoji: '🥖', label: 'Type 3', desc: 'Cracked surface', color: '#b45309' },
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
// PROFILE MANAGEMENT SYSTEM
// ============================================

// Load custom profile from localStorage
function loadCustomProfile() {
    const saved = localStorage.getItem('customProfile');
    if (saved) {
        customProfile = JSON.parse(saved);
    }
}

// Save custom profile to localStorage
function saveCustomProfile() {
    localStorage.setItem('customProfile', JSON.stringify(customProfile));
}

// Get the effective display name
function getDisplayName() {
    if (customProfile.name) return customProfile.name;
    if (currentUser?.displayName) return currentUser.displayName;
    return 'Guest';
}

// Get the effective avatar URL
function getAvatarUrl() {
    if (customProfile.avatar) return customProfile.avatar;
    if (currentUser?.photoURL) return currentUser.photoURL;
    const name = getDisplayName();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=fde68a&color=92400e`;
}

// Update all UI elements that show user info
function updateAllUserDisplays() {
    const name = getDisplayName();
    const avatar = getAvatarUrl();
    
    // Header - Guest section
    const guestAvatar = document.getElementById('guestAvatar');
    const guestName = document.getElementById('guestName');
    if (guestAvatar) guestAvatar.src = avatar;
    if (guestName) guestName.textContent = name;
    
    // Header - User section
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    if (userAvatar) userAvatar.src = avatar;
    if (userName) userName.textContent = name;
    
    // Side panel
    const sidePanelAvatar = document.getElementById('sidePanelAvatar');
    const sidePanelName = document.getElementById('sidePanelName');
    if (sidePanelAvatar) sidePanelAvatar.src = avatar;
    if (sidePanelName) sidePanelName.textContent = name;
    
    // Profile page
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    if (profileAvatar) profileAvatar.src = avatar;
    if (profileName) profileName.textContent = name;
}

// Initialize profile on load
loadCustomProfile();

// ============================================
// EDIT PROFILE MODAL
// ============================================
const editProfileModal = document.getElementById('editProfileModal');
const closeEditProfile = document.getElementById('closeEditProfile');
const editNameInput = document.getElementById('editNameInput');
const editAvatarPreview = document.getElementById('editAvatarPreview');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
const urlAvatarBtn = document.getElementById('urlAvatarBtn');
const avatarUrlInputContainer = document.getElementById('avatarUrlInputContainer');
const avatarUrlInput = document.getElementById('avatarUrlInput');
const applyUrlBtn = document.getElementById('applyUrlBtn');
const avatarFileInput = document.getElementById('avatarFileInput');
const profileAvatarContainer = document.getElementById('profileAvatarContainer');
const editNameBtn = document.getElementById('editNameBtn');

let tempAvatarData = null;

function openEditProfileModal() {
    editProfileModal.classList.remove('hidden');
    editProfileModal.classList.add('flex');
    
    // Populate with current values
    editNameInput.value = getDisplayName();
    editAvatarPreview.src = getAvatarUrl();
    tempAvatarData = null;
    avatarUrlInputContainer.classList.add('hidden');
    avatarUrlInput.value = '';
}

function closeEditProfileModal() {
    editProfileModal.classList.add('hidden');
    editProfileModal.classList.remove('flex');
    tempAvatarData = null;
}

// Open modal triggers
if (profileAvatarContainer) {
    profileAvatarContainer.addEventListener('click', openEditProfileModal);
}

if (editNameBtn) {
    editNameBtn.addEventListener('click', openEditProfileModal);
}

// Close modal
if (closeEditProfile) {
    closeEditProfile.addEventListener('click', closeEditProfileModal);
}

// Click outside to close
editProfileModal?.addEventListener('click', (e) => {
    if (e.target === editProfileModal) {
        closeEditProfileModal();
    }
});

// Upload button - trigger file input
if (uploadAvatarBtn) {
    uploadAvatarBtn.addEventListener('click', () => {
        avatarFileInput.click();
    });
}

// Handle file selection
if (avatarFileInput) {
    avatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file 📷');
                return;
            }
            
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                showToast('Image too large! Max 2MB 📏');
                return;
            }
            
            // Read and convert to base64
            const reader = new FileReader();
            reader.onload = (event) => {
                tempAvatarData = event.target.result;
                editAvatarPreview.src = tempAvatarData;
                showToast('Image loaded! 📷');
            };
            reader.readAsDataURL(file);
        }
    });
}

// URL button - toggle URL input
if (urlAvatarBtn) {
    urlAvatarBtn.addEventListener('click', () => {
        avatarUrlInputContainer.classList.toggle('hidden');
    });
}

// Apply URL button
if (applyUrlBtn) {
    applyUrlBtn.addEventListener('click', () => {
        const url = avatarUrlInput.value.trim();
        if (url) {
            // Basic URL validation
            try {
                new URL(url);
                tempAvatarData = url;
                editAvatarPreview.src = url;
                avatarUrlInputContainer.classList.add('hidden');
                showToast('Image URL applied! 🔗');
            } catch {
                showToast('Invalid URL! 🚫');
            }
        }
    });
}

// Handle image load error on preview
if (editAvatarPreview) {
    editAvatarPreview.addEventListener('error', () => {
        editAvatarPreview.src = getAvatarUrl();
        showToast('Failed to load image ❌');
        tempAvatarData = null;
    });
}

// Save profile
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        const newName = editNameInput.value.trim();
        
        if (!newName) {
            showToast('Please enter a name! 📝');
            return;
        }
        
        // Update custom profile
        customProfile.name = newName;
        if (tempAvatarData) {
            customProfile.avatar = tempAvatarData;
        }
        
        // Save to localStorage
        saveCustomProfile();
        
        // If logged in, also update Firestore
        if (currentUser) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, {
                    customName: customProfile.name,
                    customAvatar: customProfile.avatar || null,
                    lastActive: serverTimestamp()
                });
            } catch (error) {
                console.error("Error updating profile in Firestore:", error);
            }
        }
        
        // Update all displays
        updateAllUserDisplays();
        
        // Close modal
        closeEditProfileModal();
        
        showToast('Profile updated! ✨');
    });
}

// ============================================
// COOLDOWN SYSTEM
// ============================================
const COOLDOWN_DURATION = 5 * 60 * 1000;
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
    const logBtnText = document.getElementById('logBtnText'); 
    const logBtnIcon = document.getElementById('logBtnIcon');
    const remaining = getRemainingCooldown();
    
    if (remaining > 0) {
        logBtn.disabled = true;
        const timeText = `Wait ${formatTime(remaining)}`;
        if(logBtnText) logBtnText.textContent = timeText;
        else logBtn.textContent = timeText;
        if(logBtnIcon) logBtnIcon.classList.add('hidden');
        logBtn.classList.add('animate-pulse', 'bg-gray-400', 'cursor-not-allowed');
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

function showToast(message) {
    const t = document.getElementById('toast');
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
        // Clear custom profile on logout if desired (optional)
        // customProfile = { name: null, avatar: null };
        // saveCustomProfile();
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
    
    // Check if there's custom profile data stored
    if (userSnap.exists()) {
        const userData = userSnap.data();
        // Load custom name/avatar from Firestore if exists
        if (userData.customName) customProfile.name = userData.customName;
        if (userData.customAvatar) customProfile.avatar = userData.customAvatar;
        saveCustomProfile();
    }
    
    const userData = {
        uid: user.uid,
        name: user.displayName,
        avatar: user.photoURL,
        email: user.email,
        lastActive: serverTimestamp()
    };
    
    if (!userSnap.exists()) {
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
    
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data();
    const lastLogDate = userData.stats?.lastLogDate?.toDate?.()?.toDateString?.() || null;
    
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
        await createOrUpdateUserProfile(user);
        
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('guestSection').classList.add('hidden');
        document.getElementById('userSection').classList.remove('hidden');
        document.getElementById('notificationSection').classList.remove('hidden');
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('flex');
        
        // Update side panel email
        const sidePanelEmail = document.getElementById('sidePanelEmail');
        if (sidePanelEmail) sidePanelEmail.textContent = user.email || '';
        
        // Update profile page email
        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail) profileEmail.textContent = user.email || '';
        
        // Update all user displays with custom profile
        updateAllUserDisplays();
        
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
        
        // Update side panel for guest
        const sidePanelEmail = document.getElementById('sidePanelEmail');
        if (sidePanelEmail) sidePanelEmail.textContent = 'Not logged in';
        
        // Update profile email
        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail) profileEmail.textContent = 'Not logged in';
        
        // Update all displays
        updateAllUserDisplays();
        
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

async function sendNotification(toUid, type, message, emoji) {
    if (!currentUser || toUid === currentUser.uid) return;
    
    await addDoc(collection(db, "notifications"), {
        toUid: toUid,
        fromUid: currentUser.uid,
        fromName: getDisplayName(),
        fromAvatar: getAvatarUrl(),
        type: type,
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
// COMMENTS - Firebase Implementation
// ====================================

async function loadComments(userId) {
    const container = document.getElementById('commentsList');
    
    try {
        const q = query(
            collection(db, "comments"),
            where("toUid", "==", userId),
            orderBy("createdAt", "desc"),
            limit(20)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-amber-300 text-sm py-4">No comments yet. Be the first!</p>';
            return;
        }
        
        container.innerHTML = snapshot.docs.map(docSnap => {
            const c = docSnap.data();
            const time = c.createdAt?.toDate ? formatTimeAgo(c.createdAt.toDate()) : 'just now';
            const isOwner = currentUser && c.fromUid === currentUser.uid;
            
            return `
                <div class="flex gap-3 p-3 bg-amber-50 rounded-xl group" data-comment-id="${docSnap.id}">
                    <img src="${c.fromAvatar || 'https://ui-avatars.com/api/?name=User'}" class="w-8 h-8 rounded-full flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-bold text-amber-900 text-sm">${c.fromName || 'Anonymous'}</span>
                            <span class="text-xs text-amber-300">${time}</span>
                            ${isOwner ? `<button onclick="deleteComment('${docSnap.id}')" class="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>` : ''}
                        </div>
                        <p class="text-sm text-amber-700 break-words">${escapeHtml(c.text)}</p>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error("Error loading comments:", error);
        container.innerHTML = '<p class="text-center text-red-400 text-sm py-4">Failed to load comments</p>';
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Post comment handler
document.getElementById('postComment').addEventListener('click', async () => {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    
    if (!text) {
        showToast('Please enter a comment 📝');
        return;
    }
    
    if (!selectedUserId) {
        showToast('No user selected');
        return;
    }
    
    try {
        // Add comment to Firestore (works for guests too with anonymous data)
        await addDoc(collection(db, "comments"), {
            toUid: selectedUserId,
            fromUid: currentUser?.uid || 'guest_' + Date.now(),
            fromName: getDisplayName(),
            fromAvatar: getAvatarUrl(),
            text: text,
            createdAt: serverTimestamp()
        });
        
        // Clear input
        input.value = '';
        
        // Send notification (if not commenting on own profile and logged in)
        if (currentUser && selectedUserId !== currentUser.uid) {
            const truncatedText = text.length > 30 ? text.substring(0, 30) + '...' : text;
            await sendNotification(selectedUserId, 'comment', `commented: "${truncatedText}"`, '💬');
        }
        
        // Refresh comments list
        await loadComments(selectedUserId);
        
        showToast('Comment posted! 💬');
        
    } catch (error) {
        console.error("Error posting comment:", error);
        showToast('Failed to post comment ❌');
    }
});

// Allow Enter key to post comment
document.getElementById('commentInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('postComment').click();
    }
});

// Delete comment function
window.deleteComment = async (commentId) => {
    if (!confirm('Delete this comment?')) return;
    
    try {
        await deleteDoc(doc(db, "comments", commentId));
        await loadComments(selectedUserId);
        showToast('Comment deleted 🗑️');
    } catch (error) {
        console.error("Error deleting comment:", error);
        showToast('Failed to delete comment ❌');
    }
};
// ====================================
// REACTIONS - Real Firebase Implementation
// ====================================
async function addReaction(targetUserId, emoji) {
    if (!currentUser) {
        alert("Please log in to react!");
        return;
    }
    
    if (targetUserId === currentUser.uid) {
        return;
    }
    
    const userRef = doc(db, "users", targetUserId);
    await updateDoc(userRef, {
        [`reactions.${emoji}`]: increment(1)
    });
    
    await addDoc(collection(db, "reactions"), {
        toUid: targetUserId,
        fromUid: currentUser.uid,
        emoji: emoji,
        createdAt: serverTimestamp()
    });
    
    await sendNotification(targetUserId, 'reaction', `reacted to your profile`, emoji);
}

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
    
    // Filter out private profiles and users who opted out of leaderboard
    const visibleUsers = allUsers.filter(u => {
        const isPrivate = u.settings?.privateProfile || false;
        const showOnLeaderboard = u.settings?.showOnLeaderboard !== false; // default true
        const isMe = currentUser && u.id === currentUser.uid;
        
        // Always show current user to themselves, even if private
        if (isMe) return true;
        
        // Hide private profiles and those who opted out
        return !isPrivate && showOnLeaderboard;
    });
    
    const ranked = visibleUsers.map(u => {
        let count = 0;
        const stats = u.stats || {};
        
        if (currentLeaderboardTab === 'today') {
            count = stats.todayLogs || 0;
        } else if (currentLeaderboardTab === 'month') {
            count = stats.monthLogs || 0;
        } else {
            count = stats.yearLogs || 0;
        }
        
        // Use custom name/avatar if available
        const displayName = u.customName || u.name || 'Anonymous';
        const displayAvatar = u.customAvatar || u.avatar || 'https://ui-avatars.com/api/?name=User';
        
        return { ...u, count, displayName, displayAvatar };
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
        const isPrivate = u.settings?.privateProfile || false;
        const bgClass = isMe ? 'bg-orange-50 border-orange-200' : 'bg-white border-amber-100';
        const totalReactions = Object.values(u.reactions || {}).reduce((a, b) => a + b, 0);
        
        // Show private badge for current user if their profile is private
        const privateBadge = isMe && isPrivate ? '<span class="ml-2 bg-purple-100 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full">🔒 Hidden</span>' : '';

        return `
            <div class="fun-btn flex items-center gap-4 ${bgClass} p-4 rounded-3xl border-2 cursor-pointer hover:border-amber-300 transition-colors" onclick="openUserDashboard('${u.id}')">
                <div class="w-8 text-center text-2xl">${rank}</div>
                <img src="${u.displayAvatar}" class="w-12 h-12 rounded-full bg-amber-50 border-2 border-amber-100 object-cover">
                <div class="flex-1">
                    <div class="font-black text-amber-900 text-base">${u.displayName} ${isMe ? '(You)' : ''}${privateBadge}</div>
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
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
        console.error("User not found");
        return;
    }
    
    const user = { id: userSnap.id, ...userSnap.data() };
    
    // Check if profile is private and viewer is not the owner
    const isPrivate = user.settings?.privateProfile || false;
    const isOwner = currentUser && currentUser.uid === uid;
    
    if (isPrivate && !isOwner) {
        showToast('This profile is private 🔒');
        return;
    }
    
    selectedUserId = uid;

    // Use custom name/avatar if available
    const displayName = user.customName || user.name || 'Anonymous';
    const displayAvatar = user.customAvatar || user.avatar || 'https://ui-avatars.com/api/?name=User';

    document.getElementById('dashboardName').textContent = displayName;
    document.getElementById('dashboardAvatar').src = displayAvatar;
    document.getElementById('dashTotalPoops').textContent = user.stats?.totalLogs || 0;
    document.getElementById('dashStreak').textContent = calculateStreak(user.stats?.lastLogDate);
    
    let userLogs = [];
    if (currentUser && uid === currentUser.uid) {
        userLogs = localLogs;
    } else {
        userLogs = [];
    }
    
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

    renderReactionsUI(user.reactions || {});
    await loadComments(uid);
    
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
    return diffDays <= 1 ? Math.floor(Math.random() * 5) + 1 : 0;
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
        
        if (!currentUser) {
            showToast('Please log in to react! 🔐');
            return;
        }
        
        if (!selectedUserId) {
            return;
        }
        
        if (selectedUserId === currentUser.uid) {
            showToast("You can't react to yourself! 😅");
            return;
        }
        
        try {
            await addReaction(selectedUserId, emoji);
            const reactions = await fetchUserReactions(selectedUserId);
            renderReactionsUI(reactions);
            
            // Visual feedback
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 500);
            
            showToast(`Reacted with ${emoji}!`);
        } catch (error) {
            console.error("Error adding reaction:", error);
            showToast('Failed to add reaction ❌');
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
    if (getRemainingCooldown() > 0) {
        const t = document.getElementById('toast');
        const textSpan = t.querySelector('span');
        if(textSpan) textSpan.textContent = 'Please wait before logging again! ⏳';
        t.classList.remove('opacity-0', 'translate-y-4');
        setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 2000);
        return;
    }

    const type = parseInt(document.getElementById('poopSlider').value);
    await saveLog(type); 
    
    const t = document.getElementById('toast');
    const textSpan = t.querySelector('span');
    if(textSpan) textSpan.textContent = 'Logged successfully! 💩';

    t.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 2000);

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

// Page Navigation (updated to use navigateToPage)
document.getElementById('navTracker').addEventListener('click', () => {
    navigateToPage('trackerPage');
});

document.getElementById('navLeaderboard').addEventListener('click', () => {
    navigateToPage('leaderboardPage');
    fetchAllUsersForLeaderboard();
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
updateAllUserDisplays();

// ====================================
// SIDE PANEL MENU
// ====================================
const sidePanel = document.getElementById('sidePanel');
const sidePanelOverlay = document.getElementById('sidePanelOverlay');
const closeSidePanelBtn = document.getElementById('closeSidePanel');
const userAvatarBtn = document.getElementById('userAvatar');
const guestSection = document.getElementById('guestSection');

function openSidePanel() {
    sidePanel.classList.add('open');
    sidePanelOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSidePanel() {
    sidePanel.classList.remove('open');
    sidePanelOverlay.classList.remove('open');
    document.body.style.overflow = '';
}

function updateSidePanelUser() {
    const sidePanelAvatar = document.getElementById('sidePanelAvatar');
    const sidePanelName = document.getElementById('sidePanelName');
    const sidePanelEmail = document.getElementById('sidePanelEmail');
    const menuLogout = document.getElementById('menuLogout');
    
    sidePanelAvatar.src = getAvatarUrl();
    sidePanelName.textContent = getDisplayName();
    
    if (currentUser) {
        sidePanelEmail.textContent = currentUser.email || '';
        menuLogout.style.display = 'flex';
    } else {
        sidePanelEmail.textContent = 'Not logged in';
        menuLogout.style.display = 'none';
    }
}

// Avatar click opens side panel
if (userAvatarBtn) {
    userAvatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSidePanel();
        updateSidePanelUser();
    });
}

// Guest avatar click also opens side panel
if (guestSection) {
    guestSection.addEventListener('click', (e) => {
        e.stopPropagation();
        openSidePanel();
        updateSidePanelUser();
    });
}

// Close panel handlers
closeSidePanelBtn.addEventListener('click', closeSidePanel);
sidePanelOverlay.addEventListener('click', closeSidePanel);

// Menu logout
document.getElementById('menuLogout').addEventListener('click', () => {
    closeSidePanel();
    logoutUser();
});

// ====================================
// NEW PAGES NAVIGATION
// ====================================
const allPages = ['trackerPage', 'leaderboardPage', 'myDashboardPage', 'profilePage', 'settingsPage'];
const mainNavs = ['navTracker', 'navLeaderboard'];

function navigateToPage(pageId) {
    // Hide all pages
    allPages.forEach(p => {
        const page = document.getElementById(p);
        if (page) page.classList.remove('active');
    });
    
    // Remove active from nav buttons
    mainNavs.forEach(n => {
        const nav = document.getElementById(n);
        if (nav) {
            nav.classList.remove('tab-active');
            nav.classList.add('text-amber-500', 'hover:text-amber-700', 'hover:bg-amber-50');
        }
    });
    
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
    
    // If it's a main nav page, highlight the nav button
    if (pageId === 'trackerPage') {
        document.getElementById('navTracker').classList.add('tab-active');
        document.getElementById('navTracker').classList.remove('text-amber-500');
    } else if (pageId === 'leaderboardPage') {
        document.getElementById('navLeaderboard').classList.add('tab-active');
        document.getElementById('navLeaderboard').classList.remove('text-amber-500');
    }
    
    closeSidePanel();
}

// Menu item handlers
document.getElementById('menuMyDashboard').addEventListener('click', () => {
    navigateToPage('myDashboardPage');
    renderMyDashboard();
});

document.getElementById('menuProfile').addEventListener('click', () => {
    navigateToPage('profilePage');
    renderProfilePage();
});

document.getElementById('menuSettings').addEventListener('click', () => {
    navigateToPage('settingsPage');
    loadPrivacySettings();
});

document.getElementById('menuTracker').addEventListener('click', () => {
    navigateToPage('trackerPage');
});

document.getElementById('menuLeaderboard').addEventListener('click', () => {
    navigateToPage('leaderboardPage');
    fetchAllUsersForLeaderboard();
});

// ====================================
// MY DASHBOARD PAGE RENDERING
// ====================================
let myDashLineChartInstance = null;
let myDashPieChartInstance = null;

function renderMyDashboard() {
    const logs = localLogs;
    
    // Total logs
    document.getElementById('dashMyTotalLogs').textContent = logs.length;
    
    // Calculate streak (simplified)
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const hasLog = logs.some(l => new Date(l.date).toDateString() === checkDate.toDateString());
        if (hasLog) streak++;
        else if (i > 0) break;
    }
    document.getElementById('dashMyStreak').textContent = streak;
    
    // Daily average (last 30 days)
    const thirtyDaysAgo = new Date(today - 30 * 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(l => new Date(l.date) >= thirtyDaysAgo);
    const dailyAvg = recentLogs.length > 0 ? (recentLogs.length / 30).toFixed(1) : '0';
    document.getElementById('dashDailyAvg').textContent = dailyAvg;
    
    // Most common type
    const typeCounts = {};
    logs.forEach(l => typeCounts[l.type] = (typeCounts[l.type] || 0) + 1);
    const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    if (mostCommonType) {
        document.getElementById('dashMostCommon').textContent = `${poopTypes[mostCommonType[0]]?.emoji || '💩'} Type ${mostCommonType[0]}`;
    } else {
        document.getElementById('dashMostCommon').textContent = '-';
    }
    
    // Best day of week
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    logs.forEach(l => {
        const day = new Date(l.date).getDay();
        dayCounts[day]++;
    });
    const bestDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
    document.getElementById('dashBestDay').textContent = logs.length > 0 ? dayNames[bestDayIndex] : '-';
    
    // Health score (based on type 3-4 being ideal)
    const idealLogs = logs.filter(l => l.type === 3 || l.type === 4).length;
    const healthScore = logs.length > 0 ? Math.round((idealLogs / logs.length) * 100) : 0;
    document.getElementById('dashHealthScore').textContent = `${healthScore}%`;
    
    // Weekly line chart
    if (myDashLineChartInstance) myDashLineChartInstance.destroy();
    const ctxL = document.getElementById('myDashLineChart').getContext('2d');
    const lData = [];
    const lLabels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        lLabels.push(dayNames[d.getDay()]);
        lData.push(logs.filter(l => new Date(l.date).toDateString() === d.toDateString()).length);
    }
    myDashLineChartInstance = new Chart(ctxL, {
        type: 'line',
        data: {
            labels: lLabels,
            datasets: [{
                label: 'Logs',
                data: lData,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#f97316',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
    
    // Pie chart
    if (myDashPieChartInstance) myDashPieChartInstance.destroy();
    const ctxP = document.getElementById('myDashPieChart').getContext('2d');
    const pData = Object.keys(poopTypes).map(k => typeCounts[k] || 0);
    myDashPieChartInstance = new Chart(ctxP, {
        type: 'doughnut',
        data: {
            labels: Object.values(poopTypes).map(t => `${t.emoji} ${t.label}`),
            datasets: [{
                data: pData,
                backgroundColor: Object.values(poopTypes).map(t => t.color),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 10, font: { size: 10 } }
                }
            }
        }
    });
}

// ====================================
// PROFILE PAGE RENDERING
// ====================================
async function renderProfilePage() {
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileJoinDate = document.getElementById('profileJoinDate');
    const profileTotalLogs = document.getElementById('profileTotalLogs');
    const profileRank = document.getElementById('profileRank');
    const profileReactions = document.getElementById('profileReactions');
    const profilePrivacyBadge = document.getElementById('profilePrivacyBadge');
    
    // Use custom profile data
    profileAvatar.src = getAvatarUrl();
    profileName.textContent = getDisplayName();
    
    if (currentUser) {
        profileEmail.textContent = currentUser.email || '';
        
        // Fetch user data from Firebase
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            
            // Show/hide privacy badge
            const isPrivate = userData.settings?.privateProfile || false;
            if (isPrivate) {
                profilePrivacyBadge.classList.remove('hidden');
            } else {
                profilePrivacyBadge.classList.add('hidden');
            }
            
            // Join date
            if (userData.createdAt) {
                const joinDate = userData.createdAt.toDate();
                profileJoinDate.textContent = joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
            
            // Total logs
            profileTotalLogs.textContent = userData.stats?.totalLogs || localLogs.length;
            
            // Calculate rank (only among visible users if not private)
            if (isPrivate) {
                profileRank.textContent = '🔒 Hidden';
            } else {
                const rankIndex = allUsers.findIndex(u => u.id === currentUser.uid);
                profileRank.textContent = rankIndex >= 0 ? `#${rankIndex + 1}` : '#-';
            }
            
            // Reactions
            const reactions = userData.reactions || {};
            const reactionEntries = Object.entries(reactions).filter(([k, v]) => v > 0);
            if (reactionEntries.length > 0) {
                profileReactions.innerHTML = reactionEntries.map(([emoji, count]) => 
                    `<span class="bg-amber-50 px-3 py-1 rounded-full">${emoji} <span class="font-black text-amber-800">${count}</span></span>`
                ).join('');
            } else {
                profileReactions.innerHTML = '<span class="text-amber-300">No reactions yet</span>';
            }
        }
    } else {
        profileEmail.textContent = 'Sign in to save your data';
        profileJoinDate.textContent = '-';
        profileTotalLogs.textContent = localLogs.length;
        profileRank.textContent = '#-';
        profileReactions.innerHTML = '<span class="text-amber-300">Sign in to receive reactions</span>';
        profilePrivacyBadge.classList.add('hidden');
    }
}

// ====================================
// SETTINGS HANDLERS
// ====================================
document.getElementById('exportDataBtn').addEventListener('click', () => {
    const data = {
        logs: localLogs,
        exportDate: new Date().toISOString(),
        user: currentUser ? { name: getDisplayName(), email: currentUser.email } : { name: getDisplayName() }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poop-master-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully! 📦');
});

document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all your local data? This cannot be undone!')) {
        localStorage.removeItem('poopLogs');
        localStorage.removeItem('lastLogTime');
        localLogs = [];
        refreshAllViews();
        showToast('Data cleared! 🗑️');
    }
});

// ====================================
// PRIVATE PROFILE TOGGLE HANDLER
// ====================================
const privateProfileToggle = document.getElementById('settingPrivateProfile');
const showOnLeaderboardToggle = document.getElementById('settingLeaderboard');

// Load privacy settings from Firebase when settings page is opened
async function loadPrivacySettings() {
    if (!currentUser) return;
    
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const isPrivate = userData.settings?.privateProfile || false;
            const showOnLeaderboard = userData.settings?.showOnLeaderboard !== false; // default true
            
            privateProfileToggle.checked = isPrivate;
            showOnLeaderboardToggle.checked = showOnLeaderboard;
            
            // If private profile is on, disable and uncheck leaderboard toggle
            if (isPrivate) {
                showOnLeaderboardToggle.checked = false;
                showOnLeaderboardToggle.disabled = true;
                showOnLeaderboardToggle.parentElement.classList.add('opacity-50');
            }
        }
    } catch (error) {
        console.error("Error loading privacy settings:", error);
    }
}

// Save private profile setting to Firebase
async function savePrivateProfileSetting(isPrivate) {
    if (!currentUser) {
        showToast('Please sign in to change settings 🔐');
        privateProfileToggle.checked = false;
        return;
    }
    
    try {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            'settings.privateProfile': isPrivate,
            'settings.showOnLeaderboard': !isPrivate // If private, hide from leaderboard
        });
        
        // Update the leaderboard toggle state
        if (isPrivate) {
            showOnLeaderboardToggle.checked = false;
            showOnLeaderboardToggle.disabled = true;
            showOnLeaderboardToggle.parentElement.classList.add('opacity-50');
        } else {
            showOnLeaderboardToggle.disabled = false;
            showOnLeaderboardToggle.parentElement.classList.remove('opacity-50');
        }
        
        // Refresh leaderboard
        renderLeaderboard();
        
        showToast(isPrivate ? 'Profile is now private 🔒' : 'Profile is now public 🌐');
    } catch (error) {
        console.error("Error saving privacy setting:", error);
        showToast('Failed to save setting ❌');
    }
}

// Save show on leaderboard setting
async function saveLeaderboardSetting(showOnLeaderboard) {
    if (!currentUser) {
        showToast('Please sign in to change settings 🔐');
        showOnLeaderboardToggle.checked = true;
        return;
    }
    
    try {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            'settings.showOnLeaderboard': showOnLeaderboard
        });
        
        // Refresh leaderboard
        renderLeaderboard();
        
        showToast(showOnLeaderboard ? 'Visible on leaderboard 📊' : 'Hidden from leaderboard 👻');
    } catch (error) {
        console.error("Error saving leaderboard setting:", error);
        showToast('Failed to save setting ❌');
    }
}

// Event listeners for privacy toggles
privateProfileToggle.addEventListener('change', (e) => {
    savePrivateProfileSetting(e.target.checked);
});

showOnLeaderboardToggle.addEventListener('change', (e) => {
    saveLeaderboardSetting(e.target.checked);
});

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

    if (navigator.share) {
        try {
            await navigator.share({ title: "Poop Tracker", text, url });
            return;
        } catch (e) {
            // fallthrough to clipboard fallback
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        window.open('https://www.instagram.com/', '_blank');
        alert('Share text copied to clipboard. Paste it into Instagram to share.');
    } catch (e) {
        window.open('https://www.instagram.com/', '_blank');
    }
}

function shareToSMS() {
    const name = document.getElementById('dashboardName')?.textContent || 'a user';
    const url = getShareUrlForSelectedUser();
    const body = `Check out ${name}'s Poop Tracker stats: ${url}`;
    const smsUrl = `sms:?body=${encodeURIComponent(body)}`;
    window.location.href = smsUrl;
}

// Wire up buttons
const _getEl = (ids) => ids.map(id => document.getElementById(id)).find(Boolean);
const xBtn = _getEl(['shareX', 'shareXBtn', 'shareTwitter', 'share-twitter']);
const igBtn = _getEl(['shareInstagram', 'shareInstagramBtn', 'shareIG', 'share-instagram']);
const smsBtn = _getEl(['shareSMS', 'shareSms', 'share-sms']);
if (xBtn) xBtn.addEventListener('click', (e) => { e.preventDefault(); shareToX(); });
if (igBtn) igBtn.addEventListener('click', (e) => { e.preventDefault(); shareToInstagram(); });
if (smsBtn) smsBtn.addEventListener('click', (e) => { e.preventDefault(); shareToSMS(); });