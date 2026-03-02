import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://c621668402beeb8663f11b326b057b05@o4510959754346496.ingest.us.sentry.io/4510959763193856",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});
