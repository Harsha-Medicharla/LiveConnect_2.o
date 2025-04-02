import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, addDoc, getDoc, 
  updateDoc, onSnapshot, deleteDoc, getDocs 
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.REACT_APP_API_KEY,
    authDomain: process.env.REACT_APP_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_PROJECT_ID,
    storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_APP_ID,
    measurementId: process.env.REACT_APP_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestoreDB = getFirestore(app);

// WebRTC configuration (same as original)
const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Firestore wrapper to maintain a similar API to the older version
const firestore = {
  collection: (collectionPath) => {
    return {
      doc: (docId) => {
        const docRef = docId ? doc(firestoreDB, collectionPath, docId) : doc(collection(firestoreDB, collectionPath));
        
        return {
          id: docRef.id,
          collection: (subCollectionPath) => {
            return {
              add: (data) => addDoc(collection(firestoreDB, collectionPath, docRef.id, subCollectionPath), data),
              get: async () => {
                const querySnapshot = await getDocs(collection(firestoreDB, collectionPath, docRef.id, subCollectionPath));
                return {
                  forEach: (callback) => querySnapshot.forEach((doc) => callback({ ref: { delete: () => deleteDoc(doc.ref) }, data: () => doc.data() })),
                };
              },
              onSnapshot: (callback) => {
                return onSnapshot(collection(firestoreDB, collectionPath, docRef.id, subCollectionPath), (snapshot) => {
                  callback({
                    docChanges: () => snapshot.docChanges().map(change => ({
                      type: change.type,
                      doc: {
                        data: () => change.doc.data()
                      }
                    }))
                  });
                });
              }
            };
          },
          set: (data) => setDoc(docRef, data),
          update: (data) => updateDoc(docRef, data),
          get: async () => {
            const docSnap = await getDoc(docRef);
            return {
              exists: docSnap.exists(),
              data: () => docSnap.data()
            };
          },
          onSnapshot: (callback) => {
            return onSnapshot(docRef, (doc) => {
              callback({
                data: () => doc.data()
              });
            });
          },
          delete: () => deleteDoc(docRef)
        };
      },
      add: (data) => addDoc(collection(firestoreDB, collectionPath), data)
    };
  }
};

export { firestore, servers };
export default app;