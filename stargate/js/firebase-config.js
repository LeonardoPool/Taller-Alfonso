// Configuración centralizada de Firebase para Portal Administrativo (Stargate)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    signOut, 
    onAuthStateChanged, 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    getCountFromServer,
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    addDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    serverTimestamp, 
    Timestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getStorage, 
    ref as storageRef, 
    uploadBytesResumable, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { 
    getAnalytics, 
    logEvent 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

export const firebaseConfig = {
    apiKey: "AIzaSyAL7eXIPTl04c17KvkmnNUwjrH93QNBQm8",
    authDomain: "taller-alfoso-mecanico-diesel.firebaseapp.com",
    projectId: "taller-alfoso-mecanico-diesel",
    storageBucket: "taller-alfoso-mecanico-diesel.firebasestorage.app",
    messagingSenderId: "287486508627",
    appId: "1:287486508627:web:748d0e7bac0f46573750a6",
    measurementId: "G-9JYZR2735E"
};

// Inicialización de Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Inicialización optimizada de Firestore con caché persistente en IndexedDB (multi-tab)
// Evita descargar colecciones completas en cada recarga o cambio de página
let firestoreDb;
try {
    firestoreDb = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    }, 'almacenvirtual');
} catch (e) {
    console.info("Firestore ya inicializado o usando fallback de conexión:", e);
    firestoreDb = getFirestore(app, 'almacenvirtual');
}

export const db = firestoreDb;
export const storage = getStorage(app);

let analyticsInstance = null;
try {
    analyticsInstance = getAnalytics(app);
} catch (e) {
    console.warn("Analytics no soportado o deshabilitado:", e);
}
export const analytics = analyticsInstance;

// Re-exportar utilidades comunes de Firestore y Auth para evitar duplicación
export {
    signOut,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    addDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    getCountFromServer,
    serverTimestamp, 
    Timestamp,
    storageRef, 
    uploadBytesResumable, 
    getDownloadURL,
    logEvent
};
