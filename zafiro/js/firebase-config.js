// Configuración centralizada de Firebase para Portal de Mecánicos (Zafiro)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
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

// Inicialización
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, 'almacenvirtual');
export const storage = getStorage(app);

let analyticsInstance = null;
try {
    analyticsInstance = getAnalytics(app);
} catch (e) {
    console.warn("Analytics no soportado o deshabilitado:", e);
}
export const analytics = analyticsInstance;

export {
    signOut,
    onAuthStateChanged,
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
    Timestamp,
    storageRef,
    uploadBytesResumable,
    getDownloadURL,
    logEvent
};
