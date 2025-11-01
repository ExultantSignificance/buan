const BOOKING_STORAGE_KEY = "buan.bookingState";

const SUBJECT_OPTIONS = [
  { id: "specialist-mathematics", label: "Specialist Mathematics", rate: 60 },
  { id: "mathematical-methods", label: "Mathematical Methods", rate: 55 },
  { id: "physics", label: "Physics", rate: 50 },
  { id: "chemistry", label: "Chemistry", rate: 50 },
  { id: "general-english", label: "General English", rate: 40 },
];

const VALID_SUBJECT_IDS = new Set(SUBJECT_OPTIONS.map(option => option.id));

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

const cloneSubjectState = raw => {
  const clone = {};
  if (!raw || typeof raw !== "object") {
    return clone;
  }
  Object.entries(raw).forEach(([dateKey, mapping]) => {
    if (!mapping || typeof mapping !== "object") return;
    clone[dateKey] = { ...mapping };
  });
  return clone;
};

const pruneSubjectState = (subjectState, validDates, timeLookup) => {
  const dateSet = new Set(validDates);
  Object.keys(subjectState).forEach(dateKey => {
    if (!dateSet.has(dateKey)) {
      delete subjectState[dateKey];
      return;
    }
    const mapping = subjectState[dateKey];
    if (!mapping || typeof mapping !== "object") {
      delete subjectState[dateKey];
      return;
    }
    const allowedTimes = new Set(Array.isArray(timeLookup[dateKey]) ? timeLookup[dateKey] : []);
    Object.keys(mapping).forEach(timeKey => {
      if (!allowedTimes.has(timeKey) || !VALID_SUBJECT_IDS.has(mapping[timeKey])) {
        delete mapping[timeKey];
      }
    });
    if (Object.keys(mapping).length === 0) {
      delete subjectState[dateKey];
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
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
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('menu');

  if (hamburger && menu) {
    hamburger.addEventListener('click', () => {
      menu.classList.toggle('active');
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
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

document.addEventListener("DOMContentLoaded", () => {
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
  const storedDateList = Array.isArray(bookingState.dates) ? [...bookingState.dates] : [];
  const storedSubjects = cloneSubjectState(bookingState.subjects);

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

  const getWeekKey = date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    return d.toISOString().split("T")[0];
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
      } else if (Array.isArray(storedTimes[dateKey])) {
        storedTimes[dateKey] = Array.from(new Set(storedTimes[dateKey])).sort();
      }
    });
    pruneSubjectState(storedSubjects, orderedDates, storedTimes);
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
    const iso = date.toISOString().split("T")[0];
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

document.addEventListener("DOMContentLoaded", () => {
  const selectTimePage = document.querySelector("[data-select-time-page]");
  if (!selectTimePage) return;

  const list = selectTimePage.querySelector("[data-date-list]");
  const emptyState = selectTimePage.querySelector("[data-empty-state]");
  const helper = selectTimePage.querySelector("[data-select-time-helper]");
  const subjectsButton = selectTimePage.querySelector("[data-choose-subjects]");
  const previousButton = selectTimePage.querySelector("[data-nav-previous]");
  const nextButton = selectTimePage.querySelector("[data-nav-forward]");

  if (!list) return;

  const bookingState = readBookingState();
  const dates = Array.isArray(bookingState.dates) ? [...bookingState.dates].sort() : [];
  const storedTimes =
    bookingState && typeof bookingState.times === "object" && bookingState.times !== null
      ? { ...bookingState.times }
      : {};
  const storedSubjects = cloneSubjectState(bookingState.subjects);

  const buildFilteredTimes = () => {
    const filtered = {};
    dates.forEach(dateKey => {
      const source = storedTimes[dateKey];
      if (!Array.isArray(source)) return;
      const unique = Array.from(new Set(source)).sort();
      if (unique.length) {
        filtered[dateKey] = unique;
      }
    });
    return filtered;
  };

  const directNavToSubjects = () => {
    const filteredTimes = buildFilteredTimes();
    const sanitizedSubjects = cloneSubjectState(storedSubjects);
    pruneSubjectState(sanitizedSubjects, dates, filteredTimes);
    persistBookingState({
      dates,
      times: filteredTimes,
      subjects: sanitizedSubjects,
    });
    window.location.href = "selectsubjects.html";
  };

  if (!dates.length) {
    list.classList.add("select-time-list--empty");
    if (emptyState) {
      emptyState.hidden = false;
    }
    if (helper) {
      helper.textContent = "Head back and choose your dates first.";
    }
    if (subjectsButton) {
      subjectsButton.addEventListener("click", event => {
        event.preventDefault();
        directNavToSubjects();
      });
    }
    if (nextButton) {
      nextButton.addEventListener("click", event => {
        event.preventDefault();
        directNavToSubjects();
      });
    }
    if (previousButton) {
      previousButton.addEventListener("click", event => {
        event.preventDefault();
        window.location.href = "standardbooking.html";
      });
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

  const initialSubjects = cloneSubjectState(storedSubjects);
  pruneSubjectState(initialSubjects, bookingData.dates, bookingData.times);
  bookingData.subjects = initialSubjects;

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

  const cleanupSubjects = () => {
    pruneSubjectState(bookingData.subjects, bookingData.dates, bookingData.times);
  };

  const saveState = () => {
    cleanupSubjects();
    persistBookingState({
      dates: bookingData.dates,
      times: bookingData.times,
      subjects: bookingData.subjects,
    });
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
      delete bookingData.subjects[dateKey];
    } else {
      bookingData.times[dateKey] = Array.from(selections).sort();
      const subjectMap = bookingData.subjects[dateKey];
      if (subjectMap && typeof subjectMap === "object") {
        Object.keys(subjectMap).forEach(timeKey => {
          if (!selections.has(timeKey) || !VALID_SUBJECT_IDS.has(subjectMap[timeKey])) {
            delete subjectMap[timeKey];
          }
        });
        if (Object.keys(subjectMap).length === 0) {
          delete bookingData.subjects[dateKey];
        }
      }
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

  const goToSubjects = () => {
    saveState();
    window.location.href = "selectsubjects.html";
  };

  if (subjectsButton) {
    subjectsButton.addEventListener("click", event => {
      event.preventDefault();
      goToSubjects();
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", event => {
      event.preventDefault();
      goToSubjects();
    });
  }
  if (previousButton) {
    previousButton.addEventListener("click", event => {
      event.preventDefault();
      saveState();
      window.location.href = "standardbooking.html";
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const selectSubjectsPage = document.querySelector("[data-select-subjects-page]");
  if (!selectSubjectsPage) return;

  const list = selectSubjectsPage.querySelector("[data-subject-list]");
  const emptyState = selectSubjectsPage.querySelector("[data-subject-empty]");
  const helper = selectSubjectsPage.querySelector("[data-subject-helper]");
  const checkoutButton = selectSubjectsPage.querySelector("[data-go-checkout]");
  const previousButton = selectSubjectsPage.querySelector("[data-nav-back]");
  const nextButton = selectSubjectsPage.querySelector("[data-nav-forward]");

  if (!list) return;

  let persistBeforeNav = () => {};

  if (previousButton) {
    previousButton.addEventListener("click", event => {
      event.preventDefault();
      persistBeforeNav();
      window.location.href = "selecttime.html";
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", event => {
      event.preventDefault();
      persistBeforeNav();
      window.location.href = "standardbooking.html";
    });
  }

  const bookingState = readBookingState();
  const orderedDates = Array.isArray(bookingState.dates) ? [...bookingState.dates] : [];
  const storedTimes =
    bookingState && typeof bookingState.times === "object" && bookingState.times !== null
      ? bookingState.times
      : {};
  const storedSubjects = cloneSubjectState(bookingState.subjects);

  const timesByDate = {};
  const datesWithTimes = [];

  orderedDates.forEach(dateKey => {
    const source = storedTimes[dateKey];
    if (!Array.isArray(source)) return;
    const unique = Array.from(new Set(source)).sort();
    if (unique.length === 0) return;
    timesByDate[dateKey] = unique;
    datesWithTimes.push(dateKey);
  });

  if (!datesWithTimes.length) {
    list.hidden = true;
    if (emptyState) {
      emptyState.hidden = false;
    }
    if (helper) {
      helper.textContent = "Choose your times first, then come back to assign subjects.";
    }
    if (checkoutButton) {
      checkoutButton.disabled = true;
    }
    return;
  }

  list.hidden = false;
  if (emptyState) {
    emptyState.hidden = true;
  }

  pruneSubjectState(storedSubjects, orderedDates, timesByDate);

  const bookingData = {
    dates: orderedDates,
    times: timesByDate,
    subjects: storedSubjects,
  };

  const cards = [];

  const ensureArray = value => (Array.isArray(value) ? value : []);

  const ensureSubjectMap = dateKey => {
    if (!bookingData.subjects[dateKey] || typeof bookingData.subjects[dateKey] !== "object") {
      bookingData.subjects[dateKey] = {};
    }
    return bookingData.subjects[dateKey];
  };

  const cleanupSubjects = () => {
    pruneSubjectState(bookingData.subjects, bookingData.dates, bookingData.times);
  };

  const saveState = () => {
    cleanupSubjects();
    persistBookingState({
      dates: bookingData.dates,
      times: bookingData.times,
      subjects: bookingData.subjects,
    });
  };

  persistBeforeNav = saveState;

  saveState();

  const updateOptionHighlight = container => {
    const options = container.querySelectorAll(".subject-option");
    options.forEach(option => {
      const input = option.querySelector('input[type="radio"]');
      option.classList.toggle("selected", Boolean(input && input.checked));
    });
  };

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const currencyFormatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });

  const computeTotals = () => {
    const totalSlots = datesWithTimes.reduce((total, dateKey) => {
      return total + ensureArray(bookingData.times[dateKey]).length;
    }, 0);
    const assigned = datesWithTimes.reduce((total, dateKey) => {
      const times = ensureArray(bookingData.times[dateKey]);
      const subjectMap = bookingData.subjects[dateKey];
      if (!subjectMap || typeof subjectMap !== "object") return total;
      return (
        total +
        times.reduce((count, timeKey) => {
          const value = subjectMap[timeKey];
          return count + (VALID_SUBJECT_IDS.has(value) ? 1 : 0);
        }, 0)
      );
    }, 0);
    return { totalSlots, assigned };
  };

  const refreshHelper = () => {
    const { totalSlots, assigned } = computeTotals();
    if (helper) {
      if (totalSlots === 0) {
        helper.textContent = "Choose your times first, then come back to assign subjects.";
      } else if (assigned === 0) {
        helper.textContent = "Start with the earliest date and pick a subject for each slot.";
      } else if (assigned < totalSlots) {
        const remaining = totalSlots - assigned;
        helper.textContent = `${remaining} slot${remaining === 1 ? "" : "s"} left to tag with a subject.`;
      } else {
        helper.textContent = "All subjects selected. You're ready for checkout.";
      }
    }
    const disableCheckout = totalSlots === 0 || assigned < totalSlots;
    if (checkoutButton) {
      checkoutButton.disabled = disableCheckout;
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

  const applyUnlocking = () => {
    let highestUnlocked = 0;
    for (let i = 0; i < datesWithTimes.length; i++) {
      const dateKey = datesWithTimes[i];
      const times = ensureArray(bookingData.times[dateKey]);
      if (times.length === 0) break;
      const subjectMap = bookingData.subjects[dateKey] || {};
      const complete = times.every(timeKey => VALID_SUBJECT_IDS.has(subjectMap?.[timeKey]));
      if (complete) {
        highestUnlocked = i + 1;
      } else {
        break;
      }
    }

    let modified = false;

    cards.forEach((card, index) => {
      const locked = index > highestUnlocked;
      card.classList.toggle("locked", locked);
      const status = card.querySelector("[data-card-status]");
      if (status) {
        status.textContent = locked
          ? "Locked until you assign subjects above."
          : "Pick subjects for each slot.";
      }
      const inputs = card.querySelectorAll('input[type="radio"]');
      if (locked) {
        const dateKey = card.dataset.date;
        const subjectMap = bookingData.subjects[dateKey];
        inputs.forEach(input => {
          if (input.checked) {
            input.checked = false;
            const timeKey = input.dataset.time;
            if (subjectMap && subjectMap[timeKey] === input.value) {
              delete subjectMap[timeKey];
              modified = true;
            }
          }
          input.disabled = true;
          const option = input.closest(".subject-option");
          if (option) option.classList.remove("selected");
        });
        if (subjectMap && typeof subjectMap === "object") {
          const allowedTimes = new Set(ensureArray(bookingData.times[dateKey]));
          Object.keys(subjectMap).forEach(timeKey => {
            if (!allowedTimes.has(timeKey) || !VALID_SUBJECT_IDS.has(subjectMap[timeKey])) {
              delete subjectMap[timeKey];
              modified = true;
            }
          });
          if (Object.keys(subjectMap).length === 0) {
            delete bookingData.subjects[dateKey];
          }
        }
      } else {
        inputs.forEach(input => {
          input.disabled = false;
        });
      }
    });

    return modified;
  };

  datesWithTimes.forEach((iso, index) => {
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
      ? "Pick subjects for each slot."
      : "Locked until you assign subjects above.";

    dateColumn.appendChild(weekdayEl);
    dateColumn.appendChild(fullEl);
    dateColumn.appendChild(statusEl);

    const slotsColumn = document.createElement("div");
    slotsColumn.className = "date-card__times";

    const subjectMap = bookingData.subjects[iso] || {};

    ensureArray(bookingData.times[iso]).forEach(timeValue => {
      const slot = document.createElement("div");
      slot.className = "subject-slot";

      const timeLabel = document.createElement("span");
      timeLabel.className = "subject-slot__time";
      timeLabel.textContent = formatter.format(new Date(`1970-01-01T${timeValue}:00`));

      const optionsWrapper = document.createElement("div");
      optionsWrapper.className = "subject-slot__options";

      SUBJECT_OPTIONS.forEach(option => {
        const optionLabel = document.createElement("label");
        optionLabel.className = "subject-option";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = `${iso}-${timeValue}`;
        input.value = option.id;
        input.dataset.date = iso;
        input.dataset.time = timeValue;
        input.checked = subjectMap[timeValue] === option.id;
        input.addEventListener("change", event => {
          const target = event.target;
          const dateKey = target.dataset.date;
          const timeKey = target.dataset.time;
          const subjectId = target.value;
          if (!dateKey || !timeKey || !VALID_SUBJECT_IDS.has(subjectId)) return;
          const map = ensureSubjectMap(dateKey);
          map[timeKey] = subjectId;
          const slotContainer = target.closest(".subject-slot");
          if (slotContainer) updateOptionHighlight(slotContainer);
          saveState();
          const modified = applyUnlocking();
          if (modified) {
            saveState();
          }
          refreshHelper();
        });

        const textWrapper = document.createElement("span");
        textWrapper.className = "subject-option__label";

        const nameEl = document.createElement("span");
        nameEl.className = "subject-option__name";
        nameEl.textContent = option.label;

        const rateEl = document.createElement("span");
        rateEl.className = "subject-option__rate";
        rateEl.textContent = `${currencyFormatter.format(option.rate)} per hour`;

        textWrapper.appendChild(nameEl);
        textWrapper.appendChild(rateEl);

        optionLabel.appendChild(input);
        optionLabel.appendChild(textWrapper);
        optionsWrapper.appendChild(optionLabel);
      });

      slot.appendChild(timeLabel);
      slot.appendChild(optionsWrapper);
      slotsColumn.appendChild(slot);
      updateOptionHighlight(slot);
    });

    card.appendChild(dateColumn);
    card.appendChild(slotsColumn);
    list.appendChild(card);
    cards.push(card);
  });

  const modified = applyUnlocking();
  if (modified) {
    saveState();
  }
  refreshHelper();
  updateFocusedCard();

  list.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateFocusedCard);
  });
  window.addEventListener("resize", updateFocusedCard);

  if (checkoutButton) {
    checkoutButton.addEventListener("click", () => {
      if (checkoutButton.disabled) return;
      saveState();
      window.location.href = "checkout.html";
    });
  }

  if (previousButton) {
    previousButton.addEventListener("click", event => {
      event.preventDefault();
      saveState();
      window.location.href = "selecttime.html";
    });
  }
});
