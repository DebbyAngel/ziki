/**
 * How a deliverable is handed over. `Idea.deliveryFormat` and
 * `Bug.deliveryFormat` hold one of these names, or null when nobody named one.
 *
 * Ziki's proof of work is a GitHub pull request link, and non-engineering work
 * has none. Naming the format at filing time says what the reviewer will
 * actually open instead.
 *
 * Kept free of database imports so pages, the form and the API can share it.
 */
export const DELIVERY_FORMATS = [
  "Google Doc Link",
  "Figma URL",
  "Social Media Draft",
  "Plain Text",
] as const;
export type DeliveryFormat = (typeof DELIVERY_FORMATS)[number];

export const isDeliveryFormat = (value: unknown): value is DeliveryFormat =>
  typeof value === "string" && (DELIVERY_FORMATS as readonly string[]).includes(value);

/** The one line under the field in the report form. */
export const DELIVERY_FORMAT_HELPER =
  "Specify the format for the final deliverable (e.g., Google Doc, Figma link, or plain text).";
