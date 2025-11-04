import Stripe from "stripe";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const SUCCESS_URL = "https://buantutoring.online/success.html";
const CANCEL_URL = "https://buantutoring.online/cancel.html";

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
    const lineItems = [];

    sessions.forEach(session => {
      if (session && typeof session.priceId === "string" && session.priceId) {
        lineItems.push({ price: session.priceId, quantity: 1 });
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
    if (userId) metadata.user_id = trimMetadataValue(String(userId));

    const bookingPayload = JSON.stringify({
      sessions: sessions.map(session => ({
        date: session.date || "",
        time: session.time || "",
        subject: session.subject || session.subjectId || "",
        subjectId: session.subjectId || "",
        priceId: session.priceId || "",
      })),
      totalAmount: booking.totalAmount || null,
      currency: booking.currency || "AUD",
    });

    if (bookingPayload.length <= 500) {
      metadata.booking_payload = bookingPayload;
    } else {
      metadata.booking_summary = summariseSessions(sessions);
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata || {};
    let bookingSessions = [];

    if (metadata.booking_payload) {
      try {
        const payload = JSON.parse(metadata.booking_payload);
        if (payload && Array.isArray(payload.sessions)) {
          bookingSessions = payload.sessions;
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

    const doc = {
      email: session.customer_details?.email || session.customer_email || "unknown",
      paid: true,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency?.toUpperCase() || "AUD",
      createdAt: new Date().toISOString(),
      sessions: bookingSessions,
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
