import Stripe from "stripe";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const SUCCESS_URL = "https://buantutoring.online/success.html";
const CANCEL_URL = "https://buantutoring.online/cancel.html";
const ADMIN_FIREBASE_UID = process.env.ADMIN_FIREBASE_UID || "g3RWfVUte6bvIcXXim7rvNhv4hL2";

const PRICE_EVENT_TYPES = new Set(["price.created", "price.updated"]);
const BUNDLE_PRICING_COLLECTION = "bundlePricing";

const BUNDLE_SUBJECT_KEYS = [
  "bundle_subject",
  "bundleSubject",
  "subject",
  "subject_key",
  "subjectId",
  "subject_id",
];

const BUNDLE_SUBJECT_ID_KEYS = [
  "bundle_subject_id",
  "bundleSubjectId",
  "subjectId",
  "subject_id",
];

const BUNDLE_SUBJECT_LABEL_KEYS = [
  "bundle_subject_label",
  "bundleSubjectLabel",
  "subjectLabel",
  "label",
];

const BUNDLE_HOURS_KEYS = [
  "bundle_hours",
  "bundleHours",
  "hours",
  "bundle_tier_hours",
  "tier_hours",
  "bundleTier",
];

const setCors = res => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const trimMetadataValue = value => {
  if (typeof value !== "string") {
    return "";
  }
  return value.length > 500 ? value.slice(0, 500) : value;
};

const normaliseStripeCurrency = currency => {
  if (typeof currency !== "string") return null;
  const trimmed = currency.trim();
  return trimmed ? trimmed.toUpperCase() : null;
};

const buildPriceUpdatePayload = price => {
  if (!price || typeof price !== "object") return null;
  const payload = {};
  if (typeof price.unit_amount === "number") {
    payload.price = price.unit_amount / 100;
  }
  const currency = normaliseStripeCurrency(price.currency);
  if (currency) {
    payload.currency = currency;
  }
  return Object.keys(payload).length ? payload : null;
};

const updateSubjectsForStripePrice = async price => {
  const priceId = price?.id;
  if (!priceId) return;

  const updatePayload = buildPriceUpdatePayload(price);
  if (!updatePayload) return;

  try {
    const snapshot = await db.collection("subjects").where("priceId", "==", priceId).get();
    if (snapshot.empty) {
      return;
    }
    const updates = snapshot.docs.map(docSnapshot =>
      docSnapshot.ref.update(updatePayload).catch(error => {
        console.error(`Unable to update subject ${docSnapshot.id} for price ${priceId}`, error);
      })
    );
    await Promise.all(updates);
  } catch (error) {
    console.error(`Unable to sync price ${priceId} to subjects`, error);
  }
};

const readMetadataValue = (price, keys) => {
  if (!price || !Array.isArray(keys)) return null;
  for (const key of keys) {
    const metadata = price.metadata && typeof price.metadata === "object" ? price.metadata : null;
    if (metadata && metadata[key] != null) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && !Number.isNaN(value)) return value;
    }
  }
  return null;
};

const readPriceMetadataValue = (price, keys) => {
  if (!price || !Array.isArray(keys)) return null;
  let value = readMetadataValue(price, keys);
  if (value) return value;
  const product = price.product && typeof price.product === "object" ? price.product : null;
  if (product) {
    value = readMetadataValue(product, keys);
  }
  return value;
};

const normaliseBundleSubjectKey = value => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
};

const parseHoursValue = value => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const direct = Number(value.trim());
    if (!Number.isNaN(direct)) return direct;
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = Number(match[1]);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
};

const ensureExpandedPrice = async price => {
  if (!price?.id) return price;
  if (price.product && typeof price.product === "object" && price.product.metadata) {
    return price;
  }
  try {
    return await stripe.prices.retrieve(price.id, { expand: ["product"] });
  } catch (error) {
    console.warn(`Unable to expand Stripe price ${price.id}`, error);
    return price;
  }
};

const buildBundlePricingPayload = price => {
  if (!price) return null;

  const subjectValue = readPriceMetadataValue(price, BUNDLE_SUBJECT_KEYS);
  const hoursValue = readPriceMetadataValue(price, BUNDLE_HOURS_KEYS);
  if (!subjectValue || hoursValue == null) {
    return null;
  }

  const hours = parseHoursValue(hoursValue);
  if (!hours) return null;

  const subjectIdValue = readPriceMetadataValue(price, BUNDLE_SUBJECT_ID_KEYS) || subjectValue;
  const subjectKey = normaliseBundleSubjectKey(subjectValue) || normaliseBundleSubjectKey(subjectIdValue);
  if (!subjectKey) return null;

  const subjectId = normaliseBundleSubjectKey(subjectIdValue) || subjectKey;
  const subjectLabel = readPriceMetadataValue(price, BUNDLE_SUBJECT_LABEL_KEYS) || subjectValue;
  const currency = normaliseStripeCurrency(price.currency) || "AUD";
  const unitAmount = typeof price.unit_amount === "number" ? price.unit_amount : null;

  const payload = {
    subject: subjectKey,
    subjectId,
    subjectLabel,
    hours,
    priceId: price.id,
    unitAmount,
    currency,
    amount: unitAmount != null ? unitAmount / 100 : null,
    productId: typeof price.product === "string" ? price.product : price.product?.id || null,
    lookupKey: typeof price.lookup_key === "string" ? price.lookup_key : null,
    active: Boolean(price.active),
    updatedAt: new Date().toISOString(),
  };

  return payload;
};

const updateBundlePricingForStripePrice = async price => {
  if (!price?.id) return false;
  let payload = buildBundlePricingPayload(price);
  if (!payload) {
    const expanded = await ensureExpandedPrice(price);
    payload = buildBundlePricingPayload(expanded);
  }
  if (!payload) return false;

  const key = `${payload.subjectId || payload.subject}_${payload.hours}`;

  try {
    await db.collection(BUNDLE_PRICING_COLLECTION).doc(key).set(payload, { merge: true });
    return true;
  } catch (error) {
    console.error(`Unable to update bundle pricing for price ${price.id}`, error);
    return false;
  }
};

const verifyAdminRequest = async req => {
  const header = req.headers["authorization"] || req.headers["Authorization"] || "";
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new Error("Missing credentials");
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new Error("Missing credentials");
  }
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded?.uid !== ADMIN_FIREBASE_UID) {
    throw new Error("Forbidden");
  }
  return decoded;
};

const summariseSessions = sessions => {
  if (!Array.isArray(sessions) || !sessions.length) {
    return "";
  }
  const summary = sessions
    .map(session => {
      const subject = session.subject || session.subjectId || "Session";
      const date = session.date || "";
      const time = session.time || "";
      return `${subject} @ ${date} ${time}`.trim();
    })
    .join(" | ");
  return trimMetadataValue(summary);
};

const summariseBundles = bundles => {
  if (!Array.isArray(bundles) || !bundles.length) {
    return "";
  }
  const summary = bundles
    .map(bundle => {
      const subject = bundle.subjectLabel || bundle.subject || "Bundle";
      const hours = bundle.hours || bundle.quantity || "";
      return `${subject} (${hours}h)`;
    })
    .join(" | ");
  return trimMetadataValue(summary);
};

export const createCheckoutSession = onRequest(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { booking, uiMode, customerEmail, userId } = req.body || {};
    if (!booking || typeof booking !== "object") {
      res.status(400).json({ error: "A booking payload is required." });
      return;
    }

    const sessions = Array.isArray(booking.sessions) ? booking.sessions : [];
    const bundles = Array.isArray(booking.bundles) ? booking.bundles : [];
    const lineItems = [];

    sessions.forEach(session => {
      if (session && typeof session.priceId === "string" && session.priceId) {
        lineItems.push({ price: session.priceId, quantity: 1 });
      }
    });

    bundles.forEach(bundle => {
      if (bundle && typeof bundle.priceId === "string" && bundle.priceId) {
        const quantity = Math.max(1, Math.floor(typeof bundle.quantity === "number" ? bundle.quantity : (bundle.hours || 1)));
        lineItems.push({ price: bundle.priceId, quantity });
      }
    });

    if (!lineItems.length && typeof booking.priceId === "string" && booking.priceId) {
      lineItems.push({ price: booking.priceId, quantity: 1 });
    }

    if (!lineItems.length) {
      res.status(400).json({ error: "No prices supplied for checkout." });
      return;
    }

    const metadata = {};
    if (booking.date) metadata.date = trimMetadataValue(String(booking.date));
    if (booking.time) metadata.time = trimMetadataValue(String(booking.time));
    if (booking.subject) metadata.subject = trimMetadataValue(String(booking.subject));
    if (booking.priceId) metadata.price_id = trimMetadataValue(String(booking.priceId));
    if (booking.currency) metadata.currency = trimMetadataValue(String(booking.currency));
    if (typeof booking.totalAmount === "number") {
      metadata.total_amount = trimMetadataValue(String(booking.totalAmount));
    }
    metadata.session_count = trimMetadataValue(String(sessions.length || 1));
    if (bundles.length) metadata.bundle_count = trimMetadataValue(String(bundles.length));
    if (userId) metadata.user_id = trimMetadataValue(String(userId));

    const bookingPayload = JSON.stringify({
      sessions: sessions.map(session => ({
        date: session.date || "",
        time: session.time || "",
        subject: session.subject || session.subjectId || "",
        subjectId: session.subjectId || "",
        priceId: session.priceId || "",
      })),
      bundles: bundles.map(bundle => ({
        subject: bundle.subject || "",
        subjectLabel: bundle.subjectLabel || "",
        subjectId: bundle.subjectId || "",
        hours: bundle.hours || bundle.quantity || null,
        priceId: bundle.priceId || "",
      })),
      totalAmount: booking.totalAmount || null,
      currency: booking.currency || "AUD",
    });

    if (bookingPayload.length <= 500) {
      metadata.booking_payload = bookingPayload;
    } else {
      const sessionSummary = summariseSessions(sessions);
      const bundleSummary = summariseBundles(bundles);
      metadata.booking_summary = [sessionSummary, bundleSummary].filter(Boolean).join(" | ");
    }

    const sessionParams = {
      mode: "payment",
      line_items: lineItems,
      success_url: booking.successUrl || SUCCESS_URL,
      cancel_url: booking.cancelUrl || CANCEL_URL,
      metadata,
    };

    if (uiMode === "embedded") {
      sessionParams.ui_mode = "embedded";
      sessionParams.return_url = booking.successUrl || SUCCESS_URL;
    }

    if (typeof customerEmail === "string" && customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.status(200).json({
      id: session.id,
      url: session.url || null,
      client_secret: session.client_secret || null,
    });
  } catch (error) {
    console.error("Unable to create Stripe checkout session", error);
    res.status(500).json({ error: "Unable to create checkout session." });
  }
});

export const handleStripeWebhook = onRequest(async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Stripe signature verification failed", error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  if (PRICE_EVENT_TYPES.has(event.type)) {
    try {
      await Promise.all([
        updateSubjectsForStripePrice(event.data.object),
        updateBundlePricingForStripePrice(event.data.object),
      ]);
    } catch (error) {
      console.error("Unable to process Stripe price event", error);
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata || {};
    let bookingSessions = [];
    let bookingBundles = [];

    if (metadata.booking_payload) {
      try {
        const payload = JSON.parse(metadata.booking_payload);
        if (payload && Array.isArray(payload.sessions)) {
          bookingSessions = payload.sessions;
        }
        if (payload && Array.isArray(payload.bundles)) {
          bookingBundles = payload.bundles;
        }
      } catch (error) {
        console.warn("Unable to parse booking payload metadata", error);
      }
    }

    if (!bookingSessions.length && metadata.booking_summary) {
      bookingSessions = metadata.booking_summary.split("|").map(entry => ({
        summary: entry.trim(),
      }));
    }

    if (!bookingBundles.length && metadata.bundle_count) {
      bookingBundles = [{ summary: metadata.booking_summary || "bundle" }];
    }

    const doc = {
      email: session.customer_details?.email || session.customer_email || "unknown",
      paid: true,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency?.toUpperCase() || "AUD",
      createdAt: new Date().toISOString(),
      sessions: bookingSessions,
      bundles: bookingBundles,
      status: "paid",
      checkoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      metadata,
    };

    if (metadata.user_id) {
      doc.userId = metadata.user_id;
    }

    try {
      await db.collection("bookings").add(doc);
    } catch (error) {
      console.error("Unable to persist booking", error);
    }
  }

  res.status(200).send("ok");
});

export const backfillSubjectPrices = onRequest(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await verifyAdminRequest(req);
  } catch (error) {
    const message = error.message === "Forbidden" ? "Forbidden" : "Unauthorized";
    const status = error.message === "Forbidden" ? 403 : 401;
    res.status(status).json({ error: message });
    return;
  }

  try {
    const snapshot = await db.collection("subjects").get();
    if (snapshot.empty) {
      res.status(200).json({ updated: 0, total: 0 });
      return;
    }

    let updated = 0;
    let skipped = 0;

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const priceId = typeof data?.priceId === "string" ? data.priceId : "";
      if (!priceId) {
        skipped += 1;
        continue;
      }
      try {
        const price = await stripe.prices.retrieve(priceId);
        const payload = buildPriceUpdatePayload(price);
        if (!payload) {
          skipped += 1;
          continue;
        }
        await docSnapshot.ref.update(payload);
        updated += 1;
      } catch (error) {
        console.error(`Unable to backfill price for subject ${docSnapshot.id}`, error);
        skipped += 1;
      }
    }

    res.status(200).json({ updated, skipped, total: snapshot.size });
  } catch (error) {
    console.error("Unable to backfill subject prices", error);
    res.status(500).json({ error: "Unable to backfill subject prices." });
  }
});

export const syncBundlePricing = onRequest(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await verifyAdminRequest(req);
  } catch (error) {
    const message = error.message === "Forbidden" ? "Forbidden" : "Unauthorized";
    const status = error.message === "Forbidden" ? 403 : 401;
    res.status(status).json({ error: message });
    return;
  }

  try {
    let startingAfter = null;
    let updated = 0;
    let inspected = 0;

    do {
      const response = await stripe.prices.list({
        limit: 100,
        active: true,
        starting_after: startingAfter || undefined,
        expand: ["data.product"],
      });

      for (const price of response.data) {
        inspected += 1;
        const changed = await updateBundlePricingForStripePrice(price);
        if (changed) {
          updated += 1;
        }
      }

      startingAfter = response.has_more && response.data.length
        ? response.data[response.data.length - 1].id
        : null;
    } while (startingAfter);

    res.status(200).json({ updated, inspected });
  } catch (error) {
    console.error("Unable to sync bundle pricing", error);
    res.status(500).json({ error: "Unable to sync bundle pricing." });
  }
});
