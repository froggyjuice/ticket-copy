const PRICE = 0;
const PERFORMANCE_NAME = '제1회 HEXA 오케스트라 정기연주회';
const PERFORMANCE_AT = '2026-06-19T19:30:00+09:00';
const PERFORMANCE_DATE_LABEL = '2026.06.19 금 19:30';
const FIREBASE_VERSION = '10.12.5';
const BLOCK_NAMES = {
    A: '가',
    B: '나',
    C: '다'
};

const screens = {
    1: document.getElementById('step-seat'),
    2: document.getElementById('step-info'),
    3: document.getElementById('step-complete')
};

const steps = [...document.querySelectorAll('.step')];
const summarySeat = document.getElementById('summary-seat');
const summaryPayment = document.getElementById('summary-payment');
const confirmMessage = document.getElementById('confirm-message');
const completeTitle = document.getElementById('complete-title');
const completeDetail = document.getElementById('complete-detail');
const seatMap = document.getElementById('seat-map');
const blockHelper = document.getElementById('block-helper');
const backBlocks = document.getElementById('back-blocks');
const buyerName = document.getElementById('buyer-name');
const buyerPhone = document.getElementById('buyer-phone');
const agreeCheck = document.getElementById('agree-check');
const goInfoButton = document.getElementById('go-info');
const toast = document.getElementById('toast');
const ticketingSection = document.getElementById('ticketing');
const ticketApp = document.getElementById('ticket-app');
const openTicketButtons = [...document.querySelectorAll('[data-open-ticket]')];
const heroDday = document.getElementById('hero-dday');
const detailDday = document.getElementById('detail-dday');
const heroDate = document.getElementById('hero-date');
const loginForm = document.getElementById('login-form');
const loginName = document.getElementById('login-name');
const loginPhone = document.getElementById('login-phone');
const accountName = document.getElementById('account-name');
const accountPhone = document.getElementById('account-phone');
const accountNote = document.getElementById('current-account-note');
const logoutAccount = document.getElementById('logout-account');
const ticketWallet = document.getElementById('ticket-wallet');
const seatStatusGrid = document.getElementById('seat-status-grid');
const fsmNodes = [...document.querySelectorAll('[data-fsm]')];
const saveCompleteTicket = document.getElementById('save-complete-ticket');
const viewWallet = document.getElementById('view-wallet');
const dbStatus = document.getElementById('db-status');
const adminForm = document.getElementById('admin-form');
const adminEmail = document.getElementById('admin-email');
const adminPassword = document.getElementById('admin-password');
const adminAuthStatus = document.getElementById('admin-auth-status');
const adminPanel = document.getElementById('admin-panel');
const adminBookings = document.getElementById('admin-bookings');
const adminLogout = document.getElementById('admin-logout');
const adminSearch = document.getElementById('admin-search');
const adminRefresh = document.getElementById('admin-refresh');

let currentFloor = 'all';
let activeBlock = null;
let selectedSeatIds = [];
let currentCompletedBooking = null;
let currentAccount = safeGet('currentAccount', null);
let bookingsCache = [];
let seatReservationsCache = {};
let firebaseDb = null;
let firebaseApi = null;
let firebaseAuth = null;
let authApi = null;
let adminFirebaseDb = null;
let adminFirebaseAuth = null;
let adminFirebaseUser = null;
let currentFirebaseUser = null;
let storageMode = 'local';
let adminUnlocked = false;
let adminBookingRecords = [];
let adminAccessDenied = false;
let isCompletingBooking = false;
let lastFirebaseError = '';

function safeGet(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        return fallback;
    }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        // The page still works without persistent storage.
    }
}

function safeRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        // Ignore storage cleanup errors in file:// contexts.
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizePhone(value) {
    return value.replace(/\D/g, '').slice(0, 11);
}

function accountKey(name, phone) {
    return `${name.trim()}::${normalizePhone(phone)}`;
}

async function sha256Hex(value) {
    if (window.crypto?.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(value);
        const hash = await window.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    return `fallback-${Math.abs(hashString(value))}`;
}

async function accountLookupKey(name, phone) {
    return `v1_${await sha256Hex(accountKey(name, phone))}`;
}

function makeAccount(name, phone) {
    return {
        name: name.trim(),
        phone: formatPhoneNumber(phone),
        key: accountKey(name, phone)
    };
}

function createSeatData() {
    const seats = [];

    const addBlock = ({ floor, block, rowCounts }) => {
        let number = 1;

        rowCounts.forEach((count, rowIndex) => {
            for (let column = 1; column <= count; column++) {
                const id = `${floor}-${block}-${String(number).padStart(3, '0')}`;
                seats.push({
                    id,
                    floor,
                    block,
                    blockName: BLOCK_NAMES[block],
                    number,
                    row: rowIndex + 1,
                    column,
                    blocked: false
                });
                number++;
            }
        });
    };

    const sideFirstFloorRows = [8, 9, 10, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11];

    addBlock({ floor: '1F', block: 'A', rowCounts: sideFirstFloorRows });
    addBlock({ floor: '1F', block: 'B', rowCounts: [12, 12, 12, 11, 12, 12, 12, 12, 12, 12, 12, 12, 16] });
    addBlock({ floor: '1F', block: 'C', rowCounts: sideFirstFloorRows });
    addBlock({ floor: '2F', block: 'A', rowCounts: [5, 5, 11, 11, 11, 11, 11] });
    addBlock({ floor: '2F', block: 'B', rowCounts: [12, 11, 12, 12, 12] });
    addBlock({ floor: '2F', block: 'C', rowCounts: [5, 5, 11, 11, 11, 11, 11] });

    return seats;
}

const seats = createSeatData();

function getBookings() {
    return bookingsCache;
}

function getTicketImages() {
    return safeGet('ticketImages', {});
}

function hasFirebaseConfig() {
    const config = window.FIREBASE_CONFIG || {};
    return Boolean(config.apiKey && config.projectId && config.appId);
}

function updateDbStatus(message) {
    if (!dbStatus) return;

    dbStatus.classList.remove('is-online', 'is-local');
    if (storageMode === 'firebase') {
        dbStatus.classList.add('is-online');
        dbStatus.textContent = message || 'Firebase 보안 모드 연결됨: 좌석 상태는 공개, 이름/전화번호는 본인 경로에만 저장됩니다.';
        return;
    }

    dbStatus.classList.add('is-local');
    dbStatus.textContent = message || 'Firebase 설정값이 비어 있어 현재는 브라우저 로컬 저장소에 저장됩니다.';
}

function seatReservationsPath() {
    return window.FIREBASE_SEAT_RESERVATIONS_PATH || 'seatReservations';
}

function userBookingsRootPath() {
    return window.FIREBASE_USER_BOOKINGS_PATH || 'userBookings';
}

function userBookingsPath(uid = currentFirebaseUser?.uid) {
    return uid ? `${userBookingsRootPath()}/${uid}` : userBookingsRootPath();
}

function accountBookingsRootPath() {
    return window.FIREBASE_ACCOUNT_BOOKINGS_PATH || 'accountBookings';
}

function accountBookingsPath(lookupKey) {
    return `${accountBookingsRootPath()}/${lookupKey}`;
}

function firebaseDatabaseUrl() {
    const config = window.FIREBASE_CONFIG || {};
    return config.databaseURL || window.FIREBASE_DATABASE_URL || `https://${config.projectId}-default-rtdb.firebaseio.com`;
}

function firebaseErrorMessage(error) {
    const message = error?.message || String(error || '');
    if (message.includes('Database lives in a different region')) {
        return 'Realtime Database URL 지역이 맞지 않습니다. firebase-config.js의 databaseURL을 콘솔에 표시된 URL과 맞춰 주세요.';
    }
    if (message.includes('permission_denied') || message.includes('permission-denied') || message.includes('Permission denied')) {
        return 'Realtime Database 보안 규칙이 읽기/쓰기를 막고 있습니다. 인증 상태와 DB 규칙을 확인해 주세요.';
    }
    if (message.includes('auth/operation-not-allowed') || message.includes('auth/configuration-not-found') || message.includes('CONFIGURATION_NOT_FOUND')) {
        return 'Firebase Authentication 또는 Anonymous Auth가 꺼져 있습니다. Firebase Console > Authentication에서 시작하기를 누르고 익명 로그인을 켜 주세요.';
    }
    if (message.includes('Failed to fetch') || message.includes('network')) {
        return 'Firebase 네트워크 연결에 실패했습니다. 인터넷 연결 또는 브라우저 차단 설정을 확인해 주세요.';
    }
    return `Firebase 오류: ${message}`;
}

async function initFirebaseStorage() {
    if (!hasFirebaseConfig()) {
        storageMode = 'local';
        bookingsCache = safeGet('bookings', []);
        lastFirebaseError = 'Firebase 설정값이 비어 있습니다.';
        updateDbStatus();
        return;
    }

    try {
        const [appModule, databaseModule, authModule] = await Promise.all([
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`)
        ]);

        const existingApps = appModule.getApps();
        const app = existingApps.find(item => item.name === '[DEFAULT]')
            || appModule.initializeApp(window.FIREBASE_CONFIG);
        const adminApp = existingApps.find(item => item.name === 'admin')
            || appModule.initializeApp(window.FIREBASE_CONFIG, 'admin');
        firebaseDb = databaseModule.getDatabase(app, firebaseDatabaseUrl());
        firebaseApi = databaseModule;
        firebaseAuth = authModule.getAuth(app);
        authApi = authModule;
        adminFirebaseDb = databaseModule.getDatabase(adminApp, firebaseDatabaseUrl());
        adminFirebaseAuth = authModule.getAuth(adminApp);
        const credential = await authModule.signInAnonymously(firebaseAuth);
        currentFirebaseUser = credential.user;
        storageMode = 'firebase';
        await refreshBookingsFromFirebase();
        lastFirebaseError = '';
        updateDbStatus();
    } catch (error) {
        storageMode = 'local';
        firebaseDb = null;
        firebaseApi = null;
        firebaseAuth = null;
        authApi = null;
        adminFirebaseDb = null;
        adminFirebaseAuth = null;
        adminFirebaseUser = null;
        currentFirebaseUser = null;
        seatReservationsCache = {};
        bookingsCache = [];
        safeSet('bookings', bookingsCache);
        lastFirebaseError = firebaseErrorMessage(error);
        updateDbStatus(`${lastFirebaseError} Firebase에는 개인정보를 저장하지 않고 현재 브라우저에만 임시 저장됩니다.`);
    }
}

async function refreshBookingsFromFirebase() {
    if (!firebaseDb || !firebaseApi) return;

    const reservationsSnapshot = await firebaseApi.get(firebaseApi.ref(firebaseDb, seatReservationsPath()));
    const reservationValues = reservationsSnapshot.exists() ? reservationsSnapshot.val() : {};
    seatReservationsCache = Object.fromEntries(
        Object.entries(reservationValues || {})
            .filter(([, value]) => value && typeof value === 'object')
            .map(([key, value]) => [key, {
                ...value,
                seatId: value.seatId || key
            }])
    );

    if (!currentFirebaseUser) {
        bookingsCache = [];
        safeSet('bookings', bookingsCache);
        return;
    }

    const userBookingsSnapshot = await firebaseApi.get(firebaseApi.ref(firebaseDb, userBookingsPath()));
    const userBookingValues = userBookingsSnapshot.exists() ? userBookingsSnapshot.val() : {};
    const records = Object.entries(userBookingValues || {})
        .filter(([, value]) => value && typeof value === 'object')
        .map(([key, value]) => ({
            ...value,
            id: value.id || key,
            __docId: key
        }));

    const seatRecords = records.filter(record => record.seatId);
    bookingsCache = groupSeatRecords(seatRecords);
    safeSet('bookings', bookingsCache);
}

async function refreshAccountBookingsFromFirebase(account = currentAccount) {
    if (!firebaseDb || !firebaseApi || !account) return false;

    try {
        const lookupKey = await accountLookupKey(account.name, account.phone);
        const snapshot = await firebaseApi.get(firebaseApi.ref(firebaseDb, accountBookingsPath(lookupKey)));
        const values = snapshot.exists() ? snapshot.val() : {};
        const records = Object.entries(values || {})
            .filter(([, value]) => value && typeof value === 'object')
            .map(([key, value]) => ({
                ...value,
                id: value.id || key,
                lookupKey: value.lookupKey || lookupKey,
                __docId: key
            }))
            .filter(record => record.seatId && bookingBelongsToAccount({ accountKey: record.accountKey, buyer: { name: record.name, phone: record.phone } }, account));

        bookingsCache = groupSeatRecords(records);
        safeSet('bookings', bookingsCache);
        return true;
    } catch (error) {
        console.warn('Account booking lookup failed.', error);
        showToast(firebaseErrorMessage(error));
        return false;
    }
}

function setAdminStatus(message, state = 'idle') {
    if (!adminAuthStatus) return;
    adminAuthStatus.textContent = message;
    adminAuthStatus.classList.remove('is-ok', 'is-error', 'is-loading');
    if (state !== 'idle') {
        adminAuthStatus.classList.add(`is-${state}`);
    }
}

function adminErrorMessage(error) {
    const message = error?.message || String(error || '');
    if (message.includes('auth/invalid-credential') || message.includes('auth/user-not-found') || message.includes('auth/wrong-password')) {
        return '관리자 이메일 또는 비밀번호를 확인해 주세요.';
    }
    if (message.includes('auth/operation-not-allowed')) {
        return 'Firebase Authentication에서 Email/Password 로그인을 켜 주세요.';
    }
    if (message.includes('permission_denied') || message.includes('Permission denied')) {
        return '관리자 권한이 아직 없습니다. UID를 admins 경로에 등록해 주세요.';
    }
    return firebaseErrorMessage(error);
}

function adminUidHint() {
    if (!adminFirebaseUser?.uid) return '';
    return `
        <p class="wallet-empty">
            관리자 UID: <strong>${escapeHtml(adminFirebaseUser.uid)}</strong><br>
            Firebase Realtime Database의 admins/${escapeHtml(adminFirebaseUser.uid)} 값을 true로 추가하면 이 계정에서 전체 목록을 볼 수 있습니다.
        </p>
    `;
}

function flattenAdminBookingRecords(values) {
    return Object.entries(values || {}).flatMap(([uid, userRecords]) => (
        Object.entries(userRecords || {})
            .filter(([, value]) => value && typeof value === 'object' && value.seatId)
            .map(([recordId, value]) => ({
                ...value,
                uid: value.uid || uid,
                id: value.id || recordId,
                __uid: uid,
                __recordId: recordId
            }))
    )).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function adminFilteredRecords() {
    const keyword = (adminSearch?.value || '').trim().toLowerCase();
    if (!keyword) return adminBookingRecords;

    return adminBookingRecords.filter(record => (
        [
            record.name,
            record.phone,
            record.seatLabel,
            record.bookingNo,
            record.id
        ].some(value => String(value || '').toLowerCase().includes(keyword))
    ));
}

async function loadAdminBookings(showMessage = false) {
    if (!adminBookings || !adminUnlocked) return false;

    if (storageMode !== 'firebase' || !adminFirebaseDb || !firebaseApi) {
        adminBookingRecords = [];
        renderAdminBookings();
        return false;
    }

    adminBookings.innerHTML = '<p class="wallet-empty">관리자 예매 목록을 불러오는 중입니다.</p>';
    setAdminStatus('관리자 권한 확인 중', 'loading');

    try {
        const snapshot = await firebaseApi.get(firebaseApi.ref(adminFirebaseDb, userBookingsRootPath()));
        const values = snapshot.exists() ? snapshot.val() : {};
        adminBookingRecords = flattenAdminBookingRecords(values);
        adminAccessDenied = false;
        renderAdminBookings();
        setAdminStatus('관리자 모드 연결됨', 'ok');
        if (showMessage) showToast('관리자 예매 목록을 불러왔습니다.');
        return true;
    } catch (error) {
        adminBookingRecords = [];
        adminAccessDenied = true;
        renderAdminBookings();
        setAdminStatus(adminErrorMessage(error), 'error');
        return false;
    }
}

async function cancelAdminSeat(recordId, seatId, uid) {
    const record = adminBookingRecords.find(item => (
        item.__recordId === recordId && item.seatId === seatId && item.__uid === uid
    ));

    if (!record) {
        showToast('취소할 예매 기록을 찾을 수 없습니다.');
        return;
    }

    if (!window.confirm(`${record.seatLabel} 좌석 예매를 취소할까요?`)) {
        return;
    }

    try {
        await Promise.all([
            firebaseApi.remove(firebaseApi.ref(adminFirebaseDb, `${seatReservationsPath()}/${seatId}`)),
            firebaseApi.remove(firebaseApi.ref(adminFirebaseDb, `${userBookingsRootPath()}/${uid}/${recordId}`)),
            ...(record.lookupKey ? [
                firebaseApi.remove(firebaseApi.ref(adminFirebaseDb, `${accountBookingsPath(record.lookupKey)}/${recordId}`))
            ] : [])
        ]);
        await refreshBookingsFromFirebase();
        await loadAdminBookings();
        renderSeatMap();
        renderSummaries();
        renderAccount();
        showToast(`${record.seatLabel} 좌석 예매가 취소되었습니다.`);
    } catch (error) {
        setAdminStatus(adminErrorMessage(error), 'error');
        showToast('관리자 예매 취소에 실패했습니다.');
    }
}

async function saveBookingRecord(booking) {
    bookingsCache = [...bookingsCache, booking];
    safeSet('bookings', bookingsCache);

    if (firebaseDb && firebaseApi) {
        if (!currentFirebaseUser) {
            lastFirebaseError = 'Firebase 익명 인증이 완료되지 않았습니다.';
            updateDbStatus(`${lastFirebaseError} 예매는 현재 브라우저에만 임시 저장했습니다.`);
            return false;
        }

        const privateRecords = seatRecordsFromBooking(booking);
        const publicRecords = seatReservationRecordsFromBooking(booking);
        const reservedSeats = [];

        try {
            for (const record of publicRecords) {
                const result = await firebaseApi.runTransaction(
                    firebaseApi.ref(firebaseDb, `${seatReservationsPath()}/${record.seatId}`),
                    currentValue => (currentValue === null ? record : undefined)
                );

                if (!result.committed) {
                    throw new Error('이미 예매된 좌석입니다.');
                }

                reservedSeats.push(record.seatId);
            }

            await Promise.all(privateRecords.flatMap(record => [
                firebaseApi.set(firebaseApi.ref(firebaseDb, `${userBookingsPath()}/${record.id}`), record),
                ...(record.lookupKey ? [
                    firebaseApi.set(firebaseApi.ref(firebaseDb, `${accountBookingsPath(record.lookupKey)}/${record.id}`), record)
                ] : [])
            ]));
            await refreshBookingsFromFirebase();
            return true;
        } catch (error) {
            console.warn('Firebase booking save failed. Falling back to local storage.', error);
            await Promise.all(reservedSeats.map(seatId => (
                firebaseApi.remove(firebaseApi.ref(firebaseDb, `${seatReservationsPath()}/${seatId}`))
            )));
            bookingsCache = bookingsCache.filter(item => item.bookingNo !== booking.bookingNo);
            safeSet('bookings', bookingsCache);
            lastFirebaseError = firebaseErrorMessage(error);
            updateDbStatus(`${lastFirebaseError} Firebase에는 이 예매를 저장하지 않았습니다.`);
            return false;
        }
    }

    return false;
}

async function updateBookingRecord(updatedBooking) {
    bookingsCache = bookingsCache.map(booking => (
        booking.bookingNo === updatedBooking.bookingNo ? updatedBooking : booking
    ));
    safeSet('bookings', bookingsCache);

    if (firebaseDb && firebaseApi) {
        await Promise.all(seatRecordsFromBooking(updatedBooking).flatMap(record => [
            firebaseApi.set(firebaseApi.ref(firebaseDb, `${userBookingsPath()}/${record.id}`), record),
            ...(record.lookupKey ? [
                firebaseApi.set(firebaseApi.ref(firebaseDb, `${accountBookingsPath(record.lookupKey)}/${record.id}`), record)
            ] : [])
        ]));
    }
}

async function deleteBookingRecord(bookingNo) {
    const booking = bookingsCache.find(item => item.bookingNo === bookingNo);
    const records = booking ? seatRecordsFromBooking(booking) : [];
    bookingsCache = bookingsCache.filter(booking => booking.bookingNo !== bookingNo);
    safeSet('bookings', bookingsCache);

    if (firebaseDb && firebaseApi && booking) {
        await Promise.all(records.flatMap(record => [
            firebaseApi.remove(firebaseApi.ref(firebaseDb, `${seatReservationsPath()}/${record.seatId}`)),
            firebaseApi.remove(firebaseApi.ref(firebaseDb, `${userBookingsPath()}/${record.id}`)),
            ...(record.lookupKey ? [
                firebaseApi.remove(firebaseApi.ref(firebaseDb, `${accountBookingsPath(record.lookupKey)}/${record.id}`))
            ] : [])
        ]));
    }
}

async function deleteSeatRecord(bookingNo, seatId) {
    const booking = bookingsCache.find(item => item.bookingNo === bookingNo);
    const record = booking ? seatRecordsFromBooking(booking).find(item => item.seatId === seatId) : null;

    if (firebaseDb && firebaseApi) {
        await Promise.all([
            firebaseApi.remove(firebaseApi.ref(firebaseDb, `${seatReservationsPath()}/${seatId}`)),
            firebaseApi.remove(firebaseApi.ref(firebaseDb, `${userBookingsPath()}/${seatBookingId(bookingNo, seatId)}`)),
            ...(record?.lookupKey ? [
                firebaseApi.remove(firebaseApi.ref(firebaseDb, `${accountBookingsPath(record.lookupKey)}/${record.id}`))
            ] : [])
        ]);
    }
}

async function clearBookingRecords() {
    const bookingRecords = bookingsCache.flatMap(seatRecordsFromBooking);
    bookingsCache = [];
    safeSet('bookings', bookingsCache);

    if (firebaseDb && firebaseApi) {
        await Promise.all(bookingRecords.flatMap(record => [
            firebaseApi.remove(firebaseApi.ref(firebaseDb, `${seatReservationsPath()}/${record.seatId}`)),
            firebaseApi.remove(firebaseApi.ref(firebaseDb, `${userBookingsPath()}/${record.id}`)),
            ...(record.lookupKey ? [
                firebaseApi.remove(firebaseApi.ref(firebaseDb, `${accountBookingsPath(record.lookupKey)}/${record.id}`))
            ] : [])
        ]));
    }
}

function getReservedSeatIds() {
    const remote = Object.keys(seatReservationsCache);
    const saved = getBookings().flatMap(booking => booking.seats.map(seat => seat.id));
    return new Set([...remote, ...saved]);
}

function formatMoney(value) {
    if (value === 0) return '무료';
    return `${value.toLocaleString('ko-KR')}원`;
}

function formatSeat(seat) {
    return `${seat.floor} ${seat.blockName}블록 ${seat.number}번`;
}

function formatDate(value) {
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function getSeatById(id) {
    return seats.find(seat => seat.id === id);
}

function getSelectedSeats() {
    return selectedSeatIds.map(getSeatById).filter(Boolean);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 2200);
}

function updateFSM(state) {
    fsmNodes.forEach(node => {
        node.classList.toggle('is-active', node.dataset.fsm === state);
    });
}

function syncBookingFormWithAccount() {
    if (!currentAccount) return;
    buyerName.value = currentAccount.name;
    buyerPhone.value = currentAccount.phone;
}

function updateAccountNote() {
    if (!accountNote) return;
    accountNote.textContent = currentAccount
        ? `${currentAccount.name}님의 내 티켓 보관함에 예매가 저장됩니다.`
        : '로그인하면 이 정보로 내 티켓 보관함에 저장됩니다.';
}

function setTicketStep(step) {
    const stepScreens = {
        1: document.getElementById('step-seat'),
        2: document.getElementById('step-info'),
        3: document.getElementById('step-complete')
    };

    Object.entries(stepScreens).forEach(([key, screen]) => {
        if (!screen) return;
        const isActive = Number(key) === step;
        screen.classList.toggle('is-active', isActive);
        screen.hidden = !isActive;
        screen.style.display = isActive ? 'block' : 'none';
    });

    document.querySelectorAll('.step').forEach(button => {
        const buttonStep = Number(button.dataset.step);
        button.classList.toggle('is-active', buttonStep === step);
        button.disabled = buttonStep > step;
    });
}

function showCompleteScreen(booking) {
    ticketApp.classList.remove('is-hidden');
    try {
        renderComplete(booking);
    } catch (error) {
        console.warn('Complete receipt rendering failed.', error);
    }
    setTicketStep(3);
    updateFSM('complete');
    window.location.hash = 'ticketing';
    ticketingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goToStep(step) {
    setTicketStep(step);

    if (step === 2) {
        syncBookingFormWithAccount();
    }

    renderSummaries();
    updateFSM(step === 1 ? (activeBlock ? 'seat' : 'block') : step === 2 ? 'info' : 'complete');
    ticketingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openTicketing() {
    ticketApp.classList.remove('is-hidden');
    syncBookingFormWithAccount();
    if (!seatMap.children.length) {
        renderSeatMap();
    }
    goToStep(1);
}

function getSeatStatus(seat) {
    if (seat.blocked) return 'blocked';
    if (selectedSeatIds.includes(seat.id)) return 'selected';
    if (getReservedSeatIds().has(seat.id)) return 'reserved';
    return 'available';
}

function floorFilteredSeats() {
    return seats.filter(seat => {
        if (currentFloor !== 'all' && seat.floor !== currentFloor) return false;
        return true;
    });
}

function renderSeatMap() {
    seatMap.innerHTML = '';
    seatMap.className = activeBlock ? 'seat-map detail-mode' : 'seat-map overview-mode';
    blockHelper.classList.toggle('is-hidden', Boolean(activeBlock));
    backBlocks.classList.toggle('is-hidden', !activeBlock);

    if (!activeBlock) {
        renderBlockOverview();
        return;
    }

    renderBlockDetail(activeBlock);
}

function renderBlockOverview() {
    const section = document.createElement('section');
    section.className = 'block-overview';
    section.innerHTML = `
        <div class="block-overview-title">
            <h3>블록을 선택하세요</h3>
            <span>${currentFloor === 'all' ? '1층과 2층 전체' : currentFloor}</span>
        </div>
    `;

    const overviewGrid = document.createElement('div');
    overviewGrid.className = 'block-overview-grid';

    ['A', 'B', 'C'].forEach(block => {
        const blockSeats = floorFilteredSeats().filter(seat => seat.block === block);
        const statusCounts = blockSeats.reduce((counts, seat) => {
            counts[getSeatStatus(seat)] += 1;
            return counts;
        }, { available: 0, selected: 0, reserved: 0, blocked: 0 });

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'block-overview-card';
        card.setAttribute('aria-label', `${BLOCK_NAMES[block]}블록 확대`);
        card.innerHTML = `
            <div class="block-card-header">
                <h3>${BLOCK_NAMES[block]}블록</h3>
                <strong>${statusCounts.available}석 가능</strong>
            </div>
            <div class="block-card-meta">
                <span>선택 ${statusCounts.selected}</span>
                <span>예매 ${statusCounts.reserved}</span>
            </div>
        `;

        card.appendChild(createMiniSeatMap(blockSeats));
        card.addEventListener('click', () => {
            activeBlock = block;
            renderSeatMap();
            renderSummaries();
            updateFSM('seat');
        });
        overviewGrid.appendChild(card);
    });

    section.appendChild(overviewGrid);
    seatMap.appendChild(section);
}

function createMiniSeatMap(blockSeats) {
    const miniMap = document.createElement('div');
    miniMap.className = 'mini-seat-map';

    const floors = [...new Set(blockSeats.map(seat => seat.floor))];
    floors.forEach(floor => {
        const floorGroup = document.createElement('div');
        floorGroup.className = 'mini-floor-group';

        const floorLabel = document.createElement('span');
        floorLabel.className = 'mini-floor-label';
        floorLabel.textContent = floor;
        floorGroup.appendChild(floorLabel);

        const floorSeats = blockSeats.filter(seat => seat.floor === floor);
        [...new Set(floorSeats.map(seat => seat.row))].forEach(row => {
            const rowElement = document.createElement('div');
            rowElement.className = 'mini-seat-row';

            floorSeats
                .filter(seat => seat.row === row)
                .forEach(seat => {
                    const dot = document.createElement('span');
                    dot.className = `mini-seat ${getSeatStatus(seat)}`;
                    rowElement.appendChild(dot);
                });

            floorGroup.appendChild(rowElement);
        });

        miniMap.appendChild(floorGroup);
    });

    return miniMap;
}

function renderBlockDetail(block) {
    const visibleSeats = floorFilteredSeats().filter(seat => seat.block === block);

    const header = document.createElement('div');
    header.className = 'block-detail-header';
    header.innerHTML = `
        <div>
            <span>확대 보기</span>
            <h3>${BLOCK_NAMES[block]}블록 좌석 선택</h3>
        </div>
        <button class="ghost-button" type="button">블록 전체 보기</button>
    `;
    header.querySelector('button').addEventListener('click', showBlockOverview);
    seatMap.appendChild(header);

    const floors = [...new Set(visibleSeats.map(seat => seat.floor))];

    floors.forEach(floor => {
        const floorSection = document.createElement('section');
        floorSection.className = 'floor-section';
        floorSection.innerHTML = `<h3>${floor}</h3>`;

        const blockGrid = document.createElement('div');
        blockGrid.className = 'block-grid';

        [block].forEach(blockCode => {
            const blockSeats = visibleSeats.filter(seat => seat.floor === floor && seat.block === blockCode);
            if (blockSeats.length === 0) return;

            const blockElement = document.createElement('article');
            blockElement.className = 'seat-block expanded';
            blockElement.innerHTML = `<h4>${BLOCK_NAMES[blockCode]}블록</h4>`;

            const rowsElement = document.createElement('div');
            rowsElement.className = 'seat-rows';

            [...new Set(blockSeats.map(seat => seat.row))].forEach(row => {
                const rowElement = document.createElement('div');
                rowElement.className = 'seat-row';

                blockSeats
                    .filter(seat => seat.row === row)
                    .forEach(seat => {
                        const status = getSeatStatus(seat);
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = `seat ${status}`;
                        button.textContent = seat.number;
                        button.title = formatSeat(seat);
                        button.disabled = status === 'blocked' || status === 'reserved';
                        button.addEventListener('click', () => toggleSeat(seat));
                        rowElement.appendChild(button);
                    });

                rowsElement.appendChild(rowElement);
            });

            blockElement.appendChild(rowsElement);
            blockGrid.appendChild(blockElement);
        });

        floorSection.appendChild(blockGrid);
        seatMap.appendChild(floorSection);
    });
}

function showBlockOverview() {
    activeBlock = null;
    renderSeatMap();
    renderSummaries();
    updateFSM('block');
}

function toggleSeat(seat) {
    if (selectedSeatIds.includes(seat.id)) {
        selectedSeatIds = [];
    } else {
        selectedSeatIds = [seat.id];
    }

    renderSeatMap();
    renderSummaries();
    updateFSM('seat');
}

function summaryRow(label, value) {
    return `<div class="summary-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderSummaries() {
    const selectedSeats = getSelectedSeats();
    const count = selectedSeats.length;
    const selectedLabels = count ? selectedSeats.map(seat => escapeHtml(formatSeat(seat))).join('<br>') : '선택 전';
    const total = count * PRICE;

    summarySeat.innerHTML = [
        summaryRow('공연', escapeHtml(PERFORMANCE_NAME)),
        summaryRow('선택 좌석', count ? '1석' : '0석'),
        summaryRow('좌석', selectedLabels),
        summaryRow('예매 금액', formatMoney(total))
    ].join('');

    summaryPayment.innerHTML = [
        summaryRow('공연', escapeHtml(PERFORMANCE_NAME)),
        summaryRow('예매 좌석', count ? '1석' : '0석'),
        summaryRow('좌석', selectedLabels),
        summaryRow('예매 금액', formatMoney(total))
    ].join('');

    confirmMessage.textContent = count
        ? `선택한 좌석 1석을 예매합니다.`
        : '좌석을 먼저 선택해 주세요.';

    goInfoButton.disabled = count === 0;
    renderSeatStatus();
}

function formatPhoneNumber(value) {
    const digits = normalizePhone(value);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function makeBookingNumber() {
    const today = new Date();
    const datePart = today.toISOString().slice(2, 10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `YJ${datePart}${randomPart}`;
}

function seatBookingId(bookingNo, seatId) {
    return `${bookingNo}-${seatId}`;
}

function bookingFromSeatRecords(records) {
    if (records.length === 0) return null;

    const first = records[0];
    const seatsForBooking = records.map(record => ({
        id: record.seatId,
        label: record.seatLabel
    }));

    return {
        bookingNo: first.bookingNo,
        performance: first.performance,
        performanceAt: first.performanceAt,
        accountKey: first.accountKey,
        lookupKey: first.lookupKey,
        uid: first.uid,
        name: first.name,
        phone: first.phone,
        buyer: {
            name: first.name,
            phone: first.phone
        },
        seatIds: seatsForBooking.map(seat => seat.id),
        seatLabels: seatsForBooking.map(seat => seat.label),
        seats: seatsForBooking,
        total: seatsForBooking.length * PRICE,
        createdAt: first.createdAt,
        updatedAt: first.updatedAt
    };
}

function groupSeatRecords(records) {
    const grouped = records.reduce((groups, record) => {
        const key = record.bookingNo;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
        return groups;
    }, new Map());

    return [...grouped.values()]
        .map(bookingFromSeatRecords)
        .filter(Boolean)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function seatRecordsFromBooking(booking) {
    return booking.seats.map(seat => ({
        id: seatBookingId(booking.bookingNo, seat.id),
        bookingNo: booking.bookingNo,
        performance: booking.performance,
        performanceAt: booking.performanceAt,
        accountKey: booking.accountKey,
        lookupKey: booking.lookupKey || '',
        uid: booking.uid || currentFirebaseUser?.uid || '',
        name: booking.name || booking.buyer.name,
        phone: booking.phone || booking.buyer.phone,
        seatId: seat.id,
        seatLabel: seat.label,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt || booking.createdAt
    }));
}

function seatReservationRecordsFromBooking(booking) {
    return booking.seats.map(seat => ({
        bookingNo: booking.bookingNo,
        recordId: seatBookingId(booking.bookingNo, seat.id),
        uid: currentFirebaseUser?.uid || '',
        seatId: seat.id,
        seatLabel: seat.label,
        performanceAt: booking.performanceAt,
        createdAt: booking.createdAt
    }));
}

async function completeBooking(event) {
    event?.preventDefault();
    if (isCompletingBooking) return;

    const selectedSeats = getSelectedSeats();

    if (selectedSeats.length === 0) {
        showToast('좌석을 먼저 선택해 주세요.');
        goToStep(1);
        return;
    }

    const buyer = {
        name: buyerName.value.trim(),
        phone: formatPhoneNumber(buyerPhone.value)
    };

    if (!buyer.name) {
        showToast('이름을 입력해 주세요.');
        buyerName.focus();
        return;
    }

    if (normalizePhone(buyer.phone).length < 10) {
        showToast('전화번호를 다시 확인해 주세요.');
        buyerPhone.focus();
        return;
    }

    const account = makeAccount(buyer.name, buyer.phone);
    const lookupKey = await accountLookupKey(account.name, account.phone);
    const seatIds = selectedSeats.map(seat => seat.id);
    const seatLabels = selectedSeats.map(formatSeat);
    const booking = {
        bookingNo: makeBookingNumber(),
        performance: PERFORMANCE_NAME,
        performanceAt: PERFORMANCE_AT,
        accountKey: account.key,
        lookupKey,
        uid: currentFirebaseUser?.uid || '',
        seatIds,
        seatLabels,
        name: buyer.name,
        phone: buyer.phone,
        seats: selectedSeats.map((seat, index) => ({
            id: seat.id,
            label: seatLabels[index]
        })),
        buyer,
        total: selectedSeats.length * PRICE,
        createdAt: new Date().toISOString()
    };

    isCompletingBooking = true;
    currentCompletedBooking = booking;
    currentAccount = account;
    safeSet('currentAccount', currentAccount);
    loginName.value = account.name;
    loginPhone.value = account.phone;
    syncBookingFormWithAccount();
    showCompleteScreen(booking);
    showToast('예매가 완료되었습니다.');

    try {
        const savePromise = saveBookingRecord(booking);
        renderSeatMap();
        renderSummaries();
        renderSeatStatus();
        renderAccount();
        renderAdminBookings();
        updateAccountNote();
        savePromise.then(savedToFirebase => {
            if (!savedToFirebase) {
                showToast('Firebase 저장에 실패했습니다. 좌석 상태를 새로고침 후 다시 확인해 주세요.');
            }
        }).catch(error => {
            console.warn('Booking save failed after completion screen.', error);
            showToast('Firebase 저장에 실패했습니다. 좌석 상태를 새로고침 후 다시 확인해 주세요.');
        });
    } catch (error) {
        console.warn('Post-booking refresh failed.', error);
    }

    window.setTimeout(() => {
        isCompletingBooking = false;
    }, 700);
}

window.completeBooking = completeBooking;

function renderComplete(booking) {
    completeTitle.textContent = '선택한 좌석 예매가 완료되었습니다';
    completeDetail.innerHTML = [
        summaryRow('예매번호', escapeHtml(booking.bookingNo)),
        summaryRow('공연', escapeHtml(booking.performance)),
        summaryRow('예매 좌석', '1석'),
        summaryRow('좌석', booking.seats.map(seat => escapeHtml(seat.label)).join('<br>')),
        summaryRow('예매자', `${escapeHtml(booking.buyer.name)} / ${escapeHtml(booking.buyer.phone)}`),
        summaryRow('예매 금액', formatMoney(booking.total))
    ].join('');
    saveCompleteTicket.disabled = false;
}

function startNewBooking() {
    selectedSeatIds = [];
    activeBlock = null;
    currentCompletedBooking = null;
    if (currentAccount) {
        syncBookingFormWithAccount();
    } else {
        buyerName.value = '';
        buyerPhone.value = '';
    }
    agreeCheck.checked = false;
    saveCompleteTicket.disabled = true;
    renderSeatMap();
    goToStep(1);
}

function renderDday() {
    const target = new Date(PERFORMANCE_AT);
    const diff = target.getTime() - Date.now();
    const days = Math.ceil(diff / 86400000);
    const label = days > 0 ? `D-${days}` : days === 0 ? 'D-Day' : '공연 종료';

    heroDday.textContent = label;
    detailDday.textContent = label;
    heroDate.textContent = PERFORMANCE_DATE_LABEL;
}

async function setCurrentAccount(account, showMessage = true) {
    currentAccount = account;
    safeSet('currentAccount', currentAccount);
    loginName.value = account.name;
    loginPhone.value = account.phone;
    syncBookingFormWithAccount();
    if (storageMode === 'firebase') {
        ticketWallet.innerHTML = '<p class="wallet-empty">티켓을 불러오는 중입니다.</p>';
        await refreshAccountBookingsFromFirebase(account);
    }
    renderAccount();
    updateAccountNote();
    updateFSM('wallet');
    if (showMessage) showToast(`${account.name}님으로 로그인했습니다.`);
}

function clearCurrentAccount() {
    currentAccount = null;
    safeRemove('currentAccount');
    loginName.value = '';
    loginPhone.value = '';
    renderAccount();
    updateAccountNote();
    updateFSM('home');
    showToast('로그아웃했습니다.');
}

function bookingBelongsToAccount(booking, account) {
    if (!account) return false;
    if (booking.accountKey) return booking.accountKey === account.key;
    return accountKey(booking.buyer.name, booking.buyer.phone) === account.key;
}

function accountBookings() {
    return getBookings().filter(booking => bookingBelongsToAccount(booking, currentAccount));
}

function canManageBooking(booking) {
    return !booking.uid || booking.uid === currentFirebaseUser?.uid;
}

function renderAccount() {
    if (!currentAccount) {
        accountName.textContent = '로그인 전';
        accountPhone.textContent = '이름과 전화번호를 입력하면 예매 내역이 표시됩니다.';
        logoutAccount.disabled = true;
        ticketWallet.innerHTML = '<p class="wallet-empty">아직 로그인하지 않았습니다. 이름과 전화번호로 로그인하면 본인 티켓을 조회할 수 있습니다.</p>';
        return;
    }

    const bookings = accountBookings();
    const images = getTicketImages();
    accountName.textContent = `${currentAccount.name}님`;
    accountPhone.textContent = currentAccount.phone;
    logoutAccount.disabled = false;

    if (bookings.length === 0) {
        ticketWallet.innerHTML = `
            <div class="wallet-empty">
                아직 저장된 티켓이 없습니다.
                <button class="outline-button wallet-book-button" type="button" data-wallet-book>좌석 예매하기</button>
            </div>
        `;
        return;
    }

    ticketWallet.innerHTML = bookings.map(booking => {
        const savedLabel = images[booking.bookingNo] ? '저장됨' : '이미지 저장';
        const canCancel = canManageBooking(booking);
        return `
            <article class="wallet-ticket">
                <h4>${escapeHtml(booking.performance)}</h4>
                <p><strong>${escapeHtml(booking.bookingNo)}</strong> · ${formatDate(booking.createdAt)}</p>
                <p>${booking.seats.length}매 · ${formatMoney(booking.total)}</p>
                <div class="seat-cancel-list">
                    ${booking.seats.map(seat => `
                        <div class="seat-cancel-row">
                            <strong>${escapeHtml(seat.label)}</strong>
                            ${canCancel
                                ? `<button type="button" data-booking-no="${escapeHtml(booking.bookingNo)}" data-cancel-seat="${escapeHtml(seat.id)}">이 좌석 취소</button>`
                                : '<span>관리자 취소 가능</span>'}
                        </div>
                    `).join('')}
                </div>
                <div class="wallet-ticket-actions">
                    <button type="button" data-save-ticket="${escapeHtml(booking.bookingNo)}">${savedLabel}</button>
                    ${canCancel ? `<button type="button" data-cancel-booking="${escapeHtml(booking.bookingNo)}">전체 취소</button>` : ''}
                    <button type="button" data-wallet-book>추가 예매</button>
                </div>
            </article>
        `;
    }).join('');
}

function bookingAfterSeatCancel(booking, seatId) {
    const seatsAfterCancel = booking.seats.filter(seat => seat.id !== seatId);
    return {
        ...booking,
        seats: seatsAfterCancel,
        seatIds: seatsAfterCancel.map(seat => seat.id),
        seatLabels: seatsAfterCancel.map(seat => seat.label),
        total: seatsAfterCancel.length * PRICE,
        updatedAt: new Date().toISOString()
    };
}

async function cancelSeat(bookingNo, seatId, options = {}) {
    const booking = getBookings().find(item => item.bookingNo === bookingNo);
    if (!booking) {
        showToast('취소할 예매를 찾을 수 없습니다.');
        return;
    }

    const seat = booking.seats.find(item => item.id === seatId);
    if (!seat) {
        showToast('취소할 좌석을 찾을 수 없습니다.');
        return;
    }

    if (!options.skipConfirm && !window.confirm(`${seat.label} 좌석 예매를 취소할까요?`)) {
        return;
    }

    try {
        const updatedBooking = bookingAfterSeatCancel(booking, seatId);
        await deleteSeatRecord(bookingNo, seatId);
        if (updatedBooking.seats.length === 0) {
            bookingsCache = bookingsCache.filter(item => item.bookingNo !== bookingNo);
            safeSet('bookings', bookingsCache);
        } else {
            bookingsCache = bookingsCache.map(item => (
                item.bookingNo === bookingNo ? updatedBooking : item
            ));
            safeSet('bookings', bookingsCache);
        }

        const images = getTicketImages();
        delete images[bookingNo];
        safeSet('ticketImages', images);
        selectedSeatIds = selectedSeatIds.filter(id => id !== seatId);
        if (currentCompletedBooking?.bookingNo === bookingNo) {
            currentCompletedBooking = updatedBooking.seats.length ? updatedBooking : null;
            if (currentCompletedBooking) {
                renderComplete(currentCompletedBooking);
            } else {
                saveCompleteTicket.disabled = true;
            }
        }
        renderSeatMap();
        renderSummaries();
        renderAccount();
        renderAdminBookings();
        showToast(`${seat.label} 좌석 예매가 취소되었습니다.`);
    } catch (error) {
        showToast('예매 취소에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
}

async function cancelBooking(bookingNo, options = {}) {
    const booking = getBookings().find(item => item.bookingNo === bookingNo);
    if (!booking) {
        showToast('취소할 예매를 찾을 수 없습니다.');
        return;
    }

    if (!options.skipConfirm && !window.confirm(`${booking.seats.map(seat => seat.label).join(', ')} 예매를 모두 취소할까요?`)) {
        return;
    }

    try {
        await deleteBookingRecord(bookingNo);
        const images = getTicketImages();
        delete images[bookingNo];
        safeSet('ticketImages', images);
        selectedSeatIds = selectedSeatIds.filter(id => !booking.seats.some(seat => seat.id === id));
        if (currentCompletedBooking?.bookingNo === bookingNo) {
            currentCompletedBooking = null;
            saveCompleteTicket.disabled = true;
        }
        renderSeatMap();
        renderSummaries();
        renderAccount();
        renderAdminBookings();
        showToast('예매가 모두 취소되었습니다. 좌석이 다시 열렸습니다.');
    } catch (error) {
        showToast('예매 취소에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
}

function renderSeatStatus() {
    const reservedIds = getReservedSeatIds();

    seatStatusGrid.innerHTML = ['A', 'B', 'C'].map(block => {
        const blockSeats = seats.filter(seat => seat.block === block);
        const counts = blockSeats.reduce((result, seat) => {
            if (seat.blocked) result.blocked += 1;
            else if (selectedSeatIds.includes(seat.id)) result.selected += 1;
            else if (reservedIds.has(seat.id)) result.reserved += 1;
            else result.available += 1;
            return result;
        }, { available: 0, selected: 0, reserved: 0, blocked: 0 });

        return `
            <article class="seat-status-card">
                <h4>${BLOCK_NAMES[block]}블록</h4>
                <strong>${counts.available}석</strong>
                <p>선택 ${counts.selected} · 예매 ${counts.reserved}</p>
            </article>
        `;
    }).join('');
}

function renderAdminBookings() {
    if (!adminBookings || !adminUnlocked) return;

    if (storageMode === 'firebase') {
        if (!adminFirebaseUser) {
            adminBookings.innerHTML = '<p class="wallet-empty">관리자 계정으로 로그인해 주세요.</p>';
            return;
        }

        if (adminAccessDenied) {
            adminBookings.innerHTML = adminUidHint();
            return;
        }

        const records = adminFilteredRecords();
        if (adminBookingRecords.length === 0) {
            adminBookings.innerHTML = `
                <div class="admin-summary">
                    <strong>0석</strong>
                    <span>현재 표시할 예매 내역이 없습니다.</span>
                </div>
            `;
            return;
        }

        if (records.length === 0) {
            adminBookings.innerHTML = `
                <div class="admin-summary">
                    <strong>${adminBookingRecords.length}석</strong>
                    <span>검색 결과가 없습니다.</span>
                </div>
            `;
            return;
        }

        adminBookings.innerHTML = `
            <div class="admin-summary">
                <strong>${records.length}석</strong>
                <span>전체 ${adminBookingRecords.length}석 중 표시 중</span>
            </div>
            ${records.map(record => `
                <article class="admin-booking-row">
                    <div>
                        <span>좌석</span>
                        <strong>${escapeHtml(record.seatLabel || record.seatId)}</strong>
                    </div>
                    <div>
                        <span>이름</span>
                        <strong>${escapeHtml(record.name || '-')}</strong>
                    </div>
                    <div>
                        <span>전화번호</span>
                        <strong>${escapeHtml(record.phone || '-')}</strong>
                    </div>
                    <div>
                        <span>예매번호</span>
                        <strong>${escapeHtml(record.bookingNo || '-')}</strong>
                    </div>
                    <button
                        class="admin-action-button cancel"
                        type="button"
                        data-admin-cancel-seat="${escapeHtml(record.seatId)}"
                        data-admin-record-id="${escapeHtml(record.__recordId)}"
                        data-admin-uid="${escapeHtml(record.__uid)}"
                    >좌석 취소</button>
                </article>
            `).join('')}
        `;
        return;
    }

    const bookings = getBookings();
    if (bookings.length === 0) {
        adminBookings.innerHTML = '<p class="wallet-empty">현재 예매 내역이 없습니다.</p>';
        return;
    }

    adminBookings.innerHTML = bookings.flatMap(booking => (
        booking.seats.map(seat => `
            <article class="admin-booking-row">
                <div>
                    <span>좌석</span>
                    <strong>${escapeHtml(seat.label)}</strong>
                </div>
                <div>
                    <span>이름</span>
                    <strong>${escapeHtml(booking.name || booking.buyer.name)}</strong>
                </div>
                <div>
                    <span>전화번호</span>
                    <strong>${escapeHtml(booking.phone || booking.buyer.phone)}</strong>
                </div>
                <div>
                    <span>예매번호</span>
                    <strong>${escapeHtml(booking.bookingNo)}</strong>
                </div>
                <button class="admin-action-button cancel" type="button" data-booking-no="${escapeHtml(booking.bookingNo)}" data-admin-cancel-seat="${escapeHtml(seat.id)}">좌석 취소</button>
            </article>
        `)
    )).join('');
}

function drawRoundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    words.forEach(word => {
        const testLine = line ? `${line} ${word}` : word;
        if (context.measureText(testLine).width > maxWidth && line) {
            context.fillText(line, x, currentY);
            line = word;
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    });

    if (line) context.fillText(line, x, currentY);
}

function hashString(value) {
    return [...value].reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0);
}

function drawTicketCode(context, bookingNo, x, y, size) {
    const grid = 11;
    const cell = size / grid;
    const seed = Math.abs(hashString(bookingNo));

    context.fillStyle = '#ffffff';
    context.fillRect(x, y, size, size);
    context.fillStyle = '#172338';

    for (let row = 0; row < grid; row++) {
        for (let col = 0; col < grid; col++) {
            const finder = (row < 3 && col < 3) || (row < 3 && col > 7) || (row > 7 && col < 3);
            const value = (seed + row * 17 + col * 31 + row * col) % 5;
            if (finder || value < 2) {
                context.fillRect(x + col * cell + 2, y + row * cell + 2, cell - 3, cell - 3);
            }
        }
    }
}

function createTicketImage(booking) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 520;
    const context = canvas.getContext('2d');

    context.fillStyle = '#172338';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#f6f7f2';
    drawRoundRect(context, 34, 34, 832, 452, 24);
    context.fill();

    context.fillStyle = '#27655a';
    drawRoundRect(context, 56, 56, 788, 96, 18);
    context.fill();

    context.fillStyle = '#ffffff';
    context.font = 'bold 20px sans-serif';
    context.fillText('HEXA ORCHESTRA DIGITAL TICKET', 84, 96);
    context.font = 'bold 30px sans-serif';
    context.fillText(PERFORMANCE_NAME, 84, 132);

    context.fillStyle = '#18201b';
    context.font = 'bold 24px sans-serif';
    context.fillText(`예매번호 ${booking.bookingNo}`, 84, 205);
    context.font = '18px sans-serif';
    context.fillText(`예매자 ${booking.buyer.name} / ${booking.buyer.phone}`, 84, 244);
    context.fillText(`공연일 ${PERFORMANCE_DATE_LABEL}`, 84, 282);
    context.fillText(`좌석 ${booking.seats.map(seat => seat.label).join(', ')}`, 84, 320);
    context.fillText(`매수 ${booking.seats.length}매 · 예매 금액 ${formatMoney(booking.total)}`, 84, 358);

    context.fillStyle = '#667085';
    context.font = '15px sans-serif';
    drawWrappedText(context, '입장 시 이 디지털 티켓과 예매자 정보를 함께 확인해 주세요.', 84, 424, 520, 22);

    drawTicketCode(context, booking.bookingNo, 650, 214, 150);
    context.fillStyle = '#18201b';
    context.font = 'bold 16px sans-serif';
    context.fillText('연지홀 입장 확인용', 652, 394);

    return canvas.toDataURL('image/png');
}

function saveTicketImage(bookingNo) {
    const booking = getBookings().find(item => item.bookingNo === bookingNo);
    if (!booking) {
        showToast('티켓 정보를 찾을 수 없습니다.');
        return;
    }

    const dataUrl = createTicketImage(booking);
    const images = getTicketImages();
    images[booking.bookingNo] = dataUrl;
    safeSet('ticketImages', images);

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `ticket-${booking.bookingNo}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    renderAccount();
    showToast('디지털 티켓 이미지를 저장했습니다.');
}

function setupMemberFilters() {
    document.querySelectorAll('[data-member-filter]').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.dataset.memberFilter;
            document.querySelectorAll('[data-member-filter]').forEach(item => item.classList.remove('is-active'));
            button.classList.add('is-active');
            document.querySelectorAll('[data-member-part]').forEach(card => {
                card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.memberPart !== filter);
            });
        });
    });
}

function setupProgramAccordion() {
    document.querySelectorAll('.program-trigger').forEach(button => {
        button.addEventListener('click', () => {
            const item = button.closest('.program-item');
            const willOpen = !item.classList.contains('is-open');
            document.querySelectorAll('.program-item').forEach(program => {
                program.classList.remove('is-open');
                program.querySelector('.program-trigger').setAttribute('aria-expanded', 'false');
            });
            item.classList.toggle('is-open', willOpen);
            button.setAttribute('aria-expanded', String(willOpen));
        });
    });
}

function setupAccountEvents() {
    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        const account = makeAccount(loginName.value, loginPhone.value);
        if (!account.name || normalizePhone(account.phone).length < 10) {
            showToast('이름과 전화번호를 확인해 주세요.');
            return;
        }
        await setCurrentAccount(account);
    });

    logoutAccount.addEventListener('click', clearCurrentAccount);

    ticketWallet.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;

        if (button.dataset.saveTicket) {
            saveTicketImage(button.dataset.saveTicket);
            return;
        }

        if (button.dataset.cancelSeat) {
            cancelSeat(button.dataset.bookingNo, button.dataset.cancelSeat);
            return;
        }

        if (button.dataset.cancelBooking) {
            cancelBooking(button.dataset.cancelBooking);
            return;
        }

        if (button.dataset.walletBook !== undefined) {
            openTicketing();
        }
    });

    viewWallet.addEventListener('click', () => {
        renderAccount();
        updateFSM('wallet');
    });
}

function setupAdminEvents() {
    adminForm.addEventListener('submit', async event => {
        event.preventDefault();

        if (!authApi || !adminFirebaseAuth) {
            showToast('Firebase 연결 후 관리자 로그인을 사용할 수 있습니다.');
            return;
        }

        const email = adminEmail.value.trim();
        const password = adminPassword.value;
        if (!email || !password) {
            showToast('관리자 이메일과 비밀번호를 입력해 주세요.');
            return;
        }

        setAdminStatus('관리자 로그인 중', 'loading');

        try {
            const credential = await authApi.signInWithEmailAndPassword(adminFirebaseAuth, email, password);
            adminFirebaseUser = credential.user;
            adminUnlocked = true;
            adminAccessDenied = false;
            adminPanel.classList.remove('is-hidden');
            adminPassword.value = '';
            await loadAdminBookings(true);
        } catch (error) {
            adminUnlocked = false;
            adminFirebaseUser = null;
            adminBookingRecords = [];
            adminAccessDenied = false;
            adminPanel.classList.add('is-hidden');
            setAdminStatus(adminErrorMessage(error), 'error');
            showToast('관리자 로그인에 실패했습니다.');
        }
    });

    adminLogout.addEventListener('click', async () => {
        adminUnlocked = false;
        adminFirebaseUser = null;
        adminBookingRecords = [];
        adminAccessDenied = false;
        adminPanel.classList.add('is-hidden');
        adminSearch.value = '';
        if (adminFirebaseAuth?.currentUser) {
            await authApi.signOut(adminFirebaseAuth);
        }
        setAdminStatus('관리자 로그아웃됨');
        updateFSM('home');
        showToast('관리자 모드를 닫았습니다.');
    });

    adminSearch.addEventListener('input', renderAdminBookings);

    adminRefresh.addEventListener('click', () => {
        loadAdminBookings(true);
    });

    adminBookings.addEventListener('click', event => {
        const button = event.target.closest('button[data-admin-cancel-seat]');
        if (!button) return;
        if (button.dataset.adminRecordId && button.dataset.adminUid) {
            cancelAdminSeat(button.dataset.adminRecordId, button.dataset.adminCancelSeat, button.dataset.adminUid);
            return;
        }
        cancelSeat(button.dataset.bookingNo, button.dataset.adminCancelSeat);
    });
}

document.getElementById('go-info').addEventListener('click', () => goToStep(2));
document.getElementById('back-seat').addEventListener('click', () => goToStep(1));
document.getElementById('complete-booking').addEventListener('click', completeBooking);
document.getElementById('new-booking').addEventListener('click', startNewBooking);
saveCompleteTicket.addEventListener('click', () => {
    if (currentCompletedBooking) saveTicketImage(currentCompletedBooking.bookingNo);
});

openTicketButtons.forEach(button => {
    button.addEventListener('click', openTicketing);
});

document.querySelectorAll('a[href="#account"]').forEach(link => {
    link.addEventListener('click', () => updateFSM(currentAccount ? 'wallet' : 'login'));
});

document.getElementById('reset-demo').addEventListener('click', async () => {
    await clearBookingRecords();
    safeRemove('ticketImages');
    selectedSeatIds = [];
    activeBlock = null;
    currentCompletedBooking = null;
    saveCompleteTicket.disabled = true;
    renderSeatMap();
    renderSummaries();
    renderAccount();
    renderAdminBookings();
    showToast('예매 데이터를 초기화했습니다.');
});

backBlocks.addEventListener('click', showBlockOverview);

buyerPhone.addEventListener('input', event => {
    event.target.value = formatPhoneNumber(event.target.value);
});

loginPhone.addEventListener('input', event => {
    event.target.value = formatPhoneNumber(event.target.value);
});

document.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.filter').forEach(item => item.classList.remove('is-active'));
        button.classList.add('is-active');
        currentFloor = button.dataset.floor;
        renderSeatMap();
        renderSummaries();
    });
});

setupMemberFilters();
setupProgramAccordion();
setupAccountEvents();
setupAdminEvents();

function renderAppFromCache() {
    renderSeatMap();
    renderSummaries();
    renderSeatStatus();
    renderAccount();
    renderAdminBookings();
    updateAccountNote();
    if (currentAccount) {
        syncBookingFormWithAccount();
    }
}

async function initApp() {
    renderDday();
    renderAppFromCache();
    updateFSM('home');

    await initFirebaseStorage();
    if (currentAccount && storageMode === 'firebase') {
        await refreshAccountBookingsFromFirebase(currentAccount);
    }
    renderAppFromCache();
    updateFSM('home');
}

initApp();
