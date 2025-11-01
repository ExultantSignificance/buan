const BOOKING_STORAGE_KEY = "buan.bookingState";

const SUBJECT_OPTIONS = [
  { value: "specialist-methods", label: "Specialist, Methods" },
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "general-english", label: "General English" },
  { value: "grade-7-9", label: "Grade 7-9" },
];

const SUBJECT_VALUE_SET = new Set(SUBJECT_OPTIONS.map(option => option.value));

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

const runWhenReady = callback => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
};

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

  const list = subjectsPage.querySelector("[data-subject-list]");
  const helper = subjectsPage.querySelector("[data-subjects-helper]");
  const emptyState = subjectsPage.querySelector("[data-subjects-empty]");
  const checkoutButton = document.querySelector("[data-subjects-checkout]");

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

  checkoutButton.addEventListener("click", () => {
    if (checkoutButton.disabled) return;
    saveState();
    window.location.href = "checkout.html";
  });
});
