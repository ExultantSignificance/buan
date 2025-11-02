const globals = window.buan || {};
const auth = globals.auth;
const runWhenReady = globals.runWhenReady || (callback => callback());
const adminClient = globals.adminClient;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

const toIsoDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeek = source => {
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const sanitizeAvailability = raw => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const cleaned = {};
  Object.keys(source).forEach(dateKey => {
    if (!isoDatePattern.test(dateKey)) return;
    const list = Array.isArray(source[dateKey]) ? source[dateKey] : [];
    const unique = Array.from(new Set(list.filter(entry => timePattern.test(entry))));
    if (unique.length) {
      cleaned[dateKey] = unique.sort();
    }
  });
  return cleaned;
};

const sanitizeSessions = raw => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      id: typeof entry.id === 'string' ? entry.id : String(entry.id || ''),
      studentName: typeof entry.studentName === 'string' ? entry.studentName : 'Student',
      subject: typeof entry.subject === 'string' ? entry.subject : '',
      email: typeof entry.email === 'string' ? entry.email : '',
      phone: typeof entry.phone === 'string' ? entry.phone : '',
      date: typeof entry.date === 'string' ? entry.date : '',
      time: typeof entry.time === 'string' ? entry.time : '',
      status: typeof entry.status === 'string' ? entry.status : 'booked',
      notes: typeof entry.notes === 'string' ? entry.notes : '',
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      canceledAt: typeof entry.canceledAt === 'string' ? entry.canceledAt : '',
    }))
    .filter(entry => isoDatePattern.test(entry.date) && timePattern.test(entry.time));
};

const formatTimeDisplay = (value, formatter) => {
  if (!timePattern.test(value)) return value;
  const date = new Date(`1970-01-01T${value}:00`);
  if (Number.isNaN(date.getTime())) return value;
  return formatter.format(date);
};

const buildSlotOptions = (availability, dateFormatter, timeFormatter) => {
  const dates = Object.keys(availability || {})
    .filter(dateKey => isoDatePattern.test(dateKey))
    .sort();
  const options = [];
  dates.forEach(dateKey => {
    const list = availability[dateKey];
    if (!Array.isArray(list)) return;
    list.slice().sort().forEach(timeValue => {
      if (!timePattern.test(timeValue)) return;
      const label = `${dateFormatter.format(new Date(`${dateKey}T00:00:00`))} · ${formatTimeDisplay(timeValue, timeFormatter)}`;
      options.push({ value: `${dateKey}|${timeValue}`, date: dateKey, time: timeValue, label });
    });
  });
  return options;
};

const compareSessions = (a, b) => {
  const statusWeight = value => (value.status === 'canceled' ? 1 : 0);
  const statusComparison = statusWeight(a) - statusWeight(b);
  if (statusComparison !== 0) return statusComparison;

  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.time !== b.time) return a.time.localeCompare(b.time);
  return (a.studentName || '').localeCompare(b.studentName || '');
};

runWhenReady(() => {
  const page = document.querySelector('[data-admin-availability-page]');
  if (!page) return;

  if (!auth || typeof auth.requireAdmin !== 'function') {
    console.error('Admin availability module requires authentication helpers.');
    return;
  }

  if (!adminClient) {
    console.error('Admin availability module requires an admin API client.');
    return;
  }

  if (!auth.requireAdmin({ redirectTo: 'index.html', signOutOnFailure: true })) {
    return;
  }

  const statusEl = page.querySelector('[data-admin-status]');
  const calendarEl = page.querySelector('[data-availability-calendar]');
  const sessionsEl = page.querySelector('[data-session-list]');
  const availabilityForm = page.querySelector('[data-availability-form]');
  const startInput = page.querySelector('[data-availability-start]');
  const refreshButton = page.querySelector('[data-admin-refresh]');
  const loadingOverlay = page.querySelector('[data-admin-loading]');
  const updatedEl = page.querySelector('[data-admin-updated]');
  const weekButtons = page.querySelectorAll('[data-week-nav]');

  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const calendarHeadingFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const sessionDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const slotDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const updatedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const state = {
    availability: {},
    sessions: [],
    startDate: startOfWeek(new Date()),
    updatedAt: null,
    isSavingAvailability: false,
    pendingSessions: new Set(),
  };

  const showStatus = (type, message) => {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.dataset.status = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.dataset.status = type || 'info';
    statusEl.textContent = message;
  };

  const setPageLoading = isLoading => {
    page.classList.toggle('is-loading', Boolean(isLoading));
    if (loadingOverlay) {
      loadingOverlay.hidden = !isLoading;
    }
  };

  const updateUpdatedAtDisplay = () => {
    if (!updatedEl) return;
    if (!state.updatedAt) {
      updatedEl.textContent = 'Never';
      return;
    }
    const date = new Date(state.updatedAt);
    if (Number.isNaN(date.getTime())) {
      updatedEl.textContent = state.updatedAt;
      return;
    }
    updatedEl.textContent = updatedFormatter.format(date);
  };

  const updateStartInput = () => {
    if (startInput) {
      startInput.value = toIsoDate(state.startDate);
    }
  };

  const updateAvailabilityFormDefaults = () => {
    if (!availabilityForm) return;
    const dateField = availabilityForm.querySelector('[data-availability-date]') || availabilityForm.elements.namedItem('date');
    if (dateField && !dateField.value) {
      dateField.value = toIsoDate(state.startDate);
    }
  };

  const getSessionsForSlot = (date, time) => {
    return state.sessions.filter(entry => entry.date === date && entry.time === time && entry.status !== 'canceled');
  };

  const renderCalendar = () => {
    if (!calendarEl) return;
    updateStartInput();
    updateAvailabilityFormDefaults();

    const todayIso = toIsoDate(new Date());
    calendarEl.innerHTML = '';

    const bookedLookup = new Map();
    state.sessions.forEach(session => {
      if (session.status === 'canceled') return;
      const key = `${session.date}|${session.time}`;
      const list = bookedLookup.get(key) || [];
      list.push(session);
      bookedLookup.set(key, list);
    });

    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(state.startDate);
      date.setDate(date.getDate() + offset);
      const iso = toIsoDate(date);
      const slots = Array.isArray(state.availability[iso]) ? [...state.availability[iso]] : [];
      const bookedCount = state.sessions.filter(session => session.date === iso && session.status !== 'canceled').length;

      const column = document.createElement('article');
      column.className = 'availability-day';
      if (iso === todayIso) {
        column.classList.add('availability-day--today');
      }

      const header = document.createElement('header');
      header.className = 'availability-day__header';

      const heading = document.createElement('h3');
      heading.textContent = calendarHeadingFormatter.format(date);
      header.appendChild(heading);

      const summary = document.createElement('p');
      summary.className = 'availability-day__summary';
      if (slots.length) {
        const slotLabel = slots.length === 1 ? 'slot' : 'slots';
        const bookedLabel = bookedCount === 1 ? 'booked session' : 'booked sessions';
        summary.textContent = `${slots.length} ${slotLabel} · ${bookedCount} ${bookedLabel}`;
      } else {
        summary.textContent = 'No availability scheduled';
      }
      header.appendChild(summary);
      column.appendChild(header);

      const list = document.createElement('ul');
      list.className = 'availability-day__slots';

      if (!slots.length) {
        const empty = document.createElement('li');
        empty.className = 'availability-slot availability-slot--empty';
        empty.textContent = 'Add slots using the form above.';
        list.appendChild(empty);
      } else {
        slots.forEach(timeValue => {
          const slotItem = document.createElement('li');
          slotItem.className = 'availability-slot';

          const booked = bookedLookup.get(`${iso}|${timeValue}`) || [];
          if (booked.length) {
            slotItem.classList.add('availability-slot--booked');
          }

          const timeEl = document.createElement('span');
          timeEl.className = 'availability-slot__time';
          timeEl.textContent = formatTimeDisplay(timeValue, timeFormatter);
          slotItem.appendChild(timeEl);

          if (booked.length) {
            const badge = document.createElement('span');
            badge.className = 'availability-slot__badge';
            badge.textContent = `${booked.length} booked`;
            slotItem.appendChild(badge);

            const tooltip = booked.map(entry => entry.studentName).filter(Boolean).join(', ');
            if (tooltip) {
              slotItem.title = `Booked: ${tooltip}`;
            }
          }

          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'availability-slot__remove';
          removeButton.dataset.removeSlot = '';
          removeButton.dataset.date = iso;
          removeButton.dataset.time = timeValue;
          removeButton.textContent = 'Remove';
          if (booked.length || state.isSavingAvailability) {
            removeButton.disabled = true;
          }
          slotItem.appendChild(removeButton);

          list.appendChild(slotItem);
        });
      }

      column.appendChild(list);
      calendarEl.appendChild(column);
    }
  };

  const renderSessions = () => {
    if (!sessionsEl) return;
    sessionsEl.innerHTML = '';

    const sessions = state.sessions.slice().sort(compareSessions);
    if (!sessions.length) {
      const empty = document.createElement('li');
      empty.className = 'session-list__empty';
      empty.textContent = 'No sessions have been booked yet.';
      sessionsEl.appendChild(empty);
      return;
    }

    const slotOptions = buildSlotOptions(state.availability, slotDateFormatter, timeFormatter);
    const hasSlots = slotOptions.length > 0;

    sessions.forEach(session => {
      const item = document.createElement('li');
      item.className = 'session-card';
      item.dataset.sessionItem = '';
      item.dataset.sessionId = session.id;
      if (session.status === 'canceled') {
        item.classList.add('session-card--canceled');
      }

      const header = document.createElement('header');
      header.className = 'session-card__header';

      const nameEl = document.createElement('h3');
      nameEl.className = 'session-card__name';
      nameEl.textContent = session.studentName || 'Student';
      header.appendChild(nameEl);

      const statusBadge = document.createElement('span');
      statusBadge.className = 'session-card__status';
      statusBadge.dataset.sessionStatus = session.status || 'booked';
      statusBadge.textContent = session.status === 'canceled' ? 'Canceled' : 'Booked';
      header.appendChild(statusBadge);

      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'session-card__meta';

      const dateLabel = document.createElement('p');
      dateLabel.className = 'session-card__datetime';
      dateLabel.textContent = `${sessionDateFormatter.format(new Date(`${session.date}T00:00:00`))} · ${formatTimeDisplay(session.time, timeFormatter)}`;
      meta.appendChild(dateLabel);

      if (session.subject) {
        const subject = document.createElement('p');
        subject.className = 'session-card__subject';
        subject.textContent = session.subject;
        meta.appendChild(subject);
      }

      if (session.email) {
        const email = document.createElement('p');
        email.className = 'session-card__email';
        email.textContent = session.email;
        meta.appendChild(email);
      }

      if (session.phone) {
        const phone = document.createElement('p');
        phone.className = 'session-card__phone';
        phone.textContent = session.phone;
        meta.appendChild(phone);
      }

      item.appendChild(meta);

      if (session.notes) {
        const notes = document.createElement('p');
        notes.className = 'session-card__notes';
        notes.textContent = session.notes;
        item.appendChild(notes);
      }

      if (session.status !== 'canceled') {
        const actions = document.createElement('div');
        actions.className = 'session-card__actions';

        const label = document.createElement('label');
        label.className = 'session-card__move-label';
        label.textContent = 'Move to';

        const select = document.createElement('select');
        select.className = 'session-card__select';
        select.dataset.sessionTarget = '';
        select.name = `session-${session.id}-target`;

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = hasSlots ? 'Select slot' : 'No availability configured';
        placeholder.disabled = !hasSlots;
        placeholder.selected = true;
        select.appendChild(placeholder);

        slotOptions.forEach(option => {
          const opt = document.createElement('option');
          opt.value = option.value;
          opt.textContent = option.label + (option.value === `${session.date}|${session.time}` ? ' (current)' : '');
          select.appendChild(opt);
        });

        if (!hasSlots) {
          select.disabled = true;
        }

        if (state.pendingSessions.has(session.id)) {
          select.disabled = true;
        }

        label.appendChild(select);
        actions.appendChild(label);

        const moveButton = document.createElement('button');
        moveButton.type = 'button';
        moveButton.className = 'admin-button admin-button--primary session-card__action';
        moveButton.dataset.sessionMove = '';
        moveButton.textContent = 'Move Session';
        moveButton.disabled = state.pendingSessions.has(session.id) || !hasSlots;
        actions.appendChild(moveButton);

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'admin-button admin-button--ghost session-card__action session-card__action--danger';
        cancelButton.dataset.sessionCancel = '';
        cancelButton.textContent = 'Cancel Session';
        cancelButton.disabled = state.pendingSessions.has(session.id);
        actions.appendChild(cancelButton);

        item.appendChild(actions);
      } else {
        const canceledMessage = document.createElement('p');
        canceledMessage.className = 'session-card__canceled-at';
        if (session.canceledAt) {
          const canceledDate = new Date(session.canceledAt);
          canceledMessage.textContent = Number.isNaN(canceledDate.getTime())
            ? 'Session canceled.'
            : `Canceled on ${updatedFormatter.format(canceledDate)}`;
        } else {
          canceledMessage.textContent = 'Session canceled.';
        }
        item.appendChild(canceledMessage);
      }

      sessionsEl.appendChild(item);
    });
  };

  const refreshFromServer = async ({ showLoader = false, clearStatus = true } = {}) => {
    if (showLoader) {
      setPageLoading(true);
    }
    try {
      const [availabilityResponse, sessionsResponse] = await Promise.all([
        adminClient.fetchAvailability(),
        adminClient.fetchSessions(),
      ]);
      state.availability = sanitizeAvailability(availabilityResponse && availabilityResponse.availability);
      state.sessions = sanitizeSessions(sessionsResponse && sessionsResponse.sessions);
      state.updatedAt = availabilityResponse && availabilityResponse.updatedAt ? availabilityResponse.updatedAt : null;
      state.pendingSessions.clear();
      renderCalendar();
      renderSessions();
      updateUpdatedAtDisplay();
      if (clearStatus) {
        showStatus('', '');
      }
    } catch (error) {
      console.error('Failed to load admin availability data', error);
      showStatus('error', error.message || 'Unable to load the latest data.');
    } finally {
      if (showLoader) {
        setPageLoading(false);
      }
    }
  };

  const persistAvailability = async () => {
    if (state.isSavingAvailability) return;
    state.isSavingAvailability = true;
    page.classList.add('is-saving-availability');
    try {
      state.availability = sanitizeAvailability(state.availability);
      const response = await adminClient.updateAvailability(state.availability);
      state.availability = sanitizeAvailability(response && response.availability);
      state.updatedAt = response && response.updatedAt ? response.updatedAt : state.updatedAt;
      updateUpdatedAtDisplay();
      showStatus('success', 'Availability updated.');
    } catch (error) {
      console.error('Unable to persist availability', error);
      showStatus('error', error.message || 'Unable to save availability.');
      await refreshFromServer({ showLoader: false, clearStatus: false });
    } finally {
      state.isSavingAvailability = false;
      page.classList.remove('is-saving-availability');
      renderCalendar();
    }
  };

  const addSlot = (date, time) => {
    if (state.isSavingAvailability) {
      showStatus('info', 'Please wait for the current save to finish.');
      return false;
    }
    if (!isoDatePattern.test(date) || !timePattern.test(time)) {
      showStatus('error', 'Choose a valid date and time.');
      return false;
    }
    const slots = new Set(state.availability[date] || []);
    if (slots.has(time)) {
      showStatus('info', 'That slot is already available.');
      return false;
    }
    slots.add(time);
    state.availability[date] = Array.from(slots).sort();
    renderCalendar();
    persistAvailability();
    return true;
  };

  const removeSlot = (date, time) => {
    if (state.isSavingAvailability) {
      showStatus('info', 'Please wait for the current save to finish.');
      return;
    }
    if (!isoDatePattern.test(date) || !timePattern.test(time)) {
      showStatus('error', 'Unable to remove that slot.');
      return;
    }
    if (getSessionsForSlot(date, time).length) {
      showStatus('error', 'You cannot remove a slot that has booked sessions.');
      return;
    }
    const slots = new Set(state.availability[date] || []);
    if (!slots.has(time)) {
      return;
    }
    slots.delete(time);
    if (slots.size === 0) {
      delete state.availability[date];
    } else {
      state.availability[date] = Array.from(slots).sort();
    }
    renderCalendar();
    persistAvailability();
  };

  const applyUpdatedSession = updated => {
    if (!updated || typeof updated !== 'object') return;
    const index = state.sessions.findIndex(entry => entry.id === updated.id);
    if (index >= 0) {
      state.sessions[index] = { ...state.sessions[index], ...updated };
    } else {
      state.sessions.push(updated);
    }
  };

  const performSessionUpdate = async (sessionId, payload, successMessage) => {
    if (!sessionId) return;
    state.pendingSessions.add(sessionId);
    renderSessions();
    try {
      const response = await adminClient.updateSession(sessionId, payload);
      if (response && response.session) {
        const sanitized = sanitizeSessions([response.session]);
        if (sanitized.length) {
          applyUpdatedSession(sanitized[0]);
        }
      }
      if (response && response.updatedAt) {
        state.updatedAt = response.updatedAt;
        updateUpdatedAtDisplay();
      }
      if (successMessage) {
        showStatus('success', successMessage);
      } else {
        showStatus('success', 'Session updated.');
      }
    } catch (error) {
      console.error('Failed to update session', error);
      showStatus('error', error.message || 'Unable to update session.');
    } finally {
      state.pendingSessions.delete(sessionId);
      renderCalendar();
      renderSessions();
    }
  };

  const handleSessionMove = (sessionId, value) => {
    if (!sessionId) return;
    const session = state.sessions.find(entry => entry.id === sessionId);
    if (!session) {
      showStatus('error', 'Session not found.');
      return;
    }
    if (!value) {
      showStatus('error', 'Select an available slot to move the session.');
      return;
    }
    const [date, time] = value.split('|');
    if (!isoDatePattern.test(date) || !timePattern.test(time)) {
      showStatus('error', 'Select a valid availability slot.');
      return;
    }
    if (session.date === date && session.time === time) {
      showStatus('info', 'Choose a different slot to move the session.');
      return;
    }
    performSessionUpdate(sessionId, { date, time }, 'Session moved.');
  };

  const handleSessionCancel = sessionId => {
    if (!sessionId) return;
    const session = state.sessions.find(entry => entry.id === sessionId);
    if (!session) {
      showStatus('error', 'Session not found.');
      return;
    }
    const confirmed = window.confirm('Cancel this session? Students will lose this booking.');
    if (!confirmed) return;
    performSessionUpdate(sessionId, { action: 'cancel' }, 'Session canceled.');
  };

  if (availabilityForm) {
    availabilityForm.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(availabilityForm);
      const dateValue = (formData.get('date') || '').toString().trim();
      const timeValue = (formData.get('time') || '').toString().trim();
      const added = addSlot(dateValue, timeValue);
      if (added) {
        availabilityForm.reset();
        updateAvailabilityFormDefaults();
      }
    });
  }

  if (calendarEl) {
    calendarEl.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-slot]');
      if (!button) return;
      const { date, time } = button.dataset;
      removeSlot(date, time);
    });
  }

  if (sessionsEl) {
    sessionsEl.addEventListener('click', event => {
      const moveButton = event.target.closest('[data-session-move]');
      if (moveButton) {
        const item = moveButton.closest('[data-session-item]');
        const sessionId = item ? item.dataset.sessionId : null;
        const select = item ? item.querySelector('[data-session-target]') : null;
        const value = select ? select.value : '';
        handleSessionMove(sessionId, value);
        return;
      }
      const cancelButton = event.target.closest('[data-session-cancel]');
      if (cancelButton) {
        const item = cancelButton.closest('[data-session-item]');
        const sessionId = item ? item.dataset.sessionId : null;
        handleSessionCancel(sessionId);
      }
    });
  }

  if (startInput) {
    startInput.addEventListener('change', event => {
      const value = event.target.value;
      if (!isoDatePattern.test(value)) return;
      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return;
      state.startDate = startOfWeek(date);
      renderCalendar();
    });
  }

  weekButtons.forEach(button => {
    button.addEventListener('click', () => {
      const direction = button.dataset.weekNav;
      const next = new Date(state.startDate);
      if (direction === 'next') {
        next.setDate(next.getDate() + 7);
      } else if (direction === 'prev') {
        next.setDate(next.getDate() - 7);
      }
      state.startDate = startOfWeek(next);
      renderCalendar();
    });
  });

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      refreshFromServer({ showLoader: true });
    });
  }

  updateStartInput();
  updateAvailabilityFormDefaults();
  refreshFromServer({ showLoader: true });
});
