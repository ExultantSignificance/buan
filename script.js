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
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAv-v8Q_bS3GtcYAAI-3PB4XL1WJv-_shE",
  authDomain: "buantutoring-2d3e9.firebaseapp.com",
  projectId: "buantutoring-2d3e9",
};

const app = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(app);
const firestore = getFirestore(app);

const ADMIN_UID = "ADMIN_FIREBASE_UID";
const HOURLY_RATE = 60;
const CREATE_CHECKOUT_SESSION_URL =
  (window.ENV && window.ENV.CREATE_CHECKOUT_SESSION_URL) ||
  "https://us-central1-buantutoring-2d3e9.cloudfunctions.net/createCheckoutSession";
const STRIPE_PUBLISHABLE_KEY =
  (window.ENV && window.ENV.STRIPE_PUBLISHABLE_KEY) ||
  "YOUR_STRIPE_PUBLISHABLE_KEY";
const PENDING_BOOKING_STORAGE_KEY = "buan.pendingBooking";

// Buttons (make sure these exist in your HTML)
const signupBtn = document.getElementById("signup");
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const statusText = document.getElementById("user-status");

signupBtn?.addEventListener("click", async () => {
  const email = prompt("Email:");
  const pass = prompt("Password:");
  if (!email || !pass) return;
  try {
    await authClient.signUp({ email, password: pass });
  } catch (error) {
    alert(error.message);
  }
});

loginBtn?.addEventListener("click", async () => {
  const email = prompt("Email:");
  const pass = prompt("Password:");
  if (!email || !pass) return;
  try {
    await authClient.signIn({ email, password: pass });
  } catch (error) {
    alert(error.message);
  }
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await authClient.signOut();
  } catch (error) {
    alert(error.message);
  }
});

// ---------- Sign Up ----------
const signupForm = document.querySelector('[data-auth-form="sign-up"]');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const pass = document.getElementById('signup-password').value;

    try {
      await authClient.signUp({ email, password: pass });
      alert('Account created successfully!');
      window.location.href = 'booknow.html';
    } catch (error) {
      alert(error.message);
    }
  });
}

// ---------- Sign In ----------
const signinForm = document.querySelector('[data-auth-form="sign-in"]');
if (signinForm) {
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-email').value;
    const pass = document.getElementById('signin-password').value;

    try {
      await authClient.signIn({ email, password: pass });
      alert('Signed in successfully!');
      window.location.href = 'booknow.html';
    } catch (error) {
      alert(error.message);
    }
  });
}

/*not firebase*/
const BOOKING_STORAGE_KEY = "buan.bookingState";

const SUBJECT_OPTIONS = [
  { value: "specialist-mathematics", label: "Specialist Mathematics" },
  { value: "mathematical-methods", label: "Mathematical Methods" },
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "general-english", label: "General English" },
  { value: "grade-7-9", label: "Grade 7-9" },
];

const SUBJECT_VALUE_SET = new Set(SUBJECT_OPTIONS.map(option => option.value));
const SUBJECT_LABEL_BY_VALUE = SUBJECT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

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

const storePendingBooking = payload => {
  try {
    if (!payload) {
      sessionStorage.removeItem(PENDING_BOOKING_STORAGE_KEY);
    } else {
      sessionStorage.setItem(PENDING_BOOKING_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (error) {
    console.warn("Unable to persist pending booking", error);
  }
};

const readPendingBooking = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_BOOKING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Unable to read pending booking", error);
    return null;
  }
};

const clearPendingBooking = () => {
  try {
    sessionStorage.removeItem(PENDING_BOOKING_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear pending booking", error);
  }
};

let stripeClient = null;

const getStripeClient = () => {
  if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.includes("YOUR_STRIPE_PUBLISHABLE_KEY")) {
    throw new Error("Stripe publishable key is not configured.");
  }
  if (typeof window.Stripe !== "function") {
    throw new Error("Stripe.js has not finished loading.");
  }
  if (!stripeClient) {
    stripeClient = window.Stripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripeClient;
};

const runWhenReady = callback => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
};

const buildRelativeLocation = () => {
  const path = window.location.pathname.replace(/^\//, "");
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  return `${path}${search}${hash}`;
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

const AUTH_DEFAULT_REDIRECT = "booknow.html";
const AUTH_SIGN_OUT_REDIRECT = "index.html";

if (statusText) {
  authClient.subscribe(({ user }) => {
    statusText.textContent = user
      ? `Logged in as ${user.email || "student"}`
      : "Not logged in.";
  });
}

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

  let status = nav.querySelector("[data-auth-status-indicator]");
  if (!status) {
    status = document.createElement("span");
    status.dataset.authStatusIndicator = "";
    status.className = "auth-status";
    status.setAttribute("aria-live", "polite");
    nav.appendChild(status);
  }

  let signOutButton = nav.querySelector("[data-auth-signout]");
  if (!signOutButton) {
    signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.textContent = "Sign Out";
    signOutButton.className = "auth-signout";
    signOutButton.dataset.authSignout = "";
    signOutButton.style.display = "none";
    nav.appendChild(signOutButton);
  }

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

  authClient.subscribe(({ user }) => {
    if (status) {
      status.textContent = user
        ? `Signed in as ${user.name || user.email || "student"}.`
        : "You're browsing as a guest.";
      status.style.display = "block";
    }

    if (signInLink) {
      signInLink.hidden = Boolean(user);
    }

    if (signUpLink) {
      signUpLink.hidden = Boolean(user);
    }

    if (signOutButton) {
      signOutButton.style.display = user ? "block" : "none";
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
  const revealElements = document.querySelectorAll(".review, .about");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  revealElements.forEach(el => observer.observe(el));

  // For elements already visible at load
  revealElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) el.classList.add("visible");
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
  const menu = document.getElementById('menu');
  if (!menu) return;

  let adminLink = menu.querySelector('[data-admin-link]');
  if (!adminLink) {
    adminLink = document.createElement('a');
    adminLink.href = 'admin.html';
    adminLink.dataset.adminLink = '';
    adminLink.textContent = 'Admin';
    adminLink.style.display = 'none';
    menu.appendChild(adminLink);
  }

  authClient.subscribe(({ user }) => {
    const uid = user?.uid || user?.id || '';
    const isAdmin = Boolean(uid) && uid === ADMIN_UID;
    if (adminLink) {
      adminLink.style.display = isAdmin ? '' : 'none';
    }
  });
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

  weekdays.forEach(label => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = label;
    weekdaysContainer.appendChild(el);
  });

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
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
    const dayElements = grid.querySelectorAll(".calendar-day");
    dayElements.forEach(dayEl => {
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
    }
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

    if (validStoredSelections.has(iso)) {
      selectedDates.add(iso);
      const currentCount = weekSelections.get(weekKey) || 0;
      weekSelections.set(weekKey, currentCount + 1);
      dayEl.classList.add("selected");
      dayEl.setAttribute("aria-pressed", "true");
    }

    dayEl.addEventListener("click", () => {
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

  refreshHelper();
  updateWeekRestrictions();
  persistSelections();

  if (selectButton) {
    selectButton.addEventListener("click", () => {
      if (selectButton.disabled) return;
      persistSelections();
      window.location.href = "selecttime.html";
    });
  }
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

  dates.forEach(dateKey => {
    const source = storedTimes[dateKey];
    if (!Array.isArray(source)) return;
    const unique = Array.from(new Set(source)).sort();
    if (unique.length) {
      bookingData.times[dateKey] = unique;
    }
  });

  bookingData.subjects = pruneSubjects(storedSubjects, bookingData.times);

  const buildTimeBlocks = () => {
    const hours = [];
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    for (let hour = 8; hour <= 18; hour++) {
      const value = `${String(hour).padStart(2, "0")}:00`;
      const display = formatter.format(new Date(`1970-01-01T${value}:00`));
      hours.push({ value, display });
    }
    return hours;
  };

  const hours = buildTimeBlocks();
  const cards = [];

  const ensureArray = value => (Array.isArray(value) ? value : []);

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
      const locked = index > highestUnlocked;
      card.classList.toggle("locked", locked);
      const status = card.querySelector("[data-card-status]");
      if (status) {
        status.textContent = locked
          ? "Locked until you pick a time above."
          : "Choose one-hour slots for this date.";
      }
      const inputs = card.querySelectorAll('input[type="checkbox"]');
      if (locked) {
        const dateKey = card.dataset.date;
        const selections = new Set(ensureArray(bookingData.times[dateKey]));
        let removed = false;
        inputs.forEach(input => {
          if (input.checked) {
            input.checked = false;
            if (selections.delete(input.value)) {
              removed = true;
            }
          }
          input.disabled = true;
        });

        if (removed) {
          if (selections.size === 0) {
            delete bookingData.times[dateKey];
          } else {
            bookingData.times[dateKey] = Array.from(selections).sort();
          }
          stateModified = true;
        }
      } else {
        inputs.forEach(input => {
          input.disabled = false;
        });
      }
    });

    if (syncSubjects()) {
      stateModified = true;
    }

    return stateModified;
  };

  const refreshHelper = () => {
    if (!helper) return;
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

    hours.forEach(({ value, display }) => {
      const option = document.createElement("label");
      option.className = "time-option";
      option.dataset.timeOption = "";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.date = iso;
      input.id = `${iso}-${value}`;
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
  });

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
});

runWhenReady(() => {
  const subjectsPage = document.querySelector("[data-subjects-page]");
  if (!subjectsPage) return;

  if (!requireAuthForBooking()) {
    return;
  }

  const list = subjectsPage.querySelector("[data-subject-list]");
  const helper = subjectsPage.querySelector("[data-subjects-helper]");
  const emptyState = subjectsPage.querySelector("[data-subjects-empty]");
  const checkoutButton = document.querySelector("[data-subjects-checkout]");
  const checkoutStatus = document.querySelector("[data-checkout-status]");

  if (!list || !checkoutButton) return;

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

  const setCheckoutMessage = (type, message) => {
    if (!checkoutStatus) return;
    checkoutStatus.dataset.status = type || "";
    checkoutStatus.textContent = message || "";
    checkoutStatus.hidden = !message;
  };

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
      return acc + (value ? 1 : 0);
    }, 0);

  const updateProgress = () => {
    const completed = countCompleted();
    if (helper) {
      if (completed === 0) {
        helper.textContent = "Choose a subject for each session to continue.";
      } else if (completed < totalSlots) {
        helper.textContent = `${completed} of ${totalSlots} sessions selected.`;
      } else {
        helper.textContent = "All subjects chosen. You're ready to check out.";
      }
    }
    const ready = completed === totalSlots;
    checkoutButton.disabled = !ready;
    if (ready) {
      checkoutButton.removeAttribute("aria-disabled");
    } else {
      checkoutButton.setAttribute("aria-disabled", "true");
      setCheckoutMessage("", "");
    }
  };

  const updateCardCompletion = card => {
    const dateKey = card.dataset.date;
    const timeValue = card.dataset.time;
    const current =
      bookingData.subjects[dateKey] && bookingData.subjects[dateKey][timeValue];
    card.classList.toggle("subject-card--complete", Boolean(current));
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

    SUBJECT_OPTIONS.forEach(option => {
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
      text.textContent = option.label;

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

  checkoutButton.addEventListener("click", async () => {
    if (checkoutButton.disabled || checkoutButton.dataset.loading === "true") {
      return;
    }

    const user = authClient.getCurrentUser();
    if (!user) {
      redirectToSignIn();
      return;
    }

    saveState();

    const sessions = timeline.map(entry => {
      const subjectValue = bookingData.subjects[entry.date]?.[entry.time];
      const subjectLabel = SUBJECT_LABEL_BY_VALUE[subjectValue] || "Tutoring session";
      return {
        date: entry.date,
        time: entry.time,
        subject: subjectLabel,
        subjectValue: subjectValue || "",
        duration: 1,
        price: HOURLY_RATE,
      };
    });

    if (!sessions.length) {
      setCheckoutMessage("error", "No sessions found. Choose a time before checking out.");
      return;
    }

    const totalPrice = sessions.reduce((acc, session) => acc + (Number(session.price) || 0), 0);
    const primarySession = sessions[0];
    const booking = {
      userId: user.uid || user.id,
      email: user.email || "",
      subject: primarySession.subject,
      date: primarySession.date,
      time: primarySession.time,
      duration: 1,
      price: totalPrice,
      totalSessions: sessions.length,
      sessions,
    };

    storePendingBooking({ booking, sessions });

    checkoutButton.disabled = true;
    checkoutButton.dataset.loading = "true";
    setCheckoutMessage("info", "Redirecting to secure checkout...");

    try {
      const response = await fetch(CREATE_CHECKOUT_SESSION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking }),
      });

      if (!response.ok) {
        let message = "Unable to start checkout. Please try again.";
        try {
          const errorPayload = await response.json();
          if (errorPayload && typeof errorPayload.error === "string") {
            message = errorPayload.error;
          }
        } catch (error) {
          console.warn("Unable to parse checkout error", error);
        }
        throw new Error(message);
      }

      const payload = await response.json();
      if (!payload || typeof payload.id !== "string") {
        throw new Error("Invalid checkout session response.");
      }

      const stripe = getStripeClient();
      const { error } = await stripe.redirectToCheckout({ sessionId: payload.id });
      if (error) {
        throw new Error(error.message || "Stripe checkout failed to start.");
      }
    } catch (error) {
      console.error("Unable to start Stripe checkout", error);
      setCheckoutMessage("error", error.message || "Unable to start checkout. Please try again.");
      storePendingBooking(null);
      checkoutButton.disabled = false;
      delete checkoutButton.dataset.loading;
    }
  });
});

runWhenReady(() => {
  const successPage = document.querySelector('[data-success-page]');
  if (!successPage) return;

  const summaryList = successPage.querySelector('[data-booking-summary]');
  const totalEl = successPage.querySelector('[data-booking-total]');
  const emptyState = successPage.querySelector('[data-booking-empty]');

  const pending = readPendingBooking();
  const sessions = Array.isArray(pending?.sessions) ? pending.sessions : [];

  const formatterDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const formatterTime = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const formatterCurrency = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'AUD',
  });

  if (!sessions.length || !summaryList) {
    if (summaryList) {
      summaryList.innerHTML = '';
    }
    if (emptyState) {
      emptyState.hidden = false;
    }
    if (totalEl) {
      totalEl.textContent = formatterCurrency.format(0);
    }
    clearPendingBooking();
    return;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  summaryList.innerHTML = '';
  let total = 0;

  sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = 'booking-summary__item';
    const date = session.date ? formatterDate.format(new Date(`${session.date}T00:00:00`)) : 'Scheduled session';
    const time = session.time ? formatterTime.format(new Date(`1970-01-01T${session.time}:00`)) : '';
    const subjectLabel = session.subject || SUBJECT_LABEL_BY_VALUE[session.subjectValue] || 'Tutoring session';
    const price = Number(session.price) || 0;
    total += price;

    li.innerHTML = `
      <div class="booking-summary__subject">${subjectLabel}</div>
      <div class="booking-summary__datetime">${date}${time ? ` · ${time}` : ''}</div>
      <div class="booking-summary__price">${formatterCurrency.format(price)}</div>
    `;
    summaryList.appendChild(li);
  });

  if (totalEl) {
    totalEl.textContent = formatterCurrency.format(total);
  }

  clearPendingBooking();
});

runWhenReady(() => {
  const cancelPage = document.querySelector('[data-cancel-page]');
  if (!cancelPage) return;

  const summaryList = cancelPage.querySelector('[data-booking-summary]');
  const emptyState = cancelPage.querySelector('[data-booking-empty]');
  const retryButton = cancelPage.querySelector('[data-retry-checkout]');

  const pending = readPendingBooking();
  const sessions = Array.isArray(pending?.sessions) ? pending.sessions : [];

  if (retryButton) {
    retryButton.addEventListener('click', () => {
      window.location.href = 'selectsubjects.html';
    });
  }

  if (!summaryList || !sessions.length) {
    if (summaryList) {
      summaryList.innerHTML = '';
    }
    if (emptyState) {
      emptyState.hidden = false;
    }
    return;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  const formatterDate = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const formatterTime = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  summaryList.innerHTML = '';
  sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = 'booking-summary__item';
    const date = session.date ? formatterDate.format(new Date(`${session.date}T00:00:00`)) : 'Scheduled session';
    const time = session.time ? formatterTime.format(new Date(`1970-01-01T${session.time}:00`)) : '';
    const subjectLabel = session.subject || SUBJECT_LABEL_BY_VALUE[session.subjectValue] || 'Tutoring session';

    li.innerHTML = `
      <div class="booking-summary__subject">${subjectLabel}</div>
      <div class="booking-summary__datetime">${date}${time ? ` · ${time}` : ''}</div>
    `;
    summaryList.appendChild(li);
  });
});

runWhenReady(() => {
  const adminPage = document.querySelector('[data-admin-page]');
  if (!adminPage) return;

  const tableBody = adminPage.querySelector('[data-booking-rows]');
  const statusEl = adminPage.querySelector('[data-admin-status]');
  const emptyState = adminPage.querySelector('[data-admin-empty]');
  const filterSelect = adminPage.querySelector('[data-status-filter]');

  if (!tableBody) return;

  let unsubscribe = null;
  let hasRedirected = false;
  let currentFilter = 'all';
  let bookings = [];

  const setStatusMessage = (type, message) => {
    if (!statusEl) return;
    statusEl.dataset.status = type || '';
    statusEl.textContent = message || '';
    statusEl.hidden = !message;
  };

  const stopListening = () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const parseSessions = value => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn('Unable to parse session metadata', error);
        return [];
      }
    }
    return [];
  };

  const render = () => {
    tableBody.innerHTML = '';
    const filtered = bookings.filter(booking => {
      if (currentFilter === 'completed') return booking.completed;
      if (currentFilter === 'pending') return !booking.completed;
      return true;
    });

    if (!filtered.length) {
      if (emptyState) {
        emptyState.hidden = false;
      }
      return;
    }

    if (emptyState) {
      emptyState.hidden = true;
    }

    const formatterDate = new Intl.DateTimeFormat(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const formatterTime = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const formatterCurrency = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'AUD',
    });

    filtered.forEach(booking => {
      const row = document.createElement('tr');
      row.dataset.bookingId = booking.id;

      const createdCell = document.createElement('td');
      createdCell.textContent = booking.createdAt
        ? `${formatterDate.format(booking.createdAt)} · ${formatterTime.format(booking.createdAt)}`
        : '—';

      const sessionCell = document.createElement('td');
      const sessions = parseSessions(booking.sessions);
      if (sessions.length) {
        const list = document.createElement('ul');
        list.className = 'admin-session-list';
        sessions.forEach(session => {
          const item = document.createElement('li');
          const subject = session.subject || SUBJECT_LABEL_BY_VALUE[session.subjectValue] || booking.subject;
          const date = session.date ? formatterDate.format(new Date(`${session.date}T00:00:00`)) : booking.date;
          const time = session.time ? formatterTime.format(new Date(`1970-01-01T${session.time}:00`)) : booking.time;
          item.textContent = `${subject}${date ? ` · ${date}` : ''}${time ? ` · ${time}` : ''}`;
          list.appendChild(item);
        });
        sessionCell.appendChild(list);
      } else {
        const subject = booking.subject || 'Tutoring session';
        const date = booking.date ? formatterDate.format(new Date(`${booking.date}T00:00:00`)) : '';
        const time = booking.time ? formatterTime.format(new Date(`1970-01-01T${booking.time}:00`)) : '';
        sessionCell.textContent = `${subject}${date ? ` · ${date}` : ''}${time ? ` · ${time}` : ''}`;
      }

      const emailCell = document.createElement('td');
      emailCell.textContent = booking.email || '—';

      const priceCell = document.createElement('td');
      priceCell.textContent = formatterCurrency.format(booking.price || 0);

      const statusCell = document.createElement('td');
      statusCell.textContent = booking.completed ? 'Completed' : 'Scheduled';

      const actionCell = document.createElement('td');
      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'admin-toggle';
      toggleButton.textContent = booking.completed ? 'Mark as scheduled' : 'Mark as completed';
      toggleButton.addEventListener('click', async () => {
        toggleButton.disabled = true;
        try {
          const bookingRef = doc(firestore, 'bookings', booking.id);
          await updateDoc(bookingRef, { completed: !booking.completed });
          setStatusMessage('success', 'Booking updated.');
          window.setTimeout(() => setStatusMessage('', ''), 1500);
        } catch (error) {
          console.error('Unable to update booking', error);
          setStatusMessage('error', 'Unable to update booking. Please try again.');
        } finally {
          toggleButton.disabled = false;
        }
      });
      actionCell.appendChild(toggleButton);

      row.appendChild(createdCell);
      row.appendChild(sessionCell);
      row.appendChild(emailCell);
      row.appendChild(priceCell);
      row.appendChild(statusCell);
      row.appendChild(actionCell);

      tableBody.appendChild(row);
    });
  };

  const startListening = () => {
    if (unsubscribe) return;
    const bookingsRef = collection(firestore, 'bookings');
    const bookingsQuery = query(bookingsRef, orderBy('createdAt', 'desc'));
    unsubscribe = onSnapshot(
      bookingsQuery,
      snapshot => {
        bookings = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
          return {
            id: docSnap.id,
            subject: data.subject || 'Tutoring session',
            date: data.date || '',
            time: data.time || '',
            email: data.email || '',
            price: Number(data.price) || 0,
            totalSessions: Number(data.totalSessions) || 1,
            sessions: data.sessions || [],
            paid: Boolean(data.paid),
            completed: Boolean(data.completed),
            createdAt,
          };
        });
        setStatusMessage('', '');
        render();
      },
      error => {
        console.error('Unable to fetch bookings', error);
        setStatusMessage('error', 'Unable to load bookings. Please try again.');
      },
    );
  };

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      currentFilter = filterSelect.value || 'all';
      render();
    });
  }

  authClient.subscribe(({ user }) => {
    if (!user) {
      bookings = [];
      render();
      stopListening();
      if (!hasRedirected) {
        hasRedirected = true;
        setStatusMessage('info', 'Please sign in to view bookings.');
        window.setTimeout(() => {
          redirectToSignIn();
        }, 500);
      }
      return;
    }

    const uid = user.uid || user.id;
    if (uid !== ADMIN_UID) {
      bookings = [];
      render();
      stopListening();
      if (!hasRedirected) {
        hasRedirected = true;
        setStatusMessage('error', 'You do not have access to the admin dashboard.');
        window.setTimeout(() => {
          window.location.replace('signin.html');
        }, 800);
      }
      return;
    }

    setStatusMessage('', '');
    startListening();
  });
});

