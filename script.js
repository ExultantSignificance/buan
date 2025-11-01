const BOOKING_STORAGE_KEY = "buan.bookingState";

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
      }
    });
    persistBookingState({ dates: orderedDates, times: storedTimes });
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

  if (!list) return;

  const bookingState = readBookingState();
  const dates = Array.isArray(bookingState.dates) ? [...bookingState.dates].sort() : [];
  const storedTimes =
    bookingState && typeof bookingState.times === "object" && bookingState.times !== null
      ? { ...bookingState.times }
      : {};

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
  };

  dates.forEach(dateKey => {
    const source = storedTimes[dateKey];
    if (!Array.isArray(source)) return;
    const unique = Array.from(new Set(source)).sort();
    if (unique.length) {
      bookingData.times[dateKey] = unique;
    }
  });

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

  const saveState = () => {
    persistBookingState({ dates: bookingData.dates, times: bookingData.times });
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
