import Stripe from "stripe";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();

let stripeClient;

const ALLOWED_ORIGINS = new Set([
  "https://buantutoring.online",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe secret key is not configured");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2024-06-20",
    });
  }

  return stripeClient;
};

const sanitizeBooking = raw => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const safe = {};

  const stringFields = [
    "userId",
    "email",
    "subject",
    "date",
    "time",
    "notes",
  ];
  stringFields.forEach(field => {
    if (raw[field] !== undefined && raw[field] !== null) {
      safe[field] = String(raw[field]);
    }
  });

  const numericFields = ["price", "duration", "totalSessions"];
  numericFields.forEach(field => {
    const value = Number(raw[field]);
    if (!Number.isNaN(value) && Number.isFinite(value)) {
      safe[field] = value;
    }
  });

  if (Array.isArray(raw.sessions)) {
    try {
      safe.sessions = JSON.stringify(raw.sessions);
    } catch (error) {
      logger.warn("Unable to serialise booking sessions", error);
    }
  } else if (typeof raw.sessions === "string") {
    safe.sessions = raw.sessions;
  }

  if (!safe.subject) {
    safe.subject = "Tutoring session";
  }

  if (!safe.date) {
    safe.date = "";
  }

  if (!safe.time) {
    safe.time = "";
  }

  if (!safe.price || safe.price < 0) {
    safe.price = 0;
  }

  if (!safe.duration || safe.duration < 0) {
    safe.duration = 1;
  }

  return safe;
};

const buildMetadata = booking => {
  const metadata = {};
  Object.entries(booking).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string") {
      metadata[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      metadata[key] = String(value);
    } else {
      try {
        metadata[key] = JSON.stringify(value);
      } catch (error) {
        logger.warn("Unable to serialise metadata value", key, error);
      }
    }
  });
  return metadata;
};

const applyCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".web.app") || origin.endsWith(".firebaseapp.com"))) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Vary", "Origin");
};

export const createCheckoutSession = onRequest(async (req, res) => {
  applyCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const booking = sanitizeBooking(req.body?.booking);
  if (!booking) {
    res.status(400).json({ error: "Missing booking payload" });
    return;
  }

  try {
    const stripe = getStripeClient();
    const metadata = buildMetadata(booking);
    const totalPrice = Math.max(0, Number(booking.price) || 0);
    const unitAmount = Math.round(totalPrice * 100);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: booking.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `${metadata.subject || "Tutoring session"}`.slice(0, 250),
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: "https://buantutoring.online/success.html",
      cancel_url: "https://buantutoring.online/cancel.html",
      metadata,
    });

    res.json({ id: session.id });
  } catch (error) {
    logger.error("Unable to create checkout session", error);
    res.status(500).json({ error: "Unable to create Stripe checkout session" });
  }
});

export const handleStripeWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    logger.error("Stripe webhook secrets are not configured");
    res.status(500).json({ error: "Stripe webhook not configured" });
    return;
  }

  const signature = req.headers["stripe-signature"]; // eslint-disable-line dot-notation
  if (!signature) {
    res.status(400).json({ error: "Missing Stripe signature" });
    return;
  }

  let event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    logger.error("Stripe signature verification failed", error);
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingMetadata = session.metadata || {};
    const customerEmail = session.customer_details?.email || session.customer_email || "unknown";

    const record = {
      userId: bookingMetadata.userId || null,
      subject: bookingMetadata.subject || "Tutoring session",
      date: bookingMetadata.date || null,
      time: bookingMetadata.time || null,
      duration: Number(bookingMetadata.duration) || 1,
      price: Number(bookingMetadata.price) || 0,
      totalSessions: Number(bookingMetadata.totalSessions) || 1,
      sessions: bookingMetadata.sessions || null,
      email: customerEmail,
      paid: true,
      completed: false,
      checkoutSessionId: session.id,
      createdAt: new Date(),
    };

    try {
      await db.collection("bookings").add(record);
    } catch (error) {
      logger.error("Unable to persist booking", error);
      res.status(500).json({ error: "Unable to store booking" });
      return;
    }
  }

  res.status(200).send("ok");
});
