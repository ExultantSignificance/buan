/*firebase*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAv-v8Q_bS3GtcYAAI-3PB4XL1WJv-_shE",
  authDomain: "buantutoring-2d3e9.firebaseapp.com",
  projectId: "buantutoring-2d3e9",
  storageBucket: "buantutoring-2d3e9.firebasestorage.app",
  messagingSenderId: "990594717631",
  appId: "1:990594717631:web:24625a12ebc7c23690b3ee",
  measurementId: "G-5QKXHDMS72",
};

const app = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(app);
const firestore = getFirestore(app);

const ADMIN_FIREBASE_UID = "g3RWfVUte6bvIcXXim7rvNhv4hL2";

const AUTH_STORAGE_KEY = "buan.authSession";

const authClient = (() => {
  const listeners = new Set();
  let authState = { token: null, user: null };

  const mapFirebaseUser = user => {
    if (!user) return null;
    return {
      id: user.uid,
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      phoneNumber: user.phoneNumber || "",
    };
  };

  const parseStoredState = value => {
    if (!value) return { token: null, user: null };
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object") return { token: null, user: null };
      const token = typeof parsed.token === "string" ? parsed.token : null;
      const user = parsed.user && typeof parsed.user === "object" ? parsed.user : null;
      return { token, user };
    } catch (error) {
      console.warn("Unable to parse stored auth session", error);
      return { token: null, user: null };
    }
  };

  const readInitialState = () => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      authState = parseStoredState(raw);
    } catch (error) {
      console.warn("Unable to read stored auth session", error);
    }
  };

  const persistState = () => {
    try {
      if (!authState.token && !authState.user) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } else {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
      }
    } catch (error) {
      console.warn("Unable to persist auth session", error);
    }
  };

  const notify = () => {
    listeners.forEach(listener => {
      try {
        listener({ ...authState });
      } catch (error) {
        console.error("Auth listener error", error);
      }
    });
  };

  const setState = nextState => {
    const nextUser = nextState.user && typeof nextState.user === "object"
      ? { ...nextState.user }
      : null;
    authState = { token: nextState.token ?? null, user: nextUser };
    persistState();
    notify();
  };

  const syncFromFirebaseUser = async firebaseUser => {
    if (!firebaseUser) {
      const session = { token: null, user: null };
      setState(session);
      return session;
    }

    try {
      const token = await firebaseUser.getIdToken();
      const session = { token, user: mapFirebaseUser(firebaseUser) };
      setState(session);
      return session;
    } catch (error) {
      console.warn("Unable to read Firebase ID token", error);
      const session = { token: null, user: mapFirebaseUser(firebaseUser) };
      setState(session);
      return session;
    }
  };

  const request = async (action, payload) => {
    const email = payload?.email;
    const password = payload?.password;
    if (!email || !password) {
      throw new Error("Enter a valid email address and password to continue.");
    }

    try {
      let credential;
      if (action === "signup") {
        credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const name = typeof payload?.name === "string" && payload.name.trim() ? payload.name.trim() : "";
        if (name) {
          try {
            await updateProfile(credential.user, { displayName: name });
          } catch (error) {
            console.warn("Unable to update Firebase profile", error);
          }
        }
      } else if (action === "signin") {
        credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      } else {
        throw new Error("Unsupported authentication request.");
      }

      return await syncFromFirebaseUser(credential.user);
    } catch (error) {
      const message = error && typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Unable to complete the request. Please try again.";
      throw new Error(message);
    }
  };

  const readInitialUser = () => {
    if (authState.token || authState.user) {
      notify();
    }
  };

  const signUp = async credentials => {
    return request("signup", credentials);
  };

  const signIn = async credentials => {
    return request("signin", credentials);
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(firebaseAuth);
      return await syncFromFirebaseUser(null);
    } catch (error) {
      await syncFromFirebaseUser(null);
      throw error;
    }
  };

  const getCurrentUser = () => authState.user;
  const getSessionToken = () => authState.token;

  const subscribe = callback => {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    callback({ ...authState });
    return () => listeners.delete(callback);
  };

  readInitialState();
  readInitialUser();

  onAuthStateChanged(firebaseAuth, user => {
    syncFromFirebaseUser(user).catch(error => {
      console.error("Unable to synchronise Firebase auth state", error);
    });
  });

  return { signUp, signIn, signOut, getCurrentUser, getSessionToken, subscribe };
})();




/*not firebase*/
const BOOKING_STORAGE_KEY = "buan.bookingState";
const PENDING_BOOKING_KEY = "pendingBooking";
const PENDING_BUNDLE_KEY = "pendingBundle";
const STRIPE_PUBLISHABLE_KEY = "pk_live_51SJDOtF9Dbt33lFIbAqcbH9jfcTMyssD1VXIcIbS4ybhWIPYkrtzhywDBijTUHbzmhXlXIr8YmerGPHvlEyzvuC200RIpQC4EY";
const FUNCTIONS_BASE_URL = "https://us-central1-buantutoring-2d3e9.cloudfunctions.net";
const CREATE_SESSION_ENDPOINT = `${FUNCTIONS_BASE_URL}/createCheckoutSession`;

let stripeClientPromise = null;
const getStripeClient = async () => {
  if (!stripeClientPromise) {
    if (typeof window !== "undefined" && typeof window.Stripe === "function") {
      stripeClientPromise = Promise.resolve(window.Stripe(STRIPE_PUBLISHABLE_KEY));
    } else {
      stripeClientPromise = import("https://js.stripe.com/v3/").then(({ loadStripe }) =>
        loadStripe(STRIPE_PUBLISHABLE_KEY)
      );
    }
  }
  return stripeClientPromise;
};

const DEFAULT_SUBJECT_OPTIONS = [
  {
    value: "chemistry",
    label: "Chemistry",
    price: 50,
    priceId: "price_1SOJWvF9Dbt33lFImPMXRFLU",
  },
  {
    value: "english",
    label: "English",
    price: 40,
    priceId: "price_1SOJXBF9Dbt33lFInArwfsAC",
  },
  {
    value: "grade-7-9",
    label: "Grade 7–9",
    price: 35,
    priceId: "price_1SOJXeF9Dbt33lFIwFdfcfPz",
  },
  {
    value: "mathematical-methods",
    label: "Mathematical Methods",
    price: 55,
    priceId: "price_1SOJVsF9Dbt33lFIpgloVwN3",
  },
  {
    value: "physics",
    label: "Physics",
    price: 50,
    priceId: "price_1SOJWCF9Dbt33lFIXZPB1rv7",
  },
  {
    value: "specialist-mathematics",
    label: "Specialist Mathematics",
    price: 60,
    priceId: "price_1SOJVWF9Dbt33lFIUiaiE8tO",
  },
];

let SUBJECT_OPTIONS = [...DEFAULT_SUBJECT_OPTIONS];
const SUBJECT_VALUE_SET = new Set(SUBJECT_OPTIONS.map(option => option.value));

const subjectCatalog = new Map();
SUBJECT_OPTIONS.forEach(option => {
  subjectCatalog.set(option.value, option);
});

const setSubjectOptions = options => {
  SUBJECT_OPTIONS = options.filter(option => option && option.value);
  SUBJECT_VALUE_SET.clear();
  subjectCatalog.clear();
  SUBJECT_OPTIONS.forEach(option => {
    SUBJECT_VALUE_SET.add(option.value);
    subjectCatalog.set(option.value, option);
  });
};

const pruneSubjects = (subjects, times) => {
  const safeSubjects = subjects && typeof subjects === "object" && subjects !== null ? subjects : {};
  const safeTimes = times && typeof times === "object" && times !== null ? times : {};
  const cleaned = {};

  Object.keys(safeTimes).forEach(dateKey => {
    const timeList = Array.isArray(safeTimes[dateKey]) ? Array.from(new Set(safeTimes[dateKey])) : [];
    if (!timeList.length) return;
    const allowedTimes = new Set(timeList);
    const source = safeSubjects[dateKey];
    if (!source || typeof source !== "object") return;

    const filtered = {};
    Object.keys(source).forEach(timeKey => {
      const value = source[timeKey];
      if (allowedTimes.has(timeKey) && typeof value === "string" && SUBJECT_VALUE_SET.has(value)) {
        filtered[timeKey] = value;
      }
    });

    if (Object.keys(filtered).length) {
      cleaned[dateKey] = filtered;
    }
  });

  return cleaned;
};

const subjectService = (() => {
  let loadPromise = null;

  const normaliseOption = (id, data) => {
    if (!id) return null;
    const label = typeof data?.name === "string" && data.name.trim()
      ? data.name.trim()
      : id;
    const priceId = typeof data?.priceId === "string" ? data.priceId : "";
    const price = typeof data?.price === "number" ? data.price : null;
    return {
      value: id,
      label,
      price,
      priceId,
    };
  };

  const loadSubjects = async () => {
    try {
      const subjectQuery = query(collection(firestore, "subjects"));
      const snapshot = await getDocs(subjectQuery);
      const options = [];
      snapshot.forEach(docSnapshot => {
        const option = normaliseOption(docSnapshot.id, docSnapshot.data());
        if (option) {
          options.push(option);
        }
      });
      options.sort((a, b) => a.label.localeCompare(b.label));
      if (options.length) {
        setSubjectOptions(options);
      } else {
        setSubjectOptions([...DEFAULT_SUBJECT_OPTIONS]);
      }
    } catch (error) {
      console.error("Unable to load subjects from Firestore", error);
      setSubjectOptions([...DEFAULT_SUBJECT_OPTIONS]);
    }
    return [...SUBJECT_OPTIONS];
  };

  return {
    ensureLoaded: () => {
      if (!loadPromise) {
        loadPromise = loadSubjects();
      }
      return loadPromise;
    },
    getOptions: () => [...SUBJECT_OPTIONS],
    getOptionById: id => subjectCatalog.get(id) || null,
  };
})();

const subjectsEqual = (a, b) => {
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const aInner = a[key];
    const bInner = b[key];
    const aInnerKeys = Object.keys(aInner || {});
    const bInnerKeys = Object.keys(bInner || {});
    if (aInnerKeys.length !== bInnerKeys.length) return false;
    for (const innerKey of aInnerKeys) {
      if (aInner[innerKey] !== bInner[innerKey]) return false;
    }
  }
  return true;
};

const readBookingState = () => {
  try {
    const raw = localStorage.getItem(BOOKING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch (error) {
    console.warn("Unable to read booking state", error);
    return {};
  }
};

const persistBookingState = state => {
  try {
    localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save booking state", error);
  }
};

const clearBookingState = () => {
  try {
    localStorage.removeItem(BOOKING_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear booking state", error);
  }
};

const readPendingBooking = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Unable to read pending booking", error);
    return null;
  }
};

const readPendingBundle = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_BUNDLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Unable to read pending bundle", error);
    return null;
  }
};

const clearPendingBooking = () => {
  try {
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
  } catch (error) {
    console.warn("Unable to clear pending booking", error);
  }
};

const clearPendingBundle = () => {
  try {
    sessionStorage.removeItem(PENDING_BUNDLE_KEY);
  } catch (error) {
    console.warn("Unable to clear pending bundle", error);
  }
};

const runWhenReady = callback => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
};

const TIME_SLOT_VALUES = (() => {
  const values = [];
  for (let hour = 8; hour <= 18; hour++) {
    values.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return values;
})();

const TIME_SLOT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const getStandardTimeSlots = () =>
  TIME_SLOT_VALUES.map(value => ({
    value,
    display: TIME_SLOT_FORMATTER.format(new Date(`1970-01-01T${value}:00`)),
  }));

const AVAILABILITY_STORAGE_KEY = "buan.availabilityState";

const isValidDateKey = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isValidTimeKey = value => typeof value === "string" && /^\d{2}:\d{2}$/.test(value);

const buildRelativeLocation = () => {
  const path = window.location.pathname.replace(/^\//, "");
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  return `${path}${search}${hash}`;
};

const formatCurrency = (amount, currency = "AUD") => {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    console.warn("Unable to format currency", error);
    return `$${amount.toFixed(2)}`;
  }
};

const formatDisplayDate = iso => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return formatter.format(date);
};

const BUNDLE_TIERS = [10, 20, 40];

const DEFAULT_BUNDLE_PRICING = {
  specialists: {
    label: "Specialist Mathematics",
    subjectId: "specialist-mathematics",
    baseRate: 60,
    priceIds: {
      10: "price_1SOJBuF9Dbt33lFIRT2wiwfj",
      20: "price_1SOJLpF9Dbt33lFIGiQzVRWm",
      40: "price_1SOJP1F9Dbt33lFIWb9x0Uuk",
    },
  },
  methods: {
    label: "Mathematical Methods",
    subjectId: "mathematical-methods",
    baseRate: 55,
    priceIds: {
      10: "price_1SOJJSF9Dbt33lFIYazUes2Q",
      20: "price_1SOJMcF9Dbt33lFIWQ7DGvKV",
      40: "price_1SOJPYF9Dbt33lFI69irabJI",
    },
  },
  chemistry: {
    label: "Chemistry",
    subjectId: "chemistry",
    baseRate: 50,
    priceIds: {
      10: "price_1SOJKYF9Dbt33lFI2pD05mja",
      20: "price_1SOJNwF9Dbt33lFIHmYoiZq2",
      40: "price_1SOJQOF9Dbt33lFI7zHDvUGW",
    },
  },
  physics: {
    label: "Physics",
    subjectId: "physics",
    baseRate: 50,
    priceIds: {
      10: "price_1SOJK8F9Dbt33lFIyKsRZx3R",
      20: "price_1SOJN1F9Dbt33lFIbO0GhpX4",
      40: "price_1SOJQ1F9Dbt33lFI0y3lC2nG",
    },
  },
  "general-english": {
    label: "General English",
    subjectId: "english",
    baseRate: 40,
    priceIds: {
      10: "price_1SOJLHF9Dbt33lFIJ6HFTJ9K",
      20: "price_1SOJOLF9Dbt33lFIHHCjGgWA",
      40: "price_1SOJQoF9Dbt33lFIb8TyV3pJ",
    },
  },
  "grade-7-9": {
    label: "Grade 7–9",
    subjectId: "grade-7-9",
    baseRate: 35,
    priceIds: {
      10: "price_1SOJRhF9Dbt33lFI7juqs1Ik",
      20: "price_1SOJSCF9Dbt33lFIFgd1nyM7",
      40: "price_1SOJSjF9Dbt33lFIUgAcNBaE",
    },
  },
};

const calculateBundlePrice = (hours, baseRate) => {
  const discount = hours === 10 ? 0.05 : hours === 20 ? 0.1 : hours === 40 ? 0.2 : 0;
  return baseRate * hours * (1 - discount);
};

const buildBundleCatalog = () => {
  const config = typeof window !== "undefined" && window.BUAN_BUNDLE_PRICING
    ? window.BUAN_BUNDLE_PRICING
    : DEFAULT_BUNDLE_PRICING;

  const catalog = new Map();

  Object.entries(config || {}).forEach(([subject, data]) => {
    if (!subject || !data) return;
    const label = typeof data.label === "string" && data.label.trim()
      ? data.label.trim()
      : subject;
    const baseRate = typeof data.baseRate === "number" ? data.baseRate : 0;
    const subjectId = typeof data.subjectId === "string" ? data.subjectId : subject;
    const priceIds = data.priceIds && typeof data.priceIds === "object" ? data.priceIds : {};

    const tiers = new Map();
    BUNDLE_TIERS.forEach(hours => {
      const priceId = typeof priceIds[hours] === "string" ? priceIds[hours] : "";
      tiers.set(hours, {
        hours,
        priceId,
        price: calculateBundlePrice(hours, baseRate),
        quantity: hours,
      });
    });

    catalog.set(subject, {
      label,
      subjectId,
      tiers,
      currency: "AUD",
    });
  });

  return catalog;
};

const BUNDLE_CATALOG = buildBundleCatalog();

const formatDisplayTime = timeValue => {
  if (!timeValue) return "";
  const date = new Date(`1970-01-01T${timeValue}:00`);
  if (Number.isNaN(date.getTime())) return timeValue;
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return formatter.format(date);
};

const redirectToSignIn = () => {
  const next = buildRelativeLocation();
  const redirectParam = next ? `?redirect=${encodeURIComponent(next)}` : "";
  window.location.replace(`signin.html${redirectParam}`);
};

const requireAuthForBooking = () => {
  const hasSession = Boolean(authClient.getSessionToken());
  const hasUser = Boolean(authClient.getCurrentUser());
  const firebaseUser = firebaseAuth.currentUser;
  if (hasSession || hasUser || firebaseUser) {
    return true;
  }
  redirectToSignIn();
  return false;
};

const normaliseAvailabilityDay = source => {
  const result = {};
  if (!source || typeof source !== "object") return result;
  Object.keys(source).forEach(timeKey => {
    if (!isValidTimeKey(timeKey)) return;
    result[timeKey] = source[timeKey] === false ? false : true;
  });
  return result;
};

const normaliseAvailabilityData = data => {
  const slots = data && typeof data === "object" ? data.slots || data : {};
  const result = {};
  Object.keys(slots || {}).forEach(dateKey => {
    if (!isValidDateKey(dateKey)) return;
    const cleaned = normaliseAvailabilityDay(slots[dateKey]);
    if (Object.keys(cleaned).length) {
      result[dateKey] = cleaned;
    }
  });
  return result;
};

const readAvailabilityCache = () => {
  try {
    const raw = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normaliseAvailabilityData(parsed);
  } catch (error) {
    console.warn("Unable to read availability cache", error);
    return {};
  }
};

const persistAvailabilityCache = data => {
  try {
    localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify({ slots: data }));
  } catch (error) {
    console.warn("Unable to persist availability cache", error);
  }
};

const availabilityService = (() => {
  const listeners = new Set();
  const docRef = doc(firestore, "availability", "global");
  let cache = readAvailabilityCache();
  let unsubscribe = null;
  let loadPromise = null;
  let lastErrorMessage = null;

  const cloneCache = () => {
    const snapshot = {};
    Object.keys(cache).forEach(dateKey => {
      snapshot[dateKey] = { ...cache[dateKey] };
    });
    return snapshot;
  };

  const buildState = () => {
    const data = cloneCache();
    const error = lastErrorMessage ? { message: lastErrorMessage } : null;
    return { data, error };
  };

  const notify = () => {
    if (!lastErrorMessage) {
      persistAvailabilityCache(cache);
    }
    const state = buildState();
    listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.warn("Availability listener error", error);
      }
    });
  };

  const mapErrorMessage = error => {
    if (!error) return null;
    if (typeof error === "string" && error.trim()) return error.trim();
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    return "Unable to load availability data. Please try again later.";
  };

  const setErrorState = error => {
    lastErrorMessage = mapErrorMessage(error);
    notify();
  };

  const applySnapshot = snapshot => {
    if (!snapshot) {
      cache = {};
      lastErrorMessage = null;
      notify();
      return;
    }
    try {
      const data = typeof snapshot.data === "function" ? snapshot.data() : snapshot;
      cache = normaliseAvailabilityData(data);
      lastErrorMessage = null;
      notify();
    } catch (error) {
      console.warn("Unable to process availability data", error);
      setErrorState(error);
    }
  };

  const ensureSubscription = () => {
    if (unsubscribe) return;
    try {
      unsubscribe = onSnapshot(
        docRef,
        snapshot => {
          const hadError = Boolean(lastErrorMessage);
          applySnapshot(snapshot);
          if (hadError && !lastErrorMessage) {
            console.info("Availability connection restored.");
          }
        },
        error => {
          console.warn("Unable to subscribe to availability updates", error);
          setErrorState(error);
        }
      );
    } catch (error) {
      console.warn("Availability subscription error", error);
    }
  };

  const ensureLoaded = async () => {
    if (loadPromise) return loadPromise;
    ensureSubscription();
    loadPromise = (async () => {
      try {
        const snapshot = await getDoc(docRef);
        if (snapshot) {
          applySnapshot(snapshot);
        } else {
          applySnapshot(null);
        }
        return buildState();
      } catch (error) {
        console.warn("Unable to load availability", error);
        setErrorState(error);
        throw error;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  };

  const subscribe = listener => {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(buildState());
    ensureSubscription();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  };

  const setDayAvailability = async (dateKey, dayMap) => {
    if (!isValidDateKey(dateKey)) {
      throw new Error("Invalid date provided");
    }

    const normalised = {};
    TIME_SLOT_VALUES.forEach(timeKey => {
      const value = dayMap && Object.prototype.hasOwnProperty.call(dayMap, timeKey)
        ? dayMap[timeKey]
        : true;
      normalised[timeKey] = value === false ? false : true;
    });

    const allAvailable = TIME_SLOT_VALUES.every(timeKey => normalised[timeKey] !== false);
    const nextCache = { ...cache };
    if (allAvailable) {
      delete nextCache[dateKey];
    } else {
      nextCache[dateKey] = normalised;
    }
    cache = nextCache;
    notify();

    try {
      if (allAvailable) {
        await setDoc(
          docRef,
          {
            slots: {
              [dateKey]: deleteField(),
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        await setDoc(
          docRef,
          {
            slots: {
              [dateKey]: normalised,
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      console.error("Unable to save availability", error);
      throw error;
    }
  };

  const getAvailabilityForDate = dateKey => {
    if (!isValidDateKey(dateKey)) return null;
    const entry = cache[dateKey];
    if (!entry) return null;
    return { ...entry };
  };

  return {
    ensureLoaded,
    subscribe,
    setDayAvailability,
    getAvailabilityForDate,
    getSnapshot: () => buildState(),
  };
})();



const AUTH_DEFAULT_REDIRECT = "booknow.html";
const AUTH_SIGN_OUT_REDIRECT = "index.html";

const ensureAuthMessageElement = form => {
  let message = form.querySelector("[data-auth-message]");
  if (!message) {
    message = document.createElement("p");
    message.dataset.authMessage = form.dataset.authForm || "";
    message.className = "auth-message";
    message.setAttribute("aria-live", "polite");
    message.hidden = true;
    form.appendChild(message);
  }
  return message;
};

const setAuthMessage = (messageEl, type, text) => {
  if (!messageEl) return;
  if (type === "error") {
    messageEl.setAttribute("role", "alert");
    messageEl.setAttribute("aria-live", "assertive");
  } else {
    messageEl.setAttribute("role", "status");
    messageEl.setAttribute("aria-live", "polite");
  }
  messageEl.dataset.authStatus = type || "";
  messageEl.textContent = text || "";
  messageEl.hidden = !text;
};

const toggleFormLoading = (form, submitButton, isLoading) => {
  if (submitButton) {
    submitButton.disabled = Boolean(isLoading);
    if (isLoading) {
      submitButton.dataset.loading = "true";
    } else {
      delete submitButton.dataset.loading;
    }
  }
  form.classList.toggle("is-loading", Boolean(isLoading));
};

const getFieldValue = (form, name) => {
  const field = form.elements.namedItem(name);
  if (!field) return "";
  return typeof field.value === "string" ? field.value.trim() : "";
};

runWhenReady(() => {
  const nav = document.querySelector("nav.off-screen-menu");
  if (!nav) return;

  const header = document.querySelector(".sticky-header");
  let headerAccount = header ? header.querySelector("[data-auth-account]") : null;
  if (header && !headerAccount) {
    headerAccount = document.createElement("div");
    headerAccount.dataset.authAccount = "";
    headerAccount.className = "auth-account";
    headerAccount.hidden = true;
    header.appendChild(headerAccount);
  }

  let headerName = headerAccount ? headerAccount.querySelector("[data-auth-username]") : null;
  if (headerAccount && !headerName) {
    headerName = document.createElement("span");
    headerName.dataset.authUsername = "";
    headerName.className = "auth-account__name";
    headerAccount.appendChild(headerName);
  }

  let headerSignOutButton = headerAccount ? headerAccount.querySelector("[data-auth-signout]") : null;
  if (headerAccount && !headerSignOutButton) {
    headerSignOutButton = document.createElement("button");
    headerSignOutButton.type = "button";
    headerSignOutButton.dataset.authSignout = "header";
    headerSignOutButton.className = "auth-account__signout";
    headerSignOutButton.textContent = "Sign Out";
    headerSignOutButton.hidden = true;
    headerAccount.appendChild(headerSignOutButton);
  }

  let signOutButton = nav.querySelector("[data-auth-signout]");
  if (!signOutButton) {
    signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.textContent = "Sign Out";
    signOutButton.dataset.authSignout = "";
    nav.appendChild(signOutButton);
  }
  const menuActionClass = "menu-action";
  const addMenuActionClass = element => {
    if (element) {
      element.classList.add(menuActionClass);
    }
  };

  nav.querySelectorAll("a, button").forEach(addMenuActionClass);

  signOutButton.classList.add("auth-signout");
  addMenuActionClass(signOutButton);
  signOutButton.hidden = true;
  signOutButton.removeAttribute("style");
  nav.appendChild(signOutButton);

  let status = nav.querySelector("[data-auth-status-indicator]");
  if (!status) {
    status = document.createElement("span");
    status.dataset.authStatusIndicator = "";
    status.className = "auth-status";
    status.setAttribute("aria-live", "polite");
  }
  status.hidden = true;
  nav.appendChild(status);

  const handleSignOut = async () => {
    clearBookingState();
    try {
      await authClient.signOut();
    } catch (error) {
      console.warn("Unable to sign out", error);
    }
    window.location.href = AUTH_SIGN_OUT_REDIRECT;
  };

  signOutButton.addEventListener("click", handleSignOut);
  if (headerSignOutButton) {
    headerSignOutButton.addEventListener("click", handleSignOut);
  }

  const signInLink = nav.querySelector('a[href="signin.html"]');
  const signUpLink = nav.querySelector('a[href="signup.html"]');

  let adminLink = nav.querySelector("[data-auth-admin-link]");
  if (!adminLink) {
    adminLink = document.createElement("a");
    adminLink.href = "admin.html";
    adminLink.dataset.authAdminLink = "";
    adminLink.textContent = "Admin Dashboard";
    adminLink.hidden = true;
    nav.appendChild(adminLink);
  }

  authClient.subscribe(({ user }) => {
    if (status) {
      status.textContent = user
        ? `Signed in as ${user.name || user.email || "student"}.`
        : "You're browsing as a guest.";
      status.hidden = !status.textContent;
    }

    if (signInLink) {
      signInLink.hidden = Boolean(user);
    }

    if (signUpLink) {
      signUpLink.hidden = Boolean(user);
    }

    if (signOutButton) {
      const isSignedIn = Boolean(user);
      signOutButton.hidden = !isSignedIn;
      signOutButton.disabled = !isSignedIn;
    }

    if (adminLink) {
      const isAdmin = Boolean(user && user.uid && user.uid === ADMIN_FIREBASE_UID);
      adminLink.hidden = !isAdmin;
    }

    if (headerAccount) {
      const displayName = user ? (user.name || user.email || "student") : "";
      headerAccount.hidden = !user;
      if (headerName) {
        headerName.textContent = displayName;
      }
      if (headerSignOutButton) {
        headerSignOutButton.hidden = !user;
        headerSignOutButton.disabled = !user;
      }
    }

    const authLinks = document.querySelectorAll(".auth-link");
    authLinks.forEach(link => {
      link.style.display = user ? "none" : "";
    });
  });
});

runWhenReady(() => {
  const successPage = document.querySelector("[data-success-page]");
  if (!successPage) return;

  clearPendingBooking();
  clearPendingBundle();
  clearBookingState();
});

runWhenReady(() => {
  const cancelPage = document.querySelector("[data-cancel-page]");
  if (!cancelPage) return;

  clearPendingBooking();
  clearPendingBundle();
});

runWhenReady(() => {
  const checkoutPage = document.querySelector("[data-checkout-page]");
  if (!checkoutPage) return;

  if (!requireAuthForBooking()) {
    return;
  }

  const summaryList = checkoutPage.querySelector("[data-checkout-summary]");
  const totalEl = checkoutPage.querySelector("[data-checkout-total]");
  const statusEl = checkoutPage.querySelector("[data-checkout-status]");
  const redirectButton = checkoutPage.querySelector("[data-checkout-redirect]");
  const checkoutContainer = checkoutPage.querySelector("#checkout");

  const booking = readPendingBooking();
  const bundleBooking = readPendingBundle();

  const hasSessions = Boolean(booking && Array.isArray(booking.sessions) && booking.sessions.length);
  const hasBundles = Boolean(bundleBooking && Array.isArray(bundleBooking.bundles) && bundleBooking.bundles.length);

  if (!hasSessions && !hasBundles) {
    if (statusEl) {
      statusEl.textContent = "No booking found. Please start again.";
    }
    window.setTimeout(() => {
      window.location.href = "selectsubjects.html";
    }, 1200);
    return;
  }

  const isBundleCheckout = hasBundles && !hasSessions;
  const currency = (bundleBooking && bundleBooking.currency) || booking?.currency || "AUD";

  if (summaryList) {
    summaryList.innerHTML = "";
    const items = isBundleCheckout ? bundleBooking.bundles : booking?.sessions || [];
    items.forEach(entry => {
      const item = document.createElement("li");
      item.className = "checkout-summary__item";
      if (isBundleCheckout) {
        const subjectText = entry.subjectLabel || entry.subject || "Bundle";
        const tierText = `${entry.hours || entry.quantity || ""} hours`.trim();
        const priceText = typeof entry.price === "number"
          ? formatCurrency(entry.price, currency)
          : "";
        item.innerHTML = `
          <div class="checkout-summary__details">
            <span class="checkout-summary__subject">${subjectText}</span>
            <span class="checkout-summary__datetime">${tierText}</span>
          </div>
          <span class="checkout-summary__price">${priceText}</span>
        `;
      } else {
        const subjectText = entry.subject || entry.subjectId || "Session";
        const dateText = formatDisplayDate(entry.date);
        const timeText = formatDisplayTime(entry.time);
        const priceText = typeof entry.price === "number"
          ? formatCurrency(entry.price, currency)
          : "";
        item.innerHTML = `
          <div class="checkout-summary__details">
            <span class="checkout-summary__subject">${subjectText}</span>
            <span class="checkout-summary__datetime">${dateText} · ${timeText}</span>
          </div>
          <span class="checkout-summary__price">${priceText}</span>
        `;
      }
      summaryList.appendChild(item);
    });
  }

  const computedBundleTotal = isBundleCheckout
    ? (typeof bundleBooking.totalAmount === "number"
      ? bundleBooking.totalAmount
      : bundleBooking.bundles.reduce((total, bundle) => total + (typeof bundle.price === "number" ? bundle.price : 0), 0))
    : null;

  const computedSessionTotal = !isBundleCheckout
    ? (typeof booking?.totalAmount === "number"
      ? booking.totalAmount
      : (Array.isArray(booking?.sessions)
        ? booking.sessions.reduce((total, session) => total + (typeof session.price === "number" ? session.price : 0), 0)
        : null))
    : null;

  const totalAmount = isBundleCheckout ? computedBundleTotal : computedSessionTotal;

  if (totalEl && typeof totalAmount === "number") {
    totalEl.textContent = formatCurrency(totalAmount, currency);
  }

  const createSession = async mode => {
    if (statusEl) {
      statusEl.textContent = "Preparing secure checkout...";
    }

    const user = firebaseAuth.currentUser;

    const email = user?.email || booking?.email || bundleBooking?.email || null;
    const sessionsPayload = Array.isArray(booking?.sessions) ? booking.sessions : [];
    const bundlePayload = Array.isArray(bundleBooking?.bundles) ? bundleBooking.bundles : [];
    const bookingPayload = isBundleCheckout
      ? {
        ...bundleBooking,
        bundles: bundlePayload,
        sessions: [],
        currency,
      }
      : {
        ...booking,
        sessions: sessionsPayload,
        currency,
      };

    if (typeof totalAmount === "number") {
      bookingPayload.totalAmount = totalAmount;
      bookingPayload.total = totalAmount;
    } else if (typeof booking?.total === "number") {
      bookingPayload.total = booking.total;
      bookingPayload.totalAmount = booking.total;
    }

    if (email) {
      bookingPayload.email = email;
    }

    const payload = {
      booking: bookingPayload,
      mode,
    };

    if (mode) {
      payload.uiMode = mode;
    }

    if (email) {
      payload.customerEmail = email;
    }

    if (user?.uid) {
      payload.userId = user.uid;
    }
  
    try {
      const response = await fetch(CREATE_SESSION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
  
      const data = await response.json().catch(() => ({}));
  
      if (!response.ok) {
        const message = data?.error || "Unable to create a checkout session.";
        throw new Error(message);
      }
  
      if (mode === "embedded" && !data.client_secret) {
        throw new Error("Stripe did not return a client secret.");
      }
  
      if (mode !== "embedded" && !data.id && !data.url) {
        throw new Error("Stripe did not return a session ID or URL.");
      }
  
      return data;
    } catch (err) {
      console.error("❌ createSession failed:", err);
      if (statusEl) {
        statusEl.textContent = err.message || "Unable to connect to Stripe checkout.";
      }
      throw err;
    }
  };

  // ---------- EMBEDDED CHECKOUT ----------
  const mountEmbeddedCheckout = async () => {
    try {
      if (statusEl) {
        statusEl.textContent = "Loading embedded checkout...";
      }
  
      const data = await createSession("embedded");
  
      if (!data.client_secret) {
        throw new Error("Stripe did not return a client secret.");
      }
  
      const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
      const checkout = await stripe.initEmbeddedCheckout({
        clientSecret: data.client_secret,
      });
  
      checkout.mount("#checkout");
  
      if (statusEl) statusEl.textContent = "";
    } catch (err) {
      console.error("❌ Unable to initialise embedded checkout:", err);
      if (statusEl) {
        statusEl.textContent =
          "Unable to load embedded checkout. Please try the secure Stripe page instead.";
      }
    }
  };


  mountEmbeddedCheckout();

  if (redirectButton) {
    redirectButton.addEventListener("click", async () => {
      redirectButton.disabled = true;
      if (statusEl) {
        statusEl.textContent = "Opening Stripe checkout...";
      }
      try {
        const data = await createSession("hosted");
        const stripe = await getStripeClient();
        if (!stripe) {
          throw new Error("Stripe.js failed to load.");
        }

        if (data?.id) {
          const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
          if (error) {
            throw error;
          }
        } else if (data?.url) {
          window.location.href = data.url;
        } else if (statusEl) {
          statusEl.textContent = "Stripe did not return a redirect URL.";
          redirectButton.disabled = false;
        }
      } catch (error) {
        console.error("Unable to start redirect checkout", error);
        if (statusEl) {
          statusEl.textContent = error.message || "Unable to open Stripe checkout.";
        }
        redirectButton.disabled = false;
      }
    });
  }
});

runWhenReady(() => {
  const adminPage = document.querySelector("[data-admin-page]");
  if (!adminPage) return;

  const ADMIN_FIREBASE_UID = window.BUAN_ADMIN_UID || "ADMIN_FIREBASE_UID";
  const tableBody = adminPage.querySelector("[data-admin-rows]");
  const emptyState = adminPage.querySelector("[data-admin-empty]");
  const loadingState = adminPage.querySelector("[data-admin-loading]");
  const errorEl = adminPage.querySelector("[data-admin-error]");
  const availabilitySection = adminPage.querySelector("[data-admin-availability]");
  const calendarWeekdays = availabilitySection?.querySelector("[data-admin-calendar-weekdays]");
  const calendarGrid = availabilitySection?.querySelector("[data-admin-calendar-grid]");
  const availabilityHelper = availabilitySection?.querySelector("[data-admin-availability-helper]");
  const modal = document.querySelector("[data-admin-modal]");
  const modalBackdrop = document.querySelector("[data-admin-modal-backdrop]");
  const modalTimes = document.querySelector("[data-admin-modal-times]");
  const modalDateLabel = document.querySelector("[data-admin-modal-date]");
  const modalClose = document.querySelector("[data-admin-modal-close]");
  const modalConfirm = document.querySelector("[data-admin-modal-confirm]");
  const confirmDefaultText = modalConfirm?.textContent || "Confirm";
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayButtons = new Map();
  let activeDayButton = null;
  let modalDateKey = null;
  let availabilityState = availabilityService.getSnapshot();
  let availabilityUnsubscribe = null;
  let escListener = null;
  let modalCloseTimeoutId = null;
  const toIsoDate = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  let bookingsUnsubscribe = null;

  const getAvailabilityData = () => {
    const data = availabilityState?.data;
    return data && typeof data === "object" ? data : {};
  };

  const hasAvailabilityError = () => Boolean(availabilityState?.error);

  const getAvailabilityErrorMessage = () => {
    const message = availabilityState?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    return "Real-time availability is currently unavailable. Please try again later.";
  };

  const renderEmpty = isEmpty => {
    if (emptyState) emptyState.hidden = !isEmpty;
  };

  const setLoading = isLoading => {
    if (loadingState) loadingState.hidden = !isLoading;
  };

  const setError = message => {
    if (errorEl) {
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
    }
  };

  const describeAvailability = (dateKey, availabilityData = getAvailabilityData()) => {
    const day = availabilityData?.[dateKey];
    if (!day) {
      return {
        unavailable: 0,
        available: TIME_SLOT_VALUES.length,
        message: "All slots available.",
      };
    }
    let unavailable = 0;
    let available = 0;
    TIME_SLOT_VALUES.forEach(timeKey => {
      if (day[timeKey] === false) {
        unavailable += 1;
      } else {
        available += 1;
      }
    });
    let message = "All slots available.";
    if (unavailable === TIME_SLOT_VALUES.length) {
      message = "No slots available.";
    } else if (unavailable > 0) {
      message = `${available} available · ${unavailable} unavailable.`;
    }
    return { unavailable, available, message };
  };

  const updateHelperMessage = dateKey => {
    if (!availabilityHelper) return;
    if (hasAvailabilityError()) {
      availabilityHelper.textContent = getAvailabilityErrorMessage();
      return;
    }
    if (dateKey) {
      const summary = describeAvailability(dateKey);
      availabilityHelper.textContent = summary.message;
    } else {
      availabilityHelper.textContent = "Select a date to edit availability.";
    }
  };

  const updateDayStates = () => {
    const hasError = hasAvailabilityError();
    const availabilityData = getAvailabilityData();
    const errorMessage = hasError ? getAvailabilityErrorMessage() : "";
    dayButtons.forEach((button, dateKey) => {
      if (hasError) {
        button.classList.remove("calendar-day--has-unavailable");
        button.classList.remove("calendar-day--fully-unavailable");
        button.classList.remove("selected");
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.setAttribute("aria-label", `${formatDisplayDate(dateKey)} – ${errorMessage}`);
        button.title = errorMessage;
        return;
      }
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
      const summary = describeAvailability(dateKey, availabilityData);
      const isPartial = summary.unavailable > 0 && summary.unavailable < TIME_SLOT_VALUES.length;
      const isClosed = summary.unavailable === TIME_SLOT_VALUES.length;
      button.classList.toggle("calendar-day--has-unavailable", isPartial);
      button.classList.toggle("calendar-day--fully-unavailable", isClosed);
      button.setAttribute(
        "aria-label",
        `${formatDisplayDate(dateKey)} – ${summary.message}`
      );
      button.title = summary.message;
    });
  };

  const clearModalCloseTimeout = () => {
    if (modalCloseTimeoutId !== null) {
      window.clearTimeout(modalCloseTimeoutId);
      modalCloseTimeoutId = null;
    }
  };

  const showModalDisconnectNotice = message => {
    if (!modalTimes) return;
    modalTimes.innerHTML = "";
    const notice = document.createElement("p");
    notice.className = "admin-modal__notice";
    notice.textContent = message;
    modalTimes.appendChild(notice);
  };

  const closeModal = () => {
    clearModalCloseTimeout();
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
    if (modalBackdrop) {
      modalBackdrop.hidden = true;
    }
    modalDateKey = null;
    if (activeDayButton) {
      activeDayButton.classList.remove("selected");
      activeDayButton = null;
    }
    updateHelperMessage(null);
    if (escListener) {
      document.removeEventListener("keydown", escListener);
      escListener = null;
    }
    if (modalConfirm) {
      modalConfirm.disabled = false;
      modalConfirm.textContent = confirmDefaultText;
    }
  };

  const renderModalTimes = dateKey => {
    if (!modalTimes) return;
    modalTimes.innerHTML = "";
    if (hasAvailabilityError()) {
      return;
    }
    const slots = getStandardTimeSlots();
    const availabilityData = getAvailabilityData();
    const day = availabilityData[dateKey] || {};

    slots.forEach(({ value, display }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "admin-modal__toggle";
      const id = `admin-availability-${dateKey}-${value}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = display;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.dataset.time = value;
      const available = day[value] === false ? false : true;
      input.checked = available;

      const syncAppearance = () => {
        wrapper.classList.toggle("admin-modal__toggle--unavailable", !input.checked);
      };

      input.addEventListener("change", syncAppearance);
      syncAppearance();

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      modalTimes.appendChild(wrapper);
    });
  };

  const applyAvailabilityState = () => {
    const hasError = hasAvailabilityError();
    if (hasError) {
      const message = getAvailabilityErrorMessage();
      setError(message);
      updateDayStates();
      if (modal && modal.hidden === false) {
        showModalDisconnectNotice("Lost connection. Closing editor…");
        clearModalCloseTimeout();
        modalCloseTimeoutId = window.setTimeout(() => {
          closeModal();
        }, 1400);
      } else {
        updateHelperMessage(null);
      }
      if (modalConfirm) {
        modalConfirm.disabled = true;
        modalConfirm.textContent = confirmDefaultText;
      }
      return;
    }

    setError("");
    updateDayStates();
    if (modalDateKey) {
      renderModalTimes(modalDateKey);
      updateHelperMessage(modalDateKey);
    } else {
      updateHelperMessage(null);
    }
    if (modalConfirm) {
      modalConfirm.disabled = false;
      modalConfirm.textContent = confirmDefaultText;
    }
  };

  const openModal = dateKey => {
    if (!modal || !modalBackdrop) return;
    if (hasAvailabilityError()) {
      setError(getAvailabilityErrorMessage());
      return;
    }
    clearModalCloseTimeout();
    modalDateKey = dateKey;
    renderModalTimes(dateKey);
    updateHelperMessage(dateKey);
    if (modalDateLabel) {
      modalDateLabel.textContent = formatDisplayDate(dateKey);
    }
    const button = dayButtons.get(dateKey) || null;
    if (button) {
      if (activeDayButton && activeDayButton !== button) {
        activeDayButton.classList.remove("selected");
      }
      button.classList.add("selected");
      activeDayButton = button;
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    modalBackdrop.hidden = false;
    if (modalConfirm) {
      modalConfirm.disabled = false;
      modalConfirm.textContent = confirmDefaultText;
      modalConfirm.focus({ preventScroll: true });
    }
    if (!escListener) {
      escListener = event => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeModal();
        }
      };
      document.addEventListener("keydown", escListener);
    }
  };

  const handleModalConfirm = async () => {
    if (!modalDateKey || !modalTimes || !modalConfirm) return;
    if (hasAvailabilityError()) {
      setError(getAvailabilityErrorMessage());
      return;
    }
    const inputs = modalTimes.querySelectorAll('input[type="checkbox"][data-time]');
    const payload = {};
    inputs.forEach(input => {
      const timeValue = input.dataset.time;
      if (timeValue) {
        payload[timeValue] = input.checked;
      }
    });
    modalConfirm.disabled = true;
    modalConfirm.textContent = "Saving...";
    try {
      await availabilityService.setDayAvailability(modalDateKey, payload);
      setError("");
      closeModal();
    } catch (error) {
      console.error("Unable to update availability", error);
      setError("Unable to save availability. Try again later.");
      modalConfirm.disabled = false;
      modalConfirm.textContent = confirmDefaultText;
    }
  };

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", closeModal);
  }
  if (modalConfirm) {
    modalConfirm.addEventListener("click", handleModalConfirm);
  }

  const buildAvailabilityCalendar = () => {
    if (!calendarWeekdays || !calendarGrid) return;
    calendarWeekdays.innerHTML = "";
    weekdayLabels.forEach(label => {
      const el = document.createElement("div");
      el.className = "calendar-weekday";
      el.textContent = label;
      calendarWeekdays.appendChild(el);
    });

    calendarGrid.innerHTML = "";
    dayButtons.clear();

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const getMondayFirstOffset = date => (date.getDay() + 6) % 7;
    const startOffset = getMondayFirstOffset(start);

    for (let i = 0; i < 28; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = toIsoDate(date);
      const dayButton = document.createElement("button");
      dayButton.type = "button";
      dayButton.className = "calendar-day";
      dayButton.dataset.date = iso;
      dayButton.textContent = date.getDate();
      if (i === 0 && startOffset > 0) {
        dayButton.style.gridColumnStart = String(startOffset + 1);
      }
      dayButton.addEventListener("click", () => {
        openModal(iso);
      });
      calendarGrid.appendChild(dayButton);
      dayButtons.set(iso, dayButton);
    }

    applyAvailabilityState();
  };

  if (availabilitySection && calendarWeekdays && calendarGrid) {
    buildAvailabilityCalendar();
    availabilityService.ensureLoaded().catch(() => {});
    availabilityUnsubscribe = availabilityService.subscribe(state => {
      availabilityState = state;
      applyAvailabilityState();
    });
  }

  const renderRows = bookings => {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    bookings.forEach(booking => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${booking.email || "unknown"}</td>
        <td>${booking.summary || ""}</td>
        <td>${booking.dateText || ""}</td>
        <td>${booking.timeText || ""}</td>
        <td>${booking.amountText || ""}</td>
        <td>
          <select data-admin-status data-id="${booking.id}">
            <option value="paid" ${booking.status === "paid" ? "selected" : ""}>Paid</option>
            <option value="scheduled" ${booking.status === "scheduled" ? "selected" : ""}>Scheduled</option>
            <option value="completed" ${booking.status === "completed" ? "selected" : ""}>Completed</option>
          </select>
        </td>
      `;
      tableBody.appendChild(row);
    });
    renderEmpty(bookings.length === 0);
  };

  const attachStatusListener = () => {
    if (!tableBody) return;
    tableBody.addEventListener("change", async event => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      if (!select.matches("[data-admin-status]")) return;
      const bookingId = select.dataset.id;
      const value = select.value;
      if (!bookingId) return;
      try {
        const docRef = doc(firestore, "bookings", bookingId);
        await updateDoc(docRef, { status: value, updatedAt: new Date().toISOString() });
      } catch (error) {
        console.error("Unable to update booking status", error);
        setError("Unable to update booking status. Try again later.");
      }
    });
  };

  attachStatusListener();

  setLoading(true);

  const authUnsubscribe = onAuthStateChanged(firebaseAuth, user => {
    if (bookingsUnsubscribe) {
      bookingsUnsubscribe();
      bookingsUnsubscribe = null;
    }

    if (!user) {
      const redirect = encodeURIComponent("admin.html");
      window.location.replace(`signin.html?redirect=${redirect}`);
      return;
    }

    if (user.uid !== ADMIN_FIREBASE_UID) {
      setLoading(false);
      renderEmpty(true);
      setError("You do not have permission to view this page.");
      return;
    }

    const bookingsQuery = query(collection(firestore, "bookings"), orderBy("createdAt", "desc"));
    bookingsUnsubscribe = onSnapshot(bookingsQuery, snapshot => {
      const bookings = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        const firstSession = sessions[0] || {};
        const summary = sessions
          .map(session => `${session.subject || session.subjectId || "Session"}`)
          .join(", ");
        return {
          id: docSnapshot.id,
          email: data.email || "unknown",
          summary,
          dateText: formatDisplayDate(firstSession.date),
          timeText: formatDisplayTime(firstSession.time),
          amountText: typeof data.amount === "number" ? formatCurrency(data.amount, data.currency || "AUD") : "",
          status: data.status || (data.paid ? "paid" : ""),
        };
      });
      setLoading(false);
      setError("");
      renderRows(bookings);
    }, error => {
      console.error("Unable to load bookings", error);
      setLoading(false);
      setError("Unable to load bookings. Try again later.");
    });
  });

  window.addEventListener("beforeunload", () => {
    if (bookingsUnsubscribe) {
      bookingsUnsubscribe();
      bookingsUnsubscribe = null;
    }
    if (typeof availabilityUnsubscribe === "function") {
      availabilityUnsubscribe();
      availabilityUnsubscribe = null;
    }
    if (typeof authUnsubscribe === "function") {
      authUnsubscribe();
    }
  });
});

runWhenReady(() => {
  const params = new URLSearchParams(window.location.search);
  const redirectParam = params.get("redirect");

  const signUpForm = document.querySelector('[data-auth-form="sign-up"]');
  if (signUpForm) {
    if (redirectParam) {
      signUpForm.dataset.redirect = redirectParam;
    }

    const submitButton = signUpForm.querySelector('[data-auth-submit="sign-up"]');
    const messageEl = ensureAuthMessageElement(signUpForm);

    signUpForm.addEventListener("submit", async event => {
      event.preventDefault();

      const name = getFieldValue(signUpForm, "name");
      const email = getFieldValue(signUpForm, "email");
      const password = getFieldValue(signUpForm, "password");
      const yearLevel = getFieldValue(signUpForm, "yearLevel");

      const errors = [];
      if (!name) errors.push("Please provide your full name.");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Enter a valid email address.");
      }
      if (!password || password.length < 8) {
        errors.push("Your password must be at least 8 characters long.");
      }
      if (!yearLevel) {
        errors.push("Select your current year level.");
      }

      if (errors.length) {
        setAuthMessage(messageEl, "error", errors[0]);
        return;
      }

      toggleFormLoading(signUpForm, submitButton, true);
      setAuthMessage(messageEl, "", "");

      try {
        await authClient.signUp({ name, email, password, yearLevel });
        setAuthMessage(messageEl, "success", "Account created! Redirecting...");
        const redirect = signUpForm.dataset.redirect || AUTH_DEFAULT_REDIRECT;
        window.setTimeout(() => {
          window.location.href = redirect;
        }, 600);
      } catch (error) {
        setAuthMessage(messageEl, "error", error.message || "Unable to sign you up. Please try again.");
      } finally {
        toggleFormLoading(signUpForm, submitButton, false);
      }
    });
  }

  const signInForm = document.querySelector('[data-auth-form="sign-in"]');
  if (signInForm) {
    if (redirectParam) {
      signInForm.dataset.redirect = redirectParam;
    }

    const submitButton = signInForm.querySelector('[data-auth-submit="sign-in"]');
    const messageEl = ensureAuthMessageElement(signInForm);

    signInForm.addEventListener("submit", async event => {
      event.preventDefault();

      const email = getFieldValue(signInForm, "email");
      const password = getFieldValue(signInForm, "password");

      const errors = [];
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Enter a valid email address.");
      }
      if (!password || password.length < 8) {
        errors.push("Your password must be at least 8 characters long.");
      }

      if (errors.length) {
        setAuthMessage(messageEl, "error", errors[0]);
        return;
      }

      toggleFormLoading(signInForm, submitButton, true);
      setAuthMessage(messageEl, "", "");

      try {
        await authClient.signIn({ email, password });
        setAuthMessage(messageEl, "success", "Welcome back! Redirecting...");
        const redirect = signInForm.dataset.redirect || AUTH_DEFAULT_REDIRECT;
        window.setTimeout(() => {
          window.location.href = redirect;
        }, 400);
      } catch (error) {
        setAuthMessage(messageEl, "error", error.message || "Unable to sign you in. Please try again.");
      } finally {
        toggleFormLoading(signInForm, submitButton, false);
      }
    });
  }
});

runWhenReady(() => {
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if (!revealElements.length) return;

  if (typeof window.IntersectionObserver !== 'function') {
    revealElements.forEach(element => element.classList.add('is-visible'));
    return;
  }

  document.documentElement.classList.add('js-enabled');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -60px 0px' });

  revealElements.forEach(element => observer.observe(element));
});

runWhenReady(() => {
  const parallaxSections = document.querySelectorAll('[data-parallax]');
  if (!parallaxSections.length) return;

  const updateParallax = () => {
    const scrollY = window.scrollY;
    parallaxSections.forEach(section => {
      const speed = 0.1;
      section.style.backgroundPositionY = `${-scrollY * speed}px`;
    });
  };

  updateParallax();
  window.addEventListener('scroll', updateParallax, { passive: true });
});

runWhenReady(() => {
  const resourceScroll = document.querySelector('[data-resource-scroll]');
  if (!resourceScroll) return;

  const overlay = document.querySelector('[data-resource-overlay]');
  let scrollLimit = 0;

  const computeLimit = () => {
    const pages = resourceScroll.querySelectorAll('.resource-page');
    const first = pages[0]?.clientHeight || 0;
    const second = pages[1]?.clientHeight || 0;
    scrollLimit = first + second * 0.25;
  };

  const lockScroll = () => {
    resourceScroll.classList.add('locked');
    overlay?.classList.add('active');
  };

  computeLimit();

  resourceScroll.addEventListener('scroll', () => {
    if (resourceScroll.classList.contains('locked')) {
      resourceScroll.scrollTop = scrollLimit;
      return;
    }

    if (resourceScroll.scrollTop >= scrollLimit) {
      resourceScroll.scrollTop = scrollLimit;
      lockScroll();
    }
  });

  window.addEventListener('resize', () => {
    const wasLocked = resourceScroll.classList.contains('locked');
    computeLimit();
    if (wasLocked) {
      resourceScroll.scrollTop = scrollLimit;
    }
  });
});

// Hamburger menu toggle
runWhenReady(() => {
  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('menu');

  if (hamburger && menu) {
    hamburger.addEventListener('click', () => {
      menu.classList.toggle('active');
    });
  }
});

runWhenReady(() => {
  const options = document.querySelectorAll(".book-option");

  options.forEach(option => {
    // create a background layer
    const bg = document.createElement("div");
    bg.classList.add("background");
    bg.style.backgroundImage = getComputedStyle(option).backgroundImage;
    option.style.backgroundImage = "none"; // remove original background
    option.prepend(bg);

    option.addEventListener("mousemove", e => {
      const rect = option.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const moveX = (x / rect.width - 0.5) * 10; // range -5 to +5
      const moveY = (y / rect.height - 0.5) * 10;
      bg.style.transform = `scale(1.1) rotateX(${-moveY}deg) rotateY(${moveX}deg)`;
      bg.style.backgroundPosition = `${50 + moveX * 1.5}% ${50 + moveY * 1.5}%`;
    });

    option.addEventListener("mouseleave", () => {
      bg.style.transform = "scale(1.05) rotateX(0) rotateY(0)";
      bg.style.backgroundPosition = "center";
    });
  });
});

runWhenReady(() => {
  const calendarPage = document.querySelector("[data-calendar]");
  if (!calendarPage) return;

  if (!requireAuthForBooking()) {
    return;
  }

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdaysContainer = calendarPage.querySelector("[data-calendar-weekdays]");
  const grid = calendarPage.querySelector("[data-calendar-grid]");
  const helper = calendarPage.querySelector("[data-calendar-helper]");
  const selectButton = document.querySelector("[data-select-time]");

  const bookingState = readBookingState();
  const storedTimes =
    bookingState && typeof bookingState.times === "object" && bookingState.times !== null
      ? { ...bookingState.times }
      : {};
  let storedSubjects = pruneSubjects(bookingState.subjects, storedTimes);
  const storedDateList = Array.isArray(bookingState.dates) ? [...bookingState.dates] : [];
  let availabilityState = availabilityService.getSnapshot();
  const dayLookup = new Map();
  let availabilityUnsubscribe = null;

  const getAvailabilityData = () => {
    const data = availabilityState?.data;
    return data && typeof data === "object" ? data : {};
  };

  const hasAvailabilityError = () => Boolean(availabilityState?.error);

  const getAvailabilityErrorMessage = () => {
    const message = availabilityState?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    return "We’re unable to load availability right now. Please try again shortly.";
  };

  weekdays.forEach(label => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = label;
    weekdaysContainer.appendChild(el);
  });

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const getMondayFirstOffset = date => (date.getDay() + 6) % 7;
  const startOffset = getMondayFirstOffset(startDate);
  const totalDays = 28; // four weeks
  const selectedDates = new Set();
  const weekSelections = new Map();

  const formatDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getWeekKey = date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    return formatDateKey(d);
  };

  const isDateSelectable = dateKey => {
    if (!isValidDateKey(dateKey)) return false;
    if (hasAvailabilityError()) return false;
    const availabilityData = getAvailabilityData();
    const day = availabilityData?.[dateKey];
    if (!day) return true;
    return TIME_SLOT_VALUES.some(timeKey => day[timeKey] !== false);
  };

  const validStoredSelections = new Set();
  const preselectionWeekCounts = new Map();

  storedDateList.forEach(iso => {
    if (typeof iso !== "string") return;
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    const diffDays = Math.round((date - startDate) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays >= totalDays) return;
    const weekKey = getWeekKey(date);
    const count = preselectionWeekCounts.get(weekKey) || 0;
    if (count >= 2) return;
    preselectionWeekCounts.set(weekKey, count + 1);
    validStoredSelections.add(iso);
  });

  const persistSelections = () => {
    const orderedDates = Array.from(selectedDates).sort();
    Object.keys(storedTimes).forEach(dateKey => {
      if (!orderedDates.includes(dateKey)) {
        delete storedTimes[dateKey];
      }
    });
    storedSubjects = pruneSubjects(storedSubjects, storedTimes);
    persistBookingState({ dates: orderedDates, times: storedTimes, subjects: storedSubjects });
  };

  const updateWeekRestrictions = () => {
    const hasError = hasAvailabilityError();
    dayLookup.forEach(dayEl => {
      if (hasError) {
        dayEl.classList.add("disabled");
        return;
      }
      const weekKey = dayEl.dataset.week;
      const count = weekSelections.get(weekKey) || 0;
      if (dayEl.classList.contains("selected")) {
        dayEl.classList.remove("disabled");
        return;
      }

      if (count >= 2) {
        dayEl.classList.add("disabled");
      } else {
        dayEl.classList.remove("disabled");
      }
    });
  };

  const refreshHelper = () => {
    if (!helper) return;
    if (hasAvailabilityError()) {
      helper.textContent = getAvailabilityErrorMessage();
      if (selectButton) {
        selectButton.disabled = true;
        selectButton.setAttribute("aria-disabled", "true");
      }
      return;
    }
    const totalSelected = selectedDates.size;
    if (totalSelected === 0) {
      helper.textContent = "Choose a day to continue.";
    } else if (totalSelected === 1) {
      helper.textContent = "1 day selected.";
    } else {
      helper.textContent = `${totalSelected} days selected.`;
    }

    if (selectButton) {
      selectButton.disabled = totalSelected === 0;
      selectButton.setAttribute("aria-disabled", totalSelected === 0 ? "true" : "false");
    }
  };

  const updateDayAvailabilityClasses = () => {
    const hasError = hasAvailabilityError();
    dayLookup.forEach((dayEl, dateKey) => {
      if (hasError) {
        dayEl.disabled = true;
        dayEl.classList.add("disabled");
        dayEl.setAttribute("aria-disabled", "true");
        return;
      }
      const selectable = isDateSelectable(dateKey);
      dayEl.classList.toggle("unavailable", !selectable);
      dayEl.disabled = !selectable;
      dayEl.classList.toggle("disabled", !selectable && !dayEl.classList.contains("selected"));
      dayEl.setAttribute("aria-disabled", String(!selectable));
      if (!selectable) {
        dayEl.classList.remove("selected");
        dayEl.setAttribute("aria-pressed", "false");
      }
    });
  };

  const removeUnavailableSelections = () => {
    if (hasAvailabilityError()) {
      return false;
    }
    let removed = false;
    Array.from(selectedDates).forEach(dateKey => {
      if (!isDateSelectable(dateKey)) {
        selectedDates.delete(dateKey);
        const dayEl = dayLookup.get(dateKey);
        if (dayEl) {
          dayEl.classList.remove("selected");
          dayEl.setAttribute("aria-pressed", "false");
        }
        removed = true;
      }
    });
    return removed;
  };

  const applyAvailabilityState = () => {
    updateDayAvailabilityClasses();
    const hasError = hasAvailabilityError();
    let removed = false;
    if (!hasError) {
      removed = removeUnavailableSelections();
    }
    updateWeekRestrictions();
    if (!hasError && removed) {
      persistSelections();
    }
    refreshHelper();
  };

  const handleAvailabilityUpdate = state => {
    availabilityState = state;
    applyAvailabilityState();
  };

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dayEl = document.createElement("button");
    dayEl.type = "button";
    dayEl.className = "calendar-day";
    dayEl.textContent = date.getDate();
    dayEl.setAttribute("aria-pressed", "false");
    const iso = formatDateKey(date);
    dayEl.dataset.date = iso;
    const weekKey = getWeekKey(date);
    dayEl.dataset.week = weekKey;
    dayLookup.set(iso, dayEl);

    if (i === 0 && startOffset > 0) {
      dayEl.style.gridColumnStart = String(startOffset + 1);
    }

    if (validStoredSelections.has(iso)) {
      selectedDates.add(iso);
      const currentCount = weekSelections.get(weekKey) || 0;
      weekSelections.set(weekKey, currentCount + 1);
      dayEl.classList.add("selected");
      dayEl.setAttribute("aria-pressed", "true");
    }

    dayEl.addEventListener("click", () => {
      if (hasAvailabilityError()) {
        if (helper) {
          helper.textContent = getAvailabilityErrorMessage();
        }
        return;
      }
      if (!isDateSelectable(iso)) {
        helper.textContent = "No availability for this date.";
        return;
      }
      if (dayEl.classList.contains("disabled") && !dayEl.classList.contains("selected")) {
        helper.textContent = "Only two days per week can be selected.";
        return;
      }

      const alreadySelected = selectedDates.has(iso);
      if (alreadySelected) {
        selectedDates.delete(iso);
        dayEl.classList.remove("selected");
        const current = weekSelections.get(weekKey) || 1;
        const next = Math.max(current - 1, 0);
        if (next === 0) {
          weekSelections.delete(weekKey);
        } else {
          weekSelections.set(weekKey, next);
        }
        dayEl.setAttribute("aria-pressed", "false");
      } else {
        const weekCount = weekSelections.get(weekKey) || 0;
        if (weekCount >= 2) {
          helper.textContent = "Only two days per week can be selected.";
          return;
        }
        selectedDates.add(iso);
        dayEl.classList.add("selected");
        weekSelections.set(weekKey, weekCount + 1);
        dayEl.setAttribute("aria-pressed", "true");
      }

      updateWeekRestrictions();
      refreshHelper();
      persistSelections();
    });

    grid.appendChild(dayEl);
  }

  persistSelections();
  applyAvailabilityState();

  availabilityService.ensureLoaded().catch(() => {});
  availabilityUnsubscribe = availabilityService.subscribe(handleAvailabilityUpdate);

  if (selectButton) {
    selectButton.addEventListener("click", () => {
      if (selectButton.disabled || hasAvailabilityError()) return;
      persistSelections();
      window.location.href = "selecttime.html";
    });
  }

  window.addEventListener("beforeunload", () => {
    if (typeof availabilityUnsubscribe === "function") {
      availabilityUnsubscribe();
      availabilityUnsubscribe = null;
    }
  });
});

runWhenReady(() => {
  const adminCalendar = document.querySelector("[data-admin-calendar]");
  if (!adminCalendar) return;

  const weekdaysContainer = adminCalendar.querySelector("[data-admin-calendar-weekdays]");
  const grid = adminCalendar.querySelector("[data-admin-calendar-grid]");
  const helper = adminCalendar.querySelector("[data-admin-calendar-helper]");

  if (!weekdaysContainer || !grid) return;

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  weekdaysContainer.innerHTML = "";
  weekdayLabels.forEach(label => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = label;
    weekdaysContainer.appendChild(el);
  });

  const helperDefaultText = helper?.textContent?.trim() || "";
  const setHelperMessage = message => {
    if (!helper) return;
    helper.textContent = message || helperDefaultText;
    helper.dataset.status = message && message !== helperDefaultText ? "error" : "";
  };

  grid.innerHTML = "";
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const getMondayFirstOffset = date => (date.getDay() + 6) % 7;
  const startOffset = getMondayFirstOffset(startDate);
  const totalDays = 28;
  const accessibleFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const dayCells = new Map();

  const formatDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  for (let index = 0; index < totalDays; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    const iso = formatDateKey(date);
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";
    dayCell.textContent = String(date.getDate());
    const label = accessibleFormatter.format(date);
    dayCell.dataset.date = iso;
    dayCell.dataset.label = label;
    dayCell.setAttribute("aria-label", label);
    dayCell.title = label;

    if (index === 0 && startOffset > 0) {
      dayCell.style.gridColumnStart = String(startOffset + 1);
    }

    grid.appendChild(dayCell);
    dayCells.set(iso, dayCell);
  }

  const describeDay = dayMap => {
    if (!dayMap) {
      return { unavailable: 0, message: "All slots available." };
    }
    let unavailable = 0;
    TIME_SLOT_VALUES.forEach(timeKey => {
      if (dayMap[timeKey] === false) {
        unavailable += 1;
      }
    });
    if (unavailable === 0) {
      return { unavailable: 0, message: "All slots available." };
    }
    if (unavailable === TIME_SLOT_VALUES.length) {
      return { unavailable, message: "No slots available." };
    }
    const availableCount = TIME_SLOT_VALUES.length - unavailable;
    return { unavailable, message: `${availableCount} available · ${unavailable} unavailable.` };
  };

  const defaultErrorMessage = "Real-time availability is currently unavailable. Please try again later.";

  const updateCalendarState = state => {
    const data = state?.data && typeof state.data === "object" ? state.data : {};
    const hasError = Boolean(state?.error);
    const errorMessage = hasError
      ? (typeof state.error?.message === "string" && state.error.message.trim()
        ? state.error.message.trim()
        : defaultErrorMessage)
      : "";

    setHelperMessage(hasError ? errorMessage : helperDefaultText);

    dayCells.forEach((cell, dateKey) => {
      const baseLabel = cell.dataset.label || cell.textContent || "";
      cell.classList.remove("calendar-day--has-unavailable", "calendar-day--fully-unavailable");
      let message = "All slots available.";
      if (hasError) {
        message = errorMessage;
      } else {
        const summary = describeDay(data[dateKey]);
        message = summary.message;
        if (summary.unavailable === TIME_SLOT_VALUES.length) {
          cell.classList.add("calendar-day--fully-unavailable");
        } else if (summary.unavailable > 0) {
          cell.classList.add("calendar-day--has-unavailable");
        }
      }
      const label = baseLabel ? `${baseLabel} – ${message}` : message;
      cell.setAttribute("aria-label", label);
      cell.title = message;
    });
  };

  let availabilityUnsubscribe = null;
  availabilityService.ensureLoaded().catch(() => {});
  availabilityUnsubscribe = availabilityService.subscribe(updateCalendarState);

  window.addEventListener("beforeunload", () => {
    if (typeof availabilityUnsubscribe === "function") {
      availabilityUnsubscribe();
      availabilityUnsubscribe = null;
    }
  });
});

runWhenReady(() => {
  const selectTimePage = document.querySelector("[data-select-time-page]");
  if (!selectTimePage) return;

  if (!requireAuthForBooking()) {
    return;
  }

  const list = selectTimePage.querySelector("[data-date-list]");
  const emptyState = selectTimePage.querySelector("[data-empty-state]");
  const helper = selectTimePage.querySelector("[data-select-time-helper]");

  if (!list) return;

  const bookingState = readBookingState();
  const dates = Array.isArray(bookingState.dates) ? [...bookingState.dates].sort() : [];
  const storedTimes =
    bookingState && typeof bookingState.times === "object" && bookingState.times !== null
      ? { ...bookingState.times }
      : {};
  const storedSubjects = pruneSubjects(bookingState.subjects, storedTimes);

  if (!dates.length) {
    list.classList.add("select-time-list--empty");
    if (emptyState) {
      emptyState.hidden = false;
    }
    if (helper) {
      helper.textContent = "Head back and choose your dates first.";
    }
    return;
  }

  const bookingData = {
    dates,
    times: {},
    subjects: {},
  };

  let availabilityState = availabilityService.getSnapshot();
  let availabilityUnsubscribe = null;

  const getAvailabilityData = () => {
    const data = availabilityState?.data;
    return data && typeof data === "object" ? data : {};
  };

  const hasAvailabilityError = () => Boolean(availabilityState?.error);

  const getAvailabilityErrorMessage = () => {
    const message = availabilityState?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    return "We’re unable to load availability right now. Please try again shortly.";
  };

  dates.forEach(dateKey => {
    const source = storedTimes[dateKey];
    if (!Array.isArray(source)) return;
    const unique = Array.from(new Set(source)).sort();
    if (unique.length) {
      bookingData.times[dateKey] = unique;
    }
  });

  bookingData.subjects = pruneSubjects(storedSubjects, bookingData.times);

  const hours = getStandardTimeSlots();
  const cards = [];

  const ensureArray = value => (Array.isArray(value) ? value : []);

  const isTimeUnavailable = (dateKey, timeKey) => {
    if (hasAvailabilityError()) return true;
    const availabilityData = getAvailabilityData();
    const day = availabilityData?.[dateKey];
    if (!day) return false;
    return day[timeKey] === false;
  };

  const syncSubjects = () => {
    const cleaned = pruneSubjects(bookingData.subjects, bookingData.times);
    const changed = !subjectsEqual(cleaned, bookingData.subjects);
    bookingData.subjects = cleaned;
    return changed;
  };

  const saveState = () => {
    const subjectsChanged = syncSubjects();
    persistBookingState({
      dates: bookingData.dates,
      times: bookingData.times,
      subjects: bookingData.subjects,
    });
    return subjectsChanged;
  };

  saveState();

  const applyUnlocking = () => {
    const errorActive = hasAvailabilityError();
    if (errorActive) {
      cards.forEach(card => {
        card.classList.add("syncing");
        card.classList.remove("locked");
        card.setAttribute("aria-busy", "true");
        const status = card.querySelector("[data-card-status]");
        if (status) {
          status.textContent = "Reconnecting to availability…";
        }
        const inputs = card.querySelectorAll('input[type="checkbox"]');
        inputs.forEach(input => {
          const option = input.closest(".time-option");
          if (option) {
            option.classList.add("time-option--syncing");
            option.classList.remove("time-option--unavailable");
          }
          input.disabled = true;
        });
      });
      return false;
    }

    let highestUnlocked = 0;
    for (let i = 0; i < bookingData.dates.length; i++) {
      const dateKey = bookingData.dates[i];
      const selections = ensureArray(bookingData.times[dateKey]);
      if (selections.length > 0) {
        highestUnlocked = i + 1;
      } else {
        break;
      }
    }

    let stateModified = false;

    cards.forEach((card, index) => {
      card.classList.remove("syncing");
      card.removeAttribute("aria-busy");
      const status = card.querySelector("[data-card-status]");
      const inputs = card.querySelectorAll('input[type="checkbox"]');
      const dateKey = card.dataset.date;
      const selections = new Set(ensureArray(bookingData.times[dateKey]));
      let removed = false;

      const locked = index > highestUnlocked;
      card.classList.toggle("locked", locked);
      if (status) {
        status.textContent = locked
          ? "Locked until you pick a time above."
          : "Choose one-hour slots for this date.";
      }
      if (locked) {
        inputs.forEach(input => {
          const option = input.closest(".time-option");
          const unavailable = isTimeUnavailable(dateKey, input.value);
          if (option) {
            option.classList.remove("time-option--syncing");
            option.classList.toggle("time-option--unavailable", unavailable);
          }
          if (input.checked) {
            input.checked = false;
            if (selections.delete(input.value)) {
              removed = true;
            }
          }
          input.disabled = true;
        });
      } else {
        inputs.forEach(input => {
          const option = input.closest(".time-option");
          const unavailable = isTimeUnavailable(dateKey, input.value);
          if (option) {
            option.classList.remove("time-option--syncing");
            option.classList.toggle("time-option--unavailable", unavailable);
          }
          if (unavailable) {
            if (input.checked) {
              input.checked = false;
              if (selections.delete(input.value)) {
                removed = true;
              }
            }
            input.disabled = true;
          } else {
            input.disabled = false;
          }
        });
      }

      if (removed) {
        if (selections.size === 0) {
          delete bookingData.times[dateKey];
        } else {
          bookingData.times[dateKey] = Array.from(selections).sort();
        }
        stateModified = true;
      }
    });

    if (syncSubjects()) {
      stateModified = true;
    }

    return stateModified;
  };

  const refreshHelper = () => {
    if (!helper) return;
    if (hasAvailabilityError()) {
      helper.textContent = getAvailabilityErrorMessage();
      return;
    }
    const totalSelections = bookingData.dates.reduce((acc, dateKey) => {
      return acc + ensureArray(bookingData.times[dateKey]).length;
    }, 0);
    if (totalSelections === 0) {
      helper.textContent = "Start with the earliest date and pick your one-hour slots.";
    } else {
      helper.textContent = `${totalSelections} time${totalSelections === 1 ? "" : "s"} selected.`;
    }
  };

  const updateFocusedCard = () => {
    if (!cards.length || !list) return;
    const listRect = list.getBoundingClientRect();
    const center = listRect.top + listRect.height / 2;
    let activeCard = cards[0];
    let minDistance = Infinity;
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < minDistance) {
        minDistance = distance;
        activeCard = card;
      }
    });
    cards.forEach(card => card.classList.toggle("focused", card === activeCard));
  };

  const handleTimeChange = event => {
    const input = event.target;
    const dateKey = input.dataset.date;
    const value = input.value;
    if (!dateKey || !value) return;
    const selections = new Set(ensureArray(bookingData.times[dateKey]));
    if (hasAvailabilityError()) {
      input.checked = selections.has(value);
      return;
    }
    if (isTimeUnavailable(dateKey, value)) {
      input.checked = false;
      return;
    }

    if (input.checked) {
      selections.add(value);
    } else {
      selections.delete(value);
    }
    if (selections.size === 0) {
      delete bookingData.times[dateKey];
    } else {
      bookingData.times[dateKey] = Array.from(selections).sort();
    }

    saveState();
    const modified = applyUnlocking();
    if (modified) {
      saveState();
    }
    refreshHelper();
  };

  dates.forEach((iso, index) => {
    const card = document.createElement("article");
    card.className = "date-card";
    card.dataset.dateCard = "";
    card.dataset.date = iso;

    const dateObject = new Date(`${iso}T00:00:00`);
    const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });
    const fullFormatter = new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const dateColumn = document.createElement("div");
    dateColumn.className = "date-card__date";

    const weekdayEl = document.createElement("span");
    weekdayEl.className = "date-card__weekday";
    weekdayEl.textContent = weekdayFormatter.format(dateObject);

    const fullEl = document.createElement("span");
    fullEl.className = "date-card__full";
    fullEl.textContent = fullFormatter.format(dateObject);

    const statusEl = document.createElement("span");
    statusEl.className = "date-card__status";
    statusEl.dataset.cardStatus = "";
    statusEl.textContent = index === 0
      ? "Choose one-hour slots for this date."
      : "Locked until you pick a time above.";

    dateColumn.appendChild(weekdayEl);
    dateColumn.appendChild(fullEl);
    dateColumn.appendChild(statusEl);

    const timesColumn = document.createElement("div");
    timesColumn.className = "date-card__times";

    const selectedTimes = new Set(ensureArray(bookingData.times[iso]));
    const errorActive = hasAvailabilityError();

    hours.forEach(({ value, display }) => {
      const option = document.createElement("label");
      option.className = "time-option";
      option.dataset.timeOption = "";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.date = iso;
      input.id = `${iso}-${value}`;
      if (errorActive) {
        option.classList.add("time-option--unavailable");
        input.disabled = true;
      } else {
        const unavailable = isTimeUnavailable(iso, value);
        if (unavailable) {
          selectedTimes.delete(value);
          option.classList.add("time-option--unavailable");
        }
        input.disabled = unavailable;
      }
      input.checked = selectedTimes.has(value);
      input.addEventListener("change", handleTimeChange);

      const text = document.createElement("span");
      text.textContent = display;

      option.appendChild(input);
      option.appendChild(text);
      timesColumn.appendChild(option);
    });

    card.appendChild(dateColumn);
    card.appendChild(timesColumn);
    list.appendChild(card);
    cards.push(card);

    if (selectedTimes.size === 0) {
      delete bookingData.times[iso];
    } else {
      bookingData.times[iso] = Array.from(selectedTimes).sort();
    }
  });

  saveState();

  const modifiedByUnlocking = applyUnlocking();
  if (modifiedByUnlocking) {
    saveState();
  }
  refreshHelper();
  updateFocusedCard();

  list.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateFocusedCard);
  });
  window.addEventListener("resize", updateFocusedCard);

  availabilityService.ensureLoaded().catch(() => {});
  availabilityUnsubscribe = availabilityService.subscribe(state => {
    availabilityState = state;
    const modified = applyUnlocking();
    if (modified) {
      saveState();
    }
    refreshHelper();
  });

  window.addEventListener("beforeunload", () => {
    if (typeof availabilityUnsubscribe === "function") {
      availabilityUnsubscribe();
      availabilityUnsubscribe = null;
    }
  });
});

runWhenReady(async () => {
  const subjectsPage = document.querySelector("[data-subjects-page]");
  if (!subjectsPage) return;

  if (!requireAuthForBooking()) {
    return;
  }

  const list = subjectsPage.querySelector("[data-subject-list]");
  const helper = subjectsPage.querySelector("[data-subjects-helper]");
  const emptyState = subjectsPage.querySelector("[data-subjects-empty]");
  const checkoutButton = document.querySelector("[data-subjects-checkout]");

  if (!list || !checkoutButton) return;

  await subjectService.ensureLoaded();
  const subjectOptions = subjectService.getOptions();

  const bookingState = readBookingState();
  const dates = Array.isArray(bookingState.dates) ? [...bookingState.dates].sort() : [];
  const storedTimes =
    bookingState && typeof bookingState.times === "object" && bookingState.times !== null
      ? bookingState.times
      : {};
  const storedSubjects = pruneSubjects(bookingState.subjects, storedTimes);

  const bookingData = {
    dates,
    times: {},
    subjects: {},
  };

  const timeline = [];

  dates.forEach(dateKey => {
    const timeList = storedTimes[dateKey];
    if (!Array.isArray(timeList)) return;
    const uniqueTimes = Array.from(new Set(timeList)).sort();
    if (!uniqueTimes.length) return;
    bookingData.times[dateKey] = uniqueTimes;

    const subjectMap = storedSubjects[dateKey] || {};
    uniqueTimes.forEach(timeValue => {
      timeline.push({ date: dateKey, time: timeValue });
      const storedValue = subjectMap[timeValue];
      if (typeof storedValue === "string" && SUBJECT_VALUE_SET.has(storedValue)) {
        if (!bookingData.subjects[dateKey]) {
          bookingData.subjects[dateKey] = {};
        }
        bookingData.subjects[dateKey][timeValue] = storedValue;
      }
    });
  });

  bookingData.subjects = pruneSubjects(bookingData.subjects, bookingData.times);

  const totalSlots = timeline.length;

  if (!totalSlots) {
    list.classList.add("subjects-list--empty");
    if (emptyState) {
      emptyState.hidden = false;
    }
    if (helper) {
      helper.textContent = "Choose your times first, then come back to pick subjects.";
    }
    checkoutButton.disabled = true;
    checkoutButton.setAttribute("aria-disabled", "true");
    return;
  }

  const saveState = () => {
    bookingData.subjects = pruneSubjects(bookingData.subjects, bookingData.times);
    persistBookingState({ dates: bookingData.dates, times: bookingData.times, subjects: bookingData.subjects });
  };

  saveState();

  const cards = [];
  const cardLookup = new Map();
  const formatterDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const formatterTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const keyFor = (dateKey, timeValue) => `${dateKey}|${timeValue}`;

  const countCompleted = () =>
    timeline.reduce((acc, entry) => {
      const value =
        bookingData.subjects[entry.date] && bookingData.subjects[entry.date][entry.time];
      if (!value) return acc;
      return acc + (subjectService.getOptionById(value) ? 1 : 0);
    }, 0);

  const updateProgress = () => {
    const completed = countCompleted();
    if (helper) {
      if (completed === 0) {
        helper.textContent = "Select a subject for the highlighted session.";
      } else if (completed < totalSlots) {
        helper.textContent = `${completed} of ${totalSlots} sessions have subjects.`;
      } else {
        helper.textContent = "All subjects chosen. You can continue to checkout.";
      }
    }
    const ready = completed === totalSlots;
    checkoutButton.disabled = !ready;
    checkoutButton.setAttribute("aria-disabled", ready ? "false" : "true");
  };

  const updateCardCompletion = card => {
    const dateKey = card.dataset.date;
    const timeValue = card.dataset.time;
    const current =
      bookingData.subjects[dateKey] && bookingData.subjects[dateKey][timeValue];
    const isValid = current ? Boolean(subjectService.getOptionById(current)) : false;
    card.classList.toggle("subject-card--complete", isValid);
  };

  const updateFocusedCard = () => {
    const listRect = list.getBoundingClientRect();
    const center = listRect.top + listRect.height / 2;
    let activeCard = cards[0];
    let minDistance = Infinity;
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < minDistance) {
        minDistance = distance;
        activeCard = card;
      }
    });
    cards.forEach(card => card.classList.toggle("focused", card === activeCard));
  };

  const handleSubjectChange = event => {
    const input = event.target;
    if (input.type !== "radio") return;
    const dateKey = input.dataset.date;
    const timeValue = input.dataset.time;
    const subjectValue = input.value;
    if (!dateKey || !timeValue || !SUBJECT_VALUE_SET.has(subjectValue)) return;

    if (!bookingData.subjects[dateKey]) {
      bookingData.subjects[dateKey] = {};
    }

    if (!subjectService.getOptionById(subjectValue)) {
      delete bookingData.subjects[dateKey][timeValue];
      return;
    }

    bookingData.subjects[dateKey][timeValue] = subjectValue;

    const card = cardLookup.get(keyFor(dateKey, timeValue));
    if (card) {
      updateCardCompletion(card);
    }

    saveState();
    updateProgress();
  };

  timeline.forEach((entry, index) => {
    const card = document.createElement("article");
    card.className = "subject-card";
    card.dataset.subjectCard = "";
    card.dataset.date = entry.date;
    card.dataset.time = entry.time;

    const header = document.createElement("header");
    header.className = "subject-card__header";

    const sequence = document.createElement("span");
    sequence.className = "subject-card__sequence";
    sequence.textContent = `session ${index + 1} of ${totalSlots}`;

    const dateEl = document.createElement("p");
    dateEl.className = "subject-card__date";
    dateEl.textContent = formatterDate.format(new Date(`${entry.date}T00:00:00`));

    const timeEl = document.createElement("p");
    timeEl.className = "subject-card__time";
    timeEl.textContent = formatterTime.format(new Date(`1970-01-01T${entry.time}:00`));

    header.appendChild(sequence);
    header.appendChild(dateEl);
    header.appendChild(timeEl);

    const prompt = document.createElement("p");
    prompt.className = "subject-card__prompt";
    prompt.textContent = "Choose the subject for this session.";

    const options = document.createElement("div");
    options.className = "subject-card__options";

    const storedValue =
      bookingData.subjects[entry.date] && bookingData.subjects[entry.date][entry.time];

    subjectOptions.forEach(option => {
      const label = document.createElement("label");
      label.className = "subject-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `${entry.date}-${entry.time}`;
      input.value = option.value;
      input.dataset.date = entry.date;
      input.dataset.time = entry.time;
      input.checked = storedValue === option.value;
      input.addEventListener("change", handleSubjectChange);

      const text = document.createElement("span");
      if (typeof option.price === "number") {
        text.textContent = `${option.label} (${formatCurrency(option.price, "AUD")})`;
      } else {
        text.textContent = option.label;
      }

      label.appendChild(input);
      label.appendChild(text);
      options.appendChild(label);
    });

    card.appendChild(header);
    card.appendChild(prompt);
    card.appendChild(options);

    list.appendChild(card);
    cards.push(card);
    cardLookup.set(keyFor(entry.date, entry.time), card);
    updateCardCompletion(card);
  });

  updateProgress();
  updateFocusedCard();

  list.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateFocusedCard);
  });
  window.addEventListener("resize", updateFocusedCard);

  checkoutButton.addEventListener("click", () => {
    if (checkoutButton.disabled) return;
    saveState();

    const sessions = timeline.map(entry => {
      const subjectId = bookingData.subjects[entry.date]?.[entry.time] || "";
      const subjectOption = subjectService.getOptionById(subjectId);
      return {
        date: entry.date,
        time: entry.time,
        subjectId,
        subject: subjectOption?.label || subjectId,
        price: subjectOption?.price ?? null,
        priceId: subjectOption?.priceId || "",
      };
    });

    const validSessions = sessions.filter(session => session.subjectId && session.priceId);
    if (!validSessions.length) {
      if (helper) {
        helper.textContent = "Select at least one subject with a valid price.";
      }
      return;
    }

    const totalAmount = validSessions.reduce((acc, session) => {
      return acc + (typeof session.price === "number" ? session.price : 0);
    }, 0);

    const primarySession = validSessions[0];
    const pendingBooking = {
      sessions: validSessions,
      totalAmount,
      currency: "AUD",
      date: primarySession?.date || "",
      time: primarySession?.time || "",
      subject: primarySession?.subject || "",
      price: primarySession?.price || 0,
      priceId: primarySession?.priceId || "",
    };

    try {
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(pendingBooking));
    } catch (error) {
      console.warn("Unable to persist pending booking", error);
    }

    window.location.href = "checkout.html";
  });
});


runWhenReady(() => {
  const bundleGrid = document.querySelector("[data-bundle-grid]");
  const checkoutButton = document.querySelector("[data-bundle-checkout]");
  const selectionText = document.querySelector("[data-bundle-selection]");

  if (!bundleGrid || !checkoutButton || !selectionText) return;

  const selectedBundles = new Map();

  const getBundleSelection = (subject, hours) => {
    const config = BUNDLE_CATALOG.get(subject);
    if (!config) return null;
    const tier = config.tiers.get(Number(hours));
    if (!tier || !tier.priceId) return null;

    return {
      subject,
      subjectId: config.subjectId,
      subjectLabel: config.label,
      hours: tier.hours,
      quantity: tier.quantity,
      priceId: tier.priceId,
      price: tier.price,
      currency: config.currency || "AUD",
    };
  };

  const updateSummary = () => {
    if (!selectedBundles.size) {
      selectionText.textContent = "Start by choosing a bundle option.";
      checkoutButton.disabled = true;
      checkoutButton.setAttribute("aria-disabled", "true");
      return;
    }

    const details = Array.from(selectedBundles.values()).map(bundle => {
      const priceText = typeof bundle.price === "number" ? formatCurrency(bundle.price) : "";
      return `${bundle.subjectLabel} (${bundle.hours}h) ${priceText}`.trim();
    });

    selectionText.textContent = `Selected: ${details.join(", ")}`;
    checkoutButton.disabled = false;
    checkoutButton.setAttribute("aria-disabled", "false");
  };

  const toggleSelection = button => {
    const subject = button.dataset.subject;
    const hours = button.dataset.hours;
    if (!subject || !hours) return;

    const selection = getBundleSelection(subject, hours);
    if (!selection) {
      selectionText.textContent = "Bundle price unavailable. Please choose another option.";
      checkoutButton.disabled = true;
      checkoutButton.setAttribute("aria-disabled", "true");
      return;
    }

    const subjectButtons = bundleGrid.querySelectorAll(`[data-subject="${subject}"]`);
    const alreadyActive = button.classList.contains("is-active");

    subjectButtons.forEach(btn => btn.classList.remove("is-active"));

    if (alreadyActive) {
      selectedBundles.delete(subject);
    } else {
      button.classList.add("is-active");
      selectedBundles.set(subject, selection);
    }

    updateSummary();
  };

  bundleGrid.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("[data-bundle-option]")) return;
    toggleSelection(target);
  });

  checkoutButton.addEventListener("click", () => {
    if (checkoutButton.disabled || !selectedBundles.size) return;

    const bundles = Array.from(selectedBundles.values());
    const totalAmount = bundles.reduce((total, bundle) => total + (typeof bundle.price === "number" ? bundle.price : 0), 0);

    const payload = {
      bundles,
      totalAmount,
      currency: bundles[0]?.currency || "AUD",
      type: "bundle",
    };

    try {
      sessionStorage.setItem(PENDING_BUNDLE_KEY, JSON.stringify(payload));
      sessionStorage.setItem("buan.bundleSelections", JSON.stringify(bundles.map(bundle => ({
        subject: bundle.subject,
        hours: bundle.hours,
      }))));
      clearPendingBooking();
    } catch (error) {
      console.warn("Unable to persist bundle selection", error);
    }

    window.location.href = "checkout.html";
  });

  updateSummary();
});
