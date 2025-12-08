import Stripe from "stripe";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Twilio from "twilio";
import sgMail from "@sendgrid/mail";

initializeApp();

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const SUCCESS_URL = "https://buantutoring.online/success.html";
const CANCEL_URL = "https://buantutoring.online/cancel.html";

const twilioSid = defineString("twilio.sid");
const twilioToken = defineString("twilio.token");
const twilioFrom = defineString("twilio.from");
const sendGridKey = defineString("sendgrid.key");
const sendGridFrom = defineString("sendgrid.from");

const NOTIFY_SMS_TO = "0412999120";
const NOTIFY_EMAIL_TO = "buangareth@gmail.com";

let twilioClient;
const ensureTwilioClient = () => {
  const sid = twilioSid.value();
  const token = twilioToken.value();

  if (!sid || !token) {
    console.warn("Twilio credentials are not configured; SMS will be skipped.");
    return null;
  }

  if (!twilioClient) {
    twilioClient = new Twilio(sid, token);
  }
  return twilioClient;
};

const ensureSendGrid = () => {
  const key = sendGridKey.value();
  if (!key) {
    console.warn("SendGrid API key is not configured; email will be skipped.");
    return false;
  }
  sgMail.setApiKey(key);
  return true;
};

const sendSmsNotification = async message => {
  const client = ensureTwilioClient();
  if (!client) return;

  const from = twilioFrom.value();
  if (!from) {
    console.warn("Twilio 'from' number is not configured; SMS will be skipped.");
    return;
  }

  try {
    await client.messages.create({
      body: message,
      to: NOTIFY_SMS_TO,
      from,
    });
  } catch (error) {
    console.error("Failed to send SMS notification", error);
  }
};

const sendEmailNotification = async (subject, text) => {
  if (!ensureSendGrid()) return;

  const from = sendGridFrom.value();
  if (!from) {
    console.warn("SendGrid 'from' address is not configured; email will be skipped.");
    return;
  }

  try {
    await sgMail.send({
      to: NOTIFY_EMAIL_TO,
      from,
      subject,
      text,
    });
  } catch (error) {
    console.error("Failed to send email notification", error);
  }
};

const notifyBookingTeam = async (subject, text) => {
  await Promise.all([
    sendSmsNotification(text),
    sendEmailNotification(subject, text),
  ]);
};

const formatResourceNotificationText = (resourceData, changeType) => {
  const title = resourceData.title || resourceData.name || "Untitled resource";
  const uploaderName =
    resourceData.uploaderName || resourceData.uploader || resourceData.uploadedBy || "Unknown uploader";
  const uploaderContact =
    resourceData.uploaderEmail || resourceData.uploaderPhone || resourceData.contact || "";
  const bookingContext = resourceData.bookingId
    ? `Booking ID: ${resourceData.bookingId}. `
    : "";
  const resourceUrl = resourceData.url || resourceData.link || "";
  const notes = resourceData.description || resourceData.notes || "";

  const contactLabel = uploaderContact ? ` (${uploaderContact})` : "";
  const urlSegment = resourceUrl ? ` Download: ${resourceUrl}` : "";
  const detailSegment = notes ? ` Details: ${notes}` : "";

  const actionLabel = changeType === "created" ? "New" : "Updated";
  return `${actionLabel} resource ${title} uploaded by ${uploaderName}${contactLabel}. ${bookingContext}${detailSegment}${urlSegment}`.trim();
};

const resourceFieldsChanged = (beforeData, afterData) => {
  if (!beforeData) return true;
  const keysToCheck = [
    "title",
    "name",
    "uploader",
    "uploaderName",
    "uploadedBy",
    "uploaderEmail",
    "uploaderPhone",
    "contact",
    "bookingId",
    "url",
    "link",
    "description",
    "notes",
  ];

  return keysToCheck.some(key => beforeData[key] !== afterData[key]);
};

const handleResourceNotification = async (resourceData, changeType) => {
  if (!resourceData) return;
  const message = formatResourceNotificationText(resourceData, changeType);
  const subject = `${changeType === "created" ? "New" : "Updated"} resource: ${
    resourceData.title || resourceData.name || "Untitled"
  }`;
  await notifyBookingTeam(subject, message);
};

export const onResourceCreated = onDocumentCreated("resources/{resourceId}", async event => {
  const resourceData = event.data?.data?.();
  await handleResourceNotification(resourceData, "created");
});

export const onResourceUpdated = onDocumentUpdated("resources/{resourceId}", async event => {
  const beforeData = event.data?.before?.data?.();
  const afterData = event.data?.after?.data?.();

  if (!afterData) return;
  if (!resourceFieldsChanged(beforeData, afterData)) return;

  await handleResourceNotification(afterData, "updated");
});

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

const formatBookingNotification = bookingDoc => {
  const customer = bookingDoc.email || "Unknown customer";
  const amount = bookingDoc.amount ? `${bookingDoc.currency} ${bookingDoc.amount}` : "N/A";
  const sessions = (bookingDoc.sessions || [])
    .map(session => {
      if (session.summary) return session.summary;
      const subject = session.subject || session.subjectId || "Session";
      const date = session.date || "";
      const time = session.time || "";
      return `${subject} @ ${date} ${time}`.trim();
    })
    .filter(Boolean)
    .join(" | ");
  const bundles = (bookingDoc.bundles || [])
    .map(bundle => {
      if (bundle.summary) return bundle.summary;
      const subject = bundle.subjectLabel || bundle.subject || "Bundle";
      const hours = bundle.hours || bundle.quantity || "";
      return `${subject} (${hours}h)`;
    })
    .filter(Boolean)
    .join(" | ");

  const segments = [sessions, bundles].filter(Boolean).join(" | ");
  const lineItems = segments ? `Items: ${segments}.` : "";

  return `Booking completed for ${customer}. Total: ${amount}. ${lineItems}`.trim();
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

    try {
      const summary = formatBookingNotification(doc);
      await notifyBookingTeam(`Booking completed (${doc.currency} ${doc.amount})`, summary);
    } catch (error) {
      console.error("Unable to dispatch booking notification", error);
    }
  }

  res.status(200).send("ok");
});

export const logResourceDownload = onCall(async request => {
  const { resourceId, userId, email, notify } = request.data || {};

  if (!resourceId || typeof resourceId !== "string") {
    throw new HttpsError("invalid-argument", "A valid resourceId is required.");
  }

  const record = {
    resourceId,
    userId: userId || null,
    email: email || null,
    createdAt: new Date().toISOString(),
    ip: request.rawRequest?.ip || null,
  };

  await db.collection("resourceDownloads").add(record);

  if (notify) {
    const downloadSummary = `Resource downloaded: ${resourceId}${userId ? ` by ${userId}` : ""}${
      email ? ` (${email})` : ""
    }.`;
    await notifyBookingTeam(`Resource downloaded: ${resourceId}`, downloadSummary);
  }

  return { success: true };
});
